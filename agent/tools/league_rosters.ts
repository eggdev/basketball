import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';
import { defineTool } from 'eve/tools';
import { z } from 'zod';

const inputSchema = z.object({
  limit: z.number().int().min(1).max(12).default(12),
  season: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .describe('Optional league season, such as 2025-26. Defaults to the latest populated roster.'),
  teamQuery: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional partial team name, owner name, or rostered player name.'),
});

const outputSchema = z.object({
  availableSeasons: z.array(z.string()),
  methodology: z.string(),
  rosterStatus: z.enum(['complete', 'empty', 'partial']),
  season: z.string(),
  teams: z.array(
    z.object({
      baseBudgetBalanceDollars: z.number(),
      ownerName: z.string().nullable(),
      roster: z.array(
        z.object({
          auctionCostDollars: z.number(),
          playerName: z.string(),
          rosterSlot: z.number().nullable(),
        }),
      ),
      rosterCount: z.number(),
      spendDollars: z.number(),
      teamName: z.string(),
    }),
  ),
  totalSpendDollars: z.number(),
});

const toDollars = (cents: number) => cents / 100;

export default defineTool({
  description:
    'Inspect canonical team owners, validated draft rosters, auction spend, and balance against the base budget by season. Use this for roster comparisons, team construction, draft value, and trade analysis. This is a draft snapshot and does not yet include later trades or waiver transactions.',
  inputSchema,
  outputSchema,
  label: {
    start: ({ season, teamQuery }) =>
      teamQuery
        ? `Load roster for ${teamQuery}`
        : `Load ${season ?? 'latest populated'} league rosters`,
    complete: (_input, output) => `Loaded ${output.teams.length} team rosters for ${output.season}`,
  },
  async execute({ limit, season, teamQuery }) {
    const config = await Effect.runPromise(loadDatabaseConfig());
    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.leagueRosterSnapshot;
      }).pipe(Effect.provide(databaseLayer(config))),
    );
    const seasonKey =
      season ?? snapshot.summary.latestPopulatedSeason ?? snapshot.summary.latestSeason;
    const selectedSeason = snapshot.seasons.find((candidate) => candidate.seasonKey === seasonKey);
    if (selectedSeason === undefined) {
      throw new Error(
        `Roster season ${seasonKey ?? 'unknown'} is unavailable. Available seasons: ${snapshot.seasons.map((candidate) => candidate.seasonKey).join(', ')}`,
      );
    }

    const normalizedQuery = teamQuery?.toLocaleLowerCase() ?? null;
    const teams = selectedSeason.teams
      .filter(
        (team) =>
          normalizedQuery === null ||
          team.teamName.toLocaleLowerCase().includes(normalizedQuery) ||
          team.owner?.displayName.toLocaleLowerCase().includes(normalizedQuery) === true ||
          team.roster.some((player) =>
            player.playerName.toLocaleLowerCase().includes(normalizedQuery),
          ),
      )
      .slice(0, limit)
      .map((team) => ({
        baseBudgetBalanceDollars: toDollars(team.baseBudgetBalanceCents),
        ownerName: team.owner?.displayName ?? null,
        roster: team.roster.map((player) => ({
          auctionCostDollars: toDollars(player.auctionCostCents),
          playerName: player.playerName,
          rosterSlot: player.rosterSlot,
        })),
        rosterCount: team.rosterCount,
        spendDollars: toDollars(team.spendCents),
        teamName: team.teamName,
      }));

    return {
      availableSeasons: snapshot.seasons.map((candidate) => candidate.seasonKey),
      methodology:
        'Rosters are reconstructed from validated Fantrax auction results and joined to manually verified canonical owners. Budget balance is measured against the $200 base budget and does not yet include traded or awarded dollars. Post-draft trades and waiver moves are not represented.',
      rosterStatus: selectedSeason.rosterStatus,
      season: selectedSeason.seasonKey,
      teams,
      totalSpendDollars: toDollars(selectedSeason.totalSpendCents),
    };
  },
});
