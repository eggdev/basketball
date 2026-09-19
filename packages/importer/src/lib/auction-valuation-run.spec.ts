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
  projection: {
    asOf: '2026-09-18T00:00:00.000Z',
    modelVersion: 'projection-v1',
    players: [
      {
        fantasyPoints: 2_800,
        fantasyPointsPerGame: 40,
        playerId: '00000000-0000-4000-8000-000000000001',
        playerName: 'Player One',
        rank: 1,
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
});

describe('auction valuation run workflow', () => {
  it('keeps validation pure and its fingerprint stable', () => {
    const input = inputs();
    expect(planAuctionValuationRun(input)).toEqual(planAuctionValuationRun(input));
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
