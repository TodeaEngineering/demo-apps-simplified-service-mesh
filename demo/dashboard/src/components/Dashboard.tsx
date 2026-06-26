'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { EngineConfig, ProtocolStats, Snapshot } from '@/lib/types';
import { fmtInt, fmtRps, fmtUptime } from '@/lib/format';
import ControlBar from './ControlBar';
import TrafficTopology from './TrafficTopology';
import ProtocolCard from './ProtocolCard';
import MeshSecurityPanel from './MeshSecurityPanel';
import LiveControls from './LiveControls';
import TrafficChart from './TrafficChart';
import LogFeed from './LogFeed';

const POLL_MS = 700;
const DEFAULT_CONFIG: EngineConfig = { rps: 20, payloadBytes: 64 };

function emptyStats(protocol: 'http' | 'grpc'): ProtocolStats {
  return {
    protocol,
    total: 0,
    ok: 0,
    err: 0,
    rps: 0,
    successRate: 100,
    p50: 0,
    p95: 0,
    p99: 0,
    inflight: 0,
    pods: [],
    versions: [],
  };
}

function versionSummary(versions: { version: string; count: number }[]): string {
  const total = versions.reduce((s, v) => s + v.count, 0);
  if (!total) return '';
  return versions
    .slice(0, 3)
    .map((v) => `${v.version} ${Math.round((v.count / total) * 100)}%`)
    .join(' · ');
}

export default function Dashboard() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [config, setConfig] = useState<EngineConfig>(DEFAULT_CONFIG);
  const configHydrated = useRef(false);
  const [canary, setCanary] = useState<{ v1: number; v2: number; available: boolean }>({
    v1: 90,
    v2: 10,
    available: false,
  });

  useEffect(() => {
    let alive = true;
    async function poll() {
      try {
        const res = await fetch('/api/stats', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as Snapshot;
        if (!alive) return;
        setSnap(data);
        if (!configHydrated.current) {
          setConfig(data.config);
          configHydrated.current = true;
        }
      } catch {
        /* transient network error while polling — ignore */
      }
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const post = useCallback(async (action: string, cfg?: Partial<EngineConfig>) => {
    try {
      const res = await fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, config: cfg }),
      });
      if (res.ok) setSnap((await res.json()) as Snapshot);
    } catch {
      /* ignore */
    }
  }, []);

  const onChange = useCallback(
    (partial: Partial<EngineConfig>) => {
      setConfig((c) => ({ ...c, ...partial }));
      post('update', partial);
    },
    [post],
  );

  // Current canary weights (from the live GRPCRoute).
  useEffect(() => {
    fetch('/api/canary', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCanary({ v1: d.v1, v2: d.v2, available: d.available }))
      .catch(() => {});
  }, []);

  const onCanary = useCallback(async (v2: number) => {
    const v1 = 100 - v2;
    setCanary((c) => ({ ...c, v1, v2 })); // optimistic
    try {
      const res = await fetch('/api/canary', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ v1, v2 }),
      });
      if (res.ok) {
        const d = (await res.json()) as { v1: number; v2: number; available: boolean };
        setCanary({ v1: d.v1, v2: d.v2, available: d.available });
      }
    } catch {
      /* ignore */
    }
  }, []);

  const running = snap?.running ?? false;
  const http = snap?.http ?? emptyStats('http');
  const grpc = snap?.grpc ?? emptyStats('grpc');
  const totalReq = http.total + grpc.total;
  const totalRps = http.rps + grpc.rps;
  const meshEnabled = snap?.meshEnabled ?? false;
  const grpcSummary = versionSummary(grpc.versions);

  return (
    <div className="max-w-[1200px] mx-auto px-6">
      {/* Header */}
      <section className="pt-14 sm:pt-20">
        <p
          className="opacity-0 animate-rise text-[11px] font-semibold tracking-[.2em] uppercase text-neutral-600 mb-4"
          style={{ animationDelay: '0.05s' }}
        >
          Live service-mesh demo
        </p>
        <h1
          className="opacity-0 animate-rise text-[clamp(2.2rem,5.5vw,3.6rem)] font-[800] leading-[1.05] tracking-tight"
          style={{ animationDelay: '0.15s' }}
        >
          Dashboard
        </h1>
        <p
          className="opacity-0 animate-rise mt-5 max-w-[660px] text-[16px] sm:text-[17px] text-neutral-600 font-light leading-relaxed"
          style={{ animationDelay: '0.25s' }}
        >
          Three client pods fire real requests at two tiny servers —{' '}
          <span className="font-medium text-black">HTTP</span> and{' '}
          <span className="font-medium text-black">gRPC</span>, meshed and unmeshed. This
          dashboard steers them and observes throughput, latency, the canary mix, and which
          instance answers.
        </p>
      </section>

      {/* Control */}
      <section className="opacity-0 animate-rise mt-10" style={{ animationDelay: '0.35s' }}>
        <ControlBar
          running={running}
          config={config}
          totalReq={totalReq}
          totalRps={totalRps}
          uptime={fmtUptime(snap?.uptimeMs ?? 0)}
          targets={snap?.targets ?? { http: '', grpc: '' }}
          canary={canary}
          onStart={() => post('start', config)}
          onStop={() => post('stop')}
          onReset={() => post('reset')}
          onChange={onChange}
          onCanary={onCanary}
        />
      </section>

      {/* Topology */}
      <section className="opacity-0 animate-rise mt-5" style={{ animationDelay: '0.45s' }}>
        <TrafficTopology
          running={running}
          clients={snap?.clients ?? []}
          httpPods={http.pods.length}
          grpcPods={grpc.pods.length}
          grpcSummary={grpcSummary}
        />
      </section>

      {/* Protocol cards */}
      <section className="grid md:grid-cols-2 gap-5 mt-5">
        <ProtocolCard
          variant="http"
          title="HTTP"
          transport="HTTP/1.1 · JSON"
          endpoint={snap?.targets.http ?? ''}
          stats={http}
          running={running}
        />
        <ProtocolCard
          variant="grpc"
          title="gRPC"
          transport="gRPC · HTTP/2"
          endpoint={snap?.targets.grpc ?? ''}
          stats={grpc}
          running={running}
        />
      </section>

      {/* Mesh & security — the client pods */}
      <section className="mt-14">
        <MeshSecurityPanel
          clients={snap?.clients ?? []}
          meshEnabled={meshEnabled}
          controls={<LiveControls />}
        />
      </section>

      {/* Throughput */}
      <section className="mt-5">
        <TrafficChart series={snap?.series ?? []} />
      </section>

      {/* Request log — full width for readability */}
      <section className="mt-5">
        <LogFeed log={snap?.log ?? []} />
      </section>

      <p className="mt-6 text-[12px] text-neutral-400 font-mono">
        {fmtInt(totalReq)} requests · {fmtRps(totalRps)} req/s observed
      </p>
    </div>
  );
}
