import { NextResponse } from 'next/server';
import { engine } from '@/lib/engine';
import type { EngineConfig } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ControlBody {
  action?: 'start' | 'stop' | 'reset' | 'update';
  config?: Partial<EngineConfig>;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as ControlBody;

  switch (body.action) {
    case 'start':
      engine.start(body.config);
      break;
    case 'stop':
      engine.stop();
      break;
    case 'reset':
      engine.reset();
      break;
    case 'update':
      engine.applyConfig(body.config ?? {});
      break;
    default:
      return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  }

  return NextResponse.json(engine.snapshot());
}
