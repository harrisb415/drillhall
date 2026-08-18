import { createAuthClient } from "better-auth/react";
import { adminClient } from "better-auth/client/plugins";

// Same-origin: dev goes through the Vite proxy, prod is served by Express itself.
// adminClient adds authClient.admin.* and puts `role` on the session user.
// It only shapes the client API — every one of those calls is still authorized
// server-side, so a non-admin calling them directly gets refused.
export const authClient = createAuthClient({
  plugins: [adminClient()],
});

/** True only for the admin role. Cosmetic gating; the server enforces for real. */
export function isAdmin(session: { user?: { role?: string | null } } | null | undefined): boolean {
  return session?.user?.role === "admin";
}
