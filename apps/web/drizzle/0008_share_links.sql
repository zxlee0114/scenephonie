CREATE TABLE "share_links" (
	"id" text PRIMARY KEY NOT NULL,
	"screenplay_id" text NOT NULL,
	"delivery_id" text,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	"note" text
);
--> statement-breakpoint
ALTER TABLE "share_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_screenplay_id_screenplays_id_fk" FOREIGN KEY ("screenplay_id") REFERENCES "public"."screenplays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_token_uidx" ON "share_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "share_links_screenplay_id_idx" ON "share_links" USING btree ("screenplay_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_active_delivery_uidx" ON "share_links" USING btree ("delivery_id") WHERE "share_links"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_active_live_uidx" ON "share_links" USING btree ("screenplay_id") WHERE "share_links"."delivery_id" is null and "share_links"."revoked_at" is null;