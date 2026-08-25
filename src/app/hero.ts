// Single shared source of truth for "which hero photo is showing right
// now" — used by GlobalBackground.tsx (the fixed app-wide background)
// and by Home's own Hero.tsx content overlay, so the two can never
// disagree about which picture is on screen. Previously this logic
// lived only inside Hero.tsx and only Home ever rendered the photo at
// all — Library, Collections, Book Detail, etc. showed no photo once
// you navigated away from Home. Moving it here, with GlobalBackground
// as the one place that actually paints the image, is what fixes that.

export const HERO_COUNT = 45;
const ROTATION_PERIOD_DAYS = 3;

// public/Hero/hero_1.webp .. hero_45.webp were audited by content hash
// (md5) rather than by filename: several numbers turned out to be
// byte-identical duplicates of another number in the set. Per
// instruction, the files themselves are NOT renamed or deleted (some
// other part of the app, or a future one, may still reference a
// specific number) — instead, one number from each duplicate pair is
// left out of the rotation sequence below, so a visitor never lands on
// the same picture twice in a row just because two different numbers
// happen to be the same file. Each pair below is [number kept in the
// sequence, number skipped as a byte-identical duplicate of it].
const DUPLICATE_PAIRS: Array<[number, number]> = [
  [1, 2],
  [16, 40],
  [17, 18],
  [19, 41],
  [20, 32],
  [21, 28],
  [25, 42]
];

const SKIPPED_DUPLICATE_NUMBERS = new Set(DUPLICATE_PAIRS.map(([, skipped]) => skipped));

// 45 files, 7 skipped as duplicates -> 38 genuinely distinct images in
// the rotation. Computed rather than hand-transcribed so this can never
// silently drift out of sync with DUPLICATE_PAIRS above.
const UNIQUE_HERO_SEQUENCE: number[] = Array.from({ length: HERO_COUNT }, (_, i) => i + 1)
  .filter(n => !SKIPPED_DUPLICATE_NUMBERS.has(n));

export function heroImagePath(n: number): string {
  return `${import.meta.env.BASE_URL}Hero/hero_${n}.webp`;
}

// Deterministic, date-based rotation: no timer, no localStorage, no
// backend, no randomness. The image is a pure function of the current
// UTC calendar date, so every reload within the same 3-day window
// resolves to the exact same picture, and it advances sequentially
// through the unique sequence every 3 calendar days, wrapping back to
// the start once it reaches the end. Using UTC (not local time) means
// the change happens at the same instant for everyone, regardless of
// the visitor's timezone.
export function getCurrentHeroNumber(): number {

  const now = new Date();

  const daysSinceEpoch = Math.floor(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86_400_000
  );

  const periodIndex = Math.floor(daysSinceEpoch / ROTATION_PERIOD_DAYS);
  const sequenceIndex = periodIndex % UNIQUE_HERO_SEQUENCE.length;

  return UNIQUE_HERO_SEQUENCE[sequenceIndex];

}

export function getCurrentHeroImagePath(): string {
  return heroImagePath(getCurrentHeroNumber());
}
