import { formatPrice, formatSignedPrice } from '../../lib/format';
import { loadHistoricalAuctionMarket } from '../../lib/historical-auction-market';
import { loadLeagueRosters } from '../../lib/league-rosters';
import { loadViewer } from '../../lib/viewer';
import { AskEveButton } from '../app-shell';
import { DataUnavailable, PageHeader } from '../page-header';
import styles from '../workspace.module.css';

export const dynamic = 'force-dynamic';

export default async function DraftPage() {
  const viewer = await loadViewer().catch(() => null);
  const [market, rosterSnapshot] = await Promise.all([
    loadHistoricalAuctionMarket().catch(() => null),
    viewer === null ? Promise.resolve(null) : loadLeagueRosters().catch(() => null),
  ]);
  const liveSeason = rosterSnapshot?.seasons[0] ?? null;
  const priceBoard = market?.players.slice(0, 18) ?? [];

  return (
    <div className={styles.page}>
      <PageHeader
        actions={
          <AskEveButton
            className={styles.primaryButton}
            context={{ season: liveSeason?.seasonKey ?? null }}
            prompt="Build my auction draft plan from the league's historical prices, roster format, and scoring system. Start with budget tiers, nominate-versus-target guidance, and likely manager pressure points."
          >
            Build a draft plan
          </AskEveButton>
        }
        description="A preparation surface today, designed to become the live nomination, bid, budget, and roster command center."
        eyebrow="Decision room"
        title="Auction draft"
      />

      <div className={styles.warning}>
        <strong>Preparation mode</strong>
        Historical prices and next-season teams are connected. Current nominations, bids, and traded
        or awarded budget require the live Fantrax event sync before this becomes an authoritative
        draft tracker.
      </div>

      <section aria-label="Draft readiness" className={styles.readinessGrid}>
        <article className={styles.readinessCard}>
          <header>
            <h3>Team identities</h3>
            <span className={`${styles.statusBadge} ${styles.statusReady}`}>Ready</span>
          </header>
          <p>{liveSeason?.teamCount ?? 12} canonical teams are available for draft tracking.</p>
        </article>
        <article className={styles.readinessCard}>
          <header>
            <h3>Historical market</h3>
            <span className={`${styles.statusBadge} ${market ? styles.statusReady : ''}`}>
              {market ? 'Ready' : 'Unavailable'}
            </span>
          </header>
          <p>{market?.summary.seasonCount ?? 0} auctions seed price expectations and ranges.</p>
        </article>
        <article className={styles.readinessCard}>
          <header>
            <h3>Live auction feed</h3>
            <span className={styles.statusBadge}>Next</span>
          </header>
          <p>Fantrax nominations, winning bids, roster slots, and budgets are not synced yet.</p>
        </article>
        <article className={styles.readinessCard}>
          <header>
            <h3>Projection model</h3>
            <span className={styles.statusBadge}>Planned</span>
          </header>
          <p>Recommended maximum bids wait on projections and replacement-value evaluation.</p>
        </article>
      </section>

      <div className={styles.splitLayout}>
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>Historical price board</h2>
              <p>Weighted expectations provide draft context, not a recommended maximum bid.</p>
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
            <div className={styles.tableViewport}>
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
            </div>
          )}
        </section>

        <aside>
          <section className={styles.sideCard}>
            <h3>{liveSeason?.seasonKey ?? 'Next season'} starting state</h3>
            <p>Draft accounting begins at the base league budget before custom adjustments.</p>
            <dl className={styles.definitionList}>
              <dt>Teams</dt>
              <dd>{liveSeason?.teamCount ?? 12}</dd>
              <dt>Base budget</dt>
              <dd>{formatPrice(liveSeason?.baseBudgetCents ?? 20_000)}</dd>
              <dt>Standard roster</dt>
              <dd>{liveSeason?.rosterSize ?? 13}</dd>
              <dt>Active lineup</dt>
              <dd>10 daily</dd>
              <dt>Reserve / IR</dt>
              <dd>3 / 1</dd>
            </dl>
          </section>
          <section className={styles.sideCard}>
            <h3>Live-state contract</h3>
            <p>
              The future feed will append auction events and budget adjustments instead of
              overwriting history. That keeps Eve’s advice explainable during the draft.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
