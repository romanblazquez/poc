import { InjectionToken } from '@angular/core';

export interface NgxTelemetryConfig {
  /** Service name shown in Grafana / Tempo (e.g. 'market-watch') */
  serviceName: string;
  serviceVersion?: string;
  /** Deployment environment tag (dev / uat / prod) */
  environment?: string;
  /**
   * OTLP HTTP collector endpoint (no trailing slash).
   * Points to the OTEL Collector OTLP-HTTP port (default 4318).
   * @default 'http://localhost:4318'
   */
  collectorUrl?: string;
  /**
   * Sampling ratio 0–1. 1 = record all traces (fine for dev/POC).
   * @default 1
   */
  sampleRate?: number;
  /** Auto-instrument Angular Router navigation spans. @default true */
  traceRoutes?: boolean;
  /** Auto-instrument HttpClient calls via interceptor. @default true */
  traceHttp?: boolean;
  /** Propagate W3C traceparent headers on outgoing HTTP calls. @default true */
  propagateHeaders?: boolean;
}

export const NGX_TELEMETRY_CONFIG = new InjectionToken<NgxTelemetryConfig>('NGX_TELEMETRY_CONFIG');
