import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect, Exit, Redacted } from 'effect';

import {
  collectPlayerProduction,
  commitPlayerProductionImport,
  loadBallDontLieConfig,
  makeBallDontLieProvider,
  normalizeProviderPlayerName,
  type CanonicalPlayerTarget,
  type PlayerProductionProvider,
  type ProductionGameStat,
  type ProductionProviderPlayer,
  type ProductionStatKey,
  productionStatKeys,
} from './player-production';

const targets: ReadonlyArray<CanonicalPlayerTarget> = [
  {
    canonicalName: 'Nikola Jokic',
    fantraxId: 'fantrax-jokic',
    normalizedName: 'nikola jokic',
    playerId: 'player-jokic',
  },
  {
    canonicalName: 'Shai Gilgeous-Alexander',
    fantraxId: 'fantrax-sga',
    normalizedName: 'shai gilgeous alexander',
    playerId: 'player-sga',
  },
];

const providerPlayers: ReadonlyArray<ProductionProviderPlayer> = [
  {
    draftYear: 2014,
    externalId: '246',
    name: 'Nikola Jokić',
    teamAbbreviation: 'DEN',
  },
  {
    draftYear: 2018,
    externalId: '175',
    name: 'Shai Gilgeous-Alexander',
    teamAbbreviation: 'OKC',
  },
];

const stats = (overrides: Partial<Record<ProductionStatKey, number>>) =>
  Object.fromEntries(productionStatKeys.map((key) => [key, overrides[key] ?? 0])) as Record<
    ProductionStatKey,
    number
  >;

const gameStat = (
  id: string,
  playerExternalId: string,
  playerName: string,
  values: Partial<Record<ProductionStatKey, number>>,
): ProductionGameStat => ({
  externalId: id,
  gameId: `game-${id}`,
  playerExternalId,
  playerName,
  season: 2024,
  sourcePayload: { id },
  stats: stats(values),
});

const makeProvider = (
  players: ReadonlyArray<ProductionProviderPlayer>,
  gameStats: ReadonlyArray<ProductionGameStat>,
): PlayerProductionProvider<never> => ({
  listPlayers: Effect.succeed(players),
  listRegularSeasonStats: () => Effect.succeed(gameStats),
});

describe('player production configuration', () => {
  it('loads the provider key as redacted configuration', async () => {
    const config = await Effect.runPromise(
      loadBallDontLieConfig('/project', {
        BALLDONTLIE_API_KEY: 'secret-key',
        BALLDONTLIE_REQUESTS_PER_MINUTE: '60',
      }),
    );

    expect(config.cacheDirectory).toBe('/project/data/cache/balldontlie');
    expect(config.initialRequestsPerMinute).toBe(60);
    expect(Redacted.value(config.apiKey)).toBe('secret-key');
    expect(JSON.stringify(config)).not.toContain('secret-key');
  });

  it('rejects an invalid request limit without exposing the key', async () => {
    const exit = await Effect.runPromiseExit(
      loadBallDontLieConfig('/project', {
        BALLDONTLIE_API_KEY: 'secret-key',
        BALLDONTLIE_REQUESTS_PER_MINUTE: 'fast',
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain('BALLDONTLIE_REQUESTS_PER_MINUTE');
    expect(String(exit)).not.toContain('secret-key');
  });
});

describe('makeBallDontLieProvider', () => {
  it('paginates, validates, filters placeholders, and reuses its local cache', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'basketball-bdl-'));
    let requests = 0;
    const fetchImplementation = (async () => {
      requests += 1;
      const response =
        requests === 1
          ? {
              data: [
                {
                  draft_year: 2014,
                  first_name: 'Nikola',
                  id: 246,
                  last_name: 'Jokić',
                  team: { abbreviation: 'DEN' },
                },
              ],
              meta: { next_cursor: 246, per_page: 100 },
            }
          : {
              data: [
                {
                  draft_year: null,
                  first_name: '',
                  id: 999,
                  last_name: '',
                  team: { abbreviation: 'FA' },
                },
              ],
              meta: { per_page: 100 },
            };
      return new Response(JSON.stringify(response), {
        headers: { 'content-type': 'application/json', 'x-ratelimit-limit': '60000' },
        status: 200,
      });
    }) as typeof globalThis.fetch;

    try {
      const config = {
        apiKey: Redacted.make('secret-key'),
        cacheDirectory,
        fetch: fetchImplementation,
        initialRequestsPerMinute: 60_000,
      };
      const players = await Effect.runPromise(makeBallDontLieProvider(config).listPlayers);
      const cachedPlayers = await Effect.runPromise(
        makeBallDontLieProvider({
          ...config,
          fetch: (() => {
            throw new Error('network should not be used');
          }) as typeof globalThis.fetch,
        }).listPlayers,
      );

      expect(players).toEqual([
        {
          draftYear: 2014,
          externalId: '246',
          name: 'Nikola Jokić',
          teamAbbreviation: 'DEN',
        },
      ]);
      expect(cachedPlayers).toEqual(players);
      expect(requests).toBe(2);
    } finally {
      await rm(cacheDirectory, { force: true, recursive: true });
    }
  });
});

describe('collectPlayerProduction', () => {
  it('matches normalized identities and aggregates custom-scoring ingredients', async () => {
    const plan = await Effect.runPromise(
      collectPlayerProduction({
        provider: makeProvider(providerPlayers, [
          gameStat('1', '246', 'Nikola Jokić', {
            ast: 10,
            blk: 1,
            fga: 20,
            fgm: 12,
            fg3a: 4,
            fg3m: 2,
            fta: 8,
            ftm: 6,
            minutes: 30.5,
            pts: 32,
            reb: 12,
            stl: 2,
            turnover: 3,
          }),
          gameStat('2', '246', 'Nikola Jokić', {
            ast: 6,
            fga: 10,
            fgm: 5,
            fg3a: 2,
            fg3m: 1,
            fta: 2,
            ftm: 2,
            minutes: 29.25,
            pts: 17,
            reb: 8,
            turnover: 1,
          }),
          gameStat('3', '175', 'Shai Gilgeous-Alexander', {
            ast: 7,
            fga: 21,
            fgm: 13,
            fta: 9,
            ftm: 8,
            minutes: 34,
            pts: 35,
            reb: 5,
            stl: 3,
          }),
          gameStat('4', '175', 'Shai Gilgeous-Alexander', {}),
        ]),
        seasons: [2024],
        targets,
      }),
    );

    expect(plan.summary).toEqual({
      ambiguousPlayerCount: 0,
      canonicalPlayerCount: 2,
      gameStatCount: 4,
      matchedPlayerCount: 2,
      playerSeasonCount: 2,
      seasonCount: 1,
      unmatchedPlayerCount: 0,
      valid: true,
    });
    expect(plan.identities).toHaveLength(2);
    const jokic = plan.records.find((record) => record.fantraxId === 'fantrax-jokic');
    expect(jokic).toMatchObject({
      gamesPlayed: 2,
      providerPlayerId: '246',
      providerPlayerName: 'Nikola Jokić',
      seasonKey: '2024-25',
    });
    expect(jokic?.stats).toMatchObject({
      ast: 16,
      double_double: 1,
      fg3_missed: 3,
      fg_missed: 13,
      ft_missed: 2,
      minutes: 59.75,
      pts: 49,
      reb: 20,
      triple_double: 1,
    });
    const shai = plan.records.find((record) => record.fantraxId === 'fantrax-sga');
    expect(shai?.gamesPlayed).toBe(1);
    expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('uses target-season stats to resolve historical duplicate names', async () => {
    const duplicatePlayers: ProductionProviderPlayer[] = [
      { draftYear: 1980, externalId: 'old', name: 'Nikola Jokic', teamAbbreviation: null },
      providerPlayers[0]!,
    ];
    const plan = await Effect.runPromise(
      collectPlayerProduction({
        provider: makeProvider(duplicatePlayers, [
          gameStat('1', '246', 'Nikola Jokić', { pts: 20 }),
        ]),
        seasons: [2024],
        targets: [targets[0]!],
      }),
    );

    expect(plan.summary.valid).toBe(true);
    expect(plan.records[0]?.providerPlayerId).toBe('246');
  });

  it('reports unresolved identities and blocks a partial commit', async () => {
    const plan = await Effect.runPromise(
      collectPlayerProduction({
        provider: makeProvider([], []),
        seasons: [2024],
        targets: [targets[0]!],
      }),
    );
    let committed = false;
    const exit = await Effect.runPromiseExit(
      commitPlayerProductionImport(plan, {
        replacePlayerProduction: () =>
          Effect.sync(() => {
            committed = true;
            return {
              ingestionRunId: 'run-1',
              playerCount: 0,
              playerSeasonCount: 0,
              seasonCount: 1,
            };
          }),
      }),
    );

    expect(plan.issues).toEqual([
      {
        candidateExternalIds: [],
        canonicalName: 'Nikola Jokic',
        fantraxId: 'fantrax-jokic',
        kind: 'unmatched_player',
      },
    ]);
    expect(Exit.isFailure(exit)).toBe(true);
    expect(committed).toBe(false);
  });
});

describe('commitPlayerProductionImport', () => {
  it('sends only a validated plan through the persistence seam', async () => {
    const plan = await Effect.runPromise(
      collectPlayerProduction({
        provider: makeProvider(
          [providerPlayers[0]!],
          [gameStat('1', '246', 'Nikola Jokić', { pts: 20 })],
        ),
        seasons: [2024],
        targets: [targets[0]!],
      }),
    );
    let fingerprint = '';
    const result = await Effect.runPromise(
      commitPlayerProductionImport(plan, {
        replacePlayerProduction: (batch) =>
          Effect.sync(() => {
            fingerprint = batch.fingerprint;
            return {
              ingestionRunId: 'run-1',
              playerCount: 1,
              playerSeasonCount: batch.records.length,
              seasonCount: batch.seasons.length,
            };
          }),
      }),
    );

    expect(result).toEqual({
      ingestionRunId: 'run-1',
      playerCount: 1,
      playerSeasonCount: 1,
      seasonCount: 1,
    });
    expect(fingerprint).toBe(plan.fingerprint);
  });
});

describe('normalizeProviderPlayerName', () => {
  it('normalizes accents and punctuation without erasing suffixes', () => {
    expect(normalizeProviderPlayerName("T.J. O'Brien Jr.")).toBe('tj obrien jr');
  });
});
