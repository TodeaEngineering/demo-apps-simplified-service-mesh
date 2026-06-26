import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import type { ClientReport, Protocol } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Each client pod (client-http / client-grpc-meshed / client-grpc-unmeshed) POSTs
// one of these per request it makes. The dashboard only aggregates them — it
// generates no traffic itself.
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Partial<ClientReport> | null;
  if (!body || typeof body.client !== 'string') {
    return NextResponse.json({ error: 'invalid client report' }, { status: 400 });
  }
  const protocol: Protocol = body.protocol === 'http' ? 'http' : 'grpc';
  engine.ingestReport({
    client: body.client,
    protocol,
    meshed: Boolean(body.meshed),
    ok: Boolean(body.ok),
    ms: typeof body.ms === 'number' ? body.ms : 0,
    server: body.server ?? null,
    pod: body.pod ?? null,
    version: body.version ?? null,
    error: body.error ?? null,
    code: body.code ?? null,
  });
  return NextResponse.json({ status: 'ok' });
}
