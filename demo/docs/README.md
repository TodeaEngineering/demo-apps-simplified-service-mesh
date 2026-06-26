# Apps Simplified: Use a Mesh from Day 0 — live demo

Self-contained Kubernetes Helm chart showing what a service mesh gives a gRPC app from day one: live canary routing via Gateway API, automatic mTLS, identity-based authorization, and zero-instrumentation golden-metrics observability, built on Linkerd. Companion demo for the KCD talk "Apps Simplified: Use a Mesh from Day 0."

# Documentation

- [architecture.md](architecture.md) — components, request flow, the gRPC canary,
  mesh integration, dashboard internals, and observability.
- [deployment.md](deployment.md) — cluster, mesh install (OSS or BEL), images,
  Helm install, access, and teardown.
- [showcases.md](showcases.md) — running the canary, authorization, encryption,
  and metrics demos.
- [configuration.md](configuration.md) — every chart value and environment variable.
- [development.md](development.md) — project layout, local UI dev, and builds.

Start with the project [README](../README.md) for an overview and quick start.
