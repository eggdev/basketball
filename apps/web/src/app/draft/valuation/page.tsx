import Link from 'next/link';

import { formatPrice, formatSignedPrice } from '../../../lib/format';
import { loadHistoricalRankings } from '../../../lib/historical-rankings';
import { loadLatestProjectionSnapshot } from '../../../lib/latest-projections';
import { loadPreDraftWorkspace } from '../../../lib/pre-draft-workspace';
import { createAuctionValuationLab } from '../../../lib/valuation-lab';
import { loadViewer } from '../../../lib/viewer';
import { AskEveButton } from '../../app-shell';
import { DataUnavailable, PageHeader } from '../../page-header';
import styles from '../../workspace.module.css';

export const dynamic = 'force-dynamic';

const percentage = (value: number | null): string =>
  value === null ? '—' : `${Math.round(value * 100)}%`;

export default async function ValuationLabPage() {
  const viewer = await loadViewer().catch(() => null);
  if (viewer === null) {
    return (
      <div className={styles.page}>
        <PageHeader
          description="Compare auction-price models against completed league seasons without letting future results leak into their predictions."
          eyebrow="Draft research"
          title="Valuation calibration"
        />
        <DataUnavailable
          detail="Sign in to inspect private league history."
          title="Sign-in required"
        />
      </div>
    );
  }

  const [rankings, projection, workspace] = await Promise.all([
    loadHistoricalRankings().catch(() => null),
    loadLatestProjectionSnapshot().catch(() => null),
    loadPreDraftWorkspace().catch(() => null),
  ]);
  const lab =
    rankings === null || projection === null || workspace === null || workspace.league === null
      ? null
      : createAuctionValuationLab({ league: workspace.league, projection, rankings });
  const selectedModel = lab?.models.find((model) => model.id === lab.selectedModelId) ?? null;
  const currentPlayers = lab?.current?.players.slice(0, 75) ?? [];
  const hindsightBargains =
    selectedModel?.predictions
      .filter(
        (prediction) => prediction.actualPriceCents > 0 && prediction.realizedSurplusCents !== null,
      )
      .sort(
        (left, right) =>
          (right.realizedSurplusCents ?? Number.NEGATIVE_INFINITY) -
            (left.realizedSurplusCents ?? Number.NEGATIVE_INFINITY) ||
          left.playerName.localeCompare(right.playerName),
      )
      .slice(0, 15) ?? [];
  const evePrompt =
    selectedModel === null
      ? 'Help me diagnose what data is missing from the auction valuation calibration lab.'
      : [
          `Review our auction valuation calibration results. The selected model is ${selectedModel.label} (${selectedModel.id}).`,
          `Its drafted-player MAE is ${formatPrice(selectedModel.metrics.draftedPlayerMaeCents ?? 0)}, with ${percentage(selectedModel.metrics.fairRangeCoverageRate)} fair-range coverage across ${selectedModel.metrics.draftedPlayerCount} drafted-player predictions.`,
          'Explain what this does and does not prove, identify the most decision-relevant current value gaps, and propose one concrete next calibration experiment. Do not describe hindsight production as a preseason projection.',
        ].join(' ');

  return (
    <div className={styles.page}>
      <PageHeader
        actions={
          <>
            <Link className={styles.secondaryButton} href="/draft">
              Draft room
            </Link>
            <AskEveButton
              className={styles.primaryButton}
              context={{
                modelId: lab?.selectedModelId ?? null,
                planId: workspace?.plan?.id ?? null,
                season: lab?.current?.seasonKey ?? null,
              }}
              prompt={evePrompt}
            >
              Review with Eve
            </AskEveButton>
          </>
        }
        description="Walk-forward tests show how each price model would have performed using only information available before that season’s auction."
        eyebrow="Draft research"
        title="Valuation calibration"
      />

      {lab === null || selectedModel === null ? (
        <DataUnavailable
          detail="Historical rankings, current projections, and the active league settings are all required."
          title="Calibration inputs unavailable"
        />
      ) : (
        <>
          <div className={styles.notice}>
            <strong>No future leakage</strong>
            {lab.methodology}
          </div>

          <div className={styles.sectionStack}>
            <section aria-label="Selected model metrics" className={styles.stats}>
              <article className={styles.statCard}>
                <span>Selected model</span>
                <strong>{selectedModel.label}</strong>
              </article>
              <article className={styles.statCard}>
                <span>Drafted-player MAE</span>
                <strong>{formatPrice(selectedModel.metrics.draftedPlayerMaeCents ?? 0)}</strong>
              </article>
              <article className={styles.statCard}>
                <span>Within $5</span>
                <strong>{percentage(selectedModel.metrics.withinFiveDollarsRate)}</strong>
              </article>
              <article className={styles.statCard}>
                <span>Fair-range coverage</span>
                <strong>{percentage(selectedModel.metrics.fairRangeCoverageRate)}</strong>
              </article>
            </section>

            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>Model comparison</h2>
                  <p>
                    The lowest drafted-player error wins; undrafted players are still included in
                    the all-player diagnostic.
                  </p>
                </div>
                <span className={`${styles.statusBadge} ${styles.statusReady}`}>{lab.version}</span>
              </header>
              <div className={styles.tableViewport}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Model</th>
                      <th>Method</th>
                      <th>Drafted MAE</th>
                      <th>All-player MAE</th>
                      <th>Within $5</th>
                      <th>Coverage</th>
                      <th>Predictions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lab.models.map((model) => (
                      <tr key={model.id}>
                        <td aria-label={`${model.label} model`}>
                          <span className={styles.tablePlayer}>
                            <strong>{model.label}</strong>
                            <small>
                              {model.id === lab.selectedModelId ? 'Selected' : model.id}
                            </small>
                          </span>
                        </td>
                        <td>{model.description}</td>
                        <td>{formatPrice(model.metrics.draftedPlayerMaeCents ?? 0)}</td>
                        <td>{formatPrice(model.metrics.allPlayerMaeCents)}</td>
                        <td>{percentage(model.metrics.withinFiveDollarsRate)}</td>
                        <td>{percentage(model.metrics.fairRangeCoverageRate)}</td>
                        <td>{model.metrics.predictionCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className={styles.splitLayout}>
              <section className={styles.panel}>
                <header className={styles.panelHeader}>
                  <div>
                    <h2>Walk-forward seasons</h2>
                    <p>Selected-model accuracy by auction year.</p>
                  </div>
                </header>
                <div className={styles.tableViewport}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Season</th>
                        <th>Drafted MAE</th>
                        <th>Within $5</th>
                        <th>Coverage</th>
                        <th>New players</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedModel.seasons.map((season) => (
                        <tr key={season.seasonKey}>
                          <td>{season.seasonKey}</td>
                          <td>{formatPrice(season.metrics.draftedPlayerMaeCents ?? 0)}</td>
                          <td>{percentage(season.metrics.withinFiveDollarsRate)}</td>
                          <td>{percentage(season.metrics.fairRangeCoverageRate)}</td>
                          <td>{season.metrics.newPlayerCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section className={styles.panel}>
                <header className={styles.panelHeader}>
                  <div>
                    <h2>Hindsight bargains</h2>
                    <p>Realized production value minus actual auction price—not a forecast.</p>
                  </div>
                </header>
                <div className={styles.tableViewport}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Player</th>
                        <th>Season</th>
                        <th>Paid</th>
                        <th>Realized value</th>
                        <th>Surplus</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hindsightBargains.map((prediction) => (
                        <tr key={`${prediction.seasonKey}:${prediction.playerId}`}>
                          <td>{prediction.playerName}</td>
                          <td>{prediction.seasonKey}</td>
                          <td>{formatPrice(prediction.actualPriceCents)}</td>
                          <td>
                            {prediction.realizedValueCents === null
                              ? '—'
                              : formatPrice(prediction.realizedValueCents)}
                          </td>
                          <td className={styles.positive}>
                            {prediction.realizedSurplusCents === null
                              ? '—'
                              : formatSignedPrice(prediction.realizedSurplusCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>

            <section className={styles.panel}>
              <header className={styles.panelHeader}>
                <div>
                  <h2>{lab.current?.seasonKey ?? 'Current'} calibrated board</h2>
                  <p>
                    Expected league price, empirical error range, and current projection value stay
                    separate.
                  </p>
                </div>
                <span className={styles.badge}>{currentPlayers.length} shown</span>
              </header>
              <div className={styles.tableViewport}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Player</th>
                      <th>Proj. rank</th>
                      <th>Market estimate</th>
                      <th>Fair range</th>
                      <th>Projection value</th>
                      <th>Value gap</th>
                      <th>History</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentPlayers.map((player) => (
                      <tr key={player.playerId}>
                        <td>{player.playerName}</td>
                        <td>#{player.projectionRank}</td>
                        <td>
                          {player.isModeled ? formatPrice(player.marketEstimateCents) : 'Unmodeled'}
                        </td>
                        <td>
                          {player.isModeled
                            ? `${formatPrice(player.fairLowCents)}–${formatPrice(player.fairHighCents)}`
                            : '—'}
                        </td>
                        <td>{formatPrice(player.projectedValueCents)}</td>
                        <td
                          className={
                            player.projectedEdgeCents >= 0 ? styles.positive : styles.negative
                          }
                        >
                          {player.isModeled ? formatSignedPrice(player.projectedEdgeCents) : '—'}
                        </td>
                        <td>{player.historicalSeasonCount} seasons</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <div className={styles.warning}>
              <strong>Known limits</strong>
              {lab.limitations.join(' ')}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
