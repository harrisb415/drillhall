import { eq } from "drizzle-orm";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { user } from "../src/db/auth-schema";
import { createTestStack, signUp, type TestStack } from "./helpers";

/**
 * Promote out of band, exactly as the real deployment does it (there is no
 * in-app path to admin — that's the point of the gate).
 */
function promote(stack: TestStack, email: string) {
  stack.db.update(user).set({ role: "admin" }).where(eq(user.email, email)).run();
}

const LIST = "/api/auth/admin/list-users?limit=50";

describe("admin authorization", () => {
  it("refuses to list users for a signed-out visitor", async () => {
    const stack = createTestStack();
    const res = await request(stack.app).get(LIST);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.users).toBeUndefined();
  });

  it("refuses to list users for an ordinary signed-in user", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "plain@example.com" });

    const res = await request(stack.app).get(LIST).set("Cookie", cookie);
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.users).toBeUndefined();
  });

  it("lets an admin list users", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "boss@example.com" });
    await signUp(stack.app, { email: "member@example.com" });
    promote(stack, "boss@example.com");

    const res = await request(stack.app).get(LIST).set("Cookie", cookie);
    expect(res.status).toBe(200);
    const emails = (res.body.users as { email: string }[]).map((u) => u.email);
    expect(emails).toEqual(expect.arrayContaining(["boss@example.com", "member@example.com"]));
  });

  it("refuses privilege escalation: a normal user cannot make themselves admin", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "climber@example.com" });
    const me = stack.db.select().from(user).where(eq(user.email, "climber@example.com")).get()!;

    const res = await request(stack.app)
      .post("/api/auth/admin/set-role")
      .set("Cookie", cookie)
      .send({ userId: me.id, role: "admin" });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const after = stack.db.select().from(user).where(eq(user.id, me.id)).get()!;
    expect(after.role).not.toBe("admin");
  });

  it("refuses a normal user banning someone else", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "nosy@example.com" });
    await signUp(stack.app, { email: "victim@example.com" });
    const victim = stack.db.select().from(user).where(eq(user.email, "victim@example.com")).get()!;

    const res = await request(stack.app)
      .post("/api/auth/admin/ban-user")
      .set("Cookie", cookie)
      .send({ userId: victim.id });
    expect(res.status).toBeGreaterThanOrEqual(400);

    const after = stack.db.select().from(user).where(eq(user.id, victim.id)).get()!;
    expect(after.banned).toBeFalsy();
  });

  it("lets an admin ban, and the ban actually lands on the row", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "boss2@example.com" });
    await signUp(stack.app, { email: "spammer@example.com" });
    promote(stack, "boss2@example.com");
    const target = stack.db.select().from(user).where(eq(user.email, "spammer@example.com")).get()!;

    const res = await request(stack.app)
      .post("/api/auth/admin/ban-user")
      .set("Cookie", cookie)
      .send({ userId: target.id, banReason: "spam" });
    expect(res.status).toBe(200);

    const after = stack.db.select().from(user).where(eq(user.id, target.id)).get()!;
    expect(after.banned).toBe(true);
    expect(after.banReason).toBe("spam");
  });

  it("stops a banned user from signing in", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app, { email: "boss3@example.com" });
    await signUp(stack.app, { email: "banned@example.com", password: "correct-horse-battery" });
    promote(stack, "boss3@example.com");
    const target = stack.db.select().from(user).where(eq(user.email, "banned@example.com")).get()!;

    await request(stack.app)
      .post("/api/auth/admin/ban-user")
      .set("Cookie", cookie)
      .send({ userId: target.id });

    const signIn = await request(stack.app)
      .post("/api/auth/sign-in/email")
      .send({ email: "banned@example.com", password: "correct-horse-battery" });
    expect(signIn.status).toBeGreaterThanOrEqual(400);
  });

  it("gives every new signup the plain user role", async () => {
    const stack = createTestStack();
    await signUp(stack.app, { email: "fresh@example.com" });
    const row = stack.db.select().from(user).where(eq(user.email, "fresh@example.com")).get()!;
    expect(row.role).not.toBe("admin");
  });
});
