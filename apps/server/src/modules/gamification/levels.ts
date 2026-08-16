/**
 * Level curve: each level costs more than the last, so early levels come
 * quickly (five questions reaches level 2) and later ones take sustained work.
 *
 * Level N requires floor(50 * (N-1)^1.5) cumulative XP. The (N-1) matters:
 * anchoring on N instead would make level 2 cost 141 XP while level 3 cost
 * only 118 more, because level 1 is pinned at zero — the first "gap" would be
 * the biggest one on the curve, which is exactly backwards.
 */
export function computeLevel(xp: number): number {
  let level = 1;
  while (xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return Math.floor(50 * Math.pow(level - 1, 1.5));
}

export function xpIntoCurrentLevel(xp: number): { current: number; needed: number } {
  const level = computeLevel(xp);
  const floor = xpForLevel(level);
  const ceiling = xpForLevel(level + 1);
  return { current: xp - floor, needed: ceiling - floor };
}
