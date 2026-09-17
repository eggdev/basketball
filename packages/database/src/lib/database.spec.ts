import { Effect, Exit, Redacted } from 'effect';

import { loadDatabaseConfig } from './database';

const pooledUrl =
  'postgresql://fantasy:secret@ep-example-pooler.us-east-1.aws.neon.tech/fantasy?sslmode=require';
const directUrl =
  'postgresql://fantasy:secret@ep-example.us-east-1.aws.neon.tech/fantasy?sslmode=require';

describe('loadDatabaseConfig', () => {
  it('keeps application and migration connections separate and redacted', async () => {
    const config = await Effect.runPromise(
      loadDatabaseConfig({
        DATABASE_URL: pooledUrl,
        DATABASE_URL_UNPOOLED: directUrl,
      }),
    );

    expect(Redacted.value(config.applicationUrl)).toBe(pooledUrl);
    expect(Redacted.value(config.migrationUrl)).toBe(directUrl);
    expect(JSON.stringify(config)).not.toContain('secret');
  });

  it.each(['DATABASE_URL', 'DATABASE_URL_UNPOOLED'] as const)(
    'fails safely when %s is missing',
    async (variable) => {
      const environment: Record<string, string | undefined> = {
        DATABASE_URL: pooledUrl,
        DATABASE_URL_UNPOOLED: directUrl,
      };
      delete environment[variable];

      const exit = await Effect.runPromiseExit(loadDatabaseConfig(environment));

      expect(Exit.isFailure(exit)).toBe(true);
      expect(String(exit)).toContain(variable);
      expect(String(exit)).not.toContain('secret');
    },
  );

  it('rejects a Neon pooler URL for migrations', async () => {
    const exit = await Effect.runPromiseExit(
      loadDatabaseConfig({
        DATABASE_URL: pooledUrl,
        DATABASE_URL_UNPOOLED: pooledUrl,
      }),
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(String(exit)).toContain('DATABASE_URL_UNPOOLED');
    expect(String(exit)).not.toContain('secret');
  });
});
