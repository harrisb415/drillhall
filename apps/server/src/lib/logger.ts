import { pino, type Logger } from "pino";

export type { Logger };

export function createLogger(): Logger {
  const pretty = process.env.NODE_ENV !== "production" && !process.env.VITEST;
  return pino({
    level: process.env.LOG_LEVEL ?? "info",
    ...(pretty
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "HH:MM:ss", ignore: "pid,hostname" },
          },
        }
      : {}),
  });
}
