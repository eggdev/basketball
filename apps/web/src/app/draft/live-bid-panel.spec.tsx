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
      availabilityRate: 0.9,
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
      teamAbbreviation: 'AAA',
      usableValue: {
        diagnostics: {
          capturedPlayoffWeightedPoints: 120,
          congestionLoss: 300,
          estimatedCapturedRegularSeasonPoints: 2_220,
          expectedScheduledPoints: 2_520,
          playoffWeightedGames: 10,
          usablePoints: 2_340,
        },
        modelVersion: 'usable-lineup-v1',
        scheduleAsOf: '2026-09-19T00:00:00.000Z',
        valueCents: 10_000,
      },
    },
    {
      availabilityRate: 0.8,
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
      teamAbbreviation: 'BBB',
      usableValue: null,
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
  usableContext: {
    lineupSlots: [
      {
        code: 'PG',
        eligiblePositions: ['PG'],
        label: 'Point Guard',
        maxActive: 1,
        minActive: 0,
      },
    ],
    modelVersion: 'usable-lineup-v1',
    scheduleAsOf: '2026-09-19T00:00:00.000Z',
    seasonCalendar: {
      asOf: '2026-09-19T00:00:00.000Z',
      fantasyPeriods: [
        {
          endAt: '2026-10-31T23:59:59.999Z',
          label: 'Regular season',
          phase: 'regular-season',
          scoringPeriod: 1,
          startAt: '2026-10-01T00:00:00.000Z',
          weight: 1,
        },
      ],
      fingerprint: 'calendar-1',
      games: [
        {
          awayTeam: 'BBB',
          date: '2026-10-20',
          homeTeam: 'AAA',
          postponed: false,
          scheduledAt: '2026-10-20T23:00:00.000Z',
        },
      ],
      snapshotId: 'snapshot-1',
    },
  },
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
    render(<LiveBidPanel storageScope="owner:main:2026" board={board} />);

    fireEvent.change(screen.getByLabelText('Current bid ($)'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Evaluate live bid' }));

    expect(screen.getAllByText('Keep bidding')).toHaveLength(2);
    expect(screen.getByText(/Jev is reviewing qualitative roster fit/)).toBeTruthy();
    expect(screen.getByText(/Guardrails returned in \d+ ms/)).toBeTruthy();
    expect(screen.getByText('Usable value')).toBeTruthy();
    expect(screen.getByText('Roster marginal')).toBeTruthy();
    expect(screen.getAllByText(/usable-lineup-v1/)).toHaveLength(2);
  });

  it('keeps budgets separate for each owner and league scope', () => {
    const first = render(<LiveBidPanel storageScope="owner:main:2026" board={board} />);
    fireEvent.change(screen.getByLabelText('Budget left ($)'), { target: { value: '75' } });
    first.unmount();
    const second = render(<LiveBidPanel storageScope="owner:mock:2026" board={board} />);
    expect((screen.getByLabelText('Budget left ($)') as HTMLInputElement).value).toBe('200');
    second.unmount();
    render(<LiveBidPanel storageScope="owner:main:2026" board={board} />);
    expect((screen.getByLabelText('Budget left ($)') as HTMLInputElement).value).toBe('75');
  });

  it('records an uncontested player at zero dollars without reducing the budget', () => {
    render(<LiveBidPanel storageScope="owner:main:2026" board={board} />);

    fireEvent.click(screen.getByRole('button', { name: 'Evaluate live bid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Record win at $0' }));

    expect(screen.getAllByText('Anchor Guard').length).toBeGreaterThan(0);
    expect((screen.getByLabelText('Budget left ($)') as HTMLInputElement).value).toBe('200');
    expect((screen.getByLabelText('Roster spots left') as HTMLInputElement).value).toBe('0');
  });
});
