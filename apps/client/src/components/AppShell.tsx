import { useState, type ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CertBadge } from "@/components/ui/cert-badge";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { authClient, isAdmin } from "@/lib/auth-client";
import { useCertSwitcher } from "@/lib/cert-context";
import { cn } from "@/lib/utils";

function CertSelect({ className }: { className?: string }) {
  const { cert, certs, switchCert } = useCertSwitcher();
  if (certs.length <= 1) {
    return (
      <Badge variant="accent" className={className}>
        {cert.name} · {cert.version}
      </Badge>
    );
  }
  // A native <select> can't render SVG inside its options, so the badge sits
  // alongside and reflects the active cert rather than decorating each row.
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <CertBadge code={cert.code} size={26} />
      <select
        aria-label="Active certification"
        value={cert.code}
        onChange={(e) => switchCert(e.target.value)}
        className="min-w-0 flex-1 rounded-md border border-input bg-card px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {certs.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name} · {c.version}
          </option>
        ))}
      </select>
    </div>
  );
}

const NAV_ITEMS = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
        <path d="M3 12l9-9 9 9" />
        <path d="M5 10v10h5v-6h4v6h5V10" />
      </svg>
    ),
  },
  {
    to: "/course",
    label: "Course",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 4.5z" />
        <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
      </svg>
    ),
  },
  {
    to: "/flashcards",
    label: "Flashcards",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
        <rect x="3" y="6" width="14" height="12" rx="2" />
        <path d="M7 6V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
      </svg>
    ),
  },
  {
    to: "/quiz",
    label: "Quiz",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
        <circle cx="12" cy="12" r="9" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.4 2.33c-.65.26-.9.7-.9 1.42v.25" />
        <circle cx="12" cy="17" r="0.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    to: "/exam",
    label: "Exam",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2.5 2.5M9 2h6" />
      </svg>
    ),
  },
  {
    to: "/reference",
    label: "Reference",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 4.5z" />
        <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
      </svg>
    ),
  },
  {
    to: "/settings",
    label: "Settings",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6h.09A1.65 1.65 0 0 0 10 3.09V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

/** Appended only for admins. Hiding it is convenience; the server is the gate. */
const ADMIN_NAV_ITEM = {
  to: "/admin",
  label: "Admin",
  icon: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  ),
};

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const { data: session } = authClient.useSession();
  const items = isAdmin(session) ? [...NAV_ITEMS, ADMIN_NAV_ITEM] : NAV_ITEMS;
  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
            )
          }
        >
          {item.icon}
          {item.label}
        </NavLink>
      ))}
    </>
  );
}

function VerifyBanner({ email }: { email: string }) {
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  async function resend() {
    setState("sending");
    const { error } = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/dashboard",
    });
    setState(error ? "failed" : "sent");
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 border-b border-border bg-accent px-4 py-2 text-center text-xs text-accent-foreground">
      <span>A verification link was sent to {email} — check your inbox.</span>
      {state === "sent" ? (
        <span className="font-medium">Sent again.</span>
      ) : state === "failed" ? (
        <span className="font-medium">Couldn't resend — try later.</span>
      ) : (
        <button
          type="button"
          onClick={resend}
          disabled={state === "sending"}
          className="font-medium underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
        >
          {state === "sending" ? "Resending…" : "Resend"}
        </button>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = authClient.useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  async function handleSignOut() {
    await authClient.signOut();
    queryClient.clear();
    navigate("/login", { replace: true });
  }

  const unverified = session && !session.user.emailVerified;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 flex-col border-r border-border bg-card md:flex">
        <div className="border-b border-border p-5">
          <div className="text-lg font-semibold tracking-tight">Drillhall</div>
          <CertSelect className="mt-2" />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <NavItems />
        </nav>
        <div className="space-y-3 border-t border-border p-4">
          <ThemeToggle />
          <div>
            <div className="truncate text-sm font-medium">{session?.user.name}</div>
            <div className="truncate text-xs text-muted-foreground">{session?.user.email}</div>
          </div>
          <Button variant="outline" size="sm" className="w-full" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-border bg-card px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <div className="font-semibold">Drillhall</div>
          <div className="flex items-center gap-2">
            <ThemeToggle className="w-28" />
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              Sign out
            </Button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2 md:hidden">
          <NavItems />
        </nav>
        <div className="border-b border-border bg-card px-4 py-2 md:hidden">
          <CertSelect />
        </div>

        {unverified && <VerifyBanner email={session.user.email} />}

        <main className="mx-auto w-full max-w-5xl flex-1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
