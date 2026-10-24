ALTER TABLE "projects" ADD COLUMN "creation_id" text;--> statement-breakpoint
-- 劇本名稱（票券 71）：既有劇本回填成它所屬專案的名稱，再加 NOT NULL。
ALTER TABLE "screenplays" ADD COLUMN "title" text;--> statement-breakpoint
UPDATE "screenplays" SET "title" = "projects"."title" FROM "projects" WHERE "screenplays"."project_id" = "projects"."id";--> statement-breakpoint
ALTER TABLE "screenplays" ALTER COLUMN "title" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_owner_creation_uidx" ON "projects" USING btree ("owner_id","creation_id") WHERE "projects"."creation_id" is not null;
