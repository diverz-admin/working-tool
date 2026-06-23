-- 1. 미사용 테이블 삭제
DROP TABLE IF EXISTS "monthly_revenues";
--> statement-breakpoint
DROP TABLE IF EXISTS "monthly_costs";
--> statement-breakpoint

-- 2. confirm_requests: 빈 문자열 → NULL 정리
UPDATE "confirm_requests" SET "project_id" = NULL WHERE "project_id" = '';
--> statement-breakpoint
UPDATE "confirm_requests" SET "client_id" = NULL WHERE "client_id" = '';
--> statement-breakpoint

-- 3. confirm_requests: 존재하지 않는 project/client 참조 → NULL 처리 (FK 제약 전 정리)
UPDATE "confirm_requests"
  SET "project_id" = NULL
  WHERE "project_id" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "projects" WHERE "id"::text = "confirm_requests"."project_id");
--> statement-breakpoint
UPDATE "confirm_requests"
  SET "client_id" = NULL
  WHERE "client_id" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "clients" WHERE "id"::text = "confirm_requests"."client_id");
--> statement-breakpoint

-- 4. payment_requests: 빈 문자열 → NULL 정리
UPDATE "payment_requests" SET "project_id" = NULL WHERE "project_id" = '';
--> statement-breakpoint

-- 5. payment_requests: 존재하지 않는 project 참조 → NULL 처리
UPDATE "payment_requests"
  SET "project_id" = NULL
  WHERE "project_id" IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM "projects" WHERE "id"::text = "payment_requests"."project_id");
--> statement-breakpoint

-- 6. 컬럼 타입 변환: text → uuid
ALTER TABLE "confirm_requests" ALTER COLUMN "project_id" TYPE uuid USING "project_id"::uuid;
--> statement-breakpoint
ALTER TABLE "confirm_requests" ALTER COLUMN "client_id" TYPE uuid USING "client_id"::uuid;
--> statement-breakpoint
ALTER TABLE "payment_requests" ALTER COLUMN "project_id" TYPE uuid USING "project_id"::uuid;
--> statement-breakpoint

-- 7. FK 제약 추가
ALTER TABLE "confirm_requests"
  ADD CONSTRAINT "confirm_requests_project_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "confirm_requests"
  ADD CONSTRAINT "confirm_requests_client_id_fk"
  FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "payment_requests"
  ADD CONSTRAINT "payment_requests_project_id_fk"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;
--> statement-breakpoint

-- 8. 인덱스 추가
CREATE INDEX "confirm_requests_project_id_idx" ON "confirm_requests" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX "payment_requests_project_id_idx" ON "payment_requests" USING btree ("project_id");
