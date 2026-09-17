import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';
import { defineTool } from 'eve/tools';
import { z } from 'zod';

const inputSchema = z.object({
  memberQuery: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional partial canonical manager or historical team name.'),
  limit: z.number().int().min(1).max(12).default(6),
});

const outputSchema = z.object({
  members: z.array(
    z.object({
      displayName: z.string(),
      favoritePlayers: z.array(
        z.object({
          averagePriceDollars: z.number(),
          draftCount: z.number(),
          latestSeason: z.string(),
          playerName: z.string(),
          totalSpendDollars: z.number(),
        }),
      ),
      purchaseCount: z.number(),
      seasons: z.array(
        z.object({
          averagePriceDollars: z.number(),
          identityResolution: z.string(),
          purchaseCount: z.number(),
          season: z.string(),
          teamName: z.string(),
          totalSpendDollars: z.number(),
        }),
      ),
      teamNames: z.array(z.string()),
      totalSpendDollars: z.number(),
    }),
  ),
  methodology: z.string(),
  returnedMemberCount: z.number(),
  summary: z.object({
    canonicalMemberCount: z.number(),
    latestSeason: z.string().nullable(),
    resolvedTeamSeasonCount: z.number(),
    seasonCount: z.number(),
    teamSeasonCount: z.number(),
    unresolvedTeamSeasonCount: z.number(),
  }),
});

const toDollars = (cents: number) => cents / 100;

export default defineTool({
  description:
    'Inspect canonical league-member draft history across renamed Fantrax teams. Use this for manager tendencies, repeat targets, historical team names, and observed draft preferences. Unresolved team-seasons are intentionally excluded from member profiles.',
  inputSchema,
  outputSchema,
  label: {
    start: ({ memberQuery }) =>
      memberQuery ? `Profile ${memberQuery}'s draft history` : 'Load league draft tendencies',
    complete: (_input, output) => `Loaded ${output.returnedMemberCount} canonical league profiles`,
  },
  async execute({ limit, memberQuery }) {
    const config = await Effect.runPromise(loadDatabaseConfig());
    const history = await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.leagueTeamHistory;
      }).pipe(Effect.provide(databaseLayer(config))),
    );
    const normalizedQuery = memberQuery?.toLocaleLowerCase() ?? null;
    const members = history.members
      .filter(
        (member) =>
          normalizedQuery === null ||
          member.displayName.toLocaleLowerCase().includes(normalizedQuery) ||
          member.teamNames.some((teamName) =>
            teamName.toLocaleLowerCase().includes(normalizedQuery),
          ),
      )
      .slice(0, limit)
      .map((member) => ({
        displayName: member.displayName,
        favoritePlayers: member.favoritePlayers.map((player) => ({
          averagePriceDollars: toDollars(player.averagePriceCents),
          draftCount: player.draftCount,
          latestSeason: player.latestSeason,
          playerName: player.playerName,
          totalSpendDollars: toDollars(player.totalSpendCents),
        })),
        purchaseCount: member.purchaseCount,
        seasons: member.seasons.map((season) => ({
          averagePriceDollars: toDollars(season.averagePriceCents),
          identityResolution: season.identityResolution,
          purchaseCount: season.purchaseCount,
          season: season.seasonKey,
          teamName: season.teamName,
          totalSpendDollars: toDollars(season.totalSpendCents),
        })),
        teamNames: member.teamNames,
        totalSpendDollars: toDollars(member.totalSpendCents),
      }));

    return {
      members,
      methodology:
        'Profiles group season-specific Fantrax teams through explicit aliases, observed manager labels, or exact historical team-name continuity. Fuzzy guesses are excluded. Favorite players rank repeat selections first, then total historical spend.',
      returnedMemberCount: members.length,
      summary: history.summary,
    };
  },
});
