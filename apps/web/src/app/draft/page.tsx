import { leagueOwnerProfile } from '@fantasy-basketball/fantasy';
import Link from 'next/link';

import { formatPrice, formatSignedPrice } from '../../lib/format';
import { createLiveBidBoard } from '../../lib/create-live-bid-board';
import { loadHistoricalAuctionMarket } from '../../lib/historical-auction-market';
import { loadLatestAdpSnapshot } from '../../lib/latest-adp';
import { loadLeagueRosters } from '../../lib/league-rosters';
import { loadLatestProjectionSnapshot } from '../../lib/latest-projections';
import { loadPreDraftWorkspace } from '../../lib/pre-draft-workspace';
import { loadViewer } from '../../lib/viewer';
import { loadPromotedAuctionValuationRun } from '../../lib/valuation-lab';
import { savePreDraftPlanAction, savePreDraftTargetAction } from '../actions';
import { AskEveButton } from '../app-shell';
import { DataUnavailable, PageHeader } from '../page-header';
import styles from '../workspace.module.css';
import { LiveBidPanel } from './live-bid-panel';

export const dynamic = 'force-dynamic';

const dollars = (cents: number): number => cents / 100;

export default async function DraftPage() {
  const viewer = await loadViewer().catch(() => null);
  const [market, rosterSnapshot, adp, workspace, projection] = await Promise.all([
    loadHistoricalAuctionMarket().catch(() => null),
    viewer === null ? Promise.resolve(null) : loadLeagueRosters().catch(() => null),
    loadLatestAdpSnapshot().catch(() => null),
    viewer === null ? Promise.resolve(null) : loadPreDraftWorkspace().catch(() => null),
    viewer === null ? Promise.resolve(null) : loadLatestProjectionSnapshot().catch(() => null),
  ]);
  const valuation =
    viewer === null || projection === null
      ? null
      : await loadPromotedAuctionValuationRun(projection.seasonKey).catch(() => null);
  const liveSeason = rosterSnapshot?.seasons[0] ?? null;
  const seasonKey = workspace?.league?.seasonKey ?? liveSeason?.seasonKey ?? '2026-27';
  const plan = workspace?.plan;
  const defaults = leagueOwnerProfile.defaultPlan;
  const priceBoard = market?.players.slice(0, 14) ?? [];
  const adpBoard = adp?.players.slice(0, 75) ?? [];
  const targetIds = new Set(plan?.targets.map((target) => target.playerId) ?? []);
  const liveBidBoard =
    workspace?.league == null || projection === null
      ? null
      : createLiveBidBoard({
          league: workspace.league,
          market,
          plan: workspace.plan,
          projection,
          valuation,
        });
  const calibrationStale =
    valuation !== null &&
    (valuation.seasonKey !== projection?.seasonKey ||
      valuation.projection.snapshotId !== projection?.snapshotId);
  const evePrompt = [
    `Help me, ${leagueOwnerProfile.displayName} (${leagueOwnerProfile.nickname}), refine my ${seasonKey} auction plan.`,
    `My minimum outcome is to ${leagueOwnerProfile.goals.minimumOutcome.toLocaleLowerCase()}, with ${leagueOwnerProfile.goals.primaryOutcome.toLocaleLowerCase()} as the real goal.`,
    plan
      ? `The active plan is “${plan.name}”: ${plan.strategyAngle}. Risk is ${plan.riskTolerance}; budgets are ${formatPrice(plan.anchorBudgetCents)} anchors, ${formatPrice(plan.coreBudgetCents)} core, and ${formatPrice(plan.endgameBudgetCents)} endgame, with ${plan.streamingSlots} streaming slot(s).`
      : 'Start from the balanced playoff-floor defaults shown in the planning workspace.',
    'Use our historical auction market and current Fantrax ADP. Identify assumptions to test, target/avoid candidates, and where public ADP is likely to diverge from this league.',
  ].join(' ');

  return (
    <div className={styles.page}>
      <PageHeader
        actions={
          <>
            <Link className={styles.secondaryButton} href="/draft/valuation">
              Valuation lab
            </Link>
            <AskEveButton
              className={styles.primaryButton}
              context={{ planId: plan?.id ?? null, season: seasonKey }}
              prompt={evePrompt}
            >
              Workshop with Eve
            </AskEveButton>
          </>
        }
        description={`A persistent planning room for ${leagueOwnerProfile.displayName}: test roster-building angles, set budget guardrails, and turn market signals into draft targets.`}
        title={`${seasonKey} draft plan`}
      />

      <div className={styles.notice}>
        <strong>You are {workspace?.owner?.displayName ?? leagueOwnerProfile.displayName}</strong>
        Eve receives this canonical league identity, your current plan, and your stated playoff
        floor at the start of every turn. Historical team names remain evidence, not your current
        identity.
      </div>

      {projection !== null && (valuation === null || calibrationStale) ? (
        <div className={styles.warning}>
          <strong>{calibrationStale ? 'Stale calibration' : 'No promoted calibration'}</strong>
          Live advice is using deterministic projection and historical-market fallback values until
          a valuation run linked to projection {projection.snapshotId.slice(0, 8)} is promoted.
        </div>
      ) : null}

      <section aria-label="Draft readiness" className={styles.readinessGrid}>
        <article className={styles.readinessCard}>
          <header>
            <h3>Owner context</h3>
            <span className={`${styles.statusBadge} ${styles.statusReady}`}>Ready</span>
          </header>
          <p>
            {workspace?.owner?.teamName ?? 'Current team'} is linked to the canonical Clyde /
            Brendan history.
          </p>
        </article>
        <article className={styles.readinessCard}>
          <header>
            <h3>Public ADP</h3>
            <span className={`${styles.statusBadge} ${adp ? styles.statusReady : ''}`}>
              {adp ? 'Ready' : 'Import needed'}
            </span>
          </header>
          <p>
            {adp?.summary.playerCount ?? 0} Fantrax players; movement appears after a second changed
            snapshot.
          </p>
        </article>
        <article className={styles.readinessCard}>
          <header>
            <h3>Historical market</h3>
            <span className={`${styles.statusBadge} ${market ? styles.statusReady : ''}`}>
              {market ? 'Ready' : 'Unavailable'}
            </span>
          </header>
          <p>{market?.summary.seasonCount ?? 0} league auctions seed price expectations.</p>
        </article>
        <article className={styles.readinessCard}>
          <header>
            <h3>Mock simulations</h3>
            <span className={styles.statusBadge}>Next model</span>
          </header>
          <p>
            Manager demand curves and auction simulations will build on plans and target signals.
          </p>
        </article>
      </section>

      {viewer !== null && liveBidBoard !== null ? <LiveBidPanel board={liveBidBoard} /> : null}

      {viewer === null || workspace?.league == null ? (
        <DataUnavailable
          detail="Sign in and ensure the current Fantrax league season has been imported."
          title="Planning workspace unavailable"
        />
      ) : (
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>{plan?.name ?? defaults.name}</h2>
              <p>Save a strategy thesis Eve can challenge and use in every draft conversation.</p>
            </div>
            <span className={`${styles.statusBadge} ${plan ? styles.statusReady : ''}`}>
              {plan ? 'Saved' : 'Draft'}
            </span>
          </header>
          <form action={savePreDraftPlanAction} className={styles.planForm}>
            <input name="seasonKey" type="hidden" value={seasonKey} />
            <div className={styles.formGrid}>
              <label className={styles.field}>
                <span>Scenario name</span>
                <input defaultValue={plan?.name ?? defaults.name} maxLength={80} name="name" />
              </label>
              <label className={styles.field}>
                <span>Minimum outcome</span>
                <select defaultValue={plan?.primaryGoal ?? defaults.primaryGoal} name="primaryGoal">
                  <option value="make-playoffs">Make the playoffs</option>
                  <option value="win-championship">Win the championship</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Risk tolerance</span>
                <select
                  defaultValue={plan?.riskTolerance ?? defaults.riskTolerance}
                  name="riskTolerance"
                >
                  <option value="conservative">Conservative</option>
                  <option value="balanced">Balanced</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Streaming slots</span>
                <input
                  defaultValue={plan?.streamingSlots ?? defaults.streamingSlots}
                  max={3}
                  min={0}
                  name="streamingSlots"
                  type="number"
                />
              </label>
              <label className={`${styles.field} ${styles.formWide}`}>
                <span>Strategy angle</span>
                <input
                  defaultValue={plan?.strategyAngle ?? defaults.strategyAngle}
                  maxLength={160}
                  name="strategyAngle"
                />
              </label>
              <label className={styles.field}>
                <span>Anchor budget</span>
                <input
                  defaultValue={dollars(plan?.anchorBudgetCents ?? defaults.anchorBudgetCents)}
                  min={0}
                  name="anchorBudget"
                  step="1"
                  type="number"
                />
              </label>
              <label className={styles.field}>
                <span>Core budget</span>
                <input
                  defaultValue={dollars(plan?.coreBudgetCents ?? defaults.coreBudgetCents)}
                  min={0}
                  name="coreBudget"
                  step="1"
                  type="number"
                />
              </label>
              <label className={styles.field}>
                <span>Endgame budget</span>
                <input
                  defaultValue={dollars(plan?.endgameBudgetCents ?? defaults.endgameBudgetCents)}
                  min={0}
                  name="endgameBudget"
                  step="1"
                  type="number"
                />
              </label>
              <label className={`${styles.field} ${styles.formWide}`}>
                <span>Working notes</span>
                <textarea
                  defaultValue={plan?.notes ?? defaults.notes}
                  maxLength={1_500}
                  name="notes"
                  rows={4}
                />
              </label>
            </div>
            <div className={styles.formActions}>
              <span>
                Planned budget:{' '}
                {formatPrice(
                  (plan?.anchorBudgetCents ?? defaults.anchorBudgetCents) +
                    (plan?.coreBudgetCents ?? defaults.coreBudgetCents) +
                    (plan?.endgameBudgetCents ?? defaults.endgameBudgetCents),
                )}{' '}
                · League base {formatPrice(workspace.league.baseBudgetCents)}
              </span>
              <button className={styles.primaryButton} type="submit">
                Save planning context
              </button>
            </div>
          </form>
        </section>
      )}

      <div className={styles.splitLayout}>
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>Fantrax public market</h2>
              <p>ADP is a demand prior, not a projection or a league-specific auction price.</p>
            </div>
            <span className={styles.badge}>
              {adp ? new Date(adp.capturedAt).toLocaleDateString() : 'No snapshot'}
            </span>
          </header>
          {adp === null ? (
            <DataUnavailable
              detail="Run the versioned Fantrax ADP import to seed this board."
              title="ADP unavailable"
            />
          ) : (
            <section aria-label="Fantrax ADP table" className={styles.tableViewport}>
              <a className={styles.skipLink} href="#after-fantrax-adp">
                Skip Fantrax ADP table
              </a>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Player</th>
                    <th scope="col">ADP</th>
                    <th scope="col">Move</th>
                  </tr>
                </thead>
                <tbody>
                  {adp.players.slice(0, 30).map((player) => (
                    <tr key={player.playerId}>
                      <td className={styles.rank}>{player.rank}</td>
                      <th aria-label={player.playerName} scope="row">
                        <span className={styles.tablePlayer}>
                          <strong>{player.playerName}</strong>
                          <small>{player.position}</small>
                        </span>
                      </th>
                      <td>{player.adp.toFixed(1)}</td>
                      <td
                        className={
                          player.movement === null || Math.abs(player.movement) < 0.01
                            ? styles.neutral
                            : player.movement > 0
                              ? styles.positive
                              : styles.negative
                        }
                      >
                        {player.movement === null
                          ? 'Baseline'
                          : `${player.movement > 0 ? '+' : ''}${player.movement.toFixed(1)}`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
        </section>

        <section className={styles.panel} id="after-fantrax-adp">
          <header className={styles.panelHeader}>
            <div>
              <h2>Scenario targets</h2>
              <p>Targets, watches, and avoids stay scoped to the saved plan.</p>
            </div>
            <span className={styles.badge}>{plan?.targets.length ?? 0} saved</span>
          </header>
          {plan === null || plan === undefined ? (
            <div className={styles.empty}>
              <strong>Save the scenario first</strong>
              The target board will attach player convictions and bid guardrails to it.
            </div>
          ) : (
            <div className={styles.targetWorkspace}>
              <form action={savePreDraftTargetAction} className={styles.targetForm}>
                <input name="planId" type="hidden" value={plan.id} />
                <label className={styles.field}>
                  <span>Player</span>
                  <select name="playerId" required>
                    {adpBoard
                      .filter((player) => !targetIds.has(player.playerId))
                      .map((player) => (
                        <option key={player.playerId} value={player.playerId}>
                          {player.rank}. {player.playerName} ({player.position})
                        </option>
                      ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Stance</span>
                  <select defaultValue="watch" name="stance">
                    <option value="target">Target</option>
                    <option value="watch">Watch</option>
                    <option value="avoid">Avoid</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Max bid ($)</span>
                  <input min={0} name="maxBid" placeholder="Optional" step="1" type="number" />
                </label>
                <label className={styles.field}>
                  <span>Priority</span>
                  <select defaultValue="3" name="priority">
                    {[1, 2, 3, 4, 5].map((priority) => (
                      <option key={priority} value={priority}>
                        {priority}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={`${styles.field} ${styles.formWide}`}>
                  <span>Why this stance?</span>
                  <input maxLength={240} name="rationale" placeholder="Optional working thesis" />
                </label>
                <button className={styles.secondaryButton} type="submit">
                  Add to scenario
                </button>
              </form>
              {plan.targets.length === 0 ? (
                <div className={styles.empty}>
                  <strong>No targets yet</strong>
                  Use the current public board to record the first player thesis.
                </div>
              ) : (
                <ul className={styles.targetList}>
                  {plan.targets.map((target) => (
                    <li key={target.targetId}>
                      <span>
                        <strong>{target.playerName}</strong>
                        <small>{target.rationale || `Priority ${target.priority}`}</small>
                      </span>
                      <span>
                        {target.stance}
                        {target.maxBidCents === null ? '' : ` · ${formatPrice(target.maxBidCents)}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      </div>

      <section className={styles.panel}>
        <header className={styles.panelHeader}>
          <div>
            <h2>Historical league price board</h2>
            <p>Use league behavior to challenge public ADP before we fit the price model.</p>
          </div>
          <span className={styles.badge}>{market?.summary.latestSeason ?? 'No season'} latest</span>
        </header>
        {market === null ? (
          <DataUnavailable
            detail="The historical auction market could not be loaded."
            title="Price board unavailable"
          />
        ) : (
          <section aria-label="Historical price table" className={styles.tableViewport}>
            <a className={styles.skipLink} href="#after-historical-prices">
              Skip historical price table
            </a>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">Player</th>
                  <th scope="col">Expected</th>
                  <th scope="col">Latest</th>
                  <th scope="col">Trend</th>
                  <th scope="col">Range</th>
                </tr>
              </thead>
              <tbody>
                {priceBoard.map((player, index) => (
                  <tr key={player.playerId}>
                    <td className={styles.rank}>{index + 1}</td>
                    <th aria-label={player.name} scope="row">
                      <span className={styles.tablePlayer}>
                        <strong>{player.name}</strong>
                        <small>{player.seasonsDrafted} league drafts</small>
                      </span>
                    </th>
                    <td>{formatPrice(player.expectedPriceCents)}</td>
                    <td>{formatPrice(player.latestPriceCents)}</td>
                    <td
                      className={
                        player.trendCents === null || player.trendCents === 0
                          ? styles.neutral
                          : player.trendCents > 0
                            ? styles.negative
                            : styles.positive
                      }
                    >
                      {player.trendCents === null ? 'New' : formatSignedPrice(player.trendCents)}
                    </td>
                    <td>
                      {formatPrice(player.minimumPriceCents)}–
                      {formatPrice(player.maximumPriceCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </section>

      <div className={styles.warning} id="after-historical-prices">
        <strong>Still preparation mode</strong>
        Live nominations, bids, traded or awarded budget, and current rosters still require the
        Fantrax event sync. The plan and market snapshots are intentionally durable before that
        layer arrives.
      </div>
    </div>
  );
}
