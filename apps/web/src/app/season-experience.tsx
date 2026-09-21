'use client';
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ExperienceMode, type SeasonExperience } from '../lib/season-experience';
import styles from './workflow.module.css';

const Context = createContext<
  (SeasonExperience & { preference: string; setPreference: (value: string) => void }) | null
>(null);
const key = 'fantasy-basketball:experience-mode:v1';
const subscribe = (callback: () => void) => {
  window.addEventListener('storage', callback);
  window.addEventListener(key, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(key, callback);
  };
};
const snapshot = () => {
  try {
    const value = localStorage.getItem(key);
    return value === 'preparation' || value === 'season' ? value : 'auto';
  } catch {
    return 'auto';
  }
};
export function SeasonExperienceProvider({
  experience,
  children,
}: {
  experience: SeasonExperience;
  children: ReactNode;
}) {
  const preference = useSyncExternalStore(subscribe, snapshot, () => 'auto');
  const setPreference = (value: string) => {
    try {
      localStorage.setItem(key, value);
      window.dispatchEvent(new Event(key));
    } catch {
      /* Browser storage may be unavailable. Automatic mode remains usable. */
    }
  };
  return (
    <Context.Provider
      value={{
        ...experience,
        mode: preference === 'auto' ? experience.mode : (preference as ExperienceMode),
        preference,
        setPreference,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useSeasonExperience = () => useContext(Context);

export function SeasonModeControl() {
  const experience = useSeasonExperience();
  if (!experience) return null;
  return (
    <div className={styles.modeControl}>
      <strong>
        {experience.seasonKey} ·{' '}
        {experience.mode === 'preparation' ? 'Draft preparation' : 'Season workspace'}
      </strong>
      <label>
        <span className={styles.srOnly}>Workspace mode</span>
        <select
          aria-label="Workspace mode"
          value={experience.preference}
          onChange={(event) => experience.setPreference(event.target.value)}
        >
          <option value="auto">Automatic</option>
          <option value="preparation">Draft preparation</option>
          <option value="season">Season & history</option>
        </select>
      </label>
      {!experience.calendarConfirmed ? (
        <small>Season dates need confirmation. Preparation is the safe default.</small>
      ) : null}
    </div>
  );
}
const researchContext: Record<string, { purpose: string; next: string; href: string }> = {
  '/players': {
    purpose: 'Scout players, understand risk, then add convictions to your plan.',
    next: 'Build shortlist',
    href: '/draft?step=targets',
  },
  '/league': {
    purpose: 'Use completed seasons to test what a winning roster needs.',
    next: 'Shape our plan',
    href: '/draft?step=plan',
  },
  '/managers': {
    purpose: 'Study rival spending and repeat targets before setting our bids.',
    next: 'Review our plan',
    href: '/draft?step=review',
  },
  '/trades': {
    purpose: 'Compare historical roster construction while preparing our next draft.',
    next: 'Return to our plan',
    href: '/draft?step=plan',
  },
  '/waivers': {
    purpose: 'Research inexpensive production and streaming habits for the endgame budget.',
    next: 'Set budget guardrails',
    href: '/draft?step=plan',
  },
  '/settings': {
    purpose: 'Keep scoring and roster constraints in view as you build the plan.',
    next: 'Open draft plan',
    href: '/draft?step=plan',
  },
  '/draft/valuation': {
    purpose: 'Check price evidence before choosing player bid limits.',
    next: 'Set player limits',
    href: '/draft?step=targets',
  },
};
export function WorkspaceGuide() {
  const pathname = usePathname();
  const experience = useSeasonExperience();
  const context = researchContext[pathname];
  if (!context || experience?.mode !== 'preparation') return null;
  return (
    <div className={styles.guide}>
      <span>{context.purpose}</span>
      <Link href={context.href}>
        {context.next} <span aria-hidden="true">→</span>
      </Link>
    </div>
  );
}

export function SeasonCalendarStatus() {
  const experience = useSeasonExperience();
  if (!experience) return null;
  return (
    <section className={styles.sourceNotes}>
      <h2>Season rhythm</h2>
      <p>
        Draft preparation begins after the NBA Finals finish and continues until the league opens.
        The sidebar lets you switch presentation at any time.
      </p>
      <p>
        {experience.calendarConfirmed
          ? `${experience.seasonKey}: preparation from ${experience.preparationStartsOn}; league opening ${experience.leagueStartsOn}.`
          : 'Reviewed season dates are unavailable. Confirm the calendar before relying on Automatic mode.'}
      </p>
      <p>
        Your manual presentation preference applies to this browser. Historical rosters and evidence
        keep their original season labels.
      </p>
    </section>
  );
}
