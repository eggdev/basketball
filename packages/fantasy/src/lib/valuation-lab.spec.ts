import { describe, expect, it } from 'vitest';

import {
  allocateAuctionValues,
  buildAuctionValuationArtifact,
  buildAuctionValuationLab,
  type AuctionValuationSeason,
} from './valuation-lab';

const artifactInput = () => ({
  current: {
    baseBudgetCents: 10_000,
    players: season('2025-26', [null, null, null], [45, 21, 20]).players.map(
      ({ auctionCostCents: _auctionCostCents, ...player }, index) => ({
        ...player,
        rank: index + 1,
      }),
    ),
    rosterSize: 2,
    seasonKey: '2025-26',
    teamCount: 2,
  },
  historicalSeasons: [
    season('2022-23', [1_000, 2_000, null], [30, 25, 20]),
    season('2023-24', [2_000, 3_000, 500], [32, 24, 22]),
  ],
  projection: {
    asOf: '2025-09-01T00:00:00.000Z',
    modelVersion: 'projection-v1',
    snapshotId: 'snapshot-1',
  },
});

const season = (
  seasonKey: string,
  prices: ReadonlyArray<number | null>,
  pointsPerGame: ReadonlyArray<number>,
): AuctionValuationSeason => ({
  baseBudgetCents: 10_000,
  players: pointsPerGame.map((fantasyPointsPerGame, index) => ({
    auctionCostCents: prices[index] ?? null,
    fantasyPoints: fantasyPointsPerGame * 70,
    fantasyPointsPerGame,
    playerId: `player-${index + 1}`,
    playerName: `Player ${index + 1}`,
  })),
  rosterSize: 2,
  seasonKey,
  teamCount: 2,
});

describe('allocateAuctionValues', () => {
  it('reserves minimum bids and allocates the rest above replacement', () => {
    const result = allocateAuctionValues({
      baseBudgetCents: 10_000,
      players: season('2024-25', [null, null, null, null], [40, 30, 20, 10]).players,
      rosterSize: 2,
      teamCount: 2,
    });

    expect(result.replacementPointsPerGame).toBe(10);
    expect(result.players.reduce((sum, player) => sum + player.valueCents, 0)).toBe(20_000);
    expect(result.players.at(-1)?.valueCents).toBe(100);
  });
});

describe('buildAuctionValuationLab', () => {
  it('walks forward without using the target season price as an input', () => {
    const historicalSeasons = [
      season('2022-23', [1_000, 2_000, null], [30, 25, 20]),
      season('2023-24', [2_000, 3_000, 500], [32, 24, 22]),
      season('2024-25', [9_000, 4_000, 1_000], [34, 23, 21]),
    ];
    const first = buildAuctionValuationLab({ historicalSeasons });
    const changed = buildAuctionValuationLab({
      historicalSeasons: [
        historicalSeasons[0]!,
        historicalSeasons[1]!,
        season('2024-25', [100, 4_000, 1_000], [34, 23, 21]),
      ],
    });
    const prediction = first.models
      .find((model) => model.id === 'recency-market-v1')
      ?.predictions.find(
        (candidate) => candidate.seasonKey === '2024-25' && candidate.playerId === 'player-1',
      );
    const changedPrediction = changed.models
      .find((model) => model.id === 'recency-market-v1')
      ?.predictions.find(
        (candidate) => candidate.seasonKey === '2024-25' && candidate.playerId === 'player-1',
      );

    expect(prediction?.predictedPriceCents).toBe(1_700);
    expect(changedPrediction?.predictedPriceCents).toBe(prediction?.predictedPriceCents);
    expect(changedPrediction?.actualPriceCents).toBe(100);
  });

  it('backtests auction purchases even when production history is unavailable', () => {
    const lab = buildAuctionValuationLab({
      historicalSeasons: [
        season('2022-23', [1_000, 2_000, null], [30, 25, 20]),
        {
          ...season('2023-24', [2_000, 3_000, 500], [32, 24, 22]),
          auctionPrices: [
            {
              auctionCostCents: 700,
              playerId: 'auction-only',
              playerName: 'Auction Only',
            },
          ],
        },
      ],
    });
    const prediction = lab.models[0]?.predictions.find(
      (candidate) => candidate.playerId === 'auction-only',
    );

    expect(prediction).toMatchObject({
      actualPriceCents: 700,
      isNewPlayer: true,
      realizedSurplusCents: null,
      realizedValueCents: null,
    });
  });

  it('separates expected league price from current projected production value', () => {
    const lab = buildAuctionValuationLab({
      current: {
        baseBudgetCents: 10_000,
        players: season('2025-26', [null, null, null], [45, 21, 20]).players.map(
          ({ auctionCostCents: _auctionCostCents, ...player }, index) => ({
            ...player,
            rank: index + 1,
          }),
        ),
        rosterSize: 2,
        seasonKey: '2025-26',
        teamCount: 2,
      },
      historicalSeasons: [
        season('2022-23', [1_000, 2_000, null], [30, 25, 20]),
        season('2023-24', [2_000, 3_000, 500], [32, 24, 22]),
        season('2024-25', [3_000, 4_000, 1_000], [34, 23, 21]),
      ],
    });
    const estimate = lab.current?.players.find((player) => player.playerId === 'player-1');

    expect(lab.models).toHaveLength(4);
    expect(lab.selectedModelId).toMatch(/-v1$/);
    expect(estimate?.marketEstimateCents).toBeGreaterThan(0);
    expect(estimate?.projectedValueCents).toBeGreaterThan(estimate?.marketEstimateCents ?? 0);
    expect(estimate?.projectedEdgeCents).toBe(
      (estimate?.projectedValueCents ?? 0) - (estimate?.marketEstimateCents ?? 0),
    );
  });

  it('leaves split UUIDs unjoined even when names differ only by a suffix', () => {
    const lab = buildAuctionValuationLab({
      current: {
        baseBudgetCents: 10_000,
        players: [
          {
            fantasyPoints: 2_800,
            fantasyPointsPerGame: 40,
            playerId: 'projection-player-1',
            playerName: 'Player 1 Jr.',
            rank: 1,
          },
        ],
        rosterSize: 2,
        seasonKey: '2025-26',
        teamCount: 2,
      },
      historicalSeasons: [
        season('2022-23', [1_000, 2_000, null], [30, 25, 20]),
        season('2023-24', [2_000, 3_000, 500], [32, 24, 22]),
      ],
    });
    const estimate = lab.current?.players[0];

    expect(estimate?.playerId).toBe('projection-player-1');
    expect(estimate?.historyPlayerId).toBeNull();
    expect(estimate?.historicalSeasonCount).toBe(0);
  });

  it('joins reconciled UUIDs normally without a name bridge', () => {
    const lab = buildAuctionValuationLab({
      current: {
        baseBudgetCents: 10_000,
        players: [
          {
            fantasyPoints: 2_800,
            fantasyPointsPerGame: 40,
            playerId: 'player-1',
            playerName: 'Player 1 Jr.',
            rank: 1,
          },
        ],
        rosterSize: 2,
        seasonKey: '2025-26',
        teamCount: 2,
      },
      historicalSeasons: [
        season('2022-23', [1_000, 2_000, null], [30, 25, 20]),
        season('2023-24', [2_000, 3_000, 500], [32, 24, 22]),
      ],
    });
    const estimate = lab.current?.players[0];

    expect(estimate?.historyPlayerId).toBe('player-1');
    expect(estimate?.historicalSeasonCount).toBe(2);
    expect(estimate?.marketEstimateCents).toBeGreaterThan(0);
  });
});

describe('buildAuctionValuationArtifact', () => {
  it('is deterministic and insensitive to input ordering', () => {
    const input = artifactInput();
    const first = buildAuctionValuationArtifact(input);
    const reordered = buildAuctionValuationArtifact({
      ...input,
      current: { ...input.current, players: [...input.current.players].reverse() },
      historicalSeasons: [...input.historicalSeasons]
        .reverse()
        .map((value) => ({ ...value, players: [...value.players].reverse() })),
    });

    expect(first).toEqual(buildAuctionValuationArtifact(input));
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(reordered.fingerprint).toBe(first.fingerprint);
  });

  it('fingerprints projection and league-setting changes', () => {
    const input = artifactInput();
    const first = buildAuctionValuationArtifact(input);
    const changedProjection = buildAuctionValuationArtifact({
      ...input,
      projection: { ...input.projection, snapshotId: 'snapshot-2' },
    });
    const changedLeague = buildAuctionValuationArtifact({
      ...input,
      current: { ...input.current, baseBudgetCents: 20_000 },
    });

    expect(changedProjection.fingerprint).not.toBe(first.fingerprint);
    expect(changedLeague.fingerprint).not.toBe(first.fingerprint);
    expect(first.candidateResults.every((model) => model.predictions.length > 0)).toBe(true);
  });
});
