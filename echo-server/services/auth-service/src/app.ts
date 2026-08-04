import { Hono } from 'hono';
import { requestLogger } from '@echo/shared/logger';
import { log } from './log.js';
import { authRoutes } from './routes/auth.js';

export const app = new Hono();

app.use('*', requestLogger(log));
app.route('/auth', authRoutes);
app.get('/health', (c) => c.json({ status: 'ok' }));
