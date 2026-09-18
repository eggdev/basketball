import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';

import { planFantraxAdpImport } from './fantrax-adp';

describe('planFantraxAdpImport', () => {
  it('canonicalizes Fantrax names and preserves known identities', async () => {
    const plan = await Effect.runPromise(
      planFantraxAdpImport({
        canonicalIdentities: [
          {
            canonicalName: 'Nikola Jokic',
            fantraxId: '03e75',
            normalizedName: 'nikola jokic',
            playerId: 'player-1',
          },
        ],
        capturedAt: '2026-09-18T12:00:00.000Z',
        response: [
          { ADP: 18.4, id: 'rookie', name: 'Oubre Jr., Kelly', pos: 'SF' },
          { ADP: 1.52, id: '03e75', name: 'Jokic, Nikola', pos: 'C' },
        ],
        seasonKey: '2026-27',
      }),
    );

    expect(plan.records.map((record) => record.canonicalName)).toEqual([
      'Nikola Jokic',
      'Kelly Oubre Jr.',
    ]);
    expect(plan.records[0]?.existingPlayerId).toBe('player-1');
    expect(plan.summary).toEqual({
      existingPlayerCount: 1,
      newPlayerCount: 1,
      playerCount: 2,
    });
  });

  it('rejects duplicate Fantrax identities', async () => {
    const result = await Effect.runPromise(
      Effect.either(
        planFantraxAdpImport({
          canonicalIdentities: [],
          capturedAt: '2026-09-18',
          response: [
            { ADP: 1, id: 'same', name: 'Jokic, Nikola', pos: 'C' },
            { ADP: 2, id: 'same', name: 'Doncic, Luka', pos: 'PG' },
          ],
          seasonKey: '2026-27',
        }),
      ),
    );

    expect(result._tag).toBe('Left');
  });
});
