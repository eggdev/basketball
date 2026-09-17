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

const teamHistory = vi.hoisted(() => ({
  members: [
    {
      canonicalKey: 'manager-one',
      displayName: 'Manager One',
      favoritePlayers: [
        {
          averagePriceCents: 4_500,
          draftCount: 2,
          latestSeason: '2025-26',
          playerId: 'player-1',
          playerName: 'Nikola Jokic',
          totalSpendCents: 9_000,
        },
      ],
      memberId: '1eaed817-a6b1-4e07-8860-849950efa9dc',
      purchaseCount: 26,
      seasons: [
        {
          averagePriceCents: 1_500,
          identityConfidence: 100,
          identityResolution: 'manager_alias',
          purchaseCount: 13,
          seasonKey: '2024-25',
          sourceTeamId: 'team-1',
          teamName: 'Moon Shots',
          totalSpendCents: 19_500,
        },
      ],
      teamNames: ['Moon Shots'],
      totalSpendCents: 39_000,
    },
  ],
  summary: {
    canonicalMemberCount: 1,
    latestSeason: '2025-26',
    resolvedTeamSeasonCount: 4,
    seasonCount: 5,
    teamSeasonCount: 6,
    unresolvedTeamSeasonCount: 2,
  },
  unresolvedTeams: [
    {
      seasonKey: '2024-25',
      sourceTeamId: 'team-1-old',
      teamName: 'Unknown Team',
      teamSeasonId: 'a1f0613a-0bc2-42f0-8795-1373e771d116',
    },
    {
      seasonKey: '2025-26',
      sourceTeamId: 'team-2',
      teamName: 'Unknown Team',
      teamSeasonId: '8f942adb-4f54-45a3-a6fe-fdf7f7c743e0',
    },
  ],
}));

const loadViewer = vi.hoisted(() =>
  vi.fn<
    () => Promise<{
      email: string;
      id: string;
      image: null;
      name: string;
    } | null>
  >(() =>
    Promise.resolve({ email: 'owner@example.com', id: 'user-1', image: null, name: 'Owner' }),
  ),
);

vi.mock('../src/lib/historical-auction-market', () => ({
  loadHistoricalAuctionMarket: () => Promise.resolve(market),
}));

vi.mock('../src/lib/league-team-history', () => ({
  loadLeagueTeamHistory: () => Promise.resolve(teamHistory),
}));

vi.mock('../src/lib/viewer', () => ({
  loadViewer,
}));

vi.mock('../src/app/actions', () => ({
  reconcileTeamIdentityAction: vi.fn<() => Promise<void>>(),
}));

vi.mock('eve/react', () => ({
  useEveAgent: () => ({
    data: { messages: [] },
    cancel: vi.fn<() => Promise<void>>(),
    error: undefined,
    reset: vi.fn<() => void>(),
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

  it('surfaces canonical member history and unresolved identity work', async () => {
    render(await Page());

    fireEvent.click(screen.getByRole('tab', { name: 'League history' }));

    expect(screen.getAllByText('Manager One')).toHaveLength(2);
    expect(screen.getAllByText('Moon Shots')).toHaveLength(2);
    fireEvent.click(screen.getByText('Reconcile 2 unmatched team-seasons'));

    expect(screen.getByRole('combobox', { name: 'Canonical manager for Unknown Team' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Manager One' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Create new manager…' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Assign 2 seasons' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Ask Eve' })).toBeTruthy();
  });

  it('keeps manager history behind the owner session', async () => {
    loadViewer.mockResolvedValueOnce(null);
    render(await Page());

    fireEvent.click(screen.getByRole('tab', { name: 'League history' }));

    expect(screen.getByText('Sign in to view private league history.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign in with GitHub' })).toBeTruthy();
    expect(screen.queryByText('Manager One')).toBeNull();
  });
});
