'use client';

import type {
  HistoricalAuctionMarket,
  HistoricalRankingSnapshot,
  LeagueRosterSnapshot,
} from '@fantasy-basketball/database/runtime';
import { useMemo, useState } from 'react';

import { formatFantasyPoints, formatPrice } from '../../lib/format';
import { AskEveButton } from '../app-shell';
import { DataUnavailable, PageHeader } from '../page-header';
import styles from '../workspace.module.css';

export function WaiversView({
  authenticated,
  market,
  rankings,
  rosterSnapshot,
}: {
  readonly authenticated: boolean;
  readonly market: HistoricalAuctionMarket | null;
  readonly rankings: HistoricalRankingSnapshot | null;
  readonly rosterSnapshot: LeagueRosterSnapshot | null;
}) {
  const initialSeason = rosterSnapshot?.summary.latestPopulatedSeason ?? '';
  const [seasonKey, setSeasonKey] = useState(initialSeason);
  const [query, setQuery] = useState('');
  const rosterSeason = useMemo(
    () => rosterSnapshot?.seasons.find((season) => season.seasonKey === seasonKey) ?? null,
    [rosterSnapshot, seasonKey],
  );
  const rankingSeason = useMemo(
    () => rankings?.seasons.find((season) => season.seasonKey === seasonKey) ?? null,
    [rankings, seasonKey],
  );
  const marketByPlayer = useMemo(
    () => new Map((market?.players ?? []).map((player) => [player.playerId, player])),
    [market],
  );
  const availablePlayers = useMemo(() => {
    const rostered = new Set(
      (rosterSeason?.teams ?? []).flatMap((team) => team.roster.map((player) => player.playerId)),
    );
    const normalized = query.trim().toLocaleLowerCase();
    return (rankingSeason?.players ?? [])
      .filter(
        (player) =>
          !rostered.has(player.playerId) &&
          player.playerName.toLocaleLowerCase().includes(normalized),
      )
      .slice(0, 75);
  }, [query, rankingSeason, rosterSeason]);
  const seasons = (rosterSnapshot?.seasons ?? []).filter(
    (season) =>
      season.draftedPlayerCount > 0 &&
      rankings?.seasons.some((rankingSeason) => rankingSeason.seasonKey === season.seasonKey),
  );

  return (
    <div className={styles.page}>
      <PageHeader
        actions={
          <AskEveButton
            className={styles.primaryButton}
            context={{ season: seasonKey || null }}
            prompt={`Review the strongest ${seasonKey || 'historical'} scorers who were absent from the imported draft rosters. Explain what this can teach us about waiver watchlists, but do not describe it as a live waiver wire.`}
          >
            Analyze missed players
          </AskEveButton>
        }
        description="Study productive players who were absent from historical draft snapshots and shape a future streaming model."
        eyebrow="Player acquisition"
        title="Waiver research"
      />

      <div className={styles.warning}>
        <strong>Not the live waiver wire</strong>
        This is a historical proxy: players with scored production who do not appear in that
        season’s imported auction rosters. Current availability and transactions need the Fantrax
        sync.
      </div>

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>Undrafted production</h2>
            <p>Useful for discovering the kinds of players the league left available.</p>
          </div>
          {rosterSeason && rankingSeason ? (
            <div className={styles.toolbar}>
              <label className={styles.field}>
                <span>Season</span>
                <select
                  aria-label="Waiver research season"
                  onChange={(event) => setSeasonKey(event.target.value)}
                  value={seasonKey}
                >
                  {seasons.map((season) => (
                    <option key={season.seasonKey} value={season.seasonKey}>
                      {season.seasonKey}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Search</span>
                <input
                  aria-label="Find historically available player"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Player name"
                  type="search"
                  value={query}
                />
              </label>
            </div>
          ) : null}
        </header>

        {rosterSnapshot === null ||
        rankings === null ||
        rosterSeason === null ||
        rankingSeason === null ? (
          <DataUnavailable
            detail={
              authenticated
                ? 'Both scored production and a populated roster snapshot are required.'
                : 'Sign in with the league owner account to compare production with private rosters.'
            }
            title={authenticated ? 'Waiver research unavailable' : 'Owner access required'}
          />
        ) : (
          <div className={styles.tableViewport}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Season rank</th>
                  <th scope="col">Player</th>
                  <th scope="col">Fantasy points</th>
                  <th scope="col">FP/G</th>
                  <th scope="col">Games</th>
                  <th scope="col">Expected market</th>
                </tr>
              </thead>
              <tbody>
                {availablePlayers.map((player) => {
                  const marketPlayer = marketByPlayer.get(player.playerId);
                  return (
                    <tr key={player.playerId}>
                      <td className={styles.rank}>{player.rank}</td>
                      <th aria-label={player.playerName} scope="row">
                        <span className={styles.tablePlayer}>
                          <strong>{player.playerName}</strong>
                          <small>Absent from imported draft roster</small>
                        </span>
                      </th>
                      <td>{formatFantasyPoints(player.fantasyPoints)}</td>
                      <td>{formatFantasyPoints(player.fantasyPointsPerGame)}</td>
                      <td>{player.gamesPlayed}</td>
                      <td>
                        {marketPlayer ? formatPrice(marketPlayer.expectedPriceCents) : 'No history'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {availablePlayers.length === 0 ? (
              <div className={styles.empty}>
                <strong>No matching player</strong>
                Try another season or search.
              </div>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
