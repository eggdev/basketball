import { PreDraftScenarioError } from '@fantasy-basketball/database/runtime';
import { leagueOwnerProfile } from '@fantasy-basketball/fantasy';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { formatPrice, formatSignedPrice } from '../../lib/format';
import { createLiveBidBoard } from '../../lib/create-live-bid-board';
import { loadHistoricalAuctionMarket } from '../../lib/historical-auction-market';
import { loadLatestAdpSnapshot } from '../../lib/latest-adp';
import { loadLatestProjectionSnapshot } from '../../lib/latest-projections';
import { loadPreDraftWorkspace } from '../../lib/pre-draft-workspace';
import { loadViewer } from '../../lib/viewer';
import { loadPromotedAuctionValuationRun } from '../../lib/valuation-lab';
import { AskEveButton } from '../app-shell';
import { DataUnavailable, PageHeader } from '../page-header';
import styles from '../workspace.module.css';
import { resolveSeasonExperience } from '../../lib/season-experience';
import { loadPlayerSituationBoard } from '../../lib/player-situations';
import { DraftWorkflow, type DraftStep } from './draft-workflow';
import workflowStyles from '../workflow.module.css';
import { LiveBidPanel } from './live-bid-panel';
import { ScenarioTargetWorkspace, ScenarioWorkspace } from './scenario-workspace';

export const dynamic = 'force-dynamic';

export default async function DraftPage({
  searchParams,
}: {
  readonly searchParams: Promise<{
    readonly compare?: string;
    readonly plan?: string;
    readonly step?: string;
  }>;
}) {
  const query = await searchParams;
  const experience = resolveSeasonExperience();
  const step: DraftStep =
    query.step === 'targets' || query.step === 'review' || query.step === 'live'
      ? query.step
      : 'plan';
  const requestedPlanId = typeof query.plan === 'string' ? query.plan : undefined;
  const viewer = await loadViewer().catch(() => null);
  const [market, adp, workspace, projection] = await Promise.all([
    loadHistoricalAuctionMarket().catch(() => null),
    loadLatestAdpSnapshot().catch(() => null),
    viewer === null
      ? Promise.resolve(null)
      : loadPreDraftWorkspace(experience.seasonKey, requestedPlanId).catch((error: unknown) => {
          if (error instanceof PreDraftScenarioError && error.code === 'plan_not_found') {
            redirect('/draft');
          }
          return null;
        }),
    viewer === null ? Promise.resolve(null) : loadLatestProjectionSnapshot().catch(() => null),
  ]);
  const situations = projection
    ? await loadPlayerSituationBoard(projection).catch(() => null)
    : null;
  const valuation =
    viewer === null || projection === null
      ? null
      : await loadPromotedAuctionValuationRun(projection.seasonKey).catch(() => null);
  const seasonKey = workspace?.league?.seasonKey ?? experience.seasonKey;
  const plan = workspace?.selectedPlan;
  const activePlan = workspace?.activePlan;
  const defaults = leagueOwnerProfile.defaultPlan;
  const priceBoard = market?.players.slice(0, 14) ?? [];
  const adpBoard = adp?.players.slice(0, 75) ?? [];
  const requestedComparePlanIds = [
    ...new Set((typeof query.compare === 'string' ? query.compare.split(',') : []).filter(Boolean)),
  ];
  const comparePlanIds =
    requestedComparePlanIds.length >= 2
      ? requestedComparePlanIds.slice(0, 3)
      : activePlan !== undefined &&
          activePlan !== null &&
          plan !== undefined &&
          plan !== null &&
          activePlan.id !== plan.id
        ? [activePlan.id, plan.id]
        : [];
  const liveBidBoard =
    workspace?.league == null || projection === null || projection.seasonKey !== seasonKey
      ? null
      : createLiveBidBoard({
          league: workspace.league,
          market,
          plan: workspace.activePlan,
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
      ? `The selected working plan is “${plan.name}”: ${plan.strategyAngle}. Risk is ${plan.riskTolerance}; budgets are ${formatPrice(plan.anchorBudgetCents)} anchors, ${formatPrice(plan.coreBudgetCents)} core, and ${formatPrice(plan.endgameBudgetCents)} endgame, with ${plan.streamingSlots} streaming slot(s).`
      : 'No saved scenario is selected. Start from the balanced playoff-floor defaults shown in the planning workspace.',
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
              Plan with Eve
            </AskEveButton>
          </>
        }
        description="Develop a strategy, set player limits, and bring a reviewed plan to the auction."
        title={`${seasonKey} draft plan`}
      />

      <DraftWorkflow
        initialStep={step}
        selectedName={plan?.name ?? null}
        plan={
          viewer === null || workspace?.league == null ? (
            <DataUnavailable
              detail={
                viewer === null
                  ? 'Sign in with the league owner account to open the planning workspace.'
                  : 'Import the current Fantrax league season to open the planning workspace.'
              }
              title={viewer === null ? 'Owner access required' : 'Planning data unavailable'}
            />
          ) : (
            <ScenarioWorkspace
              mode="plan"
              comparePlanIds={comparePlanIds}
              defaults={defaults}
              seasonKey={seasonKey}
              workspace={workspace}
            />
          )
        }
        targets={
          <section className={styles.panel} id="after-fantrax-adp">
            <header className={styles.panelHeader}>
              <div>
                <h2>{plan?.name ?? 'Scenario'} targets</h2>
                <p>
                  Targets, watches, and avoids stay scoped to the selected{' '}
                  {plan?.id === workspace?.activePlanId ? 'active plan' : 'preview'}.
                </p>
              </div>
              <span className={styles.badge}>{plan?.targets.length ?? 0} saved</span>
            </header>
            <ScenarioTargetWorkspace
              adpBoard={adpBoard}
              plan={plan ?? null}
              seasonKey={seasonKey}
            />
          </section>
        }
        review={
          workspace?.league ? (
            <>
              <ScenarioWorkspace
                mode="review"
                comparePlanIds={comparePlanIds}
                defaults={defaults}
                seasonKey={seasonKey}
                workspace={workspace}
              />
              <p className={workflowStyles.sourceNotes}>
                Only saved values are reviewed here. Save edits before comparing or activating a
                scenario. Player caps and risk settings belong to that scenario.
              </p>
            </>
          ) : (
            <DataUnavailable
              title="Save a plan first"
              detail="Open Shape the plan to create a scenario for this season."
            />
          )
        }
        live={
          <>
            {projection !== null && (valuation === null || calibrationStale) ? (
              <div className={styles.warning}>
                <strong>
                  {calibrationStale
                    ? 'Price calibration needs review'
                    : 'Using fallback price estimates'}
                </strong>
                Projection and historical-market estimates remain available. Review the valuation
                lab before relying on calibrated bids.
              </div>
            ) : null}
            {viewer !== null && liveBidBoard !== null ? (
              <LiveBidPanel board={liveBidBoard} situations={situations} />
            ) : (
              <DataUnavailable
                title="Draft board not ready"
                detail="Sign in and load this season’s league and projections to evaluate bids."
              />
            )}
            <p className={workflowStyles.sourceNotes}>
              Manual draft tracking. Nominations and purchases are not synced from Fantrax.
            </p>
          </>
        }
        research={
          <div className={styles.splitLayout}>
            {' '}
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
            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Historical league price board</h2>
                  <p>Use league behavior to challenge public ADP before we fit the price model.</p>
                </div>
                <span className={styles.badge}>
                  {market?.summary.latestSeason ?? 'No season'} latest
                </span>
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
                            {player.trendCents === null
                              ? 'New'
                              : formatSignedPrice(player.trendCents)}
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
          </div>
        }
      />
    </div>
  );
}
