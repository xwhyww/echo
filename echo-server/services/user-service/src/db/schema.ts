import { pgTable, text, timestamp, boolean, uuid, varchar } from 'drizzle-orm/pg-core';

export const userProfiles = pgTable('user_profiles', {
	id: uuid('id').primaryKey(),
	email: text('email').unique(),
	username: text('username').notNull().unique(),
	displayName: text('display_name'),
	avatarUrl: text('avatar_url'),
	phone: text('phone'),
	status: text('status'),
	isOnline: boolean('is_online').default(false).notNull(),
	privacyOnlineStatus: varchar('privacy_online_status', { length: 16 }).default('all').notNull(),
	privacyPhone: varchar('privacy_phone', { length: 16 }).default('friends').notNull(),
	privacyEmail: varchar('privacy_email', { length: 16 }).default('friends').notNull(),
	privacyMessaging: varchar('privacy_messaging', { length: 16 }).default('all').notNull(),
	privacyProfile: varchar('privacy_profile', { length: 16 }).default('all').notNull(),
	privacyPhoto: varchar('privacy_photo', { length: 16 }).default('all').notNull(),
	privacyGroupInvite: varchar('privacy_group_invite', { length: 16 }).default('all').notNull(),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
});
