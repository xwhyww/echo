import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { authRoutes } from './routes/auth.js';

export const app = new Hono();

app.use('*', logger());
app.route('/auth', authRoutes);
app.get('/health', (c) => c.json({ status: 'ok' }));
