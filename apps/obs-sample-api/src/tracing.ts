/**
 * OTEL SDK bootstrap — must be imported before any application code.
 * Run via:  tsx src/app.ts  (tsx handles the import order)
 *
 * Resource attributes are set via env vars so we never construct a Resource
 * object directly — avoids version-mismatch errors when sdk-node's internal
 * ResourceImpl.merge() receives an object from a different package instance.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

// Set standard OTEL resource env vars before the SDK reads them.
process.env['OTEL_SERVICE_NAME']    ??= 'obs-sample-api';
process.env['OTEL_SERVICE_VERSION'] ??= '0.1.0';
// Append deployment.environment without clobbering existing OTEL_RESOURCE_ATTRIBUTES
const existingAttrs = process.env['OTEL_RESOURCE_ATTRIBUTES'];
const envAttr = `deployment.environment=${process.env['NODE_ENV'] ?? 'development'}`;
process.env['OTEL_RESOURCE_ATTRIBUTES'] = existingAttrs ? `${existingAttrs},${envAttr}` : envAttr;

const COLLECTOR_URL = process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318';

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: `${COLLECTOR_URL}/v1/traces`,
  }),
  metricReader: new PeriodicExportingMetricReader({
    exporter: new OTLPMetricExporter({
      url: `${COLLECTOR_URL}/v1/metrics`,
    }),
    exportIntervalMillis: 15_000,
  }),
  instrumentations: [
    getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false },
      '@opentelemetry/instrumentation-http': { enabled: true },
      '@opentelemetry/instrumentation-express': { enabled: true },
    }),
  ],
});

sdk.start();

process.on('SIGTERM', () => sdk.shutdown().finally(() => process.exit(0)));
process.on('SIGINT',  () => sdk.shutdown().finally(() => process.exit(0)));
