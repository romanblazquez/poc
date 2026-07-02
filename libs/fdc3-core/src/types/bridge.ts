/**
 * FINOS bridge contract: discovery/health of a local bridge service, plus a
 * live WebSocket relay connection for context broadcasts.
 *
 * The relay speaks a DAB-shaped message envelope (handshake /
 * broadcastRequest / connectedAgentsUpdate). The official FDC3 Desktop Agent
 * Bridging protocol is still experimental in FDC3 2.x, so `fdc3.getInfo()`
 * continues to report DesktopAgentBridging: false.
 */

export type BridgeProvider = 'finos-backplane';

export type BridgeStatusState = 'disabled' | 'scanning' | 'available' | 'unavailable' | 'error';

export interface BridgeProfile {
  id: string;
  name: string;
  host: string;
  portStart: number;
  portEnd: number;
  endpointUrl: string;
}

export interface BridgeSettings {
  enabled: boolean;
  provider: BridgeProvider;
  host: string;
  portStart: number;
  portEnd: number;
  endpointUrl: string;
  profiles?: BridgeProfile[];
  activeProfileId?: string | null;
}

export interface BridgeCandidate {
  host: string;
  port: number;
  endpointUrl: string;
  latencyMs: number;
}

export type BridgeConnectionState = 'disconnected' | 'connecting' | 'connected';

/** Live relay connection over the detected bridge endpoint. */
export interface BridgeConnectionInfo {
  state: BridgeConnectionState;
  /** ws:// endpoint the transport is attached to */
  endpoint: string | null;
  /** This shell's agent name announced in the handshake */
  agentName: string;
  /** Other desktop agents currently connected to the bridge */
  remoteAgents: string[];
  /** Contexts relayed out to the bridge since connect */
  messagesOut: number;
  /** Contexts received from the bridge since connect */
  messagesIn: number;
}

export interface BridgeStatus {
  state: BridgeStatusState;
  provider: BridgeProvider;
  settings: BridgeSettings;
  candidates: BridgeCandidate[];
  selected: BridgeCandidate | null;
  connection: BridgeConnectionInfo | null;
  lastCheckedAt: number | null;
  lastError: string | null;
  notes: string[];
}

