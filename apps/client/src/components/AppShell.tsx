import type { ReactNode } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
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
  return (
    <select
      aria-label="Active certification"
      value={cert.code}
      onChange={(e) => switchCert(e.target.value)}
      className={cn(
        "w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {certs.map((c) => (
        <option key={c.code} value={c.code}>
          {c.name} · {c.version}
        </option>
      ))}
    </select>
  );
}

const NAV_ITEMS = [
  {
    to: "/",
    label: "Dashboard",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
        <path d="M3 12l9-9 9 9" />
        <path d="M5 10v10h5v-6h4v6h5V10" />
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
    to: "/reference",
    label: "Reference",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 4.5z" />
        <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
      </svg>
    ),
  },
];

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
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
          <div className="text-lg font-semibold tracking-tight">CompTIA Prep</div>
          <CertSelect className="mt-2" />
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto p-3">
          <NavItems />
        </nav>
        <div className="border-t border-border p-4">
          <div className="truncate text-sm font-medium">{session?.user.name}</div>
          <div className="truncate text-xs text-muted-foreground">{session?.user.email}</div>
          <Button variant="outline" size="sm" className="mt-3 w-full" onClick={handleSignOut}>
            Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
          <div className="font-semibold">CompTIA Prep</div>
          <Button variant="ghost" size="sm" onClick={handleSignOut}>
            Sign out
          </Button>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-border bg-card px-2 py-2 md:hidden">
          <NavItems />
        </nav>
        <div className="border-b border-border bg-card px-4 py-2 md:hidden">
          <CertSelect />
        </div>

        {unverified && (
          <div className="border-b border-border bg-accent px-4 py-2 text-center text-xs text-accent-foreground">
            A verification link was sent to {session.user.email} — check your inbox.
          </div>
        )}

        <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  );
}
