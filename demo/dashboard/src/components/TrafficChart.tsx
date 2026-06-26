'use client';

import type { SeriesPoint } from '@/lib/types';

interface Props {
  series: SeriesPoint[];
}

const W = 1000;
const H = 220;
const PAD_TOP = 16;
const PAD_BOTTOM = 20;
const PAD_X = 4;

export default function TrafficChart({ series }: Props) {
  const n = series.length;
  const maxVal = Math.max(1, ...series.map((s) => s.http + s.grpc));
  const hasTraffic = series.some((s) => s.http + s.grpc > 0);

  const xFor = (i: number) => PAD_X + (i / Math.max(1, n - 1)) * (W - 2 * PAD_X);
  const yFor = (v: number) => H - PAD_BOTTOM - (v / maxVal) * (H - PAD_TOP - PAD_BOTTOM);

  const linePath = (key: 'http' | 'grpc') =>
    series.map((s, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(s[key]).toFixed(1)}`).join(' ');

  const totalArea = (() => {
    if (n === 0) return '';
    const top = series
      .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xFor(i).toFixed(1)} ${yFor(s.http + s.grpc).toFixed(1)}`)
      .join(' ');
    return `${top} L ${xFor(n - 1).toFixed(1)} ${H - PAD_BOTTOM} L ${xFor(0).toFixed(1)} ${H - PAD_BOTTOM} Z`;
  })();

  return (
    <div className="border border-neutral-200 rounded-2xl p-6 bg-white h-full">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] font-semibold tracking-[.18em] uppercase text-neutral-500">
          Throughput · last 60s
        </p>
        <div className="flex items-center gap-4 text-[11px] text-neutral-500">
          <Legend swatch="#000" label="HTTP" />
          <Legend swatch="#a3a3a3" label="gRPC" />
        </div>
      </div>
      <p className="text-[12px] font-mono text-neutral-400 mb-3">peak {maxVal} req/s</p>

      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ aspectRatio: `${W} / ${H}` }} preserveAspectRatio="none">
          {/* baseline */}
          <line x1={PAD_X} y1={H - PAD_BOTTOM} x2={W - PAD_X} y2={H - PAD_BOTTOM} stroke="#e5e5e5" strokeWidth={1} />
          {hasTraffic && (
            <>
              <path d={totalArea} fill="#000" fillOpacity={0.05} />
              <path d={linePath('grpc')} fill="none" stroke="#a3a3a3" strokeWidth={2} strokeLinejoin="round" />
              <path d={linePath('http')} fill="none" stroke="#000" strokeWidth={2} strokeLinejoin="round" />
            </>
          )}
        </svg>
        {!hasTraffic && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-[13px] text-neutral-400 font-light">Start traffic to see throughput.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block w-3 h-[2px] rounded-full" style={{ background: swatch }} aria-hidden="true" />
      {label}
    </span>
  );
}
