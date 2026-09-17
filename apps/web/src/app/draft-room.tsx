'use client';

import type {
  HistoricalAuctionMarket,
  HistoricalAuctionMarketPlayer,
  LeagueRosterSnapshot,
  LeagueTeamHistory,
} from '@fantasy-basketball/database/runtime';
import { useEveAgent } from 'eve/react';
import { type FormEvent, useActionState, useMemo, useState } from 'react';

import { authClient } from '../lib/auth-client';
import type { TeamReconciliationActionState } from '../lib/team-reconciliation';
import { reconcileTeamIdentityAction } from './actions';
import styles from './draft-room.module.css';

const dollars = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
});

const formatPrice = (cents: number) => dollars.format(cents / 100);

const formatTrend = (player: HistoricalAuctionMarketPlayer) => {
  if (player.trendCents === null) return 'New';
  if (player.trendCents === 0) return 'Flat';
  return `${player.trendCents > 0 ? '+' : '−'}${formatPrice(Math.abs(player.trendCents))}`;
};

type BoardView = 'league' | 'players' | 'teams';
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
  const [state, action, isPending] = useActionState(
    reconcileTeamIdentityAction,
    initialReconciliationState,
  );
  const fieldId = `identity-${teams[0]?.teamSeasonId ?? 'unknown'}`;

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
      <div className={styles.reconciliationTeam}>
        <strong>{teamName}</strong>
        <span>{teams.map((team) => team.seasonKey).join(' · ')}</span>
      </div>
      <label htmlFor={fieldId} className={styles.srOnly}>
        Canonical manager for {teamName}
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
        <input
          aria-label={`New canonical manager for ${teamName}`}
          maxLength={80}
          minLength={2}
          name="displayName"
          placeholder="Manager name"
          required
        />
      ) : null}
      <button disabled={isPending || target === ''} type="submit">
        {isPending
          ? 'Saving…'
          : `Assign ${teams.length > 1 ? `${teams.length} seasons` : 'season'}`}
      </button>
      {state.message ? (
        <output
          className={
            state.status === 'error' ? styles.reconciliationError : styles.reconciliationSuccess
          }
        >
          {state.message}
        </output>
      ) : null}
    </form>
  );
}

export interface DraftRoomProps {
  readonly chatEnabled: boolean;
  readonly market: HistoricalAuctionMarket | null;
  readonly rosterSnapshot: LeagueRosterSnapshot | null;
  readonly teamHistory: LeagueTeamHistory | null;
  readonly viewer: {
    readonly email: string;
    readonly id: string;
    readonly image?: string | null;
    readonly name: string;
  } | null;
}

export function DraftRoom({
  chatEnabled,
  market,
  rosterSnapshot,
  teamHistory,
  viewer,
}: DraftRoomProps) {
  const agent = useEveAgent();
  const [boardView, setBoardView] = useState<BoardView>('league');
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [selectedSeasonKey, setSelectedSeasonKey] = useState(
    rosterSnapshot?.summary.latestPopulatedSeason ?? rosterSnapshot?.summary.latestSeason ?? '',
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const isBusy = agent.status === 'submitted' || agent.status === 'streaming';
  const isResuming = agent.status === 'resuming';
  const filteredPlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (normalizedQuery.length === 0) return market?.players ?? [];
    return (market?.players ?? []).filter((player) =>
      player.name.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [market, query]);
  const filteredMembers = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (normalizedQuery.length === 0) return teamHistory?.members ?? [];
    return (teamHistory?.members ?? []).filter(
      (member) =>
        member.displayName.toLocaleLowerCase().includes(normalizedQuery) ||
        member.teamNames.some((teamName) => teamName.toLocaleLowerCase().includes(normalizedQuery)),
    );
  }, [query, teamHistory]);
  const selectedRosterSeason = useMemo(
    () => rosterSnapshot?.seasons.find((season) => season.seasonKey === selectedSeasonKey) ?? null,
    [rosterSnapshot, selectedSeasonKey],
  );
  const filteredRosterTeams = useMemo(() => {
    const teams = selectedRosterSeason?.teams ?? [];
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (normalizedQuery.length === 0) return teams;
    return teams.filter(
      (team) =>
        team.teamName.toLocaleLowerCase().includes(normalizedQuery) ||
        team.owner?.displayName.toLocaleLowerCase().includes(normalizedQuery) === true ||
        team.roster.some((player) =>
          player.playerName.toLocaleLowerCase().includes(normalizedQuery),
        ),
    );
  }, [query, selectedRosterSeason]);
  const unresolvedTeamGroups = useMemo(() => {
    const groups = new Map<string, UnresolvedTeam[]>();
    for (const team of teamHistory?.unresolvedTeams ?? []) {
      const values = groups.get(team.teamName) ?? [];
      values.push(team);
      groups.set(team.teamName, values);
    }
    return [...groups.entries()]
      .map(([teamName, teams]) => ({
        teamName,
        teams: teams.sort((left, right) => left.seasonKey.localeCompare(right.seasonKey)),
      }))
      .sort((left, right) => left.teamName.localeCompare(right.teamName));
  }, [teamHistory]);
  const leagueFacts = [
    ['Teams', '12'],
    ['Active / roster', '10 / 13'],
    ['Base budget', '$200'],
    ['Imported drafts', String(market?.summary.seasonCount ?? 0)],
    ['Canonical members', String(teamHistory?.summary.canonicalMemberCount ?? '—')],
  ] as const;
  const boardTitle =
    boardView === 'league'
      ? 'League rosters'
      : boardView === 'players'
        ? 'Historical player market'
        : 'Manager tendencies';
  const searchLabel =
    boardView === 'league'
      ? 'Find team, owner, or rostered player'
      : boardView === 'players'
        ? 'Find player'
        : 'Find manager or team';
  const searchPlaceholder =
    boardView === 'league'
      ? `Search ${selectedRosterSeason?.teams.length ?? 0} teams`
      : boardView === 'players'
        ? `Search ${market?.summary.playerCount ?? 0} players`
        : `Search ${teamHistory?.summary.canonicalMemberCount ?? 0} members`;

  const send = (text: string) => {
    if (!chatEnabled || isResuming || text.trim().length === 0) return;
    void agent.send(text.trim(), {
      clientContext: {
        boardView,
        latestAuctionSeason: market?.summary.latestSeason ?? null,
        rosterSeason: selectedRosterSeason?.seasonKey ?? null,
        latestTeamSeason: teamHistory?.summary.latestSeason ?? null,
        searchQuery: query.trim() || null,
      },
      ...(isBusy ? { turnPolicy: 'steer' as const } : {}),
    });
  };

  function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextMessage = message.trim();
    if (nextMessage.length === 0 || !chatEnabled || isResuming) return;
    setMessage('');
    send(nextMessage);
  }

  const signIn = async () => {
    setAuthError(null);
    const result = await authClient.signIn.social({
      callbackURL: window.location.href,
      provider: 'github',
    });
    if (result.error) setAuthError(result.error.message ?? 'Sign-in failed');
  };

  const signOut = async () => {
    await authClient.signOut();
    window.location.reload();
  };

  const switchBoard = (nextView: BoardView) => {
    setBoardView(nextView);
    setQuery('');
  };

  return (
    <main className={styles.shell}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Fantrax decision room</p>
          <h1>Fantasy Basketball</h1>
        </div>
        <div className={styles.headerActions}>
          <div className={`${styles.status} ${market === null ? styles.statusPending : ''}`}>
            <span aria-hidden="true" />
            {market === null ? 'Historical data unavailable' : 'League data connected'}
          </div>
          {viewer === null ? (
            <button className={styles.secondaryButton} onClick={() => void signIn()} type="button">
              Sign in with GitHub
            </button>
          ) : (
            <div className={styles.viewer}>
              <span>{viewer.name}</span>
              <button onClick={() => void signOut()} type="button">
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {authError ? <p className={styles.authError}>{authError}</p> : null}

      <section className={styles.facts} aria-label="League settings">
        {leagueFacts.map(([label, value]) => (
          <article key={label}>
            <p>{label}</p>
            <strong>{value}</strong>
          </article>
        ))}
      </section>

      <div className={styles.workspace}>
        <section className={styles.board}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>League intelligence</p>
              <h2>{boardTitle}</h2>
            </div>
            <label className={styles.playerSearch}>
              <span>{searchLabel}</span>
              <input
                aria-label={searchLabel}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={searchPlaceholder}
                type="search"
                value={query}
              />
            </label>
          </div>

          <div className={styles.boardTabs} role="tablist" aria-label="Draft board view">
            <button
              aria-selected={boardView === 'league'}
              onClick={() => switchBoard('league')}
              role="tab"
              type="button"
            >
              League rosters
            </button>
            <button
              aria-selected={boardView === 'players'}
              onClick={() => switchBoard('players')}
              role="tab"
              type="button"
            >
              Player market
            </button>
            <button
              aria-selected={boardView === 'teams'}
              onClick={() => switchBoard('teams')}
              role="tab"
              type="button"
            >
              League history
            </button>
          </div>

          {boardView === 'league' ? (
            rosterSnapshot === null || selectedRosterSeason === null ? (
              <div className={styles.emptyState}>
                <p>
                  {viewer === null
                    ? 'Sign in to view private league rosters.'
                    : 'League rosters could not be loaded.'}
                </p>
                <span>
                  Team ownership, draft rosters, and auction spend stay behind the owner session.
                </span>
              </div>
            ) : (
              <>
                <div className={styles.rosterToolbar}>
                  <label>
                    <span>Season</span>
                    <select
                      aria-label="Roster season"
                      onChange={(event) => {
                        setSelectedSeasonKey(event.target.value);
                        setQuery('');
                      }}
                      value={selectedRosterSeason.seasonKey}
                    >
                      {rosterSnapshot.seasons.map((season) => (
                        <option key={season.seasonKey} value={season.seasonKey}>
                          {season.seasonKey}
                          {season.rosterStatus === 'empty' ? ' · roster pending' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div>
                    <strong>{selectedRosterSeason.teamCount}</strong>
                    <span>teams</span>
                  </div>
                  <div>
                    <strong>{selectedRosterSeason.draftedPlayerCount}</strong>
                    <span>drafted players</span>
                  </div>
                  <div>
                    <strong>{formatPrice(selectedRosterSeason.totalSpendCents)}</strong>
                    <span>auction spend</span>
                  </div>
                  <p>
                    Draft snapshot · {selectedRosterSeason.rosterSize} roster spots ·{' '}
                    {formatPrice(selectedRosterSeason.baseBudgetCents)} base budget
                  </p>
                </div>
                {selectedRosterSeason.rosterStatus === 'empty' ? (
                  <div className={styles.rosterNotice}>
                    <strong>{selectedRosterSeason.seasonKey} teams are ready.</strong>
                    <span>
                      No draft roster has been imported yet. Choose{' '}
                      {rosterSnapshot.summary.latestPopulatedSeason ?? 'an earlier season'} to
                      inspect complete rosters.
                    </span>
                  </div>
                ) : null}
                <div className={styles.rosterGrid}>
                  {filteredRosterTeams.map((team) => (
                    <article className={styles.rosterCard} key={team.teamSeasonId}>
                      <div className={styles.rosterCardHeading}>
                        <div>
                          <p>{team.teamName}</p>
                          <span>{team.owner?.displayName ?? 'Owner unresolved'}</span>
                        </div>
                        <button
                          onClick={() =>
                            send(
                              `Analyze ${team.owner?.displayName ?? team.teamName}'s ${selectedRosterSeason.seasonKey} roster for ${team.teamName}. Identify strengths, risks, value picks, and useful trade targets using the league roster data.`,
                            )
                          }
                          type="button"
                        >
                          Ask Eve
                        </button>
                      </div>
                      <div className={styles.rosterMetrics}>
                        <span>
                          <small>Roster</small>
                          <strong>
                            {team.rosterCount}/{selectedRosterSeason.rosterSize}
                          </strong>
                        </span>
                        <span>
                          <small>Spent</small>
                          <strong>{formatPrice(team.spendCents)}</strong>
                        </span>
                        <span>
                          <small>Vs. base</small>
                          <strong>{formatPrice(team.baseBudgetBalanceCents)}</strong>
                        </span>
                      </div>
                      {team.roster.length === 0 ? (
                        <p className={styles.rosterPending}>Roster awaiting import</p>
                      ) : (
                        <ol className={styles.rosterList}>
                          {team.roster.map((player) => (
                            <li key={player.playerId}>
                              <span>
                                <small>
                                  {player.rosterSlot === null ? '—' : player.rosterSlot}
                                </small>
                                <strong>{player.playerName}</strong>
                              </span>
                              <b>{formatPrice(player.auctionCostCents)}</b>
                            </li>
                          ))}
                        </ol>
                      )}
                    </article>
                  ))}
                  {filteredRosterTeams.length === 0 ? (
                    <p className={styles.noResults}>
                      No team, owner, or rostered player matches “{query}”.
                    </p>
                  ) : null}
                </div>
              </>
            )
          ) : boardView === 'players' ? (
            market === null ? (
              <div className={styles.emptyState}>
                <p>The historical market could not be loaded.</p>
                <span>
                  The draft room remains available, but auction values need a database connection.
                </span>
              </div>
            ) : (
              <>
                <div className={styles.marketSummary}>
                  <div>
                    <strong>{market.summary.playerCount}</strong>
                    <span>players</span>
                  </div>
                  <div>
                    <strong>{market.summary.purchaseCount}</strong>
                    <span>purchases</span>
                  </div>
                  <div>
                    <strong>{formatPrice(market.summary.totalSpendCents)}</strong>
                    <span>historical spend</span>
                  </div>
                  <p>Newer seasons weigh more; later undrafted seasons count as $0.</p>
                </div>
                <section
                  aria-label="Historical player market results"
                  className={styles.tableViewport}
                >
                  <a className={styles.srOnly} href="#market-results-end">
                    Skip player results
                  </a>
                  <table className={styles.marketTable}>
                    <thead>
                      <tr>
                        <th scope="col">Player</th>
                        <th scope="col">Expected</th>
                        <th scope="col">Latest</th>
                        <th scope="col">Trend</th>
                        <th scope="col">Range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlayers.map((player) => (
                        <tr key={player.playerId}>
                          <th scope="row">
                            <strong>{player.name}</strong>
                            <span>
                              {player.seasonsDrafted} draft
                              {player.seasonsDrafted === 1 ? '' : 's'} · {player.latestSeason}
                            </span>
                          </th>
                          <td className={styles.expectedPrice}>
                            {formatPrice(player.expectedPriceCents)}
                          </td>
                          <td>{formatPrice(player.latestPriceCents)}</td>
                          <td>
                            <span
                              className={
                                player.trendCents === null || player.trendCents === 0
                                  ? styles.trendNeutral
                                  : player.trendCents > 0
                                    ? styles.trendUp
                                    : styles.trendDown
                              }
                            >
                              {formatTrend(player)}
                            </span>
                          </td>
                          <td>
                            {formatPrice(player.minimumPriceCents)}–
                            {formatPrice(player.maximumPriceCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredPlayers.length === 0 ? (
                    <p className={styles.noResults}>No historical player matches “{query}”.</p>
                  ) : null}
                  <span id="market-results-end" />
                </section>
              </>
            )
          ) : teamHistory === null ? (
            <div className={styles.emptyState}>
              <p>
                {viewer === null
                  ? 'Sign in to view private league history.'
                  : 'League history could not be loaded.'}
              </p>
              <span>Manager identities and team-name history stay behind the owner session.</span>
            </div>
          ) : (
            <>
              <div className={styles.identitySummary}>
                <span>
                  <strong>{teamHistory.summary.resolvedTeamSeasonCount}</strong> resolved
                  team-seasons
                </span>
                <span
                  className={
                    teamHistory.summary.unresolvedTeamSeasonCount > 0 ? styles.warningText : ''
                  }
                >
                  <strong>{teamHistory.summary.unresolvedTeamSeasonCount}</strong> awaiting aliases
                </span>
                <p>Exact matches only; renamed teams are never guessed.</p>
              </div>
              {teamHistory.unresolvedTeams.length > 0 ? (
                <details className={styles.reconciliationPanel}>
                  <summary>
                    Reconcile {teamHistory.unresolvedTeams.length} unmatched team-seasons
                  </summary>
                  <p>
                    Exact team names are grouped across seasons. Choose the manager who owned each
                    team; renamed teams stay separate.
                  </p>
                  <div className={styles.reconciliationList}>
                    {unresolvedTeamGroups.map((group) => (
                      <TeamReconciliationForm
                        key={group.teamName}
                        members={teamHistory.members}
                        teamName={group.teamName}
                        teams={group.teams}
                      />
                    ))}
                  </div>
                </details>
              ) : null}
              <div className={styles.memberGrid}>
                {filteredMembers.map((member) => {
                  const latest = member.seasons.at(-1);
                  return (
                    <article className={styles.memberCard} key={member.memberId}>
                      <div className={styles.memberHeading}>
                        <div>
                          <p>{member.displayName}</p>
                          <span>
                            {member.seasons.length} seasons · {member.purchaseCount} picks
                          </span>
                        </div>
                        <button
                          onClick={() =>
                            send(
                              `Profile ${member.displayName}'s draft tendencies. What repeat targets and spending patterns stand out?`,
                            )
                          }
                          type="button"
                        >
                          Ask Eve
                        </button>
                      </div>
                      <p className={styles.teamAliases}>{member.teamNames.join(' · ')}</p>
                      <div className={styles.memberMetrics}>
                        <span>
                          <small>Latest team</small>
                          <strong>{latest?.teamName ?? '—'}</strong>
                        </span>
                        <span>
                          <small>Total spend</small>
                          <strong>{formatPrice(member.totalSpendCents)}</strong>
                        </span>
                      </div>
                      <div className={styles.favoritePlayers}>
                        <small>Repeat targets</small>
                        {member.favoritePlayers.slice(0, 3).map((player) => (
                          <span key={player.playerId}>
                            {player.playerName}
                            {player.draftCount > 1 ? ` ×${player.draftCount}` : ''}
                          </span>
                        ))}
                      </div>
                    </article>
                  );
                })}
                {filteredMembers.length === 0 ? (
                  <p className={styles.noResults}>No manager or team matches “{query}”.</p>
                ) : null}
              </div>
            </>
          )}
        </section>

        <aside className={styles.chat}>
          <div className={styles.sectionHeading}>
            <div>
              <p className={styles.eyebrow}>Eve analyst</p>
              <h2>Draft chat</h2>
            </div>
            <div className={styles.chatActions}>
              <span className={styles.agentStatus}>{agent.status}</span>
              {isBusy ? (
                <button onClick={() => void agent.cancel()} type="button">
                  Stop
                </button>
              ) : null}
              {agent.data.messages.length > 0 && !isBusy ? (
                <button onClick={() => agent.reset()} type="button">
                  New chat
                </button>
              ) : null}
            </div>
          </div>

          <fieldset className={styles.quickPrompts}>
            <legend className={styles.srOnly}>Suggested questions</legend>
            {[
              'Compare the latest complete league rosters and flag trade opportunities.',
              'Who does this league historically overpay for?',
              'Which repeat draft targets reveal manager preferences?',
              'How should daily lineups change replacement value?',
            ].map((prompt) => (
              <button
                disabled={!chatEnabled || isResuming}
                key={prompt}
                onClick={() => send(prompt)}
                type="button"
              >
                {prompt}
              </button>
            ))}
          </fieldset>

          <div className={styles.messages} aria-live="polite">
            {!chatEnabled ? (
              <div className={styles.chatEmpty}>
                <strong>Sign in to talk to Eve.</strong>
                <span>
                  The agent shares the same owner-only Better Auth session as this dashboard.
                </span>
              </div>
            ) : agent.data.messages.length === 0 ? (
              <div className={styles.chatEmpty}>
                Ask about league prices, manager behavior, or the custom scoring system. Eve can
                query the same data shown here.
              </div>
            ) : (
              agent.data.messages.map((item) => (
                <article
                  className={item.role === 'user' ? styles.userMessage : styles.agentMessage}
                  key={item.id}
                >
                  <small>{item.role === 'user' ? 'You' : 'Analyst'}</small>
                  {item.parts.map((part, index) =>
                    part.type === 'text' ? <p key={index}>{part.text}</p> : null,
                  )}
                </article>
              ))
            )}
          </div>

          {agent.error ? <p className={styles.error}>{agent.error.message}</p> : null}

          <form className={styles.composer} onSubmit={sendMessage}>
            <label htmlFor="draft-message">Message the analyst</label>
            <div>
              <input
                autoComplete="off"
                disabled={!chatEnabled || isResuming}
                id="draft-message"
                onChange={(event) => setMessage(event.target.value)}
                placeholder={
                  chatEnabled ? 'Ask about a player, price, or manager…' : 'Sign in to use Eve'
                }
                value={message}
              />
              <button disabled={!chatEnabled || isResuming || message.trim().length === 0}>
                {isBusy ? 'Update' : 'Send'}
              </button>
            </div>
          </form>
        </aside>
      </div>
    </main>
  );
}
