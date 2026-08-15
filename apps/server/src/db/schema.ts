import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";

// Better Auth owns these; app tables key off user.id.
export { user, session, account, verification } from "./auth-schema";

export const certs = sqliteTable("certs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  version: text("version").notNull(),
});

export const certDomains = sqliteTable(
  "cert_domains",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    certId: integer("cert_id")
      .notNull()
      .references(() => certs.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    weight: integer("weight").notNull(),
  },
  (t) => [uniqueIndex("cert_domains_cert_code_uq").on(t.certId, t.code)],
);

export const flashcardProgress = sqliteTable(
  "flashcard_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    certId: integer("cert_id")
      .notNull()
      .references(() => certs.id, { onDelete: "cascade" }),
    cardId: text("card_id").notNull(),
    status: text("status", { enum: ["known", "learning"] }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.certId, t.cardId] })],
);

export const quizSessions = sqliteTable(
  "quiz_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    certId: integer("cert_id")
      .notNull()
      .references(() => certs.id, { onDelete: "cascade" }),
    /** JSON array of question ids chosen for this session */
    questionIds: text("question_ids").notNull(),
    questionCount: integer("question_count").notNull(),
    startedAt: integer("started_at", { mode: "timestamp_ms" }).notNull(),
    finishedAt: integer("finished_at", { mode: "timestamp_ms" }),
    correctCount: integer("correct_count"),
    /** percent 0-100 */
    score: real("score"),
  },
  (t) => [index("quiz_sessions_user_idx").on(t.userId, t.certId, t.startedAt)],
);

export const quizAttempts = sqliteTable(
  "quiz_attempts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id").references(() => quizSessions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    certId: integer("cert_id")
      .notNull()
      .references(() => certs.id, { onDelete: "cascade" }),
    questionId: text("question_id").notNull(),
    /** denormalized from the content pack so dashboard aggregation is one GROUP BY */
    domainCode: text("domain_code").notNull(),
    /** mc answers only; PBQ answers live in `answer` */
    choiceIndex: integer("choice_index"),
    /** the submitted AttemptAnswer as JSON (all question types) */
    answer: text("answer"),
    correct: integer("correct", { mode: "boolean" }).notNull(),
    answeredAt: integer("answered_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("quiz_attempts_user_idx").on(t.userId, t.certId),
    index("quiz_attempts_session_idx").on(t.sessionId),
  ],
);

export const examPlans = sqliteTable("exam_plans", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  certId: integer("cert_id")
    .notNull()
    .references(() => certs.id, { onDelete: "cascade" }),
  examDate: integer("exam_date", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const notificationPreferences = sqliteTable("notification_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  emailEnabled: integer("email_enabled", { mode: "boolean" }).notNull().default(true),
  examReminders: integer("exam_reminders", { mode: "boolean" }).notNull().default(true),
  streakReminders: integer("streak_reminders", { mode: "boolean" }).notNull().default(true),
  inactivityReminders: integer("inactivity_reminders", { mode: "boolean" }).notNull().default(true),
  digestFrequency: text("digest_frequency").notNull().default("weekly"),
  /** IANA zone, captured at signup; per-user delivery logic lands in Phase 5 */
  timezone: text("timezone"),
});

export const notificationLog = sqliteTable(
  "notification_log",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    sentAt: integer("sent_at", { mode: "timestamp_ms" }).notNull(),
    channel: text("channel").notNull(),
    windowKey: text("window_key").notNull(),
  },
  // The dedupe mechanism: a duplicate send attempt fails this insert instead of racing a check-then-insert.
  (t) => [uniqueIndex("notification_log_dedupe_uq").on(t.userId, t.type, t.windowKey)],
);

export const gamificationStats = sqliteTable("gamification_stats", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  xp: integer("xp").notNull().default(0),
  level: integer("level").notNull().default(1),
  currentStreak: integer("current_streak").notNull().default(0),
  longestStreak: integer("longest_streak").notNull().default(0),
  lastActiveDate: integer("last_active_date", { mode: "timestamp_ms" }),
});
