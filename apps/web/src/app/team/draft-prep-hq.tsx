'use client';
import type {
  LatestProjectionSnapshot,
  PreDraftWorkspace,
} from '@fantasy-basketball/database/runtime';
import type { PlayerSituationBoard } from '@fantasy-basketball/fantasy';
import { useState } from 'react';
import Link from 'next/link';
import { PlayerCard, PlayerSignalLegend } from '../player-card';
import { AskEveButton } from '../app-shell';
import { formatPrice } from '../../lib/format';
import styles from './team-hq.module.css';
import flow from '../workflow.module.css';

export function DraftPrepHq({
  seasonKey,
  authenticated,
  workspace,
  projections,
  situations,
}: {
  seasonKey: string;
  authenticated: boolean;
  workspace: PreDraftWorkspace | null;
  projections: LatestProjectionSnapshot | null;
  situations: PlayerSituationBoard | null;
}) {
  const [query, setQuery] = useState('');
  const [lens, setLens] = useState('all');
  const plan = workspace?.activePlan;
  const current = projections?.seasonKey === seasonKey ? projections : null;
  const situationMap = new Map(
    (situations?.seasonKey === seasonKey ? situations.players : []).map((player) => [
      player.playerId,
      player,
    ]),
  );
  const targetIds = new Set(
    plan?.targets.filter((target) => target.stance === 'target').map((target) => target.playerId),
  );
  const players = [...(current?.players ?? [])]
    .sort((a, b) => a.rank - b.rank)
    .filter((player) => {
      const situation = situationMap.get(player.playerId);
      return (
        player.playerName.toLowerCase().includes(query.toLowerCase().trim()) &&
        (lens === 'all' ||
          (lens === 'targets' && targetIds.has(player.playerId)) ||
          (lens === 'durable' && player.availability.tier === 'durable') ||
          (lens === 'movement' && situation?.movement.isNewTeam) ||
          (lens === 'opportunity' && situation?.opportunity.direction === 'up'))
      );
    });
  const planHref = plan ? `/draft?plan=${encodeURIComponent(plan.id)}` : '/draft';
  return (
    <div className={styles.page}>
      <header className={styles.heading}>
        <div>
          <h1>Prepare for {seasonKey}</h1>
          <p>Build our next team, one decision at a time.</p>
        </div>
        <Link
          className={styles.action}
          style={{ width: 'auto' }}
          href={`${planHref}${plan ? '&' : '?'}step=plan`}
        >
          {plan ? 'Continue our plan' : 'Start our draft plan'} <span aria-hidden="true">→</span>
        </Link>
      </header>
      <section className={styles.teamBanner} aria-label="Draft preparation status">
        <div className={styles.teamIdentity}>
          <div>
            <h2>{plan?.name ?? 'Our next roster starts here'}</h2>
            <p>
              {plan?.strategyAngle ??
                'Set the strategy, scout players, and bring a reviewed plan to draft day.'}
            </p>
            <span>
              {plan
                ? `Active saved plan · ${plan.riskTolerance} risk · ${plan.streamingSlots} streaming slot(s)`
                : authenticated
                  ? 'No active plan loaded for this season'
                  : 'Sign in with the owner account to save your plan'}
            </span>
          </div>
        </div>
        {plan ? (
          <dl className={styles.scoreboard}>
            <div>
              <dt>Planned budget</dt>
              <dd>
                {formatPrice(
                  plan.anchorBudgetCents + plan.coreBudgetCents + plan.endgameBudgetCents,
                )}
              </dd>
            </div>
            <div>
              <dt>Targets</dt>
              <dd>{targetIds.size}</dd>
            </div>
          </dl>
        ) : null}
      </section>
      <section className={styles.section} aria-label="Preparation process">
        <div className={flow.progress}>
          <Link href={`${planHref}${plan ? '&' : '?'}step=plan`}>
            <strong>1. Shape the plan</strong>
            <small>Choose a strategy and divide the auction budget.</small>
            <span>{plan ? 'Plan saved · keep refining' : 'Start here'}</span>
          </Link>
          <Link href={`${planHref}${plan ? '&' : '?'}step=targets`}>
            <strong>2. Build the shortlist</strong>
            <small>Record targets, watches, avoids, and player limits.</small>
            <span>
              {plan?.targets.length
                ? `${plan.targets.length} player stances saved`
                : 'Turn research into convictions'}
            </span>
          </Link>
          <Link href={`${planHref}${plan ? '&' : '?'}step=review`}>
            <strong>3. Review the plan</strong>
            <small>Compare alternatives and choose draft-day guardrails.</small>
            <span>Review before the auction</span>
          </Link>
        </div>
      </section>
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <div>
            <h2>Scout the upcoming draft</h2>
            <p>
              {current
                ? `${seasonKey} projections · as of ${current.asOf.slice(0, 10)}. Tiers use projection rank.`
                : `Waiting for ${seasonKey} projections. Prior-season results remain research, not next-season forecasts.`}
            </p>
          </div>
          <Link className={styles.textLink} href="/players">
            Full player board <span aria-hidden="true">↗</span>
          </Link>
        </header>
        <PlayerSignalLegend />
        <fieldset className={styles.lenses} aria-label="Scouting focus">
          {[
            ['all', 'Top of the board'],
            ['targets', 'Our targets'],
            ['durable', 'Durable players'],
            ['movement', 'New teams'],
            ['opportunity', 'Role upside'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={lens === value}
              onClick={() => setLens(value)}
            >
              {label}
            </button>
          ))}
        </fieldset>
        <div className={styles.sectionHeader} style={{ margin: '16px 0' }}>
          <label className={styles.season}>
            Search players
            <input
              type="search"
              aria-label="Search draft scouting"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Player name"
            />
          </label>
          <span className={styles.evidence}>{players.length} matching players</span>
        </div>
        {players.length ? (
          <div className={styles.roster}>
            {players.slice(0, 12).map((player) => (
              <PlayerCard
                key={player.playerId}
                playerId={player.playerId}
                playerName={player.playerName}
                projection={player}
                projectionSeason={seasonKey}
                situation={situationMap.get(player.playerId)}
              />
            ))}
          </div>
        ) : (
          <div className={styles.empty}>
            <h3>
              {current ? 'No players in this view yet' : 'Upcoming player estimates are not ready'}
            </h3>
            <p>
              {lens === 'targets'
                ? 'Save target stances in the shortlist step to bring them here.'
                : current
                  ? 'Try another scouting focus or clear your search.'
                  : 'You can still work on strategy, budget, league history, and rival tendencies.'}
            </p>
            <Link href={lens === 'targets' ? '/draft?step=targets' : '/players'}>
              {lens === 'targets' ? 'Build the shortlist' : 'Open player research'} →
            </Link>
          </div>
        )}
      </section>
      <section className={styles.section}>
        <header className={styles.sectionHeader}>
          <div>
            <h2>Evidence for a better draft</h2>
            <p>Use last season to challenge this year’s plan.</p>
          </div>
          <AskEveButton
            className={styles.ask}
            context={{ season: seasonKey, planId: plan?.id ?? null, mode: 'preparation' }}
            prompt={`Challenge our ${seasonKey} draft preparation. Use the saved active plan if one exists. Separate historical rosters, upcoming projections and missing evidence. Identify the next decision to make.`}
          >
            Challenge the plan with Eve
          </AskEveButton>
        </header>
        <div className={styles.moves}>
          <Link href="/league">
            <span>
              <strong>What did winning teams do?</strong>
              <small>Compare past strength, lineup volume, and schedule luck.</small>
            </span>
            <span>→</span>
          </Link>
          <Link href="/managers">
            <span>
              <strong>How do our rivals spend?</strong>
              <small>Learn repeat targets and auction tendencies.</small>
            </span>
            <span>→</span>
          </Link>
          <Link href="/waivers">
            <span>
              <strong>Where was inexpensive production?</strong>
              <small>Shape the endgame and streaming budget.</small>
            </span>
            <span>→</span>
          </Link>
        </div>
      </section>
    </div>
  );
}
