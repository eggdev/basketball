import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LeagueTeamHistory } from '@fantasy-basketball/database/runtime';
import { TeamHq } from '../src/app/team/team-hq';
import { ownerMemberId, rankLeague, teamForOwner } from '../src/lib/team-hq';
import { teamHqFixture } from './team-hq.fixture';
vi.mock('../src/app/app-shell', () => ({
  AskEveButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
afterEach(cleanup);

describe('Team HQ', () => {
  it('resolves owner identity only through the canonical key', () => {
    const history = {
      members: [
        { canonicalKey: 'someone-else', displayName: 'Clyde', memberId: 'wrong' },
        { canonicalKey: 'clyde', displayName: 'Renamed owner', memberId: 'right' },
      ],
    } as unknown as LeagueTeamHistory;
    expect(ownerMemberId(history)).toBe('right');
    expect(ownerMemberId(null)).toBeNull();
    expect(teamForOwner(teamHqFixture.snapshot?.seasons[0], null)).toBeNull();
    expect(teamForOwner(teamHqFixture.snapshot?.seasons[0], 'member-0')?.teamName).toBe(
      'Our Test Team',
    );
  });
  it('orders negative schedule luck correctly without mutating source results', () => {
    const season = teamHqFixture.performance!.seasons[0];
    expect(rankLeague(season, 'luckWins').map((team) => team.luckWins)).toEqual([2, 0.5, -1, -1.5]);
    expect(season.teams[0].teamName).toBe('Our Test Team');
  });
  it('keeps draft ownership separate from future projections and resets on season changes', () => {
    render(<TeamHq {...teamHqFixture} />);
    expect(screen.getByText(/Ownership is from the 2025-26 draft/).textContent).toContain(
      '2026-27',
    );
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search our roster' }), {
      target: { value: 'Derrick' },
    });
    expect(screen.getByLabelText('Player read: Derrick White')).toBeTruthy();
    expect(screen.queryByLabelText('Player read: Bam Adebayo')).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Team HQ season' }), {
      target: { value: '2026-27' },
    });
    expect(screen.getByText('No roster for this season')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
  it('carries selected rival and season into the trade workflow', () => {
    render(<TeamHq {...teamHqFixture} />);
    fireEvent.click(screen.getByRole('button', { name: 'Lineup volume' }));
    expect(screen.getByRole('button', { name: 'Lineup volume' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(screen.getByRole('button', { name: /Full Court Press/ }));
    const link = screen.getByRole('link', { name: /Compare roster builds/ });
    expect(link.getAttribute('href')).toBe('/trades?season=2025-26&team=team-0&rival=team-2');
    expect(
      within(screen.getByLabelText('Selected rival')).getByRole('heading', {
        name: 'Full Court Press',
      }),
    ).toBeTruthy();
  });
  it('supports tappable and dismissible evidence explanations', () => {
    render(<TeamHq {...teamHqFixture} />);
    const signals = screen.getByLabelText('Derrick White signals');
    const button = within(signals).getByRole('button', { name: 'Evidence and season' });
    fireEvent.click(button);
    expect(button.parentElement?.getAttribute('data-open')).toBe('true');
    expect(
      document.getElementById(button.getAttribute('aria-describedby')!)?.textContent,
    ).toContain('ownership may have changed');
    fireEvent.keyDown(button, { key: 'Escape' });
    expect(button.parentElement?.getAttribute('data-open')).toBe('false');
  });
  it('does not guess a team when owner identity is missing', () => {
    render(<TeamHq {...teamHqFixture} memberId={null} />);
    expect(screen.getByText('Connect your team identity')).toBeTruthy();
    expect(screen.queryByRole('searchbox', { name: 'Search our roster' })).toBeNull();
  });
});
