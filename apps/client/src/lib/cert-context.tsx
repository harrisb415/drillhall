import { createContext, useContext, type ReactNode } from "react";
import type { CertDto } from "@comptia/shared-types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useCerts } from "./api";

const CertContext = createContext<CertDto | null>(null);

/** The active cert. Phase 2 adds a switcher; today it's the single loaded pack. */
export function useCert(): CertDto {
  const cert = useContext(CertContext);
  if (!cert) throw new Error("useCert must be used inside CertProvider");
  return cert;
}

export function CertProvider({ children }: { children: ReactNode }) {
  const { data, isPending, isError, refetch } = useCerts();

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (isError || !data || data.length === 0) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4">
        <p className="text-muted-foreground">Couldn't load certification data.</p>
        <Button onClick={() => refetch()}>Retry</Button>
      </div>
    );
  }
  return <CertContext.Provider value={data[0]!}>{children}</CertContext.Provider>;
}
