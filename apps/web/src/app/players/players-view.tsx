'use client';

import type {
  HistoricalAuctionMarket,
  HistoricalRankingSnapshot,
} from '@fantasy-basketball/database/runtime';
import { useMemo, useState } from 'react';

import { formatFantasyPoints, formatPrice, formatSignedPrice } from '../../lib/format';
import { AskEveButton } from '../app-shell';
import { DataUnavailable, PageHeader } from '../page-header';
import styles from '../workspace.module.css';

type SortKey = 'auction' | 'expected' | 'points' | 'points-per-game' | 'rank';

export function PlayersView({
  market,
  rankings,
}: {
  readonly market: HistoricalAuctionMarket | null;
  readonly rankings: HistoricalRankingSnapshot | null;
}) {
  const [seasonKey, setSeasonKey] = useState(rankings?.summary.latestSeason ?? '');
  const [query, setQuery] = useState('');
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
  const averagePointsPerGame =
    season && season.players.length > 0
      ? season.players.reduce((total, player) => total + player.fantasyPointsPerGame, 0) /
        season.players.length
      : 0;

  return (
    <div className={styles.page}>
      <PageHeader
        actions={
          <AskEveButton
            className={styles.primaryButton}
            context={{ season: season?.seasonKey ?? null }}
            prompt={`Compare ${season?.seasonKey ?? 'the available'} historical fantasy production with this league's auction prices. Call out expensive names, inexpensive production, and important caveats.`}
          >
            Analyze the board
          </AskEveButton>
        }
        description="League-scored historical production alongside the prices this room has actually paid."
        eyebrow="Player research"
        title="Historical rankings"
      />

      <div className={styles.notice}>
        <strong>Historical actuals</strong>
        These are completed-season totals under the current scoring configuration—not forecasts or
        recommended bids. Projection, availability, and replacement-value models come next.
      </div>

      {season ? (
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

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>Production and market board</h2>
            <p>
              {season ? `${season.ruleSetName} v${season.ruleSetVersion}` : 'Ranking data'} · newer
              auction seasons receive more weight in expected price.
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
          <div className={styles.tableViewport}>
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
        )}
      </section>
    </div>
  );
}
