import { pgTable, serial, text, varchar, timestamp, uuid, date, time } from "drizzle-orm/pg-core";

// CONSIGNMENTS
export const consignments = pgTable("consignments", {
  id: uuid("id").defaultRandom().primaryKey(),
  awb: varchar("awb", { length: 20 }).notNull().unique(),
  lastStatus: text("last_status"),
  origin: text("origin"),
  destination: text("destination"),
  bookedOn: date("booked_on"),
  lastUpdatedOn: timestamp("last_updated_on"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// TRACKING EVENTS
export const trackingEvents = pgTable("tracking_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  consignmentId: uuid("consignment_id").references(() => consignments.id),
  action: text("action"),
  actionDate: date("action_date"),
  actionTime: time("action_time"),
  origin: text("origin"),
  destination: text("destination"),
  remarks: text("remarks"),
  createdAt: timestamp("created_at").defaultNow(),
});

// TRACKING HISTORY LOG
export const trackingHistory = pgTable("tracking_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  consignmentId: uuid("consignment_id").references(() => consignments.id),
  oldStatus: text("old_status"),
  newStatus: text("new_status"),
  changedAt: timestamp("changed_at").defaultNow(),
});
