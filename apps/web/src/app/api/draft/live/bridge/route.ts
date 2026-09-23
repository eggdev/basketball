import { fantraxLeagueId } from '../../../../../lib/fantrax-live';
import { createFantraxBridgeScript } from '../../../../../lib/fantrax-bridge-script';
import { getDraftActor } from '../../../../../lib/draft-access';

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!(await getDraftActor(request)))
    return new Response('Sign in to connect the draft bridge.', { status: 401 });
  const league = fantraxLeagueId.safeParse(url.searchParams.get('leagueId'));
  const team = url.searchParams.get('teamId') ?? '';
  if (!league.success || !/^[a-zA-Z0-9_-]{1,80}$/.test(team))
    return new Response('Choose your league and team.', { status: 400 });
  return new Response(createFantraxBridgeScript(league.data, team, url.origin), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
