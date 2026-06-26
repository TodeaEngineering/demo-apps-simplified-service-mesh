import { NextResponse } from 'next/server';
import type { ObsState } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Prometheus / Grafana links. The chart sets these env vars only when the
// respective subchart is enabled; empty → the dashboard shows the button disabled.
export async function GET() {
  const prometheus = process.env.PROMETHEUS_URL ?? '';
  const grafana = process.env.GRAFANA_URL ?? '';
  const state: ObsState = {
    prometheus: { enabled: prometheus.length > 0, url: prometheus },
    grafana: { enabled: grafana.length > 0, url: grafana },
  };
  return NextResponse.json(state);
}
