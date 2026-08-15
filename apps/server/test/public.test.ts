import request from "supertest";
import { describe, expect, it } from "vitest";
import type { CatalogDto } from "@comptia/shared-types";
import { createTestStack } from "./helpers";

describe("public catalog (marketing homepage)", () => {
  it("serves cert counts without a session", async () => {
    const stack = createTestStack();
    const res = await request(stack.app).get("/api/catalog");
    expect(res.status).toBe(200);

    const catalog = res.body as CatalogDto;
    expect(catalog.certs).toHaveLength(2);
    expect(catalog.totals.certs).toBe(2);
    expect(catalog.totals.quizQuestions).toBe(
      catalog.certs.reduce((n, c) => n + c.quizQuestions, 0),
    );
    expect(catalog.totals.flashcards).toBeGreaterThan(0);

    const core1 = catalog.certs.find((c) => c.code === "aplus")!;
    expect(core1.version).toBe("220-1101");
    expect(core1.domains).toBe(5);
    expect(core1.questionTypes).toEqual(
      expect.arrayContaining(["mc", "order", "match", "terminal"]),
    );
  });

  it("leaks no question or flashcard content", async () => {
    const stack = createTestStack();
    const res = await request(stack.app).get("/api/catalog");
    const body = JSON.stringify(res.body);
    // counts only — nothing a signed-out visitor could study or scrape
    expect(body).not.toMatch(/answerIndex|explanation|expected|prompt|front|back/i);
  });

  it("still guards the authenticated cert endpoint", async () => {
    const stack = createTestStack();
    expect((await request(stack.app).get("/api/certs")).status).toBe(401);
  });
});
