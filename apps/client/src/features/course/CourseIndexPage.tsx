import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RadialGauge } from "@/components/ui/radial-gauge";
import { Spinner } from "@/components/ui/spinner";
import { useCourse } from "@/lib/api";
import { useCert } from "@/lib/cert-context";

function ReadingIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 4.5z" />
      <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function CourseIndexPage() {
  const cert = useCert();
  const { data, isPending } = useCourse(cert.id);

  if (isPending || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  // Group by domain, but iterate in the pack's canonical domain order — the
  // same order readiness and the exam blueprint use — not whatever order
  // lessons happen to appear in.
  const byDomain = new Map<string, typeof data.lessons>();
  for (const l of data.lessons) {
    const list = byDomain.get(l.domainCode);
    if (list) list.push(l);
    else byDomain.set(l.domainCode, [l]);
  }
  const sections = cert.domains
    .map((d) => ({ domain: d, lessons: byDomain.get(d.code) ?? [] }))
    .filter((s) => s.lessons.length > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Course</h1>
        <p className="text-sm text-muted-foreground">
          Read through each domain at your own pace — nothing here is gated or sequenced.
        </p>
      </div>

      {sections.length === 0 ? (
        <Card>
          <CardContent>
            <EmptyState
              art="course"
              title={`No course content for ${cert.name} yet`}
              description="Lessons ship as part of the content pack for each certification. Flashcards, quizzes and the exam simulator all still work in the meantime."
            />
          </CardContent>
        </Card>
      ) : (
        sections.map(({ domain, lessons }) => {
          const completed = lessons.filter((l) => data.progress[l.id] !== undefined).length;
          const pct = Math.round((completed / lessons.length) * 100);
          return (
            <Card key={domain.code}>
              <CardHeader>
                <div className="flex items-center gap-4">
                  <RadialGauge
                    value={pct}
                    size={52}
                    strokeWidth={5}
                    color="var(--primary)"
                    label={`${domain.name}: ${completed} of ${lessons.length} lessons read`}
                  >
                    <span className="stat-numeral text-xs font-semibold">{pct}%</span>
                  </RadialGauge>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <CardTitle className="truncate text-base">
                        {domain.code} {domain.name}
                      </CardTitle>
                      <Badge variant="secondary" className="shrink-0">
                        {domain.weight}%
                      </Badge>
                    </div>
                    <CardDescription>
                      {completed} of {lessons.length} read
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="divide-y divide-border pt-0">
                {lessons.map((lesson) => {
                  const done = data.progress[lesson.id] !== undefined;
                  return (
                    <Link
                      key={lesson.id}
                      to={`/course/${lesson.id}`}
                      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-accent/50"
                    >
                      <span
                        className={
                          done
                            ? "flex size-7 shrink-0 items-center justify-center rounded-full bg-success/15 text-success"
                            : "flex size-7 shrink-0 items-center justify-center rounded-full bg-info-muted text-info"
                        }
                      >
                        {done ? <CheckIcon className="size-4" /> : <ReadingIcon className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{lesson.title}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {lesson.summary}
                        </span>
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {lesson.estimatedMinutes} min
                      </span>
                    </Link>
                  );
                })}
              </CardContent>
            </Card>
          );
        })
      )}
    </div>
  );
}
