import { resolveAuthBaseUrl } from './auth-environment';

describe('auth base URL', () => {
  it('uses the explicitly configured canonical origin', () => {
    expect(
      resolveAuthBaseUrl({
        BETTER_AUTH_URL: ' https://basketball.example.com ',
        VERCEL_ENV: 'production',
      }),
    ).toBe('https://basketball.example.com');
  });

  it('refuses to fall back to localhost in production', () => {
    expect(() => resolveAuthBaseUrl({ VERCEL_ENV: 'production' })).toThrow(
      'BETTER_AUTH_URL is required in production',
    );
  });

  it('keeps the dynamic host policy for local and preview development', () => {
    expect(resolveAuthBaseUrl({ VERCEL_ENV: 'preview' })).toEqual({
      allowedHosts: ['localhost:3000', '*.vercel.app'],
      fallback: 'http://localhost:3000',
      protocol: 'auto',
    });
  });
});
