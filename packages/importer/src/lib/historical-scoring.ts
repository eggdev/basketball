import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { scoreSeason, type ScoringRules, type SeasonStatLine } from '@fantasy-basketball/fantasy';
import { Data, Effect } from 'effect';

export const historicalScoringStatKeys = [
  'ast',
  'blk',
  'fg_missed',
  'ft_missed',
  'pts',
  'reb',
  'stl',
  'fg3m',
  'triple_double',
  'turnover',
  'double_double',
] as const;

export type HistoricalScoringStatKey = (typeof historicalScoringStatKeys)[number];

export interface HistoricalScoringRule {
  readonly label: string;
  readonly points: number;
  readonly statKey: HistoricalScoringStatKey;
}

export interface LeagueScoringConfiguration {
  readonly name: string;
  readonly rules: ReadonlyArray<HistoricalScoringRule>;
  readonly scoringRules: ScoringRules;
  readonly seasons: ReadonlyArray<string>;
  readonly stackTripleDoubleBonuses: boolean;
  readonly version: number;
}

export interface PlayerProductionSeason {
  readonly gamesPlayed: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly seasonKey: string;
  readonly stats: Readonly<Record<string, number | null>>;
}

export interface HistoricalPlayerRanking {
  readonly components: Readonly<Record<string, number>>;
  readonly fantasyPoints: number;
  readonly fantasyPointsPerGame: number;
  readonly gamesPlayed: number;
  readonly playerId: string;
  readonly playerName: string;
  readonly rank: number;
  readonly seasonKey: string;
}

export interface HistoricalScoringPlan {
  readonly fingerprint: string;
  readonly name: string;
  readonly rankings: ReadonlyArray<HistoricalPlayerRanking>;
  readonly rules: ReadonlyArray<HistoricalScoringRule>;
  readonly seasons: ReadonlyArray<string>;
  readonly stackTripleDoubleBonuses: boolean;
  readonly summary: {
    readonly playerSeasonCount: number;
    readonly ruleCount: number;
    readonly seasonCount: number;
  };
  readonly version: number;
}

export type HistoricalScoringCommitBatch = Pick<
  HistoricalScoringPlan,
  'fingerprint' | 'name' | 'rankings' | 'rules' | 'seasons' | 'stackTripleDoubleBonuses' | 'version'
>;

export interface HistoricalScoringCommitResult {
  readonly ingestionRunId: string;
  readonly rankingCount: number;
  readonly ruleSetCount: number;
  readonly seasonCount: number;
}

export interface HistoricalScoringCommitter<Error> {
  readonly replaceHistoricalScoring: (
    batch: HistoricalScoringCommitBatch,
  ) => Effect.Effect<HistoricalScoringCommitResult, Error>;
}

export class HistoricalScoringValidationError extends Data.TaggedError(
  'HistoricalScoringValidationError',
)<{
  readonly message: string;
  readonly reason: string;
}> {}

type JsonObject = Record<string, unknown>;

const isObject = (value: unknown): value is JsonObject =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const requiredObject = (value: unknown, label: string): JsonObject => {
  if (!isObject(value)) throw new Error(`${label} must be an object`);
  return value;
};

const requiredString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
};

const finiteNumber = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
};

const nonNegativeStat = (
  stats: Readonly<Record<string, number | null>>,
  key: HistoricalScoringStatKey,
): number => {
  const value = stats[key];
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${key} must be a non-negative finite number`);
  }
  return value;
};

const round = (value: number): number => Math.round((value + Number.EPSILON) * 1_000) / 1_000;

const scoringRulesFrom = (
  rules: ReadonlyArray<HistoricalScoringRule>,
  stackTripleDoubleBonuses: boolean,
): ScoringRules => {
  const values = new Map(rules.map((rule) => [rule.statKey, rule.points]));
  const points = (key: HistoricalScoringStatKey): number => {
    const value = values.get(key);
    if (value === undefined) throw new Error(`scoring rule ${key} is missing`);
    return value;
  };
  return {
    assists: points('ast'),
    blocks: points('blk'),
    doubleDoubleBonus: points('double_double'),
    fieldGoalsMissed: points('fg_missed'),
    freeThrowsMissed: points('ft_missed'),
    points: points('pts'),
    rebounds: points('reb'),
    stackTripleDoubleBonuses,
    steals: points('stl'),
    threePointersMade: points('fg3m'),
    tripleDoubleBonus: points('triple_double'),
    turnovers: points('turnover'),
  };
};

const parseLeagueScoringConfigurationUnsafe = (configJson: string): LeagueScoringConfiguration => {
  const config = requiredObject(JSON.parse(configJson), 'scoring configuration');
  const name = requiredString(config['name'], 'name');
  const version = finiteNumber(config['version'], 'version');
  if (!Number.isSafeInteger(version) || version <= 0) {
    throw new Error('version must be a positive integer');
  }
  if (typeof config['stack_triple_double_bonuses'] !== 'boolean') {
    throw new Error('stack_triple_double_bonuses must be a boolean');
  }
  const stackTripleDoubleBonuses = config['stack_triple_double_bonuses'];
  if (!Array.isArray(config['applies_to_seasons']) || config['applies_to_seasons'].length === 0) {
    throw new Error('applies_to_seasons must be a non-empty array');
  }
  const seasons = config['applies_to_seasons'].map((season, index) =>
    requiredString(season, `applies_to_seasons[${index}]`),
  );
  if (new Set(seasons).size !== seasons.length) {
    throw new Error('applies_to_seasons contains duplicates');
  }
  seasons.sort();

  if (!Array.isArray(config['rules'])) throw new Error('rules must be an array');
  const rules = config['rules'].map((value, index): HistoricalScoringRule => {
    const rule = requiredObject(value, `rules[${index}]`);
    const statKey = requiredString(rule['stat_key'], `rules[${index}].stat_key`);
    if (!historicalScoringStatKeys.includes(statKey as HistoricalScoringStatKey)) {
      throw new Error(`rules[${index}].stat_key ${statKey} is not supported`);
    }
    return {
      label: requiredString(rule['label'], `rules[${index}].label`),
      points: finiteNumber(rule['points'], `rules[${index}].points`),
      statKey: statKey as HistoricalScoringStatKey,
    };
  });
  const ruleKeys = new Set(rules.map((rule) => rule.statKey));
  if (ruleKeys.size !== rules.length) throw new Error('rules contains duplicate stat keys');
  const missingRules = historicalScoringStatKeys.filter((key) => !ruleKeys.has(key));
  if (missingRules.length > 0) {
    throw new Error(`rules is missing: ${missingRules.join(', ')}`);
  }
  const normalizedRules = [...rules].sort((left, right) =>
    left.statKey.localeCompare(right.statKey),
  );

  return {
    name,
    rules: normalizedRules,
    scoringRules: scoringRulesFrom(normalizedRules, stackTripleDoubleBonuses),
    seasons,
    stackTripleDoubleBonuses,
    version,
  };
};

export const parseLeagueScoringConfiguration = (
  configJson: string,
): Effect.Effect<LeagueScoringConfiguration, HistoricalScoringValidationError> =>
  Effect.try({
    try: () => parseLeagueScoringConfigurationUnsafe(configJson),
    catch: (cause) =>
      new HistoricalScoringValidationError({
        message: 'League scoring validation failed',
        reason: cause instanceof Error ? cause.message : 'invalid scoring configuration',
      }),
  });

const seasonStatLine = (production: PlayerProductionSeason): SeasonStatLine => ({
  assists: nonNegativeStat(production.stats, 'ast'),
  blocks: nonNegativeStat(production.stats, 'blk'),
  doubleDoubles: nonNegativeStat(production.stats, 'double_double'),
  fieldGoalsMissed: nonNegativeStat(production.stats, 'fg_missed'),
  freeThrowsMissed: nonNegativeStat(production.stats, 'ft_missed'),
  gamesPlayed: production.gamesPlayed,
  points: nonNegativeStat(production.stats, 'pts'),
  rebounds: nonNegativeStat(production.stats, 'reb'),
  steals: nonNegativeStat(production.stats, 'stl'),
  threePointersMade: nonNegativeStat(production.stats, 'fg3m'),
  tripleDoubles: nonNegativeStat(production.stats, 'triple_double'),
  turnovers: nonNegativeStat(production.stats, 'turnover'),
});

export const loadHistoricalScoringSource = (
  projectRoot: string,
): Effect.Effect<string, HistoricalScoringValidationError> =>
  Effect.tryPromise({
    try: () => readFile(join(projectRoot, 'config/scoring.json'), 'utf8'),
    catch: () =>
      new HistoricalScoringValidationError({
        message: 'League scoring configuration is missing',
        reason: 'config/scoring.json could not be read',
      }),
  });

export const planHistoricalScoring = (
  configJson: string,
  production: ReadonlyArray<PlayerProductionSeason>,
): Effect.Effect<HistoricalScoringPlan, HistoricalScoringValidationError> =>
  Effect.try({
    try: () => {
      const { name, rules, scoringRules, seasons, stackTripleDoubleBonuses, version } =
        parseLeagueScoringConfigurationUnsafe(configJson);
      const rankings: HistoricalPlayerRanking[] = [];
      for (const seasonKey of seasons) {
        const seasonProduction = production.filter((record) => record.seasonKey === seasonKey);
        if (seasonProduction.length === 0) {
          throw new Error(`${seasonKey} has no player production`);
        }
        const scored = seasonProduction.map((record) => {
          if (!Number.isSafeInteger(record.gamesPlayed) || record.gamesPlayed <= 0) {
            throw new Error(`${record.playerName} ${seasonKey} has invalid games played`);
          }
          const breakdown = scoreSeason(seasonStatLine(record), scoringRules);
          return {
            components: Object.fromEntries(
              Object.entries(breakdown.components).map(([key, value]) => [key, round(value)]),
            ),
            fantasyPoints: round(breakdown.total),
            fantasyPointsPerGame: round(breakdown.pointsPerGame),
            gamesPlayed: record.gamesPlayed,
            playerId: record.playerId,
            playerName: record.playerName,
            seasonKey,
          };
        });
        scored.sort(
          (left, right) =>
            right.fantasyPoints - left.fantasyPoints ||
            right.fantasyPointsPerGame - left.fantasyPointsPerGame ||
            left.playerName.localeCompare(right.playerName),
        );
        rankings.push(...scored.map((record, index) => ({ ...record, rank: index + 1 })));
      }

      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            name,
            rankings,
            rules,
            seasons,
            stackTripleDoubleBonuses,
            version,
          }),
        )
        .digest('hex');

      return {
        fingerprint,
        name,
        rankings,
        rules,
        seasons,
        stackTripleDoubleBonuses,
        summary: {
          playerSeasonCount: rankings.length,
          ruleCount: rules.length,
          seasonCount: seasons.length,
        },
        version,
      };
    },
    catch: (cause) =>
      new HistoricalScoringValidationError({
        message: 'Historical scoring validation failed',
        reason: cause instanceof Error ? cause.message : 'invalid scoring configuration',
      }),
  });

export const commitHistoricalScoring = <Error>(
  plan: HistoricalScoringPlan,
  committer: HistoricalScoringCommitter<Error>,
) =>
  committer.replaceHistoricalScoring({
    fingerprint: plan.fingerprint,
    name: plan.name,
    rankings: plan.rankings,
    rules: plan.rules,
    seasons: plan.seasons,
    stackTripleDoubleBonuses: plan.stackTripleDoubleBonuses,
    version: plan.version,
  });
