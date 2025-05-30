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

// Users table for both employees and customers
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  phone: varchar("phone", { length: 20 }).notNull().unique(),
  role: text("role", { enum: ["employee", "customer"] }).notNull(),
  name: varchar("name", { length: 255 }),
  email: varchar("email", { length: 255 }),
  is_verified: boolean("is_verified").default(false),
  verified_at: timestamp("verified_at"),
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
  manager_id: uuid("manager_id").references(() => users.id),
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