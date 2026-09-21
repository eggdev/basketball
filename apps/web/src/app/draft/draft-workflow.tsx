'use client';
import { useSyncExternalStore, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import styles from '../workflow.module.css';

export const draftSteps = {
  plan: {
    title: 'Shape the plan',
    detail: 'Choose a roster strategy, allocate the budget, and save a working scenario.',
  },
  targets: {
    title: 'Build the shortlist',
    detail: 'Turn research into targets, watches, avoids, and player bid limits.',
  },
  review: {
    title: 'Review the plan',
    detail: 'Compare alternatives and choose the saved scenario that will guide draft day.',
  },
  live: {
    title: 'Draft day',
    detail: 'Use the active plan to evaluate bids. Manual purchases stay in this browser.',
  },
} as const;
export type DraftStep = keyof typeof draftSteps;
export function DraftWorkflow({
  initialStep,
  plan,
  targets,
  review,
  live,
  research,
  selectedName,
}: {
  initialStep: DraftStep;
  plan: ReactNode;
  targets: ReactNode;
  review: ReactNode;
  live: ReactNode;
  research: ReactNode;
  selectedName: string | null;
}) {
  // Next's search-parameter subscription also rerenders this component on same-route links.
  useSearchParams();
  const step = useSyncExternalStore(
    (notify) => {
      window.addEventListener('popstate', notify);
      window.addEventListener('draft-stage-change', notify);
      return () => {
        window.removeEventListener('popstate', notify);
        window.removeEventListener('draft-stage-change', notify);
      };
    },
    () => {
      const value = new URLSearchParams(window.location.search).get('step');
      return value && Object.hasOwn(draftSteps, value) ? (value as DraftStep) : 'plan';
    },
    () => initialStep,
  );
  const choose = (next: DraftStep) => {
    const url = new URL(window.location.href);
    url.searchParams.set('step', next);
    window.history.replaceState(null, '', url);
    window.dispatchEvent(new Event('draft-stage-change'));
  };
  const panels = { plan, targets, review, live };
  return (
    <>
      <nav className={styles.steps} aria-label="Draft planning process">
        {(Object.keys(draftSteps) as DraftStep[]).map((key, index) => (
          <button key={key} type="button" aria-pressed={step === key} onClick={() => choose(key)}>
            {index + 1}. {draftSteps[key].title}
          </button>
        ))}
      </nav>
      <header className={styles.intro}>
        <div>
          <h2>{draftSteps[step].title}</h2>
          <p>
            {draftSteps[step].detail}
            {selectedName ? ` Working scenario: ${selectedName}.` : ''}
          </p>
        </div>
        {step === 'live' ? (
          <button type="button" onClick={() => choose('review')}>
            Review guardrails
          </button>
        ) : (
          <Link href="/players">
            Open player scouting <span aria-hidden="true">↗</span>
          </Link>
        )}
      </header>
      {(Object.keys(panels) as DraftStep[]).map((key) => (
        <div key={key} hidden={key !== step} aria-label={draftSteps[key].title}>
          {panels[key]}
        </div>
      ))}
      {step === 'targets' ? (
        <details className={styles.sourceNotes}>
          <summary>Market research: public ADP and league prices</summary>
          {research}
        </details>
      ) : null}
      <nav className={styles.steps} aria-label="Continue draft planning">
        {step !== 'plan' ? (
          <button
            type="button"
            onClick={() =>
              choose(
                (['plan', 'targets', 'review', 'live'] as DraftStep[])[
                  ['plan', 'targets', 'review', 'live'].indexOf(step) - 1
                ],
              )
            }
          >
            Previous step
          </button>
        ) : null}
        {step !== 'live' ? (
          <button
            type="button"
            onClick={() =>
              choose(
                (['plan', 'targets', 'review', 'live'] as DraftStep[])[
                  ['plan', 'targets', 'review', 'live'].indexOf(step) + 1
                ],
              )
            }
          >
            Continue to{' '}
            {draftSteps[
              (['plan', 'targets', 'review', 'live'] as DraftStep[])[
                ['plan', 'targets', 'review', 'live'].indexOf(step) + 1
              ]
            ].title.toLowerCase()}
          </button>
        ) : null}
      </nav>
    </>
  );
}
