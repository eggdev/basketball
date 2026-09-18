import { loadLeagueRosters } from '../../lib/league-rosters';
import { loadViewer } from '../../lib/viewer';
import { LeagueView } from './league-view';

export const dynamic = 'force-dynamic';

export default async function LeaguePage() {
  const viewer = await loadViewer().catch(() => null);
  const snapshot = viewer === null ? null : await loadLeagueRosters().catch(() => null);

  return <LeagueView authenticated={viewer !== null} snapshot={snapshot} />;
}
