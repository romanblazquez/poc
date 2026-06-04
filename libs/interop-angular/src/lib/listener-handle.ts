import type { ListenerHandle, Listener, Unsubscribe } from './fdc3-types';

/**
 * Build a FDC3 2.0 `ListenerHandle` from a plain unsubscribe function.
 *
 * The handle satisfies all three call patterns the spec / our contract allows:
 *  - Bare callable:   `const u = addContextListener(...); u();`
 *  - `Listener`:      `const l = addContextListener(...); l.unsubscribe();`
 *  - PromiseLike:     `const l = await addContextListener(...); l.unsubscribe();`
 *
 * The returned object is a function (callable) with `.unsubscribe`, `.then`,
 * `.catch`, `.finally` attached.
 */
export function toListenerHandle(unsubscribe: Unsubscribe): ListenerHandle {
  const listenerLike: Listener = { unsubscribe };
  const fn: Unsubscribe = () => unsubscribe();
  Object.assign(fn, {
    unsubscribe,
    then<TFulfilled = Listener, TRejected = never>(
      onfulfilled?: ((value: Listener) => TFulfilled | PromiseLike<TFulfilled>) | null,
      onrejected?: ((reason: unknown) => TRejected | PromiseLike<TRejected>) | null,
    ): PromiseLike<TFulfilled | TRejected> {
      return Promise.resolve(listenerLike).then(onfulfilled ?? undefined, onrejected ?? undefined);
    },
  });
  return fn as unknown as ListenerHandle;
}
