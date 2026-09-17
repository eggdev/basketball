import { describe, expect, it } from 'vitest';

import { currentLeagueScoring, scoreGame } from './scoring';

const tripleDouble = {
  points: 30,
  rebounds: 10,
  assists: 10,
  steals: 2,
  blocks: 1,
  threePointersMade: 4,
  turnovers: 5,
  fieldGoalsMade: 11,
  fieldGoalsAttempted: 20,
  freeThrowsMade: 4,
  freeThrowsAttempted: 6,
};

describe('scoreGame', () => {
  it('scores the current league rules and stacks triple-double bonuses', () => {
    const result = scoreGame(tripleDouble);

    expect(result.total).toBeCloseTo(35.7);
    expect(result.bonuses).toEqual({
      doubleDouble: true,
      tripleDouble: true,
      points: 7,
    });
  });

  it('can treat the triple-double bonus as replacing the double-double bonus', () => {
    const result = scoreGame(tripleDouble, {
      ...currentLeagueScoring,
      stackTripleDoubleBonuses: false,
    });

    expect(result.total).toBeCloseTo(33.7);
    expect(result.bonuses.points).toBe(5);
  });
});
