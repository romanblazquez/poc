/**
 * FINOS bridge readiness contract.
 *
 * This intentionally models discovery/health of an official FINOS-style local
 * bridge service. It does not claim implementation of the FDC3 Desktop Agent
 * Bridging protocol, which is still experimental in FDC3 2.x.
 */

export type BridgeProvider = 'finos-backplane';

export type BridgeStatusState = 'disabled' | 'scanning' | 'available' | 'unavailable' | 'error';

export interface BridgeSettings {
  enabled: boolean;
  provider: BridgeProvider;
  host: string;
  portStart: number;
  portEnd: number;
  endpointUrl: string;
}

export interface BridgeCandidate {
  host: string;
  port: number;
  endpointUrl: string;
  latencyMs: number;
}

export interface BridgeStatus {
  state: BridgeStatusState;
  provider: BridgeProvider;
  settings: BridgeSettings;
  candidates: BridgeCandidate[];
  selected: BridgeCandidate | null;
  lastCheckedAt: number | null;
  lastError: string | null;
  notes: string[];
}
