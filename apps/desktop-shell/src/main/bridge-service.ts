import net from 'net';
import type { BridgeCandidate, BridgeProfile, BridgeSettings, BridgeStatus, FDC3BootstrapConfig } from '@fdc3-poc/fdc3-core';
import { BridgeSettingsStore, WELL_KNOWN_BRIDGE_PORTS } from './bridge-settings.js';

type BridgeStatusListener = (status: BridgeStatus) => void;

const PROBE_TIMEOUT_MS = 250;
const MAX_RANGE_SIZE = 32;
const POLL_INTERVAL_MS = 15_000;

export class BridgeService {
  private readonly store: BridgeSettingsStore;
  private readonly listeners = new Set<BridgeStatusListener>();
  private status: BridgeStatus;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private scanning = false;

  constructor(configRoot: string, bootstrap?: FDC3BootstrapConfig) {
    this.store = new BridgeSettingsStore(configRoot, bootstrap);
    this.status = this.makeStatus('disabled', {
      lastCheckedAt: null,
      notes: this.defaultNotes(),
    });
  }

  init(): void {
    if (this.store.get().enabled) {
      void this.scan();
      this.startPolling();
    }
  }

  getSettings(): BridgeSettings {
    return this.store.get();
  }

  getStatus(): BridgeStatus {
    return cloneStatus(this.status);
  }

  subscribe(listener: BridgeStatusListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getProfiles(): BridgeProfile[] {
    return this.store.getProfiles();
  }

  addProfile(data: Omit<BridgeProfile, 'id'>): BridgeProfile {
    const profile = this.store.addProfile(data);
    this.emit();
    return profile;
  }

  updateProfile(id: string, patch: Partial<Omit<BridgeProfile, 'id'>>): BridgeProfile | null {
    const profile = this.store.updateProfile(id, patch);
    this.emit();
    return profile;
  }

  deleteProfile(id: string): boolean {
    const result = this.store.deleteProfile(id);
    this.emit();
    return result;
  }

  activateProfile(id: string): BridgeSettings | null {
    const settings = this.store.activateProfile(id);
    if (!settings) return null;
    this.status = this.makeStatus(settings.enabled ? 'unavailable' : 'disabled', {
      lastCheckedAt: this.status.lastCheckedAt,
      lastError: null,
      notes: this.defaultNotes(),
    });
    this.emit();
    if (settings.enabled) {
      void this.scan();
      this.startPolling();
    } else {
      this.stopPolling();
    }
    return settings;
  }

  updateSettings(patch: Partial<BridgeSettings>): BridgeStatus {
    const settings = this.store.update(patch);
    this.status = this.makeStatus(settings.enabled ? 'unavailable' : 'disabled', {
      lastCheckedAt: this.status.lastCheckedAt,
      lastError: null,
      notes: this.defaultNotes(),
    });
    this.emit();
    if (settings.enabled) {
      this.startPolling();
    } else {
      this.stopPolling();
    }
    return this.getStatus();
  }

  destroy(): void {
    this.stopPolling();
    this.listeners.clear();
  }

  async scan(): Promise<BridgeStatus> {
    if (this.scanning) return this.getStatus();
    this.scanning = true;
    try {
      return await this.runScan();
    } finally {
      this.scanning = false;
    }
  }

  private async runScan(): Promise<BridgeStatus> {
    const settings = this.store.get();
    if (!settings.enabled) {
      this.status = this.makeStatus('disabled', {
        lastCheckedAt: Date.now(),
        notes: this.defaultNotes(),
      });
      this.emit();
      return this.getStatus();
    }

    const targets = this.buildTargets(settings);
    if (targets.length === 0) {
      this.status = this.makeStatus('error', {
        lastCheckedAt: Date.now(),
        lastError: 'No valid bridge target configured',
        notes: this.defaultNotes(),
      });
      this.emit();
      return this.getStatus();
    }

    this.status = this.makeStatus('scanning', {
      lastCheckedAt: Date.now(),
      notes: this.defaultNotes(),
    });
    this.emit();

    try {
      const probed = await Promise.all(targets.map((target) => probeTcp(target.host, target.port)));
      const candidates = probed.filter((candidate): candidate is BridgeCandidate => candidate !== null);
      this.status = this.makeStatus(candidates.length > 0 ? 'available' : 'unavailable', {
        candidates,
        selected: candidates[0] ?? null,
        lastCheckedAt: Date.now(),
        lastError: candidates.length > 0 ? null : 'No local FINOS Backplane endpoint detected',
        notes: this.defaultNotes(),
      });
    } catch (error) {
      this.status = this.makeStatus('error', {
        lastCheckedAt: Date.now(),
        lastError: (error as Error).message,
        notes: this.defaultNotes(),
      });
    }

    this.emit();
    return this.getStatus();
  }

  private startPolling(): void {
    if (this.pollTimer !== null) return;
    this.pollTimer = setInterval(() => { void this.scan(); }, POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer === null) return;
    clearInterval(this.pollTimer);
    this.pollTimer = null;
  }

  private buildTargets(settings: BridgeSettings): Array<{ host: string; port: number }> {
    const explicit = parseEndpoint(settings.endpointUrl);
    if (explicit) return [explicit];

    // When the range is a single port (default), probe well-known FDC3 bridge ports.
    if (settings.portStart === settings.portEnd) {
      return WELL_KNOWN_BRIDGE_PORTS.map((port) => ({ host: settings.host, port }));
    }

    const count = Math.min(MAX_RANGE_SIZE, settings.portEnd - settings.portStart + 1);
    return Array.from({ length: count }, (_value, idx) => ({
      host: settings.host,
      port: settings.portStart + idx,
    }));
  }

  private makeStatus(
    state: BridgeStatus['state'],
    opts: Partial<Omit<BridgeStatus, 'state' | 'provider' | 'settings'>> = {},
  ): BridgeStatus {
    const settings = this.store.get();
    return {
      state,
      provider: settings.provider,
      settings,
      candidates: opts.candidates ?? [],
      selected: opts.selected ?? null,
      lastCheckedAt: opts.lastCheckedAt ?? this.status?.lastCheckedAt ?? null,
      lastError: opts.lastError ?? null,
      notes: opts.notes ?? this.defaultNotes(),
    };
  }

  private defaultNotes(): string[] {
    return [
      'FINOS Backplane readiness only: scans for a local bridge service on loopback.',
      'FDC3 Desktop Agent Bridging remains disabled because the official DAB protocol is experimental.',
      'DesktopAgentBridging stays false in fdc3.getInfo() until a standards-safe DAB implementation is added.',
    ];
  }

  private emit(): void {
    const snapshot = this.getStatus();
    for (const listener of this.listeners) {
      try { listener(snapshot); } catch (error) { console.warn('[bridge] listener threw', error); }
    }
  }
}

function parseEndpoint(endpointUrl: string): { host: string; port: number } | null {
  if (!endpointUrl.trim()) return null;
  try {
    const parsed = new URL(endpointUrl);
    const port = Number(parsed.port || (parsed.protocol === 'https:' || parsed.protocol === 'wss:' ? 443 : 80));
    if (!Number.isFinite(port) || port < 1 || port > 65535) return null;
    return { host: parsed.hostname || '127.0.0.1', port: Math.round(port) };
  } catch {
    const [host, portText] = endpointUrl.split(':');
    const port = Number(portText);
    if (!host || !Number.isFinite(port)) return null;
    return { host, port: Math.round(port) };
  }
}

function probeTcp(host: string, port: number): Promise<BridgeCandidate | null> {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (candidate: BridgeCandidate | null) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(candidate);
    };

    socket.setTimeout(PROBE_TIMEOUT_MS);
    socket.once('connect', () => {
      finish({
        host,
        port,
        endpointUrl: `ws://${host}:${port}`,
        latencyMs: Date.now() - started,
      });
    });
    socket.once('timeout', () => finish(null));
    socket.once('error', () => finish(null));
    socket.connect(port, host);
  });
}

function cloneStatus(status: BridgeStatus): BridgeStatus {
  return {
    ...status,
    settings: { ...status.settings },
    candidates: status.candidates.map((candidate) => ({ ...candidate })),
    selected: status.selected ? { ...status.selected } : null,
    notes: [...status.notes],
  };
}
