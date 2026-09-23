import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { BridgeState } from '../../../lib/fantrax-bridge';
import type { DraftModelPlayer } from '../../../lib/live-draft-model';
import { LiveAuctionPlayer } from './live-auction-player';

const state: BridgeState = {
  leagueId: 'aaaaaaaaaaaaaaaa',
  draftId: 'draft',
  sequence: 1,
  observedAt: Date.now(),
  source: 'socket',
  status: '1',
  nominatedPlayerId: 'player',
  currentBidCents: 2000,
  bidderTeamId: 'other',
  nominatingTeamId: 'mine',
  timeLeftMs: 15000,
  currentPick: 1,
  rosterSyncPending: false,
  rosters: [],
  teams: { mine: { budgetCents: 5000, maxBidCents: 4000, remainingSpots: 11 } },
};
const projection: DraftModelPlayer = {
  playerId: 'canonical',
  playerName: 'Test Player',
  rank: 5,
  fantasyPointsPerGame: 25,
  statsPerGame: { points: 30, fieldGoalsMade: 9, fieldGoalsAttempted: 18, steals: 0 },
  availabilityTier: 'durable',
  marketPriceCents: 5000,
  fairLowCents: 4000,
  fairHighCents: 6000,
  expectedGames: 71,
  positions: ['PG'],
  team: 'OKC',
  previousPriceCents: 4500,
  previousSeason: '2025-26',
};
const props = {
  state,
  teamId: 'mine',
  stale: false,
  name: 'Test Player',
  position: 'PG',
  nbaTeam: 'OKC',
  bidder: 'Other team',
  projection,
  nextBidCents: 2100,
  season: '2026-27',
};

afterEach(cleanup);
describe('auction player indicators', () => {
  it('shows projected stats and separates an affordable next bid from reference value', () => {
    const { rerender } = render(<LiveAuctionPlayer {...props} />);
    expect(screen.getByText('#5')).toBeTruthy();
    expect(screen.getByText('50.0%')).toBeTruthy();
    expect(screen.getByText('0.0')).toBeTruthy();
    expect(screen.getByText('$45')).toBeTruthy();
    expect(screen.getByLabelText('Next bid within legal budget')).toBeTruthy();
    expect(screen.getByLabelText('Below main league reference range')).toBeTruthy();
    rerender(
      <LiveAuctionPlayer
        {...props}
        nextBidCents={2100}
        state={{
          ...state,
          teams: { mine: { budgetCents: 2000, maxBidCents: 1000, remainingSpots: 11 } },
        }}
      />,
    );
    expect(screen.getByLabelText('Next bid exceeds legal budget')).toBeTruthy();
    expect(screen.getByLabelText('Below main league reference range')).toBeTruthy();
  });
  it('clears live signals for stale, paused, and pending roster updates', () => {
    const { rerender } = render(<LiveAuctionPlayer {...props} stale />);
    expect(screen.getByLabelText('Budget status unavailable')).toBeTruthy();
    expect(screen.getByLabelText('Reference comparison unavailable')).toBeTruthy();
    expect(screen.getByText('Test Player')).toBeTruthy();
    for (const change of [{ status: '2' as const }, { rosterSyncPending: true }]) {
      rerender(<LiveAuctionPlayer {...props} state={{ ...state, ...change }} />);
      expect(screen.getByLabelText('Budget status unavailable')).toBeTruthy();
      expect(screen.getByLabelText('Reference comparison unavailable')).toBeTruthy();
    }
  });
  it('shows over-reference bids and leaves unavailable projections blank', () => {
    const { rerender } = render(
      <LiveAuctionPlayer
        {...props}
        state={{ ...state, currentBidCents: 7000 }}
        nextBidCents={7100}
      />,
    );
    expect(screen.getByLabelText('Above main league reference range')).toBeTruthy();
    expect(screen.getByText('+$20')).toBeTruthy();
    rerender(<LiveAuctionPlayer {...props} projection={null} />);
    expect(screen.queryByText('#5')).toBeNull();
    expect(screen.queryByText('50.0%')).toBeNull();
    expect(screen.getByLabelText('Reference comparison unavailable')).toBeTruthy();
  });
});
