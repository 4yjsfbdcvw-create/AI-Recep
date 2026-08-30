import {
  bigint,
  boolean,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const tenants = mysqlTable(
  "tenants",
  {
    id: int("id").autoincrement().primaryKey(),
    ownerUserId: int("ownerUserId").references(() => users.id, { onDelete: "set null" }),
    name: varchar("name", { length: 160 }).notNull(),
    slug: varchar("slug", { length: 80 }).notNull(),
    timezone: varchar("timezone", { length: 80 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 320 }),
    address: text("address"),
    parkingInstructions: text("parkingInstructions"),
    greeting: text("greeting").notNull(),
    bookingWindowDays: int("bookingWindowDays").default(60).notNull(),
    cancellationHours: int("cancellationHours").default(24).notNull(),
    slotIntervalMinutes: int("slotIntervalMinutes").default(15).notNull(),
    voiceProvider: varchar("voiceProvider", { length: 80 }).default("browser").notNull(),
    llmProvider: varchar("llmProvider", { length: 80 }).default("built-in").notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [uniqueIndex("tenants_slug_unique").on(table.slug)],
);

export const tenantMembers = mysqlTable(
  "tenant_members",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    userId: int("userId").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("tenantRole", ["owner", "manager", "receptionist"]).default("receptionist").notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  },
  table => [uniqueIndex("tenant_member_unique").on(table.tenantId, table.userId)],
);

export const services = mysqlTable(
  "services",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    description: text("description"),
    durationMinutes: int("durationMinutes").notNull(),
    priceMinor: int("priceMinor").notNull(),
    currency: varchar("currency", { length: 3 }).default("GBP").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [index("services_tenant_idx").on(table.tenantId)],
);

export const businessHours = mysqlTable(
  "business_hours",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    dayOfWeek: int("dayOfWeek").notNull(),
    isOpen: boolean("isOpen").default(true).notNull(),
    openTime: varchar("openTime", { length: 5 }),
    closeTime: varchar("closeTime", { length: 5 }),
  },
  table => [uniqueIndex("business_hours_day_unique").on(table.tenantId, table.dayOfWeek)],
);

export const knowledgeItems = mysqlTable(
  "knowledge_items",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    category: mysqlEnum("knowledgeCategory", ["hours", "services", "pricing", "location", "parking", "policy", "faq"]).notNull(),
    title: varchar("title", { length: 180 }).notNull(),
    content: text("content").notNull(),
    keywords: text("keywords"),
    active: boolean("active").default(true).notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [index("knowledge_tenant_category_idx").on(table.tenantId, table.category)],
);

export const customers = mysqlTable(
  "customers",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 160 }).notNull(),
    phone: varchar("phone", { length: 40 }),
    email: varchar("email", { length: 320 }),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [index("customers_tenant_phone_idx").on(table.tenantId, table.phone)],
);

export const appointments = mysqlTable(
  "appointments",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    customerId: int("customerId").notNull().references(() => customers.id, { onDelete: "restrict" }),
    serviceId: int("serviceId").notNull().references(() => services.id, { onDelete: "restrict" }),
    reference: varchar("reference", { length: 24 }).notNull(),
    startAt: bigint("startAt", { mode: "number" }).notNull(),
    endAt: bigint("endAt", { mode: "number" }).notNull(),
    status: mysqlEnum("appointmentStatus", ["confirmed", "cancelled", "completed", "no_show"]).default("confirmed").notNull(),
    notes: text("notes"),
    source: mysqlEnum("appointmentSource", ["ai_receptionist", "staff", "import"]).default("ai_receptionist").notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    uniqueIndex("appointments_reference_unique").on(table.reference),
    index("appointments_tenant_start_idx").on(table.tenantId, table.startAt),
  ],
);

export const availabilitySlots = mysqlTable(
  "availability_slots",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    serviceId: int("serviceId").notNull().references(() => services.id, { onDelete: "cascade" }),
    startAt: bigint("startAt", { mode: "number" }).notNull(),
    endAt: bigint("endAt", { mode: "number" }).notNull(),
    capacity: int("capacity").default(1).notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    source: mysqlEnum("availabilitySource", ["internal_schedule", "calendar_adapter"]).default("internal_schedule").notNull(),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    uniqueIndex("availability_tenant_service_start_unique").on(table.tenantId, table.serviceId, table.startAt),
    index("availability_tenant_time_idx").on(table.tenantId, table.startAt),
  ],
);

export const calls = mysqlTable(
  "calls",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    externalId: varchar("externalId", { length: 40 }).notNull(),
    channel: mysqlEnum("callChannel", ["browser", "telephone"]).default("browser").notNull(),
    status: mysqlEnum("callStatus", ["active", "completed", "transferred", "abandoned"]).default("active").notNull(),
    state: varchar("state", { length: 64 }).default("GREETING").notNull(),
    intent: varchar("intent", { length: 64 }),
    confidence: int("confidence"),
    callerName: varchar("callerName", { length: 160 }),
    callerPhone: varchar("callerPhone", { length: 40 }),
    summary: text("summary"),
    context: json("context"),
    appointmentId: int("appointmentId").references(() => appointments.id, { onDelete: "set null" }),
    escalated: boolean("escalated").default(false).notNull(),
    escalationReason: text("escalationReason"),
    startedAt: bigint("startedAt", { mode: "number" }).notNull(),
    endedAt: bigint("endedAt", { mode: "number" }),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [
    uniqueIndex("calls_external_id_unique").on(table.externalId),
    index("calls_tenant_started_idx").on(table.tenantId, table.startedAt),
  ],
);

export const callMessages = mysqlTable(
  "call_messages",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    callId: int("callId").notNull().references(() => calls.id, { onDelete: "cascade" }),
    speaker: mysqlEnum("messageSpeaker", ["customer", "agent", "system"]).notNull(),
    body: text("body").notNull(),
    metadata: json("metadata"),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  },
  table => [index("call_messages_call_idx").on(table.callId, table.createdAt)],
);

export const toolEvents = mysqlTable(
  "tool_events",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    callId: int("callId").notNull().references(() => calls.id, { onDelete: "cascade" }),
    toolName: varchar("toolName", { length: 80 }).notNull(),
    status: mysqlEnum("toolStatus", ["success", "failure", "blocked"]).notNull(),
    input: json("input"),
    output: json("output"),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
  },
  table => [index("tool_events_call_idx").on(table.callId, table.createdAt)],
);

export const confirmations = mysqlTable(
  "confirmations",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    appointmentId: int("appointmentId").notNull().references(() => appointments.id, { onDelete: "cascade" }),
    channel: mysqlEnum("confirmationChannel", ["in_app", "email", "sms"]).default("in_app").notNull(),
    recipient: varchar("recipient", { length: 320 }),
    status: mysqlEnum("confirmationStatus", ["queued", "sent", "failed"]).default("queued").notNull(),
    body: text("body").notNull(),
    providerMessageId: varchar("providerMessageId", { length: 160 }),
    createdAt: bigint("createdAt", { mode: "number" }).notNull(),
    sentAt: bigint("sentAt", { mode: "number" }),
  },
  table => [index("confirmations_appointment_idx").on(table.appointmentId)],
);

export const integrationConfigs = mysqlTable(
  "integration_configs",
  {
    id: int("id").autoincrement().primaryKey(),
    tenantId: int("tenantId").notNull().references(() => tenants.id, { onDelete: "cascade" }),
    integrationType: mysqlEnum("integrationType", ["calendar", "telephony", "stt", "tts", "email", "sms", "crm"]).notNull(),
    provider: varchar("provider", { length: 80 }).notNull(),
    enabled: boolean("enabled").default(false).notNull(),
    config: json("config"),
    updatedAt: bigint("updatedAt", { mode: "number" }).notNull(),
  },
  table => [uniqueIndex("integration_tenant_type_unique").on(table.tenantId, table.integrationType)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Tenant = typeof tenants.$inferSelect;
export type Service = typeof services.$inferSelect;
export type Appointment = typeof appointments.$inferSelect;
export type AvailabilitySlot = typeof availabilitySlots.$inferSelect;
export type Call = typeof calls.$inferSelect;
export type CallMessage = typeof callMessages.$inferSelect;
