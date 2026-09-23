import React from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bridgeVersion, type BridgeState } from '../../../lib/fantrax-bridge';
import type { LiveDraftSnapshot } from '../../../lib/fantrax-live';
import { LiveAuction } from './live-auction';

const state: BridgeState = {
  leagueId: 'aaaaaaaaaaaaaaaa',
  draftId: 'draft1',
  sequence: 1,
  observedAt: Date.now(),
  source: 'socket',
  status: '1',
  nominatedPlayerId: 'p1',
  currentBidCents: 5000,
  bidderTeamId: 'other',
  nominatingTeamId: 'mine',
  timeLeftMs: 15000,
  currentPick: 1,
  rosterSyncPending: false,
  teams: { mine: { budgetCents: 20000, maxBidCents: 18800, remainingSpots: 13 } },
  rosters: [],
};
const snapshot: LiveDraftSnapshot = {
  leagueId: state.leagueId,
  leagueName: 'Test',
  season: 2026,
  draftAt: null,
  providerState: 'running',
  fetchedAt: new Date().toISOString(),
  budgetCents: 20000,
  minimumBidCents: 100,
  incrementCents: 100,
  rosterSize: 13,
  scoringType: 'categories',
  categories: ['PTS'],
  teams: [{ id: 'mine', name: 'My team' }],
  picks: [],
  warnings: [],
  recording: 'saved',
};
const message = async (change: Partial<BridgeState> = {}, nonce = 'test-nonce') => {
  const next = { ...state, observedAt: Date.now(), ...change };
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent('message', {
        origin: 'https://www.fantrax.com',
        source: window,
        data: { type: 'fantasy-basketball:draft-state', nonce, state: next },
      }),
    ),
  );
  return next;
};
const evaluated = (input: BridgeState, name = 'Test Player') => ({
  ok: true,
  json: async () => ({
    version: bridgeVersion(input, 'mine'),
    source: 'jev',
    playerName: name,
    rosterFit: 'useful',
    focus: 'check_value',
    durationMs: 100,
    recording: 'saved',
  }),
});

describe('live auction evaluation lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('opener', window);
    window.location.hash = 'bridge=test-nonce';
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    window.location.hash = '';
  });

  it('records each bid, coalesces bursts, and ignores timer-only updates', async () => {
    const fetcher = vi.fn<(url: string, options: RequestInit) => Promise<unknown>>(
      async (url: string, options: RequestInit) =>
        url.endsWith('/events')
          ? { ok: true, json: async () => ({ recording: 'saved' }) }
          : evaluated(JSON.parse(String(options.body)).state),
    );
    vi.stubGlobal('fetch', fetcher);
    render(<LiveAuction snapshot={snapshot} teamId="mine" paused={false} />);
    await message();
    await message({ sequence: 2, currentBidCents: 5100 });
    await message({ sequence: 3, currentBidCents: 5200 });
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/events'))).toHaveLength(3);
    await act(() => vi.advanceTimersByTimeAsync(151));
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/evaluate'))).toHaveLength(1);
    expect(screen.getByText('Test Player')).toBeTruthy();
    await message({ sequence: 4, currentBidCents: 5200, timeLeftMs: 10000 });
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/evaluate'))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/events'))).toHaveLength(3);
  });

  it('aborts the old evaluation and never displays its late result', async () => {
    let resolveOld: (value: unknown) => void = () => undefined;
    let firstSignal: AbortSignal | null | undefined;
    let evaluations = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, options: RequestInit) => {
        if (url.endsWith('/events')) return Promise.resolve({ ok: true });
        if (++evaluations === 1) {
          firstSignal = options.signal;
          return new Promise((resolve) => {
            resolveOld = resolve;
          });
        }
        return Promise.resolve(evaluated(JSON.parse(String(options.body)).state, 'New Player'));
      }),
    );
    render(<LiveAuction snapshot={snapshot} teamId="mine" paused={false} />);
    const first = await message();
    await act(() => vi.advanceTimersByTimeAsync(151));
    await message({ sequence: 2, nominatedPlayerId: 'p2', currentBidCents: 18800 });
    expect(firstSignal?.aborted).toBe(true);
    expect(
      screen.getByText('Stop bidding. The next bid exceeds your available roster or budget.'),
    ).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(151));
    await act(async () => resolveOld(evaluated(first, 'Old Player')));
    expect(screen.getByText('New Player')).toBeTruthy();
    expect(screen.queryByText('Old Player')).toBeNull();
    await act(() => vi.advanceTimersByTimeAsync(9000));
    expect(screen.getByText('Check Fantrax before acting.')).toBeTruthy();
    expect(screen.queryByText('New Player')).toBeNull();
  });

  it('ignores another league and suppresses model calls while paused', async () => {
    const fetcher = vi
      .fn<(...args: unknown[]) => Promise<unknown>>()
      .mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetcher);
    render(<LiveAuction snapshot={snapshot} teamId="mine" paused />);
    await message({ leagueId: 'bbbbbbbbbbbbbbbb' });
    expect(fetcher).not.toHaveBeenCalled();
    await message();
    await act(() => vi.advanceTimersByTimeAsync(1000));
    expect(fetcher.mock.calls).toHaveLength(1);
    expect(fetcher.mock.calls[0][0]).toBe('/api/draft/live/events');
    expect(screen.getByText('Updates are paused in this room.')).toBeTruthy();
  });

  it('pairs a replacement bridge in the same window and rejects the previous sender token', async () => {
    const fetcher = vi.fn<(url: string, options: RequestInit) => Promise<unknown>>(
      async (url, options) =>
        url.endsWith('/events') ? { ok: true } : evaluated(JSON.parse(String(options.body)).state),
    );
    vi.stubGlobal('fetch', fetcher);
    render(<LiveAuction snapshot={snapshot} teamId="mine" paused={false} />);
    await message({ sequence: 20 });
    await act(() => vi.advanceTimersByTimeAsync(151));
    await act(async () => {
      window.location.hash = 'bridge=replacement';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    expect(screen.getByText('Bridge needed')).toBeTruthy();
    const count = fetcher.mock.calls.length;
    await message({ sequence: 21, currentBidCents: 6000 });
    expect(fetcher.mock.calls).toHaveLength(count);
    await message({ sequence: 1, currentBidCents: 7000 }, 'replacement');
    expect(screen.getByText('$70')).toBeTruthy();
    await act(() => vi.advanceTimersByTimeAsync(151));
    expect(screen.getByText('Test Player')).toBeTruthy();
  });
});
