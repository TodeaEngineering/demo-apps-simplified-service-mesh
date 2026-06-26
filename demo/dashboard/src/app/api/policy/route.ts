import { NextResponse } from 'next/server';
import { clusterAvailable } from '@/lib/cluster';
import { applyPolicy, removePolicy, policyState } from '@/lib/policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const available = await clusterAvailable();
  return NextResponse.json(await policyState(available));
}

export async function POST(req: Request) {
  const available = await clusterAvailable();
  if (!available) {
    return NextResponse.json(
      { available: false, enabled: false, error: 'cluster not reachable (in-cluster only)' },
      { status: 503 },
    );
  }
  const body = (await req.json().catch(() => ({}))) as { action?: string };
  if (body.action === 'apply') {
    const r = await applyPolicy();
    if (!r.ok) return NextResponse.json({ available: true, enabled: false, error: r.message }, { status: 500 });
  } else if (body.action === 'remove') {
    const r = await removePolicy();
    if (!r.ok) return NextResponse.json({ available: true, enabled: true, error: r.message }, { status: 500 });
  } else {
    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  }
  return NextResponse.json(await policyState(true));
}
