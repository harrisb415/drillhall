import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CertPackSchema, type CertPack } from "./schema";

/** Root of the content package — cert pack folders live directly under it. */
export const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PART_FILES = ["domains", "flashcards", "quiz", "reference", "course"] as const;

/**
 * Reads one part of a pack. A part may be a single `<name>.json` array, a
 * `<name>/` folder of JSON arrays, or both — the folder's files are sorted by
 * filename and concatenated after the single file.
 *
 * The folder form exists so a large question bank can live in reviewable
 * per-domain files instead of one unmergeable thousand-line array. Duplicate
 * ids across files are caught by the schema, not silently merged.
 */
function readPart(dir: string, part: string): unknown[] {
  const out: unknown[] = [];
  const single = path.join(dir, `${part}.json`);
  if (fs.existsSync(single)) {
    out.push(...(JSON.parse(fs.readFileSync(single, "utf8")) as unknown[]));
  }
  const folder = path.join(dir, part);
  if (fs.existsSync(folder) && fs.statSync(folder).isDirectory()) {
    const files = fs
      .readdirSync(folder)
      .filter((f) => f.endsWith(".json"))
      .sort();
    for (const file of files) {
      out.push(...(JSON.parse(fs.readFileSync(path.join(folder, file), "utf8")) as unknown[]));
    }
  }
  return out;
}

/** Reads a pack folder into one raw (unvalidated) object. */
export function loadPackDir(dir: string): unknown {
  const meta = JSON.parse(fs.readFileSync(path.join(dir, "cert.json"), "utf8"));
  const parts = Object.fromEntries(PART_FILES.map((p) => [p, readPart(dir, p)]));
  return { ...meta, ...parts };
}

/** Immediate subdirectories of `root` that contain a cert.json. */
export function listPackDirs(root: string = CONTENT_ROOT): string[] {
  return fs
    .readdirSync(root, { withFileTypes: true })
    .filter((e) => e.isDirectory() && fs.existsSync(path.join(root, e.name, "cert.json")))
    .map((e) => path.join(root, e.name))
    .sort();
}

export function loadAllPacks(root: string = CONTENT_ROOT): CertPack[] {
  return listPackDirs(root).map((dir) => CertPackSchema.parse(loadPackDir(dir)));
}
