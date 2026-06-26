# Development

## Project layout

```
demo/
├── proto/echo.proto          # shared gRPC contract (vendored into the consumers)
├── http-server/              # TS HTTP echo server (Node stdlib, zero deps)
├── grpc-server/              # TS gRPC echo server (src/index.ts)
├── client/                   # TS unified HTTP/gRPC traffic client (one image, three pods)
├── dashboard/                # Next.js observer UI + aggregator (no traffic)
│   └── src/
│       ├── app/              # routes + /api (config, control, stats, report, canary, policy, sniff, obs, health)
│       ├── components/       # Dashboard, TrafficTopology, ProtocolCard, MeshSecurityPanel, LiveControls, …
│       └── lib/              # engine, cluster, canary, policy, sniff, format, types
├── chart/                    # umbrella Helm chart (+ prometheus/grafana subcharts)
├── docs/                     # this documentation
└── Makefile
```

## Local UI development (no cluster)

You can iterate on the dashboard without Kubernetes. The dashboard generates no
traffic itself, so to see it populate you also run a client pointed at it. Run the
processes in separate terminals:

```bash
# terminal 1
cd http-server && npm install && PORT=8080 npm start
# terminal 2
cd grpc-server && npm install && PORT=50051 npm start
# terminal 3 — the dashboard (observer + steering)
cd dashboard && npm install && MESH_ENABLED=false npm run dev
# terminal 4 — a client, steered by the dashboard
cd client && npm install \
  && CLIENT_NAME=client-http PROTOCOL=http MESHED=true \
     HTTP_TARGET=http://localhost:8080 GRPC_TARGET=localhost:50051 \
     CONFIG_URL=http://localhost:3000/api/config \
     REPORT_URL=http://localhost:3000/api/report npm start
```

Open http://localhost:3000 and press **Start traffic** so the client begins
sending. Notes for local mode:

- There's a single gRPC server, so the **canary** (v1/v2 split) doesn't populate —
  that's a cluster feature. The **Mesh & security** panel only shows the clients
  you actually run; add more client terminals (e.g. `PROTOCOL=grpc`) to fill it.
- The **live controls** (sniff + policy) show "in-cluster only" and disable,
  since there's no Kubernetes API to talk to.

> If port 8080 is taken (e.g. a stray `kubectl port-forward`), use another port
> and point `HTTP_TARGET` at it.

## Build

```bash
# typecheck the servers and the client
cd grpc-server && npm run typecheck
cd http-server && npm run typecheck
cd client && npm run typecheck
# production build of the dashboard (also typechecks the whole app)
cd dashboard && npm run build
```

## Images

`make images` builds all four and imports them into the k3d cluster. The server
and client images run TypeScript directly with `tsx` (no build step); the
dashboard is a Next.js standalone build with `kubectl` added for the live
controls.

## The aggregation engine

`dashboard/src/lib/engine.ts` is a server-side singleton (stored on `globalThis`).
It holds the live steering config the clients poll (running / rps / payload), the
rolling windows (latency percentiles, per-second buckets for the chart), the
request log, per-protocol version/pod distributions, and the outcomes ingested
from the clients. It generates no traffic — the client pods do, polling
`GET /api/config` for their rate and `POST`ing each result to `/api/report`. The
dashboard UI is a thin client that polls `GET /api/stats` and renders the snapshot.

## Conventions

- TypeScript everywhere; the dashboard mirrors the todea.co.kr design system
  (Sora font, black/neutral palette, `rounded-full` controls).
- Server-only modules (`engine`, `cluster`, `policy`, `sniff`) must never be
  imported by client components — only by `/api` route handlers. Client
  components import **types** from `lib/types.ts` only.
