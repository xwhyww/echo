CREATE TABLE "personal_chat_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user1_id" uuid NOT NULL,
	"user2_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "personal_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"chat_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"is_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_cache" (
	"id" uuid PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text,
	"avatar_url" text,
	"is_online" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "personal_chat_reads" ADD CONSTRAINT "personal_chat_reads_chat_id_personal_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."personal_chats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_chat_reads" ADD CONSTRAINT "personal_chat_reads_user_id_user_cache_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_chats" ADD CONSTRAINT "personal_chats_user1_id_user_cache_id_fk" FOREIGN KEY ("user1_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_chats" ADD CONSTRAINT "personal_chats_user2_id_user_cache_id_fk" FOREIGN KEY ("user2_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_messages" ADD CONSTRAINT "personal_messages_chat_id_personal_chats_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."personal_chats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "personal_messages" ADD CONSTRAINT "personal_messages_author_id_user_cache_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;