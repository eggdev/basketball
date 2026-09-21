export type SignalTone = 'positive' | 'caution' | 'negative' | 'info' | 'neutral' | 'elite';
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
