CREATE TABLE "share_links" (
	"id" text PRIMARY KEY NOT NULL,
	"screenplay_id" text NOT NULL,
	"delivery_id" text,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "share_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- 既有的交付不知道自己拍的是哪個 doc_seq：補 0 ＝ 分享清單把它們一律當成「之後改過」——
-- 寧可多說一句「劇本後來改過」，也不說一句可能是假的「沒改過」。補完就拿掉 default，之後每一筆都由建立交付的交易寫入。
ALTER TABLE "deliveries" ADD COLUMN "source_doc_seq" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "deliveries" ALTER COLUMN "source_doc_seq" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_screenplay_id_screenplays_id_fk" FOREIGN KEY ("screenplay_id") REFERENCES "public"."screenplays"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "share_links" ADD CONSTRAINT "share_links_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_token_uidx" ON "share_links" USING btree ("token");--> statement-breakpoint
CREATE INDEX "share_links_screenplay_id_idx" ON "share_links" USING btree ("screenplay_id");--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_active_delivery_uidx" ON "share_links" USING btree ("delivery_id") WHERE "share_links"."revoked_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "share_links_active_live_uidx" ON "share_links" USING btree ("screenplay_id") WHERE "share_links"."delivery_id" is null and "share_links"."revoked_at" is null;