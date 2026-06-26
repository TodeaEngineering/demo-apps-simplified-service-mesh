'use client';

import type { LogEntry } from '@/lib/types';
import { fmtClock } from '@/lib/format';

interface Props {
  log: LogEntry[];
}

export default function LogFeed({ log }: Props) {
  return (
    <div className="bg-ink text-white rounded-2xl p-6 flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[10px] font-semibold tracking-[.18em] uppercase text-neutral-500">Request log</p>
        <p className="text-[11px] font-mono text-neutral-500">client traffic · last {log.length}</p>
      </div>

      <div className="min-h-[260px] max-h-[420px] overflow-y-auto scroll-thin -mr-2 pr-2">
        {log.length === 0 ? (
          <p className="text-[14px] text-neutral-500 font-light">No requests yet.</p>
        ) : (
          <ul className="space-y-2 font-mono text-[13px]">
            {log.map((e, i) => (
              <li key={`${e.t}-${i}`} className="flex items-center gap-3 leading-relaxed">
                <span className="text-neutral-500 shrink-0 w-[96px]">{fmtClock(e.t)}</span>
                <span
                  className={`shrink-0 w-[140px] truncate ${e.client === 'generator' ? 'text-neutral-600' : 'text-neutral-300'}`}
                  title={e.client}
                >
                  {e.client}
                </span>
                <span className="shrink-0 w-11 text-center rounded px-1.5 py-0.5 text-[11px] font-semibold tracking-wide border border-white/15 text-neutral-300">
                  {e.protocol === 'http' ? 'HTTP' : 'gRPC'}
                </span>
                <span
                  className={`inline-block w-2 h-2 rounded-full shrink-0 ${e.ok ? 'bg-emerald-500' : 'bg-red-500'}`}
                  aria-hidden="true"
                />
                <span className="text-neutral-400 shrink-0 w-14 text-right tabular-nums">{e.ms}ms</span>
                {e.ok ? (
                  <span className="text-neutral-400 truncate" title={e.pod ?? ''}>
                    {e.pod ?? ''}
                  </span>
                ) : (
                  <span className="text-red-400 font-semibold truncate" title={e.error ?? 'error'}>
                    {e.error ?? 'error'}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
