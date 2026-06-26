// Tiny HTTP echo server — Node standard library only, no dependencies.
//
// The mirror image of the gRPC server: same job, different transport. Every
// response is stamped with the instance's identity (logical name + pod/host)
// so the dashboard can show which replica answered. Because plain HTTP/1.1
// opens a fresh connection per request, traffic naturally fans out across
// replicas — the visible contrast to gRPC's sticky HTTP/2 connections.
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { hostname } from 'node:os';

const PORT = Number(process.env.PORT ?? 8080);
const SERVER_NAME = process.env.SERVER_NAME ?? 'http-server';
const VERSION = process.env.VERSION ?? 'v1';
const POD = process.env.HOSTNAME ?? hostname();

function send(res: ServerResponse, code: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
    'X-Server': SERVER_NAME,
    'X-Pod': POD,
    'X-Version': VERSION,
  });
  res.end(body);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

  if (url.pathname === '/healthz') {
    return send(res, 200, { status: 'ok' });
  }

  // GET or POST /echo (and "/") both identify the instance. POST bodies are
  // measured so the generator can vary payload size symmetrically with gRPC.
  let bytes = 0;
  let seq: string | null = url.searchParams.get('seq');
  if (req.method === 'POST') {
    const raw = await readBody(req);
    bytes = Buffer.byteLength(raw);
    try {
      const parsed = JSON.parse(raw || '{}');
      if (parsed.seq != null) seq = String(parsed.seq);
      if (typeof parsed.payload === 'string') bytes = Buffer.byteLength(parsed.payload);
    } catch {
      /* non-JSON body — just report its raw size */
    }
  }

  send(res, 200, { protocol: 'http', server: SERVER_NAME, pod: POD, seq, bytes, version: VERSION });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[${SERVER_NAME}/${VERSION}] HTTP listening on :${PORT} (pod ${POD})`);
});

function shutdown(signal: string) {
  console.log(`[${SERVER_NAME}] ${signal} — shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
