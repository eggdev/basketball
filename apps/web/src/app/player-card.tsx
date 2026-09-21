'use client';

import type { PlayerProjectionReadModel } from '@fantasy-basketball/database/runtime';
import type { PlayerSituation } from '@fantasy-basketball/fantasy';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { projectionTier, durabilityTone, roleTone, type SignalTone } from '../lib/player-signals';
import { formatPrice } from '../lib/format';
import { AskEveButton } from './app-shell';
import styles from './player-card.module.css';

export type PlayerSignal =
  | 'availability'
  | 'opportunity'
  | 'value'
  | 'evidence'
  | 'movement'
  | 'tier'
  | 'decline'
  | 'role';
export function SignalIcon({ kind }: { kind: PlayerSignal }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {kind === 'decline' ? (
        <path d="m4 7 6 6 4-3 6 9M14 19h6v-6" />
      ) : kind === 'role' ? (
        <>
          <circle cx="12" cy="7" r="3" />
          <path d="M5 21v-3a7 7 0 0 1 14 0v3M5 17h14" />
        </>
      ) : kind === 'movement' ? (
        <>
          <path d="M4 8h14m-4-4 4 4-4 4M20 16H6m4-4-4 4 4 4" />
        </>
      ) : kind === 'availability' ? (
        <>
          <path d="M12 3 4 6v6c0 4 8 9 8 9s8-5 8-9V6z" />
          <path d="m8 12 3 3 5-6" />
        </>
      ) : kind === 'opportunity' ? (
        <>
          <path d="m4 17 6-6 4 3 6-9M14 5h6v6" />
        </>
      ) : kind === 'value' ? (
        <>
          <path d="M12 3v18M17 7c-1-3-10-3-10 1 0 5 10 3 10 8 0 4-9 4-11 1" />
        </>
      ) : (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v6M12 7h.01" />
        </>
      )}
    </svg>
  );
}

export function PlayerRead({
  kind,
  label,
  detail,
  tone = 'neutral',
  glyph,
}: {
  tone?: SignalTone;
  glyph?: string;
  kind: PlayerSignal;
  label: string;
  detail: string;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const tooltip = useRef<HTMLSpanElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pinned = useRef(false);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const clearHide = () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  };
  const close = () => {
    clearHide();
    pinned.current = false;
    setOpen(false);
  };
  const show = () => {
    clearHide();
    setOpen(true);
  };
  const leave = () => {
    clearHide();
    if (!pinned.current && document.activeElement !== trigger.current) {
      hideTimer.current = setTimeout(() => setOpen(false), 120);
    }
  };
  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        pinned.current = false;
        setOpen(false);
      }
    };
    const moved = () => {
      pinned.current = false;
      setOpen(false);
    };
    window.addEventListener('keydown', dismiss);
    window.addEventListener('resize', moved);
    window.addEventListener('scroll', moved, true);
    return () => {
      window.removeEventListener('keydown', dismiss);
      window.removeEventListener('resize', moved);
      window.removeEventListener('scroll', moved, true);
    };
  }, [open]);
  useLayoutEffect(() => {
    if (!open || !trigger.current || !tooltip.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const box = tooltip.current.getBoundingClientRect();
    const above = anchor.top - box.height - 6;
    setPosition({
      left: Math.max(8, Math.min(anchor.right - box.width, window.innerWidth - box.width - 8)),
      top: Math.max(
        8,
        Math.min(above >= 8 ? above : anchor.bottom + 6, window.innerHeight - box.height - 8),
      ),
    });
  }, [open]);
  return (
    <span
      className={styles.signal}
      data-tone={tone}
      data-open={open}
      onMouseEnter={show}
      onMouseLeave={leave}
    >
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-describedby={id}
        onFocus={show}
        onBlur={close}
        onClick={() => {
          if (pinned.current) close();
          else {
            pinned.current = true;
            show();
          }
        }}
      >
        <span className={styles.signalGlyph} aria-hidden="true">
          {glyph ?? <SignalIcon kind={kind} />}
        </span>
      </button>
      {open ? (
        createPortal(
          <span onMouseEnter={show} onMouseLeave={leave}>
            <span ref={tooltip} className={styles.tooltip} role="tooltip" id={id} style={position}>
              <strong>{label}</strong>
              {detail}
            </span>
          </span>,
          document.body,
        )
      ) : (
        <span hidden id={id}>
          {label}. {detail}
        </span>
      )}
    </span>
  );
}

export interface PlayerCardProps {
  playerId: string;
  playerName: string;
  auctionCostCents?: number | null;
  rosterSeason?: string;
  projection?: PlayerProjectionReadModel | null;
  projectionSeason?: string;
  situation?: PlayerSituation | null;
  compact?: boolean;
}

/** One player identity and evidence grammar, shared by roster and research surfaces. */
export function PlayerCard({
  playerId,
  playerName,
  auctionCostCents,
  rosterSeason,
  projection,
  projectionSeason,
  situation,
  compact = false,
}: PlayerCardProps) {
  const availability = projection
    ? `${projection.availability.expectedGames.toFixed(1)} expected games · ${projection.availability.tier}`
    : 'Availability not loaded';
  const opportunity = situation
    ? `Opportunity ${situation.opportunity.direction}`
    : 'Opportunity unclassified';
  const evidence = [
    rosterSeason ? `${rosterSeason} draft snapshot; ownership may have changed.` : '',
    projection
      ? `${projectionSeason ?? 'Latest'} model projection, not an observed result.`
      : 'No projection in this view.',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <article className={`${styles.card} ${compact ? styles.compact : ''}`}>
      <details className={styles.disclosure}>
        <summary aria-label={`Player read: ${playerName}`}>
          <span className={styles.identity}>
            <span className={styles.monogram} aria-hidden="true">
              {playerName
                .split(' ')
                .map((part) => part[0])
                .slice(0, 2)
                .join('')}
            </span>
            <span>
              <strong>{playerName}</strong>
              <small>
                {projection
                  ? [projection.teamAbbreviation, ...projection.positions]
                      .filter(Boolean)
                      .join(' · ')
                  : rosterSeason
                    ? `${rosterSeason} draft roster`
                    : 'Player research'}
              </small>
            </span>
          </span>
          <svg className={styles.chevron} aria-hidden="true" viewBox="0 0 20 20">
            <path d="m7 4 6 6-6 6" />
          </svg>
        </summary>
        <div className={styles.detail}>
          <p>{evidence}</p>
          {projection ? (
            <dl>
              <div>
                <dt>Projected points / game</dt>
                <dd>{projection.fantasyPointsPerGame.toFixed(1)}</dd>
              </div>
              <div>
                <dt>Expected games</dt>
                <dd>{projection.availability.expectedGames.toFixed(1)}</dd>
              </div>
              <div>
                <dt>Projected season points</dt>
                <dd>{Math.round(projection.fantasyPoints).toLocaleString('en-US')}</dd>
              </div>
            </dl>
          ) : null}
          {situation ? (
            <p>
              {opportunity}. {situation.role?.note ?? 'Role evidence is not available.'}
            </p>
          ) : null}
          <AskEveButton
            className={styles.ask}
            context={{
              playerId,
              player: playerName,
              rosterSeason: rosterSeason ?? null,
              projectionSeason: projectionSeason ?? null,
            }}
            prompt={`Evaluate ${playerName} for our team. Separate ${rosterSeason ? `${rosterSeason} draft ownership` : 'ownership evidence'}, projections, availability and role evidence. Explain fit and uncertainty before recommending an action.`}
          >
            Analyze team fit
          </AskEveButton>
        </div>
      </details>
      <div className={styles.bottom}>
        <span className={styles.measure}>
          {projection ? (
            <>
              <strong>{projection.fantasyPointsPerGame.toFixed(1)}</strong> proj. FP/G
            </>
          ) : auctionCostCents != null ? (
            <>
              <strong>{formatPrice(auctionCostCents)}</strong> paid at draft
            </>
          ) : (
            'Open player read'
          )}
        </span>
        <div className={styles.signals} aria-label={`${playerName} signals`}>
          <PlayerRead
            kind="tier"
            glyph={projectionTier(projection?.rank).label}
            tone={projectionTier(projection?.rank).tone}
            label={`Tier ${projectionTier(projection?.rank).label}`}
            detail={`${projectionSeason ?? 'Latest projection'} · ${projectionTier(projection?.rank).detail}`}
          />
          <PlayerRead
            kind="movement"
            tone={situation?.movement.isNewTeam ? 'info' : 'neutral'}
            label={
              situation?.movement.isNewTeam
                ? 'New NBA team'
                : situation?.previousTeamAbbreviation === situation?.currentTeamAbbreviation &&
                    situation?.previousTeamAbbreviation
                  ? 'Returning NBA team'
                  : 'Team movement unknown'
            }
            detail={
              situation
                ? `${situation.previousTeamAbbreviation ?? 'Prior team unknown'} → ${situation.currentTeamAbbreviation}. ${situation.movement.note ?? situation.movement.type}. A change of team is not automatically an improvement.`
                : 'No team movement evidence available.'
            }
          />

          <PlayerRead
            kind="availability"
            tone={durabilityTone(projection?.availability.tier)}
            label={availability}
            detail={
              projection
                ? `${projectionSeason ?? 'Latest'} availability estimate; this is not live injury clearance.`
                : 'Open player research for availability evidence.'
            }
          />
          <PlayerRead
            kind={
              situation?.opportunity.direction === 'up'
                ? 'opportunity'
                : situation?.opportunity.direction === 'down'
                  ? 'decline'
                  : 'role'
            }
            tone={roleTone(situation?.opportunity.direction)}
            label={opportunity}
            detail={
              situation
                ? `${situation.opportunity.source.replaceAll('-', ' ')}. ${situation.role?.note ?? 'Opportunity is an estimate, not a guaranteed role.'}`
                : 'No role evidence is attached to this view; unknown does not mean stable.'
            }
          />
          <PlayerRead
            kind="value"
            label={
              auctionCostCents != null
                ? `${formatPrice(auctionCostCents)} paid at draft`
                : 'Auction price unavailable'
            }
            detail={
              auctionCostCents != null
                ? `${rosterSeason ?? 'Historical'} observed price. Not a recommended bid or current trade value.`
                : 'No observed auction price is attached to this player here.'
            }
          />
          <PlayerRead kind="evidence" label="Evidence and season" detail={evidence} />
        </div>
      </div>
    </article>
  );
}

export function DraftPlayerSignals({
  rank,
  availabilityTier,
  season,
  situation,
}: {
  rank?: number;
  availabilityTier?: string;
  season: string;
  situation?: PlayerSituation | null;
}) {
  const tier = projectionTier(rank);
  return (
    <div className={styles.signals}>
      <PlayerRead
        kind="tier"
        glyph={tier.label}
        tone={tier.tone}
        label={`Tier ${tier.label}`}
        detail={`${season} · ${tier.detail}`}
      />
      <PlayerRead
        kind="availability"
        tone={durabilityTone(availabilityTier)}
        label={availabilityTier ? `${availabilityTier} availability` : 'Availability unknown'}
        detail="Model-estimated durability; not live injury clearance. Green: durable. Amber: managed. Red: fragile."
      />
      <PlayerRead
        kind="movement"
        tone={situation?.movement.isNewTeam ? 'info' : 'neutral'}
        label={
          situation?.movement.isNewTeam
            ? 'New NBA team'
            : situation?.previousTeamAbbreviation === situation?.currentTeamAbbreviation &&
                situation?.previousTeamAbbreviation
              ? 'Returning NBA team'
              : 'Team movement unknown'
        }
        detail={
          situation
            ? `${situation.previousTeamAbbreviation ?? 'Unknown'} → ${situation.currentTeamAbbreviation}. ${situation.movement.note ?? situation.movement.type}`
            : 'Team-change evidence unavailable.'
        }
      />
      <PlayerRead
        kind={
          situation?.opportunity.direction === 'up'
            ? 'opportunity'
            : situation?.opportunity.direction === 'down'
              ? 'decline'
              : 'role'
        }
        tone={roleTone(situation?.opportunity.direction)}
        label={`Role ${situation?.opportunity.direction ?? 'unknown'}`}
        detail={
          situation?.role?.note ??
          (situation
            ? `${situation.opportunity.source}: ${situation.opportunity.direction}. This is an estimate.`
            : 'No role evidence available.')
        }
      />
    </div>
  );
}
export function PlayerSignalLegend() {
  return (
    <div className={styles.legend}>
      <span data-tone="elite">S 1–12</span>
      <span data-tone="positive">A 13–36</span>
      <span data-tone="info">B 37–72</span>
      <span>C 73–120 · D 121+</span>
      <span data-tone="positive">Durable / role up</span>
      <span data-tone="caution">Managed / uncertain</span>
      <span data-tone="negative">Fragile / role down</span>
      <span data-tone="info">New team</span>
      <span>Gray: unchanged or unknown · open the read for evidence.</span>
    </div>
  );
}
