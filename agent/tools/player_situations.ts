import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database/runtime';
import { buildPlayerSituationBoard } from '@fantasy-basketball/fantasy';
import { Effect } from 'effect';
import { defineTool } from 'eve/tools';
import { z } from 'zod';

const inputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(30),
  playerQuery: z.string().trim().min(1).optional(),
  sort: z
    .enum(['new-team', 'opportunity-down', 'opportunity-up', 'projection-rank'])
    .default('projection-rank'),
});

const outputSchema = z.object({
  asOf: z.string().nullable(),
  methodology: z.string(),
  players: z.array(
    z.object({
      advanced: z.object({
        dribblesPerTouch: z.number().nullable(),
        potentialAssistsPerGame: z.number().nullable(),
        secondaryAssistsPerGame: z.number().nullable(),
        timeOfPossessionMinutes: z.number().nullable(),
        touchesPerGame: z.number().nullable(),
        usagePercentage: z.number().nullable(),
      }),
      competition: z.array(z.string()),
      currentTeam: z.string(),
      expectedGames: z.number(),
      injury: z
        .object({ sourceUrl: z.string(), status: z.string().nullable(), summary: z.string() })
        .nullable(),
      movementSourceUrl: z.string().nullable(),
      movementType: z.enum([
        'draft',
        'free-agent-signing',
        're-signing',
        'returning',
        'trade',
        'two-way',
        'unknown',
        'waiver',
      ]),
      name: z.string(),
      opportunityDeltaPercent: z.number().nullable(),
      opportunityDirection: z.enum(['down', 'steady', 'uncertain', 'up']),
      opportunitySource: z.enum(['box-score-proxy', 'curated', 'insufficient-data']),
      positions: z.array(z.string()),
      previousGames: z.number().nullable(),
      previousTeam: z.string().nullable(),
      signals: z.array(
        z.object({
          basis: z.enum(['curated', 'inferred', 'observed', 'projected']),
          detail: z.string(),
          kind: z.enum(['availability', 'competition', 'injury', 'movement', 'opportunity']),
        }),
      ),
      summary: z.string(),
    }),
  ),
  seasonKey: z.string().nullable(),
});

export default defineTool({
  description:
    'Compare each current player projection with the latest prior NBA season, reviewed movement/injury/depth-chart evidence, same-position team competition, and imported advanced role metrics. Use this to discuss new teams, trades versus signings, opportunity changes, injury context, usage, touches, dribbles, potential assists, and hockey assists without turning inferred facts into confirmed transactions.',
  inputSchema,
  outputSchema,
  label: {
    start: ({ playerQuery, sort }) =>
      playerQuery ? `Analyze situation for ${playerQuery}` : `Load player situations by ${sort}`,
    complete: (_input, output) => `Loaded ${output.players.length} player situations`,
  },
  async execute({ limit, playerQuery, sort }) {
    const config = await Effect.runPromise(loadDatabaseConfig());
    const evidence = await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database;
        const projection = yield* database.latestProjectionSnapshot;
        if (projection === null) return null;
        const [advancedHistory, context, productionHistory] = yield* Effect.all([
          database.playerAdvancedStatsHistory,
          database.latestPlayerContextSnapshot(projection.seasonKey),
          database.playerProductionHistory,
        ]);
        return { advancedHistory, context, productionHistory, projection };
      }).pipe(Effect.provide(databaseLayer(config))),
    );
    if (evidence === null) {
      return {
        asOf: null,
        methodology:
          'No current projection snapshot is available, so situations cannot be compared.',
        players: [],
        seasonKey: null,
      };
    }
    const board = buildPlayerSituationBoard({
      advancedHistory: evidence.advancedHistory,
      asOf: evidence.context?.asOf ?? evidence.projection.asOf,
      contexts: evidence.context?.players,
      productionHistory: evidence.productionHistory,
      projections: evidence.projection.players.map((player) => ({
        availability: { expectedGames: player.availability.expectedGames },
        fantasyPointsPerGame: player.fantasyPointsPerGame,
        playerId: player.playerId,
        playerName: player.playerName,
        positions: player.positions,
        statsPerGame: player.statsPerGame ?? {},
        teamAbbreviation: player.teamAbbreviation,
      })),
      seasonKey: evidence.projection.seasonKey,
    });
    const rankByPlayer = new Map(
      evidence.projection.players.map((player) => [player.playerId, player.rank]),
    );
    const normalizedQuery = playerQuery?.toLocaleLowerCase() ?? null;
    const players = board.players.filter(
      (player) =>
        normalizedQuery === null || player.playerName.toLocaleLowerCase().includes(normalizedQuery),
    );
    players.sort((left, right) => {
      if (sort === 'new-team') {
        return Number(right.movement.isNewTeam) - Number(left.movement.isNewTeam);
      }
      if (sort === 'opportunity-up') {
        return (
          (right.opportunity.deltaPercent ?? -Infinity) -
          (left.opportunity.deltaPercent ?? -Infinity)
        );
      }
      if (sort === 'opportunity-down') {
        return (
          (left.opportunity.deltaPercent ?? Infinity) - (right.opportunity.deltaPercent ?? Infinity)
        );
      }
      return (
        (rankByPlayer.get(left.playerId) ?? Infinity) -
        (rankByPlayer.get(right.playerId) ?? Infinity)
      );
    });

    return {
      asOf: board.asOf,
      methodology:
        'Movement type, injury history, and depth role are shown only when a reviewed source exists. Team changes without one are labeled unverified. Opportunity direction is either reviewed context or a transparent per-game box-score proxy (FGA + 0.44×FTA + AST + TOV), not a projected NBA usage rate. Low games played alone is never called an injury. Advanced metrics describe the imported prior season and retain provider provenance.',
      players: players.slice(0, limit).map((player) => ({
        advanced: player.advanced,
        competition: player.competition.map((candidate) => candidate.playerName),
        currentTeam: player.currentTeamAbbreviation,
        expectedGames: player.availability.expectedGames,
        injury: player.injury,
        movementSourceUrl: player.movement.sourceUrl,
        movementType: player.movement.type,
        name: player.playerName,
        opportunityDeltaPercent: player.opportunity.deltaPercent,
        opportunityDirection: player.opportunity.direction,
        opportunitySource: player.opportunity.source,
        positions: [...player.positions],
        previousGames: player.availability.previousGames,
        previousTeam: player.previousTeamAbbreviation,
        signals: player.signals.map(({ basis, detail, kind }) => ({ basis, detail, kind })),
        summary: player.summary,
      })),
      seasonKey: board.seasonKey,
    };
  },
});
