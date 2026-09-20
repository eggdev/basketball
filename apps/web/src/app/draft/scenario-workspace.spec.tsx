import React from 'react';
import type {
  PreDraftPlan,
  PreDraftScenarioDetailsInput,
  PreDraftWorkspace,
} from '@fantasy-basketball/database/runtime';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';

import { ScenarioTargetWorkspace, ScenarioWorkspace } from './scenario-workspace';

const push = vi.hoisted(() =>
  vi.fn<(href: string, options?: { readonly scroll?: boolean }) => void>(),
);

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () =>
    new URLSearchParams(
      'plan=00000000-0000-4000-8000-000000000102&compare=00000000-0000-4000-8000-000000000101,00000000-0000-4000-8000-000000000102',
    ),
}));

vi.mock('../actions', () => ({
  activatePreDraftScenarioAction: vi.fn<() => void>(),
  archivePreDraftScenarioAction: vi.fn<() => void>(),
  createPreDraftScenarioAction: vi.fn<() => void>(),
  duplicatePreDraftScenarioAction: vi.fn<() => void>(),
  savePreDraftTargetAction: vi.fn<() => void>(),
  updatePreDraftScenarioAction: vi.fn<() => void>(),
}));

vi.mock('../app-shell', () => ({
  AskEveButton: ({ children }: { readonly children: React.ReactNode }) => (
    <button type="button">{children}</button>
  ),
}));

const activeId = '00000000-0000-4000-8000-000000000101';
const previewId = '00000000-0000-4000-8000-000000000102';
const playerId = '00000000-0000-4000-8000-000000000201';

const plan = (overrides: Partial<PreDraftPlan>): PreDraftPlan => ({
  anchorBudgetCents: 8_000,
  coreBudgetCents: 9_000,
  createdAt: '2026-09-18T00:00:00.000Z',
  endgameBudgetCents: 3_000,
  id: activeId,
  name: 'Balanced build',
  notes: 'Preserve options.',
  primaryGoal: 'make-playoffs',
  riskTolerance: 'balanced',
  status: 'active',
  strategyAngle: 'Keep the middle game flexible.',
  streamingSlots: 1,
  targets: [
    {
      maxBidCents: 7_200,
      playerId,
      playerName: 'Player One',
      priority: 1,
      rationale: 'League discount',
      stance: 'target',
      targetId: '00000000-0000-4000-8000-000000000301',
    },
  ],
  updatedAt: '2026-09-18T00:00:00.000Z',
  ...overrides,
});

const activePlan = plan({});
const previewPlan = plan({
  anchorBudgetCents: 11_000,
  createdAt: '2026-09-19T00:00:00.000Z',
  id: previewId,
  name: 'Stars and streamers',
  status: 'draft',
  strategyAngle: 'Buy two anchors and churn the final slot.',
  targets: [
    {
      maxBidCents: 8_400,
      playerId,
      playerName: 'Player One',
      priority: 1,
      rationale: 'Primary anchor',
      stance: 'watch',
      targetId: '00000000-0000-4000-8000-000000000302',
    },
  ],
});

const workspace: PreDraftWorkspace = {
  activePlan,
  activePlanId: activeId,
  league: { baseBudgetCents: 20_000, rosterSize: 13, seasonKey: '2026-27', teamCount: 12 },
  owner: {
    canonicalKey: 'clyde',
    displayName: 'Brendan',
    memberId: '00000000-0000-4000-8000-000000000401',
    teamName: 'Moon Shots',
  },
  plans: [activePlan, previewPlan],
  selectedPlan: previewPlan,
};

const defaults: PreDraftScenarioDetailsInput = {
  anchorBudgetCents: 8_000,
  coreBudgetCents: 9_000,
  endgameBudgetCents: 3_000,
  name: 'Balanced build',
  notes: '',
  primaryGoal: 'make-playoffs',
  riskTolerance: 'balanced',
  strategyAngle: 'Keep the middle game flexible.',
  streamingSlots: 1,
};

describe('draft scenario workspace', () => {
  beforeEach(() => push.mockClear());

  it('keeps preview and active live context visibly distinct after a route refresh', () => {
    render(
      <ScenarioWorkspace
        comparePlanIds={[activeId, previewId]}
        defaults={defaults}
        seasonKey="2026-27"
        workspace={workspace}
      />,
    );

    expect(screen.getByText('Previewing Stars and streamers')).toBeTruthy();
    expect(screen.getByText(/Balanced build remains active/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Make active' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Archive' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Workshop with Eve' })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Balanced build/ })).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: /Stars and streamers/ })).toBeTruthy();
    expect(screen.getByText('watch · $84')).toBeTruthy();
  });

  it('routes selection through the plan query parameter without changing activation', () => {
    render(
      <ScenarioWorkspace
        comparePlanIds={[activeId, previewId]}
        defaults={defaults}
        seasonKey="2026-27"
        workspace={workspace}
      />,
    );

    fireEvent.change(screen.getByLabelText('Selected scenario'), { target: { value: activeId } });
    expect(push).toHaveBeenCalledWith(
      `/draft?plan=${activeId}&compare=${activeId}%2C${previewId}`,
      { scroll: false },
    );
  });

  it('scopes target editing to the selected preview plan', () => {
    render(
      <ScenarioTargetWorkspace
        adpBoard={[
          { playerId, playerName: 'Player One', position: 'PG', rank: 1 },
          {
            playerId: '00000000-0000-4000-8000-000000000202',
            playerName: 'Player Two',
            position: 'C',
            rank: 2,
          },
        ]}
        plan={previewPlan}
        seasonKey="2026-27"
      />,
    );

    expect(screen.getByRole('option', { name: '2. Player Two (C)' })).toBeTruthy();
    expect(screen.queryByRole('option', { name: '1. Player One (PG)' })).toBeNull();
    const form = screen.getByRole('button', { name: 'Add to scenario' }).closest('form');
    expect(form?.querySelector<HTMLInputElement>('input[name="planId"]')?.value).toBe(previewId);
    expect(screen.getByText('watch · $84')).toBeTruthy();
  });
});
