'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import {
  draftTeamState,
  fantraxLeagueId,
  liveDraftStorageKey,
  type LiveDraftSnapshot,
  type SavedLiveLeague,
} from '../../../lib/fantrax-live';
import { formatPrice } from '../../../lib/format';
import styles from '../../workspace.module.css';
import room from './live-draft-room.module.css';
import { LiveAuction } from './live-auction';
import type { DraftModelSummary } from '../../../lib/live-draft-model';

const storageEvent = 'fantasy-basketball:live-room-storage';
function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(storageEvent, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(storageEvent, onChange);
  };
}
function readStorage(key: string) {
  try {
    return window.localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}
function writeStorage(key: string, value: string) {
  window.localStorage.setItem(key, value);
  window.dispatchEvent(new Event(storageEvent));
}
function useStoredText(key: string) {
  return useSyncExternalStore(
    subscribe,
    useCallback(() => readStorage(key), [key]),
    () => '',
  );
}
function parseLeagues(raw: string): SavedLiveLeague[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value)
      ? value.filter(
          (item): item is SavedLiveLeague =>
            item &&
            typeof item.id === 'string' &&
            fantraxLeagueId.safeParse(item.id).success &&
            typeof item.name === 'string' &&
            typeof item.teamId === 'string',
        )
      : [];
  } catch {
    return [];
  }
}
function download(value: unknown, filename: string) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
const dateTime = (date: string) =>
  new Date(date).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  });

export function LiveDraftRoom({
  leagueId,
  initialTeamId,
  viewerId,
  shortcuts = [],
  bridgeEnabled = false,
  modelSummary = null,
}: {
  readonly bridgeEnabled?: boolean;
  readonly modelSummary?: DraftModelSummary | null;
  readonly shortcuts?: ReadonlyArray<SavedLiveLeague>;
  readonly leagueId: string;
  readonly initialTeamId: string;
  readonly viewerId: string;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<LiveDraftSnapshot | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [leagueInput, setLeagueInput] = useState(leagueId);
  const [teamId, setTeamId] = useState(initialTeamId);
  const [nomination, setNomination] = useState('');
  const [bid, setBid] = useState('');
  const [selectedPick, setSelectedPick] = useState<number | null>(null);
  const registryKey = `fantasy-basketball:live-leagues:v1:${viewerId}`;
  const browserLeagues = parseLeagues(useStoredText(registryKey));
  const savedLeagues = [
    ...shortcuts.filter((item) => !browserLeagues.some((saved) => saved.id === item.id)),
    ...browserLeagues,
  ];
  const notesKey = liveDraftStorageKey(viewerId, leagueId, teamId);
  const notes = useStoredText(notesKey);
  const validLeague = fantraxLeagueId.safeParse(leagueId).success;

  // Poll the public feed only while this room is mounted. Cleanup blocks late league responses.
  useEffect(() => {
    if (!validLeague || paused) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      try {
        const response = await fetch(`/api/draft/live?leagueId=${leagueId}`, {
          cache: 'no-store',
          signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Draft feed unavailable.');
        if (controller.signal.aborted) return;
        if (body.leagueId !== leagueId || !Array.isArray(body.picks))
          throw new Error('The feed returned a different league.');
        setSnapshot(body as LiveDraftSnapshot);
        try {
          const previous = parseLeagues(readStorage(registryKey));
          const next = { id: leagueId, name: body.leagueName as string, teamId };
          if (
            !previous.some(
              (item) =>
                item.id === next.id && item.name === next.name && item.teamId === next.teamId,
            )
          ) {
            writeStorage(
              registryKey,
              JSON.stringify([...previous.filter((item) => item.id !== leagueId), next]),
            );
          }
        } catch {
          setStorageError(
            'Saved leagues are unavailable in this browser. Keep this page URL to return to your league.',
          );
        }
        setFeedError(null);
        failures = 0;
      } catch (error) {
        if (controller.signal.aborted) return;
        failures += 1;
        setFeedError(error instanceof Error ? error.message : 'Draft feed unavailable.');
      } finally {
        if (!controller.signal.aborted)
          timer = setTimeout(poll, Math.min(30_000, 3_000 * 2 ** failures));
      }
    };
    void poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [leagueId, paused, validLeague, attempt, registryKey, teamId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const mine = snapshot?.teams.find((team) => team.id === teamId);
  const state = snapshot && mine ? draftTeamState(snapshot, teamId) : null;
  const age =
    snapshot && now ? Math.max(0, Math.floor((now - Date.parse(snapshot.fetchedAt)) / 1000)) : null;
  const snapshotStale = age !== null && age > 15;
  const stale = paused || !!feedError || snapshotStale;
  const waiting =
    snapshot &&
    snapshot.draftAt !== null &&
    (now ?? Date.parse(snapshot.fetchedAt)) < Date.parse(snapshot.draftAt) &&
    snapshot.picks.length === 0;
  const pick = snapshot?.picks.find((item) => item.pick === selectedPick) ?? snapshot?.picks.at(-1);
  const buyerBefore = snapshot && pick ? draftTeamState(snapshot, pick.teamId, pick.pick) : null;
  const bidCents = bid.trim() === '' ? null : Math.round(Number(bid) * 100);
  const bidValid = bidCents !== null && Number.isSafeInteger(bidCents) && bidCents >= 0;

  function openLeague(event: FormEvent) {
    event.preventDefault();
    const id = leagueInput.trim();
    if (!fantraxLeagueId.safeParse(id).success) {
      setFeedError('Enter the 16-character league ID from the Fantrax URL.');
      return;
    }
    const saved = savedLeagues.find((item) => item.id === id);
    router.push(
      `/draft/live?league=${id}${saved?.teamId ? `&team=${encodeURIComponent(saved.teamId)}` : ''}`,
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.pageHeader}>
        <div>
          <p className={room.eyebrow}>FANTRAX / LIVE LEAGUES</p>
          <h1>{snapshot?.leagueName ?? 'Connect a live draft'}</h1>
          <p>
            Follow completed picks and track every team’s budget. Keep this page open during the
            draft.
          </p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.secondaryButton} href="/draft">
            Main league planning
          </Link>
          {validLeague && (
            <a
              className={styles.primaryButton}
              href={`https://www.fantrax.com/fantasy/league/${leagueId}/draft`}
              target="_blank"
              rel="noreferrer"
            >
              Open Fantrax ↗
            </a>
          )}
        </div>
      </header>

      <section className={`${styles.panel} ${room.connectionPanel}`} aria-label="League selection">
        <div className={room.connections}>
          <label className={styles.field}>
            <span>Saved leagues in this browser</span>
            <select
              aria-label="Saved leagues"
              value={savedLeagues.some((item) => item.id === leagueId) ? leagueId : ''}
              onChange={(event) => {
                const selected = savedLeagues.find((item) => item.id === event.target.value);
                if (selected)
                  router.push(
                    `/draft/live?league=${selected.id}&team=${encodeURIComponent(selected.teamId)}`,
                  );
              }}
            >
              <option value="" disabled>
                Select a league
              </option>
              {savedLeagues.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <form className={room.connectForm} onSubmit={openLeague}>
            <label className={styles.field}>
              <span>Fantrax league ID</span>
              <input
                value={leagueInput}
                onChange={(event) => setLeagueInput(event.target.value)}
                placeholder="16-character league ID"
                maxLength={16}
                required
              />
            </label>
            <button className={styles.secondaryButton} type="submit">
              Connect league
            </button>
          </form>
          <label className={styles.field}>
            <span>Your team</span>
            <select
              aria-label="Your team"
              value={teamId}
              onChange={(event) => {
                const id = event.target.value;
                setTeamId(id);
                window.history.replaceState(
                  null,
                  '',
                  `/draft/live?league=${leagueId}&team=${encodeURIComponent(id)}${window.location.hash}`,
                );
              }}
            >
              <option value="">Choose your team</option>
              {snapshot?.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className={room.caption}>
          League selection applies to this live room. Research and saved plans still use the main
          league.
        </p>
      </section>

      <output className={room.feedBar}>
        <span className={`${room.dot} ${stale ? room.offline : ''}`} />
        <strong>
          {paused
            ? 'Polling paused'
            : feedError
              ? 'Connection interrupted'
              : snapshotStale
                ? 'Feed stale · check Fantrax'
                : snapshot
                  ? waiting
                    ? 'Connected · awaiting start'
                    : 'Connected · completed picks'
                  : validLeague
                    ? 'Connecting to Fantrax'
                    : 'Enter a league to connect'}
        </strong>
        <span>
          {snapshot
            ? `Last checked ${dateTime(snapshot.fetchedAt)}${age !== null ? ` · ${age}s ago` : ''}`
            : 'Updates every 3 seconds'}
        </span>
        {validLeague && (
          <div className={room.feedActions}>
            <button
              className={styles.secondaryButton}
              onClick={() => {
                setPaused(false);
                setAttempt((value) => value + 1);
              }}
            >
              Refresh now
            </button>
            <button className={styles.secondaryButton} onClick={() => setPaused((value) => !value)}>
              {paused ? 'Resume' : 'Pause'}
            </button>
          </div>
        )}
      </output>
      {feedError && (
        <p className={styles.warning} role="alert">
          {feedError} {snapshot ? 'Displayed budgets use the last successful check.' : ''}
        </p>
      )}
      {storageError && (
        <p className={styles.warning} role="alert">
          {storageError}
        </p>
      )}
      {teamId && snapshot && !mine && (
        <p className={styles.warning}>
          The selected team does not belong to this league. Choose your team above.
        </p>
      )}

      {snapshot && (
        <>
          {!bridgeEnabled && (
            <p className={styles.warning}>
              Sign in to connect live nominations and generated rankings.
            </p>
          )}
          {bridgeEnabled && (
            <LiveAuction
              key={`${leagueId}:${teamId}`}
              snapshot={snapshot}
              teamId={teamId}
              paused={paused}
              modelSummary={modelSummary}
            />
          )}
          <div className={room.rules}>
            <strong>
              {snapshot.teams.length} teams · {snapshot.rosterSize} players ·{' '}
              {formatPrice(snapshot.budgetCents)} budget
            </strong>
            <span>
              Minimum {formatPrice(snapshot.minimumBidCents)} · increment{' '}
              {formatPrice(snapshot.incrementCents)} · start{' '}
              {snapshot.draftAt ? dateTime(snapshot.draftAt) : 'not scheduled'}
            </span>
            <span>
              {snapshot.scoringType.includes('ROTI')
                ? 'Head-to-head categories'
                : snapshot.scoringType.includes('POINTS')
                  ? 'Head-to-head points'
                  : 'Check scoring rules in Fantrax'}{' '}
              · {snapshot.categories.join(' / ')}
            </span>
          </div>
          <div className={`${styles.warning} ${room.modelNotice}`}>
            <strong>Scoring model needs review</strong>
            <p>
              This feed reports {snapshot.categories.length} scoring categories. Main league prices
              use custom points and a $0 floor.
            </p>
            <p>
              The cap below uses this league’s budget rules. Player value recommendations need a
              model for this league.
            </p>
          </div>
          <div className={room.metrics}>
            <div>
              <span>Completed picks</span>
              <strong>
                {snapshot.picks.length}
                <small> / {snapshot.teams.length * snapshot.rosterSize}</small>
              </strong>
            </div>
            <div>
              <span>{mine?.name ?? 'Your team'} · budget left</span>
              <strong>{state ? formatPrice(state.remainingBudgetCents) : 'Choose team'}</strong>
            </div>
            <div>
              <span>Your roster</span>
              <strong>
                {state ? `${state.picks.length} / ${snapshot.rosterSize}` : 'Choose team'}
              </strong>
            </div>
            <div>
              <span>Legal maximum bid{stale ? ' · stale' : ''}</span>
              <strong>{state ? formatPrice(state.maxBidCents) : 'Choose team'}</strong>
            </div>
          </div>
          <div className={room.columns}>
            <section className={`${styles.panel} ${room.bodyPanel}`}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Pick by pick</h2>
                  <p>Select a purchase to inspect its budget impact.</p>
                </div>
                <span className={styles.badge}>{snapshot.picks.length} picks</span>
              </header>
              {snapshot.picks.length === 0 ? (
                <div className={room.empty}>
                  <strong>
                    {waiting ? 'Ready for the first nomination' : 'No completed picks reported'}
                  </strong>
                  <p>
                    Fantrax’s public feed reports completed purchases. Connect the live bridge above
                    for nominations and bids, or use the manual budget check below.
                  </p>
                  <p>
                    Provider state: {snapshot.providerState}. This label can appear before the
                    scheduled start.
                  </p>
                </div>
              ) : (
                <div className={room.tableScroll}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Pick</th>
                        <th>Player</th>
                        <th>Team</th>
                        <th>Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...snapshot.picks].reverse().map((item) => (
                        <tr key={item.pick} className={item.teamId === teamId ? room.myPick : ''}>
                          <td>{item.pick}</td>
                          <td>
                            <button
                              className={room.pickButton}
                              onClick={() => setSelectedPick(item.pick)}
                            >
                              {item.playerName}
                            </button>
                            <small className={room.position}>{item.position}</small>
                          </td>
                          <td>{item.teamName}</td>
                          <td>{formatPrice(item.priceCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {pick && buyerBefore && (
                <article className={room.pickDetail} aria-label="Pick analysis">
                  <h3>
                    Pick {pick.pick}: {pick.playerName}
                  </h3>
                  <p>
                    {pick.teamName} spent {formatPrice(pick.priceCents)} from a{' '}
                    {formatPrice(buyerBefore.remainingBudgetCents)} budget.
                  </p>
                  <p>
                    After this pick:{' '}
                    {formatPrice(buyerBefore.remainingBudgetCents - pick.priceCents)} and{' '}
                    {buyerBefore.remainingSpots - 1} open roster spots.
                  </p>
                  <p>Legal maximum before the pick: {formatPrice(buyerBefore.maxBidCents)}.</p>
                  {pick.priceCents > buyerBefore.maxBidCents && (
                    <p className={styles.warning}>
                      This purchase exceeds the derived cap. Check Fantrax for keepers or budget
                      adjustments.
                    </p>
                  )}
                </article>
              )}
            </section>
            <section className={`${styles.panel} ${room.bodyPanel}`}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Room budgets</h2>
                  <p>Assumes equal starting budgets and empty rosters.</p>
                </div>
              </header>
              <div className={room.tableScroll}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Team</th>
                      <th>Left</th>
                      <th>Spots</th>
                      <th>Max bid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.teams.map((team) => {
                      const current = draftTeamState(snapshot, team.id);
                      return (
                        <tr key={team.id} className={team.id === teamId ? room.myPick : ''}>
                          <th scope="row">
                            {team.name}
                            {team.id === teamId ? ' (you)' : ''}
                          </th>
                          <td>{formatPrice(current.remainingBudgetCents)}</td>
                          <td>{current.remainingSpots}</td>
                          <td>{formatPrice(current.maxBidCents)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
          <div className={room.columns}>
            <section className={`${styles.panel} ${room.bodyPanel}`}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Current nomination</h2>
                  <p>Enter the name and price from your Fantrax draft tab.</p>
                </div>
                <span className={styles.badge}>Manual</span>
              </header>
              <div className={room.nomination}>
                <label className={styles.field}>
                  <span>Player name</span>
                  <input
                    value={nomination}
                    onChange={(event) => setNomination(event.target.value)}
                    placeholder="Player up for auction"
                  />
                </label>
                <label className={styles.field}>
                  <span>Current bid ($)</span>
                  <input
                    type="number"
                    min={snapshot.minimumBidCents / 100}
                    step={snapshot.incrementCents / 100 || 1}
                    value={bid}
                    onChange={(event) => setBid(event.target.value)}
                  />
                </label>
              </div>
              <div className={room.pickDetail} aria-live="polite">
                <strong>
                  {!state
                    ? 'Choose your team to check the bid.'
                    : stale
                      ? 'Feed is stale. Verify your budget in Fantrax.'
                      : !bidValid
                        ? 'Enter the current bid.'
                        : state.remainingSpots <= 0
                          ? 'Your roster is full.'
                          : bidCents < snapshot.minimumBidCents
                            ? 'The bid is below this league’s minimum.'
                            : bidCents > state.maxBidCents
                              ? 'Stop: this bid exceeds your legal budget.'
                              : `${nomination || 'This player'}: within your legal budget.`}
                </strong>
                {state && (
                  <p>
                    Reserve {formatPrice(state.reserveCents)} for the remaining slots. A legal bid
                    does not establish player value.
                  </p>
                )}
              </div>
            </section>
            <section className={`${styles.panel} ${room.bodyPanel}`}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Your roster</h2>
                  <p>{mine?.name ?? 'Choose your team above.'}</p>
                </div>
              </header>
              {state?.picks.length ? (
                <ul className={room.roster}>
                  {state.picks.map((item) => (
                    <li key={item.playerId}>
                      <span>
                        {item.playerName} <small>{item.position}</small>
                      </span>
                      <strong>{formatPrice(item.priceCents)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={room.caption}>Your completed purchases will appear here.</p>
              )}
            </section>
          </div>
          <section className={`${styles.panel} ${room.bodyPanel}`}>
            <header className={styles.panelHeader}>
              <div>
                <h2>Evaluation notes</h2>
                <p>Record missing data, slow updates, and decisions to review after the draft.</p>
              </div>
              <span className={styles.badge}>
                {snapshot.recording === 'saved'
                  ? 'Local capture active'
                  : bridgeEnabled
                    ? 'Signed-in bridge capture'
                    : 'Capture ' + snapshot.recording}
              </span>
            </header>
            <label className={styles.field}>
              <span>Notes for this league and team</span>
              <textarea
                rows={4}
                value={notes}
                onChange={(event) => {
                  try {
                    writeStorage(notesKey, event.target.value);
                  } catch {
                    setStorageError('Notes could not be saved to browser storage.');
                  }
                }}
                placeholder="Pick number, observation, expected behavior…"
              />
            </label>
            <div className={room.exports}>
              <button
                className={styles.secondaryButton}
                onClick={() =>
                  download(
                    {
                      exportedAt: new Date().toISOString(),
                      selectedTeamId: teamId,
                      snapshot,
                      notes,
                      nomination: { player: nomination, bid },
                    },
                    `draft-review-${leagueId}.json`,
                  )
                }
              >
                Download review
              </button>
              {(snapshot.recording === 'saved' || bridgeEnabled) && (
                <a
                  className={styles.secondaryButton}
                  href={`/api/draft/live?leagueId=${leagueId}&export=1`}
                >
                  Download capture history
                </a>
              )}
              <span className={room.caption}>
                Snapshots include corrections and resets. Capture runs while this room polls.
              </span>
            </div>
          </section>
          {snapshot.warnings.map((warning) => (
            <p className={styles.warning} key={warning}>
              {warning}
            </p>
          ))}
          <p className={room.caption}>
            Public Fantrax results · checked every 3 seconds · publication delay is unknown · bids
            stay in Fantrax.
          </p>
        </>
      )}
    </div>
  );
}
