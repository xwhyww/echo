import { pgTable, text, timestamp, uuid, unique, index } from 'drizzle-orm/pg-core';

/**
 * One row per (device, install). The token is what APNs/FCM addresses, and it
 * is the natural key: the same physical device reinstalling the app gets a new
 * token, and the same token can migrate to a different user when someone signs
 * out and a colleague signs in on the same phone — so registration upserts on
 * the token and overwrites `userId` rather than accumulating rows.
 *
 * `environment` matters on iOS and has no safe default: a token minted by a
 * development build only exists in APNs' sandbox, and sending it to the
 * production host returns BadDeviceToken. The client reports which build it is.
 */
export const deviceTokens = pgTable('device_tokens', {
	id: uuid('id').defaultRandom().primaryKey(),
	userId: uuid('user_id').notNull(),
	token: text('token').notNull(),
	platform: text('platform', { enum: ['ios', 'android'] }).notNull(),
	environment: text('environment', { enum: ['sandbox', 'production'] }).notNull().default('sandbox'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	// Refreshed on every re-registration, so a sweep can retire tokens belonging
	// to installs that have not been opened in months.
	lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
}, (table) => [
	unique('unique_device_token').on(table.token),
	index('device_tokens_user_idx').on(table.userId),
]);
