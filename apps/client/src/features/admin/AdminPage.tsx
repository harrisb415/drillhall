import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Spinner } from "@/components/ui/spinner";
import { authClient, isAdmin } from "@/lib/auth-client";
import { formatDate } from "@/lib/utils";

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role?: string | null;
  banned?: boolean | null;
  banReason?: string | null;
  emailVerified?: boolean;
  createdAt?: string | Date;
}

type Busy = { id: string; action: string } | null;

/** The action strip for one user. Split out so the row stays readable. */
function UserActions({
  user,
  selfId,
  busy,
  onAct,
}: {
  user: AdminUser;
  selfId: string | undefined;
  busy: Busy;
  onAct: (action: string, user: AdminUser) => void;
}) {
  const isSelf = user.id === selfId;
  const pending = (a: string) => busy?.id === user.id && busy.action === a;
  const anyPending = busy?.id === user.id;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {user.banned ? (
        <Button
          size="sm"
          variant="outline"
          disabled={anyPending}
          onClick={() => onAct("unban", user)}
        >
          {pending("unban") ? <Spinner className="size-3.5" /> : "Unban"}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          // Banning yourself locks you out of the panel you're standing in.
          disabled={anyPending || isSelf}
          title={isSelf ? "You can't ban your own account" : undefined}
          onClick={() => onAct("ban", user)}
        >
          {pending("ban") ? <Spinner className="size-3.5" /> : "Ban"}
        </Button>
      )}

      <Button
        size="sm"
        variant="outline"
        disabled={anyPending || isSelf}
        title={isSelf ? "You can't change your own role" : undefined}
        onClick={() => onAct(user.role === "admin" ? "demote" : "promote", user)}
      >
        {pending("promote") || pending("demote") ? (
          <Spinner className="size-3.5" />
        ) : user.role === "admin" ? (
          "Make user"
        ) : (
          "Make admin"
        )}
      </Button>

      <Button size="sm" variant="outline" disabled={anyPending} onClick={() => onAct("password", user)}>
        Set password
      </Button>

      <Button size="sm" variant="outline" disabled={anyPending} onClick={() => onAct("revoke", user)}>
        {pending("revoke") ? <Spinner className="size-3.5" /> : "Sign out"}
      </Button>

      <Button
        size="sm"
        variant="destructive"
        disabled={anyPending || isSelf}
        title={isSelf ? "Delete your own account from Settings instead" : undefined}
        onClick={() => onAct("remove", user)}
      >
        {pending("remove") ? <Spinner className="size-3.5" /> : "Delete"}
      </Button>
    </div>
  );
}

export function AdminPage() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Which user we're setting a password for, plus the field value.
  const [pwFor, setPwFor] = useState<AdminUser | null>(null);
  const [pw, setPw] = useState("");

  const load = useCallback(async (search: string) => {
    setError(null);
    const { data, error: err } = await authClient.admin.listUsers({
      query: {
        limit: 200,
        sortBy: "createdAt",
        sortDirection: "desc",
        ...(search ? { searchField: "email" as const, searchOperator: "contains" as const, searchValue: search } : {}),
      },
    });
    if (err) {
      setError(err.message ?? "Couldn't load users.");
      setUsers([]);
      return;
    }
    setUsers((data?.users ?? []) as AdminUser[]);
  }, []);

  useEffect(() => {
    if (isAdmin(session)) void load(query);
    // Re-runs on search; `load` is stable.
  }, [session, query, load]);

  // Client-side gating is cosmetic — every call below is authorized server-side
  // — but there's no reason to render a panel to someone who can't use it.
  if (sessionPending) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }
  if (!isAdmin(session)) return <Navigate to="/dashboard" replace />;

  async function act(action: string, user: AdminUser) {
    setError(null);
    setNotice(null);

    if (action === "password") {
      setPwFor(user);
      setPw("");
      return;
    }
    if (action === "remove" && !confirm(`Permanently delete ${user.email}? This erases all their study data and cannot be undone.`)) return;
    if (action === "ban" && !confirm(`Ban ${user.email}? They'll be signed out and unable to log in.`)) return;

    setBusy({ id: user.id, action });
    const run = async () => {
      switch (action) {
        case "ban":
          return authClient.admin.banUser({ userId: user.id, banReason: "Banned by an administrator" });
        case "unban":
          return authClient.admin.unbanUser({ userId: user.id });
        case "promote":
          return authClient.admin.setRole({ userId: user.id, role: "admin" });
        case "demote":
          return authClient.admin.setRole({ userId: user.id, role: "user" });
        case "revoke":
          return authClient.admin.revokeUserSessions({ userId: user.id });
        case "remove":
          return authClient.admin.removeUser({ userId: user.id });
        default:
          return { error: { message: `Unknown action ${action}` } };
      }
    };
    const { error: err } = (await run()) as { error?: { message?: string } | null };
    setBusy(null);
    if (err) {
      setError(err.message ?? "That didn't work.");
      return;
    }
    setNotice(
      action === "revoke"
        ? `Signed ${user.email} out of all devices.`
        : `${action[0]!.toUpperCase()}${action.slice(1)} applied to ${user.email}.`,
    );
    await load(query);
  }

  async function submitPassword() {
    if (!pwFor) return;
    if (pw.length < 8) {
      setError("Passwords need to be at least 8 characters.");
      return;
    }
    setBusy({ id: pwFor.id, action: "password" });
    const { error: err } = await authClient.admin.setUserPassword({
      userId: pwFor.id,
      newPassword: pw,
    });
    setBusy(null);
    if (err) {
      setError(err.message ?? "Couldn't set that password.");
      return;
    }
    setNotice(`Password updated for ${pwFor.email}. Tell them directly — nothing is emailed.`);
    setPwFor(null);
    setPw("");
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage who can use this instance. Every action here is authorized on the server, not by
          this page.
        </p>
      </div>

      {error && (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-md border border-success/40 bg-success/10 p-3 text-sm text-success">
          {notice}
        </div>
      )}

      {pwFor && (
        <Card className="border-primary/40">
          <CardHeader>
            <CardTitle className="text-base">Set a password for {pwFor.email}</CardTitle>
            <CardDescription>
              This instance has no outbound email configured, so the normal reset link goes nowhere.
              Setting it here is the working recovery path — pass it to them over something you
              trust, and have them change it.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1 space-y-1.5">
              <Label htmlFor="admin-pw">New password</Label>
              <PasswordInput
                id="admin-pw"
                autoComplete="new-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
              />
            </div>
            <Button disabled={busy?.action === "password"} onClick={submitPassword}>
              {busy?.action === "password" ? <Spinner className="size-4 text-primary-foreground" /> : "Set password"}
            </Button>
            <Button variant="outline" onClick={() => setPwFor(null)}>
              Cancel
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>Users</CardTitle>
              <CardDescription>
                {users === null ? "Loading…" : `${users.length} account${users.length === 1 ? "" : "s"}`}
              </CardDescription>
            </div>
            <Input
              placeholder="Search by email…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full sm:w-64"
            />
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {users === null ? (
            <div className="flex h-32 items-center justify-center">
              <Spinner className="size-6" />
            </div>
          ) : users.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No accounts match that search.</p>
          ) : (
            <ul className="divide-y divide-border">
              {users.map((u) => (
                <li key={u.id} className="flex flex-col gap-3 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{u.name || "(no name)"}</span>
                      {u.role === "admin" && <Badge>admin</Badge>}
                      {u.banned && <Badge variant="destructive">banned</Badge>}
                      {u.id === session?.user.id && <Badge variant="secondary">you</Badge>}
                      {!u.emailVerified && <Badge variant="outline">unverified</Badge>}
                    </div>
                    <div className="truncate text-sm text-muted-foreground">{u.email}</div>
                    {u.createdAt && (
                      <div className="text-xs text-muted-foreground">
                        joined {formatDate(new Date(u.createdAt).getTime())}
                      </div>
                    )}
                  </div>
                  <UserActions user={u} selfId={session?.user.id} busy={busy} onAct={act} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
