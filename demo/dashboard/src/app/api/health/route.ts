import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Liveness/readiness for the dashboard pod itself.
export async function GET() {
  return NextResponse.json({ status: 'ok' });
}
