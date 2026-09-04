CREATE TABLE "screenplay_backups" (
	"id" text PRIMARY KEY NOT NULL,
	"screenplay_id" text NOT NULL,
	"doc" jsonb NOT NULL,
	"doc_schema_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "screenplays" (
	"id" text PRIMARY KEY NOT NULL,
	"doc" jsonb NOT NULL,
	"doc_schema_version" integer NOT NULL,
	"doc_seq" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "screenplay_backups" ADD CONSTRAINT "screenplay_backups_screenplay_id_screenplays_id_fk" FOREIGN KEY ("screenplay_id") REFERENCES "public"."screenplays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "screenplay_backups_screenplay_id_created_at_idx" ON "screenplay_backups" USING btree ("screenplay_id","created_at" DESC NULLS LAST);