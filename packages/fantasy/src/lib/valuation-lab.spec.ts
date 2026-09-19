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
  productionValue: {
    leagueFormat: {
      fingerprint: 'league-format-1',
      lineupSlots: [
        {
          code: 'FLX' as const,
          eligiblePositions: ['PG', 'SG', 'SF', 'PF', 'C'] as const,
          label: 'Flex',
          maxActive: 2,
          minActive: 0,
        },
      ],
      version: 1,
    },
    players: season('2025-26', [null, null, null], [45, 21, 20]).players.map(
      ({ auctionCostCents: _auctionCostCents, ...projection }, index) => ({
        availabilityRate: 1,
        ...projection,
        positions: ['PG'] as const,
        projectionRank: index + 1,
        teamAbbreviation: index === 2 ? 'BBB' : 'AAA',
      }),
    ),
    seasonCalendar: {
      asOf: '2025-09-01T00:00:00.000Z',
      fantasyPeriods: [
        {
          endAt: '2025-10-31T23:59:59.999Z',
          label: 'Regular season',
          phase: 'regular-season' as const,
          scoringPeriod: 1,
          startAt: '2025-10-01T00:00:00.000Z',
          weight: 1,
        },
      ],
      fingerprint: 'calendar-fingerprint-1',
      games: [
        {
          awayTeam: 'BBB',
          date: '2025-10-20',
          homeTeam: 'AAA',
          postponed: false,
          scheduledAt: '2025-10-20T23:00:00.000Z',
        },
      ],
      snapshotId: 'calendar-snapshot-1',
    },
    streamingSlotsPerTeam: 0,
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

  it('conserves the complete auction pool for the legacy global basis', () => {
    const result = allocateAuctionValues({
      baseBudgetCents: 20_000,
      players: season('2024-25', [null, null, null, null], [40, 30, 20, 10]).players,
      rosterSize: 2,
      teamCount: 2,
    });

    expect(result.auctionPoolCents).toBe(40_000);
    expect(result.players.reduce((sum, player) => sum + player.valueCents, 0)).toBe(40_000);
  });

  it('orders tied players by player ID and assigns remainder dollars deterministically', () => {
    const result = allocateAuctionValues({
      baseBudgetCents: 200,
      players: [
        { fantasyPoints: 100, fantasyPointsPerGame: 10, playerId: 'player-b' },
        { fantasyPoints: 100, fantasyPointsPerGame: 10, playerId: 'player-a' },
      ],
      rosterSize: 1,
      teamCount: 1,
    });

    expect(result.players).toEqual([
      { playerId: 'player-a', valueCents: 200 },
      { playerId: 'player-b', valueCents: 0 },
    ]);
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

  it('fingerprints the usable-points lineup, streaming reserve, and schedule snapshot', () => {
    const input = artifactInput();
    const first = buildAuctionValuationArtifact(input);
    const changedFormat = buildAuctionValuationArtifact({
      ...input,
      productionValue: {
        ...input.productionValue,
        leagueFormat: { ...input.productionValue.leagueFormat, version: 2 },
      },
    });
    const changedStreaming = buildAuctionValuationArtifact({
      ...input,
      productionValue: { ...input.productionValue, streamingSlotsPerTeam: 1 },
    });
    const changedSchedule = buildAuctionValuationArtifact({
      ...input,
      productionValue: {
        ...input.productionValue,
        seasonCalendar: {
          ...input.productionValue.seasonCalendar,
          fingerprint: 'calendar-fingerprint-2',
        },
      },
    });

    expect(changedFormat.fingerprint).not.toBe(first.fingerprint);
    expect(changedStreaming.fingerprint).not.toBe(first.fingerprint);
    expect(changedSchedule.fingerprint).not.toBe(first.fingerprint);
    expect(first.productionValue).toMatchObject({
      modelVersion: 'usable-lineup-v1',
      schedule: { fingerprint: 'calendar-fingerprint-1' },
    });
  });
});
