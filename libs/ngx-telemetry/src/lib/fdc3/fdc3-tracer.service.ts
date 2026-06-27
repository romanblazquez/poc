import { Injectable, inject, OnDestroy } from '@angular/core';
import { trace, SpanStatusCode, SpanKind, type Span } from '@opentelemetry/api';
import { NGX_TELEMETRY_CONFIG } from '../telemetry.config';

/** Minimal FDC3 surface needed for instrumentation — avoids a hard dep on @fdc3-poc/fdc3-core. */
interface MinimalFdc3 {
  raiseIntent(intent: string, context: { type: string; [k: string]: unknown }, ...rest: unknown[]): Promise<unknown>;
  broadcast(context: { type: string; [k: string]: unknown }): Promise<void>;
  addContextListener(contextTypeOrHandler: string | ((ctx: unknown, metadata?: unknown) => void), handler?: (ctx: unknown, metadata?: unknown) => void): Promise<unknown>;
}

declare global {
  interface Window {
    fdc3?: MinimalFdc3;
  }
}

/**
 * Wraps window.fdc3 intent/context/channel calls in OTEL spans.
 *
 * Works in both browser micro-frontend and Electron shell contexts because
 * it only touches the window.fdc3 API surface — never imports Electron.
 *
 * Usage (standalone app):
 *   constructor(private fdc3Tracer: Fdc3TracerService) {
 *     fdc3Tracer.attach(); // call once, typically in ngOnInit
 *   }
 *
 * After attach(), all fdc3.raiseIntent() and fdc3.broadcast() calls are
 * automatically wrapped in spans and forwarded to Tempo.
 */
@Injectable({ providedIn: 'root' })
export class Fdc3TracerService implements OnDestroy {
  private readonly _config = inject(NGX_TELEMETRY_CONFIG);
  private _attached = false;
  private _originalRaiseIntent?: MinimalFdc3['raiseIntent'];
  private _originalBroadcast?: MinimalFdc3['broadcast'];
  private _originalAddContextListener?: MinimalFdc3['addContextListener'];

  private get _tracer() {
    return trace.getTracer(this._config.serviceName);
  }

  /** Monkey-patches window.fdc3 to add OTEL spans. Safe to call multiple times. */
  attach(): void {
    if (this._attached || typeof window === 'undefined' || !window.fdc3) return;
    this._attached = true;

    this._patchRaiseIntent();
    this._patchBroadcast();
    this._patchAddContextListener();
  }

  /** Restores original window.fdc3 methods. */
  detach(): void {
    if (!this._attached || typeof window === 'undefined' || !window.fdc3) return;
    if (this._originalRaiseIntent) window.fdc3.raiseIntent = this._originalRaiseIntent;
    if (this._originalBroadcast) window.fdc3.broadcast = this._originalBroadcast;
    if (this._originalAddContextListener) window.fdc3.addContextListener = this._originalAddContextListener;
    this._attached = false;
  }

  /** Manually records a single FDC3 intent raise as a span (use when auto-patching is off). */
  recordIntentRaise(intent: string, ctx?: { type?: string }): Span {
    const span = this._tracer.startSpan(`fdc3.raiseIntent/${intent}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'fdc3.intent': intent,
        'fdc3.context.type': ctx?.type ?? 'unknown',
      },
    });
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    return span;
  }

  /** Manually records a context broadcast as a span. */
  recordBroadcast(contextType: string, channelId?: string): Span {
    const span = this._tracer.startSpan(`fdc3.broadcast/${contextType}`, {
      kind: SpanKind.CLIENT,
      attributes: {
        'fdc3.context.type': contextType,
        'fdc3.channel.id': channelId ?? 'system',
      },
    });
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
    return span;
  }

  ngOnDestroy(): void {
    this.detach();
  }

  private _patchRaiseIntent(): void {
    const fdc3 = window.fdc3!;
    const original = fdc3.raiseIntent.bind(fdc3);
    this._originalRaiseIntent = original;
    const tracer = this._tracer;

    fdc3.raiseIntent = async (intent, ctx, ...rest) => {
      const span = tracer.startSpan(`fdc3.raiseIntent/${intent}`, {
        kind: SpanKind.CLIENT,
        attributes: {
          'fdc3.intent': intent,
          'fdc3.context.type': ctx?.type ?? 'unknown',
        },
      });
      try {
        const result = await original(intent, ctx, ...rest);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return result;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        span.end();
        throw err;
      }
    };
  }

  private _patchBroadcast(): void {
    const fdc3 = window.fdc3!;
    const original = fdc3.broadcast.bind(fdc3);
    this._originalBroadcast = original;
    const tracer = this._tracer;

    fdc3.broadcast = async (ctx) => {
      const span = tracer.startSpan(`fdc3.broadcast/${ctx?.type ?? 'unknown'}`, {
        kind: SpanKind.CLIENT,
        attributes: { 'fdc3.context.type': ctx?.type ?? 'unknown' },
      });
      try {
        await original(ctx);
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        span.end();
        throw err;
      }
    };
  }

  private _patchAddContextListener(): void {
    const fdc3 = window.fdc3!;
    const original = fdc3.addContextListener.bind(fdc3);
    this._originalAddContextListener = original;
    const tracer = this._tracer;

    fdc3.addContextListener = (
      contextTypeOrHandler: string | ((ctx: unknown, metadata?: unknown) => void),
      handler?: (ctx: unknown, metadata?: unknown) => void,
    ) => {
      const contextType = typeof contextTypeOrHandler === 'string' ? contextTypeOrHandler : 'unknown';
      const originalHandler = typeof contextTypeOrHandler === 'function' ? contextTypeOrHandler : handler!;

      const wrappedHandler = (ctx: unknown, metadata?: unknown) => {
        const span = tracer.startSpan(`fdc3.contextReceived/${contextType}`, {
          kind: SpanKind.CONSUMER,
          attributes: {
            'fdc3.context.type': contextType,
            'fdc3.context.source': (metadata as { source?: { appId?: string } } | undefined)?.source?.appId ?? 'unknown',
          },
        });
        try {
          originalHandler(ctx, metadata);
          span.setStatus({ code: SpanStatusCode.OK });
        } catch (err) {
          span.recordException(err as Error);
          span.setStatus({ code: SpanStatusCode.ERROR });
        } finally {
          span.end();
        }
      };

      if (typeof contextTypeOrHandler === 'function') {
        return original(wrappedHandler);
      }
      return original(contextTypeOrHandler, wrappedHandler);
    };
  }
}
