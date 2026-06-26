import { NextResponse } from 'next/server';
import { clusterAvailable } from '@/lib/cluster';
import { runSniff } from '@/lib/sniff';
import type { SniffResult, SniffTarget } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Captures on the chosen pod (~8s) plus a possible image pull; give it headroom.
export const maxDuration = 90;

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { seconds?: number; target?: string };
  const target: SniffTarget = body.target === 'meshed' ? 'meshed' : 'unmeshed';

  const available = await clusterAvailable();
  if (!available) {
    const unavailable: SniffResult = {
      available: false,
      target,
      pod: null,
      seconds: 0,
      hits: 0,
      plaintext: false,
      capture: [],
      error: 'cluster not reachable (in-cluster only)',
    };
    return NextResponse.json(unavailable, { status: 503 });
  }

  const seconds = Math.min(20, Math.max(4, Math.round(body.seconds ?? 8)));
  return NextResponse.json(await runSniff(target, seconds));
}
