import { NextResponse } from 'next/server';
import { fantraxLeagueId } from '../../../../lib/fantrax-live';
import { loadFantraxLive } from '../../../../lib/fantrax-live-server';
import { exportDraftCapture } from '../../../../lib/live-draft-capture';
import { getDraftActor } from '../../../../lib/draft-access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// Public snapshots stay public. Capture exports require their owner's session outside local development.
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const leagueId = fantraxLeagueId.safeParse(query.get('leagueId'));
  if (!leagueId.success)
    return NextResponse.json(
      { error: 'Enter a valid 16-character Fantrax league ID.' },
      { status: 400 },
    );
  const headers = { 'Cache-Control': 'no-store' };
  if (query.get('export') === '1') {
    const actor = await getDraftActor(request);
    if (!actor)
      return NextResponse.json(
        { error: 'Sign in to export your draft capture.' },
        { status: 401, headers },
      );
    let capture: string | null;
    try {
      capture = await exportDraftCapture(actor, leagueId.data);
    } catch {
      return NextResponse.json(
        { error: 'Draft capture could not be loaded.' },
        { status: 503, headers },
      );
    }
    if (!capture)
      return NextResponse.json({ error: 'No capture is available yet.' }, { status: 404, headers });
    return new Response(capture, {
      headers: {
        ...headers,
        'Content-Type': 'application/x-ndjson',
        'Content-Disposition': `attachment; filename="draft-${leagueId.data}.jsonl"`,
      },
    });
  }
  try {
    return NextResponse.json(await loadFantraxLive(leagueId.data), { headers });
  } catch (error) {
    console.error('Fantrax live feed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      {
        error:
          'Fantrax could not provide a valid auction snapshot. The last good snapshot stays on screen.',
      },
      { status: 502, headers },
    );
  }
}
