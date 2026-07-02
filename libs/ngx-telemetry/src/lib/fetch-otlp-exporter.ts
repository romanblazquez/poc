import type { ExportResult } from '@opentelemetry/core';
import { ExportResultCode } from '@opentelemetry/core';
import type { ReadableSpan, SpanExporter } from '@opentelemetry/sdk-trace-base';
import { JsonTraceSerializer } from '@opentelemetry/otlp-transformer';

/**
 * Minimal OTLP/HTTP trace exporter using fetch.
 *
 * Replaces @opentelemetry/exporter-trace-otlp-http which has an ES5/ES6 class
 * inheritance mismatch that breaks Angular's esbuild bundler.
 */
export class FetchOtlpExporter implements SpanExporter {
  private readonly _url: string;

  constructor(url: string) {
    this._url = url;
  }

  export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): void {
    if (spans.length === 0) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    const serialized = JsonTraceSerializer.serializeRequest(spans);
    if (!serialized) {
      resultCallback({ code: ExportResultCode.SUCCESS });
      return;
    }

    const body = new TextDecoder().decode(serialized);

    fetch(this._url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body,
      keepalive: true,
    })
      .then(res => {
        resultCallback({ code: res.ok ? ExportResultCode.SUCCESS : ExportResultCode.FAILED });
      })
      .catch(err => {
        resultCallback({ code: ExportResultCode.FAILED, error: err as Error });
      });
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  forceFlush(): Promise<void> {
    return Promise.resolve();
  }
}
