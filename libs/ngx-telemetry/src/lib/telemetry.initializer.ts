import { inject } from '@angular/core';
import { WebTracerProvider } from '@opentelemetry/sdk-trace-web';
import { BatchSpanProcessor, ConsoleSpanExporter } from '@opentelemetry/sdk-trace-web';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { W3CTraceContextPropagator } from '@opentelemetry/core';
import { propagation, trace } from '@opentelemetry/api';
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from '@opentelemetry/semantic-conventions';
import { TraceIdRatioBasedSampler } from '@opentelemetry/sdk-trace-web';
import { NGX_TELEMETRY_CONFIG, type NgxTelemetryConfig } from './telemetry.config';

let _provider: WebTracerProvider | null = null;

export function initTelemetry(config: NgxTelemetryConfig): void {
  if (_provider) return; // guard against double-init (HMR, etc.)

  const collectorUrl = config.collectorUrl ?? 'http://localhost:4318';

  const resource = new Resource({
    [ATTR_SERVICE_NAME]: config.serviceName,
    [ATTR_SERVICE_VERSION]: config.serviceVersion ?? '0.0.0',
    'deployment.environment': config.environment ?? 'development',
  });

  const exporter = new OTLPTraceExporter({ url: `${collectorUrl}/v1/traces` });

  _provider = new WebTracerProvider({
    resource,
    sampler: new TraceIdRatioBasedSampler(config.sampleRate ?? 1),
    spanProcessors: [
      new BatchSpanProcessor(exporter),
      ...(config.environment === 'development'
        ? [new BatchSpanProcessor(new ConsoleSpanExporter())]
        : []),
    ],
  });

  if (config.propagateHeaders !== false) {
    propagation.setGlobalPropagator(new W3CTraceContextPropagator());
  }

  _provider.register({
    contextManager: undefined, // uses ZoneContextManager if zone.js present
  });

  trace.setGlobalTracerProvider(_provider);
}

export function telemetryInitializer() {
  const config = inject(NGX_TELEMETRY_CONFIG);
  return () => initTelemetry(config);
}
