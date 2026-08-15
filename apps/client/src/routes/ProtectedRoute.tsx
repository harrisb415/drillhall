import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { AppShell } from "@/components/AppShell";
import { Spinner } from "@/components/ui/spinner";
import { captureTimezone } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { CertProvider } from "@/lib/cert-context";

export function ProtectedLayout() {
  const { data: session, isPending } = authClient.useSession();
  const location = useLocation();
  const signedIn = !!session;

  useEffect(() => {
    if (signedIn) captureTimezone();
  }, [signedIn]);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (!session) {
    // Hand the login page where we were headed so it can return there.
    return (
      <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
    );
  }

  return (
    <CertProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </CertProvider>
  );
}
