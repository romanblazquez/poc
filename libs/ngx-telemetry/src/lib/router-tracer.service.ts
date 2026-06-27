import { Injectable, inject, OnDestroy } from '@angular/core';
import { Router, NavigationStart, NavigationEnd, NavigationError, NavigationCancel } from '@angular/router';
import { trace, SpanStatusCode, SpanKind, type Span } from '@opentelemetry/api';
import { Subscription } from 'rxjs';
import { NGX_TELEMETRY_CONFIG } from './telemetry.config';

/** Auto-instruments Angular Router navigation events as OTEL spans. */
@Injectable({ providedIn: 'root' })
export class RouterTracerService implements OnDestroy {
  private readonly _router = inject(Router);
  private readonly _config = inject(NGX_TELEMETRY_CONFIG);
  private _sub?: Subscription;
  private _activeSpans = new Map<number, Span>();

  private get _tracer() {
    return trace.getTracer(this._config.serviceName);
  }

  start(): void {
    this._sub = this._router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        const span = this._tracer.startSpan(`navigation ${event.url}`, {
          kind: SpanKind.CLIENT,
          attributes: {
            'navigation.url': event.url,
            'navigation.trigger': event.navigationTrigger ?? 'imperative',
            'navigation.id': event.id,
          },
        });
        this._activeSpans.set(event.id, span);
      }

      if (event instanceof NavigationEnd) {
        const span = this._activeSpans.get(event.id);
        if (span) {
          span.setAttribute('navigation.url.final', event.urlAfterRedirects);
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          this._activeSpans.delete(event.id);
        }
      }

      if (event instanceof NavigationError) {
        const span = this._activeSpans.get(event.id);
        if (span) {
          span.recordException(event.error instanceof Error ? event.error : new Error(String(event.error)));
          span.setStatus({ code: SpanStatusCode.ERROR, message: String(event.error) });
          span.end();
          this._activeSpans.delete(event.id);
        }
      }

      if (event instanceof NavigationCancel) {
        const span = this._activeSpans.get(event.id);
        if (span) {
          span.setAttribute('navigation.cancel.reason', event.reason);
          span.setStatus({ code: SpanStatusCode.OK });
          span.end();
          this._activeSpans.delete(event.id);
        }
      }
    });
  }

  ngOnDestroy(): void {
    this._sub?.unsubscribe();
    this._activeSpans.forEach((s) => s.end());
    this._activeSpans.clear();
  }
}
