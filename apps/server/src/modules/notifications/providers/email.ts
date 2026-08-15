import { Resend } from "resend";
import type { Logger } from "../../../lib/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export type SendEmail = (msg: EmailMessage) => Promise<void>;

/**
 * Resend-backed sender. Without an API key it degrades to logging the message,
 * so dev and friends-without-Resend setups still work end to end (the
 * verification URL is readable in the server log).
 */
export function createEmailProvider(opts: {
  apiKey: string | undefined;
  from: string;
  logger: Logger;
}): SendEmail {
  const { apiKey, from, logger } = opts;

  if (!apiKey) {
    return async (msg) => {
      logger.info(
        { to: msg.to, subject: msg.subject, body: msg.text },
        "email not sent (RESEND_API_KEY unset) — logged instead",
      );
    };
  }

  const resend = new Resend(apiKey);
  return async (msg) => {
    const { error } = await resend.emails.send({
      from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    });
    if (error) throw new Error(`resend send failed: ${error.message}`);
    logger.info({ to: msg.to, subject: msg.subject }, "email sent");
  };
}
