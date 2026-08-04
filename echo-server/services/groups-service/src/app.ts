import { Hono } from 'hono';
import { requestLogger } from '@echo/shared/logger';
import { log } from './log.js';
import { groupsRoutes } from './routes/groups.js';
import { invitesRoutes } from './routes/invites.js';
import { messagesRoutes } from './routes/messages.js';
import { internalRoutes } from './routes/internal.js';

export const app = new Hono();

app.use('*', requestLogger(log));
app.route('/internal', internalRoutes);
app.route('/groups', groupsRoutes);
app.route('/groups', invitesRoutes);
app.route('/groups', messagesRoutes);
app.get('/health', (c) => c.json({ status: 'ok' }));
