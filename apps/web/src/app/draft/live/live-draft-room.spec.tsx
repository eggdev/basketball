import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveDraftSnapshot } from '../../../lib/fantrax-live';
import { LiveDraftRoom } from './live-draft-room';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn<(url: string) => void>() }) }));
const leagueId = 'aaaaaaaaaaaaaaaa';
const base: LiveDraftSnapshot = {
  leagueId,
  leagueName: 'Test auction',
  season: 2026,
  draftAt: '2026-09-23T17:00:00Z',
  providerState: 'running',
  fetchedAt: new Date().toISOString(),
  budgetCents: 20000,
  minimumBidCents: 100,
  incrementCents: 100,
  rosterSize: 13,
  scoringType: 'HEAD_TO_HEAD_ROTI_MULTI_WIN',
  categories: ['PTS', 'AST'],
  teams: [
    { id: 'mine', name: 'My team' },
    { id: 'other', name: 'Other team' },
  ],
  picks: [],
  warnings: [],
  recording: 'saved',
};
const picked: LiveDraftSnapshot = {
  ...base,
  picks: [
    {
      pick: 1,
      playerId: 'p1',
      playerName: 'Test Player',
      position: 'C',
      teamId: 'mine',
      teamName: 'My team',
      priceCents: 6000,
      pickedAt: null,
    },
  ],
};
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });
const flush = () =>
  act(async () => {
    await Promise.resolve();
  });

describe('live draft room', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('updates purchases and corrects a reset without double counting', async () => {
    const fetcher = vi
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValueOnce(response(picked))
      .mockResolvedValueOnce(response(picked))
      .mockResolvedValue(response(base));
    vi.stubGlobal('fetch', fetcher);
    render(<LiveDraftRoom leagueId={leagueId} initialTeamId="mine" viewerId="viewer" />);
    await flush();
    expect(screen.getAllByText('$140').length).toBeGreaterThan(0);
    expect(screen.getAllByText('$129').length).toBeGreaterThan(0);
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getAllByText('$140').length).toBeGreaterThan(0);
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.queryByRole('button', { name: 'Test Player' })).toBeNull();
    expect(screen.getAllByText('$188').length).toBeGreaterThan(0);
  });

  it('keeps the last snapshot on errors and blocks a current budget signal', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<(...args: unknown[]) => Promise<unknown>>()
        .mockResolvedValueOnce(response(picked))
        .mockResolvedValue(response({ error: 'Feed interrupted' }, false)),
    );
    render(<LiveDraftRoom leagueId={leagueId} initialTeamId="mine" viewerId="viewer" />);
    await flush();
    fireEvent.change(screen.getByLabelText('Current bid ($)'), { target: { value: '100' } });
    expect(screen.getByText('This player: within your legal budget.')).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(3000));
    expect(screen.getByText('Feed is stale. Verify your budget in Fantrax.')).toBeTruthy();
    expect(screen.getAllByText('$140').length).toBeGreaterThan(0);
  });

  it('keeps notes separate when the user changes teams', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue(response(base)),
    );
    render(<LiveDraftRoom leagueId={leagueId} initialTeamId="mine" viewerId="viewer" />);
    await flush();
    fireEvent.change(screen.getByLabelText('Notes for this league and team'), {
      target: { value: 'My note' },
    });
    fireEvent.change(screen.getByLabelText('Your team'), { target: { value: 'other' } });
    await flush();
    expect(
      (screen.getByLabelText('Notes for this league and team') as HTMLTextAreaElement).value,
    ).toBe('');
    fireEvent.change(screen.getByLabelText('Your team'), { target: { value: 'mine' } });
    await flush();
    expect(
      (screen.getByLabelText('Notes for this league and team') as HTMLTextAreaElement).value,
    ).toBe('My note');
  });

  it('aborts polling and ignores a late response after unmount', async () => {
    let finish: ((value: unknown) => void) | undefined;
    const fetcher = vi
      .fn<(url: string, options: { signal: AbortSignal }) => Promise<unknown>>()
      .mockImplementation(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
    vi.stubGlobal('fetch', fetcher);
    const mounted = render(
      <LiveDraftRoom leagueId={leagueId} initialTeamId="mine" viewerId="viewer" />,
    );
    await flush();
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    mounted.unmount();
    expect(signal.aborted).toBe(true);
    finish?.(response(picked));
    await flush();
    await act(() => vi.advanceTimersByTimeAsync(10000));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(localStorage.length).toBe(0);
  });
});
