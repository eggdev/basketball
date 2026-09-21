import type { TeamHqProps } from '../src/app/team/team-hq';
import type { LeaguePerformanceTeam } from '@fantasy-basketball/database/runtime';

// Synthetic fixtures only. Never loaded by the application routes.
const names = [
  'Nikola Jokic',
  'Jalen Williams',
  'Derrick White',
  'Jalen Brunson',
  'Bam Adebayo',
  'Trey Murphy III',
];
const costs = [8200, 2800, 1800, 4200, 2200, 800];
const teamNames = ['Our Test Team', 'Northside Hoops', 'Full Court Press', 'The Rebounders'];
const teams = teamNames.map((teamName, index) => ({
  baseBudgetBalanceCents: 0,
  division: null,
  owner: {
    displayName: index === 0 ? 'Clyde' : `Test Manager ${index}`,
    memberId: `member-${index}`,
  },
  roster: names
    .slice(0, index === 0 ? 6 : 2)
    .map((playerName, playerIndex) => ({
      auctionCostCents: costs[playerIndex],
      nominationOrder: playerIndex + 1,
      playerId: `player-${index}-${playerIndex}`,
      playerName,
      rosterSlot: playerIndex + 1,
    })),
  rosterCount: index === 0 ? 6 : 2,
  sourceTeamId: `source-${index}`,
  spendCents: index === 0 ? 20000 : 11000,
  teamName,
  teamSeasonId: `team-${index}`,
}));
const performanceTeams: LeaguePerformanceTeam[] = teamNames.map((teamName, index) => ({
  allPlayWinPercentage: [0.64, 0.76, 0.57, 0.42][index],
  averageActiveGames: [38, 42, 36, 35][index],
  averageOpponentScore: 1300,
  averageWeeklyScore: [1420, 1530, 1380, 1220][index],
  expectedWins: 12,
  gamesBack: index,
  highScore: 1800,
  leagueMemberId: `member-${index}`,
  lowScore: 900,
  luckWins: [-1.5, 2, 0.5, -1][index],
  managerName: teams[index].owner.displayName,
  madePlayoffs: index < 3,
  pointsFor: 24000,
  pointsPerActiveGame: 36,
  postseasonFinish: index + 1,
  postseasonResult: index === 0 ? 'runner-up' : 'playoff-qualifier',
  rank: [2, 1, 3, 4][index],
  record: ['13–7', '16–4', '12–8', '8–12'][index],
  scoreStandardDeviation: 200,
  sourceTeamId: `source-${index}`,
  teamName,
  teamSeasonId: `team-${index}`,
  weeklyScores: [],
  winPercentage: 0.6,
}));
export const teamHqFixture: TeamHqProps = {
  authenticated: true,
  memberId: 'member-0',
  situations: null,
  snapshot: {
    seasons: [
      {
        baseBudgetCents: 20000,
        draftedPlayerCount: 12,
        name: 'Test league',
        rosterSize: 13,
        rosterStatus: 'partial',
        seasonKey: '2025-26',
        teamCount: 4,
        teams,
        totalSpendCents: 53000,
      },
      {
        baseBudgetCents: 20000,
        draftedPlayerCount: 0,
        name: 'Upcoming season',
        rosterSize: 13,
        rosterStatus: 'empty',
        seasonKey: '2026-27',
        teamCount: 0,
        teams: [],
        totalSpendCents: 0,
      },
    ],
    summary: { latestPopulatedSeason: '2025-26', latestSeason: '2026-27', seasonCount: 2 },
  },
  performance: {
    seasons: [
      {
        champion: null,
        firstPlayoffPeriod: 21,
        lastRegularSeasonPeriod: 20,
        playoffTeamCount: 3,
        scoringType: 'points',
        seasonKey: '2025-26',
        teams: performanceTeams,
      },
    ],
    summary: { latestSeason: '2025-26', matchupCount: 80, seasonCount: 1, teamSeasonCount: 4 },
  },
  projections: {
    asOf: '2026-09-20',
    createdAt: '2026-09-20',
    modelVersion: 'test',
    seasonKey: '2026-27',
    snapshotId: 'test',
    source: 'synthetic',
    summary: { durablePlayerCount: 6, fragilePlayerCount: 0, playerCount: 6 },
    players: names.map((playerName, index) => ({
      availability: {
        expectedGames: 72 - index,
        expectedGamesMissed: 10 + index,
        rate: 0.88,
        scheduledGames: 82,
        tier: 'durable',
      },
      bonuses: {
        doubleDoubleRate: 0.1,
        expectedDoubleDoubles: 7,
        expectedTripleDoubles: 0,
        tripleDoubleRate: 0,
      },
      fantasyPoints: 3500 - index * 300,
      fantasyPointsPerGame: 52 - index * 5,
      playerId: `player-0-${index}`,
      playerName,
      positions: [index === 0 ? 'C' : 'G'],
      rank: index + 1,
      schedule: null,
      teamAbbreviation: ['DEN', 'OKC', 'BOS', 'NYK', 'MIA', 'NOP'][index],
    })),
  },
};
