import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { authClient } from "@/lib/auth-client";
import { AuthLayout } from "./AuthLayout";
import { authErrorMessage, validatePassword } from "./authErrors";
import { FieldError, FormError } from "./FieldError";

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token");
  const linkError = params.get("error");

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ password?: string; confirm?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!token || linkError) {
    return (
      <AuthLayout title="Link not valid" description="That reset link is expired or already used.">
        <p className="text-sm text-muted-foreground">
          Reset links work once and expire after an hour. Request a fresh one to continue.
        </p>
        <Link to="/forgot-password">
          <Button className="mt-4 w-full">Request a new link</Button>
        </Link>
      </AuthLayout>
    );
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const errors = {
      password: validatePassword(password) ?? undefined,
      confirm: password !== confirm ? "The two passwords don't match." : undefined,
    };
    setFieldErrors(errors);
    if (errors.password || errors.confirm) return;

    setBusy(true);
    const { error: err } = await authClient.resetPassword({ newPassword: password, token: token! });
    if (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    } else {
      navigate("/login", { replace: true });
    }
  }

  return (
    <AuthLayout title="Choose a new password" description="Then log in with it.">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormError message={error} />
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <PasswordInput
            id="password"
            autoFocus
            autoComplete="new-password"
            aria-invalid={!!fieldErrors.password}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {fieldErrors.password ? (
            <FieldError message={fieldErrors.password} />
          ) : (
            <p className="text-xs text-muted-foreground">At least 8 characters.</p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <PasswordInput
            id="confirm"
            autoComplete="new-password"
            aria-invalid={!!fieldErrors.confirm}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          <FieldError message={fieldErrors.confirm} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Spinner className="size-4 text-primary-foreground" /> : "Set new password"}
        </Button>
      </form>
    </AuthLayout>
  );
}
