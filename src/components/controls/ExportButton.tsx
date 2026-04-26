import { useState } from 'react';
import {
  exportCurrentScene,
  type ExportResult,
} from '@/lib/export/exportGLB';
import { useSceneStore, ASSET_OPTIONS } from '@/store/sceneStore';
import { formatBytes } from '@/lib/utils/format';

const DownloadIcon = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M12 4 L12 16" />
    <path d="M7 11 L12 16 L17 11" />
    <path d="M5 19 L19 19" />
  </svg>
);

type Props = {
  /** Renders as a compact icon-only button (for inline placement). */
  compact?: boolean;
};

export function ExportButton({ compact = false }: Props) {
  const currentAsset = useSceneStore((s) => s.currentAsset);
  const sliders = useSceneStore((s) => s.sliders);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<ExportResult | null>(null);
  const [copied, setCopied] = useState(false);

  const handleClick = async () => {
    setError(null);
    setBusy(true);
    try {
      const opt = ASSET_OPTIONS.find((o) => o.id === currentAsset);
      const baseName = opt?.label.replace(/\s+/g, '_').toLowerCase() ?? 'asset';
      const tag = `g${Math.round(sliders.geometryDensity * 100)}_t${Math.round(sliders.textureQuality * 100)}_v${Math.round(sliders.vertexPrecision * 100)}`;
      const result = await exportCurrentScene(`${baseName}_${tag}.glb`);
      setLast(result);
      setCopied(false);
      // Auto-fade after 6s in compact mode so the toast doesn't linger.
      if (compact) setTimeout(() => setLast(null), 6000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyHash = async () => {
    if (!last) return;
    try {
      await navigator.clipboard.writeText(last.sha256);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard rejected — silently ignore */
    }
  };

  if (compact) {
    return (
      <div className="relative">
        <button
          onClick={handleClick}
          disabled={busy}
          title={busy ? 'Exporting…' : 'Export optimized .glb'}
          className={[
            'w-9 h-9 rounded-md flex items-center justify-center transition-all border',
            busy
              ? 'border-bg-border bg-bg-panel text-text-dim cursor-wait'
              : 'border-accent/40 bg-accent/15 text-accent hover:bg-accent/25',
          ].join(' ')}
        >
          <span className="block w-5 h-5">{DownloadIcon}</span>
        </button>
        {(last || error) && (
          <div className="absolute bottom-full left-0 mb-2 z-20 min-w-[240px] max-w-[320px] bg-bg-panel/95 backdrop-blur-md border rounded-md shadow-xl px-2.5 py-2 text-[10px] font-mono whitespace-normal"
            style={
              error
                ? { borderColor: 'rgba(239,68,68,0.4)' }
                : { borderColor: 'rgba(34,197,94,0.4)' }
            }
          >
            {error ? (
              <span className="text-bad">{error}</span>
            ) : last ? (
              <div className="space-y-0.5">
                <div className="flex items-center justify-between gap-2 text-text-dim">
                  <span>Saved · {formatBytes(last.byteSize)}</span>
                  <button
                    onClick={copyHash}
                    className="text-accent hover:text-accent-glow uppercase tracking-wider text-[9px]"
                  >
                    {copied ? '✓ copied' : 'copy hash'}
                  </button>
                </div>
                <div className="text-text-muted break-all text-[9px] leading-tight">
                  sha256:{last.sha256.slice(0, 16)}…{last.sha256.slice(-8)}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        onClick={handleClick}
        disabled={busy}
        className={[
          'w-full px-3 py-2 rounded text-[11px] font-semibold transition-all border',
          busy
            ? 'border-bg-border bg-bg-panel text-text-dim cursor-wait'
            : 'border-accent/40 bg-accent/15 text-text hover:bg-accent/25',
        ].join(' ')}
      >
        {busy ? 'Exporting...' : 'Export Optimized .glb'}
      </button>
      {error && (
        <div className="text-[10px] text-bad bg-bad/10 border border-bad/30 rounded px-2 py-1">
          {error}
        </div>
      )}
      {last && !error && (
        <div
          className="text-[10px] border border-good/30 bg-good/5 rounded px-2 py-1.5 space-y-0.5"
          title="SHA-256 integrity hash for downstream verification"
        >
          <div className="flex items-center justify-between text-text-dim">
            <span>Saved · {formatBytes(last.byteSize)}</span>
            <button
              onClick={copyHash}
              className="text-accent hover:text-accent-glow font-mono uppercase tracking-wider text-[9px]"
            >
              {copied ? '✓ copied' : 'copy hash'}
            </button>
          </div>
          <div className="font-mono text-text-muted break-all text-[9px] leading-tight">
            sha256:{last.sha256.slice(0, 16)}…{last.sha256.slice(-8)}
          </div>
        </div>
      )}
    </div>
  );
}
