import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestStack, signUp } from "./helpers";

describe("password reset flow", () => {
  it("emails a link that sets a new working password", async () => {
    const stack = createTestStack();
    await signUp(stack.app, { email: "forgot@example.com", password: "originalpass1" });
    stack.emails.length = 0; // drop the signup verification email

    const requested = await request(stack.app)
      .post("/api/auth/request-password-reset")
      .send({ email: "forgot@example.com", redirectTo: "http://localhost:3001/reset-password" });
    expect(requested.status).toBe(200);

    expect(stack.emails).toHaveLength(1);
    const mail = stack.emails[0]!;
    expect(mail.to).toBe("forgot@example.com");
    expect(mail.subject).toMatch(/reset/i);

    // Better Auth's link carries the token in the path: .../reset-password/<token>
    const url = mail.text.match(/https?:\/\/\S+/)![0]!;
    const token = new URL(url).pathname.split("/").pop()!;
    expect(token.length).toBeGreaterThan(10);

    const reset = await request(stack.app)
      .post("/api/auth/reset-password")
      .send({ newPassword: "brandnewpass2", token });
    expect(reset.status).toBe(200);

    const withNew = await request(stack.app)
      .post("/api/auth/sign-in/email")
      .send({ email: "forgot@example.com", password: "brandnewpass2" });
    expect(withNew.status).toBe(200);

    const withOld = await request(stack.app)
      .post("/api/auth/sign-in/email")
      .send({ email: "forgot@example.com", password: "originalpass1" });
    expect(withOld.status).toBeGreaterThanOrEqual(400);
  });

  it("rejects a reused token", async () => {
    const stack = createTestStack();
    await signUp(stack.app, { email: "reuse@example.com", password: "originalpass1" });
    stack.emails.length = 0;

    await request(stack.app)
      .post("/api/auth/request-password-reset")
      .send({ email: "reuse@example.com", redirectTo: "http://localhost:3001/reset-password" });
    const url = stack.emails[0]!.text.match(/https?:\/\/\S+/)![0]!;
    const token = new URL(url).pathname.split("/").pop()!;

    const first = await request(stack.app)
      .post("/api/auth/reset-password")
      .send({ newPassword: "firstchange11", token });
    expect(first.status).toBe(200);

    const second = await request(stack.app)
      .post("/api/auth/reset-password")
      .send({ newPassword: "secondchange22", token });
    expect(second.status).toBeGreaterThanOrEqual(400);
  });

  it("does not reveal whether an email is registered", async () => {
    const stack = createTestStack();
    await signUp(stack.app, { email: "known@example.com" });
    stack.emails.length = 0;

    const known = await request(stack.app)
      .post("/api/auth/request-password-reset")
      .send({ email: "known@example.com", redirectTo: "http://localhost:3001/reset-password" });
    const unknown = await request(stack.app)
      .post("/api/auth/request-password-reset")
      .send({ email: "nobody@example.com", redirectTo: "http://localhost:3001/reset-password" });

    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
    // ...and no mail was actually sent for the address that doesn't exist
    expect(stack.emails.map((m) => m.to)).toEqual(["known@example.com"]);
  });
});
