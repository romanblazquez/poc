import { Injectable, inject } from '@angular/core';
import { trace, context, SpanStatusCode, SpanKind, type Span, type Attributes } from '@opentelemetry/api';
import { NGX_TELEMETRY_CONFIG } from './telemetry.config';

@Injectable({ providedIn: 'root' })
export class TelemetryService {
  private readonly _config = inject(NGX_TELEMETRY_CONFIG);

  private get _tracer() {
    return trace.getTracer(this._config.serviceName);
  }

  /**
   * Records a point-in-time event as an instant span.
   * Equivalent to GTM's `dataLayer.push({ event: 'name' })`.
   */
  recordEvent(name: string, attributes?: Attributes): void {
    const span = this._tracer.startSpan(name, {
      kind: SpanKind.CLIENT,
      attributes,
    });
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();
  }

  /**
   * Starts a span and returns it. Caller is responsible for calling span.end().
   * Use for wrapping async operations.
   */
  startSpan(name: string, attributes?: Attributes): Span {
    return this._tracer.startSpan(name, {
      kind: SpanKind.CLIENT,
      attributes,
    });
  }

  /**
   * Wraps a synchronous or async operation in a span.
   * Automatically sets OK/ERROR status and calls span.end().
   */
  trace<T>(name: string, fn: (span: Span) => T, attributes?: Attributes): T {
    const span = this._tracer.startSpan(name, { attributes });
    return context.with(trace.setSpan(context.active(), span), () => {
      try {
        const result = fn(span);
        if (result instanceof Promise) {
          return result
            .then((v) => {
              span.setStatus({ code: SpanStatusCode.OK });
              span.end();
              return v;
            })
            .catch((err: Error) => {
              span.recordException(err);
              span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
              span.end();
              throw err;
            }) as T;
        }
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
        return result;
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        span.end();
        throw err;
      }
    });
  }

  /** Records an unhandled error as a span event. */
  recordError(err: Error, attributes?: Attributes): void {
    const span = this._tracer.startSpan('error', { attributes });
    span.recordException(err);
    span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
    span.end();
  }
}
