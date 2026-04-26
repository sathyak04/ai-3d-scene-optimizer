import { useSceneStore } from '@/store/sceneStore';
import { formatNumber, formatBytes, formatDelta } from '@/lib/utils/format';
import type { SceneAnalysis } from '@/lib/analysis/types';

type Row = {
  label: string;
  value: number;
  optimized?: number;
  fmt: (n: number) => string;
};

export function DeltaPanel() {
  const original = useSceneStore((s) => s.originalAnalysis);
  const optimized = useSceneStore((s) => s.optimizedAnalysis);
  const sliders = useSceneStore((s) => s.sliders);

  const appliedAIPreset = useSceneStore((s) => s.appliedAIPreset);

  if (!original) return null;

  const hasOptimization =
    sliders.geometryDensity < 0.999 ||
    sliders.textureQuality < 0.999 ||
    sliders.vertexPrecision < 0.999;

  const matchesAIPreset =
    !!appliedAIPreset &&
    Math.abs(sliders.geometryDensity - appliedAIPreset.geometryDensity) < 0.005 &&
    Math.abs(sliders.textureQuality - appliedAIPreset.textureQuality) < 0.005 &&
    Math.abs(sliders.vertexPrecision - appliedAIPreset.vertexPrecision) <
      0.005;

  const isCustom = hasOptimization && !matchesAIPreset;

  const rows: Row[] = [
    {
      label: 'Triangles',
      value: original.triangleCount,
      optimized: optimized?.triangleCount,
      fmt: formatNumber,
    },
    {
      label: 'Vertices',
      value: original.vertexCount,
      optimized: optimized?.vertexCount,
      fmt: formatNumber,
    },
    {
      label: 'Tex Pixels',
      value: original.totalTexturePixels,
      optimized: optimized?.totalTexturePixels,
      fmt: formatNumber,
    },
    {
      label: 'Est Size',
      value: original.estimatedSizeBytes,
      optimized: optimized?.estimatedSizeBytes,
      fmt: formatBytes,
    },
    {
      label: 'Cost Score',
      value: original.cost.total,
      optimized: optimized?.cost.total,
      fmt: (n) => String(n),
    },
  ];

  // No optimization OR custom (manually adjusted away from AI preset):
  // show just the current specs, no delta. Delta only makes sense when the
  // user is looking at the AI's optimization.
  if (!hasOptimization || isCustom) {
    const showAnalysis = isCustom ? optimized ?? original : original;
    const specsRows: Array<{ label: string; v: number; fmt: (n: number) => string }> = [
      { label: 'Triangles', v: showAnalysis.triangleCount, fmt: formatNumber },
      { label: 'Vertices', v: showAnalysis.vertexCount, fmt: formatNumber },
      { label: 'Tex Pixels', v: showAnalysis.totalTexturePixels, fmt: formatNumber },
      { label: 'Est Size', v: showAnalysis.estimatedSizeBytes, fmt: formatBytes },
      { label: 'Cost Score', v: showAnalysis.cost.total, fmt: (n) => String(n) },
    ];
    return (
      <div className="panel p-3 space-y-1.5">
        <h3 className="panel-title">
          {isCustom
            ? 'Current State · Custom'
            : `Asset Specs · ${sceneTypeLabel(original)}`}
        </h3>
        <div className="space-y-0.5">
          {specsRows.map((r) => (
            <div
              key={r.label}
              className="flex items-center justify-between text-[11px]"
            >
              <span className="text-text-dim">{r.label}</span>
              <span className="font-mono text-text tabular-nums">
                {r.fmt(r.v)}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="panel p-3 space-y-1.5">
      <h3 className="panel-title">Optimization Impact</h3>
      <div className="space-y-0.5">
        {rows.map((r) => (
          <ImpactRow key={r.label} {...r} />
        ))}
      </div>
    </div>
  );
}

function ImpactRow({ label, value, optimized, fmt }: Row) {
  const after = optimized ?? value;
  const delta = formatDelta(value, after);
  const tone =
    delta.direction === 'down'
      ? 'text-good'
      : delta.direction === 'up'
        ? 'text-bad'
        : 'text-text-dim';
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-2 text-[11px]">
      <span className="text-text-dim">{label}</span>
      <span className="font-mono text-text-muted tabular-nums">{fmt(value)}</span>
      <span className="text-text-dim">→</span>
      <span className="font-mono tabular-nums flex items-baseline gap-1.5">
        <span className="text-text">{fmt(after)}</span>
        <span className={`text-[10px] ${tone}`}>{delta.text}</span>
      </span>
    </div>
  );
}

function sceneTypeLabel(a: SceneAnalysis): string {
  switch (a.sceneType) {
    case 'character':
      return 'Rigged Character';
    case 'environment':
      return 'Environment';
    case 'cad':
      return 'CAD / Mechanical';
    case 'object':
      return 'Single Object';
    default:
      return 'Mixed Asset';
  }
}
