// Apply / remove the gRPC authorization policy live (the "before & after"
// showcase). These are the same resources as chart/templates/authorization.yaml
// — keep them in sync. Server-only.
import { kubectl, getNamespace, LINKERD_NAMESPACE } from './cluster';
import type { PolicyResource, PolicyState } from './types';

// The three manifests that enforce the policy, each with a one-line note on how
// it shapes the traffic. This is the single source of truth: the YAML we apply is
// just these joined, and the dashboard shows the same list when enforced.
function policyResources(ns: string, linkerdNs: string): PolicyResource[] {
  return [
    {
      kind: 'Server',
      name: 'grpc-server',
      summary:
        "Puts grpc-server's gRPC port under Linkerd policy. The moment a Server selects a port it becomes deny-by-default — nothing reaches it until an AuthorizationPolicy allows it.",
      yaml: `apiVersion: policy.linkerd.io/v1beta3
kind: Server
metadata:
  name: grpc-server
  namespace: ${ns}
spec:
  podSelector:
    matchLabels: { app: grpc-server }
  port: grpc
  proxyProtocol: gRPC`,
    },
    {
      kind: 'MeshTLSAuthentication',
      name: 'meshed-identities',
      summary:
        "Defines who counts as an allowed caller: any workload presenting a meshed mTLS identity from this namespace. The unmeshed client has no identity, so it can never match.",
      yaml: `apiVersion: policy.linkerd.io/v1alpha1
kind: MeshTLSAuthentication
metadata:
  name: meshed-identities
  namespace: ${ns}
spec:
  identities:
    - "*.${ns}.serviceaccount.identity.${linkerdNs}.cluster.local"`,
    },
    {
      kind: 'AuthorizationPolicy',
      name: 'grpc-server-require-identity',
      summary:
        'Ties the two together: traffic to the Server is authorized only if it satisfies the MeshTLSAuthentication. Meshed callers pass; the unmeshed client is rejected with PERMISSION_DENIED.',
      yaml: `apiVersion: policy.linkerd.io/v1alpha1
kind: AuthorizationPolicy
metadata:
  name: grpc-server-require-identity
  namespace: ${ns}
spec:
  targetRef:
    group: policy.linkerd.io
    kind: Server
    name: grpc-server
  requiredAuthenticationRefs:
    - group: policy.linkerd.io
      kind: MeshTLSAuthentication
      name: meshed-identities`,
    },
  ];
}

function policyYaml(ns: string, linkerdNs: string): string {
  return policyResources(ns, linkerdNs)
    .map((r) => r.yaml)
    .join('\n---\n') + '\n';
}

export async function applyPolicy(): Promise<{ ok: boolean; message: string }> {
  const ns = getNamespace();
  const r = await kubectl(['apply', '-f', '-'], { input: policyYaml(ns, LINKERD_NAMESPACE), timeoutMs: 20000 });
  return { ok: r.ok, message: (r.ok ? r.stdout : r.stderr).trim() };
}

export async function removePolicy(): Promise<{ ok: boolean; message: string }> {
  const ns = getNamespace();
  const r = await kubectl(['delete', '-f', '-', '--ignore-not-found'], {
    input: policyYaml(ns, LINKERD_NAMESPACE),
    timeoutMs: 20000,
  });
  return { ok: r.ok, message: (r.ok ? r.stdout : r.stderr).trim() };
}

export async function policyEnabled(): Promise<boolean> {
  const ns = getNamespace();
  const r = await kubectl(
    ['get', 'authorizationpolicy', 'grpc-server-require-identity', '-n', ns, '-o', 'name'],
    { timeoutMs: 8000 },
  );
  return r.ok && r.stdout.trim().length > 0;
}

export async function policyState(available: boolean): Promise<PolicyState> {
  const resources = policyResources(getNamespace(), LINKERD_NAMESPACE);
  if (!available) return { available: false, enabled: false, resources };
  return { available: true, enabled: await policyEnabled(), resources };
}
