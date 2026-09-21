'use client';

import type {
  HistoricalAuctionMarket,
  HistoricalRankingSnapshot,
  LatestProjectionSnapshot,
} from '@fantasy-basketball/database/runtime';
import type { PlayerSituation, PlayerSituationBoard } from '@fantasy-basketball/fantasy';
import { useMemo, useState } from 'react';

import { formatFantasyPoints, formatPrice, formatSignedPrice } from '../../lib/format';
import { AskEveButton } from '../app-shell';
import { DataUnavailable, PageHeader } from '../page-header';
import styles from '../workspace.module.css';

type SortKey = 'auction' | 'expected' | 'points' | 'points-per-game' | 'rank';
type ProjectionSortKey =
  | 'availability'
  | 'expected-market'
  | 'games'
  | 'playoffs'
  | 'points'
  | 'points-per-game'
  | 'rank'
  | 'usable';

export function PlayersView({
  market,
  projections,
  rankings,
  situations,
}: {
  readonly market: HistoricalAuctionMarket | null;
  readonly projections?: LatestProjectionSnapshot | null;
  readonly rankings: HistoricalRankingSnapshot | null;
  readonly situations?: PlayerSituationBoard | null;
}) {
  const [seasonKey, setSeasonKey] = useState(rankings?.summary.latestSeason ?? '');
  const [query, setQuery] = useState('');
  const [projectionQuery, setProjectionQuery] = useState('');
  const [projectionSortKey, setProjectionSortKey] = useState<ProjectionSortKey>('rank');
  const [sortKey, setSortKey] = useState<SortKey>('rank');
  const season = useMemo(
    () => rankings?.seasons.find((candidate) => candidate.seasonKey === seasonKey) ?? null,
    [rankings, seasonKey],
  );
  const marketByPlayer = useMemo(
    () => new Map((market?.players ?? []).map((player) => [player.playerId, player])),
    [market],
  );
  const players = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    const filtered = (season?.players ?? []).filter((player) =>
      player.playerName.toLocaleLowerCase().includes(normalized),
    );
    return [...filtered].sort((left, right) => {
      if (sortKey === 'points') return right.fantasyPoints - left.fantasyPoints;
      if (sortKey === 'points-per-game') {
        return right.fantasyPointsPerGame - left.fantasyPointsPerGame;
      }
      if (sortKey === 'auction') {
        return (right.auctionCostCents ?? -1) - (left.auctionCostCents ?? -1);
      }
      if (sortKey === 'expected') {
        return (
          (marketByPlayer.get(right.playerId)?.expectedPriceCents ?? -1) -
          (marketByPlayer.get(left.playerId)?.expectedPriceCents ?? -1)
        );
      }
      return left.rank - right.rank;
    });
  }, [marketByPlayer, query, season, sortKey]);
  const projectedPlayers = useMemo(() => {
    const normalized = projectionQuery.trim().toLocaleLowerCase();
    const filtered = (projections?.players ?? []).filter((player) =>
      player.playerName.toLocaleLowerCase().includes(normalized),
    );
    return [...filtered].sort((left, right) => {
      if (projectionSortKey === 'points') return right.fantasyPoints - left.fantasyPoints;
      if (projectionSortKey === 'points-per-game') {
        return right.fantasyPointsPerGame - left.fantasyPointsPerGame;
      }
      if (projectionSortKey === 'games') {
        return right.availability.expectedGames - left.availability.expectedGames;
      }
      if (projectionSortKey === 'availability') {
        return right.availability.rate - left.availability.rate;
      }
      if (projectionSortKey === 'playoffs') {
        return (
          (right.schedule?.weightedExpectedPoints ?? -1) -
          (left.schedule?.weightedExpectedPoints ?? -1)
        );
      }
      if (projectionSortKey === 'usable') {
        return (right.usableValue?.valueCents ?? -1) - (left.usableValue?.valueCents ?? -1);
      }
      if (projectionSortKey === 'expected-market') {
        return (
          (marketByPlayer.get(right.playerId)?.expectedPriceCents ?? -1) -
          (marketByPlayer.get(left.playerId)?.expectedPriceCents ?? -1)
        );
      }
      return left.rank - right.rank;
    });
  }, [marketByPlayer, projectionQuery, projections, projectionSortKey]);
  const averagePointsPerGame =
    season && season.players.length > 0
      ? season.players.reduce((total, player) => total + player.fantasyPointsPerGame, 0) /
        season.players.length
      : 0;
  const situationTone = (direction: PlayerSituation['opportunity']['direction']) =>
    direction === 'up' ? styles.positive : direction === 'down' ? styles.negative : styles.neutral;
  const advancedSummary = (player: PlayerSituation): string => {
    const metrics = [
      player.advanced.usagePercentage === null
        ? null
        : `${(player.advanced.usagePercentage * 100).toFixed(1)}% usage`,
      player.advanced.touchesPerGame === null
        ? null
        : `${player.advanced.touchesPerGame.toFixed(1)} touches`,
      player.advanced.dribblesPerTouch === null
        ? null
        : `${player.advanced.dribblesPerTouch.toFixed(1)} dribbles/touch`,
      player.advanced.potentialAssistsPerGame === null
        ? null
        : `${player.advanced.potentialAssistsPerGame.toFixed(1)} potential AST`,
      player.advanced.secondaryAssistsPerGame === null
        ? null
        : `${player.advanced.secondaryAssistsPerGame.toFixed(1)} hockey AST`,
    ].filter((metric): metric is string => metric !== null);
    return metrics.length === 0 ? 'Advanced import pending' : metrics.join(' · ');
  };

  return (
    <div className={styles.page}>
      <PageHeader
        actions={
          <AskEveButton
            className={styles.primaryButton}
            context={{
              projectionAsOf: projections?.asOf ?? null,
              projectionSeason: projections?.seasonKey ?? null,
              season: season?.seasonKey ?? null,
            }}
            prompt={
              projections
                ? `Analyze the ${projections.seasonKey} projection board as of ${projections.asOf}. Prioritize total fantasy points, expected games, availability risk, double- and triple-double bonuses, and this league's historical auction prices.`
                : `Compare ${season?.seasonKey ?? 'the available'} historical fantasy production with this league's auction prices. Call out expensive names, inexpensive production, and important caveats.`
            }
          >
            Analyze board
          </AskEveButton>
        }
        description="Compare availability-adjusted projections, historical production, and league auction prices."
        title="Player rankings"
      />

      {projections ? (
        <div className={styles.notice}>
          <strong>{projections.seasonKey} forecast</strong>
          {projections.source} source · as of {projections.asOf.slice(0, 10)} · expected games drive
          availability-adjusted totals. Bonus rates are estimated from historical game results.{' '}
          {projections.calendar == null ? (
            <span className={styles.neutral}>Calendar Pending</span>
          ) : (
            <span
              className={
                projections.calendar.status === 'current' ? styles.positive : styles.negative
              }
            >
              Calendar {projections.calendar.status === 'current' ? 'Current' : 'Stale'} · as of{' '}
              {projections.calendar.asOf.slice(0, 10)} ·{' '}
              {projections.calendar.fingerprint.slice(0, 8)}
            </span>
          )}
          {projections.players.some((player) => player.usableValue != null) ? (
            <span className={styles.positive}>
              {' '}
              · Usable lineup{' '}
              {
                projections.players.find((player) => player.usableValue != null)?.usableValue
                  ?.modelVersion
              }{' '}
              · schedule as of{' '}
              {projections.players
                .find((player) => player.usableValue != null)
                ?.usableValue?.schedule.asOf.slice(0, 10)}
            </span>
          ) : null}
        </div>
      ) : (
        <div className={styles.warning}>
          <strong>Historical actuals</strong>
          Projection import pending. Add the private Hashtag export and run the projection importer;
          completed-season results remain available below.
        </div>
      )}

      {projections ? (
        <section aria-label="Projection summary" className={styles.stats}>
          <article className={styles.statCard}>
            <span>Projection season</span>
            <strong>{projections.seasonKey}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Projected players</span>
            <strong>{projections.summary.playerCount}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Durable tier</span>
            <strong>{projections.summary.durablePlayerCount}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Fragile tier</span>
            <strong>{projections.summary.fragilePlayerCount}</strong>
          </article>
        </section>
      ) : season ? (
        <section aria-label="Ranking summary" className={styles.stats}>
          <article className={styles.statCard}>
            <span>Scored seasons</span>
            <strong>{rankings?.summary.seasonCount ?? 0}</strong>
          </article>
          <article className={styles.statCard}>
            <span>{season.seasonKey} players</span>
            <strong>{season.players.length}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Average FP/G</span>
            <strong>{formatFantasyPoints(averagePointsPerGame)}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Historical purchases</span>
            <strong>{market?.summary.purchaseCount ?? '—'}</strong>
          </article>
        </section>
      ) : null}

      {situations && situations.players.length > 0 ? (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>Situation intelligence</h2>
              <p>
                This season versus the latest prior season · context as of{' '}
                {situations.asOf.slice(0, 10)} · {situations.summary.newTeamPlayerCount} new teams ·{' '}
                {situations.summary.opportunityUpPlayerCount} opportunity risers ·{' '}
                {situations.summary.advancedStatPlayerCount} advanced-stat profiles
              </p>
            </div>
            <span className={`${styles.statusBadge} ${styles.statusReady}`}>
              Evidence separated
            </span>
          </header>
          <div className={styles.tableViewport}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Player</th>
                  <th scope="col">Team movement</th>
                  <th scope="col">Opportunity</th>
                  <th scope="col">Prior role indicators</th>
                  <th scope="col">Rotation competition</th>
                  <th scope="col">Availability context</th>
                </tr>
              </thead>
              <tbody>
                {situations.players.map((player) => (
                  <tr key={player.playerId}>
                    <th
                      aria-label={`${player.playerName}, ${player.positions.join(', ')}`}
                      scope="row"
                    >
                      <span className={styles.tablePlayer}>
                        <strong>{player.playerName}</strong>
                        <small>{player.positions.join(' · ')}</small>
                      </span>
                    </th>
                    <td
                      aria-label={`${player.playerName} team movement: ${player.previousTeamAbbreviation ?? 'no prior team'} to ${player.currentTeamAbbreviation}`}
                    >
                      <span className={styles.tablePlayer}>
                        <strong>
                          {player.previousTeamAbbreviation ?? 'No prior team'} →{' '}
                          {player.currentTeamAbbreviation}
                        </strong>
                        <small>
                          {player.movement.isNewTeam
                            ? player.movement.type === 'unknown'
                              ? 'Type unverified'
                              : player.movement.type.replaceAll('-', ' ')
                            : 'Returning team'}
                          {player.movement.note ? ` · ${player.movement.note}` : null}
                          {player.movement.sourceUrl ? (
                            <>
                              {' · '}
                              <a
                                className={styles.evidenceLink}
                                href={player.movement.sourceUrl}
                                rel="noreferrer noopener"
                                target="_blank"
                              >
                                Source
                              </a>
                            </>
                          ) : null}
                        </small>
                      </span>
                    </td>
                    <td
                      aria-label={`${player.playerName} opportunity: ${player.opportunity.direction}`}
                      className={situationTone(player.opportunity.direction)}
                    >
                      <span className={styles.tablePlayer}>
                        <strong>{player.opportunity.direction}</strong>
                        <small>
                          {player.opportunity.deltaPercent === null
                            ? player.opportunity.source.replaceAll('-', ' ')
                            : `${player.opportunity.deltaPercent > 0 ? '+' : ''}${Math.round(
                                player.opportunity.deltaPercent * 100,
                              )}% box-score proxy`}
                        </small>
                        {player.role ? (
                          <small>
                            {player.role.depthRole ?? 'Reviewed role'} · {player.role.note} ·{' '}
                            <a
                              className={styles.evidenceLink}
                              href={player.role.sourceUrl}
                              rel="noreferrer noopener"
                              target="_blank"
                            >
                              Source
                            </a>
                          </small>
                        ) : null}
                      </span>
                    </td>
                    <td>{advancedSummary(player)}</td>
                    <td aria-label={`${player.playerName} rotation competition`}>
                      {player.competition.length === 0
                        ? 'No overlapping projection'
                        : player.competition.map((candidate) => candidate.playerName).join(', ')}
                    </td>
                    <td aria-label={`${player.playerName} availability context`}>
                      <span className={styles.tablePlayer}>
                        <strong>
                          {player.injury?.status ??
                            (player.availability.wasLimitedLastSeason
                              ? `${player.availability.previousGames} GP last season`
                              : `${player.availability.expectedGames.toFixed(1)} projected games`)}
                        </strong>
                        <small>
                          {player.injury?.summary ??
                            (player.availability.wasLimitedLastSeason
                              ? 'Cause not attributed without evidence'
                              : 'No sourced injury context')}
                          {player.injury ? (
                            <>
                              {' · '}
                              <a
                                className={styles.evidenceLink}
                                href={player.injury.sourceUrl}
                                rel="noreferrer noopener"
                                target="_blank"
                              >
                                Source
                              </a>
                            </>
                          ) : null}
                        </small>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {projections ? (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>Season projection board</h2>
              <p>
                {projections.modelVersion} ·{' '}
                {projections.calendar == null
                  ? 'playoff schedule pending'
                  : projections.calendar.playoffPeriods
                      .map(
                        (period) =>
                          `${period.label} P${period.scoringPeriod} (${period.startAt.slice(0, 10)}–${period.endAt.slice(0, 10)})`,
                      )
                      .join(' · ')}
              </p>
            </div>
            <div className={styles.toolbar}>
              <label className={styles.field}>
                <span>Sort</span>
                <select
                  aria-label="Sort projections"
                  onChange={(event) =>
                    setProjectionSortKey(event.target.value as ProjectionSortKey)
                  }
                  value={projectionSortKey}
                >
                  <option value="rank">Projected rank</option>
                  <option value="points">Fantasy points</option>
                  <option value="points-per-game">Points per game</option>
                  <option value="games">Expected games</option>
                  <option value="availability">Availability rate</option>
                  <option value="playoffs">Playoff value</option>
                  <option value="usable">Usable auction value</option>
                  <option value="expected-market">Historical market</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Search</span>
                <input
                  aria-label="Find projected player"
                  onChange={(event) => setProjectionQuery(event.target.value)}
                  placeholder="Player name"
                  type="search"
                  value={projectionQuery}
                />
              </label>
            </div>
          </header>
          <div className={styles.tableViewport}>
            <a className={styles.skipLink} href="#after-season-projections">
              Skip season projections table
            </a>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Player</th>
                  <th scope="col">Projected FP</th>
                  <th scope="col">Usable FP</th>
                  <th scope="col">Congestion loss</th>
                  <th scope="col">FP/G</th>
                  <th scope="col">Expected games</th>
                  <th scope="col">Availability</th>
                  <th scope="col">Expected 2D / 3D</th>
                  <th scope="col">Playoff value</th>
                  <th scope="col">Historical market</th>
                  <th scope="col">Usable value</th>
                </tr>
              </thead>
              <tbody>
                {projectedPlayers.map((player) => {
                  const marketPlayer = marketByPlayer.get(player.playerId);
                  return (
                    <tr key={player.playerId}>
                      <td className={styles.rank}>{player.rank}</td>
                      <th aria-label={player.playerName} scope="row">
                        <span className={styles.tablePlayer}>
                          <strong>{player.playerName}</strong>
                          <small>
                            {[player.teamAbbreviation, ...player.positions]
                              .filter(Boolean)
                              .join(' · ')}
                          </small>
                        </span>
                      </th>
                      <td>{formatFantasyPoints(player.fantasyPoints)}</td>
                      <td>
                        {player.usableValue
                          ? formatFantasyPoints(player.usableValue.diagnostics.usablePoints)
                          : '—'}
                      </td>
                      <td>
                        {player.usableValue
                          ? formatFantasyPoints(player.usableValue.diagnostics.congestionLoss)
                          : '—'}
                      </td>
                      <td>{formatFantasyPoints(player.fantasyPointsPerGame)}</td>
                      <td>{player.availability.expectedGames.toFixed(1)}</td>
                      <td
                        className={
                          player.availability.tier === 'durable'
                            ? styles.positive
                            : player.availability.tier === 'fragile'
                              ? styles.negative
                              : styles.neutral
                        }
                      >
                        {Math.round(player.availability.rate * 100)}% · {player.availability.tier}
                      </td>
                      <td>
                        {player.bonuses.expectedDoubleDoubles.toFixed(1)} /{' '}
                        {player.bonuses.expectedTripleDoubles.toFixed(1)}
                      </td>
                      <td>
                        {player.schedule
                          ? `${formatFantasyPoints(player.schedule.weightedExpectedPoints)} · ${player.schedule.fantasyPlayoffWeeks
                              .map((period) => period.scheduledGames)
                              .join('/')} games`
                          : 'Pending'}
                      </td>
                      <td>{marketPlayer ? formatPrice(marketPlayer.expectedPriceCents) : '—'}</td>
                      <td>
                        {player.usableValue ? formatPrice(player.usableValue.valueCents) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {projectedPlayers.length === 0 ? (
              <div className={styles.empty}>
                <strong>No matching player</strong>
                Try a different search.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      <section className={styles.panel} id="after-season-projections">
        <header className={styles.panelHeader}>
          <div>
            <h2>Production and market board</h2>
            <p>
              {season ? `${season.ruleSetName} v${season.ruleSetVersion}` : 'Ranking data'} ·
              completed seasons only; newer auction seasons receive more weight in expected price.
            </p>
          </div>
          {rankings && season ? (
            <div className={styles.toolbar}>
              <label className={styles.field}>
                <span>Season</span>
                <select
                  aria-label="Ranking season"
                  onChange={(event) => setSeasonKey(event.target.value)}
                  value={season.seasonKey}
                >
                  {rankings.seasons.map((candidate) => (
                    <option key={candidate.seasonKey} value={candidate.seasonKey}>
                      {candidate.seasonKey}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Sort</span>
                <select
                  aria-label="Sort players"
                  onChange={(event) => setSortKey(event.target.value as SortKey)}
                  value={sortKey}
                >
                  <option value="rank">Season rank</option>
                  <option value="points">Fantasy points</option>
                  <option value="points-per-game">Points per game</option>
                  <option value="auction">Season auction cost</option>
                  <option value="expected">Expected market price</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Search</span>
                <input
                  aria-label="Find player"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Player name"
                  type="search"
                  value={query}
                />
              </label>
            </div>
          ) : null}
        </header>

        {rankings === null || season === null ? (
          <DataUnavailable
            detail="Run the production and scoring imports, then refresh this page."
            title="Historical rankings unavailable"
          />
        ) : (
          <>
            <div className={styles.tableViewport}>
              <a className={styles.skipLink} href="#after-historical-production">
                Skip historical production table
              </a>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Rank</th>
                    <th scope="col">Player</th>
                    <th scope="col">Fantasy points</th>
                    <th scope="col">FP/G</th>
                    <th scope="col">Games</th>
                    <th scope="col">Draft cost</th>
                    <th scope="col">Expected market</th>
                    <th scope="col">Vs. expected</th>
                  </tr>
                </thead>
                <tbody>
                  {players.map((player) => {
                    const marketPlayer = marketByPlayer.get(player.playerId);
                    const delta =
                      player.auctionCostCents === null || marketPlayer === undefined
                        ? null
                        : player.auctionCostCents - marketPlayer.expectedPriceCents;
                    return (
                      <tr key={player.playerId}>
                        <td className={styles.rank}>{player.rank}</td>
                        <th aria-label={player.playerName} scope="row">
                          <span className={styles.tablePlayer}>
                            <strong>{player.playerName}</strong>
                            <small>
                              {marketPlayer
                                ? `${marketPlayer.seasonsDrafted} league drafts`
                                : 'No auction history'}
                            </small>
                          </span>
                        </th>
                        <td>{formatFantasyPoints(player.fantasyPoints)}</td>
                        <td>{formatFantasyPoints(player.fantasyPointsPerGame)}</td>
                        <td>{player.gamesPlayed}</td>
                        <td>
                          {player.auctionCostCents === null
                            ? 'Undrafted'
                            : formatPrice(player.auctionCostCents)}
                        </td>
                        <td>{marketPlayer ? formatPrice(marketPlayer.expectedPriceCents) : '—'}</td>
                        <td
                          className={
                            delta === null || delta === 0
                              ? styles.neutral
                              : delta < 0
                                ? styles.positive
                                : styles.negative
                          }
                        >
                          {delta === null ? '—' : formatSignedPrice(delta)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {players.length === 0 ? (
                <div className={styles.empty}>
                  <strong>No matching player</strong>
                  Try a different search.
                </div>
              ) : null}
            </div>
            <span id="after-historical-production" />
          </>
        )}
      </section>
    </div>
  );
}
