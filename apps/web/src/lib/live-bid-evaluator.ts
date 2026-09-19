import type { LiveBidAction, LiveBidEvaluation, LiveBidPlayer } from '@fantasy-basketball/fantasy';
import { createGateway, experimental_evaluate } from 'ai';

import { createLiveBidBoard } from './create-live-bid-board';
import { loadHistoricalAuctionMarket } from './historical-auction-market';
import { loadHistoricalRankings } from './historical-rankings';
import {
  evaluateLiveBidBoard,
  type LiveBidDecision,
  type LiveBidJudgment,
  type LiveBidRequest,
} from './live-bid-board';
import { loadLatestProjectionSnapshot } from './latest-projections';
import { loadPreDraftWorkspace } from './pre-draft-workspace';

const jevGateway = () => {
  const apiKey =
    process.env['AI_GATEWAY_API_KEY']?.trim() ?? process.env['EGGDEV_AI_GATEWAY_KEY']?.trim();
  return apiKey ? createGateway({ apiKey }) : createGateway();
};

const applyJevPolicy = (
  baseline: LiveBidEvaluation,
  judgment: Omit<LiveBidJudgment, 'action' | 'source'>,
): LiveBidAction => {
  if (baseline.action === 'stop' || baseline.action === 'review') return baseline.action;
  const shouldSlowDown =
    judgment.rosterFit === 'poor' ||
    judgment.planAlignment === 'weak' ||
    (judgment.fragilityConcernProbability ?? 0) >= 0.7;
  return baseline.action === 'keep-bidding' && shouldSlowDown ? 'caution' : baseline.action;
};

const fallbackJudgment = (baseline: LiveBidEvaluation): LiveBidJudgment => ({
  action: baseline.action,
  fragilityConcernProbability: null,
  note: 'Jev was unavailable; this recommendation uses deterministic value and budget guardrails only.',
  planAlignment: null,
  rosterFit: null,
  source: 'deterministic-fallback',
});

async function judgeWithJev(input: {
  readonly abortSignal?: AbortSignal;
  readonly baseline: LiveBidEvaluation;
  readonly ownedPlayers: ReadonlyArray<LiveBidPlayer>;
  readonly plan: Awaited<ReturnType<typeof loadPreDraftWorkspace>>['plan'];
}): Promise<LiveBidJudgment> {
  try {
    const timeoutSignal = AbortSignal.timeout(4_000);
    const result = await experimental_evaluate({
      abortSignal:
        input.abortSignal === undefined
          ? timeoutSignal
          : AbortSignal.any([input.abortSignal, timeoutSignal]),
      maxRetries: 1,
      model: jevGateway().evaluationModel('typesafe-ai/jev'),
      questions: {
        rosterFit: {
          criteria: {
            neutral: 'Neither materially helps nor harms the roster construction.',
            poor: 'Duplicates existing strengths while leaving meaningful lineup needs exposed.',
            strong: 'Directly fills an important roster need and complements the current players.',
            useful: 'Adds useful flexibility or depth without being essential.',
          },
          instructions:
            'Judge qualitative roster construction only. Do not recalculate price, budget, fantasy points, or the personal cap.',
          type: 'choice',
        },
        planAlignment: {
          criteria: {
            aligned: 'Clearly supports the stated plan, risk posture, and target stance.',
            neutral: 'Does not meaningfully advance or conflict with the stated plan.',
            weak: 'Conflicts with the stated plan, risk posture, or avoid stance.',
          },
          instructions:
            'Judge alignment with Brendan’s saved pre-draft plan. Treat missing plan details as neutral.',
          type: 'choice',
        },
        fragilityConcern: {
          criteria: {
            false: 'Availability and roster context do not create an unusually concentrated risk.',
            true: 'The combination of availability tier and current roster creates concentrated risk.',
          },
          instructions:
            'Estimate whether this player creates a material roster-level availability concern. Use only the supplied projection tier; do not infer injuries.',
          type: 'boolean',
        },
      },
      state: {
        candidate: {
          availabilityTier: input.baseline.impact.availabilityTier,
          positions: input.baseline.impact.positions,
          rosterFitHeuristic: input.baseline.impact.rosterFit,
          targetStance: input.baseline.personal.targetStance,
        },
        deterministicGuardrails: {
          action: input.baseline.action,
          priceSignal: input.baseline.market.priceSignal,
        },
        ownerPlan:
          input.plan === null
            ? null
            : {
                notes: input.plan.notes,
                primaryGoal: input.plan.primaryGoal,
                riskTolerance: input.plan.riskTolerance,
                strategyAngle: input.plan.strategyAngle,
                streamingSlots: input.plan.streamingSlots,
              },
        roster: input.ownedPlayers.map((player) => ({
          availabilityTier: player.availabilityTier,
          name: player.playerName,
          positions: player.positions,
        })),
      },
    });
    const qualitative = {
      fragilityConcernProbability: result.answers.fragilityConcern.probability,
      note: 'Jev reviewed qualitative roster fit and plan alignment. Deterministic code still owns every dollar value and hard stop.',
      planAlignment: result.answers.planAlignment.choice,
      rosterFit: result.answers.rosterFit.choice,
    } satisfies Omit<LiveBidJudgment, 'action' | 'source'>;
    return {
      ...qualitative,
      action: applyJevPolicy(input.baseline, qualitative),
      source: 'jev',
    };
  } catch {
    return fallbackJudgment(input.baseline);
  }
}

export async function evaluateLiveBidRequest(
  request: LiveBidRequest,
  abortSignal?: AbortSignal,
): Promise<LiveBidDecision> {
  const [projection, market, workspace, rankings] = await Promise.all([
    loadLatestProjectionSnapshot(),
    loadHistoricalAuctionMarket(),
    loadPreDraftWorkspace(),
    loadHistoricalRankings(),
  ]);
  if (projection === null) throw new Error('No projection snapshot is available');
  if (workspace.league === null) throw new Error('No current league season is available');

  const board = createLiveBidBoard({
    league: workspace.league,
    market,
    plan: workspace.plan,
    projection,
    rankings,
  });
  const baseline = evaluateLiveBidBoard(board, request);
  const ownedPlayers = request.ownedPlayerIds.flatMap((playerId) => {
    const ownedPlayer = board.players.find((player) => player.playerId === playerId);
    return ownedPlayer === undefined ? [] : [ownedPlayer];
  });
  const judgment = await judgeWithJev({
    abortSignal,
    baseline,
    ownedPlayers,
    plan: workspace.plan,
  });

  return {
    ...baseline,
    action: judgment.action,
    judgment,
  };
}

export type { LiveBidDecision, LiveBidJudgment, LiveBidRequest } from './live-bid-board';
