export type PlayerMovementType =
  | 'draft'
  | 'free-agent-signing'
  | 're-signing'
  | 'returning'
  | 'trade'
  | 'two-way'
  | 'waiver'
  | 'unknown';

export type OpportunityDirection = 'down' | 'steady' | 'uncertain' | 'up';
export type SituationEvidenceBasis = 'curated' | 'inferred' | 'observed' | 'projected';

export interface PlayerTeamStint {
  readonly gamesPlayed: number;
  readonly lastGameDate?: string;
  readonly teamAbbreviation: string;
}

export interface PlayerSituationProjection {
  readonly availability: {
    readonly expectedGames: number;
  };
  readonly fantasyPointsPerGame: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly positions: ReadonlyArray<string>;
  readonly statsPerGame: Readonly<Record<string, number>>;
  readonly teamAbbreviation: string;
}

export interface PlayerSituationProductionSeason {
  readonly gamesPlayed: number;
  readonly playerId: string;
  readonly seasonKey: string;
  readonly stats: Readonly<Record<string, number | null>>;
  readonly teamStints: ReadonlyArray<PlayerTeamStint>;
}

export interface PlayerAdvancedSeason {
  readonly metrics: Readonly<Record<string, number | null>>;
  readonly playerId: string;
  readonly seasonKey: string;
}

export interface PlayerSituationContext {
  readonly injury: {
    readonly sourceUrl: string;
    readonly status: string | null;
    readonly summary: string;
  } | null;
  readonly movement: {
    readonly effectiveDate: string | null;
    readonly fromTeamAbbreviation: string | null;
    readonly note: string | null;
    readonly sourceUrl: string;
    readonly toTeamAbbreviation: string | null;
    readonly type: PlayerMovementType;
  } | null;
  readonly playerId: string;
  readonly role: {
    readonly depthRole: string | null;
    readonly note: string;
    readonly opportunityDirection: Exclude<OpportunityDirection, 'uncertain'> | null;
    readonly sourceUrl: string;
  } | null;
}

export interface PlayerSituationSignal {
  readonly basis: SituationEvidenceBasis;
  readonly detail: string;
  readonly kind: 'availability' | 'competition' | 'injury' | 'movement' | 'opportunity';
  readonly tone: 'negative' | 'neutral' | 'positive';
}

export interface PlayerSituation {
  readonly advanced: {
    readonly dribblesPerTouch: number | null;
    readonly potentialAssistsPerGame: number | null;
    readonly secondaryAssistsPerGame: number | null;
    readonly timeOfPossessionMinutes: number | null;
    readonly touchesPerGame: number | null;
    readonly usagePercentage: number | null;
  };
  readonly availability: {
    readonly expectedGames: number;
    readonly previousGames: number | null;
    readonly wasLimitedLastSeason: boolean;
  };
  readonly competition: ReadonlyArray<{
    readonly fantasyPointsPerGame: number;
    readonly playerId: string;
    readonly playerName: string;
    readonly positions: ReadonlyArray<string>;
  }>;
  readonly currentTeamAbbreviation: string;
  readonly injury: PlayerSituationContext['injury'];
  readonly movement: {
    readonly effectiveDate: string | null;
    readonly fromTeamAbbreviation: string | null;
    readonly isNewTeam: boolean;
    readonly note: string | null;
    readonly sourceUrl: string | null;
    readonly toTeamAbbreviation: string;
    readonly type: PlayerMovementType;
  };
  readonly opportunity: {
    readonly currentBoxScoreProxy: number | null;
    readonly deltaPercent: number | null;
    readonly direction: OpportunityDirection;
    readonly previousBoxScoreProxy: number | null;
    readonly source: 'box-score-proxy' | 'curated' | 'insufficient-data';
  };
  readonly playerId: string;
  readonly playerName: string;
  readonly positions: ReadonlyArray<string>;
  readonly previousSeasonKey: string | null;
  readonly previousTeamAbbreviation: string | null;
  readonly role: PlayerSituationContext['role'];
  readonly signals: ReadonlyArray<PlayerSituationSignal>;
  readonly summary: string;
}

export interface PlayerSituationBoard {
  readonly asOf: string;
  readonly players: ReadonlyArray<PlayerSituation>;
  readonly seasonKey: string;
  readonly summary: {
    readonly advancedStatPlayerCount: number;
    readonly contextPlayerCount: number;
    readonly limitedSeasonPlayerCount: number;
    readonly newTeamPlayerCount: number;
    readonly opportunityDownPlayerCount: number;
    readonly opportunityUpPlayerCount: number;
    readonly playerCount: number;
  };
}

const round = (value: number, places = 3): number => {
  const factor = 10 ** places;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const finite = (value: number | null | undefined): number | null =>
  value !== null && value !== undefined && Number.isFinite(value) ? value : null;

const historicalPerGame = (season: PlayerSituationProductionSeason, key: string): number | null => {
  const value = finite(season.stats[key]);
  return value === null || season.gamesPlayed <= 0 ? null : value / season.gamesPlayed;
};

const projectedStat = (
  projection: PlayerSituationProjection,
  ...keys: ReadonlyArray<string>
): number | null => {
  for (const key of keys) {
    const value = finite(projection.statsPerGame[key]);
    if (value !== null) return value;
  }
  return null;
};

const boxScoreOpportunityProxy = (input: {
  readonly assists: number;
  readonly fieldGoalAttempts: number;
  readonly freeThrowAttempts: number;
  readonly turnovers: number;
}): number =>
  input.fieldGoalAttempts + 0.44 * input.freeThrowAttempts + input.assists + input.turnovers;

const projectedOpportunity = (projection: PlayerSituationProjection): number | null => {
  const assists = projectedStat(projection, 'assists', 'ast');
  const fieldGoalAttempts = projectedStat(projection, 'fieldGoalsAttempted', 'fga');
  const freeThrowAttempts = projectedStat(projection, 'freeThrowsAttempted', 'fta');
  const turnovers = projectedStat(projection, 'turnovers', 'turnover', 'tov');
  if (
    assists === null ||
    fieldGoalAttempts === null ||
    freeThrowAttempts === null ||
    turnovers === null
  ) {
    return null;
  }
  return boxScoreOpportunityProxy({ assists, fieldGoalAttempts, freeThrowAttempts, turnovers });
};

const previousOpportunity = (season: PlayerSituationProductionSeason): number | null => {
  const assists = historicalPerGame(season, 'ast');
  const fieldGoalAttempts = historicalPerGame(season, 'fga');
  const freeThrowAttempts = historicalPerGame(season, 'fta');
  const turnovers = historicalPerGame(season, 'turnover');
  if (
    assists === null ||
    fieldGoalAttempts === null ||
    freeThrowAttempts === null ||
    turnovers === null
  ) {
    return null;
  }
  return boxScoreOpportunityProxy({ assists, fieldGoalAttempts, freeThrowAttempts, turnovers });
};

const primaryTeam = (season: PlayerSituationProductionSeason | null): string | null =>
  season === null
    ? null
    : ([...season.teamStints].sort(
        (left, right) =>
          (right.lastGameDate ?? '').localeCompare(left.lastGameDate ?? '') ||
          right.gamesPlayed - left.gamesPlayed ||
          left.teamAbbreviation.localeCompare(right.teamAbbreviation),
      )[0]?.teamAbbreviation ?? null);

const metric = (
  advanced: PlayerAdvancedSeason | null,
  aliases: ReadonlyArray<string>,
): number | null => {
  if (advanced === null) return null;
  for (const alias of aliases) {
    const value = finite(advanced.metrics[alias]);
    if (value !== null) return value;
  }
  return null;
};

const positionsOverlap = (left: ReadonlyArray<string>, right: ReadonlyArray<string>): boolean =>
  left.some((position) => right.includes(position));

const toneForDirection = (direction: OpportunityDirection): PlayerSituationSignal['tone'] =>
  direction === 'up' ? 'positive' : direction === 'down' ? 'negative' : 'neutral';

const derivedDirection = (
  current: number | null,
  previous: number | null,
  previousGames: number | null,
): { readonly deltaPercent: number | null; readonly direction: OpportunityDirection } => {
  if (
    current === null ||
    previous === null ||
    previous <= 0 ||
    previousGames === null ||
    previousGames < 10
  ) {
    return { deltaPercent: null, direction: 'uncertain' };
  }
  const deltaPercent = (current - previous) / previous;
  return {
    deltaPercent: round(deltaPercent),
    direction: deltaPercent >= 0.08 ? 'up' : deltaPercent <= -0.08 ? 'down' : 'steady',
  };
};

const advancedMetrics = (advanced: PlayerAdvancedSeason | null): PlayerSituation['advanced'] => ({
  dribblesPerTouch: metric(advanced, [
    'tracking.possessions.avg_drib_per_touch',
    'tracking.possessions.avg_dribbles_per_touch',
    'avg_drib_per_touch',
  ]),
  potentialAssistsPerGame: metric(advanced, [
    'tracking.passing.potential_ast',
    'tracking.passing.potential_assists',
    'potential_assists',
  ]),
  secondaryAssistsPerGame: metric(advanced, [
    'tracking.passing.secondary_ast',
    'tracking.passing.secondary_assists',
    'secondary_assists',
  ]),
  timeOfPossessionMinutes: metric(advanced, [
    'tracking.possessions.time_of_poss',
    'tracking.possessions.time_of_possession',
    'time_of_possession',
  ]),
  touchesPerGame: metric(advanced, [
    'tracking.possessions.touches',
    'tracking.passing.touches',
    'touches',
  ]),
  usagePercentage: metric(advanced, [
    'general.advanced.usg_pct',
    'general.advanced.usage_percentage',
    'general.usage.usg_pct',
    'usage_percentage',
  ]),
});

/**
 * Builds one evidence-aware situation board from projections, prior production,
 * advanced metrics, and reviewed context. Missing evidence stays missing: a low
 * games-played total is never relabeled as an injury, and a team change is not
 * assigned a transaction type without a reviewed source.
 */
export function buildPlayerSituationBoard(input: {
  readonly advancedHistory?: ReadonlyArray<PlayerAdvancedSeason>;
  readonly asOf: string;
  readonly contexts?: ReadonlyArray<PlayerSituationContext>;
  readonly productionHistory: ReadonlyArray<PlayerSituationProductionSeason>;
  readonly projections: ReadonlyArray<PlayerSituationProjection>;
  readonly seasonKey: string;
}): PlayerSituationBoard {
  const projectionIds = new Set<string>();
  input.projections.forEach((projection) => {
    if (projectionIds.has(projection.playerId)) {
      throw new Error(`Duplicate situation projection for ${projection.playerId}`);
    }
    projectionIds.add(projection.playerId);
  });

  const contexts = new Map((input.contexts ?? []).map((context) => [context.playerId, context]));
  const historyByPlayer = new Map<string, PlayerSituationProductionSeason[]>();
  input.productionHistory.forEach((season) => {
    if (season.seasonKey >= input.seasonKey) return;
    historyByPlayer.set(season.playerId, [...(historyByPlayer.get(season.playerId) ?? []), season]);
  });
  const advancedByPlayer = new Map<string, PlayerAdvancedSeason[]>();
  (input.advancedHistory ?? []).forEach((season) => {
    if (season.seasonKey >= input.seasonKey) return;
    advancedByPlayer.set(season.playerId, [
      ...(advancedByPlayer.get(season.playerId) ?? []),
      season,
    ]);
  });

  const players = input.projections.map((projection): PlayerSituation => {
    const previousSeason =
      [...(historyByPlayer.get(projection.playerId) ?? [])].sort((left, right) =>
        right.seasonKey.localeCompare(left.seasonKey),
      )[0] ?? null;
    const advanced =
      [...(advancedByPlayer.get(projection.playerId) ?? [])].sort((left, right) =>
        right.seasonKey.localeCompare(left.seasonKey),
      )[0] ?? null;
    const context = contexts.get(projection.playerId) ?? null;
    const previousTeamAbbreviation = primaryTeam(previousSeason);
    const observedTeamChange =
      previousTeamAbbreviation !== null && previousTeamAbbreviation !== projection.teamAbbreviation;
    const reviewedMovement =
      context?.movement !== null &&
      context?.movement !== undefined &&
      (context.movement.toTeamAbbreviation === null ||
        context.movement.toTeamAbbreviation === projection.teamAbbreviation)
        ? context.movement
        : null;
    const reviewedNewTeam =
      reviewedMovement !== null &&
      ['draft', 'free-agent-signing', 'trade', 'two-way', 'waiver'].includes(
        reviewedMovement.type,
      ) &&
      reviewedMovement.fromTeamAbbreviation !== projection.teamAbbreviation;
    const isNewTeam = observedTeamChange || (previousTeamAbbreviation === null && reviewedNewTeam);
    const movementType = reviewedMovement?.type ?? (isNewTeam ? 'unknown' : 'returning');
    const currentProxy = projectedOpportunity(projection);
    const previousProxy = previousSeason === null ? null : previousOpportunity(previousSeason);
    const derived = derivedDirection(
      currentProxy,
      previousProxy,
      previousSeason?.gamesPlayed ?? null,
    );
    const opportunityDirection = context?.role?.opportunityDirection ?? derived.direction;
    const opportunitySource =
      context?.role?.opportunityDirection == null
        ? derived.direction === 'uncertain'
          ? 'insufficient-data'
          : 'box-score-proxy'
        : 'curated';
    const competition = input.projections
      .filter(
        (candidate) =>
          candidate.playerId !== projection.playerId &&
          candidate.teamAbbreviation === projection.teamAbbreviation &&
          positionsOverlap(candidate.positions, projection.positions),
      )
      .sort(
        (left, right) =>
          (projectedOpportunity(right) ?? 0) - (projectedOpportunity(left) ?? 0) ||
          right.fantasyPointsPerGame - left.fantasyPointsPerGame ||
          left.playerName.localeCompare(right.playerName),
      )
      .slice(0, 3)
      .map((candidate) => ({
        fantasyPointsPerGame: candidate.fantasyPointsPerGame,
        playerId: candidate.playerId,
        playerName: candidate.playerName,
        positions: candidate.positions,
      }));
    const wasLimitedLastSeason =
      previousSeason !== null && previousSeason.gamesPlayed > 0 && previousSeason.gamesPlayed < 60;
    const signals: PlayerSituationSignal[] = [];

    if (isNewTeam) {
      signals.push({
        basis: reviewedMovement === null ? 'inferred' : 'curated',
        detail:
          movementType === 'unknown'
            ? `${previousTeamAbbreviation} to ${projection.teamAbbreviation}; transaction type is unverified.`
            : `${previousTeamAbbreviation} to ${projection.teamAbbreviation} via ${movementType.replaceAll('-', ' ')}.`,
        kind: 'movement',
        tone: 'neutral',
      });
    }
    signals.push({
      basis: opportunitySource === 'curated' ? 'curated' : 'projected',
      detail:
        opportunitySource === 'box-score-proxy' && derived.deltaPercent !== null
          ? `Projected box-score opportunity proxy is ${Math.abs(Math.round(derived.deltaPercent * 100))}% ${opportunityDirection === 'down' ? 'lower' : opportunityDirection === 'up' ? 'higher' : 'from last season'}.`
          : (context?.role?.note ??
            'There is not enough comparable evidence to assign an opportunity direction.'),
      kind: 'opportunity',
      tone: toneForDirection(opportunityDirection),
    });
    if (competition.length > 0) {
      signals.push({
        basis: 'projected',
        detail: `Shares projected positions with ${competition.map((player) => player.playerName).join(', ')}.`,
        kind: 'competition',
        tone: 'neutral',
      });
    }
    if (context?.injury !== null && context?.injury !== undefined) {
      signals.push({
        basis: 'curated',
        detail: context.injury.summary,
        kind: 'injury',
        tone: 'negative',
      });
    } else if (wasLimitedLastSeason) {
      signals.push({
        basis: 'observed',
        detail: `Played ${previousSeason.gamesPlayed} games; the cause is not attributed without injury evidence.`,
        kind: 'availability',
        tone: 'negative',
      });
    }

    const summaryParts = [
      isNewTeam
        ? movementType === 'unknown'
          ? 'New team · type unverified'
          : `New team · ${movementType.replaceAll('-', ' ')}`
        : 'Returning team',
      `Opportunity ${opportunityDirection}`,
      context?.injury !== null && context?.injury !== undefined
        ? 'Injury context'
        : wasLimitedLastSeason
          ? `${previousSeason.gamesPlayed} GP last season`
          : null,
    ].filter((part): part is string => part !== null);

    return {
      advanced: advancedMetrics(advanced),
      availability: {
        expectedGames: projection.availability.expectedGames,
        previousGames: previousSeason?.gamesPlayed ?? null,
        wasLimitedLastSeason,
      },
      competition,
      currentTeamAbbreviation: projection.teamAbbreviation,
      injury: context?.injury ?? null,
      movement: {
        effectiveDate: reviewedMovement?.effectiveDate ?? null,
        fromTeamAbbreviation: reviewedMovement?.fromTeamAbbreviation ?? previousTeamAbbreviation,
        isNewTeam,
        note: reviewedMovement?.note ?? null,
        sourceUrl: reviewedMovement?.sourceUrl ?? null,
        toTeamAbbreviation: reviewedMovement?.toTeamAbbreviation ?? projection.teamAbbreviation,
        type: movementType,
      },
      opportunity: {
        currentBoxScoreProxy: currentProxy === null ? null : round(currentProxy),
        deltaPercent: derived.deltaPercent,
        direction: opportunityDirection,
        previousBoxScoreProxy: previousProxy === null ? null : round(previousProxy),
        source: opportunitySource,
      },
      playerId: projection.playerId,
      playerName: projection.playerName,
      positions: projection.positions,
      previousSeasonKey: previousSeason?.seasonKey ?? null,
      previousTeamAbbreviation,
      role: context?.role ?? null,
      signals,
      summary: summaryParts.join(' · '),
    };
  });

  return {
    asOf: input.asOf,
    players,
    seasonKey: input.seasonKey,
    summary: {
      advancedStatPlayerCount: players.filter((player) =>
        Object.values(player.advanced).some((value) => value !== null),
      ).length,
      contextPlayerCount: players.filter((player) => contexts.has(player.playerId)).length,
      limitedSeasonPlayerCount: players.filter((player) => player.availability.wasLimitedLastSeason)
        .length,
      newTeamPlayerCount: players.filter((player) => player.movement.isNewTeam).length,
      opportunityDownPlayerCount: players.filter(
        (player) => player.opportunity.direction === 'down',
      ).length,
      opportunityUpPlayerCount: players.filter((player) => player.opportunity.direction === 'up')
        .length,
      playerCount: players.length,
    },
  };
}
