import { z } from 'zod';
import { fantraxLeagueId } from './fantrax-live';
import type { DraftModelReference } from './live-draft-model';

const id = z.string().min(1).max(80);
const cents = z.number().int().nonnegative().max(100_000_000);
export const bridgeStateSchema = z.object({
  leagueId: fantraxLeagueId,
  draftId: id,
  sequence: z.number().int().nonnegative(),
  observedAt: z.number().int().positive(),
  source: z.enum(['socket', 'poll']),
  status: z.enum(['0', '1', '2', '3', '4', '5']),
  nominatedPlayerId: id.nullable(),
  currentBidCents: cents.nullable(),
  bidderTeamId: id.nullable(),
  nominatingTeamId: id.nullable(),
  timeLeftMs: z.number().finite().nonnegative().nullable(),
  currentPick: z.number().int().nonnegative().nullable(),
  rosterSyncPending: z.boolean(),
  teams: z.record(
    id,
    z.object({
      budgetCents: cents,
      maxBidCents: cents,
      remainingSpots: z.number().int().nonnegative().max(100),
    }),
  ),
  rosters: z
    .array(
      z.object({
        teamId: id,
        playerId: id,
        priceCents: cents.nullable(),
      }),
    )
    .max(2000),
});
export type BridgeState = z.infer<typeof bridgeStateSchema>;
export const bridgeRequestSchema = z.object({
  teamId: id,
  state: bridgeStateSchema,
});

// Clock ticks and transport heartbeats must not spend a model call.
export function bridgeVersion(state: BridgeState, teamId: string): string {
  const {
    observedAt: _at,
    sequence: _sequence,
    timeLeftMs: _clock,
    source: _source,
    ...meaningful
  } = state;
  return JSON.stringify({ teamId, ...meaningful });
}

export function acceptBridgeMessage(
  event: Pick<MessageEvent, 'origin' | 'source' | 'data'>,
  opener: Window | null,
  nonce: string,
  leagueId: string,
): BridgeState | null {
  if (
    !opener ||
    !nonce ||
    event.source !== opener ||
    !['https://www.fantrax.com', 'https://fantrax.com'].includes(event.origin)
  )
    return null;
  if (event.data?.type !== 'fantasy-basketball:draft-state' || event.data.nonce !== nonce)
    return null;
  const parsed = bridgeStateSchema.safeParse(event.data.state);
  return parsed.success && parsed.data.leagueId === leagueId ? parsed.data : null;
}

export type DraftAction = 'wait' | 'leading' | 'stop' | 'review';
export function draftGuardrail(
  state: BridgeState,
  teamId: string,
  minimumBid: number,
  increment: number,
) {
  const team = state.teams[teamId];
  const nextBidCents =
    state.currentBidCents === null ? minimumBid : state.currentBidCents + increment;
  const base = { nextBidCents, maxBidCents: team?.maxBidCents ?? null };
  if (state.rosterSyncPending)
    return {
      ...base,
      action: 'wait' as DraftAction,
      note: 'Refreshing rosters and budgets after a draft change.',
    };
  if (!team)
    return {
      ...base,
      action: 'wait' as DraftAction,
      note: 'Choose a team included in the draft feed.',
    };
  if (state.status !== '1')
    return {
      ...base,
      action: 'wait' as DraftAction,
      note: 'Wait for Fantrax to resume the draft.',
    };
  if (!state.nominatedPlayerId)
    return {
      ...base,
      action: 'wait' as DraftAction,
      note:
        state.nominatingTeamId === teamId
          ? 'Your turn to nominate. Review your remaining roster needs.'
          : 'Wait for the next nomination.',
    };
  if (state.bidderTeamId === teamId)
    return {
      ...base,
      action: 'leading' as DraftAction,
      note: 'You hold the current bid. Wait for the auction result.',
    };
  if (team.remainingSpots === 0 || nextBidCents > Math.min(team.maxBidCents, team.budgetCents))
    return {
      ...base,
      action: 'stop' as DraftAction,
      note: 'Stop bidding. The next bid exceeds your available roster or budget.',
    };
  return {
    ...base,
    action: 'review' as DraftAction,
    note: 'Review player value before bidding. A price model for this league is not loaded.',
  };
}

export interface BridgeEvaluation {
  leagueRules?: {
    season: number;
    scoringType: string;
    categories: string[];
    rosterSize: number;
    minimumBidCents: number;
    incrementCents: number;
  };
  reference?: DraftModelReference;
  version: string;
  evaluatedAt: string;
  durationMs: number;
  action: DraftAction;
  note: string;
  nextBidCents: number;
  maxBidCents: number | null;
  playerName: string | null;
  source: 'jev' | 'guardrails';
  rosterFit: string | null;
  focus: string | null;
  error: string | null;
  recording?: 'saved' | 'unavailable';
}
