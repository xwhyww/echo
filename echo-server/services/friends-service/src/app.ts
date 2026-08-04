import { Hono } from 'hono';
import { requestLogger } from '@echo/shared/logger';
import { log } from './log.js';
import { friendsRoutes } from './routes/friends.js';
import { internalRoutes } from './routes/internal.js';
export const app = new Hono();

app.use('*', requestLogger(log));
app.route('/friends', friendsRoutes);
app.route('/internal', internalRoutes);
app.get('/health', (c) => c.json({ status: 'ok' }));
