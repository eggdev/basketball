import { runInNewContext } from 'node:vm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFantraxBridgeScript } from './fantrax-bridge-script';
import { bridgeStateSchema } from './fantrax-bridge';

const leagueId = 'aaaaaaaaaaaaaaaa';
const initial = {
  miscData: {
    draftSettingsId: 'draft1',
    teamAuctionInfoMap: { mine: { budgetRemaining: 200, maxBid: 188, numScorersNeeded: 13 } },
  },
  pickInfo: {
    liveDraftStatusId: '1',
    currentOverallPickNumber: 1,
    nominatedScorerId: 'player1',
    currentBid: 5,
    timeLeft: 15000,
    currentBidderTeamId: 'other',
  },
  rosters: { mine: [] },
};
function install() {
  const socket = new EventTarget();
  const json = { parse: JSON.parse, stringify: JSON.stringify };
  socket.addEventListener('message', event => json.parse((event as MessageEvent).data));
  const target = { closed: false, postMessage: vi.fn<(...args: unknown[]) => void>() };
  const fetcher = vi
    .fn<(...args: unknown[]) => Promise<unknown>>()
    .mockResolvedValue({ ok: true, json: async () => ({ responses: [{ data: initial }] }) });
  const fakeWindow = {
    WebSocket: class extends EventTarget {},
    open: vi.fn<() => typeof target>(() => target),
    addEventListener: vi.fn<() => void>(),
    removeEventListener: vi.fn<() => void>(),
    __basketballDraftBridge: { stop: vi.fn<() => void>() },
  };
  runInNewContext(createFantraxBridgeScript(leagueId, 'mine', 'http://localhost:3000'), {
    window: fakeWindow,
    WebSocket: fakeWindow.WebSocket,
    document,
    location: {
      origin: 'https://www.fantrax.com',
      pathname: '/fantasy/league/' + leagueId + '/draft',
    },
    crypto: { randomUUID: () => 'nonce' },
    AbortController,
    AbortSignal,
    URL,
    setTimeout,
    clearTimeout,
    fetch: fetcher,
    queryObjects: () => undefined,
    JSON: json,
  });
  const button = [...document.querySelectorAll('button')].find(
    (button) => button.textContent === 'Open live copilot',
  );
  button?.click();
  return { socket, target, fetcher, fakeWindow, json };
}

describe('read-only Fantrax console bridge', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('reads auction state and observes a bid without forwarding unrelated socket data', async () => {
    const { socket, target, fetcher, fakeWindow, json } = install();
    await vi.advanceTimersByTimeAsync(1);
    const frame = target.postMessage.mock.calls.at(-1)?.[0];
    expect(bridgeStateSchema.parse(frame.state).teams.mine.maxBidCents).toBe(18800);
    expect(JSON.parse(fetcher.mock.calls[0][1].body).msgs).toEqual([
      { method: 'getLiveDraft', data: {} },
    ]);
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          typeId: '5',
          code: '3',
          data: {
            leagueId,
            dsId: 'draft1',
            pickInfo: { ...initial.pickInfo, currentBid: 9 },
            cookie: 'secret',
          },
        }),
      }),
    );
    const update = target.postMessage.mock.calls.at(-1)?.[0];
    expect(update.state.currentBidCents).toBe(900);
    expect(update.state.source).toBe('socket');
    expect(JSON.stringify(update)).not.toContain('secret');
    const count = target.postMessage.mock.calls.length;
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          typeId: '5',
          code: '3',
          data: { leagueId: 'bbbbbbbbbbbbbbbb', dsId: 'draft1', pickInfo: initial.pickInfo },
        }),
      }),
    );
    expect(target.postMessage).toHaveBeenCalledTimes(count);
    fakeWindow.__basketballDraftBridge.stop();
    expect(json.parse).toBe(JSON.parse);
    socket.dispatchEvent(new MessageEvent('message', { data: '{}' }));
    expect(document.body.textContent).not.toContain('Stop bridge');
  });

  it('does not overwrite a newer socket bid with an older poll response', async () => {
    const { socket, target, fetcher, fakeWindow } = install();
    await vi.advanceTimersByTimeAsync(1);
    let resolve: (value: unknown) => void = () => undefined;
    fetcher.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await vi.advanceTimersByTimeAsync(2000);
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          typeId: '5',
          code: '3',
          data: { leagueId, dsId: 'draft1', pickInfo: { ...initial.pickInfo, currentBid: 11 } },
        }),
      }),
    );
    resolve({
      ok: true,
      json: async () => ({ responses: [{ data: { pickInfo: initial.pickInfo } }] }),
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(target.postMessage.mock.calls.at(-1)?.[0].state.currentBidCents).toBe(1100);
    fakeWindow.__basketballDraftBridge.stop();
  });

  it('marks roster changes uncertain until a fresh complete roster arrives', async () => {
    const { socket, target, fetcher, fakeWindow } = install();
    await vi.advanceTimersByTimeAsync(1);
    fetcher.mockImplementationOnce(() => new Promise(() => undefined));
    socket.dispatchEvent(
      new MessageEvent('message', {
        data: JSON.stringify({
          typeId: '5',
          code: 'r',
          data: {
            leagueId,
            dsId: 'draft1',
            pickInfo: { ...initial.pickInfo, nominatedScorerId: null },
          },
        }),
      }),
    );
    expect(target.postMessage.mock.calls.at(-1)?.[0].state.rosterSyncPending).toBe(true);
    expect(JSON.parse(fetcher.mock.calls.at(-1)?.[1].body).msgs[0].method).toBe('getLiveDraft');
    fakeWindow.__basketballDraftBridge.stop();
  });
});
