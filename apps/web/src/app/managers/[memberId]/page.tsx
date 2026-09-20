import { notFound } from 'next/navigation';

import { formatPrice } from '../../../lib/format';
import { loadLeagueTeamHistory } from '../../../lib/league-team-history';
import { loadViewer } from '../../../lib/viewer';
import { AskEveButton } from '../../app-shell';
import { DataUnavailable, PageHeader } from '../../page-header';
import styles from '../../workspace.module.css';

export const dynamic = 'force-dynamic';

export default async function ManagerProfilePage({
  params,
}: {
  readonly params: Promise<{ memberId: string }>;
}) {
  const { memberId } = await params;
  const viewer = await loadViewer().catch(() => null);
  const history = viewer === null ? null : await loadLeagueTeamHistory().catch(() => null);
  const member = history?.members.find((candidate) => candidate.memberId === memberId) ?? null;

  if (history !== null && member === null) notFound();

  return (
    <div className={styles.page}>
      <PageHeader
        actions={
          member ? (
            <AskEveButton
              className={styles.primaryButton}
              context={{ manager: member.displayName }}
              prompt={`Build a detailed auction profile for ${member.displayName}. Explain repeat targets, spending changes by season, likely biases, and how I should prepare to bid against them.`}
            >
              Ask Eve for a profile
            </AskEveButton>
          ) : null
        }
        description="Season-by-season auction behavior and manager identity history."
        title={member?.displayName ?? 'Manager profile'}
      />

      {member === null ? (
        <section className={styles.panel}>
          <DataUnavailable
            detail={
              viewer === null
                ? 'Sign in with the league owner account to open this profile.'
                : 'The manager profile could not be loaded.'
            }
            title={viewer === null ? 'Owner access required' : 'Profile unavailable'}
          />
        </section>
      ) : (
        <div className={styles.profileLayout}>
          <section className={`${styles.panel} ${styles.profileHero}`}>
            <header className={styles.profileHeading}>
              <div>
                <h2>{member.displayName}</h2>
                <p>{member.teamNames.join(' · ')}</p>
              </div>
              <span className={styles.badge}>{member.seasons.length} tracked seasons</span>
            </header>

            <div className={styles.stats} style={{ marginTop: 18 }}>
              <article className={styles.statCard}>
                <span>Total purchases</span>
                <strong>{member.purchaseCount}</strong>
              </article>
              <article className={styles.statCard}>
                <span>Total spend</span>
                <strong>{formatPrice(member.totalSpendCents)}</strong>
              </article>
              <article className={styles.statCard}>
                <span>Spend per season</span>
                <strong>
                  {formatPrice(Math.round(member.totalSpendCents / member.seasons.length))}
                </strong>
              </article>
              <article className={styles.statCard}>
                <span>Team aliases</span>
                <strong>{member.teamNames.length}</strong>
              </article>
            </div>

            <h3 className={styles.sectionTitle}>Season history</h3>
            <div className={styles.seasonTimeline}>
              {[...member.seasons].reverse().map((season) => (
                <article
                  className={styles.seasonRow}
                  key={`${season.seasonKey}-${season.sourceTeamId}`}
                >
                  <strong>{season.seasonKey}</strong>
                  <span>{season.teamName}</span>
                  <span>{season.purchaseCount} picks</span>
                  <span>{formatPrice(season.averagePriceCents)} avg</span>
                  <span>{formatPrice(season.totalSpendCents)}</span>
                </article>
              ))}
            </div>
          </section>

          <aside>
            <section className={styles.sideCard}>
              <h3>Repeat targets</h3>
              <p>Players this manager returned to across imported auctions.</p>
              <ul className={styles.favoriteList}>
                {member.favoritePlayers.map((player) => (
                  <li key={player.playerId}>
                    <span>
                      {player.playerName} · {player.draftCount}×
                    </span>
                    <strong>{formatPrice(player.averagePriceCents)}</strong>
                  </li>
                ))}
              </ul>
            </section>
            <section className={styles.sideCard}>
              <h3>Analysis boundary</h3>
              <p>
                This profile currently describes auction behavior. Champion tiers, standings,
                transactions, and roster outcomes will be joined before it claims which strategies
                win.
              </p>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}
