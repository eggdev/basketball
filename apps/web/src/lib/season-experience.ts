import calendar from '../../../../config/season-experience.json';

export type ExperienceMode = 'preparation' | 'season';
export interface SeasonExperience {
  mode: ExperienceMode;
  seasonKey: string;
  calendarConfirmed: boolean;
  preparationStartsOn: string | null;
  leagueStartsOn: string | null;
}
export function resolveSeasonExperience(
  now = new Date(),
  seasons = calendar.seasons,
): SeasonExperience {
  const day = new Intl.DateTimeFormat('en-CA', {
    timeZone: calendar.timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const year = Number(day.slice(0, 4));
  const season = [...seasons]
    .sort((a, b) => b.preparationStartsOn.localeCompare(a.preparationStartsOn))
    .find((candidate) => candidate.preparationStartsOn <= day);
  // A stale season must never masquerade as a currently active league. Future Finals
  // completion is not guessed from June 15; maintain the reviewed annual boundaries.
  if (!season || day > `${Number(season.seasonKey.slice(0, 4)) + 1}-06-30`) {
    const startYear = day.slice(5) >= '06-01' ? year : year - 1;
    return {
      mode: 'preparation',
      seasonKey: `${startYear}-${String(startYear + 1).slice(-2)}`,
      calendarConfirmed: false,
      preparationStartsOn: null,
      leagueStartsOn: null,
    };
  }
  return {
    mode: day >= season.leagueStartsOn ? 'season' : 'preparation',
    seasonKey: season.seasonKey,
    calendarConfirmed: true,
    preparationStartsOn: season.preparationStartsOn,
    leagueStartsOn: season.leagueStartsOn,
  };
}
