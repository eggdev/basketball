'use client';

import type { LeagueRosterSnapshot } from '@fantasy-basketball/database/runtime';
import { useMemo, useState } from 'react';

import { formatPrice } from '../../lib/format';
import { AskEveButton } from '../app-shell';
import { DataUnavailable, PageHeader } from '../page-header';
import styles from '../workspace.module.css';

export function LeagueView({
  authenticated,
  snapshot,
}: {
  readonly authenticated: boolean;
  readonly snapshot: LeagueRosterSnapshot | null;
}) {
  const [seasonKey, setSeasonKey] = useState(
    snapshot?.summary.latestPopulatedSeason ?? snapshot?.summary.latestSeason ?? '',
  );
  const [query, setQuery] = useState('');
  const season = useMemo(
    () => snapshot?.seasons.find((candidate) => candidate.seasonKey === seasonKey) ?? null,
    [seasonKey, snapshot],
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

  return (
    <div className={styles.page}>
      <PageHeader
        actions={
          <AskEveButton
            className={styles.primaryButton}
            context={{ season: season?.seasonKey ?? null }}
            prompt={`Compare every ${season?.seasonKey ?? 'available'} league roster. Identify construction patterns, value picks, and teams that may be natural trade partners.`}
          >
            Analyze league
          </AskEveButton>
        }
        description="Canonical owners, team identities, auction spend, and complete draft-day rosters across seasons."
        eyebrow="League intelligence"
        title="League rosters"
      />

      {season ? (
        <section aria-label="League summary" className={styles.stats}>
          <article className={styles.statCard}>
            <span>Teams</span>
            <strong>{season.teamCount}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Drafted players</span>
            <strong>{season.draftedPlayerCount}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Roster size</span>
            <strong>{season.rosterSize}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Total auction spend</span>
            <strong>{formatPrice(season.totalSpendCents)}</strong>
          </article>
        </section>
      ) : null}

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>Draft snapshots</h2>
            <p>These rosters represent auction results, before later trades and waiver moves.</p>
          </div>
          {snapshot && season ? (
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
              <label className={styles.field}>
                <span>Search</span>
                <input
                  aria-label="Find team, owner, or rostered player"
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Team, owner, or player"
                  type="search"
                  value={query}
                />
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
                    <p className={styles.empty}>Roster awaiting import</p>
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
