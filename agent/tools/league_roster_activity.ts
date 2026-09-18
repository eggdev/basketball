import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database/runtime';
import { Effect } from 'effect';
import { defineTool } from 'eve/tools';
import { z } from 'zod';

const inputSchema = z.object({
  limit: z.number().int().min(1).max(100).default(30),
  season: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .describe('Optional season such as 2025-26. Omit to compare every imported season.'),
  teamQuery: z
    .string()
    .trim()
    .min(1)
    .optional()
    .describe('Optional partial canonical manager or historical team name.'),
});

const teamSchema = z.object({
  addCount: z.number(),
  departureCount: z.number(),
  dropCount: z.number(),
  managerName: z.string().nullable(),
  outcome: z
    .object({
      madePlayoffs: z.boolean(),
      postseasonResult: z.enum([
        'champion',
        'missed-playoffs',
        'playoff-qualifier',
        'quarterfinalist',
        'runner-up',
        'semifinalist',
      ]),
      rank: z.number(),
    })
    .nullable(),
  teamName: z.string(),
  totalAcquisitionCount: z.number(),
  transferInCount: z.number(),
  transferOutCount: z.number(),
});

const changeSchema = z.object({
  changeType: z.enum(['add', 'drop', 'team-change']),
  fromManager: z.string().nullable(),
  fromTeam: z.string().nullable(),
  observedAt: z.string(),
  playerName: z.string(),
  rosterPeriod: z.number(),
  toManager: z.string().nullable(),
  toTeam: z.string().nullable(),
});

const outputSchema = z.object({
  availableSeasons: z.array(z.string()),
  methodology: z.string(),
  seasons: z.array(
    z.object({
      baselineRosterPeriod: z.number(),
      changeCount: z.number(),
      changes: z.array(changeSchema),
      season: z.string(),
      snapshotCount: z.number(),
      teams: z.array(teamSchema),
    }),
  ),
});

export default defineTool({
  description:
    'Review historical daily roster activity inferred from adjacent Fantrax roster snapshots. Use this for manager churn, likely adds and drops, direct team-to-team ownership changes, and dated player movement. These are observed roster deltas, not confirmed waiver claims or trade records.',
  inputSchema,
  outputSchema,
  label: {
    start: ({ season, teamQuery }) =>
      teamQuery
        ? `Load roster activity for ${teamQuery}`
        : `Load ${season ?? 'historical'} roster activity`,
    complete: (_input, output) => `Loaded roster activity for ${output.seasons.length} season(s)`,
  },
  async execute({ limit, season, teamQuery }) {
    const config = await Effect.runPromise(loadDatabaseConfig());
    const history = await Effect.runPromise(
      Effect.gen(function* () {
        const database = yield* Database;
        return yield* database.leagueRosterActivity;
      }).pipe(Effect.provide(databaseLayer(config))),
    );
    const normalizedQuery = teamQuery?.toLocaleLowerCase() ?? null;
    const matchesTeam = (team: { managerName: string | null; teamName: string }): boolean =>
      normalizedQuery === null ||
      team.teamName.toLocaleLowerCase().includes(normalizedQuery) ||
      team.managerName?.toLocaleLowerCase().includes(normalizedQuery) === true;
    const seasons = history.seasons
      .filter((candidate) => season === undefined || candidate.seasonKey === season)
      .map((candidate) => ({
        baselineRosterPeriod: candidate.baselineRosterPeriod,
        changeCount: candidate.changeCount,
        changes: candidate.changes
          .filter(
            (change) =>
              normalizedQuery === null ||
              (change.fromTeam !== null && matchesTeam(change.fromTeam)) ||
              (change.toTeam !== null && matchesTeam(change.toTeam)),
          )
          .slice(0, limit)
          .map((change) => ({
            changeType: change.changeType,
            fromManager: change.fromTeam?.managerName ?? null,
            fromTeam: change.fromTeam?.teamName ?? null,
            observedAt: change.observedAt,
            playerName: change.playerName,
            rosterPeriod: change.rosterPeriod,
            toManager: change.toTeam?.managerName ?? null,
            toTeam: change.toTeam?.teamName ?? null,
          })),
        season: candidate.seasonKey,
        snapshotCount: candidate.snapshotCount,
        teams: candidate.teams.filter(matchesTeam).map((team) => ({
          addCount: team.addCount,
          departureCount: team.departureCount,
          dropCount: team.dropCount,
          managerName: team.managerName,
          outcome: team.outcome,
          teamName: team.teamName,
          totalAcquisitionCount: team.totalAcquisitionCount,
          transferInCount: team.transferInCount,
          transferOutCount: team.transferOutCount,
        })),
      }));
    if (season !== undefined && seasons.length === 0) {
      throw new Error(
        `Roster activity season ${season} is unavailable. Available seasons: ${history.seasons.map((candidate) => candidate.seasonKey).join(', ')}`,
      );
    }

    return {
      availableSeasons: history.seasons.map((candidate) => candidate.seasonKey),
      methodology:
        'Each record is inferred by comparing one complete daily Fantrax roster snapshot with the next. A player appearing from free agency is an add, disappearing is a drop, and changing teams on adjacent snapshots is a team change. The initial populated roster is a baseline, not a set of acquisitions. Outcomes come from imported Fantrax standings. The public API does not provide waiver priority, FAAB, trade packages, or an authoritative transaction type, so do not describe these records as confirmed transactions or claim that roster churn caused an outcome.',
      seasons,
    };
  },
});
