import { Router, type Request, type Response } from 'express';
import { trace, SpanStatusCode } from '@opentelemetry/api';

export const instrumentsRouter = Router();

const tracer = trace.getTracer('obs-sample-api');

const INSTRUMENTS = [
  { isin: 'US0378331005', ticker: 'AAPL', name: 'Apple Inc.', currency: 'USD' },
  { isin: 'US5949181045', ticker: 'MSFT', name: 'Microsoft Corp.', currency: 'USD' },
  { isin: 'GB0031348658', ticker: 'BARC', name: 'Barclays PLC', currency: 'GBP' },
  { isin: 'DE0007164600', ticker: 'SAP', name: 'SAP SE', currency: 'EUR' },
];

instrumentsRouter.get('/', (_req: Request, res: Response) => {
  res.json(INSTRUMENTS);
});

instrumentsRouter.get('/:isin', (req: Request, res: Response) => {
  const span = tracer.startSpan('instruments.lookup', {
    attributes: { 'fdc3.instrument.id.ISIN': req.params['isin'] },
  });

  try {
    const instrument = INSTRUMENTS.find((i) => i.isin === req.params['isin']);
    if (!instrument) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'not found' });
      res.status(404).json({ error: 'Instrument not found' });
      return;
    }
    // Simulate a tiny async latency (price fetch, etc.)
    setTimeout(() => {
      span.setAttribute('fdc3.instrument.name', instrument.name);
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
      res.json(instrument);
    }, Math.random() * 40);
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
    res.status(500).json({ error: 'Internal error' });
  }
});
