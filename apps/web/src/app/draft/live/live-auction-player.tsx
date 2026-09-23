'use client';

import type { BridgeState } from '../../../lib/fantrax-bridge';
import type { DraftModelPlayer } from '../../../lib/live-draft-model';
import { formatPrice } from '../../../lib/format';
import { durabilityTone, fantasyPointsTier } from '../../../lib/player-signals';
import room from './live-draft-room.module.css';

const number = (value: number | null | undefined, digits = 1) =>
  value == null || !Number.isFinite(value) ? '-' : value.toFixed(digits);
const price = (value: number | null | undefined) => (value == null ? '-' : formatPrice(value));

export function LiveAuctionPlayer({
  state,
  teamId,
  stale,
  name,
  position,
  nbaTeam,
  bidder,
  projection,
  nextBidCents,
  season,
}: {
  readonly state: BridgeState;
  readonly teamId: string;
  readonly stale: boolean;
  readonly name: string;
  readonly position: string;
  readonly nbaTeam: string;
  readonly bidder: string;
  readonly projection: DraftModelPlayer | null;
  readonly nextBidCents: number;
  readonly season: string;
}) {
  const own = state.teams[teamId];
  const cap = own ? Math.min(own.maxBidCents, own.budgetCents) : null;
  const active =
    !stale && state.status === '1' && !state.rosterSyncPending && !!state.nominatedPlayerId;
  const affordable = cap !== null && nextBidCents <= cap && !!own?.remainingSpots;
  const leading = state.bidderTeamId === teamId;
  const budgetTone = !active || cap === null ? '' : affordable ? room.signalGood : room.signalBad;
  const budgetLabel =
    !active || cap === null
      ? 'Budget status unavailable'
      : affordable
        ? 'Next bid within legal budget'
        : 'Next bid exceeds legal budget';
  const bid = state.currentBidCents;
  const market = projection?.marketPriceCents;
  const delta = bid != null && market != null ? bid - market : null;
  const valueTone =
    !active || bid == null || projection?.fairLowCents == null || projection.fairHighCents == null
      ? ''
      : bid < projection.fairLowCents
        ? room.signalGood
        : bid > projection.fairHighCents
          ? room.signalBad
          : room.signalNeutral;
  const valueLabel = !valueTone
    ? 'Reference comparison unavailable'
    : valueTone === room.signalGood
      ? 'Below main league reference range'
      : valueTone === room.signalBad
        ? 'Above main league reference range'
        : 'Within main league reference range';
  const stats = projection?.statsPerGame ?? {};
  const pointsTier = fantasyPointsTier(projection?.fantasyPointsPerGame);
  const availability = projection?.availabilityRate;
  const durability =
    availability != null && Number.isFinite(availability) && availability >= 0 && availability <= 1
      ? Math.round(availability * 100)
      : null;
  const percent = (made: string, attempted: string) =>
    stats[made] != null && stats[attempted] > 0
      ? `${number((100 * stats[made]) / stats[attempted])}%`
      : '-';
  const statCells = [
    ['PTS', number(stats.points)],
    ['REB', number(stats.rebounds)],
    ['AST', number(stats.assists)],
    ['STL', number(stats.steals)],
    ['BLK', number(stats.blocks)],
    ['3PM', number(stats.threePointersMade)],
    ['FG%', percent('fieldGoalsMade', 'fieldGoalsAttempted')],
    ['FT%', percent('freeThrowsMade', 'freeThrowsAttempted')],
    ['TO', number(stats.turnovers)],
    ['GP', number(projection?.expectedGames, 0)],
  ];
  return (
    <div>
      <div className={room.playerHeading}>
        <div>
          <h3>{name}</h3>
          <span>
            {[nbaTeam, position].filter(Boolean).join(' · ') ||
              (state.nominatedPlayerId ? 'Player details unavailable' : '')}
          </span>
        </div>
        <div className={room.rankTile} title="Projected rank in the main league points model">
          <span>Ref rank</span>
          <strong>{projection ? `#${projection.rank}` : '-'}</strong>
        </div>
      </div>
      <div className={room.bidTiles}>
        <div className={leading && active ? room.signalGood : ''}>
          <span>
            Current bid{' '}
            {leading && (
              <span title="You hold the high bid" aria-label="You hold the high bid">
                ●
              </span>
            )}
          </span>
          <strong>{price(bid)}</strong>
          <small>{stale ? 'Feed stale' : bidder}</small>
        </div>
        <div className={budgetTone} aria-label={budgetLabel} title={budgetLabel}>
          <span>
            Next / cap{' '}
            <span aria-hidden="true">
              {active && cap !== null ? (affordable ? '✓' : '×') : '·'}
            </span>
          </span>
          <strong>
            {price(nextBidCents)} <em>/ {price(cap)}</em>
          </strong>
          <small>
            {price(own?.budgetCents)} left · {own?.remainingSpots ?? '-'} slots
          </small>
          <div className={room.budgetTrack} aria-hidden="true">
            <i
              style={{ width: `${cap && active ? Math.min(100, (nextBidCents / cap) * 100) : 0}%` }}
            />
          </div>
        </div>
        <div className={valueTone} aria-label={valueLabel} title={valueLabel}>
          <span>
            Δ vs ref{' '}
            <span aria-hidden="true">
              {delta === null ? '·' : delta > 0 ? '↑' : delta < 0 ? '↓' : '='}
            </span>
          </span>
          <strong>
            {delta === null
              ? '-'
              : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${price(Math.abs(delta))}`}
          </strong>
          <small>
            Ref {price(market)} · {price(projection?.fairLowCents)}–
            {price(projection?.fairHighCents)}
          </small>
        </div>
        <div title="Previous season auction cost in the main league">
          <span>
            {projection?.previousSeason ??
              `${Number(season.slice(0, 4)) - 1}–${season.slice(2, 4)}`}{' '}
            cost
          </span>
          <strong>{price(projection?.previousPriceCents)}</strong>
          <small>Main league</small>
        </div>
      </div>
      <div className={room.statHeader}>
        <span>{season} projected · per game</span>
      </div>
      <dl className={room.statGrid}>
        <div className={room.featuredStat} data-tone={pointsTier.tone} title={pointsTier.detail}>
          <dt>
            FP/G{' '}
            <span className={room.statTier} aria-label={`FP/G tier ${pointsTier.label}`}>
              {pointsTier.label}
            </span>
          </dt>
          <dd>{number(projection?.fantasyPointsPerGame)}</dd>
        </div>
        {statCells.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
        <div
          className={room.durabilityStat}
          data-tone={durability === null ? 'neutral' : durabilityTone(projection?.availabilityTier)}
          title={
            durability === null
              ? 'Projected availability unavailable'
              : `Projected availability: ${durability}% · ${projection?.availabilityTier}. Expected share of scheduled games played.`
          }
        >
          <dt>Durability</dt>
          <dd>{durability === null ? '-' : `${durability}%`}</dd>
          <div className={room.durabilityTrack} aria-hidden="true">
            <i style={{ width: `${durability ?? 0}%` }} />
          </div>
        </div>
      </dl>
      <p className={room.referenceScope}>Rank / price / FP: main league points model</p>
    </div>
  );
}
