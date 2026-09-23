'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  acceptBridgeMessage,
  bridgeStateSchema,
  bridgeVersion,
  draftGuardrail,
  type BridgeEvaluation,
  type BridgeState,
} from '../../../lib/fantrax-bridge';
import type { LiveDraftSnapshot } from '../../../lib/fantrax-live';
import type { DraftModelSummary, DraftPlayerDirectory } from '../../../lib/live-draft-model';
import { LiveAuctionPlayer } from './live-auction-player';
import styles from '../../workspace.module.css';
import room from './live-draft-room.module.css';

const focusLabels: Record<string, string> = {
  await_result: 'Wait for the auction result.',
  await_draft: 'Wait for the draft to run.',
  prepare_nomination: 'Review your roster before the next nomination.',
  preserve_budget: 'Keep enough budget for the remaining roster.',
  review_position: 'Review positions that already have several players.',
  check_value: 'Check this player’s value for this league.',
};
const statusLabels: Record<string, string> = {
  '0': 'Not started',
  '1': 'Live',
  '2': 'Paused',
  '3': 'Finished',
  '4': 'Halted',
  '5': 'Waiting',
};

function subscribePairing(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}
function readPairing() {
  return new URLSearchParams(window.location.hash.slice(1)).get('bridge') ?? '';
}
interface LiveAuctionProps {
  readonly modelSummary?: DraftModelSummary | null;
  readonly playerDirectory?: DraftPlayerDirectory | null;
  readonly snapshot: LiveDraftSnapshot;
  readonly teamId: string;
  readonly paused: boolean;
}
export function LiveAuction(props: LiveAuctionProps) {
  const nonce = useSyncExternalStore(subscribePairing, readPairing, () => '');
  return <LiveAuctionConnection key={nonce} {...props} nonce={nonce} />;
}

function LiveAuctionConnection({
  snapshot,
  teamId,
  paused,
  nonce,
  modelSummary,
  playerDirectory,
}: LiveAuctionProps & { readonly nonce: string }) {
  const [frame, setFrame] = useState<{ state: BridgeState; receivedAt: number } | null>(null);
  const [input, setInput] = useState<BridgeState | null>(null);
  const [evaluation, setEvaluation] = useState<BridgeEvaluation | null>(null);
  const [evaluatedPlayer, setEvaluatedPlayer] = useState<{ id: string; name: string } | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<{
    version: string;
    message: string;
  } | null>(null);
  const [captureError, setCaptureError] = useState(false);
  const [now, setNow] = useState(0);
  const [script, setScript] = useState('');
  const [setupStatus, setSetupStatus] = useState('');
  const [retry, setRetry] = useState(0);
  const leagueId = snapshot.leagueId;

  useEffect(() => {
    let lastSequence = -1;
    let lastVersion = '';
    let active = true;
    const receive = (event: MessageEvent) => {
      if (
        event.source === window.opener &&
        window.opener &&
        nonce &&
        ['https://www.fantrax.com', 'https://fantrax.com'].includes(event.origin) &&
        event.data?.nonce === nonce &&
        event.data?.leagueId === leagueId &&
        event.data?.type === 'fantasy-basketball:draft-error'
      ) {
        setFeedError('Fantrax could not refresh the draft. Check the bridge panel in Fantrax.');
        return;
      }
      const state = acceptBridgeMessage(event, window.opener, nonce, leagueId);
      if (!state) {
        if (
          window.opener &&
          event.source === window.opener &&
          nonce &&
          ['https://www.fantrax.com', 'https://fantrax.com'].includes(event.origin) &&
          event.data?.type === 'fantasy-basketball:draft-state' &&
          event.data?.nonce === nonce &&
          event.data?.state?.leagueId === leagueId
        ) {
          const parsed = bridgeStateSchema.safeParse(event.data.state);
          if (!parsed.success)
            setFeedError(
              `Fantrax returned an unsupported draft field: ${parsed.error.issues[0]?.path.join('.') ?? 'state'}. Reconnect the bridge after checking Fantrax.`,
            );
        }
        return;
      }
      if (state.sequence <= lastSequence) return;
      if (Math.abs(Date.now() - state.observedAt) > 15_000) return;
      lastSequence = state.sequence;
      setFrame({ state, receivedAt: Date.now() });
      setNow(Date.now());
      setFeedError(null);
      const version = bridgeVersion(state, teamId);
      if (version === lastVersion) return;
      lastVersion = version;
      setInput(state);
      // Capture every meaningful event, including events superseded before Jev finishes.
      void fetch('/api/draft/live/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, teamId }),
        keepalive: true,
      })
        .then((response) => {
          if (active) setCaptureError(!response.ok);
        })
        .catch(() => {
          if (active) setCaptureError(true);
        });
    };
    window.addEventListener('message', receive);
    if (nonce && window.opener) {
      const ready = { type: 'fantasy-basketball:draft-ready', nonce };
      window.opener.postMessage(ready, 'https://www.fantrax.com');
      window.opener.postMessage(ready, 'https://fantrax.com');
    }
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener('message', receive);
    };
  }, [leagueId, teamId, nonce]);

  const stale = !frame || !!feedError || paused || (now > 0 && now - frame.receivedAt > 8000);
  const version = frame ? bridgeVersion(frame.state, teamId) : '';
  const current = !stale && evaluation?.version === version ? evaluation : null;
  const model = current?.reference?.summary ?? modelSummary;
  const failed = !stale && evaluationError?.version === version ? evaluationError.message : null;
  const guardrail = frame
    ? draftGuardrail(frame.state, teamId, snapshot.minimumBidCents, snapshot.incrementCents)
    : null;

  useEffect(() => {
    if (!input || stale || !teamId) return;
    const controller = new AbortController();
    const inputVersion = bridgeVersion(input, teamId);
    // Coalesce bid bursts; immediately cancel results for older state.
    const timer = setTimeout(async () => {
      try {
        const response = await fetch('/api/draft/live/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({ state: input, teamId }),
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? 'Jev could not evaluate this update.');
        if (!controller.signal.aborted && body.version === inputVersion) {
          setEvaluation(body as BridgeEvaluation);
          if (
            input.nominatedPlayerId &&
            body.playerName &&
            body.playerName !== input.nominatedPlayerId
          ) {
            setEvaluatedPlayer({ id: input.nominatedPlayerId, name: body.playerName });
          }
          setEvaluationError(null);
        }
      } catch (error) {
        if (!controller.signal.aborted)
          setEvaluationError({
            version: inputVersion,
            message: error instanceof Error ? error.message : 'Evaluation unavailable.',
          });
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [input, stale, teamId, retry]);

  async function copyBridge() {
    try {
      const response = await fetch(
        `/api/draft/live/bridge?leagueId=${leagueId}&teamId=${encodeURIComponent(teamId)}`,
      );
      if (!response.ok) throw new Error('Choose a team and sign in to connect the bridge.');
      const code = await response.text();
      setScript(code);
      try {
        await navigator.clipboard.writeText(code);
        setSetupStatus('Copied. Run the script in the Fantrax draft tab’s Console.');
      } catch {
        setSetupStatus('Select and copy the script below.');
      }
    } catch (error) {
      setSetupStatus(error instanceof Error ? error.message : 'Could not load the bridge.');
    }
  }

  const state = frame?.state;
  const clockRunning = state?.status === '1';
  const clockPaused = state?.status === '2' || state?.status === '4';
  const remainingSeconds =
    stale || state?.timeLeftMs == null || (!clockRunning && !clockPaused)
      ? null
      : Math.max(
          0,
          Math.ceil(
            (state.timeLeftMs - (clockRunning ? Math.max(0, now - state.observedAt) : 0)) / 1000,
          ),
        );
  const clockText =
    remainingSeconds === null
      ? '--:--'
      : `${Math.floor(remainingSeconds / 60)}:${String(remainingSeconds % 60).padStart(2, '0')}`;
  const clockNote = !frame
    ? 'Connect the Fantrax bridge'
    : paused
      ? 'Dashboard updates paused'
      : stale
        ? 'Feed stale · Check Fantrax'
        : clockPaused
          ? `${statusLabels[state?.status ?? '2']} in Fantrax`
          : !clockRunning
            ? statusLabels[state?.status ?? '0']
            : remainingSeconds === null
              ? 'Waiting for the Fantrax clock'
              : remainingSeconds === 0
                ? 'Awaiting Fantrax update'
                : 'Synced with Fantrax · Counts down locally';
  const teamName = (id: string | null | undefined) =>
    snapshot.teams.find((team) => team.id === id)?.name ?? id ?? 'None';
  const player = state?.nominatedPlayerId
    ? playerDirectory?.players[state.nominatedPlayerId]
    : null;
  const playerName = state?.nominatedPlayerId
    ? (player?.name ??
      (evaluatedPlayer?.id === state.nominatedPlayerId ? evaluatedPlayer.name : 'Loading player…'))
    : 'Awaiting nomination';
  const projection = player?.projection ?? current?.reference?.candidate ?? null;

  return (
    <section className={`${styles.panel} ${room.bodyPanel}`} aria-label="Live auction and Jev">
      <header className={styles.panelHeader}>
        <div>
          <h2>Live auction · Jev</h2>
          <p>Nominations and bids from your open Fantrax draft room.</p>
        </div>
        <span className={styles.badge}>
          {stale ? (frame ? 'Feed stale' : 'Bridge needed') : statusLabels[state?.status ?? '0']}
        </span>
      </header>
      <div
        className={`${room.pickClock} ${clockRunning && remainingSeconds !== null && remainingSeconds <= 10 ? room.clockUrgent : ''}`}
      >
        <div>
          <strong>Pick clock</strong>
          <p>
            {state?.currentPick != null ? `Pick ${state.currentPick} · ` : ''}
            {clockNote}
          </p>
        </div>
        <span role="timer" aria-label="Pick clock" aria-live="off" className={room.clockDigits}>
          {clockText}
        </span>
      </div>
      {!frame ? (
        <div className={room.bridgeSetup}>
          {feedError && <p className={styles.warning}>{feedError}</p>}
          <p>
            Connect once in your signed-in Fantrax tab. Keep that tab open throughout the draft.
          </p>
          <ol>
            <li>Copy the bridge script below.</li>
            <li>
              Open the Fantrax draft tab. Press ⌥⌘J to open Chrome’s Console, then run the script.
            </li>
            <li>Click “Open live copilot” in the Fantrax page.</li>
          </ol>
          <button className={styles.primaryButton} disabled={!teamId} onClick={copyBridge}>
            Copy bridge script
          </button>
          {setupStatus && <output>{setupStatus}</output>}
          {script && (
            <details>
              <summary>Inspect or copy the script</summary>
              <textarea
                aria-label="Fantrax bridge script"
                readOnly
                value={script}
                className={room.bridgeScript}
                onFocus={(event) => event.target.select()}
              />
            </details>
          )}
        </div>
      ) : (
        <div className={room.auctionBody}>
          <LiveAuctionPlayer
            state={frame.state}
            teamId={teamId}
            stale={stale}
            name={playerName}
            position={player?.position ?? projection?.positions?.join('/') ?? ''}
            nbaTeam={player?.team ?? projection?.team ?? ''}
            bidder={teamName(state?.bidderTeamId)}
            projection={projection}
            nextBidCents={guardrail?.nextBidCents ?? snapshot.minimumBidCents}
            season={model?.season ?? `${snapshot.season}-${String(snapshot.season + 1).slice(-2)}`}
          />
          <div className={room.jevStrip}>
            <span
              className={current?.source === 'jev' ? room.jevReady : room.jevPending}
              title={
                current?.source === 'jev'
                  ? 'Jev evaluated the current bid'
                  : 'Jev evaluation pending'
              }
              aria-label={
                current?.source === 'jev'
                  ? 'Jev evaluated the current bid'
                  : 'Jev evaluation pending'
              }
            >
              ●
            </span>
            <strong>Jev</strong>
            <span>
              {current?.source === 'jev' ? `${current.durationMs}ms` : stale ? 'Offline' : '…'}
            </span>
            {current?.source === 'jev' && (
              <span
                title={`Roster fit: ${current.rosterFit}`}
                aria-label={`Roster fit: ${current.rosterFit}`}
              >
                {current.rosterFit === 'useful' ? '✓' : current.rosterFit === 'crowded' ? '!' : '·'}
              </span>
            )}
            <span className={room.nominator}>↗ {teamName(state?.nominatingTeamId)}</span>
          </div>
          {(stale || state?.rosterSyncPending) && (
            <p className={styles.warning}>
              {paused
                ? 'Updates are paused in this room.'
                : stale
                  ? (feedError ?? 'Feed stale. Check Fantrax.')
                  : 'Syncing rosters and budgets…'}
            </p>
          )}
          {(failed || current?.error) && (
            <p className={styles.warning}>
              {failed ?? current?.error}{' '}
              <button
                className={styles.secondaryButton}
                onClick={() => setRetry((value) => value + 1)}
              >
                Retry Jev
              </button>
            </p>
          )}
          <details className={room.auctionDetails}>
            <summary>Analysis & sources</summary>
            <p>{stale ? 'Check Fantrax before acting.' : guardrail?.note}</p>
            {current?.source === 'jev' && (
              <p>
                {focusLabels[current.focus ?? ''] ?? 'Review the current draft state.'} Roster fit:{' '}
                {current.rosterFit}.
              </p>
            )}
            {model && (
              <p>
                {model.note} {model.mappedCount}/{model.playerCount} linked · {model.season} ·{' '}
                {model.asOf?.slice(0, 10)}.
              </p>
            )}
            {!projection && state?.nominatedPlayerId && (
              <p>No matched projection for this player.</p>
            )}
            <p>
              Green: below reference range or within legal budget. Amber: within reference range.
              Red: above range or over budget.
            </p>
            <p>
              Reference values use the main league. This mock league has different scoring rules.
            </p>
            <p>
              Source: {state?.source === 'socket' ? 'Fantrax socket' : 'Fantrax read request'} ·
              Event {state?.sequence}
            </p>
          </details>
          {(captureError || current?.recording === 'unavailable') && (
            <p className={styles.warning}>
              A live event could not be saved. Keep this room open and check the capture connection.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
