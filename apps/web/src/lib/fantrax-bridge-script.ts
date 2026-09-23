import { fantraxLeagueId } from './fantrax-live';

// Runs in the user's signed-in Fantrax DevTools console. Relay only allowlisted draft fields.
// Fantrax's socket handler calls JSON.parse for every message. Observe that decoder without
// changing its return value. Polls recover missed messages and fill complete roster state.
export function createFantraxBridgeScript(
  leagueId: string,
  teamId: string,
  localOrigin: string,
): string {
  fantraxLeagueId.parse(leagueId);
  const config = JSON.stringify({ leagueId, teamId, localOrigin });
  return `(() => {
  'use strict';
  const config = ${config};
  if (!['https://www.fantrax.com', 'https://fantrax.com'].includes(location.origin) ||
      !location.pathname.startsWith('/fantasy/league/' + config.leagueId + '/draft')) {
    throw new Error('Run this script in the selected Fantrax draft room.');
  }
  window.__basketballDraftBridge?.stop();
  const nonce = crypto.randomUUID();
  const controller = new AbortController();
  const originalParse = JSON.parse;
  let target, timer, stopped = false, dsId, pickInfo, auctionTeams = {}, rosters = [];
  let sequence = 0, socketRevision = 0, rosterSyncPending = true, lastFull = 0, busy = false;
  let latest = null, failures = 0;
  const panel = document.createElement('div');
  panel.id = 'basketball-draft-bridge';
  panel.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:2147483647;background:#142322;color:#fff;padding:16px;border:1px solid #69cab5;border-radius:12px;max-width:340px;font:14px/1.5 system-ui;box-shadow:0 4px 24px #0005';
  const status = document.createElement('div');
  status.textContent = 'Draft bridge ready. Open the draft room to begin.';
  const open = document.createElement('button');
  open.textContent = 'Open live copilot';
  open.style.cssText = 'margin:10px 8px 0 0;padding:8px;cursor:pointer';
  const stopButton = document.createElement('button');
  stopButton.textContent = 'Stop bridge';
  stopButton.style.cssText = 'padding:8px;cursor:pointer';
  panel.append(status, open, stopButton);
  document.body.append(panel);
  const money = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
  const identifier = value => typeof value === 'string' && value.length ? value : null;
  const count = value => Number.isInteger(value) && value >= 0 ? value : null;
  function publish(source) {
    if (stopped || !pickInfo || !dsId) return;
    latest = {
      leagueId: config.leagueId, draftId: String(dsId), sequence: ++sequence,
      observedAt: Date.now(), source, status: String(pickInfo.liveDraftStatusId),
      nominatedPlayerId: identifier(pickInfo.nominatedScorerId),
      currentBidCents: money(pickInfo.currentBid), bidderTeamId: identifier(pickInfo.currentBidderTeamId),
      nominatingTeamId: identifier(pickInfo.upcomingPickerId),
      timeLeftMs: typeof pickInfo.timeLeft === 'number' ? Math.max(0, pickInfo.timeLeft) : null,
      currentPick: count(pickInfo.currentOverallPickNumber), rosterSyncPending,
      teams: auctionTeams, rosters,
    };
    target?.postMessage({ type: 'fantasy-basketball:draft-state', nonce, state: latest }, config.localOrigin);
    status.textContent = 'Connected: ' + (source === 'socket' ? 'socket event' : 'read request') + ' at ' + new Date().toLocaleTimeString();
  }
  async function read(method, data) {
    const response = await fetch('/fxpa/req?leagueId=' + config.leagueId, {
      method: 'POST', credentials: 'same-origin', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ msgs: [{ method, data }], uiv: 3, refUrl: location.href, dt: 0, at: 0, tz: Intl.DateTimeFormat().resolvedOptions().timeZone }),
    });
    if (!response.ok) throw new Error('Fantrax returned HTTP ' + response.status);
    const body = await response.json();
    const item = body.responses?.[0];
    const errors = item?.errors;
    if (body.pageError || item?.pageError || (Array.isArray(errors) ? errors.length > 0 : !!errors) || !item?.data) throw new Error('Fantrax could not read the draft. Check your login and draft room.');
    return item.data;
  }
  function setRoster(data) {
    const map = data.miscData?.teamAuctionInfoMap;
    if (!map || !data.rosters) throw new Error('Fantrax did not return auction budgets and rosters.');
    const teams = {};
    for (const [id, value] of Object.entries(map).sort(([a], [b]) => a.localeCompare(b))) {
      const budgetCents = money(value.budgetRemaining), maxBidCents = money(value.maxBid), remainingSpots = count(value.numScorersNeeded);
      if (budgetCents === null || maxBidCents === null || remainingSpots === null) throw new Error('An auction budget could not be read.');
      teams[id] = { budgetCents, maxBidCents, remainingSpots };
    }
    const players = [];
    for (const [teamId, rows] of Object.entries(data.rosters)) {
      if (!Array.isArray(rows)) throw new Error('A roster could not be read.');
      for (const row of rows) if (identifier(row.scorerId)) players.push({ teamId, playerId: row.scorerId, priceCents: money(row.auctionInfo?.winningBid) });
    }
    auctionTeams = teams;
    rosters = players.sort((a,b) => (a.teamId + a.playerId).localeCompare(b.teamId + b.playerId));
  }
  async function poll() {
    if (stopped || busy || !target || target.closed) return;
    busy = true;
    const revision = socketRevision;
    try {
      if (!dsId || rosterSyncPending || Date.now() - lastFull > 10000) {
        const data = await read('getLiveDraft', {});
        if (revision !== socketRevision) return;
        if (!data.miscData?.draftSettingsId || !data.pickInfo) throw new Error('Fantrax did not return the current draft state.');
        dsId = data.miscData.draftSettingsId;
        setRoster(data);
        pickInfo = data.pickInfo;
        rosterSyncPending = false;
        lastFull = Date.now();
      } else {
        const data = await read('liveDraft', { function: 'getPickInfo', dsId });
        if (revision !== socketRevision) return;
        if (!data.pickInfo) throw new Error('Fantrax did not return pick information.');
        if (data.pickInfo.currentOverallPickNumber !== pickInfo.currentOverallPickNumber) rosterSyncPending = true;
        pickInfo = data.pickInfo;
      }
      failures = 0;
      publish('poll');
    } catch (error) {
      if (!stopped) {
        failures++;
        status.textContent = error.message;
        target?.postMessage({ type: 'fantasy-basketball:draft-error', nonce, leagueId: config.leagueId, error: error.message }, config.localOrigin);
      }
    } finally {
      busy = false;
      if (!stopped) { clearTimeout(timer); timer = setTimeout(poll, rosterSyncPending ? 500 : Math.min(30000, 2000 * 2 ** Math.min(failures, 4))); }
    }
  }
  function onMessage(message) {
    const data = message.data;
    if (String(message.typeId) !== '5' || data?.leagueId !== config.leagueId || !dsId || String(data.dsId) !== String(dsId)) return;
    const code = String(message.code);
    // Only draft state messages. Never forward chat, cookies, session URLs, or credentials.
    if (!['3', '5', '6', '7', '8', 'q', 'r', 's'].includes(code)) return;
    socketRevision++;
    if (['5','6','7','8','r'].includes(code)) { rosterSyncPending = true; lastFull = 0; }
    if (data.pickInfo) pickInfo = data.pickInfo;
    publish('socket');
    if (rosterSyncPending) { clearTimeout(timer); void poll(); }
  }
  function observeParse(...args) {
    const value = Reflect.apply(originalParse, this, args);
    // An observer failure must never interrupt Fantrax's own message handling.
    try { if (!stopped && value && typeof value === 'object') onMessage(value); } catch { /* recover on next read */ }
    return value;
  }
  JSON.parse = observeParse;
  function receive(event) {
    if (event.origin !== config.localOrigin || event.source !== target || event.data?.nonce !== nonce || event.data?.type !== 'fantasy-basketball:draft-ready') return;
    if (latest) target.postMessage({ type: 'fantasy-basketball:draft-state', nonce, state: latest }, config.localOrigin);
    void poll();
  }
  window.addEventListener('message', receive);
  function stop() {
    stopped = true;
    controller.abort(); clearTimeout(timer);
    if (JSON.parse === observeParse) JSON.parse = originalParse;
    window.removeEventListener('message', receive);
    panel.remove();
  }
  window.__basketballDraftBridge = { stop };
  stopButton.onclick = stop;
  open.onclick = () => {
    const url = new URL('/draft/live', config.localOrigin);
    url.searchParams.set('league', config.leagueId); url.searchParams.set('team', config.teamId);
    url.hash = 'bridge=' + nonce;
    target = window.open(url.href, 'basketball-draft-' + config.leagueId);
    if (!target) { status.textContent = 'Allow this popup, then click Open live copilot again.'; return; }
    void poll();
  };
  return 'Read-only bridge installed. Click Open live copilot in the Fantrax page.';
})();`;
}
