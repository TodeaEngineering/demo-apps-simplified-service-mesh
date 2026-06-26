// Small display helpers shared by the dashboard components.

export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}

export function fmtMs(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  return n >= 100 ? `${Math.round(n)}` : n.toFixed(1);
}

export function fmtRps(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n >= 10 ? Math.round(n).toString() : n.toFixed(1);
}

export function fmtPct(n: number): string {
  const digits = n >= 99.95 || n === 0 ? 0 : 1;
  return `${n.toFixed(digits)}%`;
}

export function fmtUptime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(n % 1024 === 0 ? 0 : 1)} KB`;
}

export function fmtClock(t: number): string {
  const d = new Date(t);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}
