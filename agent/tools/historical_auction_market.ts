import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';
import { defineTool } from 'eve/tools';
import { z } from 'zod';

const inputSchema = z.object({
  playerQuery: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional partial player name, such as Jokic or Shai.'),
  limit: z.number().int().min(1).max(25).default(10),
});

const marketPlayerSchema = z.object({
  averagePriceDollars: z.number(),
  expectedPriceDollars: z.number(),
  latestPriceDollars: z.number(),
  latestSeason: z.string(),
  maximumPriceDollars: z.number(),
  minimumPriceDollars: z.number(),
  name: z.string(),
  previousPriceDollars: z.number().nullable(),
  seasonsDrafted: z.number(),
  trendDollars: z.number().nullable(),
});

const outputSchema = z.object({
  latestSeason: z.string().nullable(),
  methodology: z.string(),
  playerQuery: z.string().nullable(),
  players: z.array(marketPlayerSchema),
  returnedPlayerCount: z.number(),
  sample: z.object({
    playerCount: z.number(),
    purchaseCount: z.number(),
    seasonCount: z.number(),
    totalSpendDollars: z.number(),
  }),
});

const toDollars = (cents: number) => cents / 100;

export default defineTool({
  description:
    'Search the validated league auction history and compare player costs. Use this for historical prices, expected auction cost, and price trends; it does not include NBA production projections.',
  inputSchema,
  outputSchema,
  label: {
    start: ({ playerQuery }) =>
      playerQuery ? `Search auction history for ${playerQuery}` : 'Load auction market leaders',
    complete: (_input, output) =>
      `Loaded ${output.returnedPlayerCount} historical auction profiles`,
  },
  async execute({ limit, playerQuery }) {
    const config = await Effect.runPromise(loadDatabaseConfig());
    const market = await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.historicalAuctionMarket;
      }).pipe(Effect.provide(databaseLayer(config))),
    );
    const normalizedQuery = playerQuery?.toLocaleLowerCase() ?? null;
    const players = market.players
      .filter(
        (player) =>
          normalizedQuery === null || player.name.toLocaleLowerCase().includes(normalizedQuery),
      )
      .slice(0, limit)
      .map((player) => ({
        averagePriceDollars: toDollars(player.averagePriceCents),
        expectedPriceDollars: toDollars(player.expectedPriceCents),
        latestPriceDollars: toDollars(player.latestPriceCents),
        latestSeason: player.latestSeason,
        maximumPriceDollars: toDollars(player.maximumPriceCents),
        minimumPriceDollars: toDollars(player.minimumPriceCents),
        name: player.name,
        previousPriceDollars:
          player.previousPriceCents === null ? null : toDollars(player.previousPriceCents),
        seasonsDrafted: player.seasonsDrafted,
        trendDollars: player.trendCents === null ? null : toDollars(player.trendCents),
      }));

    return {
      latestSeason: market.summary.latestSeason,
      methodology:
        "Expected price is a linear recency-weighted market estimate; newer imported seasons receive larger weights, and seasons after a player's first observed purchase count as $0 when the player was not drafted. Pre-debut seasons do not penalize newer players. Trend compares the two most recent seasons in which the player was drafted.",
      playerQuery: playerQuery ?? null,
      players,
      returnedPlayerCount: players.length,
      sample: {
        playerCount: market.summary.playerCount,
        purchaseCount: market.summary.purchaseCount,
        seasonCount: market.summary.seasonCount,
        totalSpendDollars: toDollars(market.summary.totalSpendCents),
      },
    };
  },
});
