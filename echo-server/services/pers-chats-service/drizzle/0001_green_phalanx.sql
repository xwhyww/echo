CREATE UNIQUE INDEX "idx_pcr_user_chat" ON "personal_chat_reads" USING btree ("user_id","chat_id");--> statement-breakpoint
CREATE INDEX "idx_pc_user1" ON "personal_chats" USING btree ("user1_id");--> statement-breakpoint
CREATE INDEX "idx_pc_user2" ON "personal_chats" USING btree ("user2_id");--> statement-breakpoint
CREATE INDEX "idx_pm_chat_created" ON "personal_messages" USING btree ("chat_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_uc_username" ON "user_cache" USING btree ("username");