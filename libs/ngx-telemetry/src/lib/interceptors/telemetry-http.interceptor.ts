import { HttpInterceptorFn, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { trace, context, propagation, SpanKind, SpanStatusCode, type Attributes } from '@opentelemetry/api';
import { tap, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import { NGX_TELEMETRY_CONFIG } from '../telemetry.config';

export const telemetryHttpInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn,
) => {
  const config = inject(NGX_TELEMETRY_CONFIG);
  const tracer = trace.getTracer(config.serviceName);

  const url = new URL(req.url, window.location.origin);
  const spanName = `HTTP ${req.method} ${url.pathname}`;

  const attributes: Attributes = {
    'http.method': req.method,
    'http.url': req.url,
    'http.host': url.hostname,
    'http.target': url.pathname + url.search,
  };

  const span = tracer.startSpan(spanName, { kind: SpanKind.CLIENT, attributes });
  const ctx = trace.setSpan(context.active(), span);

  // Inject W3C traceparent header for distributed tracing
  let tracedReq = req;
  if (config.propagateHeaders !== false) {
    const headers: Record<string, string> = {};
    propagation.inject(ctx, headers);
    tracedReq = req.clone({ setHeaders: headers });
  }

  return context.with(ctx, () =>
    next(tracedReq).pipe(
      tap((event) => {
        if ((event as { status?: number }).status !== undefined) {
          const status = (event as { status: number }).status;
          span.setAttribute('http.status_code', status);
          span.setStatus({ code: status >= 400 ? SpanStatusCode.ERROR : SpanStatusCode.OK });
          span.end();
        }
      }),
      catchError((err: { status?: number; message?: string }) => {
        span.setAttribute('http.status_code', err.status ?? 0);
        span.recordException(new Error(err.message ?? 'HTTP error'));
        span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
        span.end();
        return throwError(() => err);
      }),
    ),
  );
};
