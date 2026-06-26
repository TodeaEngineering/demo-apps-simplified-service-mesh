'use client';

import type { ProtocolStats } from '@/lib/types';
import { fmtInt, fmtMs, fmtPct, fmtRps } from '@/lib/format';

interface Props {
  variant: 'http' | 'grpc';
  title: string;
  transport: string;
  endpoint: string;
  stats: ProtocolStats;
  running: boolean;
}

function successColor(rate: number): string {
  if (rate >= 99) return 'bg-emerald-500';
  if (rate >= 90) return 'bg-amber-500';
  return 'bg-red-500';
}

export default function ProtocolCard({ variant, title, transport, endpoint, stats, running }: Props) {
  const maxPod = stats.pods.reduce((m, p) => Math.max(m, p.count), 1);
  const versionTotal = stats.versions.reduce((s, v) => s + v.count, 0) || 1;

  return (
    <div className="group border border-neutral-200 rounded-2xl p-6 sm:p-7 bg-white hover:border-black transition-colors duration-300">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-black text-white"
            aria-hidden="true"
          >
            {variant === 'http' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 12h16M4 12l4-4M4 12l4 4M20 12l-4-4M20 12l-4 4" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.5 2.5M16.5 16.5L19 19M19 5l-2.5 2.5M7.5 16.5L5 19" />
              </svg>
            )}
          </span>
          <div>
            <h3 className="text-[22px] font-bold tracking-tight leading-none">{title}</h3>
            <p className="text-[12px] text-neutral-500 font-medium mt-1">{transport}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              running ? `${successColor(stats.successRate)} ${stats.rps > 0 ? 'animate-pulse-dot' : ''}` : 'bg-neutral-300'
            }`}
            aria-hidden="true"
          />
          <span className="text-[12px] font-mono text-neutral-400 truncate max-w-[150px]" title={endpoint}>
            {endpoint}
          </span>
        </div>
      </div>

      {/* Big number */}
      <div className="mt-7 flex items-end justify-between">
        <div>
          <p className="text-[44px] sm:text-[52px] font-[800] tracking-tight leading-none tabular-nums">
            {fmtInt(stats.total)}
          </p>
          <p className="text-[12px] text-neutral-500 mt-1.5">requests sent</p>
        </div>
        {stats.inflight > 0 && (
          <p className="text-[12px] font-mono text-neutral-400">{stats.inflight} in flight</p>
        )}
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-4 gap-3 mt-7 pt-6 border-t border-neutral-200">
        <Stat label="req/s" value={fmtRps(stats.rps)} />
        <Stat label="success" value={fmtPct(stats.successRate)} />
        <Stat label="p50" value={fmtMs(stats.p50)} unit="ms" />
        <Stat label="p99" value={fmtMs(stats.p99)} unit="ms" />
      </div>

      {/* Canary — version split (gRPC, once v2 traffic appears via the GRPCRoute) */}
      {stats.versions.length > 1 && (
        <div className="mt-6 pt-5 border-t border-neutral-200">
          <p className="text-[10px] font-semibold tracking-[.18em] uppercase text-neutral-400 mb-3">
            Canary · version split
          </p>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-neutral-100 mb-3">
            {stats.versions.map((v, i) => (
              <span
                key={v.version}
                className={canaryBar(i)}
                style={{ width: `${(v.count / versionTotal) * 100}%` }}
                title={`${v.version}: ${v.count}`}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {stats.versions.map((v, i) => (
              <span key={v.version} className="inline-flex items-center gap-2 text-[12px]">
                <span className={`inline-block w-2 h-2 rounded-sm ${canaryBar(i)}`} aria-hidden="true" />
                <span className="font-mono text-neutral-700">{v.version}</span>
                <span className="font-mono text-neutral-400 tabular-nums">
                  {Math.round((v.count / versionTotal) * 100)}%
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Responding instances */}
      <div className="mt-6 pt-5 border-t border-neutral-200">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-semibold tracking-[.18em] uppercase text-neutral-400">
            Responding instances
          </p>
          <p className="text-[11px] font-mono text-neutral-400">{stats.pods.length}</p>
        </div>
        {stats.pods.length === 0 ? (
          <p className="text-[13px] text-neutral-400 font-light">No responses yet.</p>
        ) : (
          <ul className="space-y-2">
            {stats.pods.slice(0, 4).map((p) => (
              <li key={p.pod} className="flex items-center gap-3">
                <span className="text-[12px] font-mono text-neutral-700 truncate w-[46%] shrink-0" title={p.pod}>
                  {p.pod}
                </span>
                <span className="relative flex-1 h-1.5 rounded-full bg-neutral-100 overflow-hidden">
                  <span
                    className="absolute inset-y-0 left-0 rounded-full bg-black transition-[width] duration-500"
                    style={{ width: `${Math.max(4, (p.count / maxPod) * 100)}%` }}
                  />
                </span>
                <span className="text-[12px] font-mono text-neutral-500 tabular-nums w-12 text-right shrink-0">
                  {fmtInt(p.count)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Monochrome canary palette: v1 solid black, v2 mid-grey, then lighter.
function canaryBar(i: number): string {
  return ['bg-black', 'bg-neutral-400', 'bg-neutral-300', 'bg-neutral-200'][i] ?? 'bg-neutral-200';
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <p className="text-[19px] font-bold tracking-tight tabular-nums leading-none">
        {value}
        {unit ? <span className="text-[12px] font-medium text-neutral-400 ml-0.5">{unit}</span> : null}
      </p>
      <p className="text-[11px] text-neutral-500 mt-1.5">{label}</p>
    </div>
  );
}
