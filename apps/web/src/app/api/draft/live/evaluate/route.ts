import { NextResponse } from 'next/server';
import { bridgeRequestSchema } from '../../../../../lib/fantrax-bridge';
import { saveDraftCapture } from '../../../../../lib/live-draft-capture';
import { getDraftActor, readDraftBody } from '../../../../../lib/draft-access';
import { evaluateDraftChange } from '../../../../../lib/live-draft-evaluator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const actor = await getDraftActor(request);
  if (!actor)
    return NextResponse.json({ error: 'Sign in to evaluate this draft.' }, { status: 401 });
  const parsed = bridgeRequestSchema.safeParse(await readDraftBody(request).catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid draft state.' }, { status: 400 });
  const { state, teamId } = parsed.data;
  try {
    const evaluation = await evaluateDraftChange(state, teamId, request.signal);
    const saved = await saveDraftCapture(actor, state.leagueId, {
      type: 'evaluation',
      capturedAt: new Date().toISOString(),
      teamId,
      sequence: state.sequence,
      evaluation,
    });
    return NextResponse.json(
      { ...evaluation, recording: saved ? 'saved' : 'unavailable' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return NextResponse.json(
      { error: 'Draft evaluation could not finish. Check the live connection.' },
      { status: 502 },
    );
  }
}
