import {
  evaluateLiveBid,
  type LiveBidAction,
  type LiveBidEvaluation,
  type LiveBidEvaluationInput,
  type LiveBidPlayer,
  type LiveBidTarget,
} from '@fantasy-basketball/fantasy';

export interface LiveBidRequest {
  readonly currentPriceCents: number;
  readonly draftStateVersion: string;
  readonly ownedPlayerIds: ReadonlyArray<string>;
  readonly playerId: string;
  readonly remainingBudgetCents: number;
  readonly remainingRosterSpots: number;
}

export interface LiveBidJudgment {
  readonly action: LiveBidAction;
  readonly fragilityConcernProbability: number | null;
  readonly note: string;
  readonly planAlignment: 'aligned' | 'neutral' | 'weak' | null;
  readonly rosterFit: 'neutral' | 'poor' | 'strong' | 'useful' | null;
  readonly source: 'deterministic-fallback' | 'jev' | 'pending';
}

export interface LiveBidDecision extends LiveBidEvaluation {
  readonly judgment: LiveBidJudgment;
  readonly projection: LiveBidProjectionMetadata;
}

export interface LiveBidProjectionMetadata {
  readonly asOf: string;
  readonly modelVersion: string;
  readonly seasonKey: string;
  readonly source: string;
}

export interface LiveBidBoardPlayer extends LiveBidPlayer {
  readonly calibratedMarket: LiveBidEvaluationInput['calibratedMarket'];
  readonly historicalMarket: LiveBidEvaluationInput['historicalMarket'];
  readonly target: LiveBidTarget | null;
}

export interface LiveBidBoard {
  readonly baseBudgetCents: number;
  readonly players: ReadonlyArray<LiveBidBoardPlayer>;
  readonly projection: LiveBidProjectionMetadata;
  readonly rosterSize: number;
  readonly teamCount: number;
}

/**
 * Runs the complete deterministic bid policy against a board prepared while
 * rendering the draft room. No I/O occurs at this seam, so the hard guardrails
 * can be shown before the optional Jev review returns.
 */
export function evaluateLiveBidBoard(
  board: LiveBidBoard,
  request: LiveBidRequest,
): LiveBidDecision {
  const player = board.players.find((candidate) => candidate.playerId === request.playerId);
  if (player === undefined)
    throw new Error(`Projection unavailable for player ${request.playerId}`);

  const baseline = evaluateLiveBid({
    baseBudgetCents: board.baseBudgetCents,
    calibratedMarket: player.calibratedMarket,
    currentPriceCents: request.currentPriceCents,
    draftStateVersion: request.draftStateVersion,
    historicalMarket: player.historicalMarket,
    ownedPlayerIds: request.ownedPlayerIds,
    playerId: request.playerId,
    players: board.players,
    remainingBudgetCents: request.remainingBudgetCents,
    remainingRosterSpots: request.remainingRosterSpots,
    rosterSize: board.rosterSize,
    target: player.target,
    teamCount: board.teamCount,
  });

  return {
    ...baseline,
    judgment: {
      action: baseline.action,
      fragilityConcernProbability: null,
      note: 'Deterministic guardrails are ready. Jev is reviewing qualitative roster fit in the background.',
      planAlignment: null,
      rosterFit: null,
      source: 'pending',
    },
    projection: board.projection,
  };
}

export function markJevUnavailable(decision: LiveBidDecision): LiveBidDecision {
  return {
    ...decision,
    action: decision.judgment.action,
    judgment: {
      action: decision.judgment.action,
      fragilityConcernProbability: null,
      note: 'Jev was unavailable; this recommendation uses deterministic value and budget guardrails only.',
      planAlignment: null,
      rosterFit: null,
      source: 'deterministic-fallback',
    },
  };
}
