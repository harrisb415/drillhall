import type { Request, Response } from "express";
import type { CertPack } from "@comptia/content";
import type { Db } from "../db";
import type { ContentIndex } from "./certs/content";

export interface ApiDeps {
  db: Db;
  content: ContentIndex;
}

/**
 * Resolves the :certId route param to a loaded content pack.
 * Writes the error response and returns null when it can't.
 */
export function resolveCert(
  deps: ApiDeps,
  req: Request,
  res: Response,
): { certId: number; pack: CertPack } | null {
  const certId = Number(req.params.certId);
  if (!Number.isInteger(certId)) {
    res.status(400).json({ error: "certId must be an integer" });
    return null;
  }
  const pack = deps.content.byCertId.get(certId);
  if (!pack) {
    res.status(404).json({ error: "Unknown cert" });
    return null;
  }
  return { certId, pack };
}
