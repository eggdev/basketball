import { describe, expect, it } from 'vitest';
import type {
  AuctionValuationRun,
  LatestProjectionSnapshot,
  HistoricalAuctionMarket,
} from '@fantasy-basketball/database/runtime';
import { buildDraftModelReference } from './live-draft-model';
import type { BridgeState } from './fantrax-bridge';

const projection = {
  seasonKey: '2026-27',
  snapshotId: 'snapshot',
  asOf: '2026-09-19',
  modelVersion: 'test-model',
  players: [
    {
      playerId: 'canonical',
      playerName: 'Test Player',
      rank: 1,
      fantasyPointsPerGame: 60,
      statsPerGame: { points: 25, rebounds: 12 },
      availability: { tier: 'durable' },
    },
  ],
} as LatestProjectionSnapshot;
const valuation = {
  seasonKey: '2026-27',
  projection: { snapshotId: 'snapshot' },
  selectedModelId: 'test-market',
  current: {
    players: [
      {
        playerId: 'canonical',
        isModeled: true,
        marketEstimateCents: 5000,
        fairLowCents: 4000,
        fairHighCents: 6000,
      },
    ],
  },
} as AuctionValuationRun;
const identities = [
  {
    playerId: 'canonical',
    fantraxId: 'provider',
    canonicalName: 'Test Player',
    normalizedName: 'test-player',
  },
];
const state = {
  nominatedPlayerId: 'provider',
  currentBidCents: 7000,
  rosters: [
    { playerId: 'provider', teamId: 'mine' },
    { playerId: 'other-player', teamId: 'other' },
  ],
} as BridgeState;

describe('generated draft reference', () => {
  it('joins a Fantrax identity to the exact projection and promoted prices', () => {
    const result = buildDraftModelReference(
      { projection, valuation, identities },
      2026,
      state,
      'mine',
    );
    expect(result.summary).toMatchObject({
      status: 'ready',
      playerCount: 1,
      mappedCount: 1,
      valuationModel: 'test-market',
    });
    expect(result.candidate).toMatchObject({
      playerName: 'Test Player',
      rank: 1,
      marketPriceCents: 5000,
      statsPerGame: { points: 25 },
    });
    expect(result.priceSignal).toBe('above-reference');
    expect(result.roster).toHaveLength(1);
    expect(result.unmatchedRosterCount).toBe(0);
  });
  it('never joins unknown provider IDs by a similar name', () => {
    const result = buildDraftModelReference(
      { projection, valuation, identities: [] },
      2026,
      state,
      'mine',
    );
    expect(result.candidate).toBeNull();
    expect(result.priceSignal).toBe('unavailable');
    expect(result.summary.mappedCount).toBe(0);
    expect(result.unmatchedRosterCount).toBe(1);
  });
  it('rejects another season and drops prices from a different projection snapshot', () => {
    expect(
      buildDraftModelReference({ projection, valuation, identities }, 2025, state).summary.status,
    ).toBe('unavailable');
    const result = buildDraftModelReference(
      {
        projection,
        identities,
        valuation: { ...valuation, projection: { ...valuation.projection, snapshotId: 'older' } },
      },
      2026,
      state,
    );
    expect(result.candidate?.rank).toBe(1);
    expect(result.candidate?.marketPriceCents).toBeNull();
    expect(result.summary.valuationModel).toBeNull();
  });
  it('shows prior cost only when the recorded season is the previous season', () => {
    const history: HistoricalAuctionMarket = {
      summary: {
        latestSeason: '2025-26',
        playerCount: 1,
        purchaseCount: 1,
        seasonCount: 1,
        totalSpendCents: 4500,
      },
      players: [
        {
          playerId: 'canonical',
          fantraxId: 'provider',
          name: 'Test Player',
          latestSeason: '2025-26',
          latestPriceCents: 4500,
          previousPriceCents: null,
          averagePriceCents: 4500,
          expectedPriceCents: 4500,
          minimumPriceCents: 4500,
          maximumPriceCents: 4500,
          seasonsDrafted: 1,
          trendCents: null,
        },
      ],
    };
    expect(
      buildDraftModelReference({ projection, valuation, identities, history }, 2026, state)
        .candidate,
    ).toMatchObject({ previousPriceCents: 4500, previousSeason: '2025-26' });
    const older = { ...history, players: [{ ...history.players[0], latestSeason: '2024-25' }] };
    expect(
      buildDraftModelReference({ projection, valuation, identities, history: older }, 2026, state)
        .candidate,
    ).toMatchObject({ previousPriceCents: null, previousSeason: null });
  });
});
