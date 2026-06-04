import type { Fdc3DesktopAgent } from '../fdc3-types';
import { toListenerHandle } from '../listener-handle';

/**
 * Fail-loud agent — every method rejects with the configured error. Use when
 * a deployment must never run in a degraded interop state (e.g. compliance
 * environments where silent failure would mask a misconfiguration).
 *
 * Listener methods still return a usable handle so consumers wiring listeners
 * at construction time don't crash before the rejection surfaces.
 */
export function makeFailAgent(reason = 'No FDC3 agent available'): Fdc3DesktopAgent {
  const reject = async (): Promise<never> => {
    throw new Error(`[interop-angular] ${reason}`);
  };
  const idleHandle = (): ReturnType<typeof toListenerHandle> => toListenerHandle(() => undefined);
  const listenerMethods = new Set(['addContextListener', 'addIntentListener', 'addEventListener']);
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop) {
      if (typeof prop === 'string' && listenerMethods.has(prop)) {
        return () => idleHandle();
      }
      if (prop === 'onThemeChanged') {
        return () => () => undefined;
      }
      return reject;
    },
  };
  return new Proxy({}, handler) as unknown as Fdc3DesktopAgent;
}
