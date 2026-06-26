import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(engine.snapshot());
}
