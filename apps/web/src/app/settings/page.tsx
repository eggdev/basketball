import { evaluateLeagueFormat } from '@fantasy-basketball/fantasy';
import { Effect } from 'effect';

import leagueFormatConfig from '../../../../../config/league-format.json';
import scoringConfig from '../../../../../config/scoring.json';
import { loadHistoricalAuctionMarket } from '../../lib/historical-auction-market';
import { loadHistoricalRankings } from '../../lib/historical-rankings';
import { loadLeagueRosters } from '../../lib/league-rosters';
import { loadViewer } from '../../lib/viewer';
import { AskEveButton } from '../app-shell';
import { PageHeader } from '../page-header';
import styles from '../workspace.module.css';

export const dynamic = 'force-dynamic';

const formatWeight = (points: number): string => `${points > 0 ? '+' : ''}${points}`;

export default async function SettingsPage() {
  const format = Effect.runSync(evaluateLeagueFormat(JSON.stringify(leagueFormatConfig)));
  const scoringRange = `${scoringConfig.applies_to_seasons[0]}–${scoringConfig.applies_to_seasons.at(-1)}`;
  const viewer = await loadViewer().catch(() => null);
  const [market, rankings, rosters] = await Promise.all([
    loadHistoricalAuctionMarket().catch(() => null),
    loadHistoricalRankings().catch(() => null),
    viewer === null ? Promise.resolve(null) : loadLeagueRosters().catch(() => null),
  ]);

  return (
    <div className={styles.page}>
      <PageHeader
        actions={
          <AskEveButton
            className={styles.primaryButton}
            prompt="Explain how this league's scoring weights, daily lineups, active slots, bench, and IR should affect future player valuation and projection evaluation."
          >
            Explain valuation impact
          </AskEveButton>
        }
        description="The versioned rules that drive imports, historical scoring, future projections, and roster valuation."
        eyebrow="Configuration"
        title="League settings"
      />

      <section aria-label="Data pipeline summary" className={styles.stats}>
        <article className={styles.statCard}>
          <span>Auction seasons</span>
          <strong>{market?.summary.seasonCount ?? '—'}</strong>
        </article>
        <article className={styles.statCard}>
          <span>Scored seasons</span>
          <strong>{rankings?.summary.seasonCount ?? '—'}</strong>
        </article>
        <article className={styles.statCard}>
          <span>Team seasons</span>
          <strong>{rosters?.summary.seasonCount ?? '—'}</strong>
        </article>
        <article className={styles.statCard}>
          <span>Config version</span>
          <strong>v{Math.max(scoringConfig.version, format.version)}</strong>
        </article>
      </section>

      <div className={styles.settingsGrid}>
        <section className={styles.panel}>
          <header className={styles.panelHeader}>
            <div>
              <h2>{scoringConfig.name}</h2>
              <p>
                Version {scoringConfig.version} · {scoringRange}
              </p>
            </div>
            <span className={styles.badge}>Points league</span>
          </header>
          <ul className={styles.ruleList}>
            {scoringConfig.rules.map((rule) => (
              <li key={rule.stat_key}>
                <span>{rule.label}</span>
                <strong>{formatWeight(rule.points)}</strong>
              </li>
            ))}
          </ul>
          <div className={styles.warning} style={{ margin: 14 }}>
            <strong>Bonus confirmation</strong>
            Triple-double and double-double bonuses currently stack. Confirm that behavior against
            Fantrax before publishing projection-based rankings.
          </div>
        </section>

        <div>
          <section className={styles.panel}>
            <header className={styles.panelHeader}>
              <div>
                <h2>{format.name}</h2>
                <p>Daily lineup changes · {format.teamCount} teams</p>
              </div>
              <span className={styles.badge}>{format.rosterSize} roster spots</span>
            </header>
            <div className={styles.slotGrid}>
              {format.lineupSlots.map((slot) => (
                <article key={slot.code}>
                  <strong>
                    {slot.code} ×{slot.maxActive}
                  </strong>
                  <span>{slot.label}</span>
                </article>
              ))}
            </div>
            <dl className={styles.definitionList}>
              <dt>Maximum active players</dt>
              <dd>{format.activeRosterSize}</dd>
              <dt>Reserve players</dt>
              <dd>{format.benchRosterSize}</dd>
              <dt>Injury reserve</dt>
              <dd>{format.rosterRestrictions.injuryReserve.maximumPlayers}</dd>
              <dt>IR counts toward roster limit</dt>
              <dd>
                {format.rosterRestrictions.injuryReserve.countsTowardRosterLimit ? 'Yes' : 'No'}
              </dd>
              <dt>Maximum team holdings</dt>
              <dd>{format.maxTeamPlayerHoldings}</dd>
              <dt>League active slots</dt>
              <dd>{format.leagueActiveSlots}</dd>
            </dl>
          </section>

          <section className={styles.sideCard}>
            <h3>Data contracts</h3>
            <p>
              Auction prices remain observed market behavior. Historical rankings remain actual
              results. Projections, replacement value, recommended bids, live rosters, and
              transaction history will be separate versioned inputs instead of being folded into
              either source.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
