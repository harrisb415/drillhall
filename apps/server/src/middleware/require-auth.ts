import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "../lib/auth";

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

export function requireAuth(auth: Auth): RequestHandler {
  return async (req, res, next) => {
    try {
      const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
      if (!session) {
        res.status(401).json({ error: "Not signed in" });
        return;
      }
      req.user = {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}
