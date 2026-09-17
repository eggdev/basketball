import { defineConfig } from 'drizzle-kit';

const migrationUrl = process.env['DATABASE_URL_UNPOOLED'];

if (migrationUrl === undefined || migrationUrl.trim() === '') {
  throw new Error('DATABASE_URL_UNPOOLED is required for schema operations');
}

const connectionUrl = new URL(migrationUrl);
if (
  connectionUrl.hostname.endsWith('.neon.tech') &&
  connectionUrl.searchParams.get('sslmode') === 'require'
) {
  connectionUrl.searchParams.set('sslmode', 'verify-full');
}

export default defineConfig({
  dialect: 'postgresql',
  dbCredentials: { url: connectionUrl.toString() },
  out: './packages/database/migrations',
  schema: './packages/database/src/lib/schema.ts',
  schemaFilter: ['fantasy'],
  strict: true,
  verbose: true,
});
