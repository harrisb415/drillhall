import { Router } from "express";
import type { ReferenceResponse } from "@comptia/shared-types";
import { h } from "../../lib/handler";
import { resolveCert, type ApiDeps } from "../shared";

export function referenceRoutes(deps: ApiDeps): Router {
  const router = Router();

  router.get(
    "/certs/:certId/reference",
    h((req, res) => {
      const resolved = resolveCert(deps, req, res);
      if (!resolved) return;
      const response: ReferenceResponse = { groups: resolved.pack.reference };
      res.json(response);
    }),
  );

  return router;
}
