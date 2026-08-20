import { useState } from "react";
import { Link } from "react-router-dom";
import type { ExamReviewItem } from "@comptia/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Confetti } from "@/components/ui/confetti";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { useExamStore } from "@/stores/exam";

function GivenAnswer({ item }: { item: ExamReviewItem }) {
  if (!item.answered || !item.given) {
    return <p className="text-muted-foreground">You left this blank.</p>;
  }
  switch (item.given.type) {
    case "mc": {
      const label = item.choices?.[item.given.choiceIndex];
      return (
        <p>
          <span className="text-muted-foreground">Your answer: </span>
          {label ?? `option ${item.given.choiceIndex + 1}`}
        </p>
      );
    }
    case "multi": {
      const given = item.given;
      return (
        <div>
          <p className="text-muted-foreground">Your answers:</p>
          <ul className="mt-1 list-disc pl-5">
            {given.choiceIndices.map((idx) => (
              <li key={idx}>{item.choices?.[idx] ?? `option ${idx + 1}`}</li>
            ))}
          </ul>
        </div>
      );
    }
    case "terminal":
      return (
        <p className="font-mono text-xs">
          <span className="font-sans text-muted-foreground">Your answer: </span>
          {item.given.command}
        </p>
      );
    case "order":
      return (
        <div>
          <p className="text-muted-foreground">Your order:</p>
          <ol className="mt-1 list-decimal pl-5">
            {item.given.order.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      );
    case "match":
      return (
        <div>
          <p className="text-muted-foreground">Your matches:</p>
          <ul className="mt-1 space-y-0.5">
            {Object.entries(item.given.pairs).map(([left, right]) => (
              <li key={left}>
                <span className="font-medium">{left}</span> — {right}
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

function CorrectAnswer({ item }: { item: ExamReviewItem }) {
  switch (item.solution.type) {
    case "mc":
      return (
        <p>
          <span className="text-muted-foreground">Correct: </span>
          {item.choices?.[item.solution.answerIndex] ?? `option ${item.solution.answerIndex + 1}`}
        </p>
      );
    case "multi": {
      const solution = item.solution;
      return (
        <div>
          <p className="text-muted-foreground">Correct answers:</p>
          <ul className="mt-1 list-disc pl-5">
            {solution.answerIndices.map((idx) => (
              <li key={idx}>{item.choices?.[idx] ?? `option ${idx + 1}`}</li>
            ))}
          </ul>
        </div>
      );
    }
    case "terminal":
      return (
        <p className="font-mono text-xs">
          <span className="font-sans text-muted-foreground">Correct: </span>
          {item.solution.expected.join("  or  ")}
        </p>
      );
    case "order":
      return (
        <div>
          <p className="text-muted-foreground">Correct order:</p>
          <ol className="mt-1 list-decimal pl-5">
            {item.solution.order.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      );
    case "match":
      return (
        <div>
          <p className="text-muted-foreground">Correct matches:</p>
          <ul className="mt-1 space-y-0.5">
            {item.solution.pairs.map((p) => (
              <li key={p.left}>
                <span className="font-medium">{p.left}</span> — {p.right}
              </li>
            ))}
          </ul>
        </div>
      );
  }
}

export function ExamResults() {
  const { result, reset } = useExamStore();
  const [filter, setFilter] = useState<"all" | "wrong">("wrong");

  if (!result) return null;
  const mins = Math.floor(result.timeSpentSeconds / 60);
  const secs = result.timeSpentSeconds % 60;
  // Number each item by its real position in the exam, not its position in the
  // filtered list — "#1" has to mean the question you saw first.
  const numbered = result.review.map((item, i) => ({ item, number: i + 1 }));
  const shown = numbered.filter(({ item }) => (filter === "wrong" ? !item.correct : true));
  const wrongCount = result.review.filter((r) => !r.correct).length;

  return (
    <div className="space-y-6">
      {/* Passing a full mock is the milestone this whole app exists for. */}
      <Confetti active={result.passed} intensity="large" />
      <Card className={result.passed ? "border-success" : "border-destructive"}>
        <CardHeader className="items-center text-center">
          <CardDescription>
            {result.expired ? "Time expired — scored where you left it" : "Exam complete"}
          </CardDescription>
          <CardTitle className={cn("stat-numeral text-6xl", result.passed && "animate-pop")}>
            {result.scaledScore}
          </CardTitle>
          <Badge variant={result.passed ? "success" : "secondary"} className="mt-1">
            {result.passed ? "PASS" : "FAIL"} · {result.passingScaledScore} needed
          </Badge>
          <CardDescription className="mt-2">
            {result.correct} of {result.total} correct ({result.score}%) · {mins}m {secs}s of{" "}
            {Math.round(result.timeLimitSeconds / 60)}m
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-xs text-muted-foreground">
            The {result.scaledScore} is an approximation of CompTIA's 100–900 scale, anchored so the
            pass mark matches the real threshold. Treat the pass/fail and the domain breakdown as
            the signal.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">By domain</CardTitle>
          <CardDescription>Where the points came from, and where they didn't.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {result.perDomain.map((d) => (
            <div key={d.code}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="font-medium">
                  {d.code} {d.name}
                </span>
                <span className="text-muted-foreground">
                  {d.correct}/{d.total}
                </span>
              </div>
              <Progress value={d.total > 0 ? (d.correct / d.total) * 100 : 0} />
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Review</CardTitle>
              <CardDescription>
                The real exam never shows you this. Since you're studying, here it is.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={filter === "wrong" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("wrong")}
              >
                Missed ({wrongCount})
              </Button>
              <Button
                variant={filter === "all" ? "default" : "outline"}
                size="sm"
                onClick={() => setFilter("all")}
              >
                All ({result.review.length})
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {shown.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nothing missed — a clean sweep.
            </p>
          )}
          {shown.map(({ item, number }) => (
            <div
              key={item.questionId}
              className={cn(
                "rounded-md border p-4",
                item.correct ? "border-success/50 bg-success/5" : "border-destructive/50 bg-destructive/5",
              )}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant={item.correct ? "success" : "secondary"}>
                  {item.correct ? "Correct" : item.answered ? "Incorrect" : "Unanswered"}
                </Badge>
                <Badge variant="outline">{item.domainCode}</Badge>
                <span className="text-xs text-muted-foreground">Question {number}</span>
              </div>
              <p className="font-medium">{item.prompt}</p>
              <div className="mt-3 space-y-2 text-sm">
                {!item.correct && <GivenAnswer item={item} />}
                <CorrectAnswer item={item} />
                <p className="text-muted-foreground">{item.explanation}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-center gap-2">
        <Button onClick={reset}>Take another exam</Button>
        <Link to="/dashboard">
          <Button variant="outline">Back to dashboard</Button>
        </Link>
      </div>
    </div>
  );
}
