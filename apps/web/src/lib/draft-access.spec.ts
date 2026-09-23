import { afterEach, describe, expect, it, vi } from 'vitest';
import { getDraftActor, readDraftBody } from './draft-access';
import { loadViewer } from './viewer';

vi.mock('./viewer', () => ({ loadViewer: vi.fn<() => Promise<{ id: string } | null>>() }));
const request = (
  url = 'https://draft.example/api/draft/live/events',
  origin: string | null = 'https://draft.example',
  method = 'POST',
) => new Request(url, { method, headers: origin ? { origin } : {} });

describe('draft access', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetAllMocks();
  });
  it('requires an owner session outside local development', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(loadViewer).mockResolvedValue(null);
    expect(await getDraftActor(request())).toBeNull();
    vi.mocked(loadViewer).mockResolvedValue({
      id: 'owner',
      email: 'owner@example.com',
      name: 'Owner',
      image: null,
    });
    expect(await getDraftActor(request())).toEqual({ id: 'owner', local: false });
    expect(
      await getDraftActor(request('https://draft.example/api/draft/live/bridge', null, 'GET')),
    ).toEqual({ id: 'owner', local: false });
  });
  it('rejects cross-origin and missing-origin writes before checking the session', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(await getDraftActor(request(undefined, 'https://www.fantrax.com'))).toBeNull();
    expect(await getDraftActor(request(undefined, null))).toBeNull();
    expect(loadViewer).not.toHaveBeenCalled();
  });
  it('retains the local trial without enabling an anonymous production path', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    expect(
      await getDraftActor(
        request('http://localhost:3000/api/draft/live/events', 'http://localhost:3000'),
      ),
    ).toEqual({ id: 'local', local: true });
    vi.stubEnv('NODE_ENV', 'production');
    vi.mocked(loadViewer).mockResolvedValue(null);
    expect(
      await getDraftActor(
        request('http://localhost:3000/api/draft/live/events', 'http://localhost:3000'),
      ),
    ).toBeNull();
  });
  it('rejects malformed and oversized bodies', async () => {
    await expect(
      readDraftBody(new Request('http://localhost', { method: 'POST', body: 'invalid' })),
    ).rejects.toThrow(SyntaxError);
    await expect(
      readDraftBody(new Request('http://localhost', { method: 'POST', body: ' '.repeat(250001) })),
    ).rejects.toThrow('too large');
  });
});
