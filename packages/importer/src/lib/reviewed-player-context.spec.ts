import { Effect, Exit } from 'effect';
import { describe, expect, it, vi } from 'vitest';

import {
  commitReviewedPlayerContextImport,
  planReviewedPlayerContextImport,
  type ReviewedPlayerContextCommitter,
} from './reviewed-player-context';

const canonicalPlayers = [
  {
    canonicalName: 'Player One',
    normalizedName: 'player one',
    playerId: 'player-1',
  },
  {
    canonicalName: 'Player Two',
    normalizedName: 'player two',
    playerId: 'player-2',
  },
];

describe('reviewed player context import', () => {
  it('parses sourced movement, injury, and role facts into one immutable plan', async () => {
    const plan = await Effect.runPromise(
      planReviewedPlayerContextImport({
        asOf: '2026-09-21',
        canonicalPlayers,
        csv: [
          'PLAYER,MOVEMENT_TYPE,FROM_TEAM,TO_TEAM,EFFECTIVE_DATE,MOVEMENT_SOURCE_URL,INJURY_STATUS,INJURY_SUMMARY,INJURY_SOURCE_URL,DEPTH_ROLE,OPPORTUNITY_DIRECTION,ROLE_NOTE,ROLE_SOURCE_URL',
          'Player One,trade,BOS,NYK,2026-07-06,https://example.com/trade,Healthy,Missed time after knee surgery,https://example.com/injury,starter,up,Primary creator role,https://example.com/depth',
        ].join('\n'),
        seasonKey: '2026-27',
      }),
    );

    expect(plan.summary).toEqual({
      injuryContextCount: 1,
      movementContextCount: 1,
      playerCount: 1,
      roleContextCount: 1,
      valid: true,
    });
    expect(plan.records[0]).toMatchObject({
      movement: { fromTeamAbbreviation: 'BOS', toTeamAbbreviation: 'NYK', type: 'trade' },
      playerId: 'player-1',
      role: { opportunityDirection: 'up' },
    });
    expect(plan.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps unsupported claims out by requiring a source URL', async () => {
    const plan = await Effect.runPromise(
      planReviewedPlayerContextImport({
        asOf: '2026-09-21',
        canonicalPlayers,
        csv: ['PLAYER,INJURY_SUMMARY', 'Player One,Torn ACL'].join('\n'),
        seasonKey: '2026-27',
      }),
    );

    expect(plan.summary.valid).toBe(false);
    expect(plan.issues[0]).toMatchObject({
      kind: 'invalid_context',
      reason: 'injury source URL is required',
    });
  });

  it('does not commit a plan with unresolved players', async () => {
    const plan = await Effect.runPromise(
      planReviewedPlayerContextImport({
        asOf: '2026-09-21',
        canonicalPlayers,
        csv: [
          'PLAYER,DEPTH_ROLE,ROLE_NOTE,ROLE_SOURCE_URL',
          'Missing Player,starter,Expected to start,https://example.com/depth',
        ].join('\n'),
        seasonKey: '2026-27',
      }),
    );
    const savePlayerContextSnapshot = vi.fn<
      ReviewedPlayerContextCommitter<never>['savePlayerContextSnapshot']
    >(() =>
      Effect.succeed({
        alreadySaved: false,
        ingestionRunId: 'run-1',
        playerCount: 0,
        snapshotId: 'snapshot-1',
      }),
    );
    const exit = await Effect.runPromiseExit(
      commitReviewedPlayerContextImport(plan, { savePlayerContextSnapshot }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(savePlayerContextSnapshot).not.toHaveBeenCalled();
  });
});
