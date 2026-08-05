import { eq, inArray } from 'drizzle-orm';
import { createDb } from './db/index.js';
import { deviceTokens } from './db/schema.js';
import { config } from './config.js';
import { isUserConnected } from './presence.js';
import { sendApns, isEnabled, type ApnsNotification } from './apns.js';
import { log } from './log.js';

const db = createDb(config.databaseUrl);

/**
 * Deliver one notification to every device a user has registered.
 *
 * The suppression rule is the important part: if the app is connected it has
 * already received this as a WebSocket event and rendered it in place, so a
 * banner on top would be the same news twice. Push is strictly the fallback for
 * an app that isn't listening.
 */
export async function notifyUser(userId: string, notification: ApnsNotification): Promise<void> {
	if (await isUserConnected(userId)) return;

	const devices = await db.select().from(deviceTokens).where(eq(deviceTokens.userId, userId));
	if (devices.length === 0) return;

	if (!isEnabled()) {
		// Deliberately loud but harmless: until APNs credentials exist this is the
		// only sign that the pipeline reached the last step correctly.
		log.info(
			{ userId, devices: devices.length, title: notification.title },
			'APNs not configured — notification dropped',
		);
		return;
	}

	const dead: string[] = [];

	await Promise.all(
		devices.map(async (device) => {
			// Android tokens are stored by the same endpoint but need FCM, which
			// isn't wired up yet; skipping them keeps the rows valid for later.
			if (device.platform !== 'ios') return;

			const result = await sendApns(device.token, device.environment, notification);
			if (result.ok) return;

			if (result.unregistered) {
				dead.push(device.token);
				return;
			}
			log.warn(
				{ userId, reason: result.reason, retryable: result.retryable },
				'APNs delivery failed',
			);
		}),
	);

	// A token APNs has disowned will never work again — the app was deleted, or
	// the token belongs to the other environment. Keeping it would mean retrying
	// a guaranteed failure on every future message.
	if (dead.length > 0) {
		await db.delete(deviceTokens).where(inArray(deviceTokens.token, dead));
		log.info({ userId, count: dead.length }, 'pruned unregistered device tokens');
	}
}

/** Same notification to many people — a group message. */
export async function notifyUsers(userIds: string[], notification: ApnsNotification): Promise<void> {
	await Promise.all(userIds.map((id) => notifyUser(id, notification)));
}
