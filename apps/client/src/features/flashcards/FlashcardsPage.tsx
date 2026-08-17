import { useEffect, useMemo, useRef, useState } from "react";
import type { FlashcardStatus } from "@comptia/shared-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Spinner } from "@/components/ui/spinner";
import { useFlashcards, useSaveFlashcardState, useSetCardStatus } from "@/lib/api";
import { useCert } from "@/lib/cert-context";
import { cn } from "@/lib/utils";

/**
 * Deterministic shuffle — stable for a given seed, so a saved position can
 * reconstruct the exact deck order (see the state-hydration effect below).
 *
 * The seed must be mixed *into* each character, not accumulated alongside
 * them. The obvious `h = h*31 + charCode` loop folds the seed in once at the
 * start and then multiplies it by 31 per character — since every card id here
 * is the same length, that makes the seed a constant offset identical for all
 * cards, which cancels out in the comparison and leaves the original order
 * untouched (i.e. shuffle does nothing). Xor-ing the seed through each byte
 * with an avalanche step keeps it entangled with the whole string.
 */
function seededOrder<T extends { id: string }>(cards: T[], seed: number): T[] {
  if (seed === 0) return cards;
  const key = (s: string) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      h = Math.imul(h ^ s.charCodeAt(i), 0x5bd1e995);
      h ^= h >>> 15;
    }
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
    return h >>> 0;
  };
  return [...cards].sort((a, b) => key(a.id) - key(b.id));
}

/** Shared by the live deck and by hydration, so a restored index is clamped
 *  against the same filter it was saved against, not a stale approximation. */
function filterDeck<T extends { id: string; domainCode: string }>(
  cards: T[],
  progress: Record<string, FlashcardStatus>,
  domain: string | null,
  hideKnown: boolean,
): T[] {
  let out = cards;
  if (domain) out = out.filter((c) => c.domainCode === domain);
  if (hideKnown) out = out.filter((c) => progress[c.id] !== "known");
  return out;
}

const SAVE_DEBOUNCE_MS = 600;

export function FlashcardsPage() {
  const cert = useCert();
  const { data, isPending } = useFlashcards(cert.id);
  const setStatus = useSetCardStatus(cert.id);
  const saveState = useSaveFlashcardState();

  const [domain, setDomain] = useState<string | null>(null);
  const [hideKnown, setHideKnown] = useState(false);
  const [seed, setSeed] = useState(0);
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);

  // Restores the server-saved position exactly once, the first time this
  // cert's deck loads. Guarded by a ref rather than a data-driven condition,
  // so a later refetch (e.g. after marking a card) never re-applies stale
  // saved state over what the user is actively doing.
  const hydrated = useRef(false);
  useEffect(() => {
    if (!data || hydrated.current) return;
    hydrated.current = true;
    const s = data.state;
    if (!s) return;
    setDomain(s.domainCode);
    setHideKnown(s.hideKnown);
    setSeed(s.seed);
    // Clamped against the deck that filter set actually produces, not the
    // stored index blindly — a card added or removed from the pack since the
    // last save shouldn't be able to strand the position past the end.
    const filtered = filterDeck(data.cards, data.progress, s.domainCode, s.hideKnown);
    setIndex(filtered.length > 0 ? Math.min(s.cardIndex, filtered.length - 1) : 0);
  }, [data]);

  // Debounced save so flipping through several cards in a row costs one
  // request, not one per card. Only armed after hydration, so the initial
  // default state (before the server's saved state has been applied) can
  // never overwrite it.
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => {
      saveState.mutate({ certId: cert.id, domainCode: domain, hideKnown, seed, cardIndex: index });
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cert.id, domain, hideKnown, seed, index]);

  const deck = useMemo(
    () => seededOrder(filterDeck(data?.cards ?? [], data?.progress ?? {}, domain, hideKnown), seed),
    [data, domain, hideKnown, seed],
  );

  const scopeCards = useMemo(() => {
    let cards = data?.cards ?? [];
    if (domain) cards = cards.filter((c) => c.domainCode === domain);
    return cards;
  }, [data, domain]);
  const knownInScope = scopeCards.filter((c) => data?.progress[c.id] === "known").length;

  if (isPending || !data) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="size-8" />
      </div>
    );
  }

  const card = deck[Math.min(index, deck.length - 1)];
  const done = deck.length === 0 || index >= deck.length;
  const shuffled = seed !== 0;

  function selectDomain(code: string | null) {
    setDomain(code);
    setIndex(0);
    setFlipped(false);
  }

  function mark(status: "known" | "learning") {
    if (!card) return;
    setStatus.mutate({ cardId: card.id, status });
    setFlipped(false);
    setIndex((i) => i + 1);
  }

  function step(delta: number) {
    setFlipped(false);
    setIndex((i) => Math.max(0, Math.min(deck.length - 1, i + delta)));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Flashcards</h1>
          <p className="text-sm text-muted-foreground">
            {knownInScope} of {scopeCards.length} known in this view
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant={hideKnown ? "default" : "outline"}
            size="sm"
            onClick={() => {
              setHideKnown((v) => !v);
              setIndex(0);
              setFlipped(false);
            }}
          >
            Hide known
          </Button>
          <Button
            variant={shuffled ? "default" : "outline"}
            size="sm"
            onClick={() => {
              // Toggle, not always-randomize: once shuffled, the same button
              // takes you back to pack order rather than only ever re-rolling.
              setSeed((s) => (s === 0 ? Date.now() : 0));
              setIndex(0);
              setFlipped(false);
            }}
          >
            {shuffled ? "Original order" : "Shuffle"}
          </Button>
        </div>
      </div>

      <Progress value={scopeCards.length > 0 ? (knownInScope / scopeCards.length) * 100 : 0} />

      <div className="flex flex-wrap gap-2">
        <Button
          variant={domain === null ? "secondary" : "ghost"}
          size="sm"
          onClick={() => selectDomain(null)}
        >
          All domains
        </Button>
        {cert.domains.map((d) => (
          <Button
            key={d.code}
            variant={domain === d.code ? "secondary" : "ghost"}
            size="sm"
            onClick={() => selectDomain(d.code)}
          >
            {d.code} {d.name}
          </Button>
        ))}
      </div>

      {done ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-lg font-medium">
              {deck.length === 0 ? "Nothing to review here." : "Deck complete 🎉"}
            </p>
            <p className="text-sm text-muted-foreground">
              {deck.length === 0
                ? "Every card in this view is marked known."
                : "Run it again or switch domains."}
            </p>
            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setIndex(0);
                  setFlipped(false);
                }}
              >
                Restart deck
              </Button>
              {hideKnown && (
                <Button variant="outline" onClick={() => setHideKnown(false)}>
                  Show known cards
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        card && (
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => setFlipped((f) => !f)}
              className={cn(
                "block w-full rounded-lg border border-border bg-card p-8 text-left shadow-sm transition-colors hover:border-ring/50",
                "min-h-56 md:min-h-64",
              )}
            >
              <div className="mb-4 flex items-center justify-between">
                <Badge variant="accent">
                  {card.domainCode} ·{" "}
                  {cert.domains.find((d) => d.code === card.domainCode)?.name ?? ""}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {index + 1} / {deck.length}
                  {data.progress[card.id] && (
                    <Badge
                      variant={data.progress[card.id] === "known" ? "success" : "secondary"}
                      className="ml-2"
                    >
                      {data.progress[card.id]}
                    </Badge>
                  )}
                </span>
              </div>
              <div className="text-lg leading-relaxed">{flipped ? card.back : card.front}</div>
              <div className="mt-6 text-xs text-muted-foreground">
                {flipped ? "Click to see the question" : "Click to reveal the answer"}
              </div>
            </button>

            <div className="flex items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => step(-1)} disabled={index === 0}>
                ← Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => mark("learning")}
                  disabled={setStatus.isPending}
                >
                  Still learning
                </Button>
                <Button onClick={() => mark("known")} disabled={setStatus.isPending}>
                  Got it
                </Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => step(1)}>
                Skip →
              </Button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
