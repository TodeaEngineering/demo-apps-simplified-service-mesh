import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The client pods poll this for the live config (running / rps / payload) so the
// dashboard's Start/Stop + throughput controls steer them.
export async function GET() {
  return NextResponse.json(engine.clientConfig());
}
