import { Hono } from 'hono';
import { requestLogger } from '@echo/shared/logger';
import { log } from './log.js';
import { channelsRoutes } from './routes/channels.js';
import { messagesRoutes } from './routes/messages.js';
import { rolesRoutes } from './routes/roles.js';
import { callsRoutes } from './routes/calls.js';
import { webhooksRoutes } from './routes/webhooks.js';

export const app = new Hono();

app.use('*', requestLogger(log));
// Mounted before the JWT-guarded routers: LiveKit authenticates with its own
// signature, not a user token.
app.route('/voice', webhooksRoutes);
app.route('/voice', channelsRoutes);
app.route('/voice', messagesRoutes);
app.route('/voice', rolesRoutes);
app.route('/voice', callsRoutes);
app.get('/health', (c) => c.json({ status: 'ok' }));
