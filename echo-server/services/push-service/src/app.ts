import { Hono } from 'hono';
import { requestLogger } from '@echo/shared/logger';
import { log } from './log.js';
import { deviceRoutes } from './routes/devices.js';
import { apnsConfigured } from './config.js';

export const app = new Hono();

app.use('*', requestLogger(log));
app.route('/push', deviceRoutes);
// `apns` reports whether credentials are present, so a deploy can be checked
// without sending a real notification to find out.
app.get('/health', (c) => c.json({ status: 'ok', apns: apnsConfigured ? 'configured' : 'disabled' }));
