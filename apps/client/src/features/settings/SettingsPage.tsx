import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { useNotificationPrefs, useSaveNotificationPrefs } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

const LEAD_DAYS = [30, 14, 7, 3, 1, 0];

function leadLabel(days: number): string {
  if (days === 0) return "On the day";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function Row({
  title,
  description,
  control,
}: {
  title: string;
  description: string;
  control: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <div className="shrink-0 pt-0.5">{control}</div>
    </div>
  );
}

export function SettingsPage() {
  const { data: session } = authClient.useSession();
  const { data: prefs, isPending } = useNotificationPrefs();
  const save = useSaveNotificationPrefs();

  if (isPending || !prefs) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  const muted = !prefs.emailEnabled;

  function toggleLead(day: number) {
    if (!prefs) return;
    const next = prefs.examReminderDays.includes(day)
      ? prefs.examReminderDays.filter((d) => d !== day)
      : [...prefs.examReminderDays, day];
    save.mutate({ examReminderDays: next.sort((a, b) => b - a) });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Signed in as {session?.user.email}
        </p>
      </div>

      {!prefs.emailDeliveryConfigured && (
        <div className="rounded-md border border-border bg-secondary/50 p-3 text-xs text-muted-foreground">
          This instance has no email provider configured, so notifications are written to the
          server log instead of being delivered. Your preferences below are still saved and
          respected.
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Email notifications</CardTitle>
          <CardDescription>
            Reminders are sent from a job that runs every half hour. Each one goes out at most
            once — re-running the job cannot produce a duplicate.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y divide-border pt-0">
          <Row
            title="Email me at all"
            description="The master switch. With this off nothing is sent, whatever the settings below say."
            control={
              <Switch
                label="Email notifications"
                checked={prefs.emailEnabled}
                disabled={save.isPending}
                onCheckedChange={(v) => save.mutate({ emailEnabled: v })}
              />
            }
          />
          <Row
            title="Exam reminders"
            description="A nudge as your booked exam date approaches, using the lead times below."
            control={
              <Switch
                label="Exam reminders"
                checked={prefs.examReminders}
                disabled={muted || save.isPending}
                onCheckedChange={(v) => save.mutate({ examReminders: v })}
              />
            }
          />
          <div className={cn("py-4", (muted || !prefs.examReminders) && "opacity-50")}>
            <div className="text-sm font-medium">Remind me</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Pick every lead time you want. One email per exam per lead time.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {LEAD_DAYS.map((day) => {
                const on = prefs.examReminderDays.includes(day);
                return (
                  <Button
                    key={day}
                    size="sm"
                    variant={on ? "default" : "outline"}
                    disabled={muted || !prefs.examReminders || save.isPending}
                    onClick={() => toggleLead(day)}
                  >
                    {leadLabel(day)}
                  </Button>
                );
              })}
            </div>
            {prefs.examReminders && prefs.examReminderDays.length === 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                No lead times selected, so no exam reminders will be sent.
              </p>
            )}
          </div>
          <Row
            title="Inactivity nudges"
            description="A reminder if you haven't answered a question in a week. At most one a day."
            control={
              <Switch
                label="Inactivity nudges"
                checked={prefs.inactivityReminders}
                disabled={muted || save.isPending}
                onCheckedChange={(v) => save.mutate({ inactivityReminders: v })}
              />
            }
          />
          <Row
            title="Weekly digest"
            description="A short summary of what you studied. Only sent in weeks you actually studied."
            control={
              <Switch
                label="Weekly digest"
                checked={prefs.digestFrequency === "weekly"}
                disabled={muted || save.isPending}
                onCheckedChange={(v) => save.mutate({ digestFrequency: v ? "weekly" : "never" })}
              />
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Time zone</CardTitle>
          <CardDescription>
            Detected from your browser and stored for future use.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-3">
          <Badge variant="secondary">{prefs.timezone ?? "not detected"}</Badge>
          <p className="text-xs text-muted-foreground">
            Reminder windows are currently computed in UTC, so a nudge may not land at your local
            morning. Per-zone delivery timing is not implemented yet.
          </p>
        </CardContent>
      </Card>

      {save.isError && (
        <p className="text-sm text-destructive">
          Couldn't save that change: {(save.error as Error).message}
        </p>
      )}
    </div>
  );
}
