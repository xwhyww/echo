import { integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Identity is the phone number: sign-in/sign-up is a single SMS-OTP flow.
// email is an optional profile field; password_hash, when set, acts as a
// second factor after the OTP step.
export const users = pgTable('users', {
	id: uuid('id').defaultRandom().primaryKey(),
	email: text('email').unique(),
	username: text('username').notNull().unique(),
	passwordHash: text('password_hash'),
	displayName: text('display_name'),
	avatarUrl: text('avatar_url'),
	phone: text('phone').notNull().unique(),
	status: text('status'),
	privacyOnlineStatus: varchar('privacy_online_status', { length: 16 }).default('all').notNull(),
	privacyPhone: varchar('privacy_phone', { length: 16 }).default('friends').notNull(),
	privacyEmail: varchar('privacy_email', { length: 16 }).default('friends').notNull(),
	privacyMessaging: varchar('privacy_messaging', { length: 16 }).default('all').notNull(),
	privacyProfile: varchar('privacy_profile', { length: 16 }).default('all').notNull(),
	privacyPhoto: varchar('privacy_photo', { length: 16 }).default('all').notNull(),
	privacyGroupInvite: varchar('privacy_group_invite', { length: 16 }).default('all').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

// One active OTP per phone; a resend replaces the row. The code itself is
// never stored — only its sha256.
export const phoneOtps = pgTable('phone_otps', {
	phone: text('phone').primaryKey(),
	codeHash: text('code_hash').notNull(),
	attempts: integer('attempts').default(0).notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	lastSentAt: timestamp('last_sent_at').defaultNow().notNull(),
});

export const userAvatars = pgTable('user_avatars', {
	id: uuid('id').defaultRandom().primaryKey(),
	userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
	url: text('url').notNull(),
	hash: text('hash'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const usersRelations = relations(users, ({ many }) => ({
	avatars: many(userAvatars),
}));

export const userAvatarsRelations = relations(userAvatars, ({ one }) => ({
	user: one(users, { fields: [userAvatars.userId], references: [users.id] }),
}));
