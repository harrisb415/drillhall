// Used only by `npx @better-auth/cli generate` to introspect the auth config
// and emit the canonical auth table schema. Not imported by the app.
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema";
import { createAuth } from "./auth";

const db = drizzle(new Database(":memory:"), { schema });

export const auth = createAuth({
  db,
  secret: "cli-introspection-only-secret-not-used",
  baseURL: "http://localhost:3001",
  google: { clientId: "cli-introspection", clientSecret: "cli-introspection" },
  sendEmail: async () => {},
});
