import jwt from 'jsonwebtoken';
import { createMiddleware } from 'hono/factory';

export interface JwtPayload {
	userId: string;
	email: string | null;
	username: string;
}

export function signToken(payload: JwtPayload, secret: string): string {
	return jwt.sign(payload, secret, { expiresIn: '7d' });
}

export function verifyToken(token: string, secret: string): JwtPayload | null {
	try {
		return jwt.verify(token, secret) as JwtPayload;
	} catch {
		return null;
	}
}

export type AuthEnv = {
	Variables: {
		user: JwtPayload;
	};
};

export function authMiddleware(secret: string) {
	return createMiddleware<AuthEnv>(async (c, next) => {
		const header = c.req.header('Authorization');
		if (!header?.startsWith('Bearer ')) {
			return c.json({ error: 'Unauthorized' }, 401);
		}

		const token = header.slice(7);
		const payload = verifyToken(token, secret);
		if (!payload) {
			return c.json({ error: 'Invalid token' }, 401);
		}

		c.set('user', payload);
		await next();
	});
}
