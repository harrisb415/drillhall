import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import request from "supertest";
import { pino } from "pino";
import { afterEach, describe, expect, it } from "vitest";
import { pruneOldBackups, runBackup } from "../src/lib/backup";
import { createTestStack, signUp } from "./helpers";

const silent = pino({ level: "silent" });
const dirs: string[] = [];

function tmpDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "comptia-backup-"));
  dirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe("database snapshots", () => {
  it("produces a file that actually opens and holds the data", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "backup@example.com" });
    // put real work in the database so the snapshot has something to prove
    const start = await request(stack.app)
      .post("/api/quiz/sessions")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, count: 2, types: ["mc"] });
    for (const q of start.body.questions) {
      await request(stack.app)
        .post("/api/quiz/attempts")
        .set("Cookie", cookie)
        .send({ sessionId: start.body.sessionId, questionId: q.id, answer: { type: "mc", choiceIndex: 0 } });
    }

    const dir = tmpDir();
    const target = await runBackup({ sqlite: stack.sqlite, dir, retentionDays: 14, logger: silent });
    expect(fs.existsSync(target)).toBe(true);

    // A backup is only a backup if it restores. Open the snapshot as its own
    // database and confirm the rows are really in there.
    const restored = new Database(target, { readonly: true });
    const users = restored.prepare("select email from user").all() as { email: string }[];
    const attempts = restored.prepare("select count(*) as c from quiz_attempts").get() as { c: number };
    restored.close();

    expect(users.map((u) => u.email)).toContain("backup@example.com");
    expect(attempts.c).toBe(2);
  });

  it("keeps snapshots inside the retention window and prunes older ones", () => {
    const stack = createTestStack();
    const dir = tmpDir();

    const old = path.join(dir, "app-old.db");
    const recent = path.join(dir, "app-recent.db");
    fs.writeFileSync(old, "x");
    fs.writeFileSync(recent, "x");
    const longAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    fs.utimesSync(old, longAgo / 1000, longAgo / 1000);

    const removed = pruneOldBackups({
      sqlite: stack.sqlite,
      dir,
      retentionDays: 14,
      logger: silent,
    });
    expect(removed).toBe(1);
    expect(fs.existsSync(old)).toBe(false);
    expect(fs.existsSync(recent)).toBe(true);
  });

  it("never prunes the snapshot it just took, even with zero retention", async () => {
    const stack = createTestStack();
    const dir = tmpDir();
    // retentionDays: 0 would otherwise make everything immediately expired
    const target = await runBackup({ sqlite: stack.sqlite, dir, retentionDays: 0, logger: silent });
    expect(fs.existsSync(target)).toBe(true);
  });

  it("leaves unrelated files in the directory alone", () => {
    const stack = createTestStack();
    const dir = tmpDir();
    const notOurs = path.join(dir, "notes.txt");
    fs.writeFileSync(notOurs, "keep me");
    const longAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    fs.utimesSync(notOurs, longAgo / 1000, longAgo / 1000);

    pruneOldBackups({ sqlite: stack.sqlite, dir, retentionDays: 1, logger: silent });
    expect(fs.existsSync(notOurs)).toBe(true);
  });
});
