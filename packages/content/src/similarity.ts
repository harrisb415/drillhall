/**
 * Near-duplicate detection for question banks.
 *
 * Exact-id collisions already fail validation. This catches the subtler
 * problem that appears once a bank grows past a few hundred questions:
 * two questions that ask the same thing in slightly different words. They
 * inflate the apparent size of the bank without adding coverage, and they
 * make a mock feel repetitive for a reason the counts do not explain.
 *
 * Deliberately lexical rather than semantic — no model, no embeddings, runs
 * in CI in milliseconds. It will miss a genuine paraphrase that shares no
 * vocabulary, and that is an acceptable trade for a check that never flakes.
 */

/** Words carrying no discriminating signal in exam prompts. */
const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "then", "than", "that", "this", "these", "those",
  "is", "are", "was", "were", "be", "been", "being", "am", "do", "does", "did", "doing",
  "have", "has", "had", "having", "will", "would", "should", "could", "can", "may", "might", "must",
  "of", "to", "in", "on", "at", "by", "for", "with", "from", "as", "into", "onto", "over", "under",
  "it", "its", "they", "them", "their", "he", "she", "his", "her", "you", "your", "we", "our",
  "which", "what", "who", "whom", "whose", "when", "where", "why", "how",
  "not", "no", "also", "only", "just", "very", "more", "most", "some", "any", "all", "each",
  "one", "two", "there", "here", "so", "up", "out", "about", "after", "before", "while",
  // exam-prompt boilerplate: present in nearly every question, so it dilutes real signal
  "technician", "user", "users", "company", "following", "best", "first", "least", "most",
  "likely", "next", "should", "scenario", "given", "describes", "called", "cause", "issue",
]);

export function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s.+/-]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

/** Jaccard similarity of two token sets, 0..1. */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const t of a) if (b.has(t)) shared++;
  return shared / (a.size + b.size - shared);
}

export interface SimilarPair {
  a: string;
  b: string;
  score: number;
  aPrompt: string;
  bPrompt: string;
}

/**
 * Finds question pairs whose prompts overlap above `threshold`.
 *
 * Only compares within a domain: two questions in different domains that share
 * vocabulary are testing different objectives and are not duplicates, however
 * similar the wording.
 */
export function findSimilarPairs(
  questions: { id: string; prompt: string; domainCode: string }[],
  threshold = 0.6,
): SimilarPair[] {
  const byDomain = new Map<string, { id: string; prompt: string; tokens: Set<string> }[]>();
  for (const q of questions) {
    const entry = { id: q.id, prompt: q.prompt, tokens: tokenize(q.prompt) };
    const list = byDomain.get(q.domainCode);
    if (list) list.push(entry);
    else byDomain.set(q.domainCode, [entry]);
  }

  const out: SimilarPair[] = [];
  for (const list of byDomain.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const score = jaccard(list[i]!.tokens, list[j]!.tokens);
        if (score >= threshold) {
          out.push({
            a: list[i]!.id,
            b: list[j]!.id,
            score: Math.round(score * 100) / 100,
            aPrompt: list[i]!.prompt,
            bPrompt: list[j]!.prompt,
          });
        }
      }
    }
  }
  return out.sort((x, y) => y.score - x.score);
}
