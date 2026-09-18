import React from 'react';
import type {
  HistoricalAuctionMarket,
  HistoricalRankingSnapshot,
  LatestProjectionSnapshot,
  LeagueRosterSnapshot,
  LeagueTeamHistory,
} from '@fantasy-basketball/database/runtime';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { AppShell, describeEveError, getLatestEveTurnError } from '../src/app/app-shell';
import { ChatMarkdown } from '../src/app/chat-markdown';
import { LeagueView } from '../src/app/league/league-view';
import { ManagersView } from '../src/app/managers/managers-view';
import { PlayersView } from '../src/app/players/players-view';
import { TradesView } from '../src/app/trades/trades-view';
import { WaiversView } from '../src/app/waivers/waivers-view';

const send = vi.hoisted(() => vi.fn<() => Promise<void>>(() => Promise.resolve()));
const eveAgentOptions = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/players',
}));

vi.mock('eve/react', () => ({
  useEveAgent: (options: unknown) => {
    eveAgentOptions.current = options;
    return {
      cancel: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      data: { messages: [] },
      error: undefined,
      events: [],
      reset: vi.fn<() => void>(),
      send,
      status: 'ready',
    };
  },
}));

vi.mock('../src/app/actions', () => ({
  reconcileTeamIdentityAction: vi.fn<() => Promise<void>>(),
}));

const viewer = {
  email: 'owner@example.com',
  id: 'user-1',
  image: null,
  name: 'Owner',
};

const market = {
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
    playerCount: 2,
    purchaseCount: 9,
    seasonCount: 5,
    totalSpendCents: 155_000,
  },
} satisfies HistoricalAuctionMarket;

const rankings = {
  seasons: [
    {
      modelVersion: '1',
      players: [
        {
          auctionCostCents: 8_500,
          components: { assists: 700, points: 1_000 },
          fantasyPoints: 3_400,
          fantasyPointsPerGame: 44.2,
          gamesPlayed: 77,
          playerId: 'player-1',
          playerName: 'Nikola Jokic',
          rank: 1,
        },
        {
          auctionCostCents: null,
          components: { assists: 500, points: 1_200 },
          fantasyPoints: 3_100,
          fantasyPointsPerGame: 41.3,
          gamesPlayed: 75,
          playerId: 'player-2',
          playerName: 'Shai Gilgeous-Alexander',
          rank: 2,
        },
      ],
      ruleSetName: 'League Points',
      ruleSetVersion: 1,
      seasonKey: '2025-26',
    },
  ],
  summary: { latestSeason: '2025-26', playerSeasonCount: 2, seasonCount: 1 },
} satisfies HistoricalRankingSnapshot;

const projections = {
  asOf: '2026-09-18T00:00:00.000Z',
  createdAt: '2026-09-18T00:01:00.000Z',
  modelVersion: 'availability-v1-scoring-v1',
  players: [
    {
      availability: {
        expectedGames: 76,
        expectedGamesMissed: 6,
        rate: 0.927,
        scheduledGames: 82,
        tier: 'durable' as const,
      },
      bonuses: {
        doubleDoubleRate: 0.533,
        expectedDoubleDoubles: 40.5,
        expectedTripleDoubles: 3,
        tripleDoubleRate: 0.039,
      },
      fantasyPoints: 3_600,
      fantasyPointsPerGame: 47.4,
      playerId: 'player-1',
      playerName: 'Nikola Jokic',
      positions: ['C'],
      rank: 1,
      schedule: null,
      teamAbbreviation: 'DEN',
    },
  ],
  seasonKey: '2026-27',
  snapshotId: 'projection-1',
  source: 'hashtag',
  summary: { durablePlayerCount: 1, fragilePlayerCount: 0, playerCount: 1 },
} satisfies LatestProjectionSnapshot;

const rosterSnapshot = {
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
          sourceTeamId: 'team-next',
          spendCents: 0,
          teamName: 'Moon Shots',
          teamSeasonId: 'team-season-next',
        },
      ],
      totalSpendCents: 0,
    },
    {
      baseBudgetCents: 20_000,
      draftedPlayerCount: 2,
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
        {
          baseBudgetBalanceCents: 14_000,
          division: null,
          owner: { displayName: 'Manager Two', memberId: 'member-2' },
          roster: [
            {
              auctionCostCents: 6_000,
              nominationOrder: 2,
              playerId: 'player-3',
              playerName: 'Luka Doncic',
              rosterSlot: 1,
            },
          ],
          rosterCount: 1,
          sourceTeamId: 'team-2',
          spendCents: 6_000,
          teamName: 'Sky Hooks',
          teamSeasonId: 'team-season-2',
        },
      ],
      totalSpendCents: 14_500,
    },
  ],
  summary: {
    latestPopulatedSeason: '2025-26',
    latestSeason: '2026-27',
    seasonCount: 2,
  },
} satisfies LeagueRosterSnapshot;

const teamHistory = {
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
      memberId: 'member-1',
      purchaseCount: 26,
      seasons: [
        {
          averagePriceCents: 1_500,
          identityConfidence: 100,
          identityResolution: 'manager_alias',
          purchaseCount: 13,
          seasonKey: '2025-26',
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
    resolvedTeamSeasonCount: 1,
    seasonCount: 1,
    teamSeasonCount: 2,
    unresolvedTeamSeasonCount: 1,
  },
  unresolvedTeams: [
    {
      seasonKey: '2025-26',
      sourceTeamId: 'team-old',
      teamName: 'Unknown Team',
      teamSeasonId: 'team-season-old',
    },
  ],
} satisfies LeagueTeamHistory;

const renderInShell = (child: React.ReactNode) =>
  render(<AppShell viewer={viewer}>{child}</AppShell>);

describe('route workspace', () => {
  beforeEach(() => {
    window.localStorage.clear();
    eveAgentOptions.current = undefined;
  });

  it('renders Eve output as safe GitHub-flavored Markdown', () => {
    const { container } = render(
      <ChatMarkdown>{`## Draft plan

Target **Nikola Jokic**.

- Cap: \`$92\`
- [Market notes](https://example.com/market)

| Player | Cost |
| --- | ---: |
| Jokic | $92 |

\`\`\`text
Bid with $93 remaining
\`\`\`

<span data-unsafe="true">untrusted HTML</span>`}</ChatMarkdown>,
    );

    expect(screen.getByRole('heading', { name: 'Draft plan' })).toBeTruthy();
    expect(screen.getByText('Nikola Jokic').tagName).toBe('STRONG');
    expect(screen.getByRole('table')).toBeTruthy();
    expect(screen.getByText('Bid with $93 remaining').tagName).toBe('CODE');
    expect(container.querySelector('span[data-unsafe="true"]')).toBeNull();

    const link = screen.getByRole('link', { name: 'Market notes' });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noreferrer noopener');
  });

  it('turns model-provider failures into an actionable Eve message', () => {
    expect(
      describeEveError(new Error('MODEL_CALL_FAILED: AI Gateway customer_verification_required')),
    ).toEqual({
      detail:
        'The model provider rejected this turn. Verify Vercel AI Gateway billing or configure OPENAI_API_KEY, then retry the message.',
      title: 'The model provider is unavailable',
    });
  });

  it('distinguishes a restricted Luna model from generic provider failures', () => {
    expect(
      describeEveError(
        new Error('MODEL_CALL_FAILED: Free tier users do not have access to this model.'),
      ),
    ).toEqual({
      detail:
        'GPT-5.6 Luna requires paid Vercel AI Gateway credits. Top up the Gateway balance, then retry the message.',
      title: 'Luna needs paid Gateway credits',
    });
  });

  it('does not expose an Eve failure when the agent has no error', () => {
    expect(describeEveError(undefined)).toBeNull();
  });

  it('reads recoverable model failures from Eve stream events', () => {
    const error = getLatestEveTurnError([
      {
        data: {
          code: 'MODEL_CALL_FAILED',
          message: 'The model call failed.',
          sequence: 0,
          turnId: 'turn-1',
        },
        meta: { at: '2026-09-18T00:00:00.000Z', id: 'event-1' },
        type: 'turn.failed',
      },
      {
        data: { continuationToken: 'continuation-1', wait: 'next-user-message' },
        meta: { at: '2026-09-18T00:00:00.001Z', id: 'event-2' },
        type: 'session.waiting',
      },
    ]);

    expect(error?.message).toBe('MODEL_CALL_FAILED: The model call failed.');
    expect(describeEveError(error)?.title).toBe('The model provider is unavailable');
  });

  it('renders persistent navigation and route-aware Eve chat', () => {
    renderInShell(<div>Route content</div>);

    expect(screen.getByRole('link', { name: /^League$/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /^Players$/ }).getAttribute('aria-current')).toBe(
      'page',
    );
    expect(screen.getByText('Route content')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'League chat' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'History' })).toBeTruthy();
  });

  it('restores a browser-indexed Eve conversation', () => {
    window.localStorage.setItem(
      'fantasy-basketball:eve-conversations:v1:user-1',
      JSON.stringify({
        activeConversationId: 'chat-1',
        conversations: [
          {
            createdAt: '2026-09-18T12:00:00.000Z',
            events: [],
            id: 'chat-1',
            session: { sessionId: 'eve-session-1', streamIndex: 0 },
            title: 'Auction plan for playoff depth',
            updatedAt: '2026-09-18T12:10:00.000Z',
          },
        ],
        version: 1,
      }),
    );

    renderInShell(<div>Route content</div>);
    fireEvent.click(screen.getByRole('button', { name: 'History' }));

    expect(screen.getByText('Auction plan for playoff depth')).toBeTruthy();
    expect(eveAgentOptions.current).toMatchObject({
      initialEvents: [],
      initialSession: { sessionId: 'eve-session-1', streamIndex: 0 },
      resume: true,
    });
  });

  it('shows canonical owners, roster costs, and pending seasons', () => {
    renderInShell(<LeagueView authenticated snapshot={rosterSnapshot} />);

    expect(screen.getByText('Moon Shots')).toBeTruthy();
    expect(screen.getByText('Manager One')).toBeTruthy();
    expect(screen.getByText('Nikola Jokic')).toBeTruthy();

    fireEvent.change(screen.getByRole('combobox', { name: 'Roster season' }), {
      target: { value: '2026-27' },
    });
    expect(screen.getByText('2026-27 roster pending.')).toBeTruthy();
  });

  it('combines historical rankings with league auction prices', () => {
    renderInShell(<PlayersView market={market} rankings={rankings} />);

    expect(screen.getByText('Historical actuals')).toBeTruthy();
    expect(screen.getByText('44.2')).toBeTruthy();
    expect(screen.getByText('$85')).toBeTruthy();

    fireEvent.change(screen.getByRole('searchbox', { name: 'Find player' }), {
      target: { value: 'Shai' },
    });
    expect(screen.getByText('Shai Gilgeous-Alexander')).toBeTruthy();
    expect(screen.queryByText('Nikola Jokic')).toBeNull();
  });

  it('surfaces availability-adjusted season projections', () => {
    renderInShell(<PlayersView market={market} projections={projections} rankings={rankings} />);

    expect(screen.getByRole('heading', { name: 'Season projection board' })).toBeTruthy();
    expect(screen.getByText('3,600.0')).toBeTruthy();
    expect(screen.getByText('93% · durable')).toBeTruthy();
    expect(screen.getByText(/40.5/)).toBeTruthy();
    expect(screen.getByText('Pending')).toBeTruthy();
  });

  it('links canonical manager cards to detailed profiles', () => {
    renderInShell(<ManagersView authenticated history={teamHistory} />);

    expect(screen.getByRole('heading', { name: 'Manager One' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Profile →' }).getAttribute('href')).toBe(
      '/managers/member-1',
    );
    expect(screen.getByText('Reconcile 1 unmatched team-season')).toBeTruthy();
  });

  it('provides a two-team historical trade comparison', () => {
    renderInShell(<TradesView authenticated snapshot={rosterSnapshot} />);

    expect(screen.getByText('Historical roster lab')).toBeTruthy();
    expect(screen.getByRole('combobox', { name: 'First trade team' })).toBeTruthy();
    expect(screen.getByText('Sky Hooks')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Compare with Eve' })).toBeTruthy();
  });

  it('labels undrafted production as a historical waiver proxy', () => {
    renderInShell(
      <WaiversView
        authenticated
        market={market}
        rankings={rankings}
        rosterSnapshot={rosterSnapshot}
      />,
    );

    expect(screen.getByText('Not the live waiver wire')).toBeTruthy();
    expect(screen.getByText('Shai Gilgeous-Alexander')).toBeTruthy();
    expect(screen.queryByText('Nikola Jokic')).toBeNull();
  });
});
