'use client';

import type { LeagueRosterSnapshot } from '@fantasy-basketball/database/runtime';
import { useMemo, useState } from 'react';

import { formatPrice } from '../../lib/format';
import { AskEveButton } from '../app-shell';
import { DataUnavailable, PageHeader } from '../page-header';
import styles from '../workspace.module.css';

export function TradesView({
  authenticated,
  snapshot,
}: {
  readonly authenticated: boolean;
  readonly snapshot: LeagueRosterSnapshot | null;
}) {
  const initialSeason =
    snapshot?.summary.latestPopulatedSeason ?? snapshot?.summary.latestSeason ?? '';
  const [seasonKey, setSeasonKey] = useState(initialSeason);
  const season = useMemo(
    () => snapshot?.seasons.find((candidate) => candidate.seasonKey === seasonKey) ?? null,
    [seasonKey, snapshot],
  );
  const [leftTeamId, setLeftTeamId] = useState(
    snapshot?.seasons.find((candidate) => candidate.seasonKey === initialSeason)?.teams[0]
      ?.teamSeasonId ?? '',
  );
  const [rightTeamId, setRightTeamId] = useState(
    snapshot?.seasons.find((candidate) => candidate.seasonKey === initialSeason)?.teams[1]
      ?.teamSeasonId ?? '',
  );
  const leftTeam = season?.teams.find((team) => team.teamSeasonId === leftTeamId) ?? null;
  const rightTeam = season?.teams.find((team) => team.teamSeasonId === rightTeamId) ?? null;

  const changeSeason = (nextSeasonKey: string) => {
    const nextSeason = snapshot?.seasons.find((candidate) => candidate.seasonKey === nextSeasonKey);
    setSeasonKey(nextSeasonKey);
    setLeftTeamId(nextSeason?.teams[0]?.teamSeasonId ?? '');
    setRightTeamId(nextSeason?.teams[1]?.teamSeasonId ?? '');
  };

  return (
    <div className={styles.page}>
      <PageHeader
        actions={
          leftTeam && rightTeam ? (
            <AskEveButton
              className={styles.primaryButton}
              context={{
                season: season?.seasonKey ?? null,
                teamA: leftTeam.teamName,
                teamB: rightTeam.teamName,
              }}
              prompt={`Compare ${leftTeam.teamName}, owned by ${leftTeam.owner?.displayName ?? 'an unresolved manager'}, with ${rightTeam.teamName}, owned by ${rightTeam.owner?.displayName ?? 'an unresolved manager'}, using their ${season?.seasonKey} draft rosters. Identify complementary strengths and plausible trade conversations, while clearly noting that these are draft snapshots without projections or later transactions.`}
            >
              Compare with Eve
            </AskEveButton>
          ) : null
        }
        description="Compare two historical roster builds and prepare a grounded trade conversation."
        title="Trade lab"
      />

      <div className={styles.warning}>
        <strong>Historical roster lab</strong>
        This view uses draft-day rosters. It does not yet know current ownership, injuries,
        transactions, or projected rest-of-season value.
      </div>

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>Team comparison</h2>
            <p>Select a season and two teams; Eve receives the same comparison context.</p>
          </div>
          {snapshot && season ? (
            <div className={styles.toolbar}>
              <label className={styles.field}>
                <span>Season</span>
                <select
                  aria-label="Trade season"
                  onChange={(event) => changeSeason(event.target.value)}
                  value={seasonKey}
                >
                  {snapshot.seasons
                    .filter((candidate) => candidate.draftedPlayerCount > 0)
                    .map((candidate) => (
                      <option key={candidate.seasonKey} value={candidate.seasonKey}>
                        {candidate.seasonKey}
                      </option>
                    ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Team A</span>
                <select
                  aria-label="First trade team"
                  onChange={(event) => setLeftTeamId(event.target.value)}
                  value={leftTeamId}
                >
                  {season.teams.map((team) => (
                    <option
                      disabled={team.teamSeasonId === rightTeamId}
                      key={team.teamSeasonId}
                      value={team.teamSeasonId}
                    >
                      {team.owner?.displayName ?? team.teamName}
                    </option>
                  ))}
                </select>
              </label>
              <label className={styles.field}>
                <span>Team B</span>
                <select
                  aria-label="Second trade team"
                  onChange={(event) => setRightTeamId(event.target.value)}
                  value={rightTeamId}
                >
                  {season.teams.map((team) => (
                    <option
                      disabled={team.teamSeasonId === leftTeamId}
                      key={team.teamSeasonId}
                      value={team.teamSeasonId}
                    >
                      {team.owner?.displayName ?? team.teamName}
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
                ? 'Historical rosters could not be loaded.'
                : 'Sign in with the league owner account to compare private rosters.'
            }
            title={authenticated ? 'Trade data unavailable' : 'Owner access required'}
          />
        ) : leftTeam && rightTeam ? (
          <div className={styles.rosterGrid}>
            {[leftTeam, rightTeam].map((team) => (
              <article className={styles.rosterCard} key={team.teamSeasonId}>
                <header className={styles.cardHeading}>
                  <div>
                    <h3>{team.teamName}</h3>
                    <p>{team.owner?.displayName ?? 'Owner unresolved'}</p>
                  </div>
                  <span className={styles.badge}>{team.rosterCount} players</span>
                </header>
                <div className={styles.metrics}>
                  <span>
                    <small>Draft spend</small>
                    <strong>{formatPrice(team.spendCents)}</strong>
                  </span>
                  <span>
                    <small>Base balance</small>
                    <strong>{formatPrice(team.baseBudgetBalanceCents)}</strong>
                  </span>
                  <span>
                    <small>Average cost</small>
                    <strong>
                      {team.rosterCount === 0
                        ? '—'
                        : formatPrice(Math.round(team.spendCents / team.rosterCount))}
                    </strong>
                  </span>
                </div>
                <ol className={styles.rosterList}>
                  {team.roster.map((player) => (
                    <li key={player.playerId}>
                      <span>{player.playerName}</span>
                      <strong>{formatPrice(player.auctionCostCents)}</strong>
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        ) : (
          <DataUnavailable detail="Choose two teams with imported rosters." title="Select teams" />
        )}
      </section>
    </div>
  );
}
