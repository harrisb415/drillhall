/**
 * Better Auth surfaces machine codes; users need sentences. Anything unmapped
 * falls back to the server's own message rather than a generic apology, so an
 * unexpected failure still says something actionable.
 */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "That email and password don't match an account.",
  INVALID_EMAIL: "That doesn't look like a valid email address.",
  INVALID_PASSWORD: "That password is incorrect.",
  USER_ALREADY_EXISTS: "An account with that email already exists — try logging in.",
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL:
    "An account with that email already exists — try logging in.",
  USER_NOT_FOUND: "No account found with that email.",
  PASSWORD_TOO_SHORT: "Passwords need to be at least 8 characters.",
  PASSWORD_TOO_LONG: "That password is too long.",
  EMAIL_NOT_VERIFIED: "Check your inbox and verify your email before logging in.",
  INVALID_TOKEN: "That link is invalid or has already been used. Request a new one.",
  TOKEN_EXPIRED: "That link has expired. Request a new one.",
  SOCIAL_ACCOUNT_ALREADY_LINKED: "That account is already linked to a different user.",
  FAILED_TO_CREATE_USER: "Couldn't create the account. Try again in a moment.",
};

export function authErrorMessage(error: { code?: string; message?: string } | null): string {
  if (!error) return "Something went wrong. Try again.";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]!;
  if (error.message) return error.message;
  return "Something went wrong. Try again.";
}

/** Client-side checks so obvious mistakes don't need a round trip. */
export function validateEmail(email: string): string | null {
  if (!email.trim()) return "Enter your email address.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "That doesn't look like a valid email address.";
  return null;
}

export function validatePassword(password: string): string | null {
  if (!password) return "Enter a password.";
  if (password.length < 8) return "Passwords need to be at least 8 characters.";
  return null;
}
