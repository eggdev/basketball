import { Schema } from 'effect';

const CountingStat = Schema.Number.pipe(Schema.finite(), Schema.nonNegative());
const ScoringWeight = Schema.Number.pipe(Schema.finite());

export const GameStatLine = Schema.Struct({
  points: CountingStat,
  rebounds: CountingStat,
  assists: CountingStat,
  steals: CountingStat,
  blocks: CountingStat,
  threePointersMade: CountingStat,
  turnovers: CountingStat,
  fieldGoalsMade: CountingStat,
  fieldGoalsAttempted: CountingStat,
  freeThrowsMade: CountingStat,
  freeThrowsAttempted: CountingStat,
});

export type GameStatLine = Schema.Schema.Type<typeof GameStatLine>;

export const ScoringRules = Schema.Struct({
  points: ScoringWeight,
  rebounds: ScoringWeight,
  assists: ScoringWeight,
  steals: ScoringWeight,
  blocks: ScoringWeight,
  threePointersMade: ScoringWeight,
  turnovers: ScoringWeight,
  fieldGoalsMissed: ScoringWeight,
  freeThrowsMissed: ScoringWeight,
  doubleDoubleBonus: ScoringWeight,
  tripleDoubleBonus: ScoringWeight,
  stackTripleDoubleBonuses: Schema.Boolean,
});

export type ScoringRules = Schema.Schema.Type<typeof ScoringRules>;

export const currentLeagueScoring = {
  points: 0.5,
  rebounds: 0.7,
  assists: 0.8,
  steals: 1,
  blocks: 1,
  threePointersMade: 0.3,
  turnovers: -0.7,
  fieldGoalsMissed: -0.2,
  freeThrowsMissed: -0.1,
  doubleDoubleBonus: 2,
  tripleDoubleBonus: 5,
  stackTripleDoubleBonuses: true,
} satisfies ScoringRules;

export interface FantasyPointBreakdown {
  readonly total: number;
  readonly components: Readonly<Record<string, number>>;
  readonly bonuses: {
    readonly doubleDouble: boolean;
    readonly tripleDouble: boolean;
    readonly points: number;
  };
}

export function scoreGame(
  stats: GameStatLine,
  rules: ScoringRules = currentLeagueScoring,
): FantasyPointBreakdown {
  const fieldGoalsMissed = Math.max(0, stats.fieldGoalsAttempted - stats.fieldGoalsMade);
  const freeThrowsMissed = Math.max(0, stats.freeThrowsAttempted - stats.freeThrowsMade);
  const doubleDigitCategories = [
    stats.points,
    stats.rebounds,
    stats.assists,
    stats.steals,
    stats.blocks,
  ].filter((value) => value >= 10).length;
  const doubleDouble = doubleDigitCategories >= 2;
  const tripleDouble = doubleDigitCategories >= 3;
  const doubleDoublePoints =
    doubleDouble && (!tripleDouble || rules.stackTripleDoubleBonuses) ? rules.doubleDoubleBonus : 0;
  const tripleDoublePoints = tripleDouble ? rules.tripleDoubleBonus : 0;
  const bonusPoints = doubleDoublePoints + tripleDoublePoints;

  const components = {
    points: stats.points * rules.points,
    rebounds: stats.rebounds * rules.rebounds,
    assists: stats.assists * rules.assists,
    steals: stats.steals * rules.steals,
    blocks: stats.blocks * rules.blocks,
    threePointersMade: stats.threePointersMade * rules.threePointersMade,
    turnovers: stats.turnovers * rules.turnovers,
    fieldGoalsMissed: fieldGoalsMissed * rules.fieldGoalsMissed,
    freeThrowsMissed: freeThrowsMissed * rules.freeThrowsMissed,
    bonuses: bonusPoints,
  } satisfies Readonly<Record<string, number>>;

  return {
    total: Object.values(components).reduce((total, value) => total + value, 0),
    components,
    bonuses: {
      doubleDouble,
      tripleDouble,
      points: bonusPoints,
    },
  };
}
