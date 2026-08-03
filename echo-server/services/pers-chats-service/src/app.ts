import { Hono } from 'hono';
import { logger } from 'hono/logger';
import { personalChatsRoutes } from './routes/personalChats.js';
import { internalRoutes } from './routes/internal.js';

export const app = new Hono();

app.use('*', logger());
app.route('/personal-chats', personalChatsRoutes);
app.route('/internal', internalRoutes);
app.get('/health', (c) => c.json({ status: 'ok' }));
