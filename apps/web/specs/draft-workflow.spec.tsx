import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DraftWorkflow } from '../src/app/draft/draft-workflow';
import { SeasonExperienceProvider, SeasonModeControl } from '../src/app/season-experience';
import { TeamHq } from '../src/app/team/team-hq';
import { teamHqFixture } from './team-hq.fixture';
vi.mock('../src/app/app-shell', () => ({
  AskEveButton: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
}));
afterEach(() => {
  cleanup();
  localStorage.clear();
});
const experience = {
  mode: 'preparation' as const,
  seasonKey: '2026-27',
  calendarConfirmed: true,
  preparationStartsOn: '2026-06-14',
  leagueStartsOn: '2026-10-20',
};

describe('draft-first workflow', () => {
  it('preserves a working input while moving between stages and retains scenario parameters', () => {
    window.history.replaceState(null, '', '/draft?plan=example&compare=one,two');
    render(
      <DraftWorkflow
        initialStep="plan"
        selectedName="Balanced"
        plan={
          <label>
            Thesis
            <input defaultValue="Initial" />
          </label>
        }
        targets={<p>Shortlist tools</p>}
        review={<p>Review tools</p>}
        live={<p>Manual bid tools</p>}
        research={<p>Market evidence</p>}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Thesis' }), {
      target: { value: 'Durability first' },
    });
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Draft planning process' })).getByRole(
        'button',
        { name: '2. Build the shortlist' },
      ),
    );
    expect(new URLSearchParams(location.search).get('plan')).toBe('example');
    expect(new URLSearchParams(location.search).get('step')).toBe('targets');
    expect(screen.getByRole('heading', { name: 'Build the shortlist' })).toBeTruthy();
    fireEvent.click(
      within(screen.getByRole('navigation', { name: 'Draft planning process' })).getByRole(
        'button',
        { name: '1. Shape the plan' },
      ),
    );
    expect((screen.getByRole('textbox', { name: 'Thesis' }) as HTMLInputElement).value).toBe(
      'Durability first',
    );
  });
  it('follows route updates and browser history without remounting working inputs', () => {
    window.history.replaceState(null, '', '/draft?step=plan');
    const props = {
      selectedName: 'Balanced',
      plan: <input aria-label="Working thesis" defaultValue="Initial" />,
      targets: null,
      review: null,
      live: null,
      research: null,
    };
    const { rerender } = render(<DraftWorkflow {...props} initialStep="plan" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Unsaved strategy' } });
    window.history.replaceState(null, '', '/draft?step=live');
    rerender(<DraftWorkflow {...props} initialStep="live" />);
    expect(screen.getByRole('heading', { name: 'Draft day' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Review guardrails' }));
    expect(screen.getByRole('heading', { name: 'Review the plan' })).toBeTruthy();
    window.history.replaceState(null, '', '/draft?step=plan');
    rerender(<DraftWorkflow {...props} initialStep="live" />);
    expect(screen.getByRole('heading', { name: 'Shape the plan' })).toBeTruthy();
    fireEvent(window, new PopStateEvent('popstate'));
    expect((screen.getByRole('textbox') as HTMLInputElement).value).toBe('Unsaved strategy');
  });
  it('leads with upcoming scouting instead of historical ownership and allows a manual mode switch', () => {
    render(
      <SeasonExperienceProvider experience={experience}>
        <SeasonModeControl />
        <TeamHq {...teamHqFixture} />
      </SeasonExperienceProvider>,
    );
    expect(screen.getByRole('heading', { name: 'Prepare for 2026-27' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Our roster' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Our targets' }));
    expect(screen.getByText('No players in this view yet')).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Workspace mode' }), {
      target: { value: 'season' },
    });
    expect(screen.getByRole('heading', { name: 'Our roster' })).toBeTruthy();
  });
  it('does not silently present last season projections as the next draft board', () => {
    render(
      <SeasonExperienceProvider experience={{ ...experience, seasonKey: '2027-28' }}>
        <TeamHq {...teamHqFixture} />
      </SeasonExperienceProvider>,
    );
    expect(screen.getByText('Upcoming player estimates are not ready')).toBeTruthy();
    expect(screen.queryByLabelText('Player read: Nikola Jokic')).toBeNull();
  });
});
