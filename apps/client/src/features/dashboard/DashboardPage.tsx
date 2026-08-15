import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { useDashboard } from "@/lib/api";
import { useCert } from "@/lib/cert-context";
import { formatDate } from "@/lib/utils";

export function DashboardPage() {
  const cert = useCert();
  const { data, isPending } = useDashboard(cert.id);

  if (isPending || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  const knownPct =
    data.flashcards.total > 0 ? Math.round((data.flashcards.known / data.flashcards.total) * 100) : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          {cert.name} ({cert.version})
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Quiz accuracy</CardDescription>
            <CardTitle className="text-3xl">
              {data.quiz.accuracy !== null ? `${data.quiz.accuracy}%` : "—"}
            </CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            {data.quiz.correct} of {data.quiz.attempts} questions correct
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Questions answered</CardDescription>
            <CardTitle className="text-3xl">{data.quiz.attempts}</CardTitle>
          </CardHeader>
          <CardContent className="text-xs text-muted-foreground">
            across {data.recentSessions.length > 0 ? "your sessions" : "no sessions yet"}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Flashcards known</CardDescription>
            <CardTitle className="text-3xl">
              {data.flashcards.known}
              <span className="text-base font-normal text-muted-foreground">
                {" "}
                / {data.flashcards.total}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Progress value={knownPct} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Domains</CardTitle>
          <CardDescription>
            Accuracy by exam domain — weights match the official exam breakdown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.quiz.perDomain.map((d) => (
            <div key={d.code}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate font-medium">
                  {d.code} {d.name}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <Badge variant="secondary">{d.weight}%</Badge>
                  <span className="w-20 text-right text-muted-foreground">
                    {d.accuracy !== null ? `${d.accuracy}% (${d.attempts})` : "no data"}
                  </span>
                </span>
              </div>
              <Progress
                value={d.accuracy ?? 0}
                barClassName={d.accuracy === null ? "bg-muted" : undefined}
              />
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Recent sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentSessions.length === 0 ? (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No quizzes yet.
                <div className="mt-3">
                  <Link to="/quiz">
                    <Button>Start your first quiz</Button>
                  </Link>
                </div>
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {data.recentSessions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2 text-sm">
                    <span className="text-muted-foreground">{formatDate(s.startedAt)}</span>
                    <span>
                      {s.correct}/{s.total}
                      <Badge
                        variant={(s.score ?? 0) >= 70 ? "success" : "secondary"}
                        className="ml-2"
                      >
                        {s.score ?? 0}%
                      </Badge>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Keep going</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Link to="/quiz">
              <Button className="w-full">Take a quiz</Button>
            </Link>
            <Link to="/flashcards">
              <Button variant="secondary" className="w-full">
                Review flashcards
              </Button>
            </Link>
            <Link to="/reference">
              <Button variant="outline" className="w-full">
                Browse reference sheets
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
