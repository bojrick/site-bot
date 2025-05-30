"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.message_logs = exports.material_requests = exports.bookings = exports.activities = exports.sites = exports.sessions = exports.employee_otps = exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
// Users table for both employees and customers
exports.users = (0, pg_core_1.pgTable)("users", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    phone: (0, pg_core_1.varchar)("phone", { length: 20 }).notNull().unique(),
    role: (0, pg_core_1.text)("role", { enum: ["employee", "customer"] }).notNull(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }),
    email: (0, pg_core_1.varchar)("email", { length: 255 }),
    is_verified: (0, pg_core_1.boolean)("is_verified").default(false),
    verified_at: (0, pg_core_1.timestamp)("verified_at"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// OTP storage for employee verification
exports.employee_otps = (0, pg_core_1.pgTable)("employee_otps", {
    phone: (0, pg_core_1.varchar)("phone", { length: 20 }).primaryKey(),
    otp_hash: (0, pg_core_1.text)("otp_hash").notNull(),
    attempts: (0, pg_core_1.integer)("attempts").default(0),
    expires_at: (0, pg_core_1.timestamp)("expires_at").notNull(),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Session management for conversation state
exports.sessions = (0, pg_core_1.pgTable)("sessions", {
    phone: (0, pg_core_1.varchar)("phone", { length: 20 }).primaryKey(),
    intent: (0, pg_core_1.varchar)("intent", { length: 100 }),
    step: (0, pg_core_1.varchar)("step", { length: 100 }),
    data: (0, pg_core_1.jsonb)("data"),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Sites/Projects table - moved here to be referenced by activities and material_requests
exports.sites = (0, pg_core_1.pgTable)("sites", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    name: (0, pg_core_1.varchar)("name", { length: 255 }).notNull(),
    location: (0, pg_core_1.varchar)("location", { length: 500 }),
    status: (0, pg_core_1.text)("status", {
        enum: ["planning", "active", "completed", "on_hold"]
    }).default("planning"),
    manager_id: (0, pg_core_1.uuid)("manager_id").references(() => exports.users.id),
    image_url: (0, pg_core_1.text)("image_url"), // Site image/logo
    image_key: (0, pg_core_1.text)("image_key"), // R2 object key for management
    details: (0, pg_core_1.jsonb)("details"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Activity logging for employees
exports.activities = (0, pg_core_1.pgTable)("activities", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").references(() => exports.users.id),
    site_id: (0, pg_core_1.uuid)("site_id").references(() => exports.sites.id),
    activity_type: (0, pg_core_1.varchar)("activity_type", { length: 100 }),
    hours: (0, pg_core_1.integer)("hours"),
    description: (0, pg_core_1.text)("description"),
    image_url: (0, pg_core_1.text)("image_url"), // Cloudflare R2 public URL
    image_key: (0, pg_core_1.text)("image_key"), // R2 object key for management
    details: (0, pg_core_1.jsonb)("details"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Customer bookings
exports.bookings = (0, pg_core_1.pgTable)("bookings", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    customer_phone: (0, pg_core_1.varchar)("customer_phone", { length: 20 }),
    customer_name: (0, pg_core_1.varchar)("customer_name", { length: 255 }),
    slot_time: (0, pg_core_1.timestamp)("slot_time"),
    duration_minutes: (0, pg_core_1.integer)("duration_minutes").default(60),
    status: (0, pg_core_1.text)("status", {
        enum: ["pending", "confirmed", "completed", "cancelled"]
    }).default("pending"),
    notes: (0, pg_core_1.text)("notes"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
    updated_at: (0, pg_core_1.timestamp)("updated_at").defaultNow(),
});
// Material requests from employees
exports.material_requests = (0, pg_core_1.pgTable)("material_requests", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)("user_id").references(() => exports.users.id),
    material_name: (0, pg_core_1.varchar)("material_name", { length: 255 }),
    quantity: (0, pg_core_1.integer)("quantity"),
    unit: (0, pg_core_1.varchar)("unit", { length: 50 }),
    site_id: (0, pg_core_1.uuid)("site_id").references(() => exports.sites.id),
    requested_date: (0, pg_core_1.timestamp)("requested_date"),
    urgency: (0, pg_core_1.text)("urgency", { enum: ["low", "medium", "high"] }).default("medium"),
    status: (0, pg_core_1.text)("status", {
        enum: ["pending", "approved", "delivered", "cancelled"]
    }).default("pending"),
    image_url: (0, pg_core_1.text)("image_url"), // Cloudflare R2 public URL
    image_key: (0, pg_core_1.text)("image_key"), // R2 object key for management
    notes: (0, pg_core_1.text)("notes"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
// Message logs for audit trail
exports.message_logs = (0, pg_core_1.pgTable)("message_logs", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    phone: (0, pg_core_1.varchar)("phone", { length: 20 }),
    direction: (0, pg_core_1.text)("direction", { enum: ["inbound", "outbound"] }),
    message_type: (0, pg_core_1.varchar)("message_type", { length: 50 }),
    content: (0, pg_core_1.text)("content"),
    metadata: (0, pg_core_1.jsonb)("metadata"),
    created_at: (0, pg_core_1.timestamp)("created_at").defaultNow(),
});
//# sourceMappingURL=schema.js.map