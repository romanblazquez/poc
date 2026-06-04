import type { Fdc3DesktopAgent } from '../fdc3-types';
import type { InteropConfig } from '../tokens';
import { getAgentOrNull } from './get-agent-shim';
import { makeBrowserFallbackAgent } from './browser-fallback-agent';
import { makeNoopAgent } from './noop-agent';
import { makeFailAgent } from './fail-agent';

export type InteropMode = 'shell' | 'web-agent' | 'browser-fallback' | 'noop' | 'fail';

export interface DiscoveryResult {
  agent: Fdc3DesktopAgent;
  mode: InteropMode;
}

/**
 * Three-tier agent discovery.
 *
 *   1. `window.fdc3` (synchronous shell global) — the FDC3 Desktop POC shell.
 *   2. FDC3 2.1 `getAgent()` (web-host discovery) — io.Connect / Glue42 / Cosaic.
 *   3. Fallback per `config.offline` — `broadcast-channel` by default.
 *
 * Order matters: the synchronous shell global wins so an app embedded inside
 * the FDC3 Desktop shell never waits 750 ms for the web-agent timeout.
 */
export async function discoverAgent(config: Required<InteropConfig>): Promise<DiscoveryResult> {
  // 1. Shell global
  if (typeof window !== 'undefined' && (window as { fdc3?: Fdc3DesktopAgent }).fdc3) {
    return { agent: (window as unknown as { fdc3: Fdc3DesktopAgent }).fdc3, mode: 'shell' };
  }

  // 2. FDC3 2.1 getAgent()
  const webAgent = await getAgentOrNull({
    identityUrl: config.identityUrl,
    timeoutMs: config.getAgentTimeoutMs,
  });
  if (webAgent) {
    return { agent: webAgent, mode: 'web-agent' };
  }

  // 3. Offline fallback
  switch (config.offline) {
    case 'noop':
      return { agent: makeNoopAgent(config.appId), mode: 'noop' };
    case 'fail':
      return { agent: makeFailAgent(`No FDC3 agent for ${config.appId}`), mode: 'fail' };
    case 'broadcast-channel':
    default:
      return { agent: makeBrowserFallbackAgent(config.appId), mode: 'browser-fallback' };
  }
}
