import { Effect, Exit } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  commitHistoricalScoring,
  planHistoricalScoring,
  type HistoricalScoringCommitter,
  type PlayerProductionSeason,
} from './historical-scoring';

const scoringConfig = JSON.stringify({
  name: 'League Points',
  version: 1,
  applies_to_seasons: ['2024-25'],
  stack_triple_double_bonuses: true,
  rules: [
    { stat_key: 'ast', label: 'Assists (AST)', points: 0.8 },
    { stat_key: 'blk', label: 'Blocks (BLK)', points: 1 },
    { stat_key: 'fg_missed', label: 'Field Goals Missed (FG-)', points: -0.2 },
    { stat_key: 'ft_missed', label: 'Free Throws Missed (FT-)', points: -0.1 },
    { stat_key: 'pts', label: 'Points (PTS)', points: 0.5 },
    { stat_key: 'reb', label: 'Rebounds (REB)', points: 0.7 },
    { stat_key: 'stl', label: 'Steals (ST)', points: 1 },
    { stat_key: 'fg3m', label: 'Three Pointers Made (3PTM)', points: 0.3 },
    { stat_key: 'triple_double', label: 'Triple Doubles (3D)', points: 5 },
    { stat_key: 'turnover', label: 'Turnovers (TO)', points: -0.7 },
    { stat_key: 'double_double', label: 'Double Doubles (2D)', points: 2 },
  ],
});

const production = (overrides: Partial<PlayerProductionSeason>): PlayerProductionSeason => ({
  gamesPlayed: 1,
  playerId: 'player-1',
  playerName: 'Triple Double',
  seasonKey: '2024-25',
  stats: {
    ast: 10,
    blk: 1,
    double_double: 1,
    fg3m: 4,
    fg_missed: 9,
    ft_missed: 2,
    pts: 30,
    reb: 10,
    stl: 2,
    triple_double: 1,
    turnover: 5,
  },
  ...overrides,
});

describe('planHistoricalScoring', () => {
  it('scores, sorts, and ranks historical player production', async () => {
    const plan = await Effect.runPromise(
      planHistoricalScoring(scoringConfig, [
        production({}),
        production({
          gamesPlayed: 2,
          playerId: 'player-2',
          playerName: 'Volume Scorer',
          stats: {
            ast: 0,
            blk: 0,
            double_double: 0,
            fg3m: 0,
            fg_missed: 0,
            ft_missed: 0,
            pts: 60,
            reb: 0,
            stl: 0,
            triple_double: 0,
            turnover: 0,
          },
        }),
      ]),
    );

    expect(plan.summary).toEqual({ playerSeasonCount: 2, ruleCount: 11, seasonCount: 1 });
    expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(plan.rankings).toMatchObject([
      {
        fantasyPoints: 35.7,
        fantasyPointsPerGame: 35.7,
        playerName: 'Triple Double',
        rank: 1,
      },
      {
        fantasyPoints: 30,
        fantasyPointsPerGame: 15,
        playerName: 'Volume Scorer',
        rank: 2,
      },
    ]);
    expect(plan.rankings[0]?.components).toMatchObject({ doubleDoubles: 2, tripleDoubles: 5 });
  });

  it('rejects an incomplete scoring table', async () => {
    const parsed = JSON.parse(scoringConfig) as { rules: unknown[] };
    parsed.rules.pop();

    const exit = await Effect.runPromiseExit(
      planHistoricalScoring(JSON.stringify(parsed), [production({})]),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain('double_double');
  });

  it('commits the exact validated plan through the persistence seam', async () => {
    const plan = await Effect.runPromise(planHistoricalScoring(scoringConfig, [production({})]));
    const replaceHistoricalScoring = vi.fn<
      HistoricalScoringCommitter<never>['replaceHistoricalScoring']
    >(() =>
      Effect.succeed({
        ingestionRunId: 'run-1',
        rankingCount: 1,
        ruleSetCount: 1,
        seasonCount: 1,
      }),
    );

    const result = await Effect.runPromise(
      commitHistoricalScoring(plan, { replaceHistoricalScoring }),
    );

    expect(result.rankingCount).toBe(1);
    expect(replaceHistoricalScoring).toHaveBeenCalledWith(
      expect.objectContaining({ fingerprint: plan.fingerprint, rankings: plan.rankings }),
    );
  });

  it('returns a typed validation error for malformed JSON', async () => {
    const exit = await Effect.runPromiseExit(planHistoricalScoring('{', [production({})]));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain('HistoricalScoringValidationError');
  });
});
