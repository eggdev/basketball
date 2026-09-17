import { Effect, Exit } from 'effect';
import { describe, expect, it } from 'vitest';

import { evaluateLeagueFormat } from './league-format';

const format = {
  name: 'League Format',
  version: 1,
  applies_to_seasons: ['2025-26'],
  team_count: 12,
  lineup_change_frequency: 'daily',
  roster_restrictions: {
    minimum_total_players: 0,
    maximum_total_players: 13,
    minimum_active_players: 0,
    maximum_active_players: 10,
    maximum_reserve_players: 3,
    maximum_minor_league_players: 0,
    transaction_roster_enforcement: 'always',
    injury_reserve: {
      maximum_players: 1,
      counts_toward_roster_limit: false,
      enforcement_type: 'none',
      allow_suspended_players: true,
      allow_bye_week_players: false,
    },
  },
  lineup_slots: [
    { code: 'PG', label: 'Point Guard', min_active: 0, max_active: 1, eligible_positions: ['PG'] },
    {
      code: 'SG',
      label: 'Shooting Guard',
      min_active: 0,
      max_active: 1,
      eligible_positions: ['SG'],
    },
    {
      code: 'G',
      label: 'Guard',
      min_active: 0,
      max_active: 1,
      eligible_positions: ['PG', 'SG'],
    },
    {
      code: 'SF',
      label: 'Small Forward',
      min_active: 0,
      max_active: 1,
      eligible_positions: ['SF'],
    },
    {
      code: 'PF',
      label: 'Power Forward',
      min_active: 0,
      max_active: 1,
      eligible_positions: ['PF'],
    },
    {
      code: 'F',
      label: 'Forward',
      min_active: 0,
      max_active: 1,
      eligible_positions: ['SF', 'PF'],
    },
    { code: 'C', label: 'Center', min_active: 0, max_active: 1, eligible_positions: ['C'] },
    {
      code: 'FLX',
      label: 'Flex',
      min_active: 0,
      max_active: 3,
      eligible_positions: ['PG', 'SG', 'SF', 'PF', 'C'],
    },
  ],
};

describe('evaluateLeagueFormat', () => {
  it('derives the active, bench, and league-wide roster shape', async () => {
    const result = await Effect.runPromise(evaluateLeagueFormat(JSON.stringify(format)));

    expect(result).toMatchObject({
      activeRosterSize: 10,
      benchRosterSize: 3,
      leagueActiveSlots: 120,
      leagueInjuryReserveSlots: 12,
      leagueMaxPlayerHoldings: 168,
      leagueRosterSpots: 156,
      lineupChangeFrequency: 'daily',
      maxTeamPlayerHoldings: 14,
      rosterRestrictions: {
        maximumMinorLeaguePlayers: 0,
        maximumReservePlayers: 3,
        maximumTotalPlayers: 13,
        transactionRosterEnforcement: 'always',
        injuryReserve: {
          allowByeWeekPlayers: false,
          allowSuspendedPlayers: true,
          countsTowardRosterLimit: false,
          enforcementType: 'none',
          maximumPlayers: 1,
        },
      },
      rosterSize: 13,
      teamCount: 12,
    });
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.lineupSlots.map((slot) => slot.code)).toEqual([
      'PG',
      'SG',
      'G',
      'SF',
      'PF',
      'F',
      'C',
      'FLX',
    ]);
    expect(result.lineupSlots.find((slot) => slot.code === 'G')?.eligiblePositions).toEqual([
      'PG',
      'SG',
    ]);
    expect(result.lineupSlots.find((slot) => slot.code === 'FLX')?.maxActive).toBe(3);
  });

  it('rejects a maximum active lineup larger than the roster', async () => {
    const invalid = {
      ...format,
      roster_restrictions: {
        ...format.roster_restrictions,
        maximum_total_players: 9,
        maximum_reserve_players: 0,
      },
    };

    const exit = await Effect.runPromiseExit(evaluateLeagueFormat(JSON.stringify(invalid)));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain('maximum active lineup cannot exceed maximum_total_players');
  });

  it('rejects duplicate slot codes', async () => {
    const invalid = {
      ...format,
      lineup_slots: [...format.lineup_slots, format.lineup_slots[0]],
    };

    const exit = await Effect.runPromiseExit(evaluateLeagueFormat(JSON.stringify(invalid)));

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain('duplicate codes');
  });
});
