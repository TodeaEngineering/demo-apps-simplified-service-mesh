// Thin wrapper around the kubectl binary baked into the image. Used by the live
// controls (sniff + policy toggle) to act on the cluster from the dashboard.
// Server-only — never import from a client component.
import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';

const NS_FILE = '/var/run/secrets/kubernetes.io/serviceaccount/namespace';

export function getNamespace(): string {
  if (process.env.POD_NAMESPACE) return process.env.POD_NAMESPACE;
  try {
    return readFileSync(NS_FILE, 'utf8').trim() || 'todea';
  } catch {
    return 'todea';
  }
}

export const LINKERD_NAMESPACE = process.env.LINKERD_NAMESPACE ?? 'linkerd';

export interface ExecResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

export function kubectl(
  args: string[],
  opts: { input?: string; timeoutMs?: number } = {},
): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = execFile(
      'kubectl',
      args,
      { timeout: opts.timeoutMs ?? 30000, maxBuffer: 16 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === 'number'
            ? ((err as { code: number }).code)
            : err
              ? 1
              : 0;
        resolve({ ok: !err, code, stdout: stdout ?? '', stderr: stderr ?? '' });
      },
    );
    if (opts.input && child.stdin) {
      child.stdin.write(opts.input);
      child.stdin.end();
    }
  });
}

let cached: boolean | null = null;

// We can drive the cluster when running inside a pod (the API host env is set)
// and the kubectl binary is present.
export async function clusterAvailable(): Promise<boolean> {
  if (cached !== null) return cached;
  if (!process.env.KUBERNETES_SERVICE_HOST) {
    cached = false;
    return cached;
  }
  const r = await kubectl(['version', '--client', '-o', 'yaml'], { timeoutMs: 5000 });
  cached = r.ok;
  return cached;
}
