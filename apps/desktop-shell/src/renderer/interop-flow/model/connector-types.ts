export type PortKind = 'context-in' | 'context-out' | 'intent-in' | 'intent-out';

export function contextOutPort(type: string): string {
  return `context-out:${type}`;
}

export function contextInPort(type: string): string {
  return `context-in:${type}`;
}

export function intentOutPort(intent: string): string {
  return `intent-out:${intent}`;
}

export function intentInPort(intent: string): string {
  return `intent-in:${intent}`;
}

export function parsePort(portId: string): { kind: PortKind; value: string } | null {
  const [kind, ...rest] = portId.split(':');
  const value = rest.join(':');
  if (!value) return null;
  if (kind === 'context-in' || kind === 'context-out' || kind === 'intent-in' || kind === 'intent-out') {
    return { kind, value };
  }
  return null;
}
