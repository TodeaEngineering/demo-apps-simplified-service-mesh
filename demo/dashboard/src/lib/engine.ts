// The dashboard's aggregator. A single server-side singleton that holds the live
// traffic config (which the client pods poll via /api/config) and ingests every
// client's reported outcome (/api/report) into rolling stats the dashboard
// renders via /api/stats. It generates NO traffic itself — the client-http,
// client-grpc-meshed and client-grpc-unmeshed pods do.
//
// It lives on globalThis so it survives module reloads in `next dev` and stays
// a single instance across route-handler invocations.
import type {
  ClientConfig,
  ClientReport,
  ClientStats,
  EngineConfig,
  LogEntry,
  Protocol,
  ProtocolStats,
  SeriesPoint,
  Snapshot,
  VersionCount,
} from './types';

const SAMPLE_CAP = 1200;
const LOG_CAP = 50;
const SERIES_SECONDS = 60;
const WINDOW_SECONDS = 5;
const CLIENT_STALE_MS = 6000;

const MESH_ENABLED = (process.env.MESH_ENABLED ?? 'false').toLowerCase() === 'true';
// The server addresses, shown for reference. The dashboard no longer calls them —
// the client pods do — but it knows them from env so the UI can display targets.
const HTTP_TARGET = process.env.HTTP_TARGET ?? 'http://http-server:8080';
const GRPC_TARGET = process.env.GRPC_TARGET ?? 'grpc-server:50051';

const DEFAULT_CONFIG: EngineConfig = {
  rps: 20,
  payloadBytes: 64,
};

interface Sample {
  t: number;
  ms: number;
  ok: boolean;
}

interface Bucket {
  httpOk: number;
  httpErr: number;
  grpcOk: number;
  grpcErr: number;
}

interface ClientState {
  name: string;
  protocol: Protocol;
  meshed: boolean;
  total: number;
  ok: number;
  denied: number;
  lastSeen: number;
  lastOk: boolean;
  lastMs: number;
  lastVersion: string | null;
  lastPod: string | null;
  lastError: string | null;
  lastCode: string | null;
  versions: Map<string, number>;
  pods: Map<string, number>;
  times: number[];
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function toVersionCounts(m: Map<string, number>): VersionCount[] {
  return [...m.entries()].map(([version, count]) => ({ version, count })).sort((a, b) => b.count - a.count);
}

class TrafficEngine {
  config: EngineConfig = { ...DEFAULT_CONFIG };
  running = false;
  startedAt: number | null = null;

  private samples: Record<Protocol, Sample[]> = { http: [], grpc: [] };
  private totals: Record<Protocol, { ok: number; err: number }> = {
    http: { ok: 0, err: 0 },
    grpc: { ok: 0, err: 0 },
  };
  private pods: Record<Protocol, Map<string, number>> = { http: new Map(), grpc: new Map() };
  private versions: Record<Protocol, Map<string, number>> = { http: new Map(), grpc: new Map() };
  private buckets = new Map<number, Bucket>();
  private log: LogEntry[] = [];
  private clients = new Map<string, ClientState>();

  // Start/stop just flips the flag the clients poll — no timer, no traffic here.
  start(partial?: Partial<EngineConfig>): void {
    if (partial) this.applyConfig(partial);
    if (this.running) return;
    this.running = true;
    if (this.startedAt === null) this.startedAt = Date.now();
  }

  stop(): void {
    this.running = false;
  }

  reset(): void {
    this.stop();
    this.samples = { http: [], grpc: [] };
    this.totals = { http: { ok: 0, err: 0 }, grpc: { ok: 0, err: 0 } };
    this.pods = { http: new Map(), grpc: new Map() };
    this.versions = { http: new Map(), grpc: new Map() };
    this.buckets = new Map();
    this.log = [];
    this.clients = new Map();
    this.startedAt = null;
  }

  // Clears version/pod distributions so the canary view reflects a weight change
  // promptly (the cumulative counters would otherwise lag behind the new split).
  resetDistributions(): void {
    this.versions = { http: new Map(), grpc: new Map() };
    this.pods = { http: new Map(), grpc: new Map() };
    for (const c of this.clients.values()) {
      c.versions = new Map();
      c.pods = new Map();
    }
  }

  applyConfig(partial: Partial<EngineConfig>): void {
    const next: EngineConfig = { ...this.config, ...partial };
    this.config = {
      rps: clamp(Math.round(next.rps), 0, 500),
      payloadBytes: clamp(Math.round(next.payloadBytes), 0, 8192),
    };
  }

  // The live config the client pods poll (GET /api/config).
  clientConfig(): ClientConfig {
    return { running: this.running, rps: this.config.rps, payloadBytes: this.config.payloadBytes };
  }

  // Ingest one client outcome into both the protocol-level rollups (throughput
  // chart + protocol cards) and the per-client rollup (Mesh & Security panel).
  ingestReport(r: ClientReport): void {
    const now = Date.now();
    const protocol: Protocol = r.protocol === 'http' ? 'http' : 'grpc';

    const arr = this.samples[protocol];
    arr.push({ t: now, ms: r.ms, ok: r.ok });
    if (arr.length > SAMPLE_CAP) arr.shift();

    if (r.ok) this.totals[protocol].ok++;
    else this.totals[protocol].err++;
    if (r.ok && r.pod) this.pods[protocol].set(r.pod, (this.pods[protocol].get(r.pod) ?? 0) + 1);
    if (r.ok && r.version) this.versions[protocol].set(r.version, (this.versions[protocol].get(r.version) ?? 0) + 1);

    const sec = Math.floor(now / 1000);
    let bucket = this.buckets.get(sec);
    if (!bucket) {
      bucket = { httpOk: 0, httpErr: 0, grpcOk: 0, grpcErr: 0 };
      this.buckets.set(sec, bucket);
      this.pruneBuckets(sec);
    }
    if (protocol === 'http') r.ok ? bucket.httpOk++ : bucket.httpErr++;
    else r.ok ? bucket.grpcOk++ : bucket.grpcErr++;

    let c = this.clients.get(r.client);
    if (!c) {
      c = {
        name: r.client,
        protocol,
        meshed: r.meshed,
        total: 0,
        ok: 0,
        denied: 0,
        lastSeen: 0,
        lastOk: false,
        lastMs: 0,
        lastVersion: null,
        lastPod: null,
        lastError: null,
        lastCode: null,
        versions: new Map(),
        pods: new Map(),
        times: [],
      };
      this.clients.set(r.client, c);
    }
    c.protocol = protocol;
    c.meshed = r.meshed;
    c.total++;
    c.lastSeen = now;
    c.lastOk = r.ok;
    c.lastMs = r.ms;
    c.times.push(now);
    // Keep ~6s of timestamps for the rps window (bounded by the send rate, so it
    // stays accurate at high rates instead of capping at a fixed count).
    const cutoff = now - 6000;
    while (c.times.length && c.times[0] < cutoff) c.times.shift();

    if (r.ok) {
      c.ok++;
      c.lastVersion = r.version;
      c.lastPod = r.pod;
      c.lastError = null;
      c.lastCode = null;
      if (r.version) c.versions.set(r.version, (c.versions.get(r.version) ?? 0) + 1);
      if (r.pod) c.pods.set(r.pod, (c.pods.get(r.pod) ?? 0) + 1);
    } else {
      c.lastError = r.error;
      c.lastCode = r.code;
      if (r.code === 'PERMISSION_DENIED' || /denied|unauthor/i.test(r.error ?? '')) c.denied++;
    }

    this.log.unshift({
      t: now,
      protocol,
      ok: r.ok,
      ms: r.ms,
      server: r.server,
      pod: r.pod,
      error: r.ok ? null : r.code || r.error || 'error',
      client: r.client,
    });
    if (this.log.length > LOG_CAP) this.log.pop();
  }

  private pruneBuckets(currentSec: number): void {
    for (const k of this.buckets.keys()) {
      if (k < currentSec - SERIES_SECONDS) this.buckets.delete(k);
    }
  }

  snapshot(): Snapshot {
    const now = Date.now();
    return {
      running: this.running,
      config: this.config,
      startedAt: this.startedAt,
      uptimeMs: this.startedAt ? now - this.startedAt : 0,
      meshEnabled: MESH_ENABLED,
      targets: { http: HTTP_TARGET, grpc: GRPC_TARGET },
      http: this.protocolStats('http', now),
      grpc: this.protocolStats('grpc', now),
      series: this.series(now),
      log: this.log.slice(0, LOG_CAP),
      clients: this.clientStats(now),
    };
  }

  private protocolStats(protocol: Protocol, now: number): ProtocolStats {
    const winStart = now - WINDOW_SECONDS * 1000;
    const latencies = this.samples[protocol]
      .filter((s) => s.t >= winStart)
      .map((s) => s.ms)
      .sort((a, b) => a - b);

    let okWin = 0;
    let errWin = 0;
    const currentSec = Math.floor(now / 1000);
    for (let s = currentSec - WINDOW_SECONDS; s < currentSec; s++) {
      const b = this.buckets.get(s);
      if (!b) continue;
      if (protocol === 'http') {
        okWin += b.httpOk;
        errWin += b.httpErr;
      } else {
        okWin += b.grpcOk;
        errWin += b.grpcErr;
      }
    }
    const winTotal = okWin + errWin;
    const total = this.totals[protocol].ok + this.totals[protocol].err;

    return {
      protocol,
      total,
      ok: this.totals[protocol].ok,
      err: this.totals[protocol].err,
      rps: winTotal / WINDOW_SECONDS,
      successRate: winTotal
        ? (okWin / winTotal) * 100
        : total
          ? (this.totals[protocol].ok / total) * 100
          : 100,
      p50: percentile(latencies, 50),
      p95: percentile(latencies, 95),
      p99: percentile(latencies, 99),
      inflight: 0, // the client pods hold in-flight requests now, not the dashboard
      pods: [...this.pods[protocol].entries()]
        .map(([pod, count]) => ({ pod, count }))
        .sort((a, b) => b.count - a.count),
      versions: toVersionCounts(this.versions[protocol]),
    };
  }

  private series(now: number): SeriesPoint[] {
    const currentSec = Math.floor(now / 1000);
    const out: SeriesPoint[] = [];
    for (let s = currentSec - SERIES_SECONDS; s < currentSec; s++) {
      const b = this.buckets.get(s);
      out.push({
        t: s * 1000,
        http: b ? b.httpOk + b.httpErr : 0,
        grpc: b ? b.grpcOk + b.grpcErr : 0,
        httpErr: b ? b.httpErr : 0,
        grpcErr: b ? b.grpcErr : 0,
      });
    }
    return out;
  }

  private clientStats(now: number): ClientStats[] {
    return [...this.clients.values()]
      .sort((a, b) => (a.meshed === b.meshed ? a.name.localeCompare(b.name) : a.meshed ? -1 : 1))
      .map((c) => {
        const recent = c.times.filter((t) => now - t <= 5000).length;
        return {
          name: c.name,
          protocol: c.protocol,
          meshed: c.meshed,
          total: c.total,
          ok: c.ok,
          denied: c.denied,
          successRate: c.total ? (c.ok / c.total) * 100 : 0,
          rps: recent / 5,
          lastSeen: c.lastSeen,
          stale: now - c.lastSeen > CLIENT_STALE_MS,
          lastOk: c.lastOk,
          lastMs: c.lastMs,
          lastVersion: c.lastVersion,
          lastPod: c.lastPod,
          lastError: c.lastError,
          lastCode: c.lastCode,
          versions: toVersionCounts(c.versions),
          pods: [...c.pods.entries()].map(([pod, count]) => ({ pod, count })).sort((a, b) => b.count - a.count),
        };
      });
  }
}

const globalRef = globalThis as unknown as { __trafficEngine?: TrafficEngine };
export const engine: TrafficEngine = globalRef.__trafficEngine ?? (globalRef.__trafficEngine = new TrafficEngine());
