import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { groupsRoutes } from './routes/groups.js';
import { invitesRoutes } from './routes/invites.js';
import { messagesRoutes } from './routes/messages.js';
import { internalRoutes } from './routes/internal.js';

export const app = new Hono();

app.use('*', logger());
app.route('/internal', internalRoutes);
app.route('/groups', groupsRoutes);
app.route('/groups', invitesRoutes);
app.route('/groups', messagesRoutes);
app.get('/health', (c) => c.json({ status: 'ok' }));
