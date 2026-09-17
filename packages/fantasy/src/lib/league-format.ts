import { createHash } from 'node:crypto';

import { Data, Effect } from 'effect';

export const basketballPositions = ['PG', 'SG', 'SF', 'PF', 'C'] as const;
export type BasketballPosition = (typeof basketballPositions)[number];

export const lineupSlotCodes = ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C', 'FLX'] as const;
export type LineupSlotCode = (typeof lineupSlotCodes)[number];

export interface LeagueLineupSlot {
  readonly code: LineupSlotCode;
  readonly eligiblePositions: ReadonlyArray<BasketballPosition>;
  readonly label: string;
  readonly maxActive: number;
  readonly minActive: number;
}

export interface InjuryReserveRules {
  readonly allowByeWeekPlayers: boolean;
  readonly allowSuspendedPlayers: boolean;
  readonly countsTowardRosterLimit: boolean;
  readonly enforcementType: 'none';
  readonly maximumPlayers: number;
}

export interface RosterRestrictions {
  readonly injuryReserve: InjuryReserveRules;
  readonly maximumActivePlayers: number;
  readonly maximumMinorLeaguePlayers: number;
  readonly maximumReservePlayers: number;
  readonly maximumTotalPlayers: number;
  readonly minimumActivePlayers: number;
  readonly minimumTotalPlayers: number;
  readonly transactionRosterEnforcement: 'always';
}

export interface LeagueFormat {
  readonly appliesToSeasons: ReadonlyArray<string>;
  readonly lineupSlots: ReadonlyArray<LeagueLineupSlot>;
  readonly name: string;
  readonly rosterRestrictions: RosterRestrictions;
  readonly rosterSize: number;
  readonly teamCount: number;
  readonly version: number;
}

export interface LeagueStructure extends LeagueFormat {
  readonly activeRosterSize: number;
  readonly benchRosterSize: number;
  readonly fingerprint: string;
  readonly leagueActiveSlots: number;
  readonly leagueInjuryReserveSlots: number;
  readonly leagueMaxPlayerHoldings: number;
  readonly leagueRosterSpots: number;
  readonly maxTeamPlayerHoldings: number;
}

export class LeagueFormatValidationError extends Data.TaggedError('LeagueFormatValidationError')<{
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

const requiredBoolean = (value: unknown, label: string): boolean => {
  if (typeof value !== 'boolean') throw new Error(`${label} must be a boolean`);
  return value;
};

const nonNegativeInteger = (value: unknown, label: string): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return value;
};

const positiveInteger = (value: unknown, label: string): number => {
  const parsed = nonNegativeInteger(value, label);
  if (parsed === 0) throw new Error(`${label} must be greater than zero`);
  return parsed;
};

const oneOf = <Value extends string>(
  value: unknown,
  supported: ReadonlyArray<Value>,
  label: string,
): Value => {
  const parsed = requiredString(value, label);
  if (!supported.includes(parsed as Value)) {
    throw new Error(`${label} ${parsed} is not supported`);
  }
  return parsed as Value;
};

export const evaluateLeagueFormat = (
  configJson: string,
): Effect.Effect<LeagueStructure, LeagueFormatValidationError> =>
  Effect.try({
    try: () => {
      const config = requiredObject(JSON.parse(configJson), 'league format');
      const name = requiredString(config['name'], 'name');
      const version = positiveInteger(config['version'], 'version');
      const teamCount = positiveInteger(config['team_count'], 'team_count');

      const roster = requiredObject(config['roster_restrictions'], 'roster_restrictions');
      const injuryReserve = requiredObject(
        roster['injury_reserve'],
        'roster_restrictions.injury_reserve',
      );
      const rosterRestrictions = {
        injuryReserve: {
          allowByeWeekPlayers: requiredBoolean(
            injuryReserve['allow_bye_week_players'],
            'roster_restrictions.injury_reserve.allow_bye_week_players',
          ),
          allowSuspendedPlayers: requiredBoolean(
            injuryReserve['allow_suspended_players'],
            'roster_restrictions.injury_reserve.allow_suspended_players',
          ),
          countsTowardRosterLimit: requiredBoolean(
            injuryReserve['counts_toward_roster_limit'],
            'roster_restrictions.injury_reserve.counts_toward_roster_limit',
          ),
          enforcementType: oneOf(
            injuryReserve['enforcement_type'],
            ['none'] as const,
            'roster_restrictions.injury_reserve.enforcement_type',
          ),
          maximumPlayers: nonNegativeInteger(
            injuryReserve['maximum_players'],
            'roster_restrictions.injury_reserve.maximum_players',
          ),
        },
        maximumActivePlayers: positiveInteger(
          roster['maximum_active_players'],
          'roster_restrictions.maximum_active_players',
        ),
        maximumMinorLeaguePlayers: nonNegativeInteger(
          roster['maximum_minor_league_players'],
          'roster_restrictions.maximum_minor_league_players',
        ),
        maximumReservePlayers: nonNegativeInteger(
          roster['maximum_reserve_players'],
          'roster_restrictions.maximum_reserve_players',
        ),
        maximumTotalPlayers: positiveInteger(
          roster['maximum_total_players'],
          'roster_restrictions.maximum_total_players',
        ),
        minimumActivePlayers: nonNegativeInteger(
          roster['minimum_active_players'],
          'roster_restrictions.minimum_active_players',
        ),
        minimumTotalPlayers: nonNegativeInteger(
          roster['minimum_total_players'],
          'roster_restrictions.minimum_total_players',
        ),
        transactionRosterEnforcement: oneOf(
          roster['transaction_roster_enforcement'],
          ['always'] as const,
          'roster_restrictions.transaction_roster_enforcement',
        ),
      } satisfies RosterRestrictions;
      const rosterSize = rosterRestrictions.maximumTotalPlayers;

      if (
        !Array.isArray(config['applies_to_seasons']) ||
        config['applies_to_seasons'].length === 0
      ) {
        throw new Error('applies_to_seasons must be a non-empty array');
      }
      const appliesToSeasons = config['applies_to_seasons'].map((season, index) =>
        requiredString(season, `applies_to_seasons[${index}]`),
      );
      if (new Set(appliesToSeasons).size !== appliesToSeasons.length) {
        throw new Error('applies_to_seasons contains duplicates');
      }
      appliesToSeasons.sort();

      if (!Array.isArray(config['lineup_slots']) || config['lineup_slots'].length === 0) {
        throw new Error('lineup_slots must be a non-empty array');
      }
      const lineupSlots = config['lineup_slots'].map((value, index): LeagueLineupSlot => {
        const slot = requiredObject(value, `lineup_slots[${index}]`);
        const code = oneOf(slot['code'], lineupSlotCodes, `lineup_slots[${index}].code`);
        const minActive = nonNegativeInteger(
          slot['min_active'],
          `lineup_slots[${index}].min_active`,
        );
        const maxActive = positiveInteger(slot['max_active'], `lineup_slots[${index}].max_active`);
        if (minActive > maxActive) {
          throw new Error(`lineup_slots[${index}].min_active cannot exceed max_active`);
        }
        if (!Array.isArray(slot['eligible_positions']) || slot['eligible_positions'].length === 0) {
          throw new Error(`lineup_slots[${index}].eligible_positions must be a non-empty array`);
        }
        const eligiblePositions = slot['eligible_positions'].map((position, positionIndex) =>
          oneOf(
            position,
            basketballPositions,
            `lineup_slots[${index}].eligible_positions[${positionIndex}]`,
          ),
        );
        if (new Set(eligiblePositions).size !== eligiblePositions.length) {
          throw new Error(`lineup_slots[${index}].eligible_positions contains duplicates`);
        }
        return {
          code,
          eligiblePositions,
          label: requiredString(slot['label'], `lineup_slots[${index}].label`),
          maxActive,
          minActive,
        };
      });
      if (new Set(lineupSlots.map((slot) => slot.code)).size !== lineupSlots.length) {
        throw new Error('lineup_slots contains duplicate codes');
      }

      const activeRosterSize = lineupSlots.reduce((total, slot) => total + slot.maxActive, 0);
      const minimumActiveRosterSize = lineupSlots.reduce(
        (total, slot) => total + slot.minActive,
        0,
      );
      if (activeRosterSize !== rosterRestrictions.maximumActivePlayers) {
        throw new Error('lineup maximums must equal maximum_active_players');
      }
      if (minimumActiveRosterSize !== rosterRestrictions.minimumActivePlayers) {
        throw new Error('lineup minimums must equal minimum_active_players');
      }
      if (activeRosterSize > rosterSize) {
        throw new Error('maximum active lineup cannot exceed maximum_total_players');
      }
      if (rosterRestrictions.minimumTotalPlayers > rosterSize) {
        throw new Error('minimum_total_players cannot exceed maximum_total_players');
      }
      if (rosterSize - activeRosterSize !== rosterRestrictions.maximumReservePlayers) {
        throw new Error(
          'maximum_reserve_players must equal maximum total players minus maximum active players',
        );
      }
      const supportedPositions = new Set(
        lineupSlots.flatMap((slot) => [...slot.eligiblePositions]),
      );
      const unavailablePositions = basketballPositions.filter(
        (position) => !supportedPositions.has(position),
      );
      if (unavailablePositions.length > 0) {
        throw new Error(`lineup_slots cannot accept: ${unavailablePositions.join(', ')}`);
      }

      const format = {
        appliesToSeasons,
        lineupSlots,
        name,
        rosterRestrictions,
        rosterSize,
        teamCount,
        version,
      } satisfies LeagueFormat;
      const fingerprint = createHash('sha256')
        .update(
          JSON.stringify({
            ...format,
            lineupSlots: [...lineupSlots].sort((left, right) =>
              left.code.localeCompare(right.code),
            ),
          }),
        )
        .digest('hex');

      return {
        ...format,
        activeRosterSize,
        benchRosterSize: rosterSize - activeRosterSize,
        fingerprint,
        leagueActiveSlots: activeRosterSize * teamCount,
        leagueInjuryReserveSlots: rosterRestrictions.injuryReserve.maximumPlayers * teamCount,
        leagueMaxPlayerHoldings:
          (rosterSize +
            (rosterRestrictions.injuryReserve.countsTowardRosterLimit
              ? 0
              : rosterRestrictions.injuryReserve.maximumPlayers)) *
          teamCount,
        leagueRosterSpots: rosterSize * teamCount,
        maxTeamPlayerHoldings:
          rosterSize +
          (rosterRestrictions.injuryReserve.countsTowardRosterLimit
            ? 0
            : rosterRestrictions.injuryReserve.maximumPlayers),
      };
    },
    catch: (cause) =>
      new LeagueFormatValidationError({
        message: 'League format validation failed',
        reason: cause instanceof Error ? cause.message : 'invalid league format',
      }),
  });
