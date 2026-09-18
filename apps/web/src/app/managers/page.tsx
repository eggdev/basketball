import { loadLeagueTeamHistory } from '../../lib/league-team-history';
import { loadViewer } from '../../lib/viewer';
import { ManagersView } from './managers-view';

export const dynamic = 'force-dynamic';

export default async function ManagersPage() {
  const viewer = await loadViewer().catch(() => null);
  const history = viewer === null ? null : await loadLeagueTeamHistory().catch(() => null);

  return <ManagersView authenticated={viewer !== null} history={history} />;
}
