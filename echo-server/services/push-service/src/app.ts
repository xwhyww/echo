import { Hono } from 'hono';
import { requestLogger } from '@echo/shared/logger';
import { log } from './log.js';
import { deviceRoutes } from './routes/devices.js';
import { apnsConfigured, fcmConfigured } from './config.js';

export const app = new Hono();

app.use('*', requestLogger(log));
app.route('/push', deviceRoutes);
// Each provider reports whether its credentials are present, so a deploy can be
// checked without sending a real notification to find out. They are independent:
// Android can be live while iOS waits on an Apple Developer membership.
app.get('/health', (c) =>
	c.json({
		status: 'ok',
		apns: apnsConfigured ? 'configured' : 'disabled',
		fcm: fcmConfigured ? 'configured' : 'disabled',
	}),
);
