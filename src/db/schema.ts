import { 
  pgTable, 
  uuid, 
  text, 
  boolean, 
  timestamp, 
  jsonb,
  varchar,
  integer 
} from "drizzle-orm/pg-core";

// Users table for employees, customers, and admins
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  role: text("role", { enum: ["employee", "customer", "admin"] }).notNull(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  is_verified: boolean("is_verified").default(false),
  verified_at: timestamp("verified_at"),
  introduction_sent: boolean("introduction_sent").default(false),
  introduction_sent_at: timestamp("introduction_sent_at"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// OTP storage for employee verification
export const employee_otps = pgTable("employee_otps", {
  phone: varchar("phone", { length: 20 }).primaryKey(),
  otp_hash: text("otp_hash").notNull(),
  attempts: integer("attempts").default(0),
  expires_at: timestamp("expires_at").notNull(),
  created_at: timestamp("created_at").defaultNow(),
});

// Session management for conversation state
export const sessions = pgTable("sessions", {
  phone: varchar("phone", { length: 20 }).primaryKey(),
  intent: varchar("intent", { length: 100 }),
  step: varchar("step", { length: 100 }),
  data: jsonb("data"),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Sites/Projects table - moved here to be referenced by activities and material_requests
export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  location: varchar("location", { length: 500 }),
  status: text("status", { 
    enum: ["planning", "active", "completed", "on_hold"] 
  }).default("planning"),
  image_url: text("image_url"), // Site image/logo
  image_key: text("image_key"), // R2 object key for management
  details: jsonb("details"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Activity logging for employees
export const activities = pgTable("activities", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").references(() => users.id),
  site_id: uuid("site_id").references(() => sites.id),
  activity_type: varchar("activity_type", { length: 100 }),
  hours: integer("hours"),
  description: text("description"),
  image_url: text("image_url"), // Cloudflare R2 public URL
  image_key: text("image_key"), // R2 object key for management
  details: jsonb("details"),
  created_at: timestamp("created_at").defaultNow(),
});

// Customer bookings
export const bookings = pgTable("bookings", {
  id: uuid("id").primaryKey().defaultRandom(),
  customer_phone: varchar("customer_phone", { length: 20 }),
  customer_name: varchar("customer_name", { length: 255 }),
  slot_time: timestamp("slot_time"),
  duration_minutes: integer("duration_minutes").default(60),
  status: text("status", { 
    enum: ["pending", "confirmed", "completed", "cancelled"] 
  }).default("pending"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Material requests from employees
export const material_requests = pgTable("material_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").references(() => users.id),
  material_name: varchar("material_name", { length: 255 }),
  quantity: integer("quantity"),
  unit: varchar("unit", { length: 50 }),
  site_id: uuid("site_id").references(() => sites.id),
  requested_date: timestamp("requested_date"),
  urgency: text("urgency", { enum: ["low", "medium", "high"] }).default("medium"),
  status: text("status", { 
    enum: ["pending", "approved", "delivered", "cancelled"] 
  }).default("pending"),
  image_url: text("image_url"), // Cloudflare R2 public URL
  image_key: text("image_key"), // R2 object key for management
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
});

// Invoice tracking for received invoices
export const invoices = pgTable("invoices", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").references(() => users.id),
  company_name: varchar("company_name", { length: 255 }).notNull(),
  invoice_description: text("invoice_description").notNull(),
  invoice_date: timestamp("invoice_date").notNull(),
  amount: integer("amount").notNull(), // Amount in paise/cents for precision
  currency: varchar("currency", { length: 3 }).default("INR"),
  site_id: uuid("site_id").references(() => sites.id),
  status: text("status", { 
    enum: ["received", "processing", "approved", "paid", "rejected"] 
  }).default("received"),
  image_url: text("image_url"), // Cloudflare R2 public URL of invoice image
  image_key: text("image_key"), // R2 object key for management
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Message logs for audit trail
export const message_logs = pgTable("message_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: varchar("phone", { length: 20 }),
  direction: text("direction", { enum: ["inbound", "outbound"] }),
  message_type: varchar("message_type", { length: 50 }),
  content: text("content"),
  metadata: jsonb("metadata"),
  created_at: timestamp("created_at").defaultNow(),
});

// Customer inquiries for detailed lead capture
export const customer_inquiries = pgTable("customer_inquiries", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: varchar("phone", { length: 20 }).notNull(),
  full_name: varchar("full_name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  occupation: varchar("occupation", { length: 255 }),
  office_space_requirement: text("office_space_requirement"),
  office_space_use: text("office_space_use"),
  expected_price_range: varchar("expected_price_range", { length: 100 }),
  status: text("status", { 
    enum: ["inquiry", "site_visit_booked", "converted", "lost"] 
  }).default("inquiry"),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Inventory items master table
export const inventory_items = pgTable("inventory_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  unit: varchar("unit", { length: 50 }).notNull(), // kg, pcs, bags, etc.
  category: varchar("category", { length: 100 }), // building_material, contractor_materials, electrical_materials
  status: text("status", { enum: ["active", "inactive"] }).default("active"),
  created_by: uuid("created_by").references(() => users.id),
  // Gujarati language support columns
  gujarati_name: varchar("gujarati_name", { length: 255 }),
  gujarati_unit: varchar("gujarati_unit", { length: 50 }),
  gujarati_category: varchar("gujarati_category", { length: 100 }),
  item_code: varchar("item_code", { length: 50 }), // Optional item code for reference
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Inventory transactions for in/out tracking
export const inventory_transactions = pgTable("inventory_transactions", {
  id: uuid("id").primaryKey().defaultRandom(),
  item_id: uuid("item_id").references(() => inventory_items.id).notNull(),
  site_id: uuid("site_id").references(() => sites.id),
  transaction_type: text("transaction_type", { enum: ["in", "out"] }).notNull(),
  quantity: integer("quantity").notNull(),
  previous_stock: integer("previous_stock").notNull(),
  new_stock: integer("new_stock").notNull(),
  notes: text("notes"),
  // Image support for Gujarati flow (mandatory image uploads)
  image_url: text("image_url"), // Cloudflare R2 public URL
  image_key: text("image_key"), // R2 object key for management
  created_by: uuid("created_by").references(() => users.id),
  created_at: timestamp("created_at").defaultNow(),
});

// User site assignments for employee access control
export const user_site_assignments = pgTable("user_site_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").references(() => users.id).notNull(),
  site_id: uuid("site_id").references(() => sites.id).notNull(),
  role: text("role", { enum: ["manager", "supervisor", "worker", "admin"] }).default("worker"),
  permissions: jsonb("permissions").default([]), // Array of permission strings
  status: text("status", { enum: ["active", "inactive", "suspended"] }).default("active"),
  assigned_by: uuid("assigned_by").references(() => users.id),
  notes: text("notes"),
  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow(),
});

// Export types for TypeScript
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Site = typeof sites.$inferSelect;
export type NewSite = typeof sites.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type MaterialRequest = typeof material_requests.$inferSelect;
export type NewMaterialRequest = typeof material_requests.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type CustomerInquiry = typeof customer_inquiries.$inferSelect;
export type NewCustomerInquiry = typeof customer_inquiries.$inferInsert;
export type InventoryItem = typeof inventory_items.$inferSelect;
export type NewInventoryItem = typeof inventory_items.$inferInsert;
export type InventoryTransaction = typeof inventory_transactions.$inferSelect;
export type NewInventoryTransaction = typeof inventory_transactions.$inferInsert;
export type UserSiteAssignment = typeof user_site_assignments.$inferSelect;
export type NewUserSiteAssignment = typeof user_site_assignments.$inferInsert; 