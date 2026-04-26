import type { AIResponse } from './responseSchema';
import type { TargetPlatform } from './prompt';
import type { BuiltInAssetKind } from '@/store/sceneStore';

type CacheKey = `${BuiltInAssetKind}_${TargetPlatform}`;

/**
 * Pre-recorded Groq responses for the 3 demo assets across all 4 platforms.
 * Used as a fallback when the live API call fails during the pitch.
 *
 * Triangle counts are approximate from baseline analysis:
 *   baseball ≈ 28k tris  (~56k verts, ~2.7 MB vertex mem at fp32)
 *   camera   ≈ 50k tris  (~100k verts, ~4.8 MB vertex mem at fp32)
 *   boulder  ≈ 130k tris (~260k verts, ~12.5 MB vertex mem at fp32)
 *
 * Per-asset budgets:
 *   Mobile  25k tris / 1024px / 0.5 MB vertex memory
 *   VR      50k tris / 1024px / 1.0 MB vertex memory
 *   Mid PC  200k tris / 2048px / 4 MB vertex memory
 *   High PC 1M tris / 4096px / 16 MB vertex memory
 */
export const FALLBACK_AI_CACHE: Record<CacheKey, AIResponse> = {
  // ─── BASEBALL (~28k tris, ~2.7MB vertex mem) ─────────────────────────────
  baseball_mobile: {
    diagnosis:
      'Baseball at ~28k triangles is just over Mobile\'s 25k cap, 2048px textures are 2x the 1024px Mobile cap, and ~2.7MB vertex memory is 5.4x the 0.5MB Mobile budget.',
    recommendation:
      'Drop geometry to ~50% (~14k tris) to roughly halve vertex count, halve textures, and quantize vertex precision to 8-bit (~0%).',
    reasoning:
      'Mobile budgets are tight on every axis. Geometry decimation alone halves vertex count; combined with 8-bit quantization (12 B/vertex), vertex memory drops well below 0.5MB. Halved textures meet the 1024px cap.',
    preset: { geometryDensity: 0.5, textureQuality: 0.5, vertexPrecision: 0.0 },
  },
  baseball_VR: {
    diagnosis:
      'Baseball fits VR on tris (28k vs 50k) but ~2.7MB vertex memory exceeds the 1MB VR cap, and 2048px textures double the 1024px VR cap.',
    recommendation:
      'Hold geometry at ~70%, halve textures, and lower vertex precision to ~30% (mid-range quantization).',
    reasoning:
      'VR vertex memory is the binding constraint. Mild geometry trim plus moderate quantization halves vertex memory without visible jitter at headset distance.',
    preset: { geometryDensity: 0.7, textureQuality: 0.5, vertexPrecision: 0.3 },
  },
  baseball_midPC: {
    diagnosis:
      'Baseball is well within Mid PC limits — 28k tris vs 200k cap, 2048px textures match the cap, and ~2.7MB vertex memory is 68% of the 4MB budget.',
    recommendation: 'Leave sliders at 100%; Mid PC ready.',
    reasoning:
      'No metric exceeds budget. Reduction would just sacrifice fidelity for no perf gain.',
    preset: { geometryDensity: 1.0, textureQuality: 1.0, vertexPrecision: 1.0 },
  },
  baseball_highPC: {
    diagnosis:
      'Baseball ships at full quality on High PC trivially — every metric is far below budget.',
    recommendation: 'Keep all sliders at 100%.',
    reasoning:
      'High-end PC budgets dwarf the asset cost. Any reduction would only hurt fidelity for no perf benefit.',
    preset: { geometryDensity: 1.0, textureQuality: 1.0, vertexPrecision: 1.0 },
  },

  // ─── CAMERA (~50k tris, ~4.8MB vertex mem) ───────────────────────────────
  camera_mobile: {
    diagnosis:
      'Vintage camera at ~50k tris is 2x Mobile\'s 25k cap; 2048px textures are 2x the 1024px cap; ~4.8MB vertex memory is ~10x the 0.5MB Mobile budget.',
    recommendation:
      'Drop geometry to ~40%, halve textures, and quantize vertex precision to 8-bit.',
    reasoning:
      'Mobile budgets are tight on every axis. 60% geometry reduction trims vertex count, 8-bit quantization (12 B/vertex) drops vertex memory ~4x further. Halved textures meet the cap.',
    preset: { geometryDensity: 0.4, textureQuality: 0.5, vertexPrecision: 0.0 },
  },
  camera_VR: {
    diagnosis:
      'Camera at ~50k tris sits at VR\'s tri cap exactly; ~4.8MB vertex memory is 4.8x the 1MB VR cap; 2k textures exceed the 1024px cap.',
    recommendation:
      'Drop geometry to ~50%, halve textures, and lower vertex precision to ~10%.',
    reasoning:
      'VR vertex memory drives this. Halved geometry plus aggressive quantization fits comfortably; halved textures meet the bandwidth cap.',
    preset: { geometryDensity: 0.5, textureQuality: 0.5, vertexPrecision: 0.1 },
  },
  camera_midPC: {
    diagnosis:
      'Camera fits Mid PC on tris (50k) and textures (2k), but ~4.8MB vertex memory is 1.2x the 4MB Mid PC budget.',
    recommendation:
      'Hold geometry/textures at 100%; drop vertex precision to ~70% to fit the vertex memory budget.',
    reasoning:
      'Vertex memory is the only constraint here. Half-float-ish precision (~32 B/vertex) cuts memory enough to fit while preserving sub-pixel vertex placement.',
    preset: { geometryDensity: 1.0, textureQuality: 1.0, vertexPrecision: 0.7 },
  },
  camera_highPC: {
    diagnosis:
      'Camera is High PC ready; budgets dwarf the asset cost (50k vs 1M tris, 4.8MB vs 16MB).',
    recommendation: 'Keep all sliders at 100%.',
    reasoning:
      'High-end PCs comfortably handle this asset at full fidelity.',
    preset: { geometryDensity: 1.0, textureQuality: 1.0, vertexPrecision: 1.0 },
  },

  // ─── BOULDER (~130k tris, ~12.5MB vertex mem) ────────────────────────────
  boulder_mobile: {
    diagnosis:
      'Boulder at ~130k tris is 5x Mobile\'s 25k cap; 2k textures double the 1024px cap; ~12.5MB vertex memory is 25x the 0.5MB Mobile budget.',
    recommendation:
      'Aggressive: geometry to ~15% (~20k tris), halve textures, and 8-bit vertex quantization.',
    reasoning:
      'Mobile cannot fit a 130k-tri scan. The boulder silhouette tolerates aggressive simplification because rock detail is texture-driven. 8-bit quantization compounds the savings.',
    preset: { geometryDensity: 0.15, textureQuality: 0.5, vertexPrecision: 0.0 },
  },
  boulder_VR: {
    diagnosis:
      'Boulder at ~130k tris is 2.6x VR\'s 50k cap; ~12.5MB vertex memory is 12.5x the 1MB VR cap; 2k textures exceed the 1024px cap.',
    recommendation:
      'Drop geometry to ~30% (~40k tris), halve textures, and quantize vertex precision to 8-bit.',
    reasoning:
      'VR runs 2x viewports per frame. Combined geometry reduction and aggressive quantization hits the vertex memory budget; halved textures protect bandwidth.',
    preset: { geometryDensity: 0.3, textureQuality: 0.5, vertexPrecision: 0.0 },
  },
  boulder_midPC: {
    diagnosis:
      'Boulder fits Mid PC on tris (130k vs 200k) and textures (2k), but ~12.5MB vertex memory is 3.1x the 4MB Mid PC budget.',
    recommendation:
      'Hold geometry/textures at 100%; drop vertex precision to ~10% to fit the vertex memory budget.',
    reasoning:
      'Vertex memory is the only constraint. Aggressive quantization (~14 B/vertex) cuts memory ~3.5x without affecting silhouette at typical viewing distance.',
    preset: { geometryDensity: 1.0, textureQuality: 1.0, vertexPrecision: 0.1 },
  },
  boulder_highPC: {
    diagnosis:
      'Boulder is well below High PC limits — 130k tris vs 1M cap, 2k textures vs 4096px, ~12.5MB vertex memory vs 16MB cap.',
    recommendation: 'Keep all sliders at 100%.',
    reasoning:
      'No metric exceeds budget. Reduction would just lower fidelity for no perf gain.',
    preset: { geometryDensity: 1.0, textureQuality: 1.0, vertexPrecision: 1.0 },
  },
};

export function getFallbackResponse(
  asset: BuiltInAssetKind | 'uploaded',
  platform: TargetPlatform
): AIResponse | null {
  if (asset === 'uploaded') return null;
  return FALLBACK_AI_CACHE[`${asset}_${platform}` as CacheKey] ?? null;
}
