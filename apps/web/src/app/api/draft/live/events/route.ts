import { NextResponse } from 'next/server';
import { bridgeRequestSchema, bridgeVersion } from '../../../../../lib/fantrax-bridge';
import { saveDraftCapture } from '../../../../../lib/live-draft-capture';
import { getDraftActor, readDraftBody } from '../../../../../lib/draft-access';

export const runtime = 'nodejs';

export async function POST(request: Request) {
  const actor = await getDraftActor(request);
  if (!actor)
    return NextResponse.json({ error: 'Sign in to capture this draft.' }, { status: 401 });
  const parsed = bridgeRequestSchema.safeParse(await readDraftBody(request).catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid draft state.' }, { status: 400 });
  const { state, teamId } = parsed.data;
  const saved = await saveDraftCapture(actor, state.leagueId, {
    type: 'bridge',
    capturedAt: new Date().toISOString(),
    teamId,
    version: bridgeVersion(state, teamId),
    state,
  });
  return NextResponse.json(
    { recording: saved ? 'saved' : 'unavailable' },
    { status: saved ? 200 : 503 },
  );
}
