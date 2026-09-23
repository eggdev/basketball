export type SignalTone = 'positive' | 'caution' | 'negative' | 'info' | 'neutral' | 'elite';
export function fantasyPointsTier(points: number | null | undefined): {
  label: string;
  tone: SignalTone;
  detail: string;
} {
  if (points == null || !Number.isFinite(points))
    return { label: '?', tone: 'neutral', detail: 'Projected FP/G unavailable.' };
  const label =
    points >= 22 ? 'S' : points >= 18 ? 'A' : points >= 16 ? 'B' : points >= 13 ? 'C' : 'D';
  return {
    label,
    tone:
      label === 'S'
        ? 'elite'
        : label === 'A'
          ? 'positive'
          : label === 'B'
            ? 'info'
            : label === 'C'
              ? 'caution'
              : 'neutral',
    detail:
      'Main league FP/G tiers: S ≥22; A ≥18; B ≥16; C ≥13; D <13. Uses the unrounded projection.',
  };
}
export function projectionTier(rank: number | null | undefined): {
  label: string;
  tone: SignalTone;
  detail: string;
} {
  if (rank == null || !Number.isInteger(rank) || rank < 1)
    return {
      label: '?',
      tone: 'neutral',
      detail: 'Projection rank unavailable. No tier assigned.',
    };
  const label = rank <= 12 ? 'S' : rank <= 36 ? 'A' : rank <= 72 ? 'B' : rank <= 120 ? 'C' : 'D';
  return {
    label,
    tone: label === 'S' ? 'elite' : label === 'A' ? 'positive' : label === 'B' ? 'info' : 'neutral',
    detail: `Projection rank #${rank}. S: 1–12; A: 13–36; B: 37–72; C: 73–120; D: 121+. A rank band, not a bid recommendation or certainty grade.`,
  };
}
export const durabilityTone = (tier?: string): SignalTone =>
  tier === 'durable'
    ? 'positive'
    : tier === 'managed'
      ? 'caution'
      : tier === 'fragile'
        ? 'negative'
        : 'neutral';
export const roleTone = (direction?: string): SignalTone =>
  direction === 'up'
    ? 'positive'
    : direction === 'down'
      ? 'negative'
      : direction === 'uncertain'
        ? 'caution'
        : 'neutral';
