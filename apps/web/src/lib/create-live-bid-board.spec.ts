import type {
  AuctionValuationRun,
  LatestProjectionSnapshot,
} from '@fantasy-basketball/database/runtime';
import { describe, expect, it } from 'vitest';

import { createLiveBidBoard } from './create-live-bid-board';

const projection: LatestProjectionSnapshot = {
  asOf: '2026-09-18T00:00:00.000Z',
  createdAt: '2026-09-18T00:00:00.000Z',
  modelVersion: 'projection-v1',
  players: [
    {
      availability: {
        expectedGames: 70,
        expectedGamesMissed: 12,
        rate: 70 / 82,
        scheduledGames: 82,
        tier: 'durable',
      },
      bonuses: {
        doubleDoubleRate: 0.5,
        expectedDoubleDoubles: 35,
        expectedTripleDoubles: 5,
        tripleDoubleRate: 5 / 70,
      },
      fantasyPoints: 2_800,
      fantasyPointsPerGame: 40,
      playerId: '00000000-0000-4000-8000-000000000001',
      playerName: 'Player One',
      positions: ['C'],
      rank: 1,
      schedule: null,
      teamAbbreviation: 'DEN',
    },
  ],
  seasonKey: '2026-27',
  snapshotId: '00000000-0000-4000-8000-000000000010',
  source: 'hashtag',
  summary: { durablePlayerCount: 1, fragilePlayerCount: 0, playerCount: 1 },
};

const valuation: AuctionValuationRun = {
  artifactVersion: 'auction-valuation-artifact-v2',
  candidateResults: [],
  createdAt: '2026-09-18T01:00:00.000Z',
  current: {
    players: [
      {
        fairHighCents: 6_000,
        fairLowCents: 4_000,
        historicalSeasonCount: 4,
        historyPlayerId: projection.players[0]!.playerId,
        isModeled: true,
        marketEstimateCents: 5_000,
        playerId: projection.players[0]!.playerId,
        playerName: 'Player One',
        projectedEdgeCents: 1_000,
        projectedValueCents: 6_000,
        projectionRank: 1,
        usableDiagnostics: {
          availabilityExposure: 12 / 82,
          capturedPlayoffWeightedPoints: 100,
          congestionLoss: 20,
          estimatedCapturedRegularSeasonPoints: 2_400,
          expectedScheduledPoints: 2_420,
          playoffWeightedGames: 3.5,
          positionalReplacementDelta: 500,
          rawProjectedPoints: 2_800,
          usablePoints: 2_500,
        },
        usableEdgeCents: 500,
        usableValueCents: 5_500,
      },
    ],
    seasonKey: '2026-27',
  },
  fingerprint: 'a'.repeat(64),
  historicalInputs: { fingerprint: 'b'.repeat(64), seasonKeys: ['2022-23', '2023-24'] },
  leagueSettings: { baseBudgetCents: 20_000, rosterSize: 13, teamCount: 12 },
  limitations: [],
  methodology: 'walk forward',
  modelVersion: 'walk-forward-v1',
  projection: {
    asOf: projection.asOf,
    modelVersion: projection.modelVersion,
    snapshotId: projection.snapshotId,
  },
  productionValue: {
    auctionPoolCents: 240_000,
    draftablePlayerCount: 1,
    leagueFormat: {
      fingerprint: 'c'.repeat(64),
      lineupSlots: [
        {
          code: 'C',
          eligiblePositions: ['C'],
          label: 'Center',
          maxActive: 1,
          minActive: 0,
        },
      ],
      version: 1,
    },
    longTermPlayerCount: 1,
    modelVersion: 'usable-lineup-v1',
    schedule: {
      asOf: '2026-09-19T00:00:00.000Z',
      fingerprint: 'd'.repeat(64),
      snapshotId: '00000000-0000-4000-8000-000000000030',
    },
    seasonCalendar: {
      asOf: '2026-09-19T00:00:00.000Z',
      fantasyPeriods: [
        {
          endAt: '2026-10-31T23:59:59.999Z',
          label: 'Regular season',
          phase: 'regular-season',
          scoringPeriod: 1,
          startAt: '2026-10-01T00:00:00.000Z',
          weight: 1,
        },
      ],
      fingerprint: 'd'.repeat(64),
      games: [
        {
          awayTeam: 'BOS',
          date: '2026-10-20',
          homeTeam: 'DEN',
          postponed: false,
          scheduledAt: '2026-10-20T23:00:00.000Z',
        },
      ],
      snapshotId: '00000000-0000-4000-8000-000000000030',
    },
    streamingSlotsPerTeam: 1,
  },
  promotedAt: '2026-09-18T02:00:00.000Z',
  promotedByUserId: 'user-1',
  runId: '00000000-0000-4000-8000-000000000020',
  seasonKey: '2026-27',
  selectedModelId: 'recency-market-v1',
  selectionRule: 'lowest-drafted-player-mae-then-model-id',
  status: 'promoted',
};

const league = { baseBudgetCents: 20_000, rosterSize: 13, seasonKey: '2026-27', teamCount: 12 };

describe('createLiveBidBoard', () => {
  it('uses the exact promoted run estimates', () => {
    const board = createLiveBidBoard({ league, market: null, plan: null, projection, valuation });
    expect(board.players[0]?.calibratedMarket).toEqual({
      expectedPriceCents: 5_000,
      fairHighCents: 6_000,
      fairLowCents: 4_000,
      modelId: 'recency-market-v1',
      seasonsBacktested: 2,
    });
    expect(board.players[0]?.usableValue).toMatchObject({
      modelVersion: 'usable-lineup-v1',
      valueCents: 5_500,
    });
    expect(board.usableContext).toMatchObject({
      modelVersion: 'usable-lineup-v1',
      scheduleAsOf: '2026-09-19T00:00:00.000Z',
    });
  });

  it('refuses a promoted run linked to a stale projection snapshot', () => {
    const board = createLiveBidBoard({
      league,
      market: null,
      plan: null,
      projection,
      valuation: {
        ...valuation,
        projection: { ...valuation.projection, snapshotId: 'stale-snapshot' },
      },
    });
    expect(board.players[0]?.calibratedMarket).toBeNull();
    expect(board.players[0]?.usableValue).toBeNull();
    expect(board.usableContext).toBeNull();
  });
});
