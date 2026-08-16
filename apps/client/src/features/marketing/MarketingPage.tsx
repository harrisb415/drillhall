import { Link, Navigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCatalog } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { ReadinessPreview } from "./ReadinessPreview";

const TYPE_LABELS: Record<string, string> = {
  mc: "Multiple choice",
  order: "Drag-to-order",
  match: "Matching",
  terminal: "Terminal sim",
};

const FEATURES = [
  {
    title: "Flashcards that track what you know",
    body: "Mark cards known or still-learning, filter by domain, shuffle the deck, and hide what you've already got down. Progress is saved per certification.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
        <rect x="3" y="6" width="14" height="12" rx="2" />
        <path d="M7 6V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-1" />
      </svg>
    ),
  },
  {
    title: "Performance-based questions, not just A/B/C/D",
    body: "Drag the malware-removal steps into order, match attacks to their descriptions, or type the actual command into a real terminal. The same question types the exam uses.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m6 9 3 3-3 3M13 15h5" />
      </svg>
    ),
  },
  {
    title: "Readiness scoring that's honest",
    body: "Recent answers count more than last month's, and each domain counts toward your score in proportion to its real exam weight — so untouched material actually lowers your readiness instead of hiding.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
        <path d="M3 3v18h18" />
        <path d="m7 15 4-5 3 3 5-7" />
      </svg>
    ),
  },
  {
    title: "Reference sheets for fast lookup",
    body: "Port numbers, Wi-Fi standards, RAID levels, cable types, command-line cheat sheets — searchable, so you're not digging through a textbook mid-review.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="size-5">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4a2 2 0 0 0-2-2H6.5A2.5 2.5 0 0 0 4 4.5z" />
        <path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" />
      </svg>
    ),
  },
];

export function MarketingPage() {
  const { data: session } = authClient.useSession();
  const { data: catalog } = useCatalog();

  // Deliberately not blocking on the session check: this is the public front
  // door, and making every signed-out visitor watch a spinner while we ask
  // whether they happen to be logged in is the wrong trade. Signed-in visitors
  // just get redirected a moment later.
  if (session) return <Navigate to="/dashboard" replace />;

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <span className="text-lg font-semibold tracking-tight">Drillhall</span>
          <nav className="flex items-center gap-2">
            <Link to="/login">
              <Button variant="ghost" size="sm">
                Log in
              </Button>
            </Link>
            <Link to="/register">
              <Button size="sm">Sign up</Button>
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4">
        <section className="py-16 text-center md:py-24">
          <Badge variant="accent" className="mb-5">
            Self-hosted · invite-only
          </Badge>
          <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight md:text-5xl">
            Study for CompTIA certs without the $40/month subscription
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Flashcards, performance-based questions, and readiness scoring that tells you what you
            actually still need to study. Runs on one machine, shared with whoever you invite.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/register" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto">
                Create a free account
              </Button>
            </Link>
            <Link to="/login" className="w-full sm:w-auto">
              <Button size="lg" variant="outline" className="w-full sm:w-auto">
                I already have one
              </Button>
            </Link>
          </div>

          <div className="mt-14">
            <ReadinessPreview />
          </div>

          {catalog && (
            <dl className="mx-auto mt-10 grid max-w-2xl grid-cols-3 gap-4">
              {[
                { label: catalog.totals.certs === 1 ? "Certification" : "Certifications", value: catalog.totals.certs },
                { label: "Practice questions", value: catalog.totals.quizQuestions },
                { label: "Flashcards", value: catalog.totals.flashcards },
              ].map((stat) => (
                <div key={stat.label} className="rounded-lg border border-border bg-card p-4">
                  <dd className="stat-numeral text-3xl font-bold">{stat.value}</dd>
                  <dt className="mt-1 text-xs text-muted-foreground">{stat.label}</dt>
                </div>
              ))}
            </dl>
          )}
        </section>

        <section className="border-t border-border py-16">
          <h2 className="text-center text-2xl font-bold tracking-tight">What you get</h2>
          <div className="mt-10 grid gap-5 md:grid-cols-2">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <CardHeader>
                  <span className="flex size-9 items-center justify-center rounded-md bg-accent text-accent-foreground">
                    {feature.icon}
                  </span>
                  <CardTitle className="mt-2 text-base">{feature.title}</CardTitle>
                  <CardDescription className="leading-relaxed">{feature.body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </section>

        {catalog && catalog.certs.length > 0 && (
          <section className="border-t border-border py-16">
            <h2 className="text-center text-2xl font-bold tracking-tight">Available now</h2>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Switch between certifications any time — progress is tracked separately for each.
            </p>
            <div className="mt-10 grid gap-5 sm:grid-cols-2">
              {catalog.certs.map((cert) => (
                <Card key={cert.code}>
                  <CardHeader>
                    <CardTitle>{cert.name}</CardTitle>
                    <CardDescription>Exam {cert.version}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-muted-foreground">
                      {cert.domains} domains · {cert.quizQuestions} questions · {cert.flashcards}{" "}
                      flashcards
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {cert.questionTypes.map((type) => (
                        <Badge key={type} variant="secondary">
                          {TYPE_LABELS[type] ?? type}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        <section className="border-t border-border py-16 text-center">
          <h2 className="text-2xl font-bold tracking-tight">Ready to start?</h2>
          <p className="mx-auto mt-3 max-w-md text-muted-foreground">
            Sign up with an email and password, or use Google if it's enabled on this instance.
          </p>
          <Link to="/register">
            <Button size="lg" className="mt-6">
              Create a free account
            </Button>
          </Link>
        </section>
      </main>

      <footer className="border-t border-border py-8 text-center text-xs text-muted-foreground">
        Drillhall · self-hosted study platform. Not affiliated with or endorsed by CompTIA.
      </footer>
    </div>
  );
}
