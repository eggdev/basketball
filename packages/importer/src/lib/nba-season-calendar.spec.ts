import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Effect, Exit, Redacted } from 'effect';

import { loadBallDontLieConfig, makeBallDontLieProvider } from './player-production';
import {
  makeFantraxLeagueInfoProvider,
  planSeasonCalendarImport,
  resolveSeasonCalendarSelection,
} from './nba-season-calendar';

const leagueInfo = (overrides: Record<string, unknown> = {}) => ({
  leagueHistoryId: 'history-1',
  playoffs: {
    firstPlayoffPeriod: 2,
    lastRegularSeasonPeriod: 1,
    numPlayoffTeams: 8,
    used: true,
  },
  scoringPeriods: [
    {
      endDate: '2027-03-14T23:59:59.000Z',
      number: 1,
      startDate: '2027-03-08T00:00:00.000Z',
    },
    {
      endDate: '2027-03-21T23:59:59.000Z',
      number: 2,
      startDate: '2027-03-15T00:00:00.000Z',
    },
    {
      endDate: '2027-03-28T23:59:59.000Z',
      number: 3,
      startDate: '2027-03-22T00:00:00.000Z',
    },
    {
      endDate: '2027-04-04T23:59:59.000Z',
      number: 4,
      startDate: '2027-03-29T00:00:00.000Z',
    },
  ],
  ...overrides,
});

const game = (
  providerGameId: string,
  scheduledAt: string,
  overrides: Record<string, unknown> = {},
) => ({
  awayTeam: 'OKC',
  date: scheduledAt.slice(0, 10),
  homeTeam: 'DEN',
  postponed: false,
  providerGameId,
  scheduledAt,
  seasonStartYear: 2026,
  seasonType: 'regular' as const,
  sourcePayload: { id: providerGameId },
  status: 'Scheduled',
  ...overrides,
});

const planInput = () => ({
  asOf: '2026-09-19T12:00:00.000Z',
  games: [
    game('1', '2026-10-20T23:00:00.000Z'),
    game('2', '2027-03-15T23:00:00.000Z'),
    game('3', '2027-03-22T23:00:00.000Z'),
    game('4', '2027-03-29T23:00:00.000Z', { postponed: true, status: 'Postponed' }),
  ],
  leagueId: 'league-1',
  leagueInfo: leagueInfo(),
  nbaSourceId: 'balldontlie:/v1/games?seasons[]=2026&season_type=regular',
  seasonKey: '2026-27',
});

describe('planSeasonCalendarImport', () => {
  it('builds dated team schedules and preserves postponed games', async () => {
    const plan = await Effect.runPromise(planSeasonCalendarImport(planInput()));

    expect(plan.summary).toEqual({
      gameCount: 4,
      playoffPeriodCount: 3,
      postponedGameCount: 1,
      regularSeasonPeriodCount: 1,
      teamCount: 30,
    });
    expect(plan.fantasyPeriods.map((period) => period.playoffRound)).toEqual([
      null,
      'quarterfinal',
      'semifinal',
      'final',
    ]);
    expect(plan.schedulesByTeam['DEN']).toMatchObject({
      fantasyPlayoffWeeks: [
        { scheduledGames: 1, scoringPeriod: 2 },
        { scheduledGames: 1, scoringPeriod: 3 },
        { scheduledGames: 1, scoringPeriod: 4 },
      ],
      regularSeasonScheduledGames: 4,
    });
    expect(plan.games.at(-1)).toMatchObject({ postponed: true, status: 'Postponed' });
  });

  it('has a stable fingerprint when provider input order changes', async () => {
    const input = planInput();
    const first = await Effect.runPromise(planSeasonCalendarImport(input));
    const reordered = await Effect.runPromise(
      planSeasonCalendarImport({
        ...input,
        asOf: '2026-09-20T12:00:00.000Z',
        games: [...input.games].reverse(),
        leagueInfo: {
          ...leagueInfo(),
          scoringPeriods: [...(leagueInfo().scoringPeriods as unknown[])].reverse(),
        },
      }),
    );

    expect(reordered.fingerprint).toBe(first.fingerprint);
  });

  it('counts games inclusively at playoff-period timestamp boundaries', async () => {
    const input = planInput();
    const plan = await Effect.runPromise(
      planSeasonCalendarImport({
        ...input,
        games: [
          ...input.games,
          game('5', '2027-03-21T23:59:59.000Z'),
          game('6', '2027-03-29T00:00:00.000Z'),
        ],
      }),
    );

    expect(plan.schedulesByTeam['DEN']?.fantasyPlayoffWeeks).toMatchObject([
      { scheduledGames: 2, scoringPeriod: 2 },
      { scheduledGames: 1, scoringPeriod: 3 },
      { scheduledGames: 2, scoringPeriod: 4 },
    ]);
  });

  it.each([
    ['missing playoffs', { leagueInfo: leagueInfo({ playoffs: { used: false } }) }],
    ['duplicate games', { games: [...planInput().games, planInput().games[0]!] }],
    [
      'overlapping periods',
      {
        leagueInfo: leagueInfo({
          scoringPeriods: [
            ...(leagueInfo().scoringPeriods as unknown[]).slice(0, 1),
            {
              endDate: '2027-03-21T23:59:59.000Z',
              number: 2,
              startDate: '2027-03-14T00:00:00.000Z',
            },
            ...(leagueInfo().scoringPeriods as unknown[]).slice(2),
          ],
        }),
      },
    ],
  ])('rejects %s', async (_label, overrides) => {
    const exit = await Effect.runPromiseExit(
      planSeasonCalendarImport({ ...planInput(), ...overrides }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
  });
});

describe('season calendar provider adapters', () => {
  it('uses the official games query, cursor paging, and cache reuse', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'basketball-calendar-bdl-'));
    const urls: URL[] = [];
    const fetchImplementation = (async (input: string | URL | Request) => {
      const url = new URL(String(input));
      urls.push(url);
      const cursor = url.searchParams.get('cursor');
      const response = {
        data: [
          {
            date: cursor === null ? '2026-10-20' : '2026-10-22',
            datetime: cursor === null ? '2026-10-20T23:00:00.000Z' : '2026-10-22T23:00:00.000Z',
            home_team: { abbreviation: 'DEN' },
            id: cursor === null ? 1 : 2,
            postponed: false,
            season: 2026,
            status: 'Scheduled',
            status_state: 'scheduled',
            visitor_team: { abbreviation: 'OKC' },
          },
        ],
        meta: cursor === null ? { next_cursor: 100, per_page: 100 } : { per_page: 100 },
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
      const games = await Effect.runPromise(
        makeBallDontLieProvider(config).listRegularSeasonGames(2026),
      );
      const cached = await Effect.runPromise(
        makeBallDontLieProvider({
          ...config,
          fetch: (() => {
            throw new Error('network should not be used');
          }) as typeof globalThis.fetch,
        }).listRegularSeasonGames(2026),
      );

      expect(games).toHaveLength(2);
      expect(cached).toEqual(games);
      expect(urls).toHaveLength(2);
      expect(urls[0]?.pathname).toBe('/v1/games');
      expect(urls[0]?.searchParams.getAll('seasons[]')).toEqual(['2026']);
      expect(urls[0]?.searchParams.get('season_type')).toBe('regular');
      expect(urls[0]?.searchParams.get('per_page')).toBe('100');
      expect(urls[1]?.searchParams.get('cursor')).toBe('100');
    } finally {
      await rm(cacheDirectory, { force: true, recursive: true });
    }
  });

  it('fetches Fantrax league info once and serves later reads from cache', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'basketball-calendar-fantrax-'));
    const cachePath = join(cacheDirectory, 'league-info.json');
    let requests = 0;
    const fetchImplementation = (async (input: string | URL | Request) => {
      requests += 1;
      const url = new URL(String(input));
      expect(url.pathname).toBe('/fxea/general/getLeagueInfo');
      expect(url.searchParams.get('leagueId')).toBe('league-1');
      return new Response(JSON.stringify(leagueInfo()), { status: 200 });
    }) as typeof globalThis.fetch;

    try {
      const first = await Effect.runPromise(
        makeFantraxLeagueInfoProvider({ cachePath, fetch: fetchImplementation }).getLeagueInfo(
          'league-1',
        ),
      );
      const cached = await Effect.runPromise(
        makeFantraxLeagueInfoProvider({
          cachePath,
          fetch: (() => {
            throw new Error('network should not be used');
          }) as typeof globalThis.fetch,
        }).getLeagueInfo('league-1'),
      );

      expect(cached).toEqual(first);
      expect(requests).toBe(1);
    } finally {
      await rm(cacheDirectory, { force: true, recursive: true });
    }
  });

  it('rejects repeated cursors', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'basketball-calendar-cursor-'));
    const fetchImplementation = (async () =>
      new Response(
        JSON.stringify({
          data: [],
          meta: { next_cursor: 100, per_page: 100 },
        }),
        { status: 200 },
      )) as typeof globalThis.fetch;
    try {
      const exit = await Effect.runPromiseExit(
        makeBallDontLieProvider({
          apiKey: Redacted.make('secret-key'),
          cacheDirectory,
          fetch: fetchImplementation,
          initialRequestsPerMinute: 60_000,
          refresh: true,
        }).listRegularSeasonGames(2026),
      );
      expect(Exit.isFailure(exit)).toBe(true);
      expect(String(exit)).toContain('repeated pagination cursor');
    } finally {
      await rm(cacheDirectory, { force: true, recursive: true });
    }
  });
});

describe('season calendar command configuration', () => {
  it('selects the sole live league by default', () => {
    expect(
      resolveSeasonCalendarSelection(
        { seasons: [{ league_id: 'league-1', season: '2026-27', status: 'live' }] },
        null,
      ),
    ).toEqual({ leagueId: 'league-1', seasonKey: '2026-27' });
  });

  it('fails clearly for missing live leagues, invalid seasons, and missing provider keys', async () => {
    expect(() => resolveSeasonCalendarSelection({ seasons: [] }, null)).toThrow('live league');
    expect(() =>
      resolveSeasonCalendarSelection(
        { seasons: [{ league_id: 'league-1', season: '2026-29', status: 'live' }] },
        null,
      ),
    ).toThrow('end year');
    const exit = await Effect.runPromiseExit(loadBallDontLieConfig('/project', {}));
    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain('BALLDONTLIE_API_KEY');
  });
});
