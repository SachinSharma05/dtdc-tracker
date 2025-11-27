import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";

// Load local SQLite file
const sqlite = new Database("data/pincode/pincodes.sqlite");

// Create Drizzle client
export const pinDB = drizzle(sqlite);
