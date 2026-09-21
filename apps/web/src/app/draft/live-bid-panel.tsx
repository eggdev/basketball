'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';

import { formatPrice } from '../../lib/format';
import {
  evaluateLiveBidBoard,
  markJevUnavailable,
  type LiveBidBoard,
  type LiveBidDecision,
  type LiveBidRequest,
} from '../../lib/live-bid-board';
import { DraftPlayerSignals } from '../player-card';
import type { PlayerSituationBoard } from '@fantasy-basketball/fantasy';
import { AskEveButton } from '../app-shell';
import styles from '../workspace.module.css';

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
  board,
  situations,
}: {
  readonly board: LiveBidBoard;
  readonly situations?: PlayerSituationBoard | null;
}) {
  const { players } = board;
  const initialSession = useMemo<DraftSession>(
    () => ({
      history: [],
      ownedPlayers: [],
      remainingBudgetCents: board.baseBudgetCents,
      remainingRosterSpots: board.rosterSize,
    }),
    [board.baseBudgetCents, board.rosterSize],
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
  const [selectedPlayerId, setSelectedPlayerId] = useState(players[0]?.playerId ?? '');
  const [currentPrice, setCurrentPrice] = useState('0');
  const [evaluation, setEvaluation] = useState<LiveBidDecision | null>(null);
  const [evaluationLatencyMs, setEvaluationLatencyMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const version = useRef(0);
  const jevRequest = useRef<AbortController | null>(null);

  useEffect(() => () => jevRequest.current?.abort(), []);

  const ownedIds = useMemo(
    () => new Set(session.ownedPlayers.map((player) => player.playerId)),
    [session.ownedPlayers],
  );
  const availablePlayers = players.filter((player) => !ownedIds.has(player.playerId));
  const activePlayerId = ownedIds.has(selectedPlayerId)
    ? (availablePlayers[0]?.playerId ?? '')
    : selectedPlayerId;
  const selectedPlayer = players.find((player) => player.playerId === activePlayerId) ?? null;

  const replaceHistoryDecision = (decision: LiveBidDecision): void => {
    const latest = parseSession(readSession(), initialSession);
    const exists = latest.history.some(
      (item) => item.draftStateVersion === decision.draftStateVersion,
    );
    saveSession({
      ...latest,
      history: (exists
        ? latest.history.map((item) =>
            item.draftStateVersion === decision.draftStateVersion ? decision : item,
          )
        : [decision, ...latest.history]
      ).slice(0, 20),
    });
  };

  const evaluate = (event: FormEvent<HTMLFormElement>) => {
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

    setError(null);
    jevRequest.current?.abort();
    const requestVersion = version.current + 1;
    version.current = requestVersion;
    const request = {
      currentPriceCents,
      draftStateVersion: `manual-${requestVersion}-${Date.now()}`,
      ownedPlayerIds: session.ownedPlayers.map((player) => player.playerId),
      playerId: activePlayerId,
      remainingBudgetCents: session.remainingBudgetCents,
      remainingRosterSpots: session.remainingRosterSpots,
    } satisfies LiveBidRequest;
    const startedAt = performance.now();
    try {
      const result = evaluateLiveBidBoard(board, request);
      setEvaluationLatencyMs(Math.max(1, Math.round(performance.now() - startedAt)));
      setEvaluation(result);
      replaceHistoryDecision(result);

      const controller = new AbortController();
      jevRequest.current = controller;
      void (async () => {
        try {
          const response = await fetch('/api/draft/evaluate', {
            body: JSON.stringify(request),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
            signal: controller.signal,
          });
          const responseBody = (await response.json()) as unknown;
          if (!response.ok) {
            const message =
              typeof responseBody === 'object' &&
              responseBody !== null &&
              'error' in responseBody &&
              typeof responseBody.error === 'string'
                ? responseBody.error
                : 'The Jev review could not be completed.';
            throw new Error(message);
          }
          const enriched = responseBody as LiveBidDecision;
          replaceHistoryDecision(enriched);
          if (version.current === requestVersion) setEvaluation(enriched);
        } catch {
          if (controller.signal.aborted) return;
          const fallback = markJevUnavailable(result);
          replaceHistoryDecision(fallback);
          if (version.current === requestVersion) setEvaluation(fallback);
        } finally {
          if (jevRequest.current === controller) jevRequest.current = null;
        }
      })();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The bid could not be evaluated.');
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
      remainingRosterSpots: Math.min(board.rosterSize, session.remainingRosterSpots + 1),
    });
  };

  const evePrompt =
    evaluation === null
      ? ''
      : `Review the live bid on ${evaluation.player.name} at ${formatPrice(evaluation.market.currentPriceCents)}. The engine says ${actionLabel[evaluation.action].toLocaleLowerCase()}, with a ${formatPrice(evaluation.personal.maxBidCents)} personal cap and ${signalLabel[evaluation.market.priceSignal].toLocaleLowerCase()} market signal.${evaluation.impact.rosterMarginalValue === null ? '' : ` The ${evaluation.impact.rosterMarginalValue.modelVersion} model estimates ${evaluation.impact.rosterMarginalValue.marginalRegularSeasonPoints.toFixed(1)} roster-marginal points, ${evaluation.impact.rosterMarginalValue.congestionLoss.toFixed(1)} congestion loss, and ${evaluation.impact.rosterMarginalValue.marginalPlayoffWeightedPoints.toFixed(1)} playoff-weighted marginal points from the schedule as of ${evaluation.impact.rosterMarginalValue.scheduleAsOf}.`} Keep league market price separate from personal production utility, explain the fit for my current plan, and tell me what would change your recommendation.`;

  return (
    <section className={`${styles.panel} ${styles.liveBidPanel}`}>
      <header className={styles.panelHeader}>
        <div>
          <h2>Live bid copilot</h2>
          <p>Manual shadow mode · instant deterministic cap · asynchronous Jev fit check</p>
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
                  jevRequest.current?.abort();
                  version.current += 1;
                  setSelectedPlayerId(event.target.value);
                  setEvaluation(null);
                  setEvaluationLatencyMs(null);
                }}
                value={activePlayerId}
              >
                {availablePlayers.map((player) => (
                  <option key={player.playerId} value={player.playerId}>
                    {player.rank}. {player.playerName} · {player.positions.join('/')} ·{' '}
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
                max={board.rosterSize}
                min="0"
                onChange={(event) =>
                  saveSession({
                    ...session,
                    remainingRosterSpots: Math.max(
                      0,
                      Math.min(board.rosterSize, Math.round(Number(event.target.value))),
                    ),
                  })
                }
                step="1"
                type="number"
                value={session.remainingRosterSpots}
              />
            </label>
            <button className={styles.primaryButton} type="submit">
              Evaluate live bid
            </button>
          </form>

          {error && <p className={`${styles.formMessage} ${styles.formError}`}>{error}</p>}

          {evaluation === null ? (
            <div className={styles.liveBidEmpty}>
              <strong>{selectedPlayer?.playerName ?? 'No player selected'}</strong>
              {selectedPlayer ? (
                <DraftPlayerSignals
                  rank={selectedPlayer.rank}
                  availabilityTier={selectedPlayer.availabilityTier}
                  season={board.projection.seasonKey}
                  situation={situations?.players.find(
                    (player) => player.playerId === selectedPlayer.playerId,
                  )}
                />
              ) : null}
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
                  <dt>Legal bid floor</dt>
                  <dd>{formatPrice(evaluation.budget.legalBidFloorCents)} · uncontested</dd>
                </div>
                <div>
                  <dt>Cash leverage</dt>
                  <dd>
                    {evaluation.budget.positiveBidLeverage
                      ? `${formatPrice(evaluation.budget.remainingBudgetCents)} available`
                      : '$0 bids only'}
                  </dd>
                </div>
                <div>
                  <dt>Projection value</dt>
                  <dd>{formatPrice(evaluation.market.projectedValueCents)}</dd>
                </div>
                <div>
                  <dt>Usable value</dt>
                  <dd>
                    {evaluation.market.usableValueCents === null
                      ? 'Pending'
                      : formatPrice(evaluation.market.usableValueCents)}
                  </dd>
                </div>
                <div>
                  <dt>Impact</dt>
                  <dd>+{evaluation.impact.marginalPointsPerGame.toFixed(1)} FPPG vs replacement</dd>
                </div>
                {evaluation.impact.rosterMarginalValue === null ? null : (
                  <>
                    <div>
                      <dt>Projected / usable FP</dt>
                      <dd>
                        {evaluation.impact.rosterMarginalValue.projectedPoints.toFixed(1)} /{' '}
                        {evaluation.impact.rosterMarginalValue.usablePoints.toFixed(1)}
                      </dd>
                    </div>
                    <div>
                      <dt>Congestion loss</dt>
                      <dd>{evaluation.impact.rosterMarginalValue.congestionLoss.toFixed(1)} FP</dd>
                    </div>
                    <div>
                      <dt>Roster marginal</dt>
                      <dd>
                        {evaluation.impact.rosterMarginalValue.marginalRegularSeasonPoints.toFixed(
                          1,
                        )}{' '}
                        FP · {evaluation.impact.rosterMarginalValue.daysBenched} bench days
                      </dd>
                    </div>
                    <div>
                      <dt>Playoff weighted</dt>
                      <dd>
                        {evaluation.impact.rosterMarginalValue.marginalPlayoffWeightedPoints.toFixed(
                          1,
                        )}{' '}
                        marginal FP ·{' '}
                        {evaluation.impact.rosterMarginalValue.playoffWeightedGames.toFixed(1)}{' '}
                        games
                      </dd>
                    </div>
                    <div>
                      <dt>Usable model</dt>
                      <dd>
                        {evaluation.impact.rosterMarginalValue.modelVersion} · as of{' '}
                        {evaluation.impact.rosterMarginalValue.scheduleAsOf.slice(0, 10)}
                      </dd>
                    </div>
                  </>
                )}
              </dl>
              <ul className={styles.liveReasons}>
                {evaluation.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <div className={styles.liveJudgment}>
                <span>
                  {evaluation.judgment.source === 'jev'
                    ? 'Jev checked'
                    : evaluation.judgment.source === 'pending'
                      ? 'Jev reviewing'
                      : 'Guardrails only'}
                </span>
                {evaluation.judgment.note}
                {evaluationLatencyMs === null
                  ? null
                  : ` Guardrails returned in ${evaluationLatencyMs} ms.`}
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
                  jevRequest.current?.abort();
                  version.current += 1;
                  saveSession(initialSession);
                  setEvaluation(null);
                  setEvaluationLatencyMs(null);
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
