import { useState, type FormEvent } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { useMeta } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { AuthLayout } from "./AuthLayout";
import { authErrorMessage, validateEmail } from "./authErrors";
import { FieldError, FormError } from "./FieldError";
import { GoogleButton } from "./GoogleButton";

export function LoginPage() {
  const { data: session, isPending } = authClient.useSession();
  const { data: meta } = useMeta();
  const navigate = useNavigate();
  const location = useLocation();
  // Set by ProtectedLayout when it bounces an unauthenticated visitor.
  const returnTo = (location.state as { from?: string } | null)?.from ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (session) return <Navigate to={returnTo} replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const emailError = validateEmail(email);
    const passwordError = password ? undefined : "Enter your password.";
    setFieldErrors({ email: emailError ?? undefined, password: passwordError });
    if (emailError || passwordError) return;

    setBusy(true);
    const { error: err } = await authClient.signIn.email({ email, password });
    if (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    } else {
      navigate(returnTo, { replace: true });
    }
  }

  return (
    <AuthLayout title="Log in" description="Welcome back — pick up where you left off.">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormError message={error} />
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoFocus
            autoComplete="email"
            aria-invalid={!!fieldErrors.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FieldError message={fieldErrors.email} />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              to="/forgot-password"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            aria-invalid={!!fieldErrors.password}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <FieldError message={fieldErrors.password} />
        </div>
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Spinner className="size-4 text-primary-foreground" /> : "Log in"}
        </Button>
      </form>
      {meta?.googleEnabled && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>
          <GoogleButton label="Continue with Google" />
        </>
      )}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        No account?{" "}
        <Link to="/register" className="font-medium text-primary hover:underline">
          Sign up
        </Link>
      </p>
    </AuthLayout>
  );
}
