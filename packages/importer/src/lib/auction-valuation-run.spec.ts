import { Effect } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  commitAuctionValuationRun,
  planAuctionValuationRun,
  promoteAuctionValuationRun,
  type AuctionValuationCommitter,
  type AuctionValuationInputs,
} from './auction-valuation-run';

const inputs = (): AuctionValuationInputs => ({
  league: { baseBudgetCents: 20_000, rosterSize: 13, seasonKey: '2026-27', teamCount: 12 },
  leagueFormat: {
    fingerprint: 'league-format-1',
    lineupSlots: [
      {
        code: 'FLX',
        eligiblePositions: ['PG', 'SG', 'SF', 'PF', 'C'],
        label: 'Flex',
        maxActive: 10,
        minActive: 0,
      },
    ],
    version: 1,
  },
  projection: {
    asOf: '2026-09-18T00:00:00.000Z',
    modelVersion: 'projection-v1',
    players: [
      {
        availability: { rate: 1 },
        fantasyPoints: 2_800,
        fantasyPointsPerGame: 40,
        playerId: '00000000-0000-4000-8000-000000000001',
        playerName: 'Player One',
        positions: ['PG'],
        rank: 1,
        teamAbbreviation: 'AAA',
      },
    ],
    seasonKey: '2026-27',
    snapshotId: '00000000-0000-4000-8000-000000000010',
  },
  rankings: {
    seasons: ['2024-25', '2025-26'].map((seasonKey, index) => ({
      auctionPlayers: [
        {
          auctionCostCents: 4_000 + index * 100,
          playerId: '00000000-0000-4000-8000-000000000001',
          playerName: 'Player One',
        },
      ],
      baseBudgetCents: 20_000,
      players: [
        {
          auctionCostCents: 4_000 + index * 100,
          fantasyPoints: 2_700 + index * 100,
          fantasyPointsPerGame: 38 + index,
          playerId: '00000000-0000-4000-8000-000000000001',
          playerName: 'Player One',
        },
      ],
      rosterSize: 13,
      seasonKey,
      teamCount: 12,
    })),
  },
  seasonCalendar: {
    fantraxCapturedAt: '2026-09-18T00:00:00.000Z',
    fantasyPeriods: [
      {
        endAt: '2026-10-26T23:59:59.999Z',
        phase: 'regular-season',
        playoffRound: null,
        scoringPeriod: 1,
        startAt: '2026-10-20T00:00:00.000Z',
      },
    ],
    fingerprint: 'calendar-fingerprint-1',
    games: [
      {
        awayTeam: 'BBB',
        date: '2026-10-20',
        homeTeam: 'AAA',
        postponed: false,
        scheduledAt: '2026-10-20T23:00:00.000Z',
      },
    ],
    nbaScheduleSnapshotId: '00000000-0000-4000-8000-000000000020',
    seasonKey: '2026-27',
  },
  streamingSlotsPerTeam: 1,
});

describe('auction valuation run workflow', () => {
  it('keeps validation pure and its fingerprint stable', () => {
    const input = inputs();
    expect(planAuctionValuationRun(input)).toEqual(planAuctionValuationRun(input));
  });

  it('rejects league settings from a different season', () => {
    const input = inputs();
    expect(() =>
      planAuctionValuationRun({
        ...input,
        league: { ...input.league, seasonKey: '2025-26' },
      }),
    ).toThrow('League season does not match projection season');
  });

  it('fingerprints exact calendar, format, and streaming inputs', () => {
    const input = inputs();
    const baseline = planAuctionValuationRun(input);
    const reordered = planAuctionValuationRun({
      ...input,
      projection: { ...input.projection, players: [...input.projection.players].reverse() },
      seasonCalendar: {
        ...input.seasonCalendar,
        games: [...input.seasonCalendar.games].reverse(),
      },
    });
    const changed = planAuctionValuationRun({
      ...input,
      seasonCalendar: { ...input.seasonCalendar, fingerprint: 'calendar-fingerprint-2' },
    });
    const changedPeriodBoundary = planAuctionValuationRun({
      ...input,
      seasonCalendar: {
        ...input.seasonCalendar,
        fantasyPeriods: input.seasonCalendar.fantasyPeriods.map((period) => ({
          ...period,
          endAt: '2026-10-27T23:59:59.999Z',
        })),
      },
    });

    expect(reordered.fingerprint).toBe(baseline.fingerprint);
    expect(changed.fingerprint).not.toBe(baseline.fingerprint);
    expect(changedPeriodBoundary.fingerprint).not.toBe(baseline.fingerprint);
    expect(baseline.productionValue).toMatchObject({
      leagueFormat: { version: 1 },
      seasonCalendar: {
        fantasyPeriods: [
          {
            endAt: '2026-10-26T23:59:59.999Z',
            phase: 'regular-season',
            scoringPeriod: 1,
            startAt: '2026-10-20T00:00:00.000Z',
          },
        ],
      },
      streamingSlotsPerTeam: 1,
    });
  });

  it('sends the same immutable artifact for idempotent saves', async () => {
    const artifact = planAuctionValuationRun(inputs());
    const saveAuctionValuationRun = vi.fn<
      AuctionValuationCommitter<never>['saveAuctionValuationRun']
    >(() => Effect.succeed({ alreadySaved: true, runId: 'run-1' }));

    await Effect.runPromise(commitAuctionValuationRun(artifact, { saveAuctionValuationRun }));
    await Effect.runPromise(commitAuctionValuationRun(artifact, { saveAuctionValuationRun }));

    expect(saveAuctionValuationRun).toHaveBeenNthCalledWith(1, artifact);
    expect(saveAuctionValuationRun).toHaveBeenNthCalledWith(2, artifact);
  });

  it('requires an explicit promotion run ID', async () => {
    const promote = vi.fn<AuctionValuationCommitter<never>['promoteAuctionValuationRun']>(() =>
      Effect.succeed({ displacedRunId: null, runId: 'run-1' }),
    );
    await expect(
      Effect.runPromise(
        promoteAuctionValuationRun('', 'user-1', { promoteAuctionValuationRun: promote }),
      ),
    ).rejects.toThrow('Promotion requires a run ID');
    expect(promote).not.toHaveBeenCalled();
  });
});
