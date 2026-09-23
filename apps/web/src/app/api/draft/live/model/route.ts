import { NextResponse } from 'next/server';
import { getDraftActor } from '../../../../../lib/draft-access';
import { fantraxLeagueId } from '../../../../../lib/fantrax-live';
import { loadFantraxLeague } from '../../../../../lib/fantrax-live-server';
import { loadDraftModelReference } from '../../../../../lib/live-draft-model';

export async function GET(request: Request) {
  if (!(await getDraftActor(request)))
    return NextResponse.json({ error: 'Sign in to view generated rankings.' }, { status: 401 });
  const leagueId = fantraxLeagueId.safeParse(new URL(request.url).searchParams.get('leagueId'));
  if (!leagueId.success) return NextResponse.json({ error: 'Invalid league.' }, { status: 400 });
  try {
    const league = await loadFantraxLeague(leagueId.data);
    const reference = await loadDraftModelReference(league.seasonYear);
    return NextResponse.json(reference.summary, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'The league model could not be checked.' }, { status: 502 });
  }
}
