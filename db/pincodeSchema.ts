import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export const indianPincodes = sqliteTable("indian_pincodes", {
  pincode: text("pincode").primaryKey(),
  office: text("office"),
  district: text("district"),
  state: text("state"),
  region: text("region"),
  division: text("division"),
});
