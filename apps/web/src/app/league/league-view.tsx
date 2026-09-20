'use client';

import type {
  LeaguePerformanceHistory,
  LeaguePostseasonResult,
  LeagueRosterSnapshot,
} from '@fantasy-basketball/database/runtime';
import { useMemo, useState } from 'react';

import { formatPrice } from '../../lib/format';
import { AskEveButton } from '../app-shell';
import { DataUnavailable, PageHeader } from '../page-header';
import styles from '../workspace.module.css';

export function LeagueView({
  authenticated,
  performance,
  snapshot,
}: {
  readonly authenticated: boolean;
  readonly performance: LeaguePerformanceHistory | null;
  readonly snapshot: LeagueRosterSnapshot | null;
}) {
  const [seasonKey, setSeasonKey] = useState(
    performance?.summary.latestSeason ??
      snapshot?.summary.latestPopulatedSeason ??
      snapshot?.summary.latestSeason ??
      '',
  );
  const [query, setQuery] = useState('');
  const season = useMemo(
    () => snapshot?.seasons.find((candidate) => candidate.seasonKey === seasonKey) ?? null,
    [seasonKey, snapshot],
  );
  const performanceSeason = useMemo(
    () => performance?.seasons.find((candidate) => candidate.seasonKey === seasonKey) ?? null,
    [performance, seasonKey],
  );
  const availableSeasons = useMemo(
    () =>
      [
        ...new Set([
          ...(performance?.seasons.map((candidate) => candidate.seasonKey) ?? []),
          ...(snapshot?.seasons.map((candidate) => candidate.seasonKey) ?? []),
        ]),
      ].sort((left, right) => right.localeCompare(left)),
    [performance, snapshot],
  );
  const teams = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length === 0) return season?.teams ?? [];
    return (season?.teams ?? []).filter(
      (team) =>
        team.teamName.toLocaleLowerCase().includes(normalized) ||
        team.owner?.displayName.toLocaleLowerCase().includes(normalized) === true ||
        team.roster.some((player) => player.playerName.toLocaleLowerCase().includes(normalized)),
    );
  }, [query, season]);
  const performanceTeams = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length === 0) return performanceSeason?.teams ?? [];
    return (performanceSeason?.teams ?? []).filter(
      (team) =>
        team.teamName.toLocaleLowerCase().includes(normalized) ||
        team.managerName?.toLocaleLowerCase().includes(normalized) === true,
    );
  }, [performanceSeason, query]);
  const regularSeasonLeader = performanceSeason?.teams.find((team) => team.rank === 1) ?? null;
  const strongestAllPlayTeam = [...(performanceSeason?.teams ?? [])].sort(
    (left, right) => right.allPlayWinPercentage - left.allPlayWinPercentage,
  )[0];

  return (
    <div className={styles.page}>
      <PageHeader
        actions={
          <AskEveButton
            className={styles.primaryButton}
            context={{ season: seasonKey || null }}
            prompt={`Analyze ${seasonKey || 'all available'} league outcomes. Compare regular-season standings, all-play strength, schedule luck, playoff results, active games, and the original auction rosters. Identify which repeatable behaviors appear associated with winning.`}
          >
            Analyze league
          </AskEveButton>
        }
        description="Compare regular-season strength, playoff results, and the auction rosters behind them."
        title="League outcomes"
      />

      {performanceSeason ? (
        <section aria-label="League summary" className={styles.stats}>
          <article className={styles.statCard}>
            <span>Playoff champion</span>
            <strong>{performanceSeason.champion?.managerName ?? '—'}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Regular-season leader</span>
            <strong>
              {regularSeasonLeader?.managerName ?? regularSeasonLeader?.teamName ?? '—'}
            </strong>
          </article>
          <article className={styles.statCard}>
            <span>Strongest all-play</span>
            <strong>
              {strongestAllPlayTeam === undefined
                ? '—'
                : `${strongestAllPlayTeam.managerName ?? strongestAllPlayTeam.teamName} · ${formatPercentage(strongestAllPlayTeam.allPlayWinPercentage)}`}
            </strong>
          </article>
          <article className={styles.statCard}>
            <span>Scoring format</span>
            <strong>{formatScoringType(performanceSeason.scoringType)}</strong>
          </article>
        </section>
      ) : null}

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>Success and failure profile</h2>
            <p>
              All-play estimates schedule-neutral strength; luck is actual wins minus expected wins.
            </p>
          </div>
          {availableSeasons.length > 0 ? (
            <div className={styles.toolbar}>
              <label className={styles.field}>
                <span>Season</span>
                <select
                  aria-label="Performance season"
                  onChange={(event) => {
                    setSeasonKey(event.target.value);
                    setQuery('');
                  }}
                  value={seasonKey}
                >
                  {availableSeasons.map((candidate) => (
                    <option key={candidate} value={candidate}>
                      {candidate}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Search</span>
                <input
                  aria-label="Find performance by team or owner"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Team or owner"
                  type="search"
                  value={query}
                />
              </label>
            </div>
          ) : null}
        </header>

        {performanceSeason === null ? (
          <DataUnavailable
            detail={
              authenticated
                ? 'Historical standings and weekly matchup scores have not been imported yet.'
                : 'Sign in with the league owner account to view historical outcomes.'
            }
            title={authenticated ? 'Performance data unavailable' : 'Owner access required'}
          />
        ) : (
          <div className={styles.tableViewport}>
            <a className={styles.skipLink} href="#after-league-performance">
              Skip league performance table
            </a>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Team</th>
                  <th>Record</th>
                  <th>Score / wk</th>
                  <th>Opp / wk</th>
                  <th>All-play</th>
                  <th>Luck wins</th>
                  <th>Active games</th>
                  <th>Consistency</th>
                  <th>Postseason</th>
                </tr>
              </thead>
              <tbody>
                {performanceTeams.map((team) => (
                  <tr key={team.teamSeasonId}>
                    <td className={styles.rank}>{team.rank}</td>
                    <td aria-label={`${team.teamName}, ${team.managerName ?? 'owner unresolved'}`}>
                      <span className={styles.tablePlayer}>
                        <strong>{team.teamName}</strong>
                        <small>{team.managerName ?? 'Owner unresolved'}</small>
                      </span>
                    </td>
                    <td>{team.record}</td>
                    <td>{formatMetric(team.averageWeeklyScore)}</td>
                    <td>{formatMetric(team.averageOpponentScore)}</td>
                    <td>{formatPercentage(team.allPlayWinPercentage)}</td>
                    <td
                      className={
                        team.luckWins > 0.5
                          ? styles.positive
                          : team.luckWins < -0.5
                            ? styles.negative
                            : styles.neutral
                      }
                    >
                      {team.luckWins > 0 ? '+' : ''}
                      {team.luckWins.toFixed(1)}
                    </td>
                    <td>{team.averageActiveGames.toFixed(1)}</td>
                    <td>±{team.scoreStandardDeviation.toFixed(1)}</td>
                    <td>
                      <span className={styles.badge}>
                        {formatPostseasonResult(team.postseasonResult)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className={styles.panel} id="after-league-performance">
        <header className={styles.panelHeader}>
          <div>
            <h2>Draft snapshots</h2>
            <p>These rosters represent auction results, before later trades and waiver moves.</p>
          </div>
          {snapshot && season && performance === null ? (
            <div className={styles.toolbar}>
              <label className={styles.field}>
                <span>Season</span>
                <select
                  aria-label="Roster season"
                  onChange={(event) => {
                    setSeasonKey(event.target.value);
                    setQuery('');
                  }}
                  value={season.seasonKey}
                >
                  {snapshot.seasons.map((candidate) => (
                    <option key={candidate.seasonKey} value={candidate.seasonKey}>
                      {candidate.seasonKey}
                      {candidate.rosterStatus === 'empty' ? ' · pending' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}
        </header>

        {snapshot === null || season === null ? (
          <DataUnavailable
            detail={
              authenticated
                ? 'The roster snapshot could not be loaded from the database.'
                : 'Sign in with the league owner account to view private roster history.'
            }
            title={authenticated ? 'League data unavailable' : 'Owner access required'}
          />
        ) : (
          <>
            {season.rosterStatus === 'empty' ? (
              <div className={styles.warning}>
                <strong>{season.seasonKey} roster pending.</strong>
                Team identities are ready, but no auction results have been imported for this season
                yet.
              </div>
            ) : null}
            <div className={styles.rosterGrid}>
              {teams.map((team) => (
                <article className={styles.rosterCard} key={team.teamSeasonId}>
                  <header className={styles.cardHeading}>
                    <div>
                      <h3>{team.teamName}</h3>
                      <p>{team.owner?.displayName ?? 'Owner unresolved'}</p>
                    </div>
                    <AskEveButton
                      className={styles.cardButton}
                      context={{ season: season.seasonKey, team: team.teamName }}
                      prompt={`Analyze ${team.owner?.displayName ?? team.teamName}'s ${season.seasonKey} auction roster for ${team.teamName}. Identify strengths, risks, value picks, and useful trade partners.`}
                    />
                  </header>
                  <div className={styles.metrics}>
                    <span>
                      <small>Roster</small>
                      <strong>
                        {team.rosterCount}/{season.rosterSize}
                      </strong>
                    </span>
                    <span>
                      <small>Spent</small>
                      <strong>{formatPrice(team.spendCents)}</strong>
                    </span>
                    <span>
                      <small>Base balance</small>
                      <strong>{formatPrice(team.baseBudgetBalanceCents)}</strong>
                    </span>
                  </div>
                  {team.roster.length === 0 ? (
                    <p className={styles.emptyInline}>Roster awaiting import</p>
                  ) : (
                    <ol className={styles.rosterList}>
                      {team.roster.map((player) => (
                        <li key={player.playerId}>
                          <span>{player.playerName}</span>
                          <strong>{formatPrice(player.auctionCostCents)}</strong>
                        </li>
                      ))}
                    </ol>
                  )}
                </article>
              ))}
              {teams.length === 0 ? (
                <div className={styles.empty}>
                  <strong>No matching roster</strong>
                  Try a different team, owner, or player name.
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const formatMetric = (value: number): string =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(value);

const formatPercentage = (value: number): string =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 0, style: 'percent' }).format(value);

const formatScoringType = (value: string): string =>
  value === 'HEAD_TO_HEAD_POINTS_BASED' ? 'Head-to-head points' : 'Head-to-head categories';

const formatPostseasonResult = (value: LeaguePostseasonResult): string =>
  ({
    champion: 'Champion',
    'missed-playoffs': 'Missed playoffs',
    'playoff-qualifier': 'Playoff qualifier',
    quarterfinalist: 'Quarterfinalist',
    'runner-up': 'Runner-up',
    semifinalist: 'Semifinalist',
  })[value];
