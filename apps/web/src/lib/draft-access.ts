import { loadViewer } from './viewer';

export interface DraftActor {
  readonly id: string;
  readonly local: boolean;
}

export async function getDraftActor(request: Request): Promise<DraftActor | null> {
  const url = new URL(request.url);
  const origin = request.headers.get('origin');
  if ((request.method !== 'GET' || origin !== null) && origin !== url.origin) return null;
  if (
    process.env.NODE_ENV === 'development' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    return { id: 'local', local: true };
  }
  const viewer = await loadViewer().catch(() => null);
  return viewer ? { id: viewer.id, local: false } : null;
}

export async function readDraftBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > 250_000) throw new Error('Draft request is too large.');
  return JSON.parse(text);
}
