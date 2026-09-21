import type {
  LeaguePerformanceSeason,
  LeagueRosterSeason,
  LeagueTeamHistory,
} from '@fantasy-basketball/database/runtime';
import { leagueOwnerProfile } from '@fantasy-basketball/fantasy';

/** Identity is resolved through the canonical member record, never a similar team name. */
export function ownerMemberId(history: LeagueTeamHistory | null): string | null {
  return (
    history?.members.find((member) => member.canonicalKey === leagueOwnerProfile.canonicalKey)
      ?.memberId ?? null
  );
}

export function teamForOwner(
  season: LeagueRosterSeason | null | undefined,
  memberId: string | null,
) {
  return memberId
    ? (season?.teams.find((team) => team.owner?.memberId === memberId) ?? null)
    : null;
}

export type LeagueLens =
  | 'allPlayWinPercentage'
  | 'averageWeeklyScore'
  | 'averageActiveGames'
  | 'luckWins';
export const leagueLenses: Record<
  LeagueLens,
  { label: string; explanation: string; format: (value: number) => string }
> = {
  allPlayWinPercentage: {
    label: 'All-play strength',
    explanation:
      'Win rate against every team each week. Compare strength with less schedule noise.',
    format: (value) => `${Math.round(value * 100)}%`,
  },
  averageWeeklyScore: {
    label: 'Weekly scoring',
    explanation:
      'Average regular-season points. A measure of total scoring output, not a forecast.',
    format: (value) => value.toLocaleString('en-US', { maximumFractionDigits: 1 }),
  },
  averageActiveGames: {
    label: 'Lineup volume',
    explanation:
      'Average active player games per week. Explore whether a scoring gap comes from lineup volume.',
    format: (value) => value.toFixed(1),
  },
  luckWins: {
    label: 'Schedule luck',
    explanation:
      'Actual wins minus expected wins. Positive values mean the schedule helped; more luck is not more skill.',
    format: (value) => `${value > 0 ? '+' : ''}${value.toFixed(1)}`,
  },
};
export function rankLeague(season: LeaguePerformanceSeason | null | undefined, lens: LeagueLens) {
  return [...(season?.teams ?? [])].sort((a, b) => b[lens] - a[lens] || a.rank - b.rank);
}
