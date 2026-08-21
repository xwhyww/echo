import { eq, inArray } from 'drizzle-orm';
import { createDb } from './db/index.js';
import { deviceTokens } from './db/schema.js';
import { config } from './config.js';
import { isUserConnected } from './presence.js';
import { sendApns, isEnabled, type ApnsNotification } from './apns.js';
import { sendFcm, isFcmEnabled } from './fcm.js';
import {
	loadSettings,
	allows,
	previewAllowed,
	type NotificationKind,
} from './settings.js';
import { log } from './log.js';

/**
 * Builds the banner once the recipient's preview preference is known.
 *
 * The copy cannot be built ahead of time, because whether it may quote the
 * message is the recipient's own setting — the same event becomes different
 * text for different people.
 */
export type NotificationBuilder = (showPreview: boolean) => ApnsNotification;

const db = createDb(config.databaseUrl);

/**
 * Deliver one notification to every device a user has registered.
 *
 * Three gates, cheapest first. If the app is connected it has already received
 * this as a WebSocket event and rendered it in place, so a banner on top would
 * be the same news twice — push is strictly the fallback for an app that isn't
 * listening. If the user has no device registered there is nowhere to send it.
 * And last, their own settings: a muted conversation or a category switched off
 * stops here rather than at the device, so the choice holds across every phone
 * they own.
 */
export async function notifyUser(
	userId: string,
	kind: NotificationKind,
	scopeId: string | undefined,
	build: NotificationBuilder,
): Promise<void> {
	if (await isUserConnected(userId)) return;

	const devices = await db.select().from(deviceTokens).where(eq(deviceTokens.userId, userId));
	if (devices.length === 0) return;

	const settings = await loadSettings(userId);
	if (!allows(settings, kind, scopeId)) return;

	const notification = build(previewAllowed(settings));

	// The two platforms are configured independently, so one can be live while
	// the other waits on credentials — which is exactly the situation while an
	// Apple Developer membership is outstanding and Firebase is already set up.
	if (!isEnabled() && !isFcmEnabled()) {
		// Deliberately loud but harmless: until credentials exist this is the only
		// sign that the pipeline reached the last step correctly.
		log.info(
			{ userId, devices: devices.length, title: notification.title },
			'no push provider configured — notification dropped',
		);
		return;
	}

	const dead: string[] = [];

	await Promise.all(
		devices.map(async (device) => {
			const result =
				device.platform === 'ios'
					? isEnabled()
						? await sendApns(device.token, device.environment, notification)
						: null
					: isFcmEnabled()
						? await sendFcm(device.token, notification)
						: null;

			// The provider for this device's platform has no credentials. Its rows
			// stay valid for whenever it does.
			if (!result) return;
			if (result.ok) return;

			if (result.unregistered) {
				dead.push(device.token);
				return;
			}
			log.warn(
				{ userId, platform: device.platform, reason: result.reason, retryable: result.retryable },
				'push delivery failed',
			);
		}),
	);

	// A token the provider has disowned will never work again — the app was
	// deleted, or (on iOS) the token belongs to the other environment. Keeping it
	// would mean retrying a guaranteed failure on every future message.
	if (dead.length > 0) {
		await db.delete(deviceTokens).where(inArray(deviceTokens.token, dead));
		log.info({ userId, count: dead.length }, 'pruned unregistered device tokens');
	}
}

/** Same event to many people — a group message. */
export async function notifyUsers(
	userIds: string[],
	kind: NotificationKind,
	scopeId: string | undefined,
	build: NotificationBuilder,
): Promise<void> {
	await Promise.all(userIds.map((id) => notifyUser(id, kind, scopeId, build)));
}
