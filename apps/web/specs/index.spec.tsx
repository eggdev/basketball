import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import Page from '../src/app/page';

const market = vi.hoisted(() => ({
  players: [
    {
      averagePriceCents: 7_900,
      expectedPriceCents: 8_100,
      fantraxId: 'jokic',
      latestPriceCents: 8_500,
      latestSeason: '2025-26',
      maximumPriceCents: 8_500,
      minimumPriceCents: 7_200,
      name: 'Nikola Jokic',
      playerId: 'player-1',
      previousPriceCents: 8_000,
      seasonsDrafted: 5,
      trendCents: 500,
    },
    {
      averagePriceCents: 6_800,
      expectedPriceCents: 7_000,
      fantraxId: 'sga',
      latestPriceCents: 7_500,
      latestSeason: '2025-26',
      maximumPriceCents: 7_500,
      minimumPriceCents: 6_100,
      name: 'Shai Gilgeous-Alexander',
      playerId: 'player-2',
      previousPriceCents: 7_200,
      seasonsDrafted: 4,
      trendCents: 300,
    },
  ],
  summary: {
    latestSeason: '2025-26',
    playerCount: 235,
    purchaseCount: 695,
    seasonCount: 5,
    totalSpendCents: 1_080_300,
  },
}));

vi.mock('../src/lib/historical-auction-market', () => ({
  loadHistoricalAuctionMarket: () => Promise.resolve(market),
}));

vi.mock('eve/react', () => ({
  useEveAgent: () => ({
    data: { messages: [] },
    error: undefined,
    send: vi.fn<() => Promise<void>>(),
    status: 'ready',
  }),
}));

describe('Page', () => {
  it('renders the historical player market beside chat', async () => {
    const { baseElement } = render(await Page());

    expect(baseElement).toBeTruthy();
    expect(baseElement.textContent).toContain('Historical player market');
    expect(baseElement.textContent).toContain('Draft chat');
    expect(baseElement.textContent).toContain('Nikola Jokic');
    expect(baseElement.textContent).toContain('$10,803');
  });

  it('filters the historical market by player name', async () => {
    render(await Page());

    fireEvent.change(screen.getByRole('searchbox', { name: 'Find player' }), {
      target: { value: 'Shai' },
    });

    expect(screen.getByText('Shai Gilgeous-Alexander')).toBeTruthy();
    expect(screen.queryByText('Nikola Jokic')).toBeNull();
  });
});
