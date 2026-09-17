import { describe, expect, it } from 'vitest';

import { currentLeagueScoring, scoreGame, scoreSeason } from './scoring';

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

describe('scoreSeason', () => {
  it('scores aggregated production without re-inferring season bonuses', () => {
    const result = scoreSeason({
      assists: 10,
      blocks: 1,
      doubleDoubles: 1,
      fieldGoalsMissed: 9,
      freeThrowsMissed: 2,
      gamesPlayed: 1,
      points: 30,
      rebounds: 10,
      steals: 2,
      threePointersMade: 4,
      tripleDoubles: 1,
      turnovers: 5,
    });

    expect(result.total).toBeCloseTo(35.7);
    expect(result.pointsPerGame).toBeCloseTo(35.7);
    expect(result.components).toMatchObject({ doubleDoubles: 2, tripleDoubles: 5 });
  });

  it('removes triple-doubles from the double-double count when bonuses do not stack', () => {
    const result = scoreSeason(
      {
        assists: 20,
        blocks: 0,
        doubleDoubles: 3,
        fieldGoalsMissed: 0,
        freeThrowsMissed: 0,
        gamesPlayed: 2,
        points: 50,
        rebounds: 20,
        steals: 0,
        threePointersMade: 0,
        tripleDoubles: 1,
        turnovers: 0,
      },
      { ...currentLeagueScoring, stackTripleDoubleBonuses: false },
    );

    expect(result.components.doubleDoubles).toBe(4);
    expect(result.components.tripleDoubles).toBe(5);
  });
});
