import type { Flashcard, ReferenceGroup } from "@comptia/content";

// ---- meta ----
export interface MetaDto {
  name: string;
  version: string;
  googleEnabled: boolean;
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
/** A question as sent to the client: no answer, no explanation. */
export interface QuizQuestionPublic {
  id: string;
  domainCode: string;
  type: "mc";
  prompt: string;
  choices: string[];
}

export interface StartSessionRequest {
  certId: number;
  domainCodes?: string[];
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
  choiceIndex: number;
}

export interface AttemptResponse {
  correct: boolean;
  answerIndex: number;
  explanation: string;
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

// ---- dashboard ----
export interface DashboardDomainStat {
  code: string;
  name: string;
  weight: number;
  attempts: number;
  correct: number;
  /** percent 0-100, null when no attempts yet */
  accuracy: number | null;
}

export interface DashboardStats {
  flashcards: { total: number; known: number; learning: number };
  quiz: {
    attempts: number;
    correct: number;
    accuracy: number | null;
    perDomain: DashboardDomainStat[];
  };
  recentSessions: RecentSession[];
}

export interface ApiError {
  error: string;
}
