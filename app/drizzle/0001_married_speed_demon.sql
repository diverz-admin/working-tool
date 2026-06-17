CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_urls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_todos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"content" text NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_daily_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"revenue_id" uuid NOT NULL,
	"date" date NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "biz_reg_file_url" text;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "biz_reg_file_name" text;--> statement-breakpoint
ALTER TABLE "project_costs" ADD COLUMN "setting_date" date;--> statement-breakpoint
ALTER TABLE "project_revenues" ADD COLUMN "section_label" text;--> statement-breakpoint
ALTER TABLE "project_revenues" ADD COLUMN "setting_date" date;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "kpi_supply" integer;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "kpi_tax" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "work_phone" text;--> statement-breakpoint
ALTER TABLE "client_urls" ADD CONSTRAINT "client_urls_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_todos" ADD CONSTRAINT "user_todos_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_daily_logs" ADD CONSTRAINT "work_daily_logs_revenue_id_project_revenues_id_fk" FOREIGN KEY ("revenue_id") REFERENCES "public"."project_revenues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_todos_user_id_idx" ON "user_todos" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "work_daily_logs_revenue_id_idx" ON "work_daily_logs" USING btree ("revenue_id");--> statement-breakpoint
CREATE INDEX "keyword_rankings_tracker_id_idx" ON "keyword_rankings" USING btree ("tracker_id");--> statement-breakpoint
CREATE INDEX "keyword_trackers_client_id_idx" ON "keyword_trackers" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "keyword_trackers_project_id_idx" ON "keyword_trackers" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_costs_project_id_idx" ON "project_costs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_costs_is_approved_idx" ON "project_costs" USING btree ("is_approved");--> statement-breakpoint
CREATE INDEX "project_groups_client_id_idx" ON "project_groups" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "project_groups_status_idx" ON "project_groups" USING btree ("status");--> statement-breakpoint
CREATE INDEX "project_revenues_project_id_idx" ON "project_revenues" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_revenues_payment_date_idx" ON "project_revenues" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "project_revenues_invoice_date_idx" ON "project_revenues" USING btree ("invoice_date");--> statement-breakpoint
CREATE INDEX "projects_project_group_id_idx" ON "projects" USING btree ("project_group_id");--> statement-breakpoint
CREATE INDEX "projects_client_id_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "projects_status_idx" ON "projects" USING btree ("status");--> statement-breakpoint
CREATE INDEX "projects_start_date_idx" ON "projects" USING btree ("start_date");