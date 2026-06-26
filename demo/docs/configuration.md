# Configuration

## Chart values

Set with `--set key=value` on `helm upgrade`, or edit
[`chart/values.yaml`](../chart/values.yaml).

### Demo workloads

| Value                     | Default            | Meaning                                       |
|---------------------------|--------------------|-----------------------------------------------|
| `mesh.enabled`            | `true`             | inject the Linkerd proxy into meshed workloads |
| `httpServer.replicas`     | `3`                | HTTP server pods                              |
| `grpcServer.replicas`     | `2`                | gRPC pods **per version** (v1 and v2)         |
| `canary.v1Weight`         | `90`               | GRPCRoute weight to v1                        |
| `canary.v2Weight`         | `10`               | GRPCRoute weight to v2                        |
| `dashboard.replicas`      | `1`                | keep at 1 (stats live in one process)        |
| `clients.enabled`         | `true`             | deploy the three traffic client pods         |
| `authorization.enabled`   | `false`            | require meshed identity for grpc-server      |
| `liveControls.enabled`    | `true`             | dashboard sniff + policy buttons (+ RBAC)    |
| `linkerd.namespace`       | `linkerd`          | control-plane ns (scrape config + identities)|
| `images.httpServer`       | `kcd-kl-2026-http-server:dev` | image                                   |
| `images.grpcServer`       | `kcd-kl-2026-grpc-server:dev` | image                                   |
| `images.dashboard`        | `kcd-kl-2026-dashboard:dev` | image                                     |
| `images.client`           | `kcd-kl-2026-client:dev` | unified client image (all three client pods) |
| `images.pullPolicy`       | `IfNotPresent`     | pull policy                                  |

There is no per-client rate value: each client polls the dashboard's `/api/config`
for its send rate, so the **Rate / client** slider (and Start/Stop) steer the
clients live.

### Subcharts

| Value                | Default | Meaning                                            |
|----------------------|---------|----------------------------------------------------|
| `prometheus.enabled` | `true`  | deploy Prometheus + the Linkerd scrape config      |
| `grafana.enabled`    | `true`  | deploy Grafana + the Prometheus datasource         |

Prometheus trims alertmanager, node-exporter and pushgateway, but **keeps
kube-state-metrics** (with `metricLabelsAllowlist: [deployments=[*], pods=[*]]`) —
the Linkerd dashboards' `$workload` variable resolves via `kube_deployment_labels`,
which KSM only emits when a label allowlist is set. The global scrape interval is
**15s** (`prometheus.server.global.scrape_interval`); a slower interval makes
`rate(metric[1m])` un-computable and blanks every rate-based panel. The Linkerd
scrape jobs live under `prometheus.extraScrapeConfigs`; if your control plane isn't
in the `linkerd` namespace, edit the `linkerd-proxy` keep-regex and the
`linkerd-controller` namespace list there. Grafana admin is `admin` / `admin`
(`grafana.adminPassword`).

### Access (Ingress)

| Value                         | Default                 | Meaning                                                         |
|-------------------------------|-------------------------|-----------------------------------------------------------------|
| `ingress.enabled`             | `true`                  | expose dashboard + Prometheus + Grafana via Traefik Ingress     |
| `ingress.className`           | `traefik`               | IngressClass (k3s ships Traefik)                                |
| `ingress.host`                | `localhost`             | suffix → `demo.<host>` / `prometheus.<host>` / `grafana.<host>` |
| `observability.prometheusUrl` | `http://localhost:9090` | Prometheus button URL when `ingress.enabled=false`              |
| `observability.grafanaUrl`    | `http://localhost:3001` | Grafana button URL when `ingress.enabled=false`                 |

With Ingress on, the dashboard's Prometheus/Grafana buttons point at
`http://prometheus.<host>` / `http://grafana.<host>`; the `observability.*` URLs
are the port-forward fallback used only when `ingress.enabled=false`. Needs the
k3d loadbalancer to publish host port 80 — see
[deployment.md](deployment.md#1--create-a-cluster).

## Environment variables

Set by the chart; listed here for reference / local runs.

### dashboard

| Var                | Meaning                                            |
|--------------------|----------------------------------------------------|
| `HTTP_TARGET`      | base URL of the HTTP server (reference only — the dashboard never calls it) |
| `GRPC_TARGET`      | host:port of the gRPC server (reference only — the dashboard never calls it) |
| `PORT`             | listen port (3000)                                 |
| `MESH_ENABLED`     | shows mTLS/canary cues in the UI                   |
| `HOSTNAME`         | pinned to `0.0.0.0` (Next bind address)            |
| `POD_NAMESPACE`    | downward API; used by the live controls            |
| `LINKERD_NAMESPACE`| control-plane ns for the policy identities         |
| `PROMETHEUS_URL`   | target of the dashboard's Prometheus button        |
| `GRAFANA_URL`      | target of the dashboard's Grafana button           |

### http-server / grpc-server

| Var           | Meaning                                  |
|---------------|------------------------------------------|
| `SERVER_NAME` | logical name reported in responses       |
| `VERSION`     | `v1` / `v2` — the canary dimension       |
| `PORT`        | listen port (8080 / 50051)               |

### client (the three traffic client pods)

| Var           | Meaning                                                |
|---------------|--------------------------------------------------------|
| `CLIENT_NAME` | client label (e.g. `client-grpc-meshed`)               |
| `PROTOCOL`    | `http` / `grpc` — which target to drive                |
| `MESHED`      | `true` / `false` — drives the UI card                  |
| `MARKER`      | unique payload marker for the sniff capture            |
| `HTTP_TARGET` | base URL of the HTTP server (used when `PROTOCOL=http`)|
| `GRPC_TARGET` | host:port of the gRPC server (used when `PROTOCOL=grpc`)|
| `CONFIG_URL`  | dashboard's `/api/config` endpoint (polled for rate)   |
| `REPORT_URL`  | dashboard's `/api/report` endpoint (each outcome)      |
| `PROTO_PATH`  | path to `echo.proto` (set in the image)                |

## The proto contract

`proto/echo.proto` is the single source of truth, vendored byte-for-byte into
`grpc-server/proto/`, `dashboard/proto/`, and `client/proto/`. Keep them in sync
when editing the contract.
