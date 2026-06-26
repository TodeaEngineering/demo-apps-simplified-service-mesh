# gRPC canary + mesh security demo, deployed with Helm. Run `make help`.
# Cluster + mesh setup is documented in docs/deployment.md.
NS      ?= todea
RELEASE ?= kcd-kl-2026
CLUSTER ?= traffic-demo
CHART   := ./chart
V1 ?= 50
V2 ?= 50

IMAGES := kcd-kl-2026-http-server:dev kcd-kl-2026-grpc-server:dev kcd-kl-2026-dashboard:dev kcd-kl-2026-client:dev

.PHONY: help images deps deploy urls ui prom grafana canary clean

help: ## List targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-9s\033[0m %s\n", $$1, $$2}'

images: ## Build the 4 images + import them (and netshoot, for wire capture)
	docker build -t kcd-kl-2026-http-server:dev ./http-server
	docker build -t kcd-kl-2026-grpc-server:dev ./grpc-server
	docker build -t kcd-kl-2026-dashboard:dev ./dashboard
	docker build -t kcd-kl-2026-client:dev ./client
	docker pull nicolaka/netshoot:v0.13
	k3d image import $(IMAGES) nicolaka/netshoot:v0.13 -c $(CLUSTER)

deps: ## Fetch + unpack the Prometheus/Grafana subcharts
	helm dependency update $(CHART)
	@cd $(CHART)/charts && for f in *.tgz; do [ -e "$$f" ] || continue; tar xzf "$$f"; rm -f "$$f"; done

deploy: deps ## Install/upgrade the Helm release (toggle: --set prometheus.enabled=false)
	# --force-conflicts: take back fields patched live (canary weights, authz policy)
	helm upgrade --install $(RELEASE) $(CHART) -n $(NS) --create-namespace --force-conflicts

urls: ## Ingress URLs (default access — no port-forward)
	@echo "  Dashboard   → http://demo.localhost"
	@echo "  Prometheus  → http://prometheus.localhost"
	@echo "  Grafana     → http://grafana.localhost  (admin/admin)"

ui: ## Port-forward fallback: dashboard → http://localhost:3000
	kubectl -n $(NS) port-forward deploy/dashboard 3000:3000

prom: ## Port-forward fallback: Prometheus → http://localhost:9090
	kubectl -n $(NS) port-forward svc/$(RELEASE)-prometheus-server 9090:80

grafana: ## Port-forward fallback: Grafana → http://localhost:3001 (admin/admin)
	kubectl -n $(NS) port-forward svc/$(RELEASE)-grafana 3001:80

canary: ## Shift the gRPC canary, e.g. make canary V1=90 V2=10
	kubectl -n $(NS) patch grpcroute grpc-server-canary --type=json \
	  -p '[{"op":"replace","path":"/spec/rules/0/backendRefs/0/weight","value":$(V1)},{"op":"replace","path":"/spec/rules/0/backendRefs/1/weight","value":$(V2)}]'

clean: ## Uninstall the release
	helm uninstall $(RELEASE) -n $(NS)
