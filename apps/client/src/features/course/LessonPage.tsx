import Markdown from "react-markdown";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useCourse, useSetLessonFlag, useSetLessonRead } from "@/lib/api";
import { useCert } from "@/lib/cert-context";

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M4 3v18" />
      <path d="M4 4h13l-2.5 4L17 12H4" />
    </svg>
  );
}

export function LessonPage() {
  const cert = useCert();
  const { lessonId } = useParams<{ lessonId: string }>();
  const navigate = useNavigate();
  const { data, isPending } = useCourse(cert.id);
  const setRead = useSetLessonRead(cert.id);
  const setFlag = useSetLessonFlag(cert.id);

  if (isPending || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  const idx = data.lessons.findIndex((l) => l.id === lessonId);
  const lesson = data.lessons[idx];
  // Stale link (a removed lesson, or a typo) — back to the index rather than a dead page.
  if (!lesson) return <Navigate to="/course" replace />;

  const domain = cert.domains.find((d) => d.code === lesson.domainCode);
  const done = data.progress[lesson.id] !== undefined;
  const flagged = data.flagged.includes(lesson.id);
  const prev = data.lessons[idx - 1];
  const next = data.lessons[idx + 1];

  function goToLesson(id: string) {
    navigate(`/course/${id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link to="/course" className="hover:text-foreground hover:underline">
          Course
        </Link>
        <span>/</span>
        {domain && (
          <span>
            {domain.code} {domain.name}
          </span>
        )}
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{lesson.title}</h1>
          {done && <Badge variant="success">Read</Badge>}
          {flagged && (
            <Badge variant="outline" className="gap-1 text-weak" style={{ borderColor: "var(--weak)" }}>
              <FlagIcon className="size-3" />
              Needs review
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{lesson.estimatedMinutes} min read</p>
      </div>

      <Card>
        <CardContent className="prose-lesson pt-6">
          <Markdown>{lesson.body}</Markdown>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        {done ? (
          <>
            <Link to={`/quiz?domain=${lesson.domainCode}`}>
              <Button>Test it — questions from {lesson.domainCode}</Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              disabled={setRead.isPending}
              onClick={() => setRead.mutate({ lessonId: lesson.id, read: false })}
            >
              Mark as unread
            </Button>
          </>
        ) : (
          <Button
            disabled={setRead.isPending}
            onClick={() => setRead.mutate({ lessonId: lesson.id, read: true })}
          >
            {setRead.isPending ? <Spinner className="size-4 text-primary-foreground" /> : "Mark as read"}
          </Button>
        )}
        <Button
          variant="outline"
          size="icon"
          className="size-8 shrink-0"
          style={flagged ? { color: "var(--weak)", borderColor: "var(--weak)" } : undefined}
          disabled={setFlag.isPending}
          onClick={() => setFlag.mutate({ lessonId: lesson.id, flagged: !flagged })}
          aria-label={flagged ? "Clear flag for review" : "Flag for review"}
          title={flagged ? "Flagged for review — click to clear" : "Flag for review"}
        >
          <FlagIcon className="size-4" />
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" disabled={!prev} onClick={() => prev && goToLesson(prev.id)}>
            ← Previous
          </Button>
          <Button variant="outline" disabled={!next} onClick={() => next && goToLesson(next.id)}>
            Next →
          </Button>
        </div>
      </div>
    </div>
  );
}
