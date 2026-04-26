export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  if (n >= 1000) return n.toLocaleString();
  return n.toString();
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(2)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export function formatPercent(ratio: number, digits = 0): string {
  if (!Number.isFinite(ratio)) return '—';
  return `${(ratio * 100).toFixed(digits)}%`;
}

export function formatDelta(before: number, after: number): {
  text: string;
  direction: 'up' | 'down' | 'flat';
  ratio: number;
} {
  if (before === 0) {
    return { text: '—', direction: 'flat', ratio: 0 };
  }
  const ratio = (after - before) / before;
  const pct = Math.abs(ratio * 100);
  if (Math.abs(ratio) < 0.005) return { text: '0%', direction: 'flat', ratio: 0 };
  return {
    text: `${ratio < 0 ? '-' : '+'}${pct.toFixed(0)}%`,
    direction: ratio < 0 ? 'down' : 'up',
    ratio,
  };
}
