'use client';
import type {
  LatestProjectionSnapshot,
  PreDraftWorkspace,
  LeaguePerformanceHistory,
  LeagueRosterSnapshot,
} from '@fantasy-basketball/database/runtime';
import type { PlayerSituationBoard } from '@fantasy-basketball/fantasy';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatPrice } from '../../lib/format';
import { leagueLenses, rankLeague, teamForOwner, type LeagueLens } from '../../lib/team-hq';
import { AskEveButton } from '../app-shell';
import { useSeasonExperience } from '../season-experience';
import { DraftPrepHq } from './draft-prep-hq';
import { PlayerCard, SignalIcon } from '../player-card';
import styles from './team-hq.module.css';

export interface TeamHqProps {
  workspace?: PreDraftWorkspace | null;
  preparationSeason?: string;
  authenticated: boolean;
  snapshot: LeagueRosterSnapshot | null;
  performance: LeaguePerformanceHistory | null;
  memberId: string | null;
  projections: LatestProjectionSnapshot | null;
  situations: PlayerSituationBoard | null;
}
export function TeamHq(props: TeamHqProps) {
  const experience = useSeasonExperience();
  if (experience?.mode === 'preparation')
    return (
      <DraftPrepHq
        seasonKey={props.preparationSeason ?? experience.seasonKey}
        authenticated={props.authenticated}
        workspace={props.workspace ?? null}
        projections={props.projections}
        situations={props.situations}
      />
    );
  return <SeasonTeamHq {...props} />;
}
function SeasonTeamHq({
  authenticated,
  snapshot,
  performance,
  memberId,
  projections,
  situations,
}: TeamHqProps) {
  const seasons = [
    ...new Set([
      ...(snapshot?.seasons.map((season) => season.seasonKey) ?? []),
      ...(performance?.seasons.map((season) => season.seasonKey) ?? []),
    ]),
  ]
    .sort()
    .reverse();
  const [seasonKey, setSeasonKey] = useState(
    snapshot?.summary.latestPopulatedSeason ??
      performance?.summary.latestSeason ??
      seasons[0] ??
      '',
  );
  const [lens, setLens] = useState<LeagueLens>('allPlayWinPercentage');
  const [rivalId, setRivalId] = useState('');
  const [query, setQuery] = useState('');
  const season = snapshot?.seasons.find((candidate) => candidate.seasonKey === seasonKey);
  const results = performance?.seasons.find((candidate) => candidate.seasonKey === seasonKey);
  const team = teamForOwner(season, memberId);
  const ourResult = memberId
    ? results?.teams.find((candidate) => candidate.leagueMemberId === memberId)
    : null;
  const ranked = rankLeague(results, lens);
  const rival =
    ranked.find(
      (candidate) => candidate.teamSeasonId === rivalId && candidate.leagueMemberId !== memberId,
    ) ?? ranked.find((candidate) => candidate.leagueMemberId !== memberId);
  const rivalRoster = season?.teams.find(
    (candidate) => candidate.teamSeasonId === rival?.teamSeasonId,
  );
  const projectionById = useMemo(
    () => new Map(projections?.players.map((player) => [player.playerId, player]) ?? []),
    [projections],
  );
  const situationById = useMemo(
    () => new Map(situations?.players.map((player) => [player.playerId, player]) ?? []),
    [situations],
  );
  const roster = [...(team?.roster ?? [])]
    .sort((a, b) => b.auctionCostCents - a.auctionCostCents)
    .filter((player) => player.playerName.toLowerCase().includes(query.toLowerCase().trim()));
  const maxMetric = Math.max(1, ...ranked.map((candidate) => Math.abs(candidate[lens])));
  const compareHref =
    rival && team
      ? `/trades?season=${encodeURIComponent(seasonKey)}&team=${encodeURIComponent(team.teamSeasonId)}&rival=${encodeURIComponent(rival.teamSeasonId)}`
      : '/trades';
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>Team HQ</h1>
          <p>Your roster. Your competition. Your next move.</p>
        </div>
        {seasons.length ? (
          <label className={styles.season}>
            Season
            <select
              aria-label="Team HQ season"
              value={seasonKey}
              onChange={(event) => {
                setSeasonKey(event.target.value);
                setRivalId('');
                setQuery('');
              }}
            >
              {seasons.map((key) => (
                <option key={key}>{key}</option>
              ))}
            </select>
          </label>
        ) : null}
      </header>
      <nav className={styles.localNav} aria-label="Team HQ sections">
        <a href="#roster">Our roster</a>
        <a href="#league">League comparison</a>
        <a href="#decisions">Next moves</a>
        <Link href="/draft">
          Open draft room <span aria-hidden="true">↗</span>
        </Link>
      </nav>
      {!authenticated ? (
        <section className={styles.welcome}>
          <div className={styles.teamMark} aria-hidden="true">
            <svg viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 12h50v38L40 70 15 50z" />
              <path d="M27 26h26v22H27zM27 37h26" />
              <circle cx="40" cy="37" r="7" />
            </svg>
          </div>
          <div>
            <h2>Your team comes first.</h2>
            <p>
              Sign in with the owner account using the navigation to bring your roster, league
              results, and player research into one view.
            </p>
            <div className={styles.welcomeLinks}>
              <Link href="/players">
                Explore player research <span aria-hidden="true">→</span>
              </Link>
              <Link href="/draft">
                Prepare for the draft <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <section className={styles.teamBanner} aria-label="Our team summary">
          <div className={styles.teamIdentity}>
            <div className={styles.teamMark} aria-hidden="true">
              HQ
            </div>
            <div>
              <h2>{team?.teamName ?? ourResult?.teamName ?? 'Our team'}</h2>
              <p>
                {team?.owner?.displayName ?? 'Clyde'} · {seasonKey || 'Season unavailable'}
              </p>
              <span>
                {team ? 'Audited draft roster' : 'Roster unavailable'} ·{' '}
                {ourResult ? 'Observed season results' : 'Results unavailable'}
              </span>
            </div>
          </div>
          <dl className={styles.scoreboard}>
            <div>
              <dt>League finish</dt>
              <dd>{ourResult ? `#${ourResult.rank}` : '—'}</dd>
            </div>
            <div>
              <dt>Record</dt>
              <dd>{ourResult?.record ?? '—'}</dd>
            </div>
            <div>
              <dt>All-play</dt>
              <dd>
                {ourResult
                  ? leagueLenses.allPlayWinPercentage.format(ourResult.allPlayWinPercentage)
                  : '—'}
              </dd>
            </div>
          </dl>
        </section>
      )}
      <section id="roster" className={styles.section}>
        <header className={styles.sectionHeader}>
          <div>
            <h2>Our roster</h2>
            <p>
              {team
                ? `${team.roster.length} drafted players · ${formatPrice(team.spendCents)} spent. Open a player for the full read.`
                : 'A shared player view for every roster decision.'}
            </p>
          </div>
          {team ? (
            <input
              type="search"
              aria-label="Search our roster"
              placeholder="Find a player"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          ) : null}
        </header>
        {team ? (
          <>
            <p className={styles.evidence}>
              Ownership is from the {seasonKey} draft, before trades or waivers.
              {projections
                ? ` Player estimates are for ${projections.seasonKey} (as of ${projections.asOf.slice(0, 10)}); they do not describe that historical roster’s results.`
                : ' Player projections are unavailable.'}
            </p>
            <div className={styles.roster}>
              {roster.map((player) => (
                <PlayerCard
                  key={player.playerId}
                  {...player}
                  rosterSeason={seasonKey}
                  projection={projectionById.get(player.playerId)}
                  projectionSeason={projections?.seasonKey}
                  situation={situationById.get(player.playerId)}
                />
              ))}
            </div>
            {!roster.length ? (
              <p className={styles.empty}>
                {query
                  ? 'No players match that search. Try another name.'
                  : 'No players were imported for this draft roster.'}
              </p>
            ) : null}
          </>
        ) : (
          <div className={styles.empty}>
            <h3>
              {!authenticated
                ? 'Your private roster lives here'
                : !memberId
                  ? 'Connect your team identity'
                  : 'No roster for this season'}
            </h3>
            <p>
              {!authenticated
                ? 'Owner sign-in unlocks your team. Public player research is available now.'
                : !memberId
                  ? 'The canonical Clyde manager record could not be loaded. Review manager identities before attributing a roster.'
                  : 'Choose another season or review imported league rosters.'}
            </p>
            <Link href={!authenticated ? '/players' : !memberId ? '/managers' : '/league'}>
              {!authenticated
                ? 'Browse players'
                : !memberId
                  ? 'Review managers'
                  : 'Review league rosters'}{' '}
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}
        <div className={styles.legend}>
          <span>
            <SignalIcon kind="availability" /> Availability
          </span>
          <span>
            <SignalIcon kind="opportunity" /> Opportunity
          </span>
          <span>
            <SignalIcon kind="value" /> Auction cost
          </span>
          <span>
            <SignalIcon kind="evidence" /> Evidence
          </span>
          <small>Hover, focus, or tap an icon for its read.</small>
        </div>
      </section>
      <section id="league" className={styles.section}>
        <header className={styles.sectionHeader}>
          <div>
            <h2>Where we stand</h2>
            <p>Read the league through our team.</p>
          </div>
          <Link className={styles.textLink} href="/league">
            Full league history <span aria-hidden="true">↗</span>
          </Link>
        </header>
        <fieldset className={styles.lenses} aria-label="League analysis lens">
          {(Object.keys(leagueLenses) as LeagueLens[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={lens === key}
              onClick={() => setLens(key)}
            >
              {leagueLenses[key].label}
            </button>
          ))}
        </fieldset>
        <p className={styles.explanation}>{leagueLenses[lens].explanation}</p>
        {ranked.length ? (
          <div className={styles.comparison}>
            <div
              className={styles.standings}
              aria-label={`${seasonKey} ${leagueLenses[lens].label}`}
            >
              {ranked.map((candidate) => (
                <button
                  type="button"
                  key={candidate.teamSeasonId}
                  className={styles.teamRow}
                  data-own={candidate.leagueMemberId === memberId}
                  aria-pressed={rival?.teamSeasonId === candidate.teamSeasonId}
                  disabled={candidate.leagueMemberId === memberId}
                  onClick={() => setRivalId(candidate.teamSeasonId)}
                >
                  <span className={styles.rank}>{candidate.rank}</span>
                  <span className={styles.rowName}>
                    {candidate.teamName}
                    <small>
                      {candidate.leagueMemberId === memberId
                        ? 'Our team'
                        : (candidate.managerName ?? 'Manager unresolved')}
                    </small>
                  </span>
                  <span className={styles.track} aria-hidden="true">
                    <span
                      style={{ transform: `scaleX(${Math.abs(candidate[lens]) / maxMetric})` }}
                      data-negative={candidate[lens] < 0}
                    />
                  </span>
                  <strong>{leagueLenses[lens].format(candidate[lens])}</strong>
                </button>
              ))}
              <p className={styles.chartNote}>
                Numbers at left are season finishing ranks. Select a rival to compare.{' '}
                {lens === 'luckWins'
                  ? 'Bar length shows magnitude; the signed value shows direction.'
                  : ''}
              </p>
            </div>
            {rival ? (
              <aside className={styles.rival} aria-label="Selected rival">
                <h3>{rival.teamName}</h3>
                <p>
                  {rival.managerName ?? 'Manager unresolved'} · #{rival.rank} finish ·{' '}
                  {rival.record}
                </p>
                <table>
                  <caption>Our team vs. selected rival · {seasonKey}</caption>
                  <thead>
                    <tr>
                      <th scope="col">Measure</th>
                      <th scope="col">Us</th>
                      <th scope="col">Them</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(Object.keys(leagueLenses) as LeagueLens[]).map((key) => (
                      <tr key={key}>
                        <th scope="row">{leagueLenses[key].label}</th>
                        <td>{ourResult ? leagueLenses[key].format(ourResult[key]) : '—'}</td>
                        <td>{leagueLenses[key].format(rival[key])}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Link className={styles.action} href={compareHref}>
                  Compare roster builds <span aria-hidden="true">→</span>
                </Link>
                <AskEveButton
                  className={styles.ask}
                  context={{
                    season: seasonKey,
                    ourTeam: team?.teamName ?? ourResult?.teamName ?? null,
                    rival: rival.teamName,
                    lens,
                  }}
                  prompt={`Compare our team (${team?.teamName ?? ourResult?.teamName ?? 'Clyde; verify identity'}) with ${rival.teamName} in ${seasonKey}, focusing on ${leagueLenses[lens].label}. Explain the gap using observed results, not causal claims. Separate draft rosters from current ownership.`}
                >
                  Explain the gap with Eve
                </AskEveButton>
                {rivalRoster?.roster.length ? (
                  <div className={styles.rivalPlayers}>
                    <h4>Largest draft investments</h4>
                    {[...rivalRoster.roster]
                      .sort((a, b) => b.auctionCostCents - a.auctionCostCents)
                      .slice(0, 2)
                      .map((player) => (
                        <PlayerCard
                          compact
                          key={player.playerId}
                          {...player}
                          rosterSeason={seasonKey}
                        />
                      ))}
                  </div>
                ) : null}
              </aside>
            ) : null}
          </div>
        ) : (
          <div className={styles.empty}>
            <h3>
              {authenticated ? 'League results are unavailable' : 'Compare with the whole league'}
            </h3>
            <p>
              {authenticated
                ? 'Choose a season with imported results or review league history.'
                : 'Sign in to explore strength, scoring, lineup volume, and schedule luck with our team highlighted.'}
            </p>
          </div>
        )}
      </section>
      <section id="decisions" className={styles.section}>
        <header className={styles.sectionHeader}>
          <div>
            <h2>Make your next move</h2>
            <p>Turn the read into a decision.</p>
          </div>
        </header>
        <div className={styles.moves}>
          <Link href="/draft">
            <span>
              <strong>Build our draft plan</strong>
              <small>Set targets, budget, and room for a streaming slot.</small>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link href={compareHref}>
            <span>
              <strong>Find a complementary roster</strong>
              <small>Compare draft investments before a trade conversation.</small>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
          <Link href="/waivers">
            <span>
              <strong>Research the next pickup</strong>
              <small>Study undrafted production and inferred roster activity.</small>
            </span>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
