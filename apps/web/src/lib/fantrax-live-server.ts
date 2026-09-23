import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import {
  catalogSchema,
  fantraxLeagueId,
  fantraxLeagueSchema,
  normalizeLiveDraft,
  type LiveDraftSnapshot,
  type SavedLiveLeague,
} from './fantrax-live';

const userAgent = 'Mozilla/5.0 (compatible; FantasyBasketball/1.0)';
const cached = new Map<string, { expires: number; value: unknown }>();
const pending = new Map<string, Promise<LiveDraftSnapshot>>();
const recorded = new Map<string, string>();

async function fetchFantrax(
  endpoint: 'getLeagueInfo' | 'getDraftResults' | 'getPlayerIds',
  leagueId?: string,
): Promise<unknown> {
  const key = `${endpoint}:${leagueId ?? 'NBA'}`;
  const entry = cached.get(key);
  if (entry && entry.expires > Date.now()) return entry.value;
  const url = new URL(`https://www.fantrax.com/fxea/general/${endpoint}`);
  if (leagueId) url.searchParams.set('leagueId', fantraxLeagueId.parse(leagueId));
  if (endpoint === 'getLeagueInfo') url.searchParams.set('excludePlayerInfo', 'true');
  if (endpoint === 'getPlayerIds') url.searchParams.set('sport', 'NBA');
  const response = await fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': userAgent },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Fantrax ${endpoint} returned HTTP ${response.status}.`);
  const value: unknown = await response.json();
  if (endpoint !== 'getDraftResults') {
    if (cached.size > 50) cached.clear();
    cached.set(key, {
      expires: Date.now() + (endpoint === 'getPlayerIds' ? 3_600_000 : 60_000),
      value,
    });
  }
  return value;
}

export async function loadFantraxCatalog() {
  return catalogSchema.parse(await fetchFantrax('getPlayerIds'));
}

export async function loadFantraxLeague(leagueId: string) {
  return fantraxLeagueSchema.parse(await fetchFantrax('getLeagueInfo', leagueId));
}

function workspaceRoot() {
  return existsSync(path.join(process.cwd(), 'nx.json'))
    ? process.cwd()
    : path.resolve(process.cwd(), '../..');
}

export async function loadLocalLiveLeagues(): Promise<SavedLiveLeague[]> {
  if (process.env.NODE_ENV !== 'development') return [];
  const file = path.join(workspaceRoot(), 'config/live-leagues.json');
  try {
    const value: unknown = JSON.parse(await readFile(file, 'utf8'));
    return z
      .array(z.object({ id: fantraxLeagueId, name: z.string(), teamId: z.string() }))
      .parse(value);
  } catch {
    return [];
  }
}

function capturePath(leagueId: string) {
  fantraxLeagueId.parse(leagueId);
  const root = workspaceRoot();
  return path.join(root, 'data/reports/live-drafts', leagueId, 'events.jsonl');
}

export async function readDraftCapture(leagueId: string): Promise<string | null> {
  if (process.env.NODE_ENV !== 'development') return null;
  return readFile(capturePath(leagueId), 'utf8').catch(() => null);
}

export async function recordLiveDraftEvent(leagueId: string, event: unknown): Promise<boolean> {
  if (process.env.NODE_ENV !== 'development') return false;
  try {
    const file = capturePath(leagueId);
    await mkdir(path.dirname(file), { recursive: true });
    await appendFile(file, JSON.stringify(event) + '\n');
    return true;
  } catch {
    return false;
  }
}

export async function loadFantraxLive(leagueId: string): Promise<LiveDraftSnapshot> {
  fantraxLeagueId.parse(leagueId);
  const existing = pending.get(leagueId);
  if (existing) return existing;
  const task = (async () => {
    const [league, results, catalog] = await Promise.all([
      fetchFantrax('getLeagueInfo', leagueId),
      fetchFantrax('getDraftResults', leagueId),
      loadFantraxCatalog(),
    ]);
    const snapshot = normalizeLiveDraft(leagueId, league, results, catalog);
    if (process.env.NODE_ENV === 'development') {
      try {
        const { fetchedAt: _time, recording: _recording, ...state } = snapshot;
        const fingerprint = createHash('sha256').update(JSON.stringify(state)).digest('hex');
        if (recorded.get(leagueId) !== fingerprint) {
          const file = capturePath(leagueId);
          await mkdir(path.dirname(file), { recursive: true });
          await appendFile(
            file,
            JSON.stringify({
              capturedAt: snapshot.fetchedAt,
              fingerprint,
              snapshot,
              source: { league, results },
            }) + '\n',
          );
          recorded.set(leagueId, fingerprint);
        }
        snapshot.recording = 'saved';
      } catch {
        snapshot.recording = 'unavailable';
        snapshot.warnings.push(
          'The local capture could not be saved. Download a snapshot before closing this room.',
        );
      }
    }
    return snapshot;
  })();
  pending.set(leagueId, task);
  try {
    return await task;
  } finally {
    pending.delete(leagueId);
  }
}
