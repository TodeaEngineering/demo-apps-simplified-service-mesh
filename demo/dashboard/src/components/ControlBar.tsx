'use client';

import { useEffect, useState } from 'react';
import type { EngineConfig } from '@/lib/types';
import { fmtBytes, fmtInt } from '@/lib/format';

interface Props {
  running: boolean;
  config: EngineConfig;
  totalReq: number;
  totalRps: number;
  uptime: string;
  targets: { http: string; grpc: string };
  canary: { v1: number; v2: number; available: boolean };
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onChange: (partial: Partial<EngineConfig>) => void;
  onCanary: (v2: number) => void;
}

export default function ControlBar({
  running,
  config,
  totalReq,
  uptime,
  targets,
  canary,
  onStart,
  onStop,
  onReset,
  onChange,
  onCanary,
}: Props) {
  return (
    <div className="bg-ink text-white rounded-2xl p-6 sm:p-8">
      {/* Top row: status + uptime */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[.22em] uppercase text-neutral-500 mb-2">
            Traffic control
          </p>
          <div className="flex items-center gap-2.5">
            <span
              className={`inline-block w-2.5 h-2.5 rounded-full ${
                running ? 'bg-emerald-400 animate-pulse-dot' : 'bg-neutral-600'
              }`}
              aria-hidden="true"
            />
            <span className="text-[15px] font-medium">
              {running ? 'Streaming HTTP + gRPC' : 'Idle'}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-semibold tracking-[.18em] uppercase text-neutral-500 mb-1">
            {running ? 'Uptime' : 'Total'}
          </p>
          <p className="text-[15px] font-mono text-neutral-200">
            {running ? uptime : `${fmtInt(totalReq)} req`}
          </p>
        </div>
      </div>

      {/* Buttons */}
      <div className="flex items-center gap-3 mt-6">
        {running ? (
          <button
            onClick={onStop}
            className="inline-flex items-center gap-2 text-[14px] font-semibold bg-white/10 text-white border border-white/25 px-6 py-3 rounded-full hover:bg-white/15 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <rect x="2" y="2" width="8" height="8" rx="1.5" fill="currentColor" />
            </svg>
            Stop traffic
          </button>
        ) : (
          <button
            onClick={onStart}
            className="inline-flex items-center gap-2 text-[14px] font-semibold bg-white text-black px-6 py-3 rounded-full hover:opacity-90 transition-opacity"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 2l7 4-7 4z" fill="currentColor" />
            </svg>
            Start traffic
          </button>
        )}
        <button
          onClick={onReset}
          className="text-[13px] font-medium text-neutral-400 hover:text-white px-3 py-3 transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Controls */}
      <div className="grid sm:grid-cols-3 gap-x-8 gap-y-6 mt-8">
        <Control
          label="Rate / client"
          value={`${config.rps}`}
          unit="req/s"
          min={0}
          max={200}
          step={5}
          current={config.rps}
          onChange={(v) => onChange({ rps: v })}
        />
        <CanaryControl v2={canary.v2} available={canary.available} onCommit={onCanary} />
        <Control
          label="Payload"
          value={fmtBytes(config.payloadBytes)}
          unit=""
          min={0}
          max={4096}
          step={64}
          current={config.payloadBytes}
          onChange={(v) => onChange({ payloadBytes: v })}
        />
      </div>

      {/* Targets */}
      <div className="mt-8 pt-5 border-t border-white/10 grid sm:grid-cols-2 gap-3">
        <Target label="HTTP target" value={targets.http} />
        <Target label="gRPC target" value={targets.grpc} />
      </div>
    </div>
  );
}

function Control({
  label,
  value,
  unit,
  min,
  max,
  step,
  current,
  onChange,
}: {
  label: string;
  value: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2.5">
        <label className="text-[12px] font-medium text-neutral-400">{label}</label>
        <span className="text-[15px] font-mono text-white tabular-nums">
          {value}
          {unit ? <span className="text-neutral-500 text-[12px] ml-1">{unit}</span> : null}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-white cursor-pointer"
        aria-label={label}
      />
    </div>
  );
}

// The gRPC canary (GRPCRoute v1/v2 weights). Updates the label live while
// dragging, but only patches the cluster on release so we don't spam kubectl.
function CanaryControl({
  v2,
  available,
  onCommit,
}: {
  v2: number;
  available: boolean;
  onCommit: (v2: number) => void;
}) {
  const [local, setLocal] = useState(v2);
  useEffect(() => {
    setLocal(v2);
  }, [v2]);
  const commit = () => onCommit(local);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2.5">
        <label className="text-[12px] font-medium text-neutral-400">Canary</label>
        <span className="text-[15px] font-mono text-white tabular-nums">
          v1 {100 - local} / v2 {local}
          <span className="text-neutral-500 text-[12px] ml-1">%</span>
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={10}
        value={local}
        disabled={!available}
        onChange={(e) => setLocal(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        className="w-full accent-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
        aria-label="Canary v2 weight"
      />
      {!available && <p className="text-[11px] text-neutral-500 mt-1.5">in-cluster only</p>}
    </div>
  );
}

function Target({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-600 shrink-0" aria-hidden="true" />
      <span className="text-[11px] font-semibold tracking-[.14em] uppercase text-neutral-500 shrink-0">
        {label}
      </span>
      <span className="text-[12px] font-mono text-neutral-300 truncate">{value}</span>
    </div>
  );
}
