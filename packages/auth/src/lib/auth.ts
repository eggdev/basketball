export const parseAllowedOwnerEmails = (value: string | undefined): ReadonlySet<string> =>
  new Set(
    (value ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter((email) => email.length > 0),
  );

export const isAllowedOwnerEmail = (email: string, configuredEmails: string | undefined): boolean =>
  parseAllowedOwnerEmails(configuredEmails).has(email.trim().toLowerCase());
