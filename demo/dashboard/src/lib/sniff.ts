// Capture the wire on a client pod and prove plaintext vs encrypted.
//
// Targets either the unmeshed or the meshed gRPC client pod (the user's choice)
// and runs an ephemeral tcpdump on its eth0 (kubectl debug, netadmin profile for
// CAP_NET_RAW; ephemeral containers share the pod's network namespace):
//
//   unmeshed pod → its gRPC payload is cleartext, the marker is readable
//   meshed   pod → its gRPC payload is mTLS, no marker in cleartext
//
// Server-only.
import { kubectl, getNamespace } from './cluster';
import type { SniffResult, SniffTarget } from './types';

const NETSHOOT = process.env.SNIFF_IMAGE ?? 'nicolaka/netshoot:v0.13';

// The unmeshed app talks straight to the server on 50051 (plaintext). A meshed
// pod's app traffic is hijacked to its local proxy, which carries the mTLS
// connection on Linkerd's proxy port (4143) — so we capture both ports.
const APP_PORT = '50051';
const PROXY_PORT = process.env.LINKERD_PROXY_PORT ?? '4143';

const TARGETS: Record<SniffTarget, { selector: string; marker: string }> = {
  unmeshed: { selector: 'app=client-grpc-unmeshed', marker: 'PLAINTEXT_UNMESHED' },
  meshed: { selector: 'app=client-grpc-meshed', marker: 'MESHED_ENCRYPTED' },
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function ecTerminated(pod: string, ec: string, ns: string): Promise<boolean> {
  const r = await kubectl(
    [
      'get', 'pod', pod, '-n', ns, '-o',
      `jsonpath={.status.ephemeralContainerStatuses[?(@.name=="${ec}")].state.terminated.exitCode}`,
    ],
    { timeoutMs: 8000 },
  );
  return r.ok && r.stdout.trim() !== '';
}

export async function runSniff(target: SniffTarget, seconds = 8): Promise<SniffResult> {
  const ns = getNamespace();
  const { selector, marker } = TARGETS[target];

  const podsR = await kubectl(
    ['get', 'pod', '-l', selector, '-n', ns, '-o', 'jsonpath={.items[*].metadata.name}'],
    { timeoutMs: 8000 },
  );
  const pods = podsR.stdout.trim().split(/\s+/).filter(Boolean);
  if (pods.length === 0) {
    return base(target, seconds, { error: `no ${target} client pod found. Is the demo deployed?` });
  }

  const ec = `sniff-${Date.now().toString(36)}`;
  const launches = await Promise.all(
    pods.map((p) =>
      kubectl(
        [
          'debug', p, '-n', ns, '--image', NETSHOOT, '--profile', 'netadmin', '-c', ec, '--attach=false', '--',
          'timeout', String(seconds), 'tcpdump', '-i', 'eth0', '-A', '-n', '-s0',
          'tcp', 'port', APP_PORT, 'or', 'tcp', 'port', PROXY_PORT,
        ],
        { timeoutMs: 30000 },
      ),
    ),
  );
  const launchErr = launches.find((r) => !r.ok);

  const deadline = Date.now() + (seconds + 40) * 1000;
  const pending = new Set(pods);
  while (pending.size > 0 && Date.now() < deadline) {
    await sleep(1500);
    for (const p of [...pending]) {
      if (await ecTerminated(p, ec, ns)) pending.delete(p);
    }
  }

  const lines: string[] = [];
  let hits = 0;
  let hitPod: string | null = null;
  for (const p of pods) {
    const logR = await kubectl(['logs', p, '-c', ec, '-n', ns], { timeoutMs: 15000 });
    const raw = logR.stdout.split('\n');
    const matched = raw.filter((l) => l.includes(marker));
    if (matched.length > 0 && !hitPod) hitPod = p;
    hits += matched.length;
    lines.push(...raw);
  }

  // The full capture, untrimmed — non-printable bytes rendered as '.' like tcpdump.
  const capture = lines
    .map((l) => l.replace(/[^\x20-\x7e]/g, '.').replace(/\s+$/, ''))
    .filter((l) => l.trim().length > 0);

  const result = base(target, seconds, { pod: hitPod ?? pods[0], hits, plaintext: hits > 0, capture });
  if (capture.length === 0) {
    result.error = launchErr
      ? `capture failed to start: ${(launchErr.stderr.split('\n')[0] || '').slice(0, 180)}`
      : pending.size > 0
        ? 'capture timed out (image still pulling?). Try again in a moment.'
        : 'nothing captured. Check the probe clients are Running.';
  }
  return result;
}

function base(target: SniffTarget, seconds: number, over: Partial<SniffResult>): SniffResult {
  return {
    available: true,
    target,
    pod: null,
    seconds,
    hits: 0,
    plaintext: false,
    capture: [],
    ...over,
  };
}
