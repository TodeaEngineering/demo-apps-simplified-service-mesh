// Read / shift the gRPC canary by patching the GRPCRoute weights — the same
// thing `make canary` does, driven from the dashboard's Canary slider. The
// meshed gRPC client is in the mesh, so its traffic follows the new split
// immediately. Server-only.
import { kubectl, getNamespace } from './cluster';

const ROUTE = 'grpc-server-canary';

export interface CanaryWeights {
  v1: number;
  v2: number;
}

export async function getCanary(): Promise<CanaryWeights | null> {
  const ns = getNamespace();
  const r = await kubectl(
    [
      'get', 'grpcroute', ROUTE, '-n', ns, '-o',
      'jsonpath={.spec.rules[0].backendRefs[0].weight} {.spec.rules[0].backendRefs[1].weight}',
    ],
    { timeoutMs: 8000 },
  );
  if (!r.ok) return null;
  const [v1, v2] = r.stdout.trim().split(/\s+/).map(Number);
  if (Number.isNaN(v1) || Number.isNaN(v2)) return null;
  return { v1, v2 };
}

export async function setCanary(v1: number, v2: number): Promise<{ ok: boolean; message: string }> {
  const ns = getNamespace();
  const patch = JSON.stringify([
    { op: 'replace', path: '/spec/rules/0/backendRefs/0/weight', value: v1 },
    { op: 'replace', path: '/spec/rules/0/backendRefs/1/weight', value: v2 },
  ]);
  const r = await kubectl(['patch', 'grpcroute', ROUTE, '-n', ns, '--type=json', '-p', patch], {
    timeoutMs: 10000,
  });
  return { ok: r.ok, message: (r.ok ? r.stdout : r.stderr).trim() };
}
