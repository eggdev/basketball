import { Effect, Exit, Redacted } from 'effect';

import {
  buildSeasonCalendarReadModel,
  loadDatabaseConfig,
  planAuctionValuationPromotion,
  serializeAuctionValuationJson,
  validateAuctionValuationArtifact,
  validateAuctionValuationProjectionLink,
  validateSeasonCalendarBatch,
  type AuctionValuationArtifactInput,
  type SeasonCalendarBatch,
} from './database';

const pooledUrl =
  'postgresql://fantasy:secret@ep-example-pooler.us-east-1.aws.neon.tech/fantasy?sslmode=require';
const directUrl =
  'postgresql://fantasy:secret@ep-example.us-east-1.aws.neon.tech/fantasy?sslmode=require';

describe('loadDatabaseConfig', () => {
  it('keeps application and migration connections separate and redacted', async () => {
    const config = await Effect.runPromise(
      loadDatabaseConfig({
        DATABASE_URL: pooledUrl,
        DATABASE_URL_UNPOOLED: directUrl,
      }),
    );

    expect(Redacted.value(config.applicationUrl)).toBe(pooledUrl);
    expect(Redacted.value(config.migrationUrl)).toBe(directUrl);
    expect(JSON.stringify(config)).not.toContain('secret');
  });

  it.each(['DATABASE_URL', 'DATABASE_URL_UNPOOLED'] as const)(
    'fails safely when %s is missing',
    async (variable) => {
      const environment: Record<string, string | undefined> = {
        DATABASE_URL: pooledUrl,
        DATABASE_URL_UNPOOLED: directUrl,
      };
      delete environment[variable];

      const exit = await Effect.runPromiseExit(loadDatabaseConfig(environment));

      expect(Exit.isFailure(exit)).toBe(true);
      expect(String(exit)).toContain(variable);
      expect(String(exit)).not.toContain('secret');
    },
  );

  it('rejects a Neon pooler URL for migrations', async () => {
    const exit = await Effect.runPromiseExit(
      loadDatabaseConfig({
        DATABASE_URL: pooledUrl,
        DATABASE_URL_UNPOOLED: pooledUrl,
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain('DATABASE_URL_UNPOOLED');
    expect(String(exit)).not.toContain('secret');
  });
});

const artifact = (): AuctionValuationArtifactInput => ({
  artifactVersion: 'auction-valuation-artifact-v1',
  candidateResults: [{ id: 'recency-market-v1' }],
  current: {
    players: [
      {
        fairHighCents: 4_500,
        fairLowCents: 3_500,
        historicalSeasonCount: 3,
        historyPlayerId: null,
        isModeled: true,
        marketEstimateCents: 4_000,
        playerId: '00000000-0000-4000-8000-000000000001',
        playerName: 'Player One',
        projectedEdgeCents: 700,
        projectedValueCents: 4_700,
        projectionRank: 1,
      },
    ],
    seasonKey: '2026-27',
  },
  fingerprint: 'a'.repeat(64),
  historicalInputs: { fingerprint: 'b'.repeat(64), seasonKeys: ['2025-26'] },
  leagueSettings: { baseBudgetCents: 20_000, rosterSize: 13, teamCount: 12 },
  limitations: [],
  methodology: 'walk forward',
  modelVersion: 'walk-forward-v1',
  projection: {
    asOf: '2026-09-18T00:00:00.000Z',
    modelVersion: 'projection-v1',
    snapshotId: '00000000-0000-4000-8000-000000000010',
  },
  seasonKey: '2026-27',
  selectedModelId: 'recency-market-v1',
  selectionRule: 'lowest-drafted-player-mae-then-model-id',
});

describe('validateAuctionValuationArtifact', () => {
  it('preserves integer cents and unique player/run ranks', () => {
    expect(() => validateAuctionValuationArtifact(artifact())).not.toThrow();
    expect(() =>
      validateAuctionValuationArtifact({
        ...artifact(),
        current: {
          ...artifact().current,
          players: [
            ...artifact().current.players,
            { ...artifact().current.players[0]!, playerId: 'other' },
          ],
        },
      }),
    ).toThrow('duplicate valuation rank');
  });

  it('rejects fractional cents and incomplete artifacts', () => {
    expect(() =>
      validateAuctionValuationArtifact({
        ...artifact(),
        current: {
          ...artifact().current,
          players: [{ ...artifact().current.players[0]!, marketEstimateCents: 4_000.5 }],
        },
      }),
    ).toThrow('integer cents');
    expect(() =>
      validateAuctionValuationArtifact({
        ...artifact(),
        current: { ...artifact().current, players: [] },
      }),
    ).toThrow('incomplete');
  });

  it('requires complete candidate metadata and historical provenance', () => {
    expect(() => validateAuctionValuationArtifact({ ...artifact(), candidateResults: [] })).toThrow(
      'candidate results',
    );
    expect(() =>
      validateAuctionValuationArtifact({ ...artifact(), selectedModelId: 'missing-model' }),
    ).toThrow('absent from candidate results');
    expect(() =>
      validateAuctionValuationArtifact({
        ...artifact(),
        historicalInputs: { ...artifact().historicalInputs, fingerprint: 'invalid' },
      }),
    ).toThrow('historical input fingerprint');
  });
});

describe('serializeAuctionValuationJson', () => {
  it('serializes top-level arrays as JSON rather than PostgreSQL array literals', () => {
    const serialized = serializeAuctionValuationJson(['2024-25', '2025-26']);

    expect(serialized).toBe('["2024-25","2025-26"]');
    expect(JSON.parse(serialized)).toEqual(['2024-25', '2025-26']);
  });
});

describe('validateAuctionValuationProjectionLink', () => {
  const projection = () => ({
    asOf: '2026-09-18T00:00:00.000Z',
    modelVersion: 'projection-v1',
    playerIds: ['00000000-0000-4000-8000-000000000001'],
    seasonKey: '2026-27',
  });

  it('accepts exact timestamps and player sets independent of ordering', () => {
    expect(() => validateAuctionValuationProjectionLink(artifact(), projection())).not.toThrow();
  });

  it('rejects snapshot omissions, extras, and timestamp drift', () => {
    expect(() =>
      validateAuctionValuationProjectionLink(artifact(), { ...projection(), playerIds: [] }),
    ).toThrow('exactly match');
    expect(() =>
      validateAuctionValuationProjectionLink(artifact(), {
        ...projection(),
        playerIds: [...projection().playerIds, 'extra-player'],
      }),
    ).toThrow('exactly match');
    expect(() =>
      validateAuctionValuationProjectionLink(artifact(), {
        ...projection(),
        asOf: '2026-09-18T00:00:00.001Z',
      }),
    ).toThrow('timestamp');
  });
});

describe('planAuctionValuationPromotion', () => {
  it('supersedes the current promoted run without mutating the candidate', () => {
    expect(
      planAuctionValuationPromotion({
        actorId: 'user-1',
        currentPromotedRunId: 'run-old',
        playerCount: 156,
        projectionSeasonKey: '2026-27',
        runId: 'run-new',
        seasonKey: '2026-27',
        status: 'candidate',
      }),
    ).toEqual({ displacedRunId: 'run-old', runId: 'run-new' });
  });

  it('refuses missing actors, incomplete runs, and snapshot season mismatches', () => {
    const valid = {
      actorId: 'user-1',
      currentPromotedRunId: null,
      playerCount: 156,
      projectionSeasonKey: '2026-27',
      runId: 'run-new',
      seasonKey: '2026-27',
      status: 'candidate' as const,
    };
    expect(() => planAuctionValuationPromotion({ ...valid, actorId: '' })).toThrow('actor ID');
    expect(() => planAuctionValuationPromotion({ ...valid, playerCount: 0 })).toThrow('Incomplete');
    expect(() =>
      planAuctionValuationPromotion({ ...valid, projectionSeasonKey: '2025-26' }),
    ).toThrow('does not match');
  });
});

const calendarBatch = (): SeasonCalendarBatch => ({
  fantraxCapturedAt: '2026-09-19T12:00:00.000Z',
  fantasyPeriods: [
    {
      endAt: '2027-03-21T23:59:59.000Z',
      phase: 'playoffs',
      playoffRound: 'quarterfinal',
      scoringPeriod: 20,
      startAt: '2027-03-15T00:00:00.000Z',
    },
    {
      endAt: '2027-03-28T23:59:59.000Z',
      phase: 'playoffs',
      playoffRound: 'final',
      scoringPeriod: 21,
      startAt: '2027-03-22T00:00:00.000Z',
    },
  ],
  fingerprint: 'c'.repeat(64),
  games: [
    {
      awayTeam: 'OKC',
      date: '2027-03-15',
      homeTeam: 'DEN',
      postponed: false,
      providerGameId: 'game-1',
      scheduledAt: '2027-03-15T23:00:00.000Z',
      seasonStartYear: 2026,
      seasonType: 'regular',
      sourcePayload: { id: 1 },
      status: 'Scheduled',
    },
    {
      awayTeam: 'DEN',
      date: '2027-03-22',
      homeTeam: 'BOS',
      postponed: false,
      providerGameId: 'game-2',
      scheduledAt: '2027-03-22T23:00:00.000Z',
      seasonStartYear: 2026,
      seasonType: 'regular',
      sourcePayload: { id: 2 },
      status: 'Scheduled',
    },
  ],
  leagueId: 'league-1',
  nbaSourceId: 'balldontlie:/v1/games',
  seasonKey: '2026-27',
});

describe('season calendar persistence model', () => {
  it('validates immutable IDs and constructs dated per-team schedules', () => {
    const batch = calendarBatch();
    expect(() => validateSeasonCalendarBatch(batch)).not.toThrow();
    const readModel = buildSeasonCalendarReadModel({
      fantraxCapturedAt: batch.fantraxCapturedAt,
      fantasyPeriods: batch.fantasyPeriods,
      fingerprint: batch.fingerprint,
      games: batch.games.map(({ sourcePayload: _sourcePayload, ...game }) => game),
      leagueId: batch.leagueId,
      nbaScheduleSnapshotId: 'snapshot-1',
      seasonKey: batch.seasonKey,
    });

    expect(readModel.schedulesByTeam['DEN']).toMatchObject({
      fantasyPlayoffWeeks: [
        { scheduledGames: 1, scoringPeriod: 20 },
        { scheduledGames: 1, scoringPeriod: 21 },
      ],
      regularSeasonScheduledGames: 2,
    });
    expect(readModel.games[0]?.scheduledAt).toBe('2027-03-15T23:00:00.000Z');
  });

  it('rejects duplicate game and period identities', () => {
    const batch = calendarBatch();
    expect(() =>
      validateSeasonCalendarBatch({ ...batch, games: [...batch.games, batch.games[0]!] }),
    ).toThrow('game IDs');
    expect(() =>
      validateSeasonCalendarBatch({
        ...batch,
        fantasyPeriods: [...batch.fantasyPeriods, batch.fantasyPeriods[0]!],
      }),
    ).toThrow('scoring periods');
  });
});
