import { and, eq } from "drizzle-orm";
import type { CertPack, QuizQuestion } from "@comptia/content";
import type { Db } from "../../db";
import { certDomains, certs } from "../../db/schema";

/** Validated packs joined to their DB cert rows. The engines only ever see this. */
export interface ContentIndex {
  packs: CertPack[];
  byCertId: Map<number, CertPack>;
  certIdByCode: Map<string, number>;
  questionsByCertId: Map<number, Map<string, QuizQuestion>>;
}

/**
 * Upserts certs + domains from the content packs into the DB (ids are stable
 * across restarts because rows are matched by code) and builds the runtime index.
 */
export function seedCerts(db: Db, packs: CertPack[]): ContentIndex {
  const index: ContentIndex = {
    packs,
    byCertId: new Map(),
    certIdByCode: new Map(),
    questionsByCertId: new Map(),
  };

  for (const pack of packs) {
    const existing = db.select().from(certs).where(eq(certs.code, pack.code)).get();
    let certId: number;
    if (existing) {
      certId = existing.id;
      if (existing.name !== pack.name || existing.version !== pack.version) {
        db.update(certs).set({ name: pack.name, version: pack.version }).where(eq(certs.id, certId)).run();
      }
    } else {
      certId = db
        .insert(certs)
        .values({ code: pack.code, name: pack.name, version: pack.version })
        .returning()
        .get().id;
    }

    for (const domain of pack.domains) {
      const row = db
        .select()
        .from(certDomains)
        .where(and(eq(certDomains.certId, certId), eq(certDomains.code, domain.code)))
        .get();
      if (row) {
        if (row.name !== domain.name || row.weight !== domain.weight) {
          db.update(certDomains)
            .set({ name: domain.name, weight: domain.weight })
            .where(eq(certDomains.id, row.id))
            .run();
        }
      } else {
        db.insert(certDomains)
          .values({ certId, code: domain.code, name: domain.name, weight: domain.weight })
          .run();
      }
    }

    index.byCertId.set(certId, pack);
    index.certIdByCode.set(pack.code, certId);
    index.questionsByCertId.set(certId, new Map(pack.quiz.map((q) => [q.id, q])));
  }

  return index;
}
