export type AuthEnvironment = Readonly<Record<string, string | undefined>>;

export const resolveAuthBaseUrl = (environment: AuthEnvironment) => {
  const configured = environment['BETTER_AUTH_URL']?.trim();
  if (configured) return configured;

  if (environment['VERCEL_ENV'] === 'production') {
    throw new Error('BETTER_AUTH_URL is required in production');
  }

  return {
    allowedHosts: ['localhost:3000', '*.vercel.app'],
    fallback: 'http://localhost:3000',
    protocol: 'auto' as const,
  };
};
