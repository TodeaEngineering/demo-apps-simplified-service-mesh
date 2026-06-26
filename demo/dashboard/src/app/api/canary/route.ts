import { NextResponse } from 'next/server';
import { clusterAvailable } from '@/lib/cluster';
import { getCanary, setCanary } from '@/lib/canary';
import { engine } from '@/lib/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clamp(n: unknown): number {
  const v = Math.round(Number(n));
  if (Number.isNaN(v)) return 0;
  return Math.max(0, Math.min(100, v));
}

export async function GET() {
  const available = await clusterAvailable();
  if (!available) return NextResponse.json({ available: false, v1: 90, v2: 10 });
  const c = await getCanary();
  return NextResponse.json({ available: true, v1: c?.v1 ?? 90, v2: c?.v2 ?? 10 });
}

export async function POST(req: Request) {
  const available = await clusterAvailable();
  if (!available) {
    return NextResponse.json({ available: false, error: 'cluster not reachable (in-cluster only)' }, { status: 503 });
  }
  const body = (await req.json().catch(() => ({}))) as { v1?: number; v2?: number };
  const v2 = clamp(body.v2 ?? 100 - clamp(body.v1));
  const v1 = clamp(body.v1 ?? 100 - v2);
  const r = await setCanary(v1, v2);
  if (!r.ok) {
    return NextResponse.json({ available: true, error: r.message }, { status: 500 });
  }
  // Refresh the version/pod distributions so the cards reflect the new split now.
  engine.resetDistributions();
  const c = await getCanary();
  return NextResponse.json({ available: true, v1: c?.v1 ?? v1, v2: c?.v2 ?? v2 });
}
