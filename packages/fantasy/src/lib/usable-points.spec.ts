import { describe, expect, it } from 'vitest';

import type { LeagueLineupSlot } from './league-format';
import {
  buildUsablePointsBoard,
  evaluateRosterCandidate,
  type UsablePointsBoardInput,
  type UsablePointsPlayer,
} from './usable-points';

const game = {
  awayTeam: 'BBB',
  date: '2026-10-20',
  homeTeam: 'AAA',
  postponed: false,
  scheduledAt: '2026-10-20T23:00:00.000Z',
};

const regularFantasyPeriods: UsablePointsBoardInput['seasonCalendar']['fantasyPeriods'] = [
  {
    endAt: '2026-11-30T23:59:59.999Z',
    label: 'Regular season',
    phase: 'regular-season',
    scoringPeriod: 1,
    startAt: '2026-10-01T00:00:00.000Z',
    weight: 1,
  },
];

const sameDayPlayoffBoundaryCalendar: UsablePointsBoardInput['seasonCalendar'] = {
  asOf: '2027-03-01T00:00:00.000Z',
  fingerprint: 'calendar-same-day-boundary',
  fantasyPeriods: [
    {
      endAt: '2027-03-15T22:59:58.000Z',
      label: 'Quarterfinal',
      phase: 'playoffs',
      scoringPeriod: 21,
      startAt: '2027-03-08T00:00:00.000Z',
      weight: 0.75,
    },
    {
      endAt: '2027-03-22T22:59:58.000Z',
      label: 'Semifinal',
      phase: 'playoffs',
      scoringPeriod: 22,
      startAt: '2027-03-15T23:00:00.000Z',
      weight: 1,
    },
  ],
  games: [
    {
      awayTeam: 'BBB',
      date: '2027-03-15',
      homeTeam: 'AAA',
      postponed: false,
      scheduledAt: '2027-03-15T22:59:58.000Z',
    },
    {
      awayTeam: 'BBB',
      date: '2027-03-15',
      homeTeam: 'AAA',
      postponed: false,
      scheduledAt: '2027-03-15T22:59:58.000Z',
    },
    {
      awayTeam: 'DDD',
      date: '2027-03-15',
      homeTeam: 'CCC',
      postponed: false,
      scheduledAt: '2027-03-15T23:00:00.000Z',
    },
  ],
  snapshotId: 'snapshot-same-day-boundary',
};

const player = (
  playerId: string,
  positions: UsablePointsPlayer['positions'],
  fantasyPointsPerGame: number,
  teamAbbreviation = 'AAA',
): UsablePointsPlayer => ({
  availabilityRate: 1,
  fantasyPoints: fantasyPointsPerGame,
  fantasyPointsPerGame,
  playerId,
  playerName: playerId,
  positions,
  projectionRank: 1,
  teamAbbreviation,
});

const slots = (...values: ReadonlyArray<LeagueLineupSlot>): ReadonlyArray<LeagueLineupSlot> =>
  values;

const slot = (
  code: LeagueLineupSlot['code'],
  eligiblePositions: LeagueLineupSlot['eligiblePositions'],
  maxActive = 1,
): LeagueLineupSlot => ({ code, eligiblePositions, label: code, maxActive, minActive: 0 });

const board = (
  input: Pick<UsablePointsBoardInput, 'lineupSlots' | 'players'> &
    Partial<Omit<UsablePointsBoardInput, 'lineupSlots' | 'players'>>,
) =>
  buildUsablePointsBoard({
    baseBudgetCents: input.baseBudgetCents ?? 20_000,
    leagueFormatFingerprint: input.leagueFormatFingerprint ?? 'format-1',
    leagueFormatVersion: input.leagueFormatVersion ?? 1,
    lineupSlots: input.lineupSlots,
    players: input.players,
    rosterSize: input.rosterSize ?? Math.max(1, input.players.length),
    seasonCalendar:
      input.seasonCalendar ??
      ({
        asOf: '2026-09-19T00:00:00.000Z',
        fantasyPeriods: regularFantasyPeriods,
        fingerprint: 'calendar-1',
        games: [game],
        snapshotId: 'snapshot-1',
      } satisfies UsablePointsBoardInput['seasonCalendar']),
    streamingSlotsPerTeam: input.streamingSlotsPerTeam ?? 0,
    teamCount: input.teamCount ?? 1,
  });

describe('buildUsablePointsBoard daily assignment', () => {
  it('uses multi-position eligibility to maximize the lineup', () => {
    const result = board({
      lineupSlots: slots(slot('PG', ['PG']), slot('SG', ['SG'])),
      players: [player('combo', ['PG', 'SG'], 20), player('point', ['PG'], 15)],
    });

    expect(result.dailyAssignments).toEqual([
      {
        benchedPlayerIds: [],
        date: '2026-10-20',
        selected: [
          { playerId: 'point', slotCode: 'PG' },
          { playerId: 'combo', slotCode: 'SG' },
        ],
        totalExpectedPoints: 35,
      },
    ]);
  });

  it('uses the flex slot for the best compatible player without double assignment', () => {
    const result = board({
      lineupSlots: slots(slot('PG', ['PG']), slot('FLX', ['PG', 'SG', 'SF', 'PF', 'C'])),
      players: [
        player('point-one', ['PG'], 30),
        player('center', ['C'], 29),
        player('point-two', ['PG'], 28),
      ],
    });
    const assignment = result.dailyAssignments[0]!;

    expect(assignment.selected).toEqual([
      { playerId: 'point-one', slotCode: 'PG' },
      { playerId: 'center', slotCode: 'FLX' },
    ]);
    expect(assignment.benchedPlayerIds).toEqual(['point-two']);
    expect(new Set(assignment.selected.map(({ playerId }) => playerId)).size).toBe(
      assignment.selected.length,
    );
  });

  it('returns an empty assignment for an empty roster', () => {
    const result = board({
      lineupSlots: slots(slot('FLX', ['PG', 'SG', 'SF', 'PF', 'C'])),
      players: [],
    });

    expect(result.dailyAssignments).toEqual([
      {
        benchedPlayerIds: [],
        date: '2026-10-20',
        selected: [],
        totalExpectedPoints: 0,
      },
    ]);
  });

  it('starts every scheduled player when fewer players than slots are available', () => {
    const result = board({
      lineupSlots: slots(slot('PG', ['PG']), slot('SG', ['SG']), slot('FLX', ['PG', 'SG'])),
      players: [player('point', ['PG'], 20), player('shooting', ['SG'], 15)],
    });

    expect(result.dailyAssignments[0]).toMatchObject({
      benchedPlayerIds: [],
      totalExpectedPoints: 35,
    });
  });

  it('benches the lowest-value player during same-day congestion', () => {
    const result = board({
      lineupSlots: slots(slot('PG', ['PG'])),
      players: [player('best', ['PG'], 20), player('bench', ['PG'], 10, 'BBB')],
    });

    expect(result.dailyAssignments[0]).toMatchObject({
      benchedPlayerIds: ['bench'],
      selected: [{ playerId: 'best', slotCode: 'PG' }],
      totalExpectedPoints: 20,
    });
  });

  it('breaks equal-value selection ties by player ID', () => {
    const result = board({
      lineupSlots: slots(slot('PG', ['PG'])),
      players: [player('player-b', ['PG'], 20), player('player-a', ['PG'], 20)],
    });

    expect(result.dailyAssignments[0]).toMatchObject({
      benchedPlayerIds: ['player-b'],
      selected: [{ playerId: 'player-a', slotCode: 'PG' }],
    });
  });
});

describe('buildUsablePointsBoard league value', () => {
  it('conserves the exact league auction pool in cents', () => {
    const result = board({
      baseBudgetCents: 20_001,
      lineupSlots: slots(slot('FLX', ['PG', 'SG', 'SF', 'PF', 'C'], 2)),
      players: [player('one', ['PG'], 30), player('two', ['SG'], 20), player('three', ['C'], 10)],
      rosterSize: 3,
    });

    expect(result.auctionPoolCents).toBe(20_001);
    expect(result.totalAllocatedCents).toBe(20_001);
    expect(result.players.reduce((sum, candidate) => sum + candidate.valueCents, 0)).toBe(20_001);
    expect(result.players.filter((candidate) => candidate.valueCents > 0)).toHaveLength(2);
    expect(result.zeroDollarPlayerCount).toBe(1);
    expect(result.auctionRules.minimumBidCents).toBe(0);
  });

  it('changes replacement value when a constrained position fills a required slot', () => {
    const players = [
      player('guard-one', ['PG'], 30),
      player('guard-two', ['PG'], 29),
      player('center', ['C'], 20),
    ];
    const constrained = board({
      lineupSlots: slots(slot('PG', ['PG']), slot('C', ['C'])),
      players,
      rosterSize: 3,
    });
    const flexible = board({
      lineupSlots: slots(slot('FLX', ['PG', 'SG', 'SF', 'PF', 'C'], 2)),
      players,
      rosterSize: 3,
    });

    expect(
      constrained.players.find(({ playerId }) => playerId === 'center')?.valueCents,
    ).toBeGreaterThan(
      flexible.players.find(({ playerId }) => playerId === 'center')?.valueCents ?? 0,
    );
  });

  it('rewards otherwise equal players for denser schedules', () => {
    const result = board({
      lineupSlots: slots(slot('FLX', ['PG', 'SG', 'SF', 'PF', 'C'], 2)),
      players: [player('dense', ['PG'], 20, 'AAA'), player('light', ['PG'], 20, 'BBB')],
      rosterSize: 2,
      seasonCalendar: {
        asOf: '2026-09-19T00:00:00.000Z',
        fantasyPeriods: regularFantasyPeriods,
        fingerprint: 'calendar-2',
        games: [
          game,
          {
            ...game,
            awayTeam: 'CCC',
            date: '2026-10-21',
            scheduledAt: '2026-10-21T23:00:00.000Z',
          },
        ],
        snapshotId: 'snapshot-2',
      },
    });

    const dense = result.players.find(({ playerId }) => playerId === 'dense')!;
    const light = result.players.find(({ playerId }) => playerId === 'light')!;
    expect(dense.expectedScheduledPoints).toBe(40);
    expect(light.expectedScheduledPoints).toBe(20);
    expect(dense.valueCents).toBeGreaterThan(light.valueCents);
  });

  it('applies availability and playoff-period weight to usable production', () => {
    const result = board({
      lineupSlots: slots(slot('PG', ['PG'])),
      players: [{ ...player('managed', ['PG'], 20), availabilityRate: 0.5 }],
      seasonCalendar: {
        asOf: '2026-09-19T00:00:00.000Z',
        fantasyPeriods: [
          {
            endAt: '2026-10-20T23:59:59.999Z',
            label: 'Championship',
            phase: 'playoffs',
            scoringPeriod: 24,
            startAt: '2026-10-20T00:00:00.000Z',
            weight: 2,
          },
        ],
        fingerprint: 'calendar-playoff',
        games: [game],
        snapshotId: 'snapshot-playoff',
      },
    });

    expect(result.players[0]).toMatchObject({
      availabilityExposure: 0.5,
      capturedPlayoffWeightedPoints: 20,
      congestionLoss: 0,
      estimatedCapturedRegularSeasonPoints: 0,
      expectedScheduledPoints: 10,
      playoffWeightedGames: 1,
      usablePoints: 20,
    });
  });

  it('uses exact scheduled timestamps across same-day playoff boundaries', () => {
    const result = board({
      lineupSlots: slots(slot('FLX', ['PG', 'SG', 'SF', 'PF', 'C'], 2)),
      players: [player('quarterfinal', ['PG'], 10, 'AAA'), player('semifinal', ['SG'], 20, 'CCC')],
      seasonCalendar: sameDayPlayoffBoundaryCalendar,
    });

    expect(result.dailyAssignments).toHaveLength(1);
    expect(result.dailyAssignments[0]?.totalExpectedPoints).toBe(30);
    expect(result.players.find(({ playerId }) => playerId === 'quarterfinal')).toMatchObject({
      capturedPlayoffWeightedPoints: 7.5,
      expectedScheduledPoints: 10,
      playoffWeightedGames: 0.75,
    });
    expect(result.players.find(({ playerId }) => playerId === 'semifinal')).toMatchObject({
      capturedPlayoffWeightedPoints: 20,
      expectedScheduledPoints: 20,
      playoffWeightedGames: 1,
    });
  });

  it('excludes games outside the Fantrax scoring-period window', () => {
    const seasonCalendar = {
      asOf: '2026-09-19T00:00:00.000Z',
      fantasyPeriods: [
        {
          endAt: '2026-10-20T23:59:59.999Z',
          label: 'Regular season',
          phase: 'regular-season' as const,
          scoringPeriod: 1,
          startAt: '2026-10-20T00:00:00.000Z',
          weight: 1,
        },
      ],
      fingerprint: 'calendar-window',
      games: [
        {
          ...game,
          date: '2026-10-19',
          scheduledAt: '2026-10-19T23:00:00.000Z',
        },
        game,
        {
          ...game,
          date: '2026-10-21',
          scheduledAt: '2026-10-21T23:00:00.000Z',
        },
      ],
      snapshotId: 'snapshot-window',
    };
    const candidate = player('in-window', ['PG'], 20);
    const result = board({
      lineupSlots: slots(slot('PG', ['PG'])),
      players: [candidate],
      seasonCalendar,
    });
    const marginal = evaluateRosterCandidate({
      candidate,
      lineupSlots: slots(slot('PG', ['PG'])),
      roster: [],
      seasonCalendar,
    });

    expect(result.dailyAssignments).toHaveLength(1);
    expect(result.players[0]).toMatchObject({
      estimatedCapturedRegularSeasonPoints: 20,
      expectedScheduledPoints: 20,
      usablePoints: 20,
    });
    expect(marginal).toMatchObject({
      candidateStandaloneRegularSeasonPoints: 20,
      marginalRegularSeasonPoints: 20,
    });
  });

  it('reserves streaming capacity without creating or destroying auction dollars', () => {
    const players = [player('one', ['PG'], 30), player('two', ['PG'], 20)];
    const withoutStreaming = board({
      lineupSlots: slots(slot('PG', ['PG'])),
      players,
      rosterSize: 2,
      streamingSlotsPerTeam: 0,
    });
    const withStreaming = board({
      lineupSlots: slots(slot('PG', ['PG'])),
      players,
      rosterSize: 2,
      streamingSlotsPerTeam: 1,
    });

    expect(withStreaming.longTermPlayerCount).toBe(withoutStreaming.longTermPlayerCount - 1);
    expect(withStreaming.streamingReserveCount).toBe(1);
    expect(withStreaming.totalAllocatedCents).toBe(withoutStreaming.totalAllocatedCents);
    expect(withStreaming.totalAllocatedCents).toBe(20_000);
  });
});

describe('evaluateRosterCandidate', () => {
  it('values the same strong guard by marginal lineup fit instead of standalone production', () => {
    const candidate = player('candidate', ['PG'], 40);
    const guardHeavy = evaluateRosterCandidate({
      candidate,
      lineupSlots: slots(slot('PG', ['PG']), slot('C', ['C'])),
      roster: [player('guard-one', ['PG'], 39), player('guard-two', ['PG'], 38)],
      seasonCalendar: {
        asOf: '2026-09-19T00:00:00.000Z',
        fantasyPeriods: regularFantasyPeriods,
        fingerprint: 'calendar-1',
        games: [game],
        snapshotId: 'snapshot-1',
      },
    });
    const balanced = evaluateRosterCandidate({
      candidate,
      lineupSlots: slots(slot('PG', ['PG']), slot('C', ['C'])),
      roster: [player('center', ['C'], 10)],
      seasonCalendar: {
        asOf: '2026-09-19T00:00:00.000Z',
        fantasyPeriods: regularFantasyPeriods,
        fingerprint: 'calendar-1',
        games: [game],
        snapshotId: 'snapshot-1',
      },
    });

    expect(guardHeavy.candidateStandaloneRegularSeasonPoints).toBe(40);
    expect(guardHeavy.marginalRegularSeasonPoints).toBe(1);
    expect(balanced.marginalRegularSeasonPoints).toBe(40);
    expect(guardHeavy.marginalRegularSeasonPoints).toBeLessThan(
      balanced.marginalRegularSeasonPoints,
    );
    expect(guardHeavy.filledSlotNeeds).toEqual(['PG']);
    expect(guardHeavy.concentrationRisk).toEqual({
      level: 'high',
      sameTeamPlayerCount: 3,
      sameTeamRosterShare: 1,
    });
  });

  it('uses the candidate game timestamp for same-day playoff marginal value', () => {
    const quarterfinal = evaluateRosterCandidate({
      candidate: player('quarterfinal', ['PG'], 10, 'AAA'),
      lineupSlots: slots(slot('FLX', ['PG', 'SG', 'SF', 'PF', 'C'])),
      roster: [],
      seasonCalendar: sameDayPlayoffBoundaryCalendar,
    });
    const semifinal = evaluateRosterCandidate({
      candidate: player('semifinal', ['SG'], 20, 'CCC'),
      lineupSlots: slots(slot('FLX', ['PG', 'SG', 'SF', 'PF', 'C'])),
      roster: [],
      seasonCalendar: sameDayPlayoffBoundaryCalendar,
    });

    expect(quarterfinal).toMatchObject({
      candidateStandalonePlayoffWeightedPoints: 7.5,
      marginalPlayoffWeightedPoints: 7.5,
    });
    expect(semifinal).toMatchObject({
      candidateStandalonePlayoffWeightedPoints: 20,
      marginalPlayoffWeightedPoints: 20,
    });
  });

  it('treats a first player from one NBA team as low concentration risk', () => {
    const result = evaluateRosterCandidate({
      candidate: player('first-player', ['PG'], 20, 'AAA'),
      lineupSlots: slots(slot('PG', ['PG'])),
      roster: [],
      seasonCalendar: {
        asOf: '2026-09-19T00:00:00.000Z',
        fantasyPeriods: regularFantasyPeriods,
        fingerprint: 'calendar-1',
        games: [game],
        snapshotId: 'snapshot-1',
      },
    });

    expect(result.concentrationRisk).toEqual({
      level: 'low',
      sameTeamPlayerCount: 1,
      sameTeamRosterShare: 1,
    });
  });
});
