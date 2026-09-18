'use client';

import type {
  HistoricalAuctionMarket,
  HistoricalRankingSnapshot,
  LeaguePostseasonResult,
  LeagueRosterActivityHistory,
  LeagueRosterSnapshot,
} from '@fantasy-basketball/database/runtime';
import { leagueOwnerProfile } from '@fantasy-basketball/fantasy';
import { useMemo, useState } from 'react';

import { formatFantasyPoints, formatPrice } from '../../lib/format';
import { buildRosterActivitySignals } from '../../lib/roster-activity-signals';
import { AskEveButton } from '../app-shell';
import { DataUnavailable, PageHeader } from '../page-header';
import styles from '../workspace.module.css';

export function WaiversView({
  activity,
  authenticated,
  market,
  rankings,
  rosterSnapshot,
}: {
  readonly activity: LeagueRosterActivityHistory | null;
  readonly authenticated: boolean;
  readonly market: HistoricalAuctionMarket | null;
  readonly rankings: HistoricalRankingSnapshot | null;
  readonly rosterSnapshot: LeagueRosterSnapshot | null;
}) {
  const initialSeason =
    activity?.summary.latestSeason ?? rosterSnapshot?.summary.latestPopulatedSeason ?? '';
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
  const activitySeason = useMemo(
    () => activity?.seasons.find((season) => season.seasonKey === seasonKey) ?? null,
    [activity, seasonKey],
  );
  const activitySignals = useMemo(
    () => (activity === null ? null : buildRosterActivitySignals(activity)),
    [activity],
  );
  const ownerSignal = activitySignals?.managers.find(
    (manager) => manager.managerName === leagueOwnerProfile.displayName,
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
            prompt={`Analyze ${seasonKey || 'historical'} roster activity alongside league outcomes. Compare manager churn, likely adds and drops, and productive players absent from the draft. Identify repeatable associations without describing inferred roster deltas as confirmed transactions.`}
          >
            Analyze roster activity
          </AskEveButton>
        }
        description="Study productive players who were absent from historical draft snapshots and shape a future streaming model."
        eyebrow="Player acquisition"
        title="Waiver research"
      />

      <div className={styles.warning}>
        <strong>Roster changes, not confirmed transactions</strong>
        Daily Fantrax snapshots now reveal when ownership changed. Adds, drops, and direct team
        changes are inferred from adjacent days; they do not include waiver priority, FAAB, trade
        packages, or Fantrax’s transaction label.
      </div>

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>Inferred roster activity</h2>
            <p>Compare how frequently each manager churned the roster during the season.</p>
          </div>
        </header>

        {activitySeason === null ? (
          <DataUnavailable
            detail={
              authenticated
                ? 'Daily roster snapshots have not been imported for this season.'
                : 'Sign in with the league owner account to review private roster activity.'
            }
            title={authenticated ? 'Roster activity unavailable' : 'Owner access required'}
          />
        ) : (
          <>
            <div className={styles.stats}>
              <article className={styles.statCard}>
                <span>Daily snapshots</span>
                <strong>{activitySeason.snapshotCount}</strong>
              </article>
              <article className={styles.statCard}>
                <span>Ownership changes</span>
                <strong>{activitySeason.changeCount}</strong>
              </article>
              <article className={styles.statCard}>
                <span>Baseline period</span>
                <strong>{activitySeason.baselineRosterPeriod}</strong>
              </article>
            </div>
            <div className={styles.tableViewport}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Manager</th>
                    <th scope="col">Finish</th>
                    <th scope="col">Adds</th>
                    <th scope="col">Transfers in</th>
                    <th scope="col">Drops</th>
                    <th scope="col">Transfers out</th>
                    <th scope="col">Acquisitions</th>
                  </tr>
                </thead>
                <tbody>
                  {activitySeason.teams.map((team) => {
                    const outcome = team.outcome;
                    return (
                      <tr key={team.teamSeasonId}>
                        <th aria-label={team.managerName ?? team.teamName} scope="row">
                          <span className={styles.tablePlayer}>
                            <strong>{team.managerName ?? 'Owner unresolved'}</strong>
                            <small>{team.teamName}</small>
                          </span>
                        </th>
                        <td>
                          {outcome === null
                            ? '—'
                            : `${formatPostseasonResult(outcome.postseasonResult)} · #${outcome.rank}`}
                        </td>
                        <td>{team.addCount}</td>
                        <td>{team.transferInCount}</td>
                        <td>{team.dropCount}</td>
                        <td>{team.transferOutCount}</td>
                        <td>{team.totalAcquisitionCount}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className={styles.tableViewport}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Observed</th>
                    <th scope="col">Player</th>
                    <th scope="col">Change</th>
                    <th scope="col">From</th>
                    <th scope="col">To</th>
                  </tr>
                </thead>
                <tbody>
                  {activitySeason.changes.slice(0, 50).map((change) => (
                    <tr key={`${change.rosterPeriod}:${change.playerId}`}>
                      <td>{formatDate(change.observedAt)}</td>
                      <th aria-label={change.playerName} scope="row">
                        {change.playerName}
                      </th>
                      <td>{formatChangeType(change.changeType)}</td>
                      <td>
                        {change.fromTeam?.managerName ?? change.fromTeam?.teamName ?? 'Free agent'}
                      </td>
                      <td>
                        {change.toTeam?.managerName ?? change.toTeam?.teamName ?? 'Free agent'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      {activitySignals && activitySignals.sampleSize > 0 ? (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>Winning behavior signals</h2>
              <p>
                Cross-season association from {activitySignals.sampleSize} team-seasons. This does
                not establish that roster churn causes winning.
              </p>
            </div>
          </header>
          <div className={styles.stats}>
            {activitySignals.cohorts.map((cohort) => (
              <article className={styles.statCard} key={cohort.key}>
                <span>{cohort.label}</span>
                <strong>{formatAverage(cohort.averageAcquisitions)}</strong>
                <small>acquisitions/season · n={cohort.teamSeasonCount}</small>
              </article>
            ))}
            {ownerSignal ? (
              <article className={styles.statCard}>
                <span>{leagueOwnerProfile.nickname}'s teams</span>
                <strong>{formatAverage(ownerSignal.averageAcquisitions)}</strong>
                <small>
                  acquisitions/season · playoffs {ownerSignal.playoffAppearances}/
                  {ownerSignal.seasonCount}
                </small>
              </article>
            ) : null}
          </div>
          <div className={styles.tableViewport}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Manager</th>
                  <th scope="col">Seasons</th>
                  <th scope="col">Playoffs</th>
                  <th scope="col">Titles</th>
                  <th scope="col">Average finish</th>
                  <th scope="col">Average acquisitions</th>
                </tr>
              </thead>
              <tbody>
                {activitySignals.managers.map((manager) => (
                  <tr key={manager.leagueMemberId ?? manager.managerName}>
                    <th aria-label={manager.managerName} scope="row">
                      {manager.managerName}
                    </th>
                    <td>{manager.seasonCount}</td>
                    <td>{manager.playoffAppearances}</td>
                    <td>{manager.championships}</td>
                    <td>#{formatAverage(manager.averageRank)}</td>
                    <td>{formatAverage(manager.averageAcquisitions)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

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

const formatDate = (value: string): string =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
    new Date(value),
  );

const formatChangeType = (value: 'add' | 'drop' | 'team-change'): string =>
  ({ add: 'Added', drop: 'Dropped', 'team-change': 'Team change' })[value];

const formatPostseasonResult = (value: LeaguePostseasonResult): string =>
  ({
    champion: 'Champion',
    'missed-playoffs': 'Missed playoffs',
    'playoff-qualifier': 'Playoff qualifier',
    quarterfinalist: 'Quarterfinalist',
    'runner-up': 'Runner-up',
    semifinalist: 'Semifinalist',
  })[value];

const formatAverage = (value: number): string => value.toFixed(1);
