import path from "node:path";
import { CertPackSchema } from "./schema";
import { listPackDirs, loadPackDir } from "./loader";

const dirs = listPackDirs();
if (dirs.length === 0) {
  console.error("No content packs found.");
  process.exit(1);
}

let failed = false;
for (const dir of dirs) {
  const name = path.basename(dir);
  let raw: unknown;
  try {
    raw = loadPackDir(dir);
  } catch (err) {
    failed = true;
    console.error(`✗ ${name}: could not read pack files — ${(err as Error).message}`);
    continue;
  }
  const result = CertPackSchema.safeParse(raw);
  if (result.success) {
    const p = result.data;
    console.log(
      `✓ ${name} (${p.code} ${p.version}): ${p.domains.length} domains, ` +
        `${p.flashcards.length} flashcards, ${p.quiz.length} questions, ${p.reference.length} reference groups`,
    );
  } else {
    failed = true;
    console.error(`✗ ${name}: ${result.error.issues.length} issue(s)`);
    for (const issue of result.error.issues) {
      console.error(`    ${issue.path.join(".")}: ${issue.message}`);
    }
  }
}

if (failed) process.exit(1);
console.log("All content packs valid.");
