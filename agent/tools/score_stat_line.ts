import { currentLeagueScoring, scoreGame } from '@fantasy-basketball/fantasy';
import { defineTool } from 'eve/tools';
import { z } from 'zod';

const countingStat = z.number().finite().nonnegative();

const inputSchema = z.object({
  points: countingStat,
  rebounds: countingStat,
  assists: countingStat,
  steals: countingStat,
  blocks: countingStat,
  threePointersMade: countingStat,
  turnovers: countingStat,
  fieldGoalsMade: countingStat,
  fieldGoalsAttempted: countingStat,
  freeThrowsMade: countingStat,
  freeThrowsAttempted: countingStat,
});

const outputSchema = z.object({
  total: z.number(),
  components: z.record(z.string(), z.number()),
  bonuses: z.object({
    doubleDouble: z.boolean(),
    tripleDouble: z.boolean(),
    points: z.number(),
  }),
  scoringRules: z.object({
    points: z.number(),
    rebounds: z.number(),
    assists: z.number(),
    steals: z.number(),
    blocks: z.number(),
    threePointersMade: z.number(),
    turnovers: z.number(),
    fieldGoalsMissed: z.number(),
    freeThrowsMissed: z.number(),
    doubleDoubleBonus: z.number(),
    tripleDoubleBonus: z.number(),
    stackTripleDoubleBonuses: z.boolean(),
  }),
});

export default defineTool({
  description: "Score one NBA stat line using the league's current Fantrax scoring rules.",
  inputSchema,
  outputSchema,
  label: {
    start: () => 'Score stat line',
    complete: (_input, output) => `Stat line scores ${output.total.toFixed(1)} fantasy points`,
  },
  execute(input) {
    return {
      ...scoreGame(input),
      scoringRules: currentLeagueScoring,
    };
  },
});
