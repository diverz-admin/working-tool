CREATE TABLE "annual_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"category" text NOT NULL,
	"item" text NOT NULL,
	"amount" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"mentioned_name" text NOT NULL,
	"from_name" text NOT NULL,
	"preview" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"author_name" text NOT NULL,
	"author_team" text,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "client_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"platform" text NOT NULL,
	"username" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" text DEFAULT '리드' NOT NULL,
	"company_name" text NOT NULL,
	"industry" text,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"business_number" text,
	"category" text,
	"products" text[] DEFAULT '{}',
	"monthly_avg" integer,
	"inbound_date" date,
	"inbound_route" text,
	"end_date" date,
	"end_reason" text,
	"assigned_team" text,
	"assigned_person" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "confirm_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text,
	"row_key" text,
	"client_id" text,
	"assigned_team" text,
	"project_name" text DEFAULT '' NOT NULL,
	"requester" text DEFAULT '' NOT NULL,
	"product_name" text DEFAULT '' NOT NULL,
	"description" text,
	"quantity" text,
	"amount" text,
	"work_start_date" text,
	"work_end_date" text,
	"client_name" text,
	"client_business_number" text,
	"client_email" text,
	"client_industry" text,
	"client_category" text,
	"due_date" text,
	"deposit_account" text,
	"depositor_name" text,
	"requested_at" text NOT NULL,
	"status" text DEFAULT '대기' NOT NULL,
	"tax_invoice_date" text,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_rankings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tracker_id" uuid NOT NULL,
	"rank" integer,
	"total_results" integer,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "keyword_trackers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"project_id" uuid,
	"platform" text DEFAULT 'shopping' NOT NULL,
	"keyword" text NOT NULL,
	"target_type" text NOT NULL,
	"target_value" text NOT NULL,
	"start_date" date,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kpi_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"team" text NOT NULL,
	"target" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"meeting_type" text DEFAULT '회의록' NOT NULL,
	"attendees" text,
	"location" text,
	"author_name" text NOT NULL,
	"assigned_team" text,
	"client_id" uuid,
	"project_id" uuid,
	"proposal_file_url" text,
	"proposal_file_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"assignee" text,
	"entry_date" date,
	"vendor" text,
	"product_name" text,
	"quantity" integer,
	"supply_price" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"invoice_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_revenues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"assignee" text,
	"entry_date" date,
	"client_name" text,
	"product_name" text,
	"quantity" integer,
	"supply_price" integer DEFAULT 0 NOT NULL,
	"tax" integer DEFAULT 0 NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"invoice_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"author_name" text DEFAULT '관리자' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" text,
	"row_key" text,
	"assigned_team" text,
	"project_name" text DEFAULT '' NOT NULL,
	"requester" text DEFAULT '' NOT NULL,
	"product_name" text DEFAULT '' NOT NULL,
	"vendor" text DEFAULT '' NOT NULL,
	"quantity" text,
	"amount" text,
	"pay_date" text,
	"work_start_date" text,
	"work_end_date" text,
	"invoice_file_url" text,
	"invoice_file_name" text,
	"vendor_bank_account" text,
	"requested_at" text NOT NULL,
	"status" text DEFAULT '대기' NOT NULL,
	"reject_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"tab_type" text DEFAULT 'purchase' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"accent" text DEFAULT '#3182F6' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"row_num" integer,
	"name" text NOT NULL,
	"vendor" text,
	"vendor_bank_account" text,
	"cost_price" integer,
	"sale_price" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_costs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"row_num" integer,
	"cost_row_id" text,
	"assignee" text,
	"vendor" text,
	"product_name" text,
	"quantity" integer,
	"supply_price" integer,
	"tax" integer,
	"total" integer,
	"unit_price" integer,
	"purchase_date" date,
	"invoice_date" date,
	"work_start_date" date,
	"work_end_date" date,
	"work_completed" boolean DEFAULT false,
	"is_approved" boolean DEFAULT false,
	"invoice_file_url" text,
	"invoice_file_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"client_id" uuid,
	"assigned_team" text,
	"assigned_person" text,
	"status" text DEFAULT '진행' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_revenues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"row_num" integer,
	"revenue_row_id" text,
	"assignee" text,
	"deposit_account" text,
	"product_name" text,
	"quantity" integer,
	"supply_price" integer,
	"tax" integer,
	"total" integer,
	"payment_date" date,
	"invoice_date" date,
	"work_start_date" date,
	"work_end_date" date,
	"completed_qty" integer DEFAULT 0,
	"work_completed" boolean DEFAULT false,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_group_id" uuid,
	"status" text DEFAULT '리드' NOT NULL,
	"campaign_name" text NOT NULL,
	"client_id" uuid,
	"advertiser" text,
	"product" text,
	"assigned_team" text,
	"assigned_person" text,
	"contract_amount" integer,
	"start_date" date,
	"end_date" date,
	"project_type" text,
	"place_link" text,
	"notes" text,
	"is_extended" boolean DEFAULT false,
	"extension_count" integer DEFAULT 0,
	"original_end_date" date,
	"extension_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_meetings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"week" integer,
	"team" text DEFAULT '전체' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"author_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"team" text NOT NULL,
	"year" integer NOT NULL,
	"annual_target" integer DEFAULT 0 NOT NULL,
	"criteria" text DEFAULT '캠페인 시작날짜' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'Staff' NOT NULL,
	"team" text,
	"position" text,
	"status" text DEFAULT '활성' NOT NULL,
	"joined_at" date DEFAULT now() NOT NULL,
	"phone" text,
	"username" text,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "work_journals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"author_name" text NOT NULL,
	"assigned_team" text,
	"client_id" uuid,
	"project_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat_mentions" ADD CONSTRAINT "chat_mentions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_mentions" ADD CONSTRAINT "chat_mentions_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_channel_id_chat_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."chat_channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_accounts" ADD CONSTRAINT "client_accounts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_rankings" ADD CONSTRAINT "keyword_rankings_tracker_id_keyword_trackers_id_fk" FOREIGN KEY ("tracker_id") REFERENCES "public"."keyword_trackers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_trackers" ADD CONSTRAINT "keyword_trackers_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "keyword_trackers" ADD CONSTRAINT "keyword_trackers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_notes" ADD CONSTRAINT "meeting_notes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_costs" ADD CONSTRAINT "project_costs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_groups" ADD CONSTRAINT "project_groups_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_revenues" ADD CONSTRAINT "project_revenues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_project_group_id_project_groups_id_fk" FOREIGN KEY ("project_group_id") REFERENCES "public"."project_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_journals" ADD CONSTRAINT "work_journals_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_journals" ADD CONSTRAINT "work_journals_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;