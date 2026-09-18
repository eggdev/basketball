import type { LeagueRosterActivityHistory } from '@fantasy-basketball/database/runtime';
import { describe, expect, it } from 'vitest';

import { buildRosterActivitySignals } from '../src/lib/roster-activity-signals';

const team = (
  managerName: string,
  acquisitions: number,
  madePlayoffs: boolean,
  postseasonResult: 'champion' | 'missed-playoffs' | 'runner-up',
  rank: number,
) => ({
  addCount: acquisitions,
  departureCount: acquisitions - 1,
  dropCount: acquisitions - 1,
  leagueMemberId: managerName,
  managerName,
  outcome: { madePlayoffs, postseasonResult, rank },
  teamName: `${managerName} Team`,
  teamSeasonId: `${managerName}-${rank}`,
  totalAcquisitionCount: acquisitions,
  transferInCount: 0,
  transferOutCount: 0,
});

describe('roster activity signals', () => {
  it('compares mutually exclusive outcome cohorts and aggregates managers', () => {
    const history = {
      seasons: [
        {
          baselineRosterPeriod: 1,
          changeCount: 0,
          changes: [],
          entryCount: 0,
          seasonKey: '2025-26',
          snapshotCount: 1,
          teams: [
            team('Champion', 100, true, 'champion', 1),
            team('Finalist', 80, true, 'runner-up', 2),
            team('Idle', 20, false, 'missed-playoffs', 10),
          ],
        },
        {
          baselineRosterPeriod: 1,
          changeCount: 0,
          changes: [],
          entryCount: 0,
          seasonKey: '2024-25',
          snapshotCount: 1,
          teams: [team('Champion', 60, false, 'missed-playoffs', 8)],
        },
      ],
      summary: {
        changeCount: 0,
        latestSeason: '2025-26',
        seasonCount: 2,
        snapshotCount: 2,
      },
    } satisfies LeagueRosterActivityHistory;

    const signals = buildRosterActivitySignals(history);

    expect(signals.cohorts).toEqual([
      expect.objectContaining({ averageAcquisitions: 100, key: 'champion', teamSeasonCount: 1 }),
      expect.objectContaining({
        averageAcquisitions: 80,
        key: 'other-playoff',
        teamSeasonCount: 1,
      }),
      expect.objectContaining({
        averageAcquisitions: 40,
        key: 'missed-playoffs',
        teamSeasonCount: 2,
      }),
    ]);
    expect(signals.managers.find((manager) => manager.managerName === 'Champion')).toMatchObject({
      averageAcquisitions: 80,
      championships: 1,
      playoffAppearances: 1,
      seasonCount: 2,
    });
  });
});
