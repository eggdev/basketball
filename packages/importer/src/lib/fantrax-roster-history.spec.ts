import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import {
  planFantraxRosterHistoryImport,
  readFantraxPlayerProfileName,
} from './fantrax-roster-history';

const leagueInfo = {
  leagueHistoryId: 'history-1',
  rosterPeriods: [
    {
      endDate: '2026-01-01T23:59:59.000Z',
      number: 1,
      startDate: '2026-01-01T00:00:00.000Z',
    },
    {
      endDate: '2026-01-02T23:59:59.000Z',
      number: 2,
      startDate: '2026-01-02T00:00:00.000Z',
    },
    {
      endDate: '2026-01-03T23:59:59.000Z',
      number: 3,
      startDate: '2026-01-03T00:00:00.000Z',
    },
  ],
  teamInfo: { away: { name: 'Away' }, home: { name: 'Home' } },
};

const playerCatalog = {
  one: { name: 'One, Player' },
  three: { name: 'Three, Player' },
  two: { name: 'Two, Player' },
};

const roster = (period: number, away: string[], home: string[]) => ({
  period,
  rosters: {
    away: {
      rosterItems: away.map((id) => ({ id, position: 'Flx', status: 'ACTIVE' })),
      teamName: 'Away',
    },
    home: {
      rosterItems: home.map((id) => ({ id, position: 'Flx', status: 'RESERVE' })),
      teamName: 'Home',
    },
  },
});

describe('Fantrax roster history import', () => {
  it('reads a retired player name from the public Fantrax profile response', () => {
    expect(
      readFantraxPlayerProfileName(
        { responses: [{ data: { miscData: { name: 'Terrence Ross' } } }] },
        '02nf8',
      ),
    ).toBe('Terrence Ross');
  });

  it('uses the first populated period as baseline and infers ownership changes', async () => {
    const plan = await Effect.runPromise(
      planFantraxRosterHistoryImport([
        {
          leagueId: 'league-1',
          leagueInfo,
          playerCatalog,
          rosterPayloads: [
            roster(1, [], []),
            roster(2, ['one', 'two'], []),
            roster(3, ['three'], ['two']),
          ],
          seasonKey: '2025-26',
        },
      ]),
    );

    expect(plan.seasons[0]?.baselineRosterPeriod).toBe(2);
    expect(plan.summary).toMatchObject({
      addCount: 1,
      changeCount: 3,
      dropCount: 1,
      snapshotCount: 3,
      teamChangeCount: 1,
    });
    expect(plan.changes).toEqual([
      expect.objectContaining({ changeType: 'drop', fantraxId: 'one', fromTeamId: 'away' }),
      expect.objectContaining({ changeType: 'add', fantraxId: 'three', toTeamId: 'away' }),
      expect.objectContaining({
        changeType: 'team-change',
        fantraxId: 'two',
        fromTeamId: 'away',
        toTeamId: 'home',
      }),
    ]);
  });

  it('rejects a player appearing on two teams in one period', async () => {
    const exit = await Effect.runPromiseExit(
      planFantraxRosterHistoryImport([
        {
          leagueId: 'league-1',
          leagueInfo,
          playerCatalog,
          rosterPayloads: [
            roster(1, ['one'], []),
            roster(2, ['one'], ['one']),
            roster(3, ['one'], []),
          ],
          seasonKey: '2025-26',
        },
      ]),
    );

    expect(exit._tag).toBe('Failure');
  });
});
