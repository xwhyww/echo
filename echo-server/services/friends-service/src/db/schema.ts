import { pgTable, text, timestamp, uuid, unique, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const friendships = pgTable('friendships', {
	id: uuid('id').defaultRandom().primaryKey(),
	requesterId: uuid('requester_id').notNull(),
	addresseeId: uuid('addressee_id').notNull(),
	status: text('status', { enum: ['pending', 'accepted', 'declined'] }).notNull().default('pending'),
	createdAt: timestamp('created_at').defaultNow().notNull(),
	updatedAt: timestamp('updated_at').defaultNow().notNull(),
}, (table) => [
	unique('unique_friendship').on(table.requesterId, table.addresseeId),
	check('no_self_friend', sql`${table.requesterId} != ${table.addresseeId}`),
]);
