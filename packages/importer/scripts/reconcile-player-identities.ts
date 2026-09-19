import {
  Database,
  databaseLayer,
  type DatabaseConfig,
  loadDatabaseConfig,
  type PlayerIdentityMergeInput,
} from '@fantasy-basketball/database';
import { Effect } from 'effect';

const usage = [
  'Usage: bun nx run importer:player-reconcile -- --source <player-id> --target <player-id> --reason <reason> --resolved-by <user-id> [--commit]',
  '',
  'Without --commit, this command only previews the merge. Name similarity is evidence for human review, never merge authorization.',
].join('\n');

const option = (name: string): string | null => {
  const equalsValue = process.argv.find((value) => value.startsWith(`--${name}=`));
  if (equalsValue !== undefined) return equalsValue.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
};

const readInput = (): PlayerIdentityMergeInput | null => {
  const sourcePlayerId = option('source');
  const targetPlayerId = option('target');
  const reason = option('reason');
  const resolvedByUserId = option('resolved-by');
  if (
    sourcePlayerId === null ||
    targetPlayerId === null ||
    reason === null ||
    resolvedByUserId === null ||
    sourcePlayerId.trim() === '' ||
    targetPlayerId.trim() === '' ||
    reason.trim() === '' ||
    resolvedByUserId.trim() === ''
  ) {
    return null;
  }
  return { reason, resolvedByUserId, sourcePlayerId, targetPlayerId };
};

const runWithDatabase = <Value, Error>(
  config: DatabaseConfig,
  effect: Effect.Effect<Value, Error, Database>,
) => Effect.runPromise(effect.pipe(Effect.provide(databaseLayer(config))));

const run = async () => {
  const input = readInput();
  if (input === null) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  const databaseConfig = await Effect.runPromise(loadDatabaseConfig());
  const preview = await runWithDatabase(
    databaseConfig,
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.previewPlayerIdentityMerge(input);
    }),
  );
  const shouldCommit = process.argv.includes('--commit');
  if (!shouldCommit) {
    console.log(JSON.stringify({ mode: 'preview', ...preview }, null, 2));
    return;
  }

  const refreshedPreview = await runWithDatabase(
    databaseConfig,
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.previewPlayerIdentityMerge(input);
    }),
  );
  const result = await runWithDatabase(
    databaseConfig,
    Effect.gen(function* () {
      const database = yield* Database;
      return yield* database.mergePlayerIdentities(input, refreshedPreview.fingerprint);
    }),
  );
  console.log(JSON.stringify({ mode: 'commit', preview: refreshedPreview, result }, null, 2));
};

run().catch((cause: unknown) => {
  console.error(cause instanceof Error ? cause.message : 'Player identity reconciliation failed');
  process.exitCode = 1;
});
