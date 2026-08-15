import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import type { CertDto } from "@comptia/shared-types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useQuizStore } from "@/stores/quiz";
import { useCerts } from "./api";

interface CertContextValue {
  cert: CertDto;
  certs: CertDto[];
  switchCert: (code: string) => void;
}

const CertContext = createContext<CertContextValue | null>(null);

function useCertContext(): CertContextValue {
  const ctx = useContext(CertContext);
  if (!ctx) throw new Error("useCert must be used inside CertProvider");
  return ctx;
}

/** The active cert. */
export function useCert(): CertDto {
  return useCertContext().cert;
}

/** Active cert plus the switcher — for the shell's cert selector. */
export function useCertSwitcher(): CertContextValue {
  return useCertContext();
}

const STORAGE_KEY = "activeCertCode";

export function CertProvider({ children }: { children: ReactNode }) {
  const { data, isPending, isError, refetch } = useCerts();
  const [code, setCode] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  const switchCert = useCallback((next: string) => {
    localStorage.setItem(STORAGE_KEY, next);
    setCode(next);
    // an in-flight quiz belongs to the previous cert — drop it
    useQuizStore.getState().reset();
  }, []);

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

  const cert = data.find((c) => c.code === code) ?? data[0]!;
  return (
    <CertContext.Provider value={{ cert, certs: data, switchCert }}>
      {children}
    </CertContext.Provider>
  );
}
