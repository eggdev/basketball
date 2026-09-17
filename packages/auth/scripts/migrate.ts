import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';

const connectionString = process.env['DATABASE_URL_UNPOOLED'];
if (connectionString === undefined || connectionString.trim() === '') {
  throw new Error('DATABASE_URL_UNPOOLED is required for auth migrations');
}

const connectionUrl = new URL(connectionString);
if (
  connectionUrl.hostname.endsWith('.neon.tech') &&
  connectionUrl.searchParams.get('sslmode') === 'require'
) {
  connectionUrl.searchParams.set('sslmode', 'verify-full');
}

const migrationsDirectory = fileURLToPath(new URL('../migrations/', import.meta.url));
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((file) => file.endsWith('.sql'))
  .sort();

const pool = new Pool({ connectionString: connectionUrl.toString(), max: 1 });
const client = await pool.connect();

try {
  await client.query('create schema if not exists "auth"');
  await client.query(`
    create table if not exists "auth"."_migrations" (
      "id" text primary key,
      "appliedAt" timestamptz default CURRENT_TIMESTAMP not null
    )
  `);

  for (const migration of migrationFiles) {
    await client.query('begin');
    try {
      await client.query(
        "select pg_advisory_xact_lock(hashtext('fantasy-basketball-auth-migrations'))",
      );
      const applied = await client.query<{ id: string }>(
        'select "id" from "auth"."_migrations" where "id" = $1',
        [migration],
      );
      if (applied.rowCount !== 0) {
        await client.query('commit');
        continue;
      }

      const sql = await readFile(`${migrationsDirectory}/${migration}`, 'utf8');
      await client.query(sql);
      await client.query('insert into "auth"."_migrations" ("id") values ($1)', [migration]);
      await client.query('commit');
      console.log(`Applied auth migration ${migration}`);
    } catch (cause) {
      await client.query('rollback');
      throw cause;
    }
  }
} finally {
  client.release();
  await pool.end();
}
