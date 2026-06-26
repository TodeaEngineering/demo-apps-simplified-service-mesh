'use client';

import type { ReactNode } from 'react';
import type { ClientStats } from '@/lib/types';
import { fmtMs, fmtPct, fmtRps } from '@/lib/format';

interface Props {
  clients: ClientStats[];
  meshEnabled: boolean;
  controls?: ReactNode;
}

export default function MeshSecurityPanel({ clients, controls }: Props) {
  const any = clients.length > 0;

  return (
    <section>
      <div className="flex items-end justify-between mb-5 flex-wrap gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[.2em] uppercase text-neutral-600 mb-2">
            Mesh &amp; security
          </p>
          <h2 className="text-2xl sm:text-[1.9rem] font-[800] tracking-tight leading-tight">
            The client fleet
          </h2>
        </div>
        <p className="text-[13px] text-neutral-500 font-light max-w-[460px]">
          Three client pods send the traffic. The two meshed ones get identity, mTLS and canary
          routing; the unmeshed one sends plaintext and is denied once authorization is on.
        </p>
      </div>

      {controls}

      {!any ? (
        <div className="border border-dashed border-neutral-300 rounded-2xl p-8 text-center">
          <p className="text-[14px] text-neutral-500 font-light">
            No client pods reporting yet. They run in-cluster — deploy with{' '}
            <span className="font-mono text-neutral-700">make deploy</span> and press{' '}
            <span className="font-mono text-neutral-700">Start traffic</span>.
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-3 gap-5">
          {clients.map((c) => (
            <ClientCard key={c.name} client={c} />
          ))}
        </div>
      )}
    </section>
  );
}

function ClientCard({ client: c }: { client: ClientStats }) {
  const meshed = c.meshed;
  const proto = c.protocol === 'http' ? 'HTTP' : 'gRPC';
  const noData = c.total === 0;
  const stale = c.stale;
  const authorized = c.lastOk;
  const denied =
    !c.lastOk && (c.lastCode === 'PERMISSION_DENIED' || /denied|unauthor/i.test(c.lastError ?? ''));
  const versionTotal = c.versions.reduce((s, v) => s + v.count, 0) || 1;

  const versionNote =
    c.protocol === 'http'
      ? 'HTTP/1.1 fans out across replicas.'
      : meshed
        ? 'Honors the GRPCRoute canary across versions.'
        : 'No proxy; pins to one version, ignores the split.';

  return (
    <div className="border border-neutral-200 rounded-2xl p-6 bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-black text-white shrink-0"
            aria-hidden="true"
          >
            {meshed ? <LockIcon /> : <UnlockIcon />}
          </span>
          <div className="min-w-0">
            <h3 className="text-[16px] font-bold tracking-tight leading-none">
              {proto} <span className="text-neutral-400 font-semibold">{meshed ? 'meshed' : 'unmeshed'}</span>
            </h3>
            <p className="text-[11.5px] font-mono text-neutral-500 mt-1.5 truncate">{c.name}</p>
          </div>
        </div>
        <span
          className={`text-[10.5px] font-semibold px-2 py-1 rounded-full border shrink-0 ${
            meshed
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-amber-50 text-amber-700 border-amber-200'
          }`}
        >
          {meshed ? 'mTLS' : 'plaintext'}
        </span>
      </div>

      {/* Authorization */}
      <div className="mt-5">
        {noData || stale ? (
          <StatusPill tone="neutral" label={stale ? 'Stale · no recent reports' : 'Waiting for reports'} />
        ) : denied ? (
          <StatusPill tone="red" label={`Denied · ${c.lastCode ?? 'unauthorized'}`} />
        ) : authorized ? (
          <StatusPill tone="green" label="Authorized" />
        ) : (
          <StatusPill tone="red" label={c.lastError ?? 'error'} />
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mt-5">
        <MiniStat label="success" value={fmtPct(c.successRate)} />
        <MiniStat label="req/s" value={fmtRps(c.rps)} />
        <MiniStat label="last" value={fmtMs(c.lastMs)} unit="ms" />
      </div>

      {/* Version reached */}
      <div className="mt-5 pt-5 border-t border-neutral-100">
        <p className="text-[10px] font-semibold tracking-[.18em] uppercase text-neutral-400 mb-2.5">
          Version reached
        </p>
        {c.versions.length === 0 ? (
          <p className="text-[13px] text-neutral-400 font-light">no traffic yet</p>
        ) : (
          <>
            <div className="flex h-2 rounded-full overflow-hidden bg-neutral-100 mb-2.5">
              {c.versions.map((v, i) => (
                <span key={v.version} className={canaryBar(i)} style={{ width: `${(v.count / versionTotal) * 100}%` }} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
              {c.versions.map((v, i) => (
                <span key={v.version} className="inline-flex items-center gap-1.5">
                  <span className={`inline-block w-2 h-2 rounded-sm ${canaryBar(i)}`} aria-hidden="true" />
                  <span className="font-mono text-neutral-700">{v.version}</span>
                  <span className="font-mono text-neutral-400">{Math.round((v.count / versionTotal) * 100)}%</span>
                </span>
              ))}
            </div>
          </>
        )}
        <p className="text-[12px] text-neutral-400 font-light mt-3">{versionNote}</p>
      </div>

      {/* Instances + wire caption */}
      <div className="mt-5 pt-5 border-t border-neutral-100 flex items-center justify-between gap-3">
        <p className="text-[12px] text-neutral-500">
          {c.pods.length} instance{c.pods.length === 1 ? '' : 's'} reached
        </p>
        <p
          className="text-[11.5px] font-mono text-neutral-400 truncate"
          title={meshed ? 'encrypted on the wire' : 'readable on the wire; prove it with “Wire capture”'}
        >
          {meshed ? 'encrypted on wire' : 'readable on wire'}
        </p>
      </div>
    </div>
  );
}

function StatusPill({ tone, label }: { tone: 'green' | 'red' | 'neutral'; label: string }) {
  const styles = {
    green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    neutral: 'bg-neutral-50 text-neutral-500 border-neutral-200',
  }[tone];
  const dot = { green: 'bg-emerald-500', red: 'bg-red-500', neutral: 'bg-neutral-400' }[tone];
  return (
    <span className={`inline-flex items-center gap-2 text-[13px] font-semibold px-3 py-1.5 rounded-full border ${styles}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />
      <span className="truncate max-w-[200px]">{label}</span>
    </span>
  );
}

function MiniStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div>
      <p className="text-[17px] font-bold tracking-tight tabular-nums leading-none">
        {value}
        {unit ? <span className="text-[11px] font-medium text-neutral-400 ml-0.5">{unit}</span> : null}
      </p>
      <p className="text-[11px] text-neutral-500 mt-1.5">{label}</p>
    </div>
  );
}

function canaryBar(i: number): string {
  return ['bg-black', 'bg-neutral-400', 'bg-neutral-300', 'bg-neutral-200'][i] ?? 'bg-neutral-200';
}

function LockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function UnlockIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.5-2" />
    </svg>
  );
}
