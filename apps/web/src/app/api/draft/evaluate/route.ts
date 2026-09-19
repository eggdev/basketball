import { NextResponse } from 'next/server';

import { evaluateLiveBidRequest, type LiveBidRequest } from '../../../../lib/live-bid-evaluator';
import { loadViewer } from '../../../../lib/viewer';

export const dynamic = 'force-dynamic';

const isWholeNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

const parseRequest = (value: unknown): LiveBidRequest | null => {
  if (typeof value !== 'object' || value === null) return null;
  const candidate = value as Record<string, unknown>;
  if (
    typeof candidate['playerId'] !== 'string' ||
    candidate['playerId'].length < 1 ||
    candidate['playerId'].length > 160 ||
    typeof candidate['draftStateVersion'] !== 'string' ||
    candidate['draftStateVersion'].length < 1 ||
    candidate['draftStateVersion'].length > 160 ||
    !isWholeNonNegative(candidate['currentPriceCents']) ||
    !isWholeNonNegative(candidate['remainingBudgetCents']) ||
    !isWholeNonNegative(candidate['remainingRosterSpots']) ||
    candidate['remainingRosterSpots'] < 1 ||
    !Array.isArray(candidate['ownedPlayerIds']) ||
    candidate['ownedPlayerIds'].length > 13 ||
    !candidate['ownedPlayerIds'].every(
      (playerId) => typeof playerId === 'string' && playerId.length > 0 && playerId.length <= 160,
    )
  ) {
    return null;
  }
  return {
    currentPriceCents: candidate['currentPriceCents'],
    draftStateVersion: candidate['draftStateVersion'],
    ownedPlayerIds: [...new Set(candidate['ownedPlayerIds'])],
    playerId: candidate['playerId'],
    remainingBudgetCents: candidate['remainingBudgetCents'],
    remainingRosterSpots: candidate['remainingRosterSpots'],
  };
};

export async function POST(request: Request) {
  const viewer = await loadViewer().catch(() => null);
  if (viewer === null) {
    return NextResponse.json({ error: 'Sign in to evaluate a live bid.' }, { status: 401 });
  }

  const input = parseRequest(await request.json().catch(() => null));
  if (input === null) {
    return NextResponse.json({ error: 'The live bid request is invalid.' }, { status: 400 });
  }

  try {
    const evaluation = await evaluateLiveBidRequest(input, request.signal);
    return NextResponse.json(evaluation, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The bid could not be evaluated.';
    const status = message.startsWith('Projection unavailable') ? 404 : 503;
    return NextResponse.json({ error: message }, { status });
  }
}
