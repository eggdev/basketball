import { loadLocalLiveLeagues, loadFantraxLeague } from '../../../lib/fantrax-live-server';
import { fantraxLeagueId } from '../../../lib/fantrax-live';
import { loadDraftModelReference } from '../../../lib/live-draft-model';
import { loadViewer } from '../../../lib/viewer';
import { LiveDraftRoom } from './live-draft-room';

export const dynamic = 'force-dynamic';

export default async function LiveDraftPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ league?: string; team?: string }>;
}) {
  const [query, viewer, shortcuts] = await Promise.all([
    searchParams,
    loadViewer().catch(() => null),
    loadLocalLiveLeagues(),
  ]);
  const leagueId = typeof query.league === 'string' ? query.league : '';
  const teamId = typeof query.team === 'string' ? query.team : '';
  const bridgeEnabled = process.env.NODE_ENV === 'development' || viewer !== null;
  const modelSummary =
    bridgeEnabled && fantraxLeagueId.safeParse(leagueId).success
      ? await loadFantraxLeague(leagueId)
          .then((league) => loadDraftModelReference(league.seasonYear))
          .then((reference) => reference.summary)
          .catch(() => null)
      : null;
  return (
    <LiveDraftRoom
      key={`${leagueId}:${teamId}:${viewer?.id ?? 'local'}`}
      leagueId={leagueId}
      initialTeamId={teamId}
      viewerId={viewer?.id ?? 'local'}
      shortcuts={shortcuts}
      bridgeEnabled={bridgeEnabled}
      modelSummary={modelSummary}
    />
  );
}
