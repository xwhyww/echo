import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { friendsRoutes } from './routes/friends.js';
import { internalRoutes } from './routes/internal.js';
export const app = new Hono();

app.use('*', logger());
app.route('/friends', friendsRoutes);
app.route('/internal', internalRoutes);
app.get('/health', (c) => c.json({ status: 'ok' }));
