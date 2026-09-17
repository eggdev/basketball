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

const rosterSnapshot = vi.hoisted(() => ({
  seasons: [
    {
      baseBudgetCents: 20_000,
      draftedPlayerCount: 0,
      name: 'Fantasy Basketball 2026-27',
      rosterSize: 13,
      rosterStatus: 'empty' as const,
      seasonKey: '2026-27',
      teamCount: 12,
      teams: [
        {
          baseBudgetBalanceCents: 20_000,
          division: null,
          owner: { displayName: 'Manager One', memberId: 'member-1' },
          roster: [],
          rosterCount: 0,
          sourceTeamId: 'team-2',
          spendCents: 0,
          teamName: 'Moon Shots',
          teamSeasonId: 'team-season-2',
        },
      ],
      totalSpendCents: 0,
    },
    {
      baseBudgetCents: 20_000,
      draftedPlayerCount: 1,
      name: 'Fantasy Basketball 2025-26',
      rosterSize: 13,
      rosterStatus: 'partial' as const,
      seasonKey: '2025-26',
      teamCount: 12,
      teams: [
        {
          baseBudgetBalanceCents: 11_500,
          division: null,
          owner: { displayName: 'Manager One', memberId: 'member-1' },
          roster: [
            {
              auctionCostCents: 8_500,
              nominationOrder: 1,
              playerId: 'player-1',
              playerName: 'Nikola Jokic',
              rosterSlot: 1,
            },
          ],
          rosterCount: 1,
          sourceTeamId: 'team-1',
          spendCents: 8_500,
          teamName: 'Moon Shots',
          teamSeasonId: 'team-season-1',
        },
      ],
      totalSpendCents: 8_500,
    },
  ],
  summary: {
    latestPopulatedSeason: '2025-26',
    latestSeason: '2026-27',
    seasonCount: 2,
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

vi.mock('../src/lib/league-rosters', () => ({
  loadLeagueRosters: () => Promise.resolve(rosterSnapshot),
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
  it('renders league rosters beside chat and keeps the historical market available', async () => {
    const { baseElement } = render(await Page());

    expect(baseElement).toBeTruthy();
    expect(baseElement.textContent).toContain('League rosters');
    expect(baseElement.textContent).toContain('Draft chat');
    expect(baseElement.textContent).toContain('Nikola Jokic');

    fireEvent.click(screen.getByRole('tab', { name: 'Player market' }));

    expect(baseElement.textContent).toContain('Historical player market');
    expect(baseElement.textContent).toContain('$10,803');
  });

  it('filters the historical market by player name', async () => {
    render(await Page());

    fireEvent.click(screen.getByRole('tab', { name: 'Player market' }));

    fireEvent.change(screen.getByRole('searchbox', { name: 'Find player' }), {
      target: { value: 'Shai' },
    });

    expect(screen.getByText('Shai Gilgeous-Alexander')).toBeTruthy();
    expect(screen.queryByText('Nikola Jokic')).toBeNull();
  });

  it('shows canonical owners, season rosters, and pending future rosters', async () => {
    render(await Page());

    expect(
      (screen.getByRole('combobox', { name: 'Roster season' }) as HTMLSelectElement).value,
    ).toBe('2025-26');
    expect(screen.getByText('Moon Shots')).toBeTruthy();
    expect(screen.getByText('Manager One')).toBeTruthy();
    expect(screen.getByText('Nikola Jokic')).toBeTruthy();
    expect(screen.getAllByText('$85')).toHaveLength(3);
    expect(screen.getByText('1/13')).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox', { name: 'Roster season' }), {
      target: { value: '2026-27' },
    });

    expect(screen.getByText('2026-27 teams are ready.')).toBeTruthy();
    expect(screen.getByText('Roster awaiting import')).toBeTruthy();
  });

  it('surfaces canonical member history and unresolved identity work', async () => {
    render(await Page());

    fireEvent.click(screen.getByRole('tab', { name: 'League history' }));

    expect(screen.getAllByText('Manager One')).toHaveLength(2);
    expect(screen.getAllByText('Moon Shots')).toHaveLength(2);
    fireEvent.click(screen.getByText('Reconcile 2 unmatched team-seasons'));

    expect(
      screen.getByRole('combobox', { name: 'Canonical manager for Unknown Team' }),
    ).toBeTruthy();
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
