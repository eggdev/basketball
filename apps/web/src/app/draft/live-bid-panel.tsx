'use client';

import { useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';

import type { LiveBidDecision } from '../../lib/live-bid-evaluator';
import { formatPrice } from '../../lib/format';
import { AskEveButton } from '../app-shell';
import styles from '../workspace.module.css';

interface DraftPlayerOption {
  readonly fantasyPointsPerGame: number;
  readonly id: string;
  readonly name: string;
  readonly positions: ReadonlyArray<string>;
  readonly rank: number;
}

interface DraftedPlayer {
  readonly playerId: string;
  readonly playerName: string;
  readonly priceCents: number;
}

interface DraftSession {
  readonly history: ReadonlyArray<LiveBidDecision>;
  readonly ownedPlayers: ReadonlyArray<DraftedPlayer>;
  readonly remainingBudgetCents: number;
  readonly remainingRosterSpots: number;
}

const storageKey = 'fantasy-basketball:live-draft:v1';

const actionLabel = {
  caution: 'Caution',
  'keep-bidding': 'Keep bidding',
  review: 'Review',
  stop: 'Stop',
} as const;

const signalLabel = {
  'at-value': 'At value',
  'over-value': 'Over value',
  'under-value': 'Under value',
} as const;

const actionClass = (action: LiveBidDecision['action']): string =>
  action === 'keep-bidding'
    ? styles.livePositive
    : action === 'stop'
      ? styles.liveNegative
      : styles.liveCaution;

const parseSession = (raw: string, fallback: DraftSession): DraftSession => {
  try {
    if (raw.length === 0) return fallback;
    const parsed = JSON.parse(raw) as Partial<DraftSession>;
    if (
      !Number.isSafeInteger(parsed.remainingBudgetCents) ||
      (parsed.remainingBudgetCents ?? -1) < 0 ||
      !Number.isSafeInteger(parsed.remainingRosterSpots) ||
      (parsed.remainingRosterSpots ?? -1) < 0 ||
      !Array.isArray(parsed.ownedPlayers) ||
      !Array.isArray(parsed.history)
    ) {
      return fallback;
    }
    return parsed as DraftSession;
  } catch {
    return fallback;
  }
};

const subscribeToSession = (onChange: () => void): (() => void) => {
  window.addEventListener(storageKey, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(storageKey, onChange);
    window.removeEventListener('storage', onChange);
  };
};

const readSession = (): string => window.localStorage.getItem(storageKey) ?? '';
const readServerSession = (): string => '';

const saveSession = (session: DraftSession): void => {
  window.localStorage.setItem(storageKey, JSON.stringify(session));
  window.dispatchEvent(new Event(storageKey));
};

export function LiveBidPanel({
  baseBudgetCents,
  players,
  rosterSize,
}: {
  readonly baseBudgetCents: number;
  readonly players: ReadonlyArray<DraftPlayerOption>;
  readonly rosterSize: number;
}) {
  const initialSession = useMemo<DraftSession>(
    () => ({
      history: [],
      ownedPlayers: [],
      remainingBudgetCents: baseBudgetCents,
      remainingRosterSpots: rosterSize,
    }),
    [baseBudgetCents, rosterSize],
  );
  const serializedSession = useSyncExternalStore(
    subscribeToSession,
    readSession,
    readServerSession,
  );
  const session = useMemo(
    () => parseSession(serializedSession, initialSession),
    [initialSession, serializedSession],
  );
  const [selectedPlayerId, setSelectedPlayerId] = useState(players[0]?.id ?? '');
  const [currentPrice, setCurrentPrice] = useState('0');
  const [evaluation, setEvaluation] = useState<LiveBidDecision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const version = useRef(0);

  const ownedIds = useMemo(
    () => new Set(session.ownedPlayers.map((player) => player.playerId)),
    [session.ownedPlayers],
  );
  const availablePlayers = players.filter((player) => !ownedIds.has(player.id));
  const activePlayerId = ownedIds.has(selectedPlayerId)
    ? (availablePlayers[0]?.id ?? '')
    : selectedPlayerId;
  const selectedPlayer = players.find((player) => player.id === activePlayerId) ?? null;

  const evaluate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const currentPriceCents = Math.round(Number(currentPrice) * 100);
    if (!Number.isSafeInteger(currentPriceCents) || currentPriceCents < 0) {
      setError('Enter a valid non-negative bid.');
      return;
    }
    if (activePlayerId.length === 0 || session.remainingRosterSpots < 1) {
      setError('Select a player and make sure at least one roster spot remains.');
      return;
    }

    setPending(true);
    setError(null);
    version.current += 1;
    try {
      const response = await fetch('/api/draft/evaluate', {
        body: JSON.stringify({
          currentPriceCents,
          draftStateVersion: `manual-${version.current}-${Date.now()}`,
          ownedPlayerIds: session.ownedPlayers.map((player) => player.playerId),
          playerId: activePlayerId,
          remainingBudgetCents: session.remainingBudgetCents,
          remainingRosterSpots: session.remainingRosterSpots,
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const responseBody = (await response.json()) as unknown;
      if (!response.ok) {
        const message =
          typeof responseBody === 'object' &&
          responseBody !== null &&
          'error' in responseBody &&
          typeof responseBody.error === 'string'
            ? responseBody.error
            : 'The bid could not be evaluated.';
        throw new Error(message);
      }
      const result = responseBody as LiveBidDecision;
      setEvaluation(result);
      saveSession({
        ...session,
        history: [result, ...session.history].slice(0, 20),
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The bid could not be evaluated.');
    } finally {
      setPending(false);
    }
  };

  const recordWin = () => {
    if (
      evaluation === null ||
      ownedIds.has(evaluation.player.id) ||
      session.remainingRosterSpots < 1 ||
      evaluation.market.currentPriceCents > session.remainingBudgetCents
    ) {
      return;
    }
    saveSession({
      ...session,
      ownedPlayers: [
        ...session.ownedPlayers,
        {
          playerId: evaluation.player.id,
          playerName: evaluation.player.name,
          priceCents: evaluation.market.currentPriceCents,
        },
      ],
      remainingBudgetCents: session.remainingBudgetCents - evaluation.market.currentPriceCents,
      remainingRosterSpots: session.remainingRosterSpots - 1,
    });
  };

  const removePlayer = (playerId: string) => {
    const player = session.ownedPlayers.find((candidate) => candidate.playerId === playerId);
    if (player === undefined) return;
    saveSession({
      ...session,
      ownedPlayers: session.ownedPlayers.filter((candidate) => candidate.playerId !== playerId),
      remainingBudgetCents: session.remainingBudgetCents + player.priceCents,
      remainingRosterSpots: Math.min(rosterSize, session.remainingRosterSpots + 1),
    });
  };

  const evePrompt =
    evaluation === null
      ? ''
      : `Review the live bid on ${evaluation.player.name} at ${formatPrice(evaluation.market.currentPriceCents)}. The engine says ${actionLabel[evaluation.action].toLocaleLowerCase()}, with a ${formatPrice(evaluation.personal.maxBidCents)} personal cap and ${signalLabel[evaluation.market.priceSignal].toLocaleLowerCase()} market signal. Explain the fit for my current plan and tell me what would change your recommendation.`;

  return (
    <section className={`${styles.panel} ${styles.liveBidPanel}`}>
      <header className={styles.panelHeader}>
        <div>
          <h2>Live bid copilot</h2>
          <p>Manual shadow mode · deterministic cap · Jev fit check · no Fantrax actions</p>
        </div>
        <span className={`${styles.statusBadge} ${styles.statusReady}`}>Read only</span>
      </header>
      <div className={styles.liveBidLayout}>
        <div className={styles.liveBidControls}>
          <form className={styles.liveBidForm} onSubmit={evaluate}>
            <label className={`${styles.field} ${styles.liveBidPlayerField}`}>
              <span>Player up for auction</span>
              <select
                onChange={(event) => {
                  setSelectedPlayerId(event.target.value);
                  setEvaluation(null);
                }}
                value={activePlayerId}
              >
                {availablePlayers.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.rank}. {player.name} · {player.positions.join('/')} ·{' '}
                    {player.fantasyPointsPerGame.toFixed(1)} FPPG
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Current bid ($)</span>
              <input
                min="0"
                onChange={(event) => setCurrentPrice(event.target.value)}
                step="1"
                type="number"
                value={currentPrice}
              />
            </label>
            <label className={styles.field}>
              <span>Budget left ($)</span>
              <input
                min="0"
                onChange={(event) =>
                  saveSession({
                    ...session,
                    remainingBudgetCents: Math.max(0, Math.round(Number(event.target.value) * 100)),
                  })
                }
                step="1"
                type="number"
                value={session.remainingBudgetCents / 100}
              />
            </label>
            <label className={styles.field}>
              <span>Roster spots left</span>
              <input
                max={rosterSize}
                min="0"
                onChange={(event) =>
                  saveSession({
                    ...session,
                    remainingRosterSpots: Math.max(
                      0,
                      Math.min(rosterSize, Math.round(Number(event.target.value))),
                    ),
                  })
                }
                step="1"
                type="number"
                value={session.remainingRosterSpots}
              />
            </label>
            <button className={styles.primaryButton} disabled={pending} type="submit">
              {pending ? 'Evaluating…' : 'Evaluate live bid'}
            </button>
          </form>

          {error && <p className={`${styles.formMessage} ${styles.formError}`}>{error}</p>}

          {evaluation === null ? (
            <div className={styles.liveBidEmpty}>
              <strong>{selectedPlayer?.name ?? 'No player selected'}</strong>
              Enter the current bid to compare league market price, projected value, and your
              roster-specific cap.
            </div>
          ) : (
            <article className={styles.liveDecision} aria-live="polite">
              <div className={styles.liveDecisionHero}>
                <span className={`${styles.liveAction} ${actionClass(evaluation.action)}`}>
                  {actionLabel[evaluation.action]}
                </span>
                <div>
                  <strong>{evaluation.player.name}</strong>
                  <small>
                    {signalLabel[evaluation.market.priceSignal]} at{' '}
                    {formatPrice(evaluation.market.currentPriceCents)} · expected{' '}
                    {formatPrice(evaluation.market.expectedPriceCents)}
                  </small>
                </div>
              </div>
              <dl className={styles.liveMetrics}>
                <div>
                  <dt>
                    Fair range
                    {evaluation.market.calibrationModelId === null ? '' : ' · calibrated'}
                  </dt>
                  <dd>
                    {formatPrice(evaluation.market.fairLowCents)}–
                    {formatPrice(evaluation.market.fairHighCents)}
                  </dd>
                </div>
                <div>
                  <dt>Your cap</dt>
                  <dd>{formatPrice(evaluation.personal.maxBidCents)}</dd>
                </div>
                <div>
                  <dt>Projection value</dt>
                  <dd>{formatPrice(evaluation.market.projectedValueCents)}</dd>
                </div>
                <div>
                  <dt>Impact</dt>
                  <dd>+{evaluation.impact.marginalPointsPerGame.toFixed(1)} FPPG vs replacement</dd>
                </div>
              </dl>
              <ul className={styles.liveReasons}>
                {evaluation.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className={styles.liveJudgment}>
                <span>
                  {evaluation.judgment.source === 'jev' ? 'Jev checked' : 'Guardrails only'}
                </span>
                {evaluation.judgment.note}
              </div>
              <div className={styles.liveActions}>
                <button className={styles.secondaryButton} onClick={recordWin} type="button">
                  Record win at {formatPrice(evaluation.market.currentPriceCents)}
                </button>
                <AskEveButton
                  className={styles.secondaryButton}
                  context={{
                    currentBid: evaluation.market.currentPriceCents / 100,
                    draftStateVersion: evaluation.draftStateVersion,
                    playerId: evaluation.player.id,
                  }}
                  prompt={evePrompt}
                >
                  Discuss with Eve
                </AskEveButton>
              </div>
            </article>
          )}
        </div>

        <aside className={styles.liveDraftRail}>
          <section>
            <header>
              <strong>My draft room</strong>
              <button
                onClick={() => {
                  saveSession(initialSession);
                  setEvaluation(null);
                }}
                type="button"
              >
                Reset
              </button>
            </header>
            {session.ownedPlayers.length === 0 ? (
              <p>No players recorded yet.</p>
            ) : (
              <ul>
                {session.ownedPlayers.map((player) => (
                  <li key={player.playerId}>
                    <span>
                      <strong>{player.playerName}</strong>
                      <small>{formatPrice(player.priceCents)}</small>
                    </span>
                    <button onClick={() => removePlayer(player.playerId)} type="button">
                      Undo
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section>
            <header>
              <strong>Recent checks</strong>
              <small>{session.history.length}</small>
            </header>
            {session.history.length === 0 ? (
              <p>Evaluations stay in this browser after refresh.</p>
            ) : (
              <ul>
                {session.history.slice(0, 6).map((item) => (
                  <li key={`${item.draftStateVersion}-${item.player.id}`}>
                    <span>
                      <strong>{item.player.name}</strong>
                      <small>{formatPrice(item.market.currentPriceCents)}</small>
                    </span>
                    <em className={actionClass(item.action)}>{actionLabel[item.action]}</em>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
