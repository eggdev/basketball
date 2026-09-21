import { describe, expect, it } from 'vitest';
import { resolveSeasonExperience } from './season-experience';
import { durabilityTone, projectionTier, roleTone } from './player-signals';

describe('season experience', () => {
  it('switches after the confirmed Finals end, in the league timezone', () => {
    expect(resolveSeasonExperience(new Date('2026-06-14T03:59:59Z')).mode).toBe('season');
    expect(resolveSeasonExperience(new Date('2026-06-14T04:00:00Z'))).toMatchObject({
      mode: 'preparation',
      seasonKey: '2026-27',
      calendarConfirmed: true,
    });
  });
  it('stays in preparation until opening day and handles the calendar year rollover', () => {
    expect(resolveSeasonExperience(new Date('2026-10-20T03:59:59Z')).mode).toBe('preparation');
    expect(resolveSeasonExperience(new Date('2026-10-20T04:00:00Z')).mode).toBe('season');
    expect(resolveSeasonExperience(new Date('2027-01-10T12:00:00Z'))).toMatchObject({
      mode: 'season',
      seasonKey: '2026-27',
    });
  });
  it('does not treat stale or missing dates as confirmed active league data', () => {
    expect(resolveSeasonExperience(new Date('2028-07-01T12:00:00Z'))).toMatchObject({
      mode: 'preparation',
      seasonKey: '2028-29',
      calendarConfirmed: false,
    });
    expect(resolveSeasonExperience(new Date('2026-09-01T12:00:00Z'), [])).toMatchObject({
      mode: 'preparation',
      calendarConfirmed: false,
    });
  });
});
describe('player signals', () => {
  it('keeps rank bands stable at their boundaries and rejects unknown ranks', () => {
    expect([1, 12, 13, 36, 37, 72, 73, 120, 121].map((rank) => projectionTier(rank).label)).toEqual(
      ['S', 'S', 'A', 'A', 'B', 'B', 'C', 'C', 'D'],
    );
    for (const rank of [undefined, null, 0, -1, 1.5, NaN])
      expect(projectionTier(rank).label).toBe('?');
  });
  it('keeps unknowns neutral and distinguishes risk from upside', () => {
    expect(durabilityTone('fragile')).toBe('negative');
    expect(durabilityTone('managed')).toBe('caution');
    expect(durabilityTone('durable')).toBe('positive');
    expect(durabilityTone()).toBe('neutral');
    expect(roleTone('down')).toBe('negative');
    expect(roleTone('uncertain')).toBe('caution');
    expect(roleTone()).toBe('neutral');
  });
});
