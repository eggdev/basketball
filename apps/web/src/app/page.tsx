import { DraftRoom } from './draft-room';
import { loadHistoricalAuctionMarket } from '../lib/historical-auction-market';

export const dynamic = 'force-dynamic';

export default async function Index() {
  const market = await loadHistoricalAuctionMarket().catch(() => null);

  return <DraftRoom market={market} />;
}
