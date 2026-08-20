import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AttemptRequest,
  AttemptResponse,
  CatalogDto,
  CertDto,
  CourseResponse,
  DashboardStats,
  ExamAttemptRequest,
  ExamPlanDto,
  NotificationPrefsDto,
  SaveExamPlanRequest,
  SaveFlashcardStateRequest,
  SaveLessonFlagRequest,
  SaveLessonProgressRequest,
  UpdateNotificationPrefsRequest,
  ExamHistoryItem,
  ExamOptionsDto,
  ExamResultDto,
  ExamSessionDto,
  FlashcardStatus,
  FlashcardsResponse,
  MetaDto,
  ReferenceResponse,
  SessionSummary,
  StartExamRequest,
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

/** Public — powers the marketing homepage, works signed out. */
export const useCatalog = () =>
  useQuery({
    queryKey: ["catalog"],
    queryFn: () => api<CatalogDto>("/api/catalog"),
    staleTime: 5 * 60 * 1000,
  });

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

/** Saves the current deck position. Fire-and-forget from the caller's side —
 *  no cache patch needed since nothing else on screen reads this value. */
export function useSaveFlashcardState() {
  return useMutation({
    mutationFn: (body: SaveFlashcardStateRequest) =>
      api<{ ok: boolean }>("/api/flashcards/state", { method: "POST", body: JSON.stringify(body) }),
  });
}

export const useCourse = (certId: number) =>
  useQuery({
    queryKey: ["course", certId],
    queryFn: () => api<CourseResponse>(`/api/certs/${certId}/course`),
  });

/** `read` defaults true (mark as read); pass false to unmark. */
export function useSetLessonRead(certId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, read = true }: { lessonId: string; read?: boolean }) =>
      api<{ ok: boolean }>("/api/course/progress", {
        method: "POST",
        body: JSON.stringify({ certId, lessonId, read } satisfies SaveLessonProgressRequest),
      }),
    onSuccess: (_data, { lessonId, read = true }) => {
      qc.setQueryData<CourseResponse>(["course", certId], (old) => {
        if (!old) return old;
        if (read) return { ...old, progress: { ...old.progress, [lessonId]: Date.now() } };
        // Unmarking: drop the key entirely, matching the server's contract
        // that only currently-read lessons appear in the progress map.
        const { [lessonId]: _dropped, ...rest } = old.progress;
        return { ...old, progress: rest };
      });
      qc.invalidateQueries({ queryKey: ["dashboard", certId] });
    },
  });
}

/** `flagged` defaults true (flag for review); pass false to clear it. */
export function useSetLessonFlag(certId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lessonId, flagged = true }: { lessonId: string; flagged?: boolean }) =>
      api<{ ok: boolean }>("/api/course/flag", {
        method: "POST",
        body: JSON.stringify({ certId, lessonId, flagged } satisfies SaveLessonFlagRequest),
      }),
    onSuccess: (_data, { lessonId, flagged = true }) => {
      qc.setQueryData<CourseResponse>(["course", certId], (old) => {
        if (!old) return old;
        return {
          ...old,
          flagged: flagged
            ? old.flagged.includes(lessonId)
              ? old.flagged
              : [...old.flagged, lessonId]
            : old.flagged.filter((id) => id !== lessonId),
        };
      });
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

// ---- exam ----

export const useExamOptions = (certId: number) =>
  useQuery({
    queryKey: ["exam-options", certId],
    queryFn: () => api<ExamOptionsDto>(`/api/exam/options?certId=${certId}`),
    staleTime: 5 * 60 * 1000,
  });

export const useExamHistory = (certId: number) =>
  useQuery({
    queryKey: ["exam-history", certId],
    queryFn: () => api<ExamHistoryItem[]>(`/api/exam/history?certId=${certId}`),
  });

export function useStartExam() {
  return useMutation({
    mutationFn: (body: StartExamRequest) =>
      api<ExamSessionDto>("/api/exam/sessions", { method: "POST", body: JSON.stringify(body) }),
  });
}

export function useRecordExamAnswer() {
  return useMutation({
    mutationFn: (body: ExamAttemptRequest) =>
      api<{ recorded: boolean }>("/api/exam/attempts", {
        method: "POST",
        body: JSON.stringify(body),
      }),
  });
}

export function useFlagExamQuestion() {
  return useMutation({
    mutationFn: (vars: { sessionId: number; questionId: string; flagged: boolean }) =>
      api<{ flagged: string[] }>(`/api/exam/sessions/${vars.sessionId}/flag`, {
        method: "POST",
        body: JSON.stringify({ questionId: vars.questionId, flagged: vars.flagged }),
      }),
  });
}

export function useSubmitExam(certId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: number) =>
      api<ExamResultDto>(`/api/exam/sessions/${sessionId}/submit`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard", certId] });
      qc.invalidateQueries({ queryKey: ["exam-history", certId] });
    },
  });
}

// ---- exam planner ----

export const useExamPlans = () =>
  useQuery({ queryKey: ["exam-plans"], queryFn: () => api<ExamPlanDto[]>("/api/exam-plans") });

export function useSaveExamPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: SaveExamPlanRequest) =>
      api<ExamPlanDto>("/api/exam-plans", { method: "PUT", body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exam-plans"] }),
  });
}

export function useDeleteExamPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (certId: number) =>
      api<{ ok: boolean }>(`/api/exam-plans/${certId}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["exam-plans"] }),
  });
}

// ---- notification settings ----

export const useNotificationPrefs = () =>
  useQuery({
    queryKey: ["notification-prefs"],
    queryFn: () => api<NotificationPrefsDto>("/api/settings/notifications"),
  });

export function useSaveNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateNotificationPrefsRequest) =>
      api<NotificationPrefsDto>("/api/settings/notifications", {
        method: "PUT",
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => qc.setQueryData(["notification-prefs"], data),
  });
}

/** Wipes XP, level, streaks, quiz/exam history, flashcard state, and course
 *  read/flag state for the signed-in user. Clears the whole query cache on
 *  success since practically every page's data is stale afterward. */
export function useResetProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ ok: boolean }>("/api/settings/reset-progress", { method: "POST" }),
    onSuccess: () => qc.clear(),
  });
}

/** Same wipe as `useResetProgress`, scoped to a single cert — for "start
 *  Network+ over without touching Core 1." XP/level/streak aren't touched:
 *  they're cross-cert by design, so there's nothing to reset there. */
export function useResetCertProgress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (certId: number) =>
      api<{ ok: boolean }>(`/api/settings/reset-progress/${certId}`, { method: "POST" }),
    onSuccess: () => qc.clear(),
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
