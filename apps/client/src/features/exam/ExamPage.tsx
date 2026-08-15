import { useEffect } from "react";
import { useCert } from "@/lib/cert-context";
import { useExamStore } from "@/stores/exam";
import { ExamResults } from "./ExamResults";
import { ExamRunner } from "./ExamRunner";
import { ExamSetup } from "./ExamSetup";

export function ExamPage() {
  const cert = useCert();
  const { phase, session, reset } = useExamStore();

  // Switching certs mid-exam would score against the wrong pack.
  useEffect(() => {
    if (session && session.certId !== cert.id) reset();
  }, [cert.id, session, reset]);

  if (phase === "running") return <ExamRunner />;
  if (phase === "results") return <ExamResults />;
  return <ExamSetup />;
}
