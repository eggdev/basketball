import { attachDatabasePool } from '@vercel/functions';
import { betterAuth, type BetterAuthOptions } from 'better-auth';
import { PostgresDialect } from 'kysely';
import { Pool } from 'pg';

import { isAllowedOwnerEmail } from './auth';
import { resolveAuthBaseUrl, type AuthEnvironment } from './auth-environment';

const required = (environment: AuthEnvironment, variable: string): string => {
  const value = environment[variable];
  if (value === undefined || value.trim() === '') {
    throw new Error(`${variable} is required`);
  }
  return value;
};

const optionalPair = (
  environment: AuthEnvironment,
  first: string,
  second: string,
): readonly [string, string] | undefined => {
  const firstValue = environment[first]?.trim();
  const secondValue = environment[second]?.trim();

  if (firstValue === undefined && secondValue === undefined) return undefined;
  if (!firstValue || !secondValue) {
    throw new Error(`${first} and ${second} must be configured together`);
  }

  return [firstValue, secondValue];
};

const trustedOrigins = (environment: AuthEnvironment): string[] => {
  const origins = new Set<string>(['http://localhost:3000']);
  for (const variable of ['BETTER_AUTH_URL', 'VERCEL_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    const value = environment[variable]?.trim();
    if (!value) continue;
    origins.add(value.startsWith('http') ? value : `https://${value}`);
  }
  return [...origins];
};

const securePostgresConnectionString = (value: string): string => {
  const url = new URL(value);
  if (url.hostname.endsWith('.neon.tech') && url.searchParams.get('sslmode') === 'require') {
    url.searchParams.set('sslmode', 'verify-full');
  }
  return url.toString();
};

export const createAuthOptions = (
  environment: AuthEnvironment = process.env,
): BetterAuthOptions => {
  const pool = new Pool({
    connectionString: securePostgresConnectionString(required(environment, 'DATABASE_URL')),
    max: 5,
  });
  attachDatabasePool(pool);

  const githubCredentials = optionalPair(environment, 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET');

  return {
    appName: 'Fantasy Basketball',
    baseURL: resolveAuthBaseUrl(environment) satisfies BetterAuthOptions['baseURL'],
    database: {
      casing: 'snake',
      dialect: new PostgresDialect({ pool }),
      type: 'postgres',
      schemaName: 'auth',
    },
    secret: required(environment, 'BETTER_AUTH_SECRET'),
    trustedOrigins: trustedOrigins(environment),
    socialProviders:
      githubCredentials === undefined
        ? {}
        : {
            github: {
              clientId: githubCredentials[0],
              clientSecret: githubCredentials[1],
            },
          },
    databaseHooks: {
      user: {
        create: {
          before: async (user) =>
            isAllowedOwnerEmail(user.email, environment['AUTH_ALLOWED_EMAIL'])
              ? { data: user }
              : false,
        },
      },
    },
  };
};

export const createAuth = (environment: AuthEnvironment = process.env) =>
  betterAuth(createAuthOptions(environment));

export const auth = createAuth();

export interface AppSession {
  readonly sessionId: string;
  readonly user: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly image: string | null | undefined;
  };
}

export const getAppSession = async (headers: Headers): Promise<AppSession | null> => {
  const result = await auth.api.getSession({ headers });
  if (
    result === null ||
    !isAllowedOwnerEmail(result.user.email, process.env['AUTH_ALLOWED_EMAIL'])
  ) {
    return null;
  }

  return {
    sessionId: result.session.id,
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      image: result.user.image,
    },
  };
};
