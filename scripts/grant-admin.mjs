#!/usr/bin/env node
/**
 * Grant (or revoke) the admin role by email.
 *
 *   node scripts/grant-admin.mjs someone@example.com
 *   node scripts/grant-admin.mjs someone@example.com --revoke
 *
 * This exists because promotion to admin deliberately cannot happen inside the
 * app: if any signed-in user could reach an endpoint that makes them an admin,
 * the whole gate is decorative. The first admin therefore has to be set out of
 * band, by someone with shell access to the database. After that, an existing
 * admin can promote others from the Admin panel.
 *
 * Run from the repo root. Requires the app's own Node (nvm) so the native
 * better-sqlite3 binding matches.
 */
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3");

const [, , email, ...flags] = process.argv;
const revoke = flags.includes("--revoke");

if (!email) {
  console.error("Usage: node scripts/grant-admin.mjs <email> [--revoke]");
  process.exit(1);
}

const dbPath =
  process.env.DRILLHALL_DB ?? path.resolve("apps/server/data/app.db");

let db;
try {
  db = new Database(dbPath, { fileMustExist: true });
} catch (err) {
  console.error(`Could not open database at ${dbPath}`);
  console.error(String(err.message ?? err));
  process.exit(1);
}

const row = db.prepare("select id, email, name, role from user where email = ?").get(email);
if (!row) {
  console.error(`No account with email ${email}.`);
  console.error("They need to sign in at least once before they can be made an admin.");
  const all = db.prepare("select email from user order by email").all();
  if (all.length) console.error("\nKnown accounts:\n  " + all.map((r) => r.email).join("\n  "));
  process.exit(1);
}

const nextRole = revoke ? "user" : "admin";
if (row.role === nextRole) {
  console.log(`${email} is already "${nextRole}" — nothing to do.`);
  process.exit(0);
}

db.prepare("update user set role = ? where id = ?").run(nextRole, row.id);

const after = db.prepare("select email, role from user where id = ?").get(row.id);
console.log(`${after.email}: ${row.role ?? "(none)"} -> ${after.role}`);

// Being explicit here matters: an existing session was minted before the role
// changed, so it can carry the old value until it refreshes.
console.log("They may need to sign out and back in for the change to take effect.");
