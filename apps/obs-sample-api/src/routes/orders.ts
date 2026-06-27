import { Router, type Request, type Response } from 'express';
import { trace, metrics, SpanStatusCode } from '@opentelemetry/api';

export const ordersRouter = Router();

const tracer = trace.getTracer('obs-sample-api');
const meter = metrics.getMeter('obs-sample-api');

const ordersCreated = meter.createCounter('orders.created', {
  description: 'Number of orders created',
});
const orderProcessingDuration = meter.createHistogram('orders.processing_duration_ms', {
  description: 'Order processing time in milliseconds',
  unit: 'ms',
});

interface Order {
  id: string;
  instrument: string;
  side: 'Buy' | 'Sell';
  quantity: number;
  price: number;
  status: 'Pending' | 'Filled' | 'Rejected';
  createdAt: string;
}

const ORDERS: Order[] = [
  { id: 'ORD-001', instrument: 'AAPL', side: 'Buy', quantity: 100, price: 182.5, status: 'Filled', createdAt: new Date().toISOString() },
  { id: 'ORD-002', instrument: 'MSFT', side: 'Sell', quantity: 50, price: 415.0, status: 'Pending', createdAt: new Date().toISOString() },
];

ordersRouter.get('/', (_req: Request, res: Response) => {
  res.json(ORDERS);
});

ordersRouter.post('/', (req: Request, res: Response) => {
  const span = tracer.startSpan('orders.create', {
    attributes: {
      'fdc3.order.instrument': req.body?.instrument ?? 'unknown',
      'fdc3.order.side': req.body?.side ?? 'unknown',
    },
  });

  const t0 = Date.now();

  try {
    const { instrument, side, quantity, price } = req.body as Partial<Order>;
    if (!instrument || !side || !quantity || !price) {
      span.setStatus({ code: SpanStatusCode.ERROR, message: 'validation failed' });
      span.end();
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    const order: Order = {
      id: `ORD-${String(ORDERS.length + 1).padStart(3, '0')}`,
      instrument,
      side,
      quantity,
      price,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };

    ORDERS.push(order);
    ordersCreated.add(1, { instrument, side });
    orderProcessingDuration.record(Date.now() - t0, { instrument });

    span.setAttribute('fdc3.order.id', order.id);
    span.setStatus({ code: SpanStatusCode.OK });
    span.end();

    res.status(201).json(order);
  } catch (err) {
    span.recordException(err as Error);
    span.setStatus({ code: SpanStatusCode.ERROR });
    span.end();
    res.status(500).json({ error: 'Internal error' });
  }
});
