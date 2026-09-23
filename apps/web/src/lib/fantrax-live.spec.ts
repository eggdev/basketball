import { describe, expect, it } from 'vitest';
import { draftTeamState, liveDraftStorageKey, normalizeLiveDraft } from './fantrax-live';

const league = {
  leagueName: 'Test mock',
  seasonYear: 2026,
  draftType: 'auction',
  draftSettings: { budget: 200, minimumBid: 1, minimumBidIncrement: 1 },
  rosterInfo: { maxTotalPlayers: 13 },
  teamInfo: { mine: { id: 'mine', name: 'My team' }, other: { id: 'other', name: 'Other team' } },
  scoringSystem: {
    type: 'HEAD_TO_HEAD_ROTI_MULTI_WIN',
    scoringCategories: { PLAYER: { PTS: {}, 'FG%': {} } },
  },
};
const results = {
  draftDate: '2026-09-23T13:00:00.0-0400',
  draftState: 'running',
  draftType: 'auction',
  draftPicks: [] as unknown[],
};
const catalog = {
  p1: { name: 'Jokic, Nikola', position: 'C' },
  p2: { name: 'Guard, Test', position: 'PG' },
};
const normalize = (draftPicks: unknown[] = [], info = league) =>
  normalizeLiveDraft('aaaaaaaaaaaaaaaa', info, { ...results, draftPicks }, catalog);

describe('Fantrax live draft', () => {
  it('uses provider rules and preserves its state before the scheduled start', () => {
    const snapshot = normalize();
    expect(snapshot.draftAt).toBe('2026-09-23T17:00:00.000Z');
    expect(snapshot.providerState).toBe('running');
    expect(snapshot.categories).toEqual(['PTS', 'FG%']);
    expect(draftTeamState(snapshot, 'mine')).toMatchObject({
      remainingBudgetCents: 20000,
      remainingSpots: 13,
      maxBidCents: 18800,
    });
  });
  it('supports leagues with no draft date yet', () => {
    const snapshot = normalizeLiveDraft(
      'aaaaaaaaaaaaaaaa',
      league,
      { ...results, draftDate: undefined },
      catalog,
    );
    expect(snapshot.draftAt).toBeNull();
    expect(snapshot.teams).toHaveLength(2);
  });

  it('rebuilds state from a full snapshot without counting polls twice and supports corrections', () => {
    const first = normalize([
      { pick: 1, teamId: 'mine', playerId: 'p1', bid: 60, time: 1790182800000 },
    ]);
    expect(draftTeamState(first, 'mine')).toMatchObject({
      remainingBudgetCents: 14000,
      remainingSpots: 12,
      maxBidCents: 12900,
    });
    expect(draftTeamState(first, 'mine', 1).maxBidCents).toBe(18800);
    const corrected = normalize([{ pick: 1, teamId: 'other', playerId: 'p1', bid: 55 }]);
    expect(draftTeamState(corrected, 'mine').remainingBudgetCents).toBe(20000);
    expect(normalize().picks).toEqual([]);
  });
  it('accepts zero prices only as explicit recorded prices and skips unfilled slots', () => {
    const snapshot = normalize([
      { pick: 1, teamId: 'mine', playerId: 'p1', bid: 0 },
      { pick: 2, teamId: 'mine', playerId: null },
    ]);
    expect(snapshot.picks[0].playerName).toBe('Nikola Jokic');
    expect(snapshot.picks).toHaveLength(1);
    expect(() => normalize([{ pick: 1, teamId: 'mine', playerId: 'p1' }])).toThrow(
      'no auction price',
    );
  });
  it('rejects malformed data, duplicate purchases, and foreign teams instead of clearing the room', () => {
    expect(() => normalizeLiveDraft('aaaaaaaaaaaaaaaa', {}, {}, {})).toThrow(/Invalid input/);
    expect(() => normalize([{ pick: 1, teamId: 'foreign', playerId: 'p1', bid: 1 }])).toThrow(
      'unknown team',
    );
    expect(() =>
      normalize([
        { pick: 1, teamId: 'mine', playerId: 'p1', bid: 1 },
        { pick: 2, teamId: 'other', playerId: 'p1', bid: 2 },
      ]),
    ).toThrow('duplicate');
  });
  it('keeps user, league, and team storage separate', () => {
    const keys = [
      liveDraftStorageKey('a', 'l1', 't1'),
      liveDraftStorageKey('b', 'l1', 't1'),
      liveDraftStorageKey('a', 'l2', 't1'),
      liveDraftStorageKey('a', 'l1', 't2'),
    ];
    expect(new Set(keys).size).toBe(4);
  });
});
