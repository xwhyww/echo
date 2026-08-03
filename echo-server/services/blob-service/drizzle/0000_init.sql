CREATE TABLE "blob_grants" (
	"file_hash" text NOT NULL,
	"scope_type" text NOT NULL,
	"scope_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blob_grants_file_hash_scope_type_scope_id_pk" PRIMARY KEY("file_hash","scope_type","scope_id")
);
--> statement-breakpoint
CREATE TABLE "dm_chat_members" (
	"chat_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "dm_chat_members_chat_id_user_id_pk" PRIMARY KEY("chat_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "file_blobs" (
	"hash" text PRIMARY KEY NOT NULL,
	"stored_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "raw_blob_map" (
	"raw_hash" text PRIMARY KEY NOT NULL,
	"file_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blob_grants" ADD CONSTRAINT "blob_grants_file_hash_file_blobs_hash_fk" FOREIGN KEY ("file_hash") REFERENCES "public"."file_blobs"("hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "raw_blob_map" ADD CONSTRAINT "raw_blob_map_file_hash_file_blobs_hash_fk" FOREIGN KEY ("file_hash") REFERENCES "public"."file_blobs"("hash") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blob_grants_scope_idx" ON "blob_grants" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE INDEX "dm_chat_members_user_idx" ON "dm_chat_members" USING btree ("user_id");