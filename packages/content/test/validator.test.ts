import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CertPackSchema } from "../src/schema";
import { CONTENT_ROOT, listPackDirs, loadPackDir } from "../src/loader";

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

const SHIPPED_PACKS = ["aplus", "aplus-core2", "netplus", "secplus"];

describe("shipped content packs", () => {
  it("discovers every shipped pack", () => {
    const dirs = listPackDirs().map((d) => path.basename(d));
    for (const pack of SHIPPED_PACKS) expect(dirs).toContain(pack);
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

  it("every pack's domain weights sum to exactly 100", () => {
    for (const dir of SHIPPED_PACKS) {
      const pack = CertPackSchema.parse(loadPackDir(path.join(CONTENT_ROOT, dir)));
      const sum = pack.domains.reduce((s, d) => s + d.weight, 0);
      expect(sum, `${dir} domain weights summed to ${sum}`).toBe(100);
    }
  });

  it("every pack contains every PBQ type it has legitimate content for", () => {
    // aplus (Core 1) has no "terminal" (type-the-command) content: Core 1's
    // real objectives never test command-line syntax — that's Core 2's
    // domain (1.1, Microsoft command-line tools). A batch of Core 2 CLI
    // questions was previously misfiled into the Core 1 bank; removing them
    // correctly leaves Core 1 with zero terminal-type questions.
    const requiredTypes: Record<string, string[]> = {
      aplus: ["mc", "order", "match"],
      "aplus-core2": ["mc", "order", "match", "terminal"],
      netplus: ["mc", "order", "match", "terminal"],
      secplus: ["mc", "order", "match", "terminal"],
    };
    for (const dir of SHIPPED_PACKS) {
      const pack = CertPackSchema.parse(loadPackDir(path.join(CONTENT_ROOT, dir)));
      const types = new Set(pack.quiz.map((q) => q.type));
      for (const t of requiredTypes[dir]!) {
        expect(types.has(t as never), `${dir} missing ${t}`).toBe(true);
      }
    }
  });

  it("aplus (Core 1) has no out-of-scope command-line questions", () => {
    const pack = CertPackSchema.parse(loadPackDir(path.join(CONTENT_ROOT, "aplus")));
    expect(pack.quiz.some((q) => q.type === "terminal")).toBe(false);
  });
});

describe("validator catches deliberately broken packs", () => {
  it("rejects a domain with a missing weight", () => {
    const result = CertPackSchema.safeParse(loadPackDir(path.join(FIXTURES, "broken-missing-weight")));
    expect(result.success).toBe(false);
    if (!result.success) {
      const paths = result.error.issues.map((i) => i.path.join("."));
      // must fail on the weight specifically — not merely fail for some reason
      expect(paths.some((p) => p.includes("weight") || p.startsWith("domains"))).toBe(true);
    }
  });

  it("rejects a pack with no exam configuration", () => {
    const raw = loadPackDir(path.join(FIXTURES, "broken-bad-discriminant")) as Record<
      string,
      unknown
    >;
    const { exam: _dropped, ...withoutExam } = raw;
    const result = CertPackSchema.safeParse(withoutExam);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "exam")).toBe(true);
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
      exam: {
        questionCount: 90,
        minutes: 90,
        passingScaledScore: 675,
        passingRawPercent: 75,
      },
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
