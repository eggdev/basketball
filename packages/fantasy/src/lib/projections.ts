import { scoreSeason, type GameStatLine, type ScoringRules } from './scoring';

export interface PlayerStatProjection {
  readonly projectedBonusRates?: {
    readonly doubleDoubleRate: number;
    readonly tripleDoubleRate: number;
  };
  readonly expectedGames: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly positions: ReadonlyArray<string>;
  readonly schedule?: PlayerSeasonSchedule;
  readonly statsPerGame: GameStatLine;
  readonly teamAbbreviation: string;
}

export interface HistoricalBonusSeason {
  readonly doubleDoubles: number;
  readonly gamesPlayed: number;
  readonly playerId: string;
  readonly seasonKey: string;
  readonly tripleDoubles: number;
}

export interface FantasyPlayoffWeek {
  readonly endAt?: string;
  readonly label: string;
  readonly playoffRound?: 'final' | 'quarterfinal' | 'semifinal';
  readonly scheduledGames: number;
  readonly scoringPeriod?: number;
  readonly startAt?: string;
  readonly weight: number;
  readonly weekKey: string;
}

export interface PlayerSeasonSchedule {
  readonly fantasyPlayoffWeeks: ReadonlyArray<FantasyPlayoffWeek>;
  readonly regularSeasonScheduledGames: number;
}

export interface ProjectionModelSettings {
  readonly doubleDoublePriorGames: number;
  readonly recencyDecay: number;
  readonly tripleDoublePriorGames: number;
}

export const defaultProjectionModelSettings = {
  doubleDoublePriorGames: 20,
  recencyDecay: 0.7,
  tripleDoublePriorGames: 40,
} satisfies ProjectionModelSettings;

export type AvailabilityTier = 'durable' | 'managed' | 'fragile';

export interface PlayerSeasonProjection {
  readonly availability: {
    readonly expectedGames: number;
    readonly expectedGamesMissed: number;
    readonly rate: number;
    readonly scheduledGames: number;
    readonly tier: AvailabilityTier;
  };
  readonly bonuses: {
    readonly doubleDoubleRate: number;
    readonly expectedDoubleDoubles: number;
    readonly expectedTripleDoubles: number;
    readonly tripleDoubleRate: number;
  };
  readonly fantasyPoints: number;
  readonly fantasyPointsPerGame: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly positions: ReadonlyArray<string>;
  readonly schedule: {
    readonly fantasyPlayoffWeeks: ReadonlyArray<{
      readonly expectedActiveGames: number;
      readonly expectedFantasyPoints: number;
      readonly endAt?: string;
      readonly label: string;
      readonly playoffRound?: 'final' | 'quarterfinal' | 'semifinal';
      readonly scheduledGames: number;
      readonly scoringPeriod?: number;
      readonly startAt?: string;
      readonly weight: number;
      readonly weekKey: string;
    }>;
    readonly weightedExpectedGames: number;
    readonly weightedExpectedPoints: number;
  } | null;
  readonly scoringComponents: Readonly<Record<string, number>>;
  readonly statsPerGame: GameStatLine;
  readonly teamAbbreviation: string;
}

export interface ProjectionRun {
  readonly bonusPriors: {
    readonly doubleDoubleRate: number;
    readonly tripleDoubleRate: number;
  };
  readonly players: ReadonlyArray<PlayerSeasonProjection>;
}

const finiteNonNegative = (value: number, label: string): number => {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative finite number`);
  }
  return value;
};

const probability = (value: number, label: string): number => {
  finiteNonNegative(value, label);
  if (value > 1) throw new RangeError(`${label} must be at most one`);
  return value;
};

const rate = (events: number, games: number): number => (games === 0 ? 0 : events / games);

const round = (value: number, places = 3): number => {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const availabilityTier = (availabilityRate: number): AvailabilityTier => {
  if (availabilityRate >= 0.88) return 'durable';
  if (availabilityRate >= 0.73) return 'managed';
  return 'fragile';
};

const weightedBonusRate = (
  history: ReadonlyArray<HistoricalBonusSeason>,
  event: 'doubleDoubles' | 'tripleDoubles',
  priorRate: number,
  priorGames: number,
  recencyDecay: number,
): number => {
  const newestFirst = [...history].sort((left, right) =>
    right.seasonKey.localeCompare(left.seasonKey),
  );
  let weightedEvents = priorRate * priorGames;
  let weightedGames = priorGames;
  newestFirst.forEach((season, index) => {
    const weight = recencyDecay ** index;
    weightedEvents += finiteNonNegative(season[event], `${event} history`) * weight;
    weightedGames += finiteNonNegative(season.gamesPlayed, 'games played history') * weight;
  });
  return weightedGames === 0 ? 0 : weightedEvents / weightedGames;
};

const validateSettings = (settings: ProjectionModelSettings): void => {
  finiteNonNegative(settings.doubleDoublePriorGames, 'double-double prior games');
  finiteNonNegative(settings.tripleDoublePriorGames, 'triple-double prior games');
  if (
    !Number.isFinite(settings.recencyDecay) ||
    settings.recencyDecay <= 0 ||
    settings.recencyDecay > 1
  ) {
    throw new RangeError('recency decay must be greater than zero and at most one');
  }
};

export function buildProjectionRun(input: {
  readonly history: ReadonlyArray<HistoricalBonusSeason>;
  readonly players: ReadonlyArray<PlayerStatProjection>;
  readonly rules: ScoringRules;
  readonly settings?: ProjectionModelSettings;
}): ProjectionRun {
  const settings = input.settings ?? defaultProjectionModelSettings;
  validateSettings(settings);

  const totalHistoricalGames = input.history.reduce(
    (total, season) => total + finiteNonNegative(season.gamesPlayed, 'historical games'),
    0,
  );
  const doubleDoublePriorRate = rate(
    input.history.reduce(
      (total, season) =>
        total + finiteNonNegative(season.doubleDoubles, 'historical double-doubles'),
      0,
    ),
    totalHistoricalGames,
  );
  const tripleDoublePriorRate = rate(
    input.history.reduce(
      (total, season) =>
        total + finiteNonNegative(season.tripleDoubles, 'historical triple-doubles'),
      0,
    ),
    totalHistoricalGames,
  );
  const historyByPlayer = new Map<string, HistoricalBonusSeason[]>();
  for (const season of input.history) {
    const playerHistory = historyByPlayer.get(season.playerId) ?? [];
    playerHistory.push(season);
    historyByPlayer.set(season.playerId, playerHistory);
  }

  const players = input.players.map((player): PlayerSeasonProjection => {
    const expectedGames = finiteNonNegative(player.expectedGames, 'expected games');
    const scheduledGames = player.schedule?.regularSeasonScheduledGames ?? 82;
    if (!Number.isSafeInteger(scheduledGames) || scheduledGames <= 0) {
      throw new RangeError('regular-season scheduled games must be a positive integer');
    }
    if (expectedGames > scheduledGames) {
      throw new RangeError(`${player.playerName} expected games exceeds scheduled games`);
    }

    const playerHistory = historyByPlayer.get(player.playerId) ?? [];
    const doubleDoubleRate =
      player.projectedBonusRates === undefined
        ? weightedBonusRate(
            playerHistory,
            'doubleDoubles',
            doubleDoublePriorRate,
            settings.doubleDoublePriorGames,
            settings.recencyDecay,
          )
        : probability(
            player.projectedBonusRates.doubleDoubleRate,
            `${player.playerName} projected double-double rate`,
          );
    const tripleDoubleRate =
      player.projectedBonusRates === undefined
        ? Math.min(
            doubleDoubleRate,
            weightedBonusRate(
              playerHistory,
              'tripleDoubles',
              tripleDoublePriorRate,
              settings.tripleDoublePriorGames,
              settings.recencyDecay,
            ),
          )
        : probability(
            player.projectedBonusRates.tripleDoubleRate,
            `${player.playerName} projected triple-double rate`,
          );
    if (tripleDoubleRate > doubleDoubleRate) {
      throw new RangeError(
        `${player.playerName} projected triple-double rate cannot exceed double-double rate`,
      );
    }
    const expectedDoubleDoubles = doubleDoubleRate * expectedGames;
    const expectedTripleDoubles = tripleDoubleRate * expectedGames;
    const seasonStats = {
      assists: player.statsPerGame.assists * expectedGames,
      blocks: player.statsPerGame.blocks * expectedGames,
      doubleDoubles: expectedDoubleDoubles,
      fieldGoalsMissed:
        (player.statsPerGame.fieldGoalsAttempted - player.statsPerGame.fieldGoalsMade) *
        expectedGames,
      freeThrowsMissed:
        (player.statsPerGame.freeThrowsAttempted - player.statsPerGame.freeThrowsMade) *
        expectedGames,
      gamesPlayed: expectedGames,
      points: player.statsPerGame.points * expectedGames,
      rebounds: player.statsPerGame.rebounds * expectedGames,
      steals: player.statsPerGame.steals * expectedGames,
      threePointersMade: player.statsPerGame.threePointersMade * expectedGames,
      tripleDoubles: expectedTripleDoubles,
      turnovers: player.statsPerGame.turnovers * expectedGames,
    };
    const scored = scoreSeason(seasonStats, input.rules);
    const availabilityRate = expectedGames / scheduledGames;
    const schedule =
      player.schedule === undefined
        ? null
        : (() => {
            const fantasyPlayoffWeeks = player.schedule.fantasyPlayoffWeeks.map((week) => {
              if (!Number.isSafeInteger(week.scheduledGames) || week.scheduledGames < 0) {
                throw new RangeError(
                  `${week.weekKey} scheduled games must be a non-negative integer`,
                );
              }
              const expectedActiveGames = week.scheduledGames * availabilityRate;
              return {
                ...(week.endAt === undefined ? {} : { endAt: week.endAt }),
                expectedActiveGames: round(expectedActiveGames),
                expectedFantasyPoints: round(expectedActiveGames * scored.pointsPerGame),
                label: week.label,
                ...(week.playoffRound === undefined ? {} : { playoffRound: week.playoffRound }),
                scheduledGames: week.scheduledGames,
                ...(week.scoringPeriod === undefined ? {} : { scoringPeriod: week.scoringPeriod }),
                ...(week.startAt === undefined ? {} : { startAt: week.startAt }),
                weight: finiteNonNegative(week.weight, `${week.weekKey} weight`),
                weekKey: week.weekKey,
              };
            });
            return {
              fantasyPlayoffWeeks,
              weightedExpectedGames: round(
                fantasyPlayoffWeeks.reduce(
                  (total, week) => total + week.expectedActiveGames * week.weight,
                  0,
                ),
              ),
              weightedExpectedPoints: round(
                fantasyPlayoffWeeks.reduce(
                  (total, week) => total + week.expectedFantasyPoints * week.weight,
                  0,
                ),
              ),
            };
          })();

    return {
      availability: {
        expectedGames: round(expectedGames),
        expectedGamesMissed: round(scheduledGames - expectedGames),
        rate: round(availabilityRate, 4),
        scheduledGames,
        tier: availabilityTier(availabilityRate),
      },
      bonuses: {
        doubleDoubleRate: round(doubleDoubleRate, 4),
        expectedDoubleDoubles: round(expectedDoubleDoubles),
        expectedTripleDoubles: round(expectedTripleDoubles),
        tripleDoubleRate: round(tripleDoubleRate, 4),
      },
      fantasyPoints: round(scored.total),
      fantasyPointsPerGame: round(scored.pointsPerGame),
      playerId: player.playerId,
      playerName: player.playerName,
      positions: player.positions,
      schedule,
      scoringComponents: Object.fromEntries(
        Object.entries(scored.components).map(([key, value]) => [key, round(value)]),
      ),
      statsPerGame: player.statsPerGame,
      teamAbbreviation: player.teamAbbreviation,
    };
  });
  players.sort(
    (left, right) =>
      right.fantasyPoints - left.fantasyPoints ||
      right.fantasyPointsPerGame - left.fantasyPointsPerGame ||
      left.playerName.localeCompare(right.playerName),
  );

  return {
    bonusPriors: {
      doubleDoubleRate: round(doubleDoublePriorRate, 4),
      tripleDoubleRate: round(tripleDoublePriorRate, 4),
    },
    players,
  };
}
