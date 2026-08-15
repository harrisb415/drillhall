import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CertPackSchema, type CertPack } from "./schema";

/** Root of the content package — cert pack folders live directly under it. */
export const CONTENT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const PART_FILES = ["domains", "flashcards", "quiz", "reference"] as const;

/** Reads a pack folder's five JSON files into one raw (unvalidated) object. */
export function loadPackDir(dir: string): unknown {
  const readJson = (file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
  const meta = readJson("cert.json");
  const parts = Object.fromEntries(PART_FILES.map((p) => [p, readJson(`${p}.json`)]));
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
