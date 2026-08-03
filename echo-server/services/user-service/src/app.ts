import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { usersRoutes } from './routes/users.js';
import { internalRoutes } from './routes/internal.js';

export const app = new Hono();

app.use('*', logger());
app.route('/users', usersRoutes);
app.route('/internal', internalRoutes);
app.get('/health', (c) => c.json({ status: 'ok' }));
