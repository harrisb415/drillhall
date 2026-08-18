import type { RequestHandler } from "express";
import { fromNodeHeaders } from "better-auth/node";
import type { Auth } from "../lib/auth";

export interface AuthedUser {
  id: string;
  email: string;
  name: string;
  /** "admin" unlocks user management. Absent/"user" for everyone else. */
  role: string | null;
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
        // Read from the session the server just resolved against the DB —
        // never from anything the client sent.
        role: (session.user as { role?: string | null }).role ?? null,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Gate for admin-only app routes. Mount *after* `requireAuth`, which is what
 * populates `req.user.role` from the freshly-resolved session.
 *
 * Better Auth's own admin endpoints (under /api/auth/admin/*) enforce this
 * themselves; this exists so first-party routes can be gated the same way,
 * and so the check lives server-side rather than relying on the client
 * having hidden a button.
 */
export function requireAdmin(): RequestHandler {
  return (req, res, next) => {
    if (req.user?.role !== "admin") {
      // 404 rather than 403: an admin surface shouldn't confirm its own
      // existence to someone who isn't one.
      res.status(404).json({ error: "Not found" });
      return;
    }
    next();
  };
}
