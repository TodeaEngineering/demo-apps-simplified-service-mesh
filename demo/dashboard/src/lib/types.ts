// Shared shapes for the traffic engine and the dashboard. The engine runs only
// on the server; these types travel to the client as the JSON `Snapshot`.

export type Protocol = 'http' | 'grpc';

export interface EngineConfig {
  /** Requests/sec each client pod sends while running. */
  rps: number;
  /** Size of the echo payload in bytes. */
  payloadBytes: number;
}

// The live config the client pods poll from the dashboard (GET /api/config),
// so the dashboard's Start/Stop + throughput controls steer them.
export interface ClientConfig {
  running: boolean;
  rps: number;
  payloadBytes: number;
}

export interface PodCount {
  pod: string;
  count: number;
}

export interface VersionCount {
  version: string;
  count: number;
}

export interface ProtocolStats {
  protocol: Protocol;
  total: number;
  ok: number;
  err: number;
  /** Observed requests/sec over the recent window. */
  rps: number;
  /** Success rate over the recent window, 0..100. */
  successRate: number;
  p50: number;
  p95: number;
  p99: number;
  inflight: number;
  /** Which instances answered, busiest first. */
  pods: PodCount[];
  /** Canary dimension — which versions answered, busiest first. */
  versions: VersionCount[];
}

export interface SeriesPoint {
  t: number;
  http: number;
  grpc: number;
  httpErr: number;
  grpcErr: number;
}

export interface LogEntry {
  t: number;
  protocol: Protocol;
  ok: boolean;
  ms: number;
  server: string | null;
  pod: string | null;
  error: string | null;
  client: string; // which client pod made the request (e.g. client-grpc-meshed)
}

// A single result a client pod POSTs to /api/report.
export interface ClientReport {
  client: string; // "client-http" | "client-grpc-meshed" | "client-grpc-unmeshed"
  protocol: Protocol;
  meshed: boolean;
  ok: boolean;
  ms: number;
  server: string | null;
  pod: string | null;
  version: string | null;
  error: string | null;
  code: string | null;
}

// Aggregated state for one client, rendered in the Mesh & Security panel.
export interface ClientStats {
  name: string;
  protocol: Protocol;
  meshed: boolean;
  total: number;
  ok: number;
  denied: number;
  successRate: number;
  rps: number;
  lastSeen: number;
  stale: boolean;
  lastOk: boolean;
  lastMs: number;
  lastVersion: string | null;
  lastPod: string | null;
  lastError: string | null;
  lastCode: string | null;
  versions: VersionCount[];
  pods: PodCount[];
}

// One policy manifest, shown in the dashboard when authorization is enforced.
export interface PolicyResource {
  kind: string; // e.g. "Server", "AuthorizationPolicy"
  name: string;
  summary: string; // how this resource shapes the traffic
  yaml: string;
}

// State of the gRPC authorization policy (the apply/remove toggle).
export interface PolicyState {
  available: boolean; // true when the dashboard can talk to the cluster
  enabled: boolean; // true when the AuthorizationPolicy is applied
  resources: PolicyResource[]; // the manifests that enforce it (shown when enabled)
}

export type SniffTarget = 'meshed' | 'unmeshed';

// Result of a wire capture (ephemeral tcpdump on the chosen client pod).
export interface SniffResult {
  available: boolean;
  target: SniffTarget;
  pod: string | null;
  seconds: number;
  hits: number; // times the marker appeared in cleartext
  plaintext: boolean; // was the payload readable on the wire?
  capture: string[]; // the full capture, untrimmed
  error?: string;
}

// Links to the optional Prometheus / Grafana subcharts (set via env when enabled).
export interface ObsLink {
  enabled: boolean;
  url: string;
}
export interface ObsState {
  prometheus: ObsLink;
  grafana: ObsLink;
}

export interface Snapshot {
  running: boolean;
  config: EngineConfig;
  startedAt: number | null;
  uptimeMs: number;
  /** True when the dashboard is running inside the mesh (env MESH_ENABLED). */
  meshEnabled: boolean;
  targets: { http: string; grpc: string };
  http: ProtocolStats;
  grpc: ProtocolStats;
  series: SeriesPoint[];
  log: LogEntry[];
  clients: ClientStats[];
}
