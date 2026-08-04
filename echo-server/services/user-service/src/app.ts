import { Hono } from 'hono';
import { requestLogger } from '@echo/shared/logger';
import { log } from './log.js';
import { usersRoutes } from './routes/users.js';
import { internalRoutes } from './routes/internal.js';

export const app = new Hono();

app.use('*', requestLogger(log));
app.route('/users', usersRoutes);
app.route('/internal', internalRoutes);
app.get('/health', (c) => c.json({ status: 'ok' }));
