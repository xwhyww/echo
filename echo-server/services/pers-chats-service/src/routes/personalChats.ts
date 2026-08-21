import { Hono } from 'hono';
import { authMiddleware, type AuthEnv } from '@echo/shared';
import { config } from '../config.js';
import { routes as upload } from './personalChats/upload.js';
import { routes as chats } from './personalChats/chats.js';
import { routes as messages } from './personalChats/messages.js';
import { routes as pins } from './personalChats/pins.js';
import { routes as media } from './personalChats/media.js';
import { routes as reactions } from './personalChats/reactions.js';

/**
 * The personal-chat surface, assembled from one file per concern.
 *
 * Mount order is load-bearing, not alphabetical: Hono matches in registration
 * order, so `chats` has to come before `messages` for `/by-user/:userId` to win
 * over `/:chatId/messages`. Every other overlap between the groups differs in a
 * literal segment or a method, so their relative order does not matter — but
 * this one does.
 */
export const personalChatsRoutes = new Hono<AuthEnv>();

personalChatsRoutes.use('*', authMiddleware(config.jwtSecret));

personalChatsRoutes.route('/', upload);
personalChatsRoutes.route('/', chats);
personalChatsRoutes.route('/', messages);
personalChatsRoutes.route('/', pins);
personalChatsRoutes.route('/', media);
personalChatsRoutes.route('/', reactions);
