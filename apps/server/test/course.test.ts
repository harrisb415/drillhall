import request from "supertest";
import { describe, expect, it } from "vitest";
import { createTestStack, signUp } from "./helpers";

describe("course", () => {
  it("returns lessons and an empty progress map for a fresh user", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    const res = await request(stack.app)
      .get(`/api/certs/${stack.certId}/course`)
      .set("Cookie", cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.lessons)).toBe(true);
    expect(res.body.progress).toEqual({});
  });

  it("404s completing a lesson that doesn't exist in the pack", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    const res = await request(stack.app)
      .post("/api/course/progress")
      .set("Cookie", cookie)
      .send({ certId: stack.certId, lessonId: "no-such-lesson" });
    expect(res.status).toBe(404);
  });

  it("404s for an unknown cert", async () => {
    const stack = createTestStack();
    const { cookie } = await signUp(stack.app);

    const res = await request(stack.app)
      .get("/api/certs/999999/course")
      .set("Cookie", cookie);
    expect(res.status).toBe(404);
  });

  it("requires auth", async () => {
    const stack = createTestStack();
    const res = await request(stack.app).get(`/api/certs/${stack.certId}/course`);
    expect(res.status).toBe(401);
  });
});
