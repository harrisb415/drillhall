import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin as adminPlugin } from "better-auth/plugins/admin";
import type { Db } from "../db";
import { account, session, user, verification } from "../db/auth-schema";
import type { SendEmail } from "../modules/notifications/providers/email";

export interface AuthDeps {
  db: Db;
  secret: string;
  baseURL: string;
  trustedOrigins?: string[];
  google?: { clientId: string; clientSecret: string } | null;
  sendEmail: SendEmail;
}

export function createAuth(deps: AuthDeps) {
  return betterAuth({
    appName: "Drillhall",
    secret: deps.secret,
    baseURL: deps.baseURL,
    trustedOrigins: deps.trustedOrigins ?? [],
    database: drizzleAdapter(deps.db, {
      provider: "sqlite",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      // Friends can use the app while unverified; the verification email still goes out.
      requireEmailVerification: false,
      sendResetPassword: async ({ user: u, url }) => {
        await deps.sendEmail({
          to: u.email,
          subject: "Reset your password — Drillhall",
          text: `Hi ${u.name},\n\nOpen this link to choose a new password:\n\n${url}\n\nThe link expires in an hour. If you didn't ask for a reset, ignore this message — your password stays unchanged.\n`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user: u, url }) => {
        await deps.sendEmail({
          to: u.email,
          subject: "Verify your email — Drillhall",
          text: `Hi ${u.name},\n\nConfirm your email address by opening this link:\n\n${url}\n\nIf you didn't create an account, ignore this message.\n`,
        });
      },
    },
    socialProviders: deps.google
      ? {
          google: {
            clientId: deps.google.clientId,
            clientSecret: deps.google.clientSecret,
          },
        }
      : {},
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    user: {
      // Hard-deletes the user row; every app table (quiz attempts, flashcard
      // progress, exam dates, notification prefs, gamification) cascades via
      // its userId foreign key, as does the linked Google account row — this
      // is how a user disconnects Google, since we can't reach into their
      // Google account from here, only drop what we stored about the link.
      deleteUser: { enabled: true },
    },
    plugins: [
      /**
       * User management, using the official plugin rather than hand-rolled
       * role checks. Authorization is exactly the code you don't want to
       * write yourself: the plugin already handles revoking a banned user's
       * live sessions, refusing to let an admin delete or demote themselves
       * into lockout, and keeping impersonation attributable.
       *
       * Everyone signs up as "user"; "admin" is granted out of band (see
       * scripts/grant-admin.mjs). Nothing in the app can self-promote —
       * that's the whole point of the gate.
       */
      adminPlugin({
        defaultRole: "user",
        adminRoles: ["admin"],
      }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
