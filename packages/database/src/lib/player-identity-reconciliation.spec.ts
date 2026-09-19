import {
  makePlayerIdentityMergePreview,
  planPlayerIdentityMergeCommit,
  PLAYER_IDENTITY_MERGE_CONFLICT_TABLES,
  PLAYER_IDENTITY_MERGE_REFERENCE_TABLES,
  resolvePlayerIdentityMergePlayers,
} from './player-identity-reconciliation';

const source = {
  canonicalName: 'Source Player',
  normalizedName: 'source player',
  playerId: 'source-id',
};

const target = {
  canonicalName: 'Target Player',
  normalizedName: 'target player',
  playerId: 'target-id',
};

describe('player identity reconciliation preview', () => {
  it('has a stable fingerprint independent of object-key and query-row order', () => {
    const first = makePlayerIdentityMergePreview({
      conflicts: [
        { key: 'run-a', table: 'player_rankings' },
        { key: 'snapshot-a', table: 'player_projections' },
      ],
      referenceCounts: { player_projections: 2, player_rankings: 1 },
      source,
      target,
    });
    const reordered = makePlayerIdentityMergePreview({
      conflicts: [
        { key: 'snapshot-a', table: 'player_projections' },
        { key: 'run-a', table: 'player_rankings' },
      ],
      referenceCounts: { player_rankings: 1, player_projections: 2 },
      source,
      target,
    });

    expect(reordered).toEqual(first);
  });

  it('changes the fingerprint when references or conflicts change', () => {
    const preview = makePlayerIdentityMergePreview({
      conflicts: [],
      referenceCounts: { player_projections: 1 },
      source,
      target,
    });
    const changedReferences = makePlayerIdentityMergePreview({
      conflicts: [],
      referenceCounts: { player_projections: 2 },
      source,
      target,
    });
    const changedConflicts = makePlayerIdentityMergePreview({
      conflicts: [{ key: 'snapshot-a', table: 'player_projections' }],
      referenceCounts: { player_projections: 1 },
      source,
      target,
    });

    expect(changedReferences.fingerprint).not.toBe(preview.fingerprint);
    expect(changedConflicts.fingerprint).not.toBe(preview.fingerprint);
  });

  it('keeps the registry exhaustive and intentional', () => {
    expect(PLAYER_IDENTITY_MERGE_REFERENCE_TABLES).toEqual([
      'player_identities',
      'roster_period_entries',
      'inferred_roster_changes',
      'player_projections',
      'player_adp',
      'pre_draft_targets',
      'player_season_stats',
      'auction_results',
      'player_rankings',
    ]);
  });

  it('rejects same-player and missing-player merge inputs before planning rewrites', () => {
    expect(() =>
      resolvePlayerIdentityMergePlayers(
        {
          reason: 'duplicate import',
          resolvedByUserId: 'user-id',
          sourcePlayerId: 'source-id',
          targetPlayerId: 'source-id',
        },
        [source, target],
      ),
    ).toThrow('distinct players');
    expect(() =>
      resolvePlayerIdentityMergePlayers(
        {
          reason: 'duplicate import',
          resolvedByUserId: 'user-id',
          sourcePlayerId: 'missing-id',
          targetPlayerId: 'target-id',
        },
        [source, target],
      ),
    ).toThrow('must exist');
  });

  it('normalizes a representative composite-key collision deterministically', () => {
    const first = makePlayerIdentityMergePreview({
      conflicts: [{ key: 'league-season|4', table: 'inferred_roster_changes' }],
      referenceCounts: { inferred_roster_changes: 1 },
      source,
      target,
    });
    const second = makePlayerIdentityMergePreview({
      conflicts: [{ key: 'league-season|4', table: 'inferred_roster_changes' }],
      referenceCounts: { inferred_roster_changes: 1 },
      source,
      target,
    });

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.conflicts).toEqual([{ key: 'league-season|4', table: 'inferred_roster_changes' }]);
  });

  it('rejects a stale preview fingerprint', () => {
    const preview = makePlayerIdentityMergePreview({
      conflicts: [],
      referenceCounts: { player_projections: 1 },
      source,
      target,
    });

    expect(() => planPlayerIdentityMergeCommit(preview, 'stale-fingerprint')).toThrow('stale');
  });

  it.each(PLAYER_IDENTITY_MERGE_CONFLICT_TABLES)(
    'refuses a %s collision',
    (table) => {
      const preview = makePlayerIdentityMergePreview({
        conflicts: [{ key: 'logical-key', table }],
        referenceCounts: { [table]: 1 },
        source,
        target,
      });

      expect(() => planPlayerIdentityMergeCommit(preview, preview.fingerprint)).toThrow('conflicts');
    },
  );

  it('plans a no-conflict merge with every moved reference count', () => {
    const preview = makePlayerIdentityMergePreview({
      conflicts: [],
      referenceCounts: Object.fromEntries(
        PLAYER_IDENTITY_MERGE_REFERENCE_TABLES.map((table, index) => [table, index]),
      ),
      source,
      target,
    });

    expect(planPlayerIdentityMergeCommit(preview, preview.fingerprint)).toEqual({
      movedReferenceCounts: preview.referenceCounts,
    });
  });
});
