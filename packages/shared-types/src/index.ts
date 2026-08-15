import type { Flashcard, ReferenceGroup } from "@comptia/content";

// ---- meta ----
export interface MetaDto {
  name: string;
  version: string;
  googleEnabled: boolean;
}

// ---- public catalog (marketing homepage; no auth) ----
export interface CatalogCert {
  code: string;
  name: string;
  version: string;
  domains: number;
  flashcards: number;
  quizQuestions: number;
  questionTypes: QuizQuestionType[];
}

export interface CatalogDto {
  certs: CatalogCert[];
  totals: { certs: number; flashcards: number; quizQuestions: number };
}

// ---- certs ----
export interface CertDomainDto {
  code: string;
  name: string;
  weight: number;
}

export interface CertDto {
  id: number;
  code: string;
  name: string;
  version: string;
  domains: CertDomainDto[];
  counts: {
    flashcards: number;
    quizQuestions: number;
    referenceGroups: number;
  };
}

// ---- flashcards ----
export type FlashcardStatus = "known" | "learning";

export interface FlashcardsResponse {
  cards: Flashcard[];
  /** cardId -> status; cards absent from the map are unseen */
  progress: Record<string, FlashcardStatus>;
}

// ---- reference ----
export interface ReferenceResponse {
  groups: ReferenceGroup[];
}

// ---- quiz ----
export type QuizQuestionType = "mc" | "order" | "match" | "terminal";

/**
 * A question as sent to the client: no answers, no explanation.
 * `order` items and `match` rights arrive pre-shuffled by the server.
 */
export type QuizQuestionPublic =
  | { id: string; domainCode: string; type: "mc"; prompt: string; choices: string[] }
  | { id: string; domainCode: string; type: "order"; prompt: string; items: string[] }
  | { id: string; domainCode: string; type: "match"; prompt: string; lefts: string[]; rights: string[] }
  | { id: string; domainCode: string; type: "terminal"; prompt: string };

export type AttemptAnswer =
  | { type: "mc"; choiceIndex: number }
  | { type: "order"; order: string[] }
  | { type: "match"; pairs: Record<string, string> }
  | { type: "terminal"; command: string };

/** The correct answer, revealed after grading. */
export type Solution =
  | { type: "mc"; answerIndex: number }
  | { type: "order"; order: string[] }
  | { type: "match"; pairs: { left: string; right: string }[] }
  | { type: "terminal"; expected: string[] };

export interface StartSessionRequest {
  certId: number;
  domainCodes?: string[];
  types?: QuizQuestionType[];
  count?: number;
}

export interface StartSessionResponse {
  sessionId: number;
  certId: number;
  questions: QuizQuestionPublic[];
}

export interface AttemptRequest {
  sessionId: number;
  questionId: string;
  answer: AttemptAnswer;
}

export interface AttemptResponse {
  correct: boolean;
  explanation: string;
  solution: Solution;
}

export interface DomainScore {
  code: string;
  name: string;
  total: number;
  correct: number;
}

export interface SessionSummary {
  sessionId: number;
  total: number;
  answered: number;
  correct: number;
  /** percent 0-100 */
  score: number;
  perDomain: DomainScore[];
}

export interface RecentSession {
  id: number;
  startedAt: number;
  finishedAt: number | null;
  total: number;
  correct: number;
  score: number | null;
}

// ---- exam ----
export type ExamModeId = "full" | "half" | "domain" | "pbq" | "weak";

export interface ExamModeDto {
  id: ExamModeId;
  name: string;
  description: string;
  questionCount: number;
  minutes: number;
  picksDomains: boolean;
  /** questionCount clamped to what the pack can actually supply */
  availableQuestions: number;
}

export interface ExamOptionsDto {
  certId: number;
  passingScaledScore: number;
  passingRawPercent: number;
  scaledMin: number;
  scaledMax: number;
  /** the real exam's length, for honesty when the pool is smaller */
  officialQuestionCount: number;
  officialMinutes: number;
  modes: ExamModeDto[];
}

export interface StartExamRequest {
  certId: number;
  examMode: ExamModeId;
  domainCodes?: string[];
}

/** Live exam state — never carries answers, grading, or explanations. */
export interface ExamSessionDto {
  sessionId: number;
  certId: number;
  examMode: ExamModeId;
  questions: QuizQuestionPublic[];
  /** questionId -> the answer already recorded, so a reload restores them */
  answers: Record<string, AttemptAnswer>;
  flagged: string[];
  secondsRemaining: number;
  timeLimitSeconds: number;
  expiresAt: number;
  submitted: boolean;
}

export interface ExamAttemptRequest {
  sessionId: number;
  questionId: string;
  /** null clears the answer (leaves the question unanswered) */
  answer: AttemptAnswer | null;
}

export interface ExamReviewItem {
  questionId: string;
  domainCode: string;
  prompt: string;
  type: QuizQuestionType;
  correct: boolean;
  answered: boolean;
  given: AttemptAnswer | null;
  solution: Solution;
  explanation: string;
  /** display order used during the exam, so review shows what you saw */
  choices?: string[];
}

export interface ExamResultDto {
  sessionId: number;
  certId: number;
  examMode: ExamModeId;
  total: number;
  answered: number;
  correct: number;
  /** raw percent 0-100 */
  score: number;
  scaledScore: number;
  passingScaledScore: number;
  passed: boolean;
  timeSpentSeconds: number;
  timeLimitSeconds: number;
  expired: boolean;
  perDomain: DomainScore[];
  review: ExamReviewItem[];
}

export interface ExamHistoryItem {
  sessionId: number;
  examMode: ExamModeId;
  startedAt: number;
  finishedAt: number | null;
  total: number;
  correct: number;
  score: number | null;
  scaledScore: number | null;
  passed: boolean | null;
}

// ---- dashboard ----
export interface DashboardDomainStat {
  code: string;
  name: string;
  weight: number;
  attempts: number;
  correct: number;
  /** raw percent 0-100, null when no attempts yet */
  accuracy: number | null;
  /** recency-weighted mastery, percent 0-100, null when no attempts yet (spec §7) */
  mastery: number | null;
}

export interface DashboardStats {
  flashcards: { total: number; known: number; learning: number };
  quiz: {
    attempts: number;
    correct: number;
    accuracy: number | null;
    /** Σ(domain mastery × exam weight), percent 0-100; null until any attempt exists */
    readiness: number | null;
    perDomain: DashboardDomainStat[];
  };
  exams: {
    attempts: number;
    passed: number;
    bestScaledScore: number | null;
    lastScaledScore: number | null;
    lastPassed: boolean | null;
    passingScaledScore: number;
    recent: ExamHistoryItem[];
  };
  recentSessions: RecentSession[];
}

export interface ApiError {
  error: string;
}
