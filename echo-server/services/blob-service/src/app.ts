import { Hono } from 'hono';
import { requestLogger } from '@echo/shared/logger';
import { log } from './log.js';
import { blobRoutes } from './routes/blobs.js';

export const app = new Hono();

app.use('*', requestLogger(log));
app.route('/blobs', blobRoutes);
app.get('/health', (c) => c.json({ status: 'ok' }));
