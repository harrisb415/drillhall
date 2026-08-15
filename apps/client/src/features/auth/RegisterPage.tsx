import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { useMeta } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { AuthLayout } from "./AuthLayout";
import { authErrorMessage, validateEmail, validatePassword } from "./authErrors";
import { FieldError, FormError } from "./FieldError";
import { GoogleButton } from "./GoogleButton";

export function RegisterPage() {
  const { data: session, isPending } = authClient.useSession();
  const { data: meta } = useMeta();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{
    name?: string;
    email?: string;
    password?: string;
  }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (isPending) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (session) return <Navigate to="/dashboard" replace />;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const errors = {
      name: name.trim() ? undefined : "Enter your name.",
      email: validateEmail(email) ?? undefined,
      password: validatePassword(password) ?? undefined,
    };
    setFieldErrors(errors);
    if (errors.name || errors.email || errors.password) return;

    setBusy(true);
    const { error: err } = await authClient.signUp.email({
      name: name.trim(),
      email,
      password,
      callbackURL: "/dashboard",
    });
    if (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    } else {
      navigate("/dashboard", { replace: true });
    }
  }

  return (
    <AuthLayout title="Create an account" description="Free — you'll be studying in a minute.">
      <form onSubmit={handleSubmit} noValidate className="space-y-4">
        <FormError message={error} />
        <div className="space-y-1.5">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            autoFocus
            autoComplete="name"
            aria-invalid={!!fieldErrors.name}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <FieldError message={fieldErrors.name} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            aria-invalid={!!fieldErrors.email}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FieldError message={fieldErrors.email} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <PasswordInput
            id="password"
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
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? <Spinner className="size-4 text-primary-foreground" /> : "Sign up"}
        </Button>
      </form>
      {meta?.googleEnabled && (
        <>
          <div className="my-4 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" />
            or
            <div className="h-px flex-1 bg-border" />
          </div>
          <GoogleButton label="Sign up with Google" />
        </>
      )}
      <p className="mt-4 text-center text-sm text-muted-foreground">
        Already registered?{" "}
        <Link to="/login" className="font-medium text-primary hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
