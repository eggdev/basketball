import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LiveBidBoard } from '../../lib/live-bid-board';
import { LiveBidPanel } from './live-bid-panel';

vi.mock('../app-shell', () => ({
  AskEveButton: ({ children }: { readonly children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

const board: LiveBidBoard = {
  baseBudgetCents: 20_000,
  players: [
    {
      availabilityTier: 'durable',
      calibratedMarket: {
        expectedPriceCents: 6_000,
        fairHighCents: 7_000,
        fairLowCents: 5_000,
        modelId: 'market-production-50-v1',
        seasonsBacktested: 4,
      },
      fantasyPoints: 2_520,
      fantasyPointsPerGame: 35,
      historicalMarket: null,
      playerId: 'anchor',
      playerName: 'Anchor Guard',
      positions: ['PG'],
      rank: 1,
      target: null,
    },
    {
      availabilityTier: 'managed',
      calibratedMarket: null,
      fantasyPoints: 1_440,
      fantasyPointsPerGame: 20,
      historicalMarket: null,
      playerId: 'replacement',
      playerName: 'Replacement Guard',
      positions: ['SG'],
      rank: 2,
      target: null,
    },
  ],
  projection: {
    asOf: '2026-09-18T00:00:00.000Z',
    modelVersion: 'projection-v1',
    seasonKey: '2026-27',
    source: 'hashtag',
  },
  rosterSize: 1,
  teamCount: 2,
};

describe('LiveBidPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => undefined)),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows deterministic guardrails without waiting for the Jev request', () => {
    render(<LiveBidPanel board={board} />);

    fireEvent.change(screen.getByLabelText('Current bid ($)'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate live bid' }));

    expect(screen.getAllByText('Keep bidding')).toHaveLength(2);
    expect(screen.getByText(/Jev is reviewing qualitative roster fit/)).toBeTruthy();
    expect(screen.getByText(/Guardrails returned in \d+ ms/)).toBeTruthy();
  });
});
