# Showcases

Open the dashboard (http://demo.localhost) and press **Start
traffic**. The gRPC card splits across v1/v2 and the Mesh & security panel fills
in as the client pods report.

## 1 · gRPC canary

Shift the GRPCRoute weights live:

```bash
make canary V1=90 V2=10     # 90% v1, 10% v2
make canary V1=50 V2=50     # even split
make canary V1=0  V2=100    # full cutover to v2
```

What to point out:

- The gRPC card's **Canary · version split** bar moves within a second or two.
- In the **Mesh & security** panel, `client-grpc-meshed`'s "version reached"
  follows the weights; `client-grpc-unmeshed` stays **v1 only** — it has no proxy,
  so it ignores the route and pins to the parent Service.

> `make canary` patches the live `GRPCRoute`. For a persistent change, redeploy
> with `--set canary.v1Weight=50 --set canary.v2Weight=50`.

## 2 · Authorization (before / after)

Click **Enforce authorization** in the dashboard's *Live controls* (or set
`authorization.enabled=true` via `helm upgrade`). It applies a `Server` +
`AuthorizationPolicy` + `MeshTLSAuthentication` so only meshed identities may
reach `grpc-server`.

What to point out:

- `client-grpc-unmeshed`'s card flips to a red **Denied · PERMISSION_DENIED**
  within a few seconds; `client-grpc-meshed` stays green/Authorized.
- Click **Remove policy** to revert and watch `client-grpc-unmeshed` recover.

The punchline: don't just *observe* that unmeshed traffic is insecure — make it
**impossible** for it to connect.

## 3 · Encryption — plaintext vs mTLS

Pick a target (**Unmeshed** = `client-grpc-unmeshed`, or **Meshed** =
`client-grpc-meshed`) and click **Sniff the wire** in *Live controls*. It attaches
an ephemeral `tcpdump` container to that client pod (via `kubectl debug`,
`netadmin` profile) and captures `eth0` for ~8 seconds, then shows the **full
capture** inline:

- **Unmeshed** → its gRPC payload is cleartext; the `PLAINTEXT_UNMESHED` marker is
  readable on the wire (along with the server's response identity).
- **Meshed** → its gRPC payload is mTLS; no marker appears in cleartext.

Each gRPC client sends a unique marker in its payload (`PLAINTEXT_UNMESHED` /
`MESHED_ENCRYPTED`), so the capture proves which side is readable.

> Run **Remove policy** first if authorization is enforced, so
> `client-grpc-unmeshed` can still send packets to capture.

## 4 · Observability

With the Prometheus + Grafana subcharts enabled, the dashboard's *Live controls*
shows **Prometheus** and **Grafana** buttons that open them in a new tab — served
by the Ingress at `http://prometheus.localhost` and `http://grafana.localhost`
(both appear disabled when a subchart is off).

In Prometheus, try these queries (proxy golden metrics, scraped straight from the
data plane):

```promql
# request rate by deployment
sum(rate(request_total{direction="outbound"}[1m])) by (deployment)
# success rate
sum(rate(response_total{classification="success"}[1m])) by (dst_deployment)
  / sum(rate(response_total[1m])) by (dst_deployment)
# mTLS'd traffic
sum(rate(request_total{tls="true"}[1m])) by (deployment)
```

Open **Grafana** at `http://grafana.localhost` (admin/admin) — the Prometheus
datasource is pre-wired and two dashboards are auto-loaded from
`chart/dashboards/` (staged as ConfigMaps, imported by the Grafana sidecar):

- **Todea · Linkerd** — a custom dashboard (no online dependency) covering both
  planes, organized in rows. Overview KPIs (request rate / success / p95 / mTLS
  coverage / control-plane up / issuer-cert TTL); then **data-plane** rows — HTTP,
  gRPC with the v1/v2 canary split, authorization allow-vs-deny + traffic-by-mTLS-
  identity, connections + a latency heatmap; then collapsible **control-plane**
  rows — component health, cert TTLs, controller gRPC + API-server traffic,
  destination discovery, and per-component CPU/memory/goroutines. The data-plane
  diagrams are scopeable with the **Namespace / Workload / Pod** dropdowns
  (default *All*) — narrow to one workload or drill into a single pod.
- **Linkerd Control Plane** — the upstream control-plane deep-dive (grafana.com
  24984), kept alongside for reference.

Point out that these metrics come from the **proxies** with zero app
instrumentation — see [architecture.md](architecture.md#observability).

## Suggested live flow

1. Start traffic → show HTTP fanning across 3 pods, gRPC pinned (one pod) while
   the canary splits versions.
2. `make canary V1=50 V2=50` → versions rebalance live.
3. **Sniff the wire** → unmeshed plaintext, meshed encrypted.
4. **Enforce authorization** → unmeshed denied; **Remove policy** → recovers.
5. `make prom` → golden metrics from the proxies.
