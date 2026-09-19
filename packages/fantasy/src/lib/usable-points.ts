import type { LeagueLineupSlot } from './league-format';

export const USABLE_POINTS_MODEL_VERSION = 'usable-lineup-v1' as const;

export interface UsablePointsPlayer {
  readonly availabilityRate: number;
  readonly fantasyPoints: number;
  readonly fantasyPointsPerGame: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly positions: ReadonlyArray<string>;
  readonly projectionRank: number;
  readonly teamAbbreviation: string;
}

export interface UsablePointsCalendar {
  readonly asOf: string;
  readonly fingerprint: string;
  readonly games: ReadonlyArray<{
    readonly awayTeam: string;
    readonly date: string;
    readonly homeTeam: string;
    readonly postponed: boolean;
    readonly scheduledAt: string;
  }>;
  readonly playoffPeriods: ReadonlyArray<{
    readonly endAt: string;
    readonly label: string;
    readonly scoringPeriod: number;
    readonly startAt: string;
    readonly weight: number;
  }>;
  readonly snapshotId: string;
}

export interface UsablePointsBoardInput {
  readonly baseBudgetCents: number;
  readonly leagueFormatFingerprint: string;
  readonly leagueFormatVersion: number;
  readonly lineupSlots: ReadonlyArray<LeagueLineupSlot>;
  readonly players: ReadonlyArray<UsablePointsPlayer>;
  readonly rosterSize: number;
  readonly seasonCalendar: UsablePointsCalendar;
  readonly streamingSlotsPerTeam: number;
  readonly teamCount: number;
}

export interface DailyLineupAssignment {
  readonly benchedPlayerIds: ReadonlyArray<string>;
  readonly date: string;
  readonly selected: ReadonlyArray<{
    readonly playerId: string;
    readonly slotCode: LeagueLineupSlot['code'];
  }>;
  readonly totalExpectedPoints: number;
}

export interface UsablePointsBoardPlayer extends UsablePointsPlayer {
  readonly availabilityExposure: number;
  readonly capturedPlayoffWeightedPoints: number;
  readonly congestionLoss: number;
  readonly estimatedCapturedRegularSeasonPoints: number;
  readonly expectedScheduledPoints: number;
  readonly playoffWeightedGames: number;
  readonly positionalReplacementDelta: number;
  readonly rawProjectedPoints: number;
  readonly usablePoints: number;
  readonly valueCents: number;
}

export interface UsablePointsBoard {
  readonly auctionPoolCents: number;
  readonly dailyAssignments: ReadonlyArray<DailyLineupAssignment>;
  readonly draftablePlayerCount: number;
  readonly leagueFormat: {
    readonly fingerprint: string;
    readonly version: number;
  };
  readonly longTermPlayerCount: number;
  readonly modelVersion: typeof USABLE_POINTS_MODEL_VERSION;
  readonly players: ReadonlyArray<UsablePointsBoardPlayer>;
  readonly replacementUsablePoints: number;
  readonly schedule: {
    readonly asOf: string;
    readonly fingerprint: string;
    readonly snapshotId: string;
  };
  readonly streamingReserveCount: number;
  readonly totalAllocatedCents: number;
}

export interface RosterCandidateInput {
  readonly candidate: UsablePointsPlayer;
  readonly lineupSlots: ReadonlyArray<LeagueLineupSlot>;
  readonly roster: ReadonlyArray<UsablePointsPlayer>;
  readonly seasonCalendar: UsablePointsCalendar;
}

export interface RosterCandidateValue {
  readonly candidateStandalonePlayoffWeightedPoints: number;
  readonly candidateStandaloneRegularSeasonPoints: number;
  readonly concentrationRisk: {
    readonly level: 'high' | 'low' | 'moderate';
    readonly sameTeamPlayerCount: number;
    readonly sameTeamRosterShare: number;
  };
  readonly daysBenched: number;
  readonly filledSlotNeeds: ReadonlyArray<LeagueLineupSlot['code']>;
  readonly marginalPlayoffWeightedPoints: number;
  readonly marginalRegularSeasonPoints: number;
}

interface SlotInstance {
  readonly code: LeagueLineupSlot['code'];
  readonly eligiblePositions: ReadonlySet<string>;
  readonly order: number;
}

interface WeightedPlayer {
  readonly player: UsablePointsPlayer;
  readonly weight: number;
}

const round = (value: number, places = 3): number => {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const expandedSlots = (
  lineupSlots: ReadonlyArray<LeagueLineupSlot>,
  capacityMultiplier: number,
): ReadonlyArray<SlotInstance> => {
  const result: SlotInstance[] = [];
  lineupSlots.forEach((slot) => {
    const count = slot.maxActive * capacityMultiplier;
    for (let index = 0; index < count; index += 1) {
      result.push({
        code: slot.code,
        eligiblePositions: new Set(slot.eligiblePositions),
        order: result.length,
      });
    }
  });
  return result;
};

const isEligible = (player: UsablePointsPlayer, slot: SlotInstance): boolean =>
  player.positions.some((position) => slot.eligiblePositions.has(position));

/**
 * Selects the maximum-weight matchable player subset. Matchable player sets form
 * a transversal matroid, so weight-order insertion plus an augmenting path is
 * exact while keeping graph state private to this module.
 */
const assignLineup = (input: {
  readonly capacityMultiplier: number;
  readonly lineupSlots: ReadonlyArray<LeagueLineupSlot>;
  readonly players: ReadonlyArray<WeightedPlayer>;
}): Omit<DailyLineupAssignment, 'date'> => {
  const slots = expandedSlots(input.lineupSlots, input.capacityMultiplier);
  const ranked = [...input.players].sort(
    (left, right) =>
      right.weight - left.weight || left.player.playerId.localeCompare(right.player.playerId),
  );
  const slotOwners: Array<WeightedPlayer | undefined> = Array.from({ length: slots.length });

  const place = (candidate: WeightedPlayer, visitedSlots: Set<number>): boolean => {
    for (const slot of slots) {
      if (visitedSlots.has(slot.order) || !isEligible(candidate.player, slot)) continue;
      visitedSlots.add(slot.order);
      const incumbent = slotOwners[slot.order];
      if (incumbent === undefined || place(incumbent, visitedSlots)) {
        slotOwners[slot.order] = candidate;
        return true;
      }
    }
    return false;
  };

  ranked.forEach((candidate) => place(candidate, new Set<number>()));
  const selected = slotOwners.flatMap((owner, index) =>
    owner === undefined ? [] : [{ playerId: owner.player.playerId, slotCode: slots[index]!.code }],
  );
  const selectedIds = new Set(selected.map((selection) => selection.playerId));
  return {
    benchedPlayerIds: ranked
      .filter(({ player }) => !selectedIds.has(player.playerId))
      .map(({ player }) => player.playerId)
      .sort(),
    selected,
    totalExpectedPoints: round(
      slotOwners.reduce((total, owner) => total + (owner?.weight ?? 0), 0),
    ),
  };
};

const validateInput = (input: UsablePointsBoardInput): void => {
  if (!Number.isSafeInteger(input.baseBudgetCents) || input.baseBudgetCents <= 0)
    throw new RangeError('base budget must be a positive integer');
  if (!Number.isSafeInteger(input.teamCount) || input.teamCount <= 0)
    throw new RangeError('team count must be a positive integer');
  if (!Number.isSafeInteger(input.rosterSize) || input.rosterSize <= 0)
    throw new RangeError('roster size must be a positive integer');
  if (
    !Number.isSafeInteger(input.streamingSlotsPerTeam) ||
    input.streamingSlotsPerTeam < 0 ||
    input.streamingSlotsPerTeam >= input.rosterSize
  ) {
    throw new RangeError('streaming slots must be a non-negative integer below roster size');
  }
  if (input.lineupSlots.length === 0) throw new Error('lineup slots are required');
  if (new Set(input.players.map((player) => player.playerId)).size !== input.players.length)
    throw new Error('usable-points players must be unique');
  input.players.forEach((player) => {
    if (!Number.isFinite(player.fantasyPointsPerGame) || player.fantasyPointsPerGame < 0)
      throw new RangeError(`${player.playerId} fantasy points per game must be non-negative`);
    if (
      !Number.isFinite(player.availabilityRate) ||
      player.availabilityRate < 0 ||
      player.availabilityRate > 1
    )
      throw new RangeError(`${player.playerId} availability rate must be between zero and one`);
  });
};

/** Builds a deterministic league board without provider or database I/O. */
export function buildUsablePointsBoard(input: UsablePointsBoardInput): UsablePointsBoard {
  validateInput(input);
  const playersByTeam = new Map<string, UsablePointsPlayer[]>();
  input.players.forEach((player) => {
    const teamPlayers = playersByTeam.get(player.teamAbbreviation) ?? [];
    teamPlayers.push(player);
    playersByTeam.set(player.teamAbbreviation, teamPlayers);
  });
  const teamsByDate = new Map<string, Set<string>>();
  input.seasonCalendar.games.forEach((calendarGame) => {
    if (calendarGame.postponed) return;
    const teams = teamsByDate.get(calendarGame.date) ?? new Set<string>();
    teams.add(calendarGame.homeTeam);
    teams.add(calendarGame.awayTeam);
    teamsByDate.set(calendarGame.date, teams);
  });

  const expectedByPlayer = new Map<string, number>();
  const capturedByPlayer = new Map<string, number>();
  const regularSeasonCapturedByPlayer = new Map<string, number>();
  const playoffByPlayer = new Map<string, number>();
  const playoffGamesByPlayer = new Map<string, number>();
  const dailyAssignments = [...teamsByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, teams]): DailyLineupAssignment => {
      const scheduledPlayers = [...teams].flatMap((team) => playersByTeam.get(team) ?? []);
      const weightedPlayers = scheduledPlayers.map((scheduledPlayer) => {
        const weight = scheduledPlayer.fantasyPointsPerGame * scheduledPlayer.availabilityRate;
        expectedByPlayer.set(
          scheduledPlayer.playerId,
          (expectedByPlayer.get(scheduledPlayer.playerId) ?? 0) + weight,
        );
        return { player: scheduledPlayer, weight };
      });
      const assignment = assignLineup({
        capacityMultiplier: input.teamCount,
        lineupSlots: input.lineupSlots,
        players: weightedPlayers,
      });
      const period = input.seasonCalendar.playoffPeriods.find(
        (candidate) =>
          Date.parse(`${date}T12:00:00.000Z`) >= Date.parse(candidate.startAt) &&
          Date.parse(`${date}T12:00:00.000Z`) <= Date.parse(candidate.endAt),
      );
      assignment.selected.forEach(({ playerId }) => {
        const weight =
          weightedPlayers.find(({ player }) => player.playerId === playerId)?.weight ?? 0;
        capturedByPlayer.set(playerId, (capturedByPlayer.get(playerId) ?? 0) + weight);
        if (period === undefined) {
          regularSeasonCapturedByPlayer.set(
            playerId,
            (regularSeasonCapturedByPlayer.get(playerId) ?? 0) + weight,
          );
        } else {
          playoffByPlayer.set(
            playerId,
            (playoffByPlayer.get(playerId) ?? 0) + weight * period.weight,
          );
          playoffGamesByPlayer.set(
            playerId,
            (playoffGamesByPlayer.get(playerId) ?? 0) +
              input.players.find((player) => player.playerId === playerId)!.availabilityRate *
                period.weight,
          );
        }
      });
      return { ...assignment, date };
    });

  const draftablePlayerCount = Math.min(input.teamCount * input.rosterSize, input.players.length);
  const streamingReserveCount = Math.min(
    draftablePlayerCount,
    input.teamCount * input.streamingSlotsPerTeam,
  );
  const longTermPlayerCount = draftablePlayerCount - streamingReserveCount;
  const preliminaryPlayers = input.players.map((projection) => {
    const expectedScheduledPoints = expectedByPlayer.get(projection.playerId) ?? 0;
    const captured = capturedByPlayer.get(projection.playerId) ?? 0;
    const regularSeasonCaptured = regularSeasonCapturedByPlayer.get(projection.playerId) ?? 0;
    const playoff = playoffByPlayer.get(projection.playerId) ?? 0;
    return {
      ...projection,
      availabilityExposure: round(1 - projection.availabilityRate, 4),
      capturedPlayoffWeightedPoints: round(playoff),
      congestionLoss: round(Math.max(0, expectedScheduledPoints - captured)),
      estimatedCapturedRegularSeasonPoints: round(regularSeasonCaptured),
      expectedScheduledPoints: round(expectedScheduledPoints),
      playoffWeightedGames: round(playoffGamesByPlayer.get(projection.playerId) ?? 0),
      rawProjectedPoints: projection.fantasyPoints,
      usablePoints: round(regularSeasonCaptured + playoff),
    };
  });
  const ranked = [...preliminaryPlayers].sort(
    (left, right) =>
      right.usablePoints - left.usablePoints ||
      right.expectedScheduledPoints - left.expectedScheduledPoints ||
      left.playerId.localeCompare(right.playerId),
  );
  const replacementUsablePoints =
    longTermPlayerCount === 0 ? 0 : (ranked[longTermPlayerCount - 1]?.usablePoints ?? 0);
  const auctionPoolCents = input.teamCount * input.baseBudgetCents;
  const playersWithReplacement = ranked.map(
    (candidate, index): Omit<UsablePointsBoardPlayer, 'valueCents'> => ({
      ...candidate,
      positionalReplacementDelta:
        index < longTermPlayerCount
          ? round(Math.max(0, candidate.usablePoints - replacementUsablePoints))
          : 0,
    }),
  );
  const reservedMinimumsCents = draftablePlayerCount * 100;
  if (reservedMinimumsCents > auctionPoolCents) {
    throw new RangeError('auction pool cannot fund the minimum bid for every draftable player');
  }
  const discretionaryPoolCents = auctionPoolCents - reservedMinimumsCents;
  const marginalWeights = playersWithReplacement.map((candidate, index) =>
    index < longTermPlayerCount ? candidate.positionalReplacementDelta : 0,
  );
  const totalMarginalWeight = marginalWeights.reduce((total, weight) => total + weight, 0);
  const allocationWeights = marginalWeights.map((weight, index) =>
    index >= longTermPlayerCount ? 0 : totalMarginalWeight === 0 ? 1 : weight,
  );
  const totalAllocationWeight = allocationWeights.reduce((total, weight) => total + weight, 0);
  const exactAllocations = allocationWeights.map((weight) =>
    totalAllocationWeight === 0 ? 0 : (weight / totalAllocationWeight) * discretionaryPoolCents,
  );
  const discretionaryAllocations = exactAllocations.map(Math.floor);
  let remainingCents =
    discretionaryPoolCents - discretionaryAllocations.reduce((total, cents) => total + cents, 0);
  const remainderOrder = exactAllocations
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .filter(({ index }) => index < longTermPlayerCount)
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  for (const allocation of remainderOrder) {
    if (remainingCents === 0) break;
    discretionaryAllocations[allocation.index] =
      (discretionaryAllocations[allocation.index] ?? 0) + 1;
    remainingCents -= 1;
  }
  const players = playersWithReplacement.map(
    (candidate, index): UsablePointsBoardPlayer => ({
      ...candidate,
      valueCents: index < draftablePlayerCount ? 100 + (discretionaryAllocations[index] ?? 0) : 0,
    }),
  );

  return {
    auctionPoolCents,
    dailyAssignments,
    draftablePlayerCount,
    leagueFormat: {
      fingerprint: input.leagueFormatFingerprint,
      version: input.leagueFormatVersion,
    },
    longTermPlayerCount,
    modelVersion: USABLE_POINTS_MODEL_VERSION,
    players,
    replacementUsablePoints,
    schedule: {
      asOf: input.seasonCalendar.asOf,
      fingerprint: input.seasonCalendar.fingerprint,
      snapshotId: input.seasonCalendar.snapshotId,
    },
    streamingReserveCount,
    totalAllocatedCents: players.reduce((total, candidate) => total + candidate.valueCents, 0),
  };
}

const playoffWeightForDate = (
  date: string,
  periods: UsablePointsCalendar['playoffPeriods'],
): number => {
  const timestamp = Date.parse(`${date}T12:00:00.000Z`);
  return (
    periods.find(
      (period) => timestamp >= Date.parse(period.startAt) && timestamp <= Date.parse(period.endAt),
    )?.weight ?? 0
  );
};

const rosterSchedule = (input: {
  readonly lineupSlots: ReadonlyArray<LeagueLineupSlot>;
  readonly players: ReadonlyArray<UsablePointsPlayer>;
  readonly seasonCalendar: UsablePointsCalendar;
}) => {
  const teamsByDate = new Map<string, Set<string>>();
  input.seasonCalendar.games.forEach((calendarGame) => {
    if (calendarGame.postponed) return;
    const teams = teamsByDate.get(calendarGame.date) ?? new Set<string>();
    teams.add(calendarGame.homeTeam);
    teams.add(calendarGame.awayTeam);
    teamsByDate.set(calendarGame.date, teams);
  });
  return [...teamsByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, teams]) => {
      const scheduled = input.players
        .filter((player) => teams.has(player.teamAbbreviation))
        .map((player) => ({
          player,
          weight: player.fantasyPointsPerGame * player.availabilityRate,
        }));
      return {
        assignment: assignLineup({
          capacityMultiplier: 1,
          lineupSlots: input.lineupSlots,
          players: scheduled,
        }),
        date,
        playoffWeight: playoffWeightForDate(date, input.seasonCalendar.playoffPeriods),
        scheduled,
      };
    });
};

/** Values a candidate as the optimized production they add to a concrete roster. */
export function evaluateRosterCandidate(input: RosterCandidateInput): RosterCandidateValue {
  if (input.roster.some((player) => player.playerId === input.candidate.playerId)) {
    throw new Error('candidate is already on the roster');
  }
  const withoutCandidate = rosterSchedule({
    lineupSlots: input.lineupSlots,
    players: input.roster,
    seasonCalendar: input.seasonCalendar,
  });
  const withCandidate = rosterSchedule({
    lineupSlots: input.lineupSlots,
    players: [...input.roster, input.candidate],
    seasonCalendar: input.seasonCalendar,
  });
  let marginalRegularSeasonPoints = 0;
  let marginalPlayoffWeightedPoints = 0;
  let candidateStandaloneRegularSeasonPoints = 0;
  let candidateStandalonePlayoffWeightedPoints = 0;
  let daysBenched = 0;
  const filledSlotNeeds = new Set<LeagueLineupSlot['code']>();

  withCandidate.forEach((day, index) => {
    const baseline = withoutCandidate[index];
    const marginal =
      day.assignment.totalExpectedPoints - (baseline?.assignment.totalExpectedPoints ?? 0);
    if (day.playoffWeight === 0) marginalRegularSeasonPoints += marginal;
    else marginalPlayoffWeightedPoints += marginal * day.playoffWeight;
    const candidateScheduled = day.scheduled.find(
      ({ player }) => player.playerId === input.candidate.playerId,
    );
    if (candidateScheduled === undefined) return;
    if (day.playoffWeight === 0) {
      candidateStandaloneRegularSeasonPoints += candidateScheduled.weight;
    } else {
      candidateStandalonePlayoffWeightedPoints += candidateScheduled.weight * day.playoffWeight;
    }
    const selected = day.assignment.selected.find(
      ({ playerId }) => playerId === input.candidate.playerId,
    );
    if (selected === undefined) daysBenched += 1;
    else filledSlotNeeds.add(selected.slotCode);
  });

  const sameTeamPlayerCount = [...input.roster, input.candidate].filter(
    (player) => player.teamAbbreviation === input.candidate.teamAbbreviation,
  ).length;
  const sameTeamRosterShare = sameTeamPlayerCount / (input.roster.length + 1);
  const concentrationLevel =
    sameTeamPlayerCount >= 3 && sameTeamRosterShare >= 0.35
      ? 'high'
      : sameTeamPlayerCount >= 2 || sameTeamRosterShare >= 0.2
        ? 'moderate'
        : 'low';
  const slotOrder = new Map(input.lineupSlots.map((slot, index) => [slot.code, index]));

  return {
    candidateStandalonePlayoffWeightedPoints: round(candidateStandalonePlayoffWeightedPoints),
    candidateStandaloneRegularSeasonPoints: round(candidateStandaloneRegularSeasonPoints),
    concentrationRisk: {
      level: concentrationLevel,
      sameTeamPlayerCount,
      sameTeamRosterShare: round(sameTeamRosterShare, 4),
    },
    daysBenched,
    filledSlotNeeds: [...filledSlotNeeds].sort(
      (left, right) => (slotOrder.get(left) ?? 0) - (slotOrder.get(right) ?? 0),
    ),
    marginalPlayoffWeightedPoints: round(marginalPlayoffWeightedPoints),
    marginalRegularSeasonPoints: round(marginalRegularSeasonPoints),
  };
}
