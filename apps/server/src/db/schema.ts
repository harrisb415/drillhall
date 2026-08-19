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

/**
 * Where the user is in the flashcard deck, per cert. The whole view is stored,
 * not just the index: an index is meaningless without the filters and shuffle
 * that produced the deck it points into. Because the shuffle is a deterministic
 * function of `seed`, storing the seed reconstructs the exact order — no need
 * to persist a card-id list.
 */
export const flashcardState = sqliteTable(
  "flashcard_state",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    certId: integer("cert_id")
      .notNull()
      .references(() => certs.id, { onDelete: "cascade" }),
    /** null = all domains */
    domainCode: text("domain_code"),
    hideKnown: integer("hide_known", { mode: "boolean" }).notNull().default(false),
    /** 0 = pack order; any other value seeds the shuffle */
    seed: integer("seed").notNull().default(0),
    cardIndex: integer("card_index").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.certId] })],
);

export const courseProgress = sqliteTable(
  "course_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    certId: integer("cert_id")
      .notNull()
      .references(() => certs.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull(),
    /** When first marked read. Never cleared or moved by a later unmark — it's the XP-award guard. */
    completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
    /**
     * Current read state. A lesson can be unmarked back to false, e.g. "I
     * don't actually remember this, treat it as unread" — but the row stays,
     * so the XP already earned for reading it once is never clawed back or
     * re-awarded on a later remark.
     */
    read: integer("read", { mode: "boolean" }).notNull().default(true),
  },
  (t) => [primaryKey({ columns: [t.userId, t.certId, t.lessonId] })],
);

/**
 * "I need to study this more" — independent of read state, and deliberately
 * its own table rather than a column on `course_progress`. That table's row
 * existence is the XP-award guard for reading a lesson; flagging an unread
 * lesson would create a row early and silently block the XP that lesson
 * should still earn when actually marked read later.
 */
export const courseFlags = sqliteTable(
  "course_flags",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    certId: integer("cert_id")
      .notNull()
      .references(() => certs.id, { onDelete: "cascade" }),
    lessonId: text("lesson_id").notNull(),
    flaggedAt: integer("flagged_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.certId, t.lessonId] })],
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
    /** practice = graded per answer; exam = timed, no feedback until submit */
    mode: text("mode", { enum: ["practice", "exam"] })
      .notNull()
      .default("practice"),
    /** which exam type was run: full | half | domain | pbq | weak */
    examMode: text("exam_mode"),
    timeLimitSeconds: integer("time_limit_seconds"),
    /** server-authoritative deadline; a client clock can't be trusted */
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    /** JSON {questionId: number[]} display order for mc choices */
    choiceOrders: text("choice_orders"),
    /** JSON {questionId: {items?, rights?}} so a resume redisplays identically */
    layouts: text("layouts"),
    /** JSON string[] of question ids the candidate flagged for review */
    flagged: text("flagged"),
    scaledScore: integer("scaled_score"),
    passed: integer("passed", { mode: "boolean" }),
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
  /** JSON number[] of lead times in days, e.g. [7,3,1] */
  examReminderDays: text("exam_reminder_days").notNull().default("[7,3,1]"),
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
