import { z } from 'zod';

export const fantraxLeagueId = z.string().regex(/^[a-z0-9]{16}$/);
const money = z
  .number()
  .finite()
  .nonnegative()
  .transform((value) => Math.round(value * 100));
export const fantraxLeagueSchema = z.object({
  leagueName: z.string(),
  seasonYear: z.number().int(),
  draftType: z.literal('auction'),
  draftSettings: z.object({ budget: money, minimumBid: money, minimumBidIncrement: money }),
  rosterInfo: z.object({ maxTotalPlayers: z.number().int().positive() }),
  teamInfo: z.record(z.string(), z.object({ name: z.string(), id: z.string() })),
  scoringSystem: z.object({
    type: z.string(),
    scoringCategories: z.record(z.string(), z.record(z.string(), z.unknown())),
  }),
});
const resultsSchema = z.object({
  draftDate: z
    .string()
    .refine((value) => Number.isFinite(Date.parse(value)))
    .nullish(),
  draftState: z.string(),
  draftType: z.literal('auction'),
  draftPicks: z.array(
    z.object({
      pick: z.number().int().positive(),
      playerId: z.string().nullable().optional(),
      teamId: z.string(),
      bid: money.nullable().optional(),
      time: z.number().nullable().optional(),
    }),
  ),
});
export const catalogSchema = z.record(
  z.string(),
  z.object({
    name: z.string(),
    team: z.string().optional(),
    position: z.string().optional(),
  }),
);
export interface SavedLiveLeague {
  id: string;
  name: string;
  teamId: string;
}

export interface LiveDraftPick {
  pick: number;
  playerId: string;
  playerName: string;
  position: string;
  teamId: string;
  teamName: string;
  priceCents: number;
  pickedAt: string | null;
}
export interface LiveDraftSnapshot {
  leagueId: string;
  leagueName: string;
  season: number;
  draftAt: string | null;
  providerState: string;
  fetchedAt: string;
  budgetCents: number;
  minimumBidCents: number;
  incrementCents: number;
  rosterSize: number;
  scoringType: string;
  categories: string[];
  teams: { id: string; name: string }[];
  picks: LiveDraftPick[];
  warnings: string[];
  recording: 'saved' | 'unavailable' | 'disabled';
}

export function normalizeLiveDraft(
  leagueId: string,
  leagueInput: unknown,
  resultsInput: unknown,
  catalogInput: unknown,
  fetchedAt = new Date().toISOString(),
): LiveDraftSnapshot {
  fantraxLeagueId.parse(leagueId);
  const league = fantraxLeagueSchema.parse(leagueInput);
  const result = resultsSchema.parse(resultsInput);
  const catalog = catalogSchema.parse(catalogInput);
  const picks: LiveDraftPick[] = [];
  const seen = new Set<number>();
  const players = new Set<string>();
  const warnings: string[] = [];
  for (const pick of result.draftPicks) {
    if (!pick.playerId) continue; // Fantrax can include unfilled draft slots.
    if (pick.bid == null) throw new Error(`Pick ${pick.pick} has no auction price.`);
    if (seen.has(pick.pick) || players.has(pick.playerId))
      throw new Error('Fantrax returned duplicate picks or players.');
    if (!league.teamInfo[pick.teamId])
      throw new Error(`Pick ${pick.pick} belongs to an unknown team.`);
    seen.add(pick.pick);
    players.add(pick.playerId);
    const player = catalog[pick.playerId];
    if (!player) warnings.push(`Player ${pick.playerId} has no name in the Fantrax catalog.`);
    picks.push({
      pick: pick.pick,
      playerId: pick.playerId,
      playerName: player ? displayPlayerName(player.name) : pick.playerId,
      position: player?.position ?? 'Unknown',
      teamId: pick.teamId,
      teamName: league.teamInfo[pick.teamId].name,
      priceCents: pick.bid,
      pickedAt: pick.time == null ? null : new Date(pick.time).toISOString(),
    });
  }
  return {
    leagueId,
    leagueName: league.leagueName.trim(),
    season: league.seasonYear,
    draftAt: result.draftDate ? new Date(result.draftDate).toISOString() : null,
    providerState: result.draftState,
    fetchedAt,
    budgetCents: league.draftSettings.budget,
    minimumBidCents: league.draftSettings.minimumBid,
    incrementCents: league.draftSettings.minimumBidIncrement,
    rosterSize: league.rosterInfo.maxTotalPlayers,
    scoringType: league.scoringSystem.type,
    categories: Object.keys(league.scoringSystem.scoringCategories['PLAYER'] ?? {}),
    teams: Object.values(league.teamInfo),
    picks: picks.sort((a, b) => a.pick - b.pick),
    warnings,
    recording: 'disabled',
  };
}

export function displayPlayerName(name: string): string {
  const parts = name.split(', ');
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : name;
}

export function draftTeamState(snapshot: LiveDraftSnapshot, teamId: string, beforePick = Infinity) {
  const picks = snapshot.picks.filter((pick) => pick.teamId === teamId && pick.pick < beforePick);
  const spentCents = picks.reduce((sum, pick) => sum + pick.priceCents, 0);
  const remainingBudgetCents = snapshot.budgetCents - spentCents;
  const remainingSpots = snapshot.rosterSize - picks.length;
  const reserveCents = Math.max(0, remainingSpots - 1) * snapshot.minimumBidCents;
  const maxBidCents = remainingSpots > 0 ? Math.max(0, remainingBudgetCents - reserveCents) : 0;
  return { picks, spentCents, remainingBudgetCents, remainingSpots, reserveCents, maxBidCents };
}

export function liveDraftStorageKey(viewerId: string, leagueId: string, teamId: string): string {
  return `fantasy-basketball:live-room:v1:${viewerId}:${leagueId}:${teamId}`;
}
