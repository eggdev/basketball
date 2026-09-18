import type { LeagueRosterActivityHistory } from '@fantasy-basketball/database/runtime';

export interface RosterActivityCohortSignal {
  readonly averageAcquisitions: number;
  readonly averageDepartures: number;
  readonly key: 'champion' | 'missed-playoffs' | 'other-playoff';
  readonly label: string;
  readonly teamSeasonCount: number;
}

export interface RosterActivityManagerSignal {
  readonly averageAcquisitions: number;
  readonly averageDepartures: number;
  readonly averageRank: number;
  readonly championships: number;
  readonly leagueMemberId: string | null;
  readonly managerName: string;
  readonly playoffAppearances: number;
  readonly seasonCount: number;
}

export interface RosterActivitySignals {
  readonly cohorts: ReadonlyArray<RosterActivityCohortSignal>;
  readonly managers: ReadonlyArray<RosterActivityManagerSignal>;
  readonly sampleSize: number;
}

type ActivityTeam = LeagueRosterActivityHistory['seasons'][number]['teams'][number];

const average = (values: ReadonlyArray<number>): number =>
  values.length === 0 ? 0 : values.reduce((total, value) => total + value, 0) / values.length;

const cohortDefinitions = [
  {
    key: 'champion' as const,
    label: 'Champions',
    matches: (team: ActivityTeam) => team.outcome?.postseasonResult === 'champion',
  },
  {
    key: 'other-playoff' as const,
    label: 'Other playoff teams',
    matches: (team: ActivityTeam) =>
      team.outcome?.madePlayoffs === true && team.outcome.postseasonResult !== 'champion',
  },
  {
    key: 'missed-playoffs' as const,
    label: 'Missed playoffs',
    matches: (team: ActivityTeam) => team.outcome?.madePlayoffs === false,
  },
] as const;

export const buildRosterActivitySignals = (
  history: LeagueRosterActivityHistory,
): RosterActivitySignals => {
  const teams = history.seasons.flatMap((season) => season.teams).filter((team) => team.outcome);
  const cohorts = cohortDefinitions.map(({ key, label, matches }) => {
    const members = teams.filter(matches);
    return {
      averageAcquisitions: average(members.map((team) => team.totalAcquisitionCount)),
      averageDepartures: average(members.map((team) => team.departureCount)),
      key,
      label,
      teamSeasonCount: members.length,
    };
  });
  const teamsByManager = new Map<string, ActivityTeam[]>();
  for (const team of teams) {
    const key = team.leagueMemberId ?? team.managerName ?? `team:${team.teamName}`;
    const managerTeams = teamsByManager.get(key) ?? [];
    managerTeams.push(team);
    teamsByManager.set(key, managerTeams);
  }
  const managers = [...teamsByManager.values()]
    .map((managerTeams): RosterActivityManagerSignal => {
      const first = managerTeams[0]!;
      return {
        averageAcquisitions: average(managerTeams.map((team) => team.totalAcquisitionCount)),
        averageDepartures: average(managerTeams.map((team) => team.departureCount)),
        averageRank: average(managerTeams.map((team) => team.outcome?.rank ?? 0)),
        championships: managerTeams.filter(
          (team) => team.outcome?.postseasonResult === 'champion',
        ).length,
        leagueMemberId: first.leagueMemberId,
        managerName: first.managerName ?? first.teamName,
        playoffAppearances: managerTeams.filter((team) => team.outcome?.madePlayoffs === true).length,
        seasonCount: managerTeams.length,
      };
    })
    .sort(
      (left, right) =>
        right.championships - left.championships ||
        right.playoffAppearances / right.seasonCount -
          left.playoffAppearances / left.seasonCount ||
        left.averageRank - right.averageRank ||
        left.managerName.localeCompare(right.managerName),
    );

  return { cohorts, managers, sampleSize: teams.length };
};
