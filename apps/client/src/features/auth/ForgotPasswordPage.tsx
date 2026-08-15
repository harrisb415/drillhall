import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { AuthLayout } from "./AuthLayout";
import { authErrorMessage, validateEmail } from "./authErrors";
import { FieldError, FormError } from "./FieldError";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const emailError = validateEmail(email);
    setFieldError(emailError);
    if (emailError) return;

    setBusy(true);
    const { error: err } = await authClient.requestPasswordReset({
      email,
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    // Deliberately not distinguishing "no such account" — that would let anyone
    // test which emails are registered.
    if (err && err.status !== 404) setError(authErrorMessage(err));
    else setSent(true);
  }

  if (sent) {
    return (
      <AuthLayout title="Check your email" description="If that address has an account, a reset link is on its way.">
        <p className="text-sm text-muted-foreground">
          The link expires in an hour. Nothing arrived? Check spam, or{" "}
          <button
            type="button"
            onClick={() => setSent(false)}
            className="font-medium text-primary hover:underline"
          >
            try a different address
          </button>
          .
        </p>
        <Link to="/login">
          <Button variant="outline" className="mt-4 w-full">
            Back to log in
          </Button>
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Reset your password"
      description="We'll email you a link to choose a new one."
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormError message={error} />
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoFocus
            autoComplete="email"
            aria-invalid={!!fieldError}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FieldError message={fieldError} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Spinner className="size-4 text-primary-foreground" /> : "Send reset link"}
        </Button>
      </form>
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
