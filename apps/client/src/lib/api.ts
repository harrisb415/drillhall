import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AttemptRequest,
  AttemptResponse,
  CertDto,
  DashboardStats,
  FlashcardStatus,
  FlashcardsResponse,
  MetaDto,
  ReferenceResponse,
  SessionSummary,
  StartSessionRequest,
  StartSessionResponse,
} from "@comptia/shared-types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: "same-origin",
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, message);
  }
  return res.json() as Promise<T>;
}

export const useMeta = () =>
  useQuery({ queryKey: ["meta"], queryFn: () => api<MetaDto>("/api/meta"), staleTime: Infinity });

export const useCerts = () =>
  useQuery({ queryKey: ["certs"], queryFn: () => api<CertDto[]>("/api/certs") });

export const useFlashcards = (certId: number) =>
  useQuery({
    queryKey: ["flashcards", certId],
    queryFn: () => api<FlashcardsResponse>(`/api/certs/${certId}/flashcards`),
  });

export const useReference = (certId: number) =>
  useQuery({
    queryKey: ["reference", certId],
    queryFn: () => api<ReferenceResponse>(`/api/certs/${certId}/reference`),
    staleTime: 5 * 60 * 1000,
  });

export const useDashboard = (certId: number) =>
  useQuery({
    queryKey: ["dashboard", certId],
    queryFn: () => api<DashboardStats>(`/api/dashboard?certId=${certId}`),
  });

export function useSetCardStatus(certId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { cardId: string; status: FlashcardStatus }) =>
      api<{ ok: boolean }>("/api/flashcards/progress", {
        method: "POST",
        body: JSON.stringify({ certId, ...vars }),
      }),
    onSuccess: (_data, vars) => {
      // patch the cache in place so the deck doesn't flicker on refetch
      qc.setQueryData<FlashcardsResponse>(["flashcards", certId], (old) =>
        old ? { ...old, progress: { ...old.progress, [vars.cardId]: vars.status } } : old,
      );
      qc.invalidateQueries({ queryKey: ["dashboard", certId] });
    },
  });
}

export function useStartSession() {
  return useMutation({
    mutationFn: (body: StartSessionRequest) =>
      api<StartSessionResponse>("/api/quiz/sessions", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useSubmitAttempt() {
  return useMutation({
    mutationFn: (body: AttemptRequest) =>
      api<AttemptResponse>("/api/quiz/attempts", { method: "POST", body: JSON.stringify(body) }),
  });
}

export function useCompleteSession(certId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) =>
      api<SessionSummary>(`/api/quiz/sessions/${sessionId}/complete`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", certId] });
    },
  });
}

/** Fire-and-forget: fills notification_preferences.timezone while it's null (spec §4). */
export function captureTimezone(): void {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!timezone) return;
  void fetch("/api/settings/timezone", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify({ timezone }),
  }).catch(() => {});
}
