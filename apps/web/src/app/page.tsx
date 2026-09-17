import { DraftRoom } from './draft-room';
import { loadHistoricalAuctionMarket } from '../lib/historical-auction-market';
import { loadLeagueRosters } from '../lib/league-rosters';
import { loadLeagueTeamHistory } from '../lib/league-team-history';
import { loadViewer } from '../lib/viewer';

export const dynamic = 'force-dynamic';

export default async function Index() {
  const viewer = await loadViewer().catch(() => null);
  const [market, rosterSnapshot, teamHistory] = await Promise.all([
    loadHistoricalAuctionMarket().catch(() => null),
    viewer === null ? Promise.resolve(null) : loadLeagueRosters().catch(() => null),
    viewer === null ? Promise.resolve(null) : loadLeagueTeamHistory().catch(() => null),
  ]);

  return (
    <DraftRoom
      chatEnabled={viewer !== null || process.env.NODE_ENV !== 'production'}
      market={market}
      rosterSnapshot={rosterSnapshot}
      teamHistory={teamHistory}
      viewer={viewer}
    />
  );
}
