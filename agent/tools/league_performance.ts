import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';
import { defineTool } from 'eve/tools';
import { z } from 'zod';

const inputSchema = z.object({
  season: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .describe('Optional league season such as 2025-26. Omit to compare every imported season.'),
  teamQuery: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional partial canonical manager or historical team name.'),
});

const teamSchema = z.object({
  allPlayWinPercentage: z.number(),
  averageActiveGames: z.number(),
  averageOpponentScore: z.number(),
  averageWeeklyScore: z.number(),
  expectedWins: z.number(),
  luckWins: z.number(),
  managerName: z.string().nullable(),
  pointsFor: z.number(),
  pointsPerActiveGame: z.number(),
  postseasonResult: z.string(),
  rank: z.number(),
  record: z.string(),
  scoreStandardDeviation: z.number(),
  teamName: z.string(),
  winPercentage: z.number(),
});

const outputSchema = z.object({
  availableSeasons: z.array(z.string()),
  methodology: z.string(),
  seasons: z.array(
    z.object({
      championManager: z.string().nullable(),
      championTeam: z.string().nullable(),
      playoffTeamCount: z.number(),
      scoringType: z.string(),
      season: z.string(),
      teams: z.array(teamSchema),
    }),
  ),
});

export default defineTool({
  description:
    'Compare historical league outcomes from Fantrax standings and weekly matchup scores. Use this for champions, playoff finishes, regular-season records, weekly scoring, active games, schedule-neutral all-play strength, consistency, and schedule luck. This does not identify transactions or prove why a team won.',
  inputSchema,
  outputSchema,
  label: {
    start: ({ season, teamQuery }) =>
      teamQuery
        ? `Load outcome history for ${teamQuery}`
        : `Load ${season ?? 'historical'} league outcomes`,
    complete: (_input, output) => `Loaded outcomes for ${output.seasons.length} season(s)`,
  },
  async execute({ season, teamQuery }) {
    const config = await Effect.runPromise(loadDatabaseConfig());
    const history = await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.leaguePerformanceHistory;
      }).pipe(Effect.provide(databaseLayer(config))),
    );
    const normalizedQuery = teamQuery?.toLocaleLowerCase() ?? null;
    const seasons = history.seasons
      .filter((candidate) => season === undefined || candidate.seasonKey === season)
      .map((candidate) => ({
        championManager: candidate.champion?.managerName ?? null,
        championTeam: candidate.champion?.teamName ?? null,
        playoffTeamCount: candidate.playoffTeamCount,
        scoringType: candidate.scoringType,
        season: candidate.seasonKey,
        teams: candidate.teams
          .filter(
            (team) =>
              normalizedQuery === null ||
              team.teamName.toLocaleLowerCase().includes(normalizedQuery) ||
              team.managerName?.toLocaleLowerCase().includes(normalizedQuery) === true,
          )
          .map((team) => ({
            allPlayWinPercentage: team.allPlayWinPercentage,
            averageActiveGames: team.averageActiveGames,
            averageOpponentScore: team.averageOpponentScore,
            averageWeeklyScore: team.averageWeeklyScore,
            expectedWins: team.expectedWins,
            luckWins: team.luckWins,
            managerName: team.managerName,
            pointsFor: team.pointsFor,
            pointsPerActiveGame: team.pointsPerActiveGame,
            postseasonResult: team.postseasonResult,
            rank: team.rank,
            record: team.record,
            scoreStandardDeviation: team.scoreStandardDeviation,
            teamName: team.teamName,
            winPercentage: team.winPercentage,
          })),
      }));
    if (season !== undefined && seasons.length === 0) {
      throw new Error(
        `Performance season ${season} is unavailable. Available seasons: ${history.seasons.map((candidate) => candidate.seasonKey).join(', ')}`,
      );
    }

    return {
      availableSeasons: history.seasons.map((candidate) => candidate.seasonKey),
      methodology:
        'Standings and playoff results come directly from Fantrax. Weekly score and active-game metrics come from getMatchupScores. All-play win percentage compares each weekly score against every other team that week; expected wins applies that rate to the regular-season schedule, and luck wins is actual wins plus half of ties minus expected wins. These are descriptive associations, not causal proof of a draft or transaction strategy. The 2021-22 season used category scoring and should not be compared directly with later raw point totals.',
      seasons,
    };
  },
});
