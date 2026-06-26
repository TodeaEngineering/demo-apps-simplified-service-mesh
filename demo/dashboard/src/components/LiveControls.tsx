'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import type { ObsState, PolicyResource, PolicyState, SniffResult, SniffTarget } from '@/lib/types';

const EMPTY_OBS: ObsState = { prometheus: { enabled: false, url: '' }, grafana: { enabled: false, url: '' } };

export default function LiveControls() {
  const [policy, setPolicy] = useState<PolicyState>({ available: false, enabled: false, resources: [] });
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyErr, setPolicyErr] = useState<string | null>(null);

  const [target, setTarget] = useState<SniffTarget>('unmeshed');
  const [sniffBusy, setSniffBusy] = useState(false);
  const [sniff, setSniff] = useState<SniffResult | null>(null);

  const [obs, setObs] = useState<ObsState>(EMPTY_OBS);

  useEffect(() => {
    fetch('/api/policy', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setPolicy(d as PolicyState))
      .catch(() => {});
    fetch('/api/obs', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setObs(d as ObsState))
      .catch(() => {});
  }, []);

  const togglePolicy = useCallback(async () => {
    setPolicyBusy(true);
    setPolicyErr(null);
    try {
      const action = policy.enabled ? 'remove' : 'apply';
      const res = await fetch('/api/policy', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json()) as PolicyState & { error?: string };
      if (!res.ok) setPolicyErr(data.error ?? 'failed');
      else setPolicy({ available: data.available, enabled: data.enabled, resources: data.resources ?? [] });
    } catch {
      setPolicyErr('request failed');
    } finally {
      setPolicyBusy(false);
    }
  }, [policy.enabled]);

  const runSniff = useCallback(async () => {
    setSniffBusy(true);
    setSniff(null);
    try {
      const res = await fetch('/api/sniff', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ seconds: 8, target }),
      });
      setSniff((await res.json()) as SniffResult);
    } catch {
      setSniff({ available: true, target, pod: null, seconds: 0, hits: 0, plaintext: false, capture: [], error: 'request failed' });
    } finally {
      setSniffBusy(false);
    }
  }, [target]);

  const available = policy.available;

  return (
    <div className="border border-neutral-200 rounded-2xl px-6 sm:px-7 bg-white mb-5">
      <div className="flex items-center justify-between py-5 border-b border-neutral-100">
        <p className="text-[10px] font-semibold tracking-[.18em] uppercase text-neutral-500">Live controls</p>
        {!available && <span className="text-[11px] font-medium text-neutral-400">in-cluster only</span>}
      </div>

      <div className="divide-y divide-neutral-100">
        {/* Policy — a state you toggle */}
        <Row
          title="Authorization policy"
          scope="grpc-server"
          desc="Require a meshed mTLS identity to reach gRPC. Unmeshed callers are rejected."
          control={<Toggle on={policy.enabled} busy={policyBusy} disabled={!available} onToggle={togglePolicy} />}
          extra={
            <>
              {policyErr && <p className="text-[12px] text-red-600 mt-3 font-mono break-words">{policyErr}</p>}
              {policy.enabled && policy.resources.length > 0 && <PolicyResources resources={policy.resources} />}
            </>
          }
        />

        {/* Wire capture — a one-shot action; its result sits right below */}
        <Row
          title="Wire capture"
          scope={target === 'meshed' ? 'client-grpc-meshed' : 'client-grpc-unmeshed'}
          desc={
            <>
              tcpdump the pod&apos;s <span className="font-mono text-neutral-600">eth0</span> for ~8s and read the
              gRPC payload off the wire: cleartext when unmeshed, mTLS when meshed.
            </>
          }
          control={
            <div className="flex items-center gap-2.5">
              <Segmented value={target} onChange={setTarget} disabled={!available || sniffBusy} />
              <button
                type="button"
                onClick={runSniff}
                disabled={!available || sniffBusy}
                className="inline-flex items-center gap-2 text-[13px] font-semibold bg-brand text-white px-4 py-2 rounded-full hover:opacity-80 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sniffBusy ? (
                  <>
                    <Spinner /> Capturing…
                  </>
                ) : (
                  'Sniff'
                )}
              </button>
            </div>
          }
          extra={
            <>
              {sniff && !sniff.error && <SniffReport sniff={sniff} />}
              {sniff?.error && <p className="text-[13px] text-red-600 font-mono break-words mt-4">{sniff.error}</p>}
            </>
          }
        />

        {/* Dashboards — external links */}
        <Row
          title="Dashboards"
          desc="Linkerd proxy + control-plane golden metrics, scraped by Prometheus. Opens in a new tab."
          control={
            <div className="flex gap-3">
              <ObsButton label="Prometheus" link={obs.prometheus} />
              <ObsButton label="Grafana" link={obs.grafana} />
            </div>
          }
        />
      </div>
    </div>
  );
}

function Row({
  title,
  scope,
  desc,
  control,
  extra,
}: {
  title: string;
  scope?: string;
  desc: ReactNode;
  control: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <div className="py-5 sm:py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="max-w-[460px]">
          <div className="flex items-center gap-2.5">
            <p className="text-[15px] font-semibold tracking-tight">{title}</p>
            {scope && <ScopeChip>{scope}</ScopeChip>}
          </div>
          <p className="text-[13px] text-neutral-500 font-light leading-relaxed mt-1">{desc}</p>
        </div>
        <div className="shrink-0">{control}</div>
      </div>
      {extra}
    </div>
  );
}

function ScopeChip({ children }: { children: ReactNode }) {
  return (
    <span className="text-[10.5px] font-mono text-neutral-500 bg-neutral-100 rounded px-1.5 py-0.5 shrink-0">
      {children}
    </span>
  );
}

function PolicyResources({ resources }: { resources: PolicyResource[] }) {
  return (
    <div className="mt-6 border-t border-neutral-100 pt-5">
      <p className="text-[11px] font-semibold tracking-[.16em] uppercase text-neutral-400 mb-1">In effect</p>
      <p className="text-[12.5px] text-neutral-500 font-light leading-relaxed mb-4">
        {resources.length} resources installed on grpc-server&apos;s proxy — together they gate every request.
      </p>
      <div className="space-y-5">
        {resources.map((r) => (
          <div key={r.name}>
            <div className="flex items-center gap-2 flex-wrap mb-1.5">
              <span className="text-[11px] font-mono font-semibold text-neutral-700 bg-neutral-100 rounded px-2 py-0.5">
                {r.kind}
              </span>
              <span className="text-[12.5px] font-mono text-neutral-500">{r.name}</span>
            </div>
            <p className="text-[13px] text-neutral-500 font-light leading-relaxed mb-2.5 max-w-[640px]">{r.summary}</p>
            <pre className="bg-ink text-neutral-200 rounded-lg p-4 text-[11.5px] leading-relaxed font-mono overflow-auto scroll-thin whitespace-pre">
              {r.yaml}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  on,
  busy,
  disabled,
  onToggle,
}: {
  on: boolean;
  busy: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      disabled={disabled || busy}
      className="inline-flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed group"
    >
      <span className={`text-[13px] font-semibold w-[66px] text-right ${on ? 'text-black' : 'text-neutral-400'}`}>
        {busy ? 'Applying…' : on ? 'Enforced' : 'Off'}
      </span>
      <span
        className={`relative inline-block w-11 h-6 rounded-full transition-colors ${
          on ? 'bg-black' : 'bg-neutral-200 group-hover:bg-neutral-300'
        }`}
      >
        <span
          className={`absolute top-[3px] left-[3px] w-[18px] h-[18px] rounded-full bg-white shadow-sm transition-transform ${
            on ? 'translate-x-5' : ''
          }`}
        />
      </span>
    </button>
  );
}

function Segmented({
  value,
  onChange,
  disabled,
}: {
  value: SniffTarget;
  onChange: (t: SniffTarget) => void;
  disabled: boolean;
}) {
  return (
    <div className="inline-flex rounded-full border border-neutral-200 p-0.5 text-[11.5px] font-semibold">
      {(['unmeshed', 'meshed'] as const).map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          disabled={disabled}
          className={`px-2.5 py-1 rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            value === t ? 'bg-black text-white' : 'text-neutral-500 hover:text-black'
          }`}
        >
          {t === 'unmeshed' ? 'Unmeshed' : 'Meshed'}
        </button>
      ))}
    </div>
  );
}

function SniffReport({ sniff }: { sniff: SniffResult }) {
  const meshed = sniff.target === 'meshed';
  // The demo "works" when unmeshed shows cleartext and meshed shows none.
  const ok = meshed ? !sniff.plaintext : sniff.plaintext;
  const verdict = meshed
    ? ok
      ? `No cleartext on ${sniff.pod}: the meshed gRPC payload is mTLS-encrypted.`
      : 'Unexpected cleartext on a meshed connection.'
    : ok
      ? `Readable on ${sniff.pod}: the unmeshed gRPC payload is cleartext on the wire.`
      : 'No cleartext captured. Is the unmeshed probe Running (and authorization off)?';

  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2.5">
          <span className={`inline-block w-2.5 h-2.5 rounded-full shrink-0 ${ok ? 'bg-emerald-500' : 'bg-amber-500'}`} aria-hidden="true" />
          <p className="text-[13.5px] font-medium tracking-tight">
            {meshed ? 'Meshed client' : 'Unmeshed client'} ·{' '}
            <span className="font-mono tabular-nums">{sniff.hits}</span> cleartext hit{sniff.hits === 1 ? '' : 's'}
          </p>
        </div>
        <span
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
            meshed ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
        >
          {meshed ? 'mTLS · encrypted' : 'plaintext'}
        </span>
      </div>
      <p className={`text-[13px] font-medium mb-3 ${ok ? 'text-emerald-700' : 'text-neutral-600'}`}>
        {ok ? '✔ ' : ''}
        {verdict}
      </p>
      {sniff.capture.length > 0 && (
        <pre className="bg-ink text-neutral-200 rounded-lg p-3.5 text-[11.5px] leading-relaxed font-mono overflow-auto scroll-thin max-h-[320px] whitespace-pre">
          {sniff.capture.join('\n')}
        </pre>
      )}
    </div>
  );
}

function ObsButton({ label, link }: { label: string; link: { enabled: boolean; url: string } }) {
  if (!link.enabled) {
    return (
      <span
        className="inline-flex items-center gap-2 text-[13px] font-semibold text-neutral-400 border border-neutral-200 px-4 py-2 rounded-full cursor-not-allowed"
        title="enable this subchart to open it"
      >
        {label}
        <span className="text-[11px] font-normal">off</span>
      </span>
    );
  }
  return (
    <a
      href={link.url}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 text-[13px] font-semibold text-black border border-neutral-300 px-4 py-2 rounded-full hover:border-black transition-colors"
    >
      {label}
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
        <path d="M7 17 17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin" width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
