import { loadHistoricalAuctionMarket } from '../../lib/historical-auction-market';
import { loadHistoricalRankings } from '../../lib/historical-rankings';
import { loadLeagueRosterActivity } from '../../lib/league-roster-activity';
import { loadLeagueRosters } from '../../lib/league-rosters';
import { loadViewer } from '../../lib/viewer';
import { WaiversView } from './waivers-view';

export const dynamic = 'force-dynamic';

export default async function WaiversPage() {
  const viewer = await loadViewer().catch(() => null);
  const [activity, market, rankings, rosterSnapshot] = await Promise.all([
    viewer === null ? Promise.resolve(null) : loadLeagueRosterActivity().catch(() => null),
    loadHistoricalAuctionMarket().catch(() => null),
    loadHistoricalRankings().catch(() => null),
    viewer === null ? Promise.resolve(null) : loadLeagueRosters().catch(() => null),
  ]);

  return (
    <WaiversView
      authenticated={viewer !== null}
      activity={activity}
      market={market}
      rankings={rankings}
      rosterSnapshot={rosterSnapshot}
    />
  );
}
