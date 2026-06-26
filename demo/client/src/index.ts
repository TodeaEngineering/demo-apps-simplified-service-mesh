// Unified traffic client. One image, deployed as several pods that each generate
// a slice of the demo traffic and report every outcome to the dashboard:
//   - client-http           HTTP, meshed
//   - client-grpc-meshed    gRPC, meshed   (mTLS, honors the GRPCRoute canary)
//   - client-grpc-unmeshed  gRPC, unmeshed (plaintext on the wire, DENIED by authz)
//
// Each pod POLLS the dashboard for live config (running / rps / payload) so the
// dashboard's Start/Stop + throughput controls steer it, then POSTs each result
// to /api/report. The MARKER rides in the payload so the dashboard's "Sniff the
// wire" capture can spot unmeshed bytes in cleartext while meshed bytes are TLS.
import path from 'node:path';
import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';

type Protocol = 'http' | 'grpc';

const NAME = process.env.CLIENT_NAME ?? 'client';
const PROTOCOL = ((process.env.PROTOCOL ?? 'grpc').toLowerCase() === 'http' ? 'http' : 'grpc') as Protocol;
const MESHED = (process.env.MESHED ?? 'false').toLowerCase() === 'true';
const MARKER = process.env.MARKER ?? NAME.toUpperCase().replace(/[^A-Z0-9]+/g, '_');
const HTTP_TARGET = process.env.HTTP_TARGET ?? 'http://http-server:8080';
const GRPC_TARGET = process.env.GRPC_TARGET ?? 'grpc-server:50051';
const CONFIG_URL = process.env.CONFIG_URL ?? '';
const REPORT_URL = process.env.REPORT_URL ?? '';
const PROTO_PATH = process.env.PROTO_PATH ?? path.join(process.cwd(), 'proto', 'echo.proto');

const TICK_MS = 100;
const TIMEOUT_MS = 5000;
const POLL_MS = 1000;

interface EchoResult {
  server: string;
  pod: string;
  version: string;
}

interface Outcome {
  client: string;
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

// --- live config, polled from the dashboard --------------------------------
let running = false;
let rps = 0;
let payloadBytes = 64;

async function pollConfig(): Promise<void> {
  if (!CONFIG_URL) {
    // Standalone fallback (no dashboard): just keep sending at a low rate.
    running = true;
    rps = 2;
    return;
  }
  try {
    const res = await fetch(CONFIG_URL);
    if (res.ok) {
      const c = (await res.json()) as { running?: boolean; rps?: number; payloadBytes?: number };
      running = !!c.running;
      rps = Math.max(0, Number(c.rps ?? 0));
      payloadBytes = Math.max(0, Number(c.payloadBytes ?? 64));
    }
  } catch {
    /* dashboard not reachable — hold the last known config */
  }
}

// --- reporting -------------------------------------------------------------
async function report(o: Outcome): Promise<void> {
  if (!REPORT_URL) return;
  try {
    await fetch(REPORT_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(o),
    });
  } catch {
    /* dashboard not reachable — drop this report, keep generating */
  }
}

// --- gRPC client (one reused connection → sticky without a mesh) -----------
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let grpcClient: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getGrpc(): any {
  if (grpcClient) return grpcClient;
  const def = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const proto = grpc.loadPackageDefinition(def) as any;
  grpcClient = new proto.echo.EchoService(GRPC_TARGET, grpc.credentials.createInsecure());
  return grpcClient;
}

function grpcEcho(seq: number, payload: string): Promise<EchoResult> {
  return new Promise((resolve, reject) => {
    getGrpc().Echo(
      { seq: String(seq), payload },
      { deadline: new Date(Date.now() + TIMEOUT_MS) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (err: grpc.ServiceError | null, res: any) => {
        if (err) return reject(err);
        resolve({ server: res.server ?? 'grpc-server', pod: res.pod ?? 'unknown', version: res.version ?? 'v1' });
      },
    );
  });
}

async function httpEcho(seq: number, payload: string): Promise<EchoResult> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${HTTP_TARGET}/echo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ seq, payload }),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = (await res.json()) as { server?: string; pod?: string; version?: string };
    return { server: d.server ?? 'http-server', pod: d.pod ?? 'unknown', version: d.version ?? 'v1' };
  } finally {
    clearTimeout(t);
  }
}

// --- send loop -------------------------------------------------------------
let seq = 0;
let acc = 0;
let inflight = 0;

function makePayload(s: number): string {
  const base = `${MARKER}:${s}`;
  return base + 'x'.repeat(Math.max(0, payloadBytes - base.length));
}

function grpcCode(e: unknown): string | null {
  if (e && typeof e === 'object' && 'code' in e) {
    const c = (e as grpc.ServiceError).code;
    return typeof c === 'number' && grpc.status[c] ? grpc.status[c] : String(c);
  }
  return null;
}

function errMessage(e: unknown): string {
  if (e && typeof e === 'object') {
    const se = e as grpc.ServiceError;
    if (se.details) return se.details;
    if ('message' in e) return String((e as { message: unknown }).message);
  }
  return String(e);
}

function fireOne(): void {
  const cap = Math.max(50, rps * 2);
  if (inflight >= cap) return;
  const s = ++seq;
  const started = Date.now();
  const payload = makePayload(s);
  inflight++;
  const call = PROTOCOL === 'http' ? httpEcho(s, payload) : grpcEcho(s, payload);
  call
    .then((r) =>
      report({
        client: NAME,
        protocol: PROTOCOL,
        meshed: MESHED,
        ok: true,
        ms: Date.now() - started,
        server: r.server,
        pod: r.pod,
        version: r.version,
        error: null,
        code: null,
      }),
    )
    .catch((e: unknown) =>
      report({
        client: NAME,
        protocol: PROTOCOL,
        meshed: MESHED,
        ok: false,
        ms: Date.now() - started,
        server: null,
        pod: null,
        version: null,
        error: errMessage(e),
        code: grpcCode(e),
      }),
    )
    .finally(() => {
      inflight--;
    });
}

function tick(): void {
  if (!running || rps <= 0) {
    acc = 0;
    return;
  }
  acc += rps * (TICK_MS / 1000);
  let n = Math.floor(acc);
  acc -= n;
  while (n-- > 0) fireOne();
}

const dest = PROTOCOL === 'http' ? HTTP_TARGET : GRPC_TARGET;
console.log(
  `[${NAME}] protocol=${PROTOCOL} meshed=${MESHED} → ${dest} marker="${MARKER}"; ` +
    `config←${CONFIG_URL || '(none)'} report→${REPORT_URL || '(none)'}`,
);
void pollConfig();
setInterval(() => void pollConfig(), POLL_MS);
setInterval(tick, TICK_MS);
