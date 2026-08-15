import { Router } from "express";
import { asc, eq } from "drizzle-orm";
import type { CertDto } from "@comptia/shared-types";
import { certDomains, certs } from "../../db/schema";
import { h } from "../../lib/handler";
import type { ApiDeps } from "../shared";

export function certsRoutes(deps: ApiDeps): Router {
  const router = Router();

  router.get(
    "/certs",
    h((_req, res) => {
      const rows = deps.db.select().from(certs).orderBy(asc(certs.code)).all();
      const result: CertDto[] = rows.map((cert) => {
        const pack = deps.content.byCertId.get(cert.id);
        const domains = deps.db
          .select()
          .from(certDomains)
          .where(eq(certDomains.certId, cert.id))
          .orderBy(asc(certDomains.code))
          .all();
        return {
          id: cert.id,
          code: cert.code,
          name: cert.name,
          version: cert.version,
          domains: domains.map((d) => ({ code: d.code, name: d.name, weight: d.weight })),
          counts: {
            flashcards: pack?.flashcards.length ?? 0,
            quizQuestions: pack?.quiz.length ?? 0,
            referenceGroups: pack?.reference.length ?? 0,
          },
        };
      });
      res.json(result);
    }),
  );

  return router;
}
