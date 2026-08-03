CREATE TABLE "voice_channel_chat_reads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"last_read_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_channel_message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_channel_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"content" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_edited" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"pinned_at" timestamp,
	"pinned_by" uuid,
	"reply_to_id" uuid,
	"reply_to_snapshot" jsonb,
	"forwarded_from" jsonb,
	"content_key_id" smallint
);
--> statement-breakpoint
ALTER TABLE "voice_channel_chat_reads" ADD CONSTRAINT "voice_channel_chat_reads_channel_id_voice_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."voice_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_channel_chat_reads" ADD CONSTRAINT "voice_channel_chat_reads_user_id_user_cache_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_channel_message_reactions" ADD CONSTRAINT "voice_channel_message_reactions_message_id_voice_channel_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."voice_channel_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_channel_message_reactions" ADD CONSTRAINT "voice_channel_message_reactions_user_id_user_cache_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_channel_messages" ADD CONSTRAINT "voice_channel_messages_channel_id_voice_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."voice_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_channel_messages" ADD CONSTRAINT "voice_channel_messages_author_id_user_cache_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_channel_messages" ADD CONSTRAINT "voice_channel_messages_pinned_by_user_cache_id_fk" FOREIGN KEY ("pinned_by") REFERENCES "public"."user_cache"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_vccr_user_channel" ON "voice_channel_chat_reads" USING btree ("user_id","channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_vcmr_user_message" ON "voice_channel_message_reactions" USING btree ("user_id","message_id");--> statement-breakpoint
CREATE INDEX "idx_vcmr_message" ON "voice_channel_message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_vcm_channel_created" ON "voice_channel_messages" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_vcm_channel_pinned" ON "voice_channel_messages" USING btree ("channel_id","pinned_at");