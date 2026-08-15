import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CertPackSchema } from "../src/schema";
import { CONTENT_ROOT, listPackDirs, loadPackDir } from "../src/loader";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("shipped content packs", () => {
  it("discovers at least the aplus pack", () => {
    const dirs = listPackDirs().map((d) => path.basename(d));
    expect(dirs).toContain("aplus");
  });

  it("every shipped pack passes the schema", () => {
    for (const dir of listPackDirs(CONTENT_ROOT)) {
      const result = CertPackSchema.safeParse(loadPackDir(dir));
      expect(result.success, `${path.basename(dir)}: ${JSON.stringify(result.success ? [] : result.error.issues, null, 2)}`).toBe(true);
    }
  });

  it("aplus pack has substantive content", () => {
    const pack = CertPackSchema.parse(loadPackDir(path.join(CONTENT_ROOT, "aplus")));
    expect(pack.domains.length).toBe(5);
    expect(pack.flashcards.length).toBeGreaterThanOrEqual(30);
    expect(pack.quiz.length).toBeGreaterThanOrEqual(25);
    expect(pack.reference.length).toBeGreaterThanOrEqual(5);
  });
});

describe("validator catches deliberately broken packs", () => {
  it("rejects a domain with a missing weight", () => {
    const result = CertPackSchema.safeParse(loadPackDir(path.join(FIXTURES, "broken-missing-weight")));
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.includes("weight") || p.startsWith("domains"))).toBe(true);
    }
  });

  it("rejects a quiz question with an unknown type discriminant", () => {
    const result = CertPackSchema.safeParse(loadPackDir(path.join(FIXTURES, "broken-bad-discriminant")));
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      expect(paths.some((p) => p.startsWith("quiz"))).toBe(true);
    }
  });

  it("rejects an mc question whose answerIndex is out of range", () => {
    const raw = loadPackDir(path.join(FIXTURES, "broken-missing-weight")) as Record<string, unknown>;
    const fixed = {
      ...raw,
      domains: [{ code: "1.0", name: "D", weight: 100 }],
      quiz: [
        {
          id: "q1",
          type: "mc",
          domainCode: "1.0",
          prompt: "Pick",
          choices: ["A", "B"],
          answerIndex: 5,
          explanation: "out of range",
        },
      ],
    };
    const result = CertPackSchema.safeParse(fixed);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("out of range"))).toBe(true);
    }
  });
});
