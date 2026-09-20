'use client';

import type { LeagueTeamHistory } from '@fantasy-basketball/database/runtime';
import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';

import { formatPrice } from '../../lib/format';
import type { TeamReconciliationActionState } from '../../lib/team-reconciliation';
import { reconcileTeamIdentityAction } from '../actions';
import { AskEveButton } from '../app-shell';
import { DataUnavailable, PageHeader } from '../page-header';
import styles from '../workspace.module.css';

type LeagueMember = LeagueTeamHistory['members'][number];
type UnresolvedTeam = LeagueTeamHistory['unresolvedTeams'][number];

const initialReconciliationState: TeamReconciliationActionState = {
  message: null,
  status: 'idle',
};

function TeamReconciliationForm({
  members,
  teamName,
  teams,
}: {
  readonly members: ReadonlyArray<LeagueMember>;
  readonly teamName: string;
  readonly teams: ReadonlyArray<UnresolvedTeam>;
}) {
  const [target, setTarget] = useState('');
  const [state, action, pending] = useActionState(
    reconcileTeamIdentityAction,
    initialReconciliationState,
  );
  const fieldId = `manager-${teams[0]?.teamSeasonId ?? 'unknown'}`;

  return (
    <form action={action} className={styles.reconciliationRow}>
      {teams.map((team) => (
        <input
          key={team.teamSeasonId}
          name="teamSeasonId"
          type="hidden"
          value={team.teamSeasonId}
        />
      ))}
      <div className={styles.reconciliationName}>
        <strong>{teamName}</strong>
        <small>{teams.map((team) => team.seasonKey).join(' · ')}</small>
      </div>
      <label className={styles.field} htmlFor={fieldId}>
        <span>Canonical manager</span>
      </label>
      <select
        id={fieldId}
        name="target"
        onChange={(event) => setTarget(event.target.value)}
        required
        value={target}
      >
        <option value="">Choose manager…</option>
        {members.map((member) => (
          <option key={member.memberId} value={member.memberId}>
            {member.displayName}
          </option>
        ))}
        <option value="new">Create new manager…</option>
      </select>
      {target === 'new' ? (
        <input aria-label={`New manager for ${teamName}`} name="displayName" placeholder="Name" />
      ) : null}
      <button disabled={pending || target === ''} type="submit">
        {pending ? 'Saving…' : `Assign ${teams.length > 1 ? `${teams.length} seasons` : 'season'}`}
      </button>
      {state.message ? (
        <output
          className={`${styles.formMessage} ${state.status === 'error' ? styles.formError : ''}`}
        >
          {state.message}
        </output>
      ) : null}
    </form>
  );
}

export function ManagersView({
  authenticated,
  history,
}: {
  readonly authenticated: boolean;
  readonly history: LeagueTeamHistory | null;
}) {
  const [query, setQuery] = useState('');
  const members = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (normalized.length === 0) return history?.members ?? [];
    return (history?.members ?? []).filter(
      (member) =>
        member.displayName.toLocaleLowerCase().includes(normalized) ||
        member.teamNames.some((name) => name.toLocaleLowerCase().includes(normalized)),
    );
  }, [history, query]);
  const unresolvedGroups = useMemo(() => {
    const grouped = new Map<string, UnresolvedTeam[]>();
    for (const team of history?.unresolvedTeams ?? []) {
      grouped.set(team.teamName, [...(grouped.get(team.teamName) ?? []), team]);
    }
    return [...grouped.entries()]
      .map(([teamName, teams]) => ({
        teamName,
        teams: teams.sort((left, right) => left.seasonKey.localeCompare(right.seasonKey)),
      }))
      .sort((left, right) => left.teamName.localeCompare(right.teamName));
  }, [history]);

  return (
    <div className={styles.page}>
      <PageHeader
        actions={
          <AskEveButton
            className={styles.primaryButton}
            prompt="Compare every manager's historical auction behavior. Identify repeat targets, spending styles, and the clearest differences between managers."
          >
            Compare managers
          </AskEveButton>
        }
        description="Follow the people behind changing team names and learn how each manager approaches the auction."
        title="Manager profiles"
      />

      {history ? (
        <section aria-label="Manager history summary" className={styles.stats}>
          <article className={styles.statCard}>
            <span>Canonical managers</span>
            <strong>{history.summary.canonicalMemberCount}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Tracked seasons</span>
            <strong>{history.summary.seasonCount}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Team-seasons</span>
            <strong>{history.summary.teamSeasonCount}</strong>
          </article>
          <article className={styles.statCard}>
            <span>Unresolved identities</span>
            <strong>{history.summary.unresolvedTeamSeasonCount}</strong>
          </article>
        </section>
      ) : null}

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>League history</h2>
            <p>Owner-confirmed identity links; renamed teams are never guessed automatically.</p>
          </div>
          {history ? (
            <label className={styles.field}>
              <span>Search</span>
              <input
                aria-label="Find manager or team"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Manager or team"
                type="search"
                value={query}
              />
            </label>
          ) : null}
        </header>

        {history === null ? (
          <DataUnavailable
            detail={
              authenticated
                ? 'The canonical manager history could not be loaded.'
                : 'Sign in with the league owner account to view manager behavior.'
            }
            title={authenticated ? 'Manager data unavailable' : 'Owner access required'}
          />
        ) : (
          <>
            {history.unresolvedTeams.length > 0 ? (
              <details className={styles.reconciliation}>
                <summary>
                  Reconcile {history.unresolvedTeams.length} unmatched team-season
                  {history.unresolvedTeams.length === 1 ? '' : 's'}
                </summary>
                <div className={styles.reconciliationList}>
                  {unresolvedGroups.map((group) => (
                    <TeamReconciliationForm
                      key={group.teamName}
                      members={history.members}
                      teamName={group.teamName}
                      teams={group.teams}
                    />
                  ))}
                </div>
              </details>
            ) : (
              <div className={styles.success}>
                <strong>Identity history complete.</strong>
                Every imported team-season is attached to a canonical manager.
              </div>
            )}
            <div className={styles.managerGrid}>
              {members.map((member) => {
                const latest = member.seasons.at(-1);
                return (
                  <article className={styles.managerCard} key={member.memberId}>
                    <header className={styles.cardHeading}>
                      <div>
                        <h3>{member.displayName}</h3>
                        <p>
                          {member.seasons.length} season{member.seasons.length === 1 ? '' : 's'} ·{' '}
                          {member.purchaseCount} picks
                        </p>
                      </div>
                      <Link className={styles.cardLink} href={`/managers/${member.memberId}`}>
                        Profile →
                      </Link>
                    </header>
                    <p className={styles.aliases}>{member.teamNames.join(' · ')}</p>
                    <div className={styles.managerFacts}>
                      <span>
                        <small>Latest team</small>
                        <strong>{latest?.teamName ?? '—'}</strong>
                      </span>
                      <span>
                        <small>Total spend</small>
                        <strong>{formatPrice(member.totalSpendCents)}</strong>
                      </span>
                    </div>
                    <small className={styles.favoriteLabel}>Repeat targets</small>
                    <ul className={styles.favoriteList}>
                      {member.favoritePlayers.slice(0, 3).map((player) => (
                        <li key={player.playerId}>
                          <span>{player.playerName}</span>
                          <strong>
                            {player.draftCount}× · {formatPrice(player.averagePriceCents)} avg
                          </strong>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
              {members.length === 0 ? (
                <div className={styles.empty}>
                  <strong>No matching manager</strong>
                  Try a different name or team alias.
                </div>
              ) : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
