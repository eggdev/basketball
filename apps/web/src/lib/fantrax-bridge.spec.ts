import { describe, expect, it } from 'vitest';
import {
  acceptBridgeMessage,
  bridgeStateSchema,
  bridgeVersion,
  draftGuardrail,
  type BridgeState,
} from './fantrax-bridge';

export const bridgeFixture: BridgeState = {
  leagueId: 'aaaaaaaaaaaaaaaa',
  draftId: 'draft1',
  sequence: 1,
  observedAt: Date.now(),
  source: 'socket',
  status: '1',
  nominatedPlayerId: 'player1',
  currentBidCents: 5000,
  bidderTeamId: 'other',
  nominatingTeamId: 'mine',
  timeLeftMs: 15000,
  currentPick: 1,
  rosterSyncPending: false,
  teams: { mine: { budgetCents: 20000, maxBidCents: 18800, remainingSpots: 13 } },
  rosters: [],
};

describe('Fantrax bridge boundary', () => {
  it('requires the paired Fantrax window, nonce, league, and valid state', () => {
    const opener = window;
    const event = {
      origin: 'https://www.fantrax.com',
      source: opener,
      data: { type: 'fantasy-basketball:draft-state', nonce: 'paired', state: bridgeFixture },
    };
    expect(acceptBridgeMessage(event, opener, 'paired', bridgeFixture.leagueId)).toEqual(
      bridgeFixture,
    );
    expect(
      acceptBridgeMessage(
        { ...event, origin: 'https://example.com' },
        opener,
        'paired',
        bridgeFixture.leagueId,
      ),
    ).toBeNull();
    expect(
      acceptBridgeMessage({ ...event, source: null }, opener, 'paired', bridgeFixture.leagueId),
    ).toBeNull();
    expect(acceptBridgeMessage(event, opener, 'different', bridgeFixture.leagueId)).toBeNull();
    expect(acceptBridgeMessage(event, opener, 'paired', 'bbbbbbbbbbbbbbbb')).toBeNull();
    expect(bridgeStateSchema.safeParse({ ...bridgeFixture, currentBidCents: NaN }).success).toBe(
      false,
    );
    expect(
      bridgeStateSchema.safeParse({
        ...bridgeFixture,
        teams: { mine: { budgetCents: -1, maxBidCents: 1, remainingSpots: 13 } },
      }).success,
    ).toBe(false);
  });

  it('ignores timer ticks but reacts to bids, leaders, purchases, pauses, and league identity', () => {
    const base = bridgeVersion(bridgeFixture, 'mine');
    expect(
      bridgeVersion(
        {
          ...bridgeFixture,
          observedAt: Date.now() + 1,
          sequence: 2,
          timeLeftMs: 9000,
          source: 'poll',
        },
        'mine',
      ),
    ).toBe(base);
    for (const change of [
      { currentBidCents: 5100 },
      { bidderTeamId: 'mine' },
      { status: '2' as const },
      { rosters: [{ teamId: 'mine', playerId: 'p2', priceCents: 5000 }] },
      { leagueId: 'bbbbbbbbbbbbbbbb' },
      { rosterSyncPending: true },
    ])
      expect(bridgeVersion({ ...bridgeFixture, ...change }, 'mine')).not.toBe(base);
    expect(bridgeVersion(bridgeFixture, 'other')).not.toBe(base);
  });

  it('preserves budget stops and prevents self-bidding or acting on uncertain rosters', () => {
    expect(draftGuardrail(bridgeFixture, 'mine', 100, 100).action).toBe('review');
    expect(
      draftGuardrail({ ...bridgeFixture, currentBidCents: 18800 }, 'mine', 100, 100).action,
    ).toBe('stop');
    expect(
      draftGuardrail(
        { ...bridgeFixture, currentBidCents: 18800, bidderTeamId: 'mine' },
        'mine',
        100,
        100,
      ).action,
    ).toBe('leading');
    expect(draftGuardrail({ ...bridgeFixture, status: '2' }, 'mine', 100, 100).action).toBe('wait');
    expect(
      draftGuardrail({ ...bridgeFixture, rosterSyncPending: true }, 'mine', 100, 100).action,
    ).toBe('wait');
    expect(draftGuardrail(bridgeFixture, 'unknown', 100, 100).action).toBe('wait');
    expect(
      draftGuardrail(
        {
          ...bridgeFixture,
          teams: { mine: { budgetCents: 20000, maxBidCents: 20000, remainingSpots: 0 } },
        },
        'mine',
        100,
        100,
      ).action,
    ).toBe('stop');
  });
});
