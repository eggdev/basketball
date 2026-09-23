import { afterEach, describe, expect, it, vi } from 'vitest';
import { experimental_evaluate } from 'ai';
import { evaluateDraftChange } from './live-draft-evaluator';
import type { BridgeState } from './fantrax-bridge';

vi.mock('ai', () => ({
  createGateway: () => ({ evaluationModel: () => 'jev' }),
  experimental_evaluate: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
}));
vi.mock('./live-draft-model', () => ({
  loadDraftModelReference: async () => ({
    summary: {
      status: 'ready',
      note: 'Reference model',
      season: '2026-27',
      asOf: '2026-09-19',
      snapshotId: 'snapshot',
      modelVersion: 'model',
      valuationModel: 'market',
      playerCount: 1,
      mappedCount: 1,
    },
    candidate: {
      playerId: 'p1',
      playerName: 'Test Player',
      rank: 1,
      fantasyPointsPerGame: 60,
      statsPerGame: { points: 25 },
      availabilityTier: 'durable',
      marketPriceCents: 5000,
      fairLowCents: 4000,
      fairHighCents: 6000,
    },
    roster: [],
    unmatchedRosterCount: 0,
    priceSignal: 'above-reference',
  }),
}));
vi.mock('./fantrax-live-server', () => ({
  loadFantraxLeague: async () => ({
    teamInfo: { mine: { id: 'mine' } },
    draftSettings: { minimumBid: 100, minimumBidIncrement: 100 },
    seasonYear: 2026,
    scoringSystem: { type: 'categories', scoringCategories: { PLAYER: { PTS: {}, REB: {} } } },
    rosterInfo: { maxTotalPlayers: 13 },
  }),
  loadFantraxCatalog: async () => ({ p1: { name: 'Player, Test', position: 'C' } }),
}));
const state: BridgeState = {
  leagueId: 'aaaaaaaaaaaaaaaa',
  draftId: 'draft1',
  sequence: 1,
  observedAt: Date.now(),
  source: 'socket',
  status: '1',
  nominatedPlayerId: 'p1',
  currentBidCents: 18800,
  bidderTeamId: 'other',
  nominatingTeamId: 'mine',
  timeLeftMs: 1000,
  currentPick: 1,
  rosterSyncPending: false,
  teams: { mine: { budgetCents: 20000, maxBidCents: 18800, remainingSpots: 13 } },
  rosters: [],
};
describe('league-scoped Jev draft evaluation', () => {
  afterEach(() => vi.clearAllMocks());
  it('keeps a budget stop even when Jev rates position fit useful', async () => {
    vi.mocked(experimental_evaluate).mockResolvedValueOnce({
      answers: { rosterFit: { choice: 'useful' }, focus: { choice: 'check_value' } },
    } as never);
    const result = await evaluateDraftChange(state, 'mine');
    expect(result.source).toBe('jev');
    expect(result.action).toBe('stop');
    expect(result.playerName).toBe('Test Player');
    expect(vi.mocked(experimental_evaluate).mock.calls[0][0].state).toMatchObject({
      league: { id: state.leagueId, categories: ['PTS', 'REB'] },
      leagueValueModel: null,
      teamId: 'mine',
      generatedReference: {
        candidate: { rank: 1, statsPerGame: { points: 25 } },
        priceSignal: 'above-reference',
      },
    });
  });
  it('keeps budget checks available when Jev fails', async () => {
    vi.mocked(experimental_evaluate).mockRejectedValueOnce(new Error('gateway failed'));
    expect(await evaluateDraftChange(state, 'mine')).toMatchObject({
      source: 'guardrails',
      action: 'stop',
      rosterFit: null,
    });
  });
  it('waits for roster recovery and rejects a team from another league', async () => {
    expect(await evaluateDraftChange({ ...state, rosterSyncPending: true }, 'mine')).toMatchObject({
      source: 'guardrails',
      action: 'wait',
    });
    await expect(evaluateDraftChange(state, 'other')).rejects.toThrow('does not belong');
    expect(experimental_evaluate).not.toHaveBeenCalled();
  });
});
