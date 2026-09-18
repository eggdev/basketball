import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';
import { defineTool } from 'eve/tools';
import { z } from 'zod';

const inputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(15),
  playerQuery: z.string().trim().min(1).optional(),
  sort: z.enum(['adp', 'fallers', 'risers']).default('adp'),
});

const outputSchema = z.object({
  capturedAt: z.string().nullable(),
  methodology: z.string(),
  players: z.array(
    z.object({
      adp: z.number(),
      movement: z.number().nullable(),
      name: z.string(),
      position: z.string(),
      previousAdp: z.number().nullable(),
      rank: z.number(),
    }),
  ),
  previousCapturedAt: z.string().nullable(),
  seasonKey: z.string().nullable(),
});

export default defineTool({
  description:
    'Inspect the latest versioned Fantrax public average draft position snapshot and movement from the prior snapshot. Use ADP as a public demand signal, never as a points projection or league-specific auction price.',
  inputSchema,
  outputSchema,
  label: {
    start: ({ playerQuery, sort }) =>
      playerQuery ? `Search Fantrax ADP for ${playerQuery}` : `Load Fantrax ADP ${sort}`,
    complete: (_input, output) => `Loaded ${output.players.length} Fantrax ADP records`,
  },
  async execute({ limit, playerQuery, sort }) {
    const config = await Effect.runPromise(loadDatabaseConfig());
    const snapshot = await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.latestAdpSnapshot;
      }).pipe(Effect.provide(databaseLayer(config))),
    );
    if (snapshot === null) {
      return {
        capturedAt: null,
        methodology: 'No Fantrax ADP snapshot has been imported. Do not infer public draft demand.',
        players: [],
        previousCapturedAt: null,
        seasonKey: null,
      };
    }
    const normalizedQuery = playerQuery?.toLocaleLowerCase() ?? null;
    const candidates = snapshot.players.filter(
      (player) =>
        normalizedQuery === null || player.playerName.toLocaleLowerCase().includes(normalizedQuery),
    );
    if (sort === 'risers') {
      candidates.sort(
        (left, right) => (right.movement ?? -Infinity) - (left.movement ?? -Infinity),
      );
    } else if (sort === 'fallers') {
      candidates.sort((left, right) => (left.movement ?? Infinity) - (right.movement ?? Infinity));
    }
    return {
      capturedAt: snapshot.capturedAt,
      methodology:
        'ADP is the average public Fantrax draft position. Positive movement means the player is being selected earlier than in the previous changed snapshot. It is a demand prior only; combine it with league prices and projections.',
      players: candidates.slice(0, limit).map((player) => ({
        adp: player.adp,
        movement: player.movement,
        name: player.playerName,
        position: player.position,
        previousAdp: player.previousAdp,
        rank: player.rank,
      })),
      previousCapturedAt: snapshot.previousCapturedAt,
      seasonKey: snapshot.seasonKey,
    };
  },
});
