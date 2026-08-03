import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { blobRoutes } from './routes/blobs.js';

export const app = new Hono();

app.use('*', logger());
app.route('/blobs', blobRoutes);
app.get('/health', (c) => c.json({ status: 'ok' }));
