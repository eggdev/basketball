import { isAllowedOwnerEmail, parseAllowedOwnerEmails } from './auth';

describe('owner access policy', () => {
  it('normalizes a comma-separated allowlist', () => {
    expect(parseAllowedOwnerEmails(' Owner@Example.com,second@example.com ')).toEqual(
      new Set(['owner@example.com', 'second@example.com']),
    );
  });

  it('matches email addresses case-insensitively', () => {
    expect(isAllowedOwnerEmail('OWNER@example.com', 'owner@example.com')).toBe(true);
  });

  it('fails closed when no owner is configured', () => {
    expect(isAllowedOwnerEmail('owner@example.com', undefined)).toBe(false);
  });
});
