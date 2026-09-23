import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { Database, databaseLayer, loadDatabaseConfig } from '@fantasy-basketball/database';
import { Effect } from 'effect';
import {
  loadHistoricalScoringSource,
  parseLeagueScoringConfiguration,
} from '../src/lib/historical-scoring';
import { parseRotoworldSource, planRotoworldImport } from '../src/lib/rotoworld-projections';

const sourceUrl =
  'https://nbcsports.brightspotcdn.com/03/10/b09f526442aab7ad4db7ba3584ed/rotoworld-2024-25-fantasy-basketball-kit.pdf';
const run = async () => {
  const pdf = 'data/raw/rotoworld/2024-25.pdf';
  const directory = 'data/normalized/rotoworld';
  const sourceFile = `${directory}/2024-25-source.json`;
  await mkdir('data/raw/rotoworld', { recursive: true });
  await mkdir(directory, { recursive: true });
  try {
    await readFile(pdf);
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    const response = await fetch(sourceUrl);
    if (!response.ok) throw new Error(`PDF download failed: ${response.status}`);
    await writeFile(pdf, Buffer.from(await response.arrayBuffer()));
  }
  await promisify(execFile)('python3', ['-m', 'fantasy_basketball.rotoworld', pdf, sourceFile], {
    env: { ...process.env, PYTHONPATH: 'src' },
  });
  const source = parseRotoworldSource(JSON.parse(await readFile(sourceFile, 'utf8')));
  const config = await Effect.runPromise(loadDatabaseConfig());
  const report = await Effect.runPromise(
    Effect.gen(function* () {
      const db = yield* Database;
      const [canonicalPlayers, history, current] = yield* Effect.all(
        [db.canonicalPlayers, db.playerProductionHistory, db.latestProjectionSnapshot],
        { concurrency: 3 },
      );
      const scoringSource = yield* loadHistoricalScoringSource(process.cwd());
      const scoring = yield* parseLeagueScoringConfiguration(scoringSource);
      const plan = planRotoworldImport({
        source,
        canonicalPlayers,
        history,
        rules: scoring.scoringRules,
      });
      const committed = process.argv.includes('--commit')
        ? yield* db.saveProjectionSnapshot(plan.batch)
        : null;
      const identities = committed === null ? [] : yield* db.playerProviderIdentities('rotoworld');
      const attribution = plan.attribution.map((row) => ({
        ...row,
        playerId:
          identities.find((identity) => identity.externalId === row.sourceExternalId)?.playerId ??
          row.playerId,
      }));
      const after = committed === null ? current : yield* db.latestProjectionSnapshot;
      return {
        mode: committed === null ? 'validate' : 'commit',
        sourceUrl,
        sourceSha256: source.sha256,
        forecastAsOf: plan.batch.asOf,
        publicationVerified: false,
        fingerprint: plan.batch.fingerprint,
        summary: plan.summary,
        committed,
        attribution,
        records: plan.batch.records,
        limitations: plan.batch.limitations,
        activeProjectionBefore: current?.snapshotId ?? null,
        activeProjectionAfter: after?.snapshotId ?? null,
      };
    }).pipe(Effect.provide(databaseLayer(config))),
  );
  await writeFile(`${directory}/2024-25-linked.json`, JSON.stringify(report, null, 2) + '\n');
  const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  await writeFile(
    `${directory}/2024-25-linked.csv`,
    [
      'playerId,name,pdfPage,expectedGames,points,rebounds,assists,excludedFromScoring,issues',
      ...report.attribution.map((row) =>
        [
          row.playerId,
          row.canonicalName,
          row.row.page,
          row.row.values.games,
          row.row.values.points,
          row.row.values.rebounds,
          row.row.values.assists,
          row.excludedFromScoring,
          [...row.row.issues, ...row.errors].join('; '),
        ]
          .map(quote)
          .join(','),
      ),
    ].join('\n') + '\n',
  );
  console.log(
    JSON.stringify(
      {
        ...report,
        attribution: undefined,
        records: undefined,
        flagged: report.attribution
          .filter((row) => row.row.issues.length > 0)
          .map((row) => ({
            name: row.canonicalName,
            page: row.row.page,
            issues: row.row.issues,
            excludedFromScoring: row.excludedFromScoring,
          })),
        output: `${directory}/2024-25-linked.json`,
      },
      null,
      2,
    ),
  );
};
run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Rotoworld import failed');
  process.exitCode = 1;
});
