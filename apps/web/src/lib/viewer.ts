import type { AppSession } from '@fantasy-basketball/auth';
import { headers } from 'next/headers';

export async function loadViewer(): Promise<AppSession['user'] | null> {
  const { getAppSession } = await import('@fantasy-basketball/auth');
  const session = await getAppSession(await headers());
  return session?.user ?? null;
}
