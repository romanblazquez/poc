// tracing must be the first import — initialises the OTEL SDK before Express loads
import './tracing.js';

import express from 'express';
import { instrumentsRouter } from './routes/instruments.js';
import { ordersRouter } from './routes/orders.js';

const app = express();
const PORT = Number(process.env['PORT'] ?? 3100);

app.use(express.json());

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  next();
});

app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));

app.use('/api/instruments', instrumentsRouter);
app.use('/api/orders', ordersRouter);

app.listen(PORT, () => {
  console.log(`obs-sample-api listening on http://localhost:${PORT}`);
  console.log(`OTEL traces → ${process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://localhost:4318'}`);
});
