import { describe, expect, it } from 'vitest';
import {
  fitProductionValue,
  valueProjectedProduction,
  type ProductionValueSeason,
} from './production-value';

const season: ProductionValueSeason = {
  seasonKey: '2024-25',
  baseBudgetCents: 20000,
  players: [
    ...[8, 9, 10, 11, 12].map((fantasyPointsPerGame, index) => ({
      playerId: `free-${index}`,
      fantasyPointsPerGame,
      gamesPlayed: 60,
      auctionCostCents: 0,
    })),
    { playerId: 'core', fantasyPointsPerGame: 18, gamesPlayed: 60, auctionCostCents: 3000 },
    { playerId: 'star', fantasyPointsPerGame: 25, gamesPlayed: 60, auctionCostCents: 6500 },
    { playerId: 'elite', fantasyPointsPerGame: 30, gamesPlayed: 60, auctionCostCents: 9000 },
    { playerId: 'unpriced', fantasyPointsPerGame: 50, gamesPlayed: 60, auctionCostCents: null },
  ],
};
const fit = (history = [season]) => fitProductionValue({ history, baseBudgetCents: 20000 });
const estimate = (points: number, games = 60) =>
  valueProjectedProduction(fit(), { fantasyPointsPerGame: points, expectedGames: games });

describe('production value candidate', () => {
  it('prices surplus above a measured $0 baseline and counts durability exactly once', () => {
    expect(fit().replacementPointsPerGame).toBe(10);
    expect(estimate(10).valueCents).toBe(0);
    expect(estimate(9).valueCents).toBe(0);
    expect(estimate(25, 0).valueCents).toBe(0);
    expect(estimate(25, 60).surplusPoints).toBe(900);
    expect(estimate(25, 30).surplusPoints).toBe(450);
    expect(estimate(25, 30).valueCents).toBeLessThan(estimate(25, 60).valueCents);
    expect(estimate(18, 60).valueCents).toBe(3000);
  });
  it('keeps unrecorded prices distinct from zero bids and does not use player identity', () => {
    const withoutUnknown = {
      ...season,
      players: season.players.filter((player) => player.auctionCostCents !== null),
    };
    expect(fit([withoutUnknown])).toEqual(fit());
    const renamed = {
      ...season,
      players: season.players.map((player, index) => ({ ...player, playerId: `new-${index}` })),
    };
    expect(fit([renamed])).toEqual(fit());
    // No current pool enters pricing. Adding rookies or removing players cannot redistribute dollars.
    const independent = [18, 25, 30, 18].map((points) => estimate(points).valueCents);
    expect(independent).toEqual([3000, 6500, 9000, 3000]);
  });
  it('fits increasing values despite inverted observed prices and reports sparse upper support', () => {
    const inverted = {
      ...season,
      players: season.players.map((player) =>
        player.playerId === 'star' ? { ...player, auctionCostCents: 10000 } : player,
      ),
    };
    const model = fit([inverted]);
    let previous = 0;
    for (let points = 0; points <= 45; points += 0.5) {
      const value = valueProjectedProduction(model, {
        fantasyPointsPerGame: points,
        expectedGames: 60,
      });
      expect(value.valueCents).toBeGreaterThanOrEqual(previous);
      expect(value.comparableLowCents).toBeLessThanOrEqual(value.valueCents);
      expect(value.comparableHighCents).toBeGreaterThanOrEqual(value.valueCents);
      previous = value.valueCents;
    }
    expect(estimate(45)).toMatchObject({
      beyondSupport: true,
      comparableCount: 1,
      valueCents: 9000,
    });
  });
  it('uses the same production scale across budgets and deterministic season order', () => {
    const newer = { ...season, seasonKey: '2025-26' };
    expect(fit([season, newer])).toEqual(fit([newer, season]));
    const half = fitProductionValue({ history: [season], baseBudgetCents: 10000 });
    expect(
      valueProjectedProduction(half, { fantasyPointsPerGame: 25, expectedGames: 60 }).valueCents,
    ).toBe(3300);
  });
  it('rejects insufficient evidence, duplicate records, and invalid inputs', () => {
    expect(() => fit([])).toThrow('Not enough');
    expect(() => fit([{ ...season, players: season.players.slice(3) }])).toThrow('five');
    expect(() => fit([season, season])).toThrow('Duplicate seasons');
    expect(() => fit([{ ...season, players: [...season.players, season.players[0]!] }])).toThrow(
      'Duplicate players',
    );
    expect(() => estimate(NaN)).toThrow('Invalid projected FP/G');
    expect(() => estimate(20, -1)).toThrow('Invalid expected games');
    expect(() =>
      fitProductionValue({
        history: [season],
        baseBudgetCents: 20000,
        settings: { recencyDecay: 0 },
      }),
    ).toThrow('Invalid recency');
    expect(() =>
      fitProductionValue({
        history: [season],
        baseBudgetCents: 20000,
        settings: { replacementQuantile: 1 },
      }),
    ).toThrow('Invalid replacement');
  });
});
