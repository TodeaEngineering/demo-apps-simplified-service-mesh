# Deployment

The demo runs on Kubernetes (k3d locally) and is installed with Helm. Cluster
creation and the Linkerd install are one-time manual steps; everything else is
`make`.

## Prerequisites

On your `$PATH`: [`k3d`](https://k3d.io), `kubectl`, `helm` (v3.13+ or v4),
`docker`, and [`linkerd`](https://linkerd.io) (the install below fetches the CLI
if you don't have it).

## 1 · Create a cluster

Publish host port 80 on the k3d loadbalancer so the Ingress (step 5) is reachable
without `kubectl port-forward`:

```bash
k3d cluster create traffic-demo --agents 2 -p "80:80@loadbalancer" --wait
```

> Already have a cluster without it? Add the port to its loadbalancer in place
> (recreates only the small serverlb container):
> `k3d cluster edit traffic-demo --port-add "80:80@loadbalancer"`.
>
> The Makefile's `CLUSTER` defaults to `traffic-demo`; override with
> `make images CLUSTER=my-cluster` if you name it differently.

## 2 · Install the mesh

Gateway API CRDs (for `GRPCRoute`) + Linkerd:

```bash
# Gateway API standard channel (includes GRPCRoute)
kubectl apply -f https://github.com/kubernetes-sigs/gateway-api/releases/download/v1.2.0/standard-install.yaml

# Linkerd CLI (open source)
curl -sfL https://run.linkerd.io/install | sh
export PATH="$HOME/.linkerd2/bin:$PATH"

# CRDs + control plane
linkerd install --crds | kubectl apply -f -
linkerd install | kubectl apply -f -
linkerd check
```

### Buoyant Enterprise for Linkerd (optional)

For BEL instead of OSS — free trial at
<https://enterprise.buoyant.io/start_trial>:

```bash
cp settings.sh.example settings.sh    # paste API_CLIENT_ID / SECRET / BUOYANT_LICENSE
source settings.sh
curl -sL https://enterprise.buoyant.io/install | sh
export PATH="$HOME/.linkerd2/bin:$PATH"
linkerd install --crds | kubectl apply -f -
linkerd install | kubectl apply -f -
```

The chart's `Server` / `AuthorizationPolicy` / `GRPCRoute` resources are
identical for OSS and BEL.

## 3 · Build + import the images

```bash
make images
```

Builds the four images — `kcd-kl-2026-http-server`, `kcd-kl-2026-grpc-server`,
`kcd-kl-2026-dashboard`, `kcd-kl-2026-client` (all `:dev`) — and imports them into the k3d
cluster. The manifests use `imagePullPolicy: IfNotPresent`, so no registry is
needed.

## 4 · Deploy the Helm release

```bash
make deploy
```

This runs `helm dependency update` (and unpacks the Prometheus/Grafana
subcharts — required by Helm 4), then `helm upgrade --install kcd-kl-2026 ./chart -n
todea --create-namespace`.

Toggle the observability subcharts:

```bash
# both off
helm upgrade --install kcd-kl-2026 ./chart -n todea --create-namespace \
  --set prometheus.enabled=false --set grafana.enabled=false
# just grafana off
helm upgrade kcd-kl-2026 ./chart -n todea --reuse-values --set grafana.enabled=false
```

See [configuration.md](configuration.md) for all values.

## 5 · Access

The chart ships a Traefik Ingress (`ingress.enabled=true`), so everything is on
`*.localhost` — no port-forward. Chrome and Firefox resolve `*.localhost` to
127.0.0.1 automatically, so there's nothing to add to `/etc/hosts`:

```text
Dashboard   → http://demo.localhost
Prometheus  → http://prometheus.localhost
Grafana     → http://grafana.localhost   (admin / admin)
```

`make urls` prints these. Change the suffix with `--set ingress.host=…` (e.g. a
`nip.io` host to share off-box), or disable Ingress with
`--set ingress.enabled=false` and fall back to port-forward:

```bash
make ui        # dashboard   → http://localhost:3000
make prom      # Prometheus  → http://localhost:9090
make grafana   # Grafana     → http://localhost:3001  (admin / admin)
```

Open the dashboard, press **Start traffic**, and drive the showcases — see
[showcases.md](showcases.md).

## Teardown

```bash
make clean                       # helm uninstall the release
k3d cluster delete traffic-demo  # delete the whole cluster
```

## Notes

- **Helm 4** needs the subcharts unpacked under `chart/charts/`; `make deps`
  (run by `make deploy`) handles that. `Chart.lock` pins the versions.
- **Live controls** (sniff + policy buttons) require `liveControls.enabled`
  (default true), which grants the dashboard's ServiceAccount RBAC to debug
  grpc-server pods and manage `policy.linkerd.io` resources, and bakes `kubectl`
  into its image. Set `--set liveControls.enabled=false` to drop that.
- **k3d on Apple Silicon** builds arm64 images; the dashboard's `kubectl` is
  fetched for the build arch automatically (`TARGETARCH`).
