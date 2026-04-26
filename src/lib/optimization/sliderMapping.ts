import type { SliderConfig } from '@/store/sceneStore';

/**
 * Map the geometryDensity slider (0=aggressive, 1=preserve) to the
 * fraction of triangles to retain. For rigged meshes we cap reduction at 30%
 * (i.e. retain >= 70%) so animation integrity isn't destroyed.
 */
export function geometryRatio(slider: number, isRigged: boolean): number {
  const target = 0.1 + 0.9 * clamp01(slider);
  return isRigged ? Math.max(0.7, target) : target;
}

/**
 * Map the textureQuality slider (0=tiny, 1=full) to a dimension multiplier.
 * 0 → 1/8 of original side length, 1 → unchanged.
 */
export function textureMultiplier(slider: number): number {
  return 0.125 + 0.875 * clamp01(slider);
}

/**
 * Map materialComplexity to flags controlling what runs in the cleanup pass.
 * - dedup + prune always run (free wins)
 * - At low values, also run weld() to merge co-located vertices
 */
export function materialFlags(slider: number) {
  const v = clamp01(slider);
  return {
    dedup: true,
    prune: true,
    weld: v < 0.5,
  };
}

export function describeSliders(s: SliderConfig, isRigged: boolean) {
  const ratio = geometryRatio(s.geometryDensity, isRigged);
  const tex = textureMultiplier(s.textureQuality);
  const flags = materialFlags(s.vertexPrecision);
  return {
    targetGeometryRetained: Math.round(ratio * 100),
    textureScale: Math.round(tex * 100),
    weldEnabled: flags.weld,
    riggedCapped: isRigged && ratio === 0.7 && s.geometryDensity < 0.66,
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
