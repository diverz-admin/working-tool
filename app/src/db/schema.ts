import { pgTable, uuid, text, integer, date, timestamp, boolean } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id:           uuid("id").primaryKey().defaultRandom(),
  name:         text("name").notNull(),
  email:        text("email").notNull(),
  role:         text("role").notNull().default("Staff"),   // Admin | Manager | Staff
  team:         text("team"),
  position:     text("position"),
  status:       text("status").notNull().default("활성"),  // 활성 | 비활성
  joinedAt:     date("joined_at").notNull().defaultNow(),
  phone:        text("phone"),
  workPhone:    text("work_phone"),
  username:     text("username").unique(),
  passwordHash: text("password_hash"),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AppUser = typeof users.$inferSelect;

export const clients = pgTable("clients", {
  id:             uuid("id").primaryKey().defaultRandom(),
  status:         text("status").notNull().default("리드"),
  companyName:    text("company_name").notNull(),
  industry:       text("industry"),
  contactName:    text("contact_name"),
  contactPhone:   text("contact_phone"),
  contactEmail:   text("contact_email"),
  businessNumber: text("business_number"),
  category:       text("category"),            // 'B2B' | 'B2C'
  products:       text("products").array().default([]),
  monthlyAvg:     integer("monthly_avg"),
  inboundDate:    date("inbound_date"),
  inboundRoute:   text("inbound_route"),
  endDate:        date("end_date"),
  endReason:      text("end_reason"),
  assignedTeam:   text("assigned_team"),
  assignedPerson: text("assigned_person"),
  notes:          text("notes"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Client = typeof clients.$inferSelect;
export type NewClient = typeof clients.$inferInsert;

export const clientAccounts = pgTable("client_accounts", {
  id:        uuid("id").primaryKey().defaultRandom(),
  clientId:  uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
  platform:  text("platform").notNull(),
  username:  text("username"),
  password:  text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ClientAccount = typeof clientAccounts.$inferSelect;

// 프로젝트 = 광고주 단위 컨테이너
export const projectGroups = pgTable("project_groups", {
  id:             uuid("id").primaryKey().defaultRandom(),
  name:           text("name").notNull(),
  clientId:       uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  assignedTeam:   text("assigned_team"),
  assignedPerson: text("assigned_person"),
  status:         text("status").notNull().default("진행"),  // 진행 | 종료
  notes:          text("notes"),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:      timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectGroup = typeof projectGroups.$inferSelect;
export type NewProjectGroup = typeof projectGroups.$inferInsert;

// 캠페인 = 계약 기간 단위 (기존 projects 테이블)
export const projects = pgTable("projects", {
  id:             uuid("id").primaryKey().defaultRandom(),
  projectGroupId: uuid("project_group_id").references(() => projectGroups.id, { onDelete: "cascade" }),
  status:         text("status").notNull().default("리드"),   // 리드 | 진행 | 종료
  campaignName:   text("campaign_name").notNull(),
  clientId:       uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  advertiser:     text("advertiser"),
  product:        text("product"),
  assignedTeam:   text("assigned_team"),
  assignedPerson: text("assigned_person"),
  contractAmount: integer("contract_amount"),
  startDate:      date("start_date"),
  endDate:        date("end_date"),
  projectType:      text("project_type"),   // 관리형 | 보장형
  placeLink:        text("place_link"),
  notes:            text("notes"),
  isExtended:       boolean("is_extended").default(false),
  extensionCount:   integer("extension_count").default(0),
  originalEndDate:  date("original_end_date"),
  extensionNotes:   text("extension_notes"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Project = typeof projects.$inferSelect;

export const projectRevenues = pgTable("project_revenues", {
  id:             uuid("id").primaryKey().defaultRandom(),
  projectId:      uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  rowNum:         integer("row_num"),
  revenueRowId:   text("revenue_row_id"),
  assignee:       text("assignee"),
  depositAccount: text("deposit_account"),
  productName:   text("product_name"),
  quantity:      integer("quantity"),
  supplyPrice:   integer("supply_price"),
  tax:           integer("tax"),
  total:         integer("total"),
  paymentDate:   date("payment_date"),
  invoiceDate:   date("invoice_date"),
  workStartDate: date("work_start_date"),
  workEndDate:   date("work_end_date"),
  completedQty:  integer("completed_qty").default(0),
  workCompleted: boolean("work_completed").default(false),
  completedAt:   timestamp("completed_at", { withTimezone: true }),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectRevenue = typeof projectRevenues.$inferSelect;

export const projectCosts = pgTable("project_costs", {
  id:              uuid("id").primaryKey().defaultRandom(),
  projectId:       uuid("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
  rowNum:          integer("row_num"),
  costRowId:       text("cost_row_id"),
  assignee:        text("assignee"),
  vendor:          text("vendor"),
  productName:     text("product_name"),
  quantity:        integer("quantity"),
  supplyPrice:     integer("supply_price"),
  tax:             integer("tax"),
  total:           integer("total"),
  unitPrice:       integer("unit_price"),
  purchaseDate:    date("purchase_date"),
  invoiceDate:     date("invoice_date"),
  workStartDate:   date("work_start_date"),
  workEndDate:     date("work_end_date"),
  workCompleted:   boolean("work_completed").default(false),
  isApproved:      boolean("is_approved").default(false),
  invoiceFileUrl:  text("invoice_file_url"),
  invoiceFileName: text("invoice_file_name"),
  createdAt:       timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ProjectCost = typeof projectCosts.$inferSelect;

export const keywordTrackers = pgTable("keyword_trackers", {
  id:          uuid("id").primaryKey().defaultRandom(),
  clientId:    uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
  projectId:   uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  platform:    text("platform").notNull().default("shopping"), // 'shopping' | 'place'
  keyword:     text("keyword").notNull(),
  targetType:  text("target_type").notNull(),
  targetValue: text("target_value").notNull(),
  startDate:   date("start_date"),
  endDate:     date("end_date"),
  isActive:    boolean("is_active").notNull().default(true),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type KeywordTracker = typeof keywordTrackers.$inferSelect;
export type NewKeywordTracker = typeof keywordTrackers.$inferInsert;

export const keywordRankings = pgTable("keyword_rankings", {
  id:           uuid("id").primaryKey().defaultRandom(),
  trackerId:    uuid("tracker_id").notNull().references(() => keywordTrackers.id, { onDelete: "cascade" }),
  rank:         integer("rank"),           // NULL = 300위 밖
  totalResults: integer("total_results"),
  checkedAt:    timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export type KeywordRanking = typeof keywordRankings.$inferSelect;

export const salesTargets = pgTable("sales_targets", {
  id:           uuid("id").primaryKey().defaultRandom(),
  team:         text("team").notNull(),
  year:         integer("year").notNull(),
  annualTarget: integer("annual_target").notNull().default(0),
  criteria:     text("criteria").notNull().default("캠페인 시작날짜"), // 공급가 | 캠페인 시작날짜 | 계산서날짜
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type SalesTarget = typeof salesTargets.$inferSelect;

export const annualCosts = pgTable("annual_costs", {
  id:        uuid("id").primaryKey().defaultRandom(),
  year:      integer("year").notNull(),
  month:     integer("month").notNull(),
  category:  text("category").notNull(),
  item:      text("item").notNull(),
  amount:    integer("amount").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type AnnualCost = typeof annualCosts.$inferSelect;

export const products = pgTable("products", {
  id:                uuid("id").primaryKey().defaultRandom(),
  category:          text("category").notNull(),
  rowNum:            integer("row_num"),
  name:              text("name").notNull(),
  vendor:            text("vendor"),
  vendorBankAccount: text("vendor_bank_account"),
  costPrice:         integer("cost_price"),
  salePrice:         integer("sale_price"),
  notes:             text("notes"),
  createdAt:         timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:         timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Product = typeof products.$inferSelect;

export const workJournals = pgTable("work_journals", {
  id:           uuid("id").primaryKey().defaultRandom(),
  date:         date("date").notNull(),
  title:        text("title").notNull(),
  content:      text("content").notNull().default(""),
  authorName:   text("author_name").notNull(),
  assignedTeam: text("assigned_team"),
  clientId:     uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  projectId:    uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  createdAt:    timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:    timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WorkJournal = typeof workJournals.$inferSelect;
export type NewWorkJournal = typeof workJournals.$inferInsert;

export const meetingNotes = pgTable("meeting_notes", {
  id:               uuid("id").primaryKey().defaultRandom(),
  date:             date("date").notNull(),
  title:            text("title").notNull(),
  content:          text("content").notNull().default(""),
  meetingType:      text("meeting_type").notNull().default("회의록"),
  attendees:        text("attendees"),
  location:         text("location"),
  authorName:       text("author_name").notNull(),
  assignedTeam:     text("assigned_team"),
  clientId:         uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  projectId:        uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
  proposalFileUrl:  text("proposal_file_url"),
  proposalFileName: text("proposal_file_name"),
  createdAt:        timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:        timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MeetingNote = typeof meetingNotes.$inferSelect;
export type NewMeetingNote = typeof meetingNotes.$inferInsert;

export const chatChannels = pgTable("chat_channels", {
  id:          uuid("id").primaryKey().defaultRandom(),
  name:        text("name").notNull(),
  description: text("description"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChatChannel = typeof chatChannels.$inferSelect;

export const chatMessages = pgTable("chat_messages", {
  id:          uuid("id").primaryKey().defaultRandom(),
  channelId:   uuid("channel_id").notNull().references(() => chatChannels.id, { onDelete: "cascade" }),
  authorName:  text("author_name").notNull(),
  authorTeam:  text("author_team"),
  content:     text("content").notNull(),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChatMessage = typeof chatMessages.$inferSelect;

export const monthlyRevenues = pgTable("monthly_revenues", {
  id:          uuid("id").primaryKey().defaultRandom(),
  year:        integer("year").notNull(),
  month:       integer("month").notNull(),
  assignee:    text("assignee"),
  entryDate:   date("entry_date"),
  clientName:  text("client_name"),
  productName: text("product_name"),
  quantity:    integer("quantity"),
  supplyPrice: integer("supply_price").notNull().default(0),
  tax:         integer("tax").notNull().default(0),
  total:       integer("total").notNull().default(0),
  invoiceDate: date("invoice_date"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notices = pgTable("notices", {
  id:         uuid("id").primaryKey().defaultRandom(),
  title:      text("title").notNull(),
  content:    text("content").notNull().default(""),
  isPinned:   boolean("is_pinned").notNull().default(false),
  isActive:   boolean("is_active").notNull().default(true),
  priority:   integer("priority").notNull().default(0),
  authorName: text("author_name").notNull().default("관리자"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Notice = typeof notices.$inferSelect;
export type NewNotice = typeof notices.$inferInsert;

export const confirmRequests = pgTable("confirm_requests", {
  id:                   uuid("id").primaryKey().defaultRandom(),
  projectId:            text("project_id"),
  rowKey:               text("row_key"),
  clientId:             text("client_id"),
  assignedTeam:         text("assigned_team"),
  projectName:          text("project_name").notNull().default(""),
  requester:            text("requester").notNull().default(""),
  productName:          text("product_name").notNull().default(""),
  description:          text("description"),
  quantity:             text("quantity"),
  amount:               text("amount"),
  workStartDate:        text("work_start_date"),
  workEndDate:          text("work_end_date"),
  clientName:           text("client_name"),
  clientBusinessNumber: text("client_business_number"),
  clientEmail:          text("client_email"),
  clientIndustry:       text("client_industry"),
  clientCategory:       text("client_category"),
  dueDate:              text("due_date"),
  depositAccount:       text("deposit_account"),
  depositorName:        text("depositor_name"),
  requestedAt:          text("requested_at").notNull(),
  status:               text("status").notNull().default("대기"),
  taxInvoiceDate:       text("tax_invoice_date"),
  rejectReason:         text("reject_reason"),
  createdAt:            timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const paymentRequests = pgTable("payment_requests", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  projectId:          text("project_id"),
  rowKey:             text("row_key"),
  assignedTeam:       text("assigned_team"),
  projectName:        text("project_name").notNull().default(""),
  requester:          text("requester").notNull().default(""),
  productName:        text("product_name").notNull().default(""),
  vendor:             text("vendor").notNull().default(""),
  quantity:           text("quantity"),
  amount:             text("amount"),
  payDate:            text("pay_date"),
  workStartDate:      text("work_start_date"),
  workEndDate:        text("work_end_date"),
  invoiceFileUrl:     text("invoice_file_url"),
  invoiceFileName:    text("invoice_file_name"),
  vendorBankAccount:  text("vendor_bank_account"),
  requestedAt:        text("requested_at").notNull(),
  status:             text("status").notNull().default("대기"),
  rejectReason:       text("reject_reason"),
  createdAt:          timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const productSections = pgTable("product_sections", {
  id:        uuid("id").primaryKey().defaultRandom(),
  name:      text("name").notNull(),
  tabType:   text("tab_type").notNull().default("purchase"),
  sortOrder: integer("sort_order").notNull().default(0),
  accent:    text("accent").notNull().default("#3182F6"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const reportMeetings = pgTable("report_meetings", {
  id:         uuid("id").primaryKey().defaultRandom(),
  year:       integer("year").notNull(),
  month:      integer("month").notNull(),
  week:       integer("week"),             // null = 월간, 1~5 = 주간
  team:       text("team").notNull().default("전체"),
  content:    text("content").notNull().default(""),
  authorName: text("author_name"),
  createdAt:  timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:  timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const monthlyCosts = pgTable("monthly_costs", {
  id:          uuid("id").primaryKey().defaultRandom(),
  year:        integer("year").notNull(),
  month:       integer("month").notNull(),
  assignee:    text("assignee"),
  entryDate:   date("entry_date"),
  vendor:      text("vendor"),
  productName: text("product_name"),
  quantity:    integer("quantity"),
  supplyPrice: integer("supply_price").notNull().default(0),
  tax:         integer("tax").notNull().default(0),
  total:       integer("total").notNull().default(0),
  invoiceDate: date("invoice_date"),
  createdAt:   timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const chatMentions = pgTable("chat_mentions", {
  id:            uuid("id").primaryKey().defaultRandom(),
  messageId:     uuid("message_id").notNull().references(() => chatMessages.id, { onDelete: "cascade" }),
  channelId:     uuid("channel_id").notNull().references(() => chatChannels.id, { onDelete: "cascade" }),
  mentionedName: text("mentioned_name").notNull(),
  fromName:      text("from_name").notNull(),
  preview:       text("preview").notNull(),
  isRead:        boolean("is_read").notNull().default(false),
  createdAt:     timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ChatMention = typeof chatMentions.$inferSelect;

export const kpiTargets = pgTable("kpi_targets", {
  id:     uuid("id").primaryKey().defaultRandom(),
  year:   integer("year").notNull(),
  month:  integer("month").notNull(),   // 1-12, 0 = 연간 목표
  team:   text("team").notNull(),       // 팀명 또는 "전체"
  target: integer("target").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type KpiTarget = typeof kpiTargets.$inferSelect;

export const userTodos = pgTable("user_todos", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  content:   text("content").notNull(),
  isDone:    boolean("is_done").notNull().default(false),
  priority:  text("priority").notNull().default("medium"), // low | medium | high
  dueDate:   date("due_date"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type UserTodo = typeof userTodos.$inferSelect;

export const workDailyLogs = pgTable("work_daily_logs", {
  id:        uuid("id").primaryKey().defaultRandom(),
  revenueId: uuid("revenue_id").notNull().references(() => projectRevenues.id, { onDelete: "cascade" }),
  date:      date("date").notNull(),
  qty:       integer("qty").notNull().default(0),
  note:      text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type WorkDailyLog = typeof workDailyLogs.$inferSelect;
