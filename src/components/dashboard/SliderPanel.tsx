import { useState } from 'react';
import { useSceneStore, type SliderConfig } from '@/store/sceneStore';
import { formatNumber, formatBytes } from '@/lib/utils/format';
import type { SceneAnalysis } from '@/lib/analysis/types';
import { PLATFORM_BUDGETS, type TargetPlatform } from '@/lib/ai/prompt';
import { bytesPerVertexAt } from '@/lib/preview/vertexQuantize';

const SLIDERS = [
  {
    key: 'geometryDensity' as const,
    label: 'Topology Resolution',
    description: 'Triangle count. Lower = more faceted, less detail.',
  },
  {
    key: 'textureQuality' as const,
    label: 'Texture Quality',
    description: 'Texture resolution. Lower = chunkier pixels.',
  },
  {
    key: 'vertexPrecision' as const,
    label: 'Vertex Precision',
    description: 'Vertex-position fidelity (Draco / meshopt-style quantization). Lower = PS1-style jitter, smaller vertex buffer.',
  },
];

export function SliderPanel() {
  const sliders = useSceneStore((s) => s.sliders);
  const setSliders = useSceneStore((s) => s.setSliders);
  const original = useSceneStore((s) => s.originalAnalysis);
  const optimized = useSceneStore((s) => s.optimizedAnalysis);

  return (
    <div
      className="bg-bg-panel/85 backdrop-blur-md border border-bg-border rounded-lg shadow-xl px-2.5 py-2 space-y-1.5 select-none"
      // Stop the SceneViewer's drop-zone behind us from claiming the
      // cursor when the user drags a slider thumb across the canvas.
      onDragStart={(e) => e.preventDefault()}
      onDragOver={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
      onDragEnter={(e) => e.stopPropagation()}
    >
      {SLIDERS.map(({ key, label }) => {
        const value = sliders[key];
        const valueLine = formatSliderValue(key, value, original, optimized);
        return (
          <div key={key} className="space-y-0.5">
            <div className="flex items-center justify-between gap-2">
              <label
                className="text-[10px] text-text-muted whitespace-nowrap"
                title={label}
              >
                {label}
              </label>
              <span
                className="text-[10px] font-mono text-text-dim tabular-nums"
                title={valueLine || undefined}
              >
                {Math.round(value * 100)}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={value}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
              onChange={(e) =>
                setSliders({ [key]: parseFloat(e.target.value) })
              }
              className="w-full accent-accent cursor-pointer"
            />
          </div>
        );
      })}
      <PlatformRings />
    </div>
  );
}

const PLATFORM_LIST: { id: TargetPlatform; short: string }[] = [
  { id: 'mobile', short: 'Mobile' },
  { id: 'midPC', short: 'Mid PC' },
  { id: 'highPC', short: 'High PC' },
  { id: 'VR', short: 'VR' },
];

type Usage = {
  tri: number;
  tex: number;
  vmem: number;
  vmemBytes: number; // resolved bytes for display
  max: number;
};

function computeUsage(
  a: SceneAnalysis,
  p: TargetPlatform,
  vertexPrecision: number
): Usage {
  const b = PLATFORM_BUDGETS[p];
  const tri = a.triangleCount / b.tris;
  const tex = a.largestTextureDim > 0 ? a.largestTextureDim / b.tex : 0;
  const vmemBytes = a.vertexCount * bytesPerVertexAt(vertexPrecision);
  const vmem = vmemBytes / b.vertexMem;
  return { tri, tex, vmem, vmemBytes, max: Math.max(tri, tex, vmem) };
}

/**
 * Compatibility score is 1 - usage (clamped). 1.0 = perfect fit / lots of
 * headroom, 0.0 = completely consuming the budget, negative-equivalent = over.
 * Color smoothly interpolates: green (1.0) → yellow (0.5) → red (0.0 / over).
 */
function compatibilityColor(score: number, over: boolean): string {
  if (over) return '#ef4444';
  // hue: 0 (red) at score 0 -> 142 (green) at score 1
  const hue = score * 142;
  // less saturated/lighter near the middle, vivid at extremes
  const sat = 78 + (1 - Math.abs(score - 0.5) * 2) * 8;
  const light = 50 - score * 6;
  return `hsl(${hue.toFixed(0)}, ${sat.toFixed(0)}%, ${light.toFixed(0)}%)`;
}

function PlatformRings() {
  const original = useSceneStore((s) => s.originalAnalysis);
  const optimized = useSceneStore((s) => s.optimizedAnalysis);
  const sliders = useSceneStore((s) => s.sliders);
  const targetPlatform = useSceneStore((s) => s.targetPlatform);
  const setTargetPlatform = useSceneStore((s) => s.setTargetPlatform);
  const [expanded, setExpanded] = useState<TargetPlatform | null>(null);
  if (!original) return null;
  const a = optimized ?? original;

  const handleClick = (id: TargetPlatform) => {
    setTargetPlatform(id);
    setExpanded((cur) => (cur === id ? null : id));
  };

  return (
    <div className="border-t border-bg-border/60 pt-2 mt-1">
      <div className="text-[9px] uppercase tracking-wider text-text-dim mb-1.5">
        Platform Compatibility
      </div>
      <div className="flex items-start justify-between gap-1">
        {PLATFORM_LIST.map((p) => {
          const usage = computeUsage(a, p.id, sliders.vertexPrecision);
          // Per-metric compatibility = headroom remaining (1 - usage), clamped.
          // Average across the three so every slider visibly contributes.
          const triComp = Math.max(0, 1 - usage.tri);
          const texComp = Math.max(0, 1 - usage.tex);
          const vmemComp = Math.max(0, 1 - usage.vmem);
          const avgCompat = (triComp + texComp + vmemComp) / 3;
          const overMetrics: string[] = [];
          if (usage.tri > 1) overMetrics.push('triangles');
          if (usage.tex > 1) overMetrics.push('texture');
          if (usage.vmem > 1) overMetrics.push('vertex mem');
          const isActive = p.id === targetPlatform;
          const isExpanded = p.id === expanded;
          const overText =
            overMetrics.length > 0
              ? ` · OVER on ${overMetrics.join(', ')}`
              : '';
          return (
            <button
              key={p.id}
              onClick={() => handleClick(p.id)}
              title={`${PLATFORM_BUDGETS[p.id].label}${overText} · click to expand`}
              className={[
                'flex flex-col items-center gap-0.5 rounded p-1 transition-colors',
                isExpanded
                  ? 'bg-accent/20 ring-1 ring-accent/60'
                  : isActive
                    ? 'bg-accent/15'
                    : 'hover:bg-bg-panelHover',
              ].join(' ')}
            >
              <Ring compatibility={avgCompat} over={overMetrics.length > 0} />
              <span
                className={[
                  'text-[9px] font-mono',
                  isActive ? 'text-accent' : 'text-text-muted',
                ].join(' ')}
              >
                {p.short}
              </span>
            </button>
          );
        })}
      </div>
      {expanded && (
        <PlatformDetails
          platform={expanded}
          analysis={a}
          onClose={() => setExpanded(null)}
        />
      )}
    </div>
  );
}

function Ring({
  compatibility,
  over,
}: {
  compatibility: number;
  over: boolean;
}) {
  const SIZE = 32;
  const STROKE = 3;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  // Battery model: full ring = lots of headroom (good fit). Empty = no room.
  const score = Math.min(1, Math.max(0, compatibility));
  const dash = C * score;
  const color = compatibilityColor(score, over);
  const labelText = over ? '0%' : `${Math.round(score * 100)}%`;
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth={STROKE}
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeDasharray={`${dash} ${C}`}
        strokeDashoffset={C / 4}
        strokeLinecap="round"
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        style={{ transition: 'stroke-dasharray 200ms ease, stroke 200ms ease' }}
      />
      <text
        x={SIZE / 2}
        y={SIZE / 2 + 3}
        textAnchor="middle"
        fill={color}
        fontSize="9"
        fontFamily="monospace"
        fontWeight="bold"
      >
        {labelText}
      </text>
      {over && (
        <g>
          <title>Over budget on at least one metric</title>
          <circle
            cx={SIZE - 4}
            cy={4}
            r={4}
            fill="#ef4444"
            stroke="#0d0d12"
            strokeWidth={1}
          />
          <text
            x={SIZE - 4}
            y={6.5}
            textAnchor="middle"
            fill="white"
            fontSize="7"
            fontFamily="sans-serif"
            fontWeight="bold"
          >
            !
          </text>
        </g>
      )}
    </svg>
  );
}

function PlatformDetails({
  platform,
  analysis,
  onClose,
}: {
  platform: TargetPlatform;
  analysis: SceneAnalysis;
  onClose: () => void;
}) {
  const b = PLATFORM_BUDGETS[platform];
  const sliders = useSceneStore((s) => s.sliders);
  const usage = computeUsage(analysis, platform, sliders.vertexPrecision);
  const rows: Array<{
    label: string;
    pct: number;
    valueText: string;
    capText: string;
  }> = [
    {
      label: 'Triangles',
      pct: usage.tri,
      valueText: formatNumber(analysis.triangleCount),
      capText: formatNumber(b.tris),
    },
    {
      label: 'Largest Tex',
      pct: usage.tex,
      valueText:
        analysis.largestTextureDim > 0 ? `${analysis.largestTextureDim}px` : '—',
      capText: `${b.tex}px`,
    },
    {
      label: 'Vertex Mem',
      pct: usage.vmem,
      valueText: formatBytes(usage.vmemBytes),
      capText: formatBytes(b.vertexMem),
    },
  ];
  const fits = usage.max <= 1.0;
  return (
    <div className="mt-2 rounded border border-accent/30 bg-bg/50 p-2 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-semibold text-text">{b.label}</span>
        <div className="flex items-center gap-1.5">
          <span
            className={[
              'text-[8px] font-bold uppercase tracking-wider px-1 py-0.5 rounded',
              fits
                ? 'bg-good/15 text-good border border-good/30'
                : 'bg-bad/15 text-bad border border-bad/30',
            ].join(' ')}
          >
            {fits ? 'fits' : 'over'}
          </span>
          <button
            onClick={onClose}
            className="text-text-dim hover:text-text text-[11px] leading-none px-1"
            title="Collapse"
          >
            ×
          </button>
        </div>
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <DetailRow key={r.label} {...r} />
        ))}
      </div>
    </div>
  );
}

function DetailRow({
  label,
  pct,
  valueText,
  capText,
}: {
  label: string;
  pct: number;
  valueText: string;
  capText: string;
}) {
  // pct is usage (% of budget consumed). Bar shows compatibility (battery
  // model) — full + green = lots of room, empty + red = no room / over cap.
  // Matches the ring on top so the panel reads consistently.
  const score = Math.max(0, 1 - pct);
  const over = pct > 1.0;
  const fillWidth = `${(score * 100).toFixed(1)}%`;
  const color = compatibilityColor(score, over);
  return (
    <div className="space-y-0.5">
      <div className="flex items-baseline justify-between text-[9px] gap-2">
        <span className="text-text-dim">{label}</span>
        <span className="font-mono tabular-nums">
          <span style={{ color }}>{valueText}</span>
          <span className="text-text-dim"> / {capText}</span>
        </span>
      </div>
      <div className="h-1 rounded-full bg-bg-border/60 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: fillWidth,
            backgroundColor: color,
            transition: 'width 200ms ease, background-color 200ms ease',
          }}
        />
      </div>
    </div>
  );
}

function formatSliderValue(
  key: keyof SliderConfig,
  value: number,
  original: SceneAnalysis | null,
  predicted: SceneAnalysis | null
): string {
  if (!original || !predicted) return '';
  switch (key) {
    case 'geometryDensity':
      return `${formatNumber(original.triangleCount)} → ${formatNumber(predicted.triangleCount)} tris`;
    case 'textureQuality': {
      if (original.largestTextureDim <= 0) return '';
      return `${original.largestTextureDim}px → ${predicted.largestTextureDim}px`;
    }
    case 'vertexPrecision':
      return `${bytesPerVertexAt(1).toFixed(0)} → ${bytesPerVertexAt(value).toFixed(0)} bytes/vertex`;
    default:
      return '';
  }
}
