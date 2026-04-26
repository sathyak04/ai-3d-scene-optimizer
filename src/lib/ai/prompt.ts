import type { SceneAnalysis } from '@/lib/analysis/types';

export type TargetPlatform = 'mobile' | 'midPC' | 'highPC' | 'VR';

// Per-asset (single hero asset) budgets — what one prop/character should cost.
// Calibrated against published guidance from Apple Metal Best Practices,
// Meta Quest dev docs, Unity HDRP recommendations, and shipped-title GDC talks.
//
// vertexMem = max acceptable vertex-buffer size *per asset* in bytes.
// Real values map to common Draco / meshopt quantization budgets:
//   Mobile:   0.5 MB → forces aggressive 8-bit position quantization on heavy meshes
//   VR:       1.0 MB → similar mobile-tier vertex precision required
//   Mid PC:   4.0 MB → tolerates half-float precision
//   High PC:  16  MB → fp32 positions OK for hero assets
export const PLATFORM_BUDGETS: Record<
  TargetPlatform,
  { tris: number; tex: number; vertexMem: number; label: string }
> = {
  mobile: { tris: 25_000, tex: 1024, vertexMem: 0.5 * 1024 * 1024, label: 'Mobile (iOS / Android)' },
  VR: { tris: 50_000, tex: 1024, vertexMem: 1.0 * 1024 * 1024, label: 'VR (Quest 3 / similar)' },
  midPC: { tris: 200_000, tex: 2048, vertexMem: 4.0 * 1024 * 1024, label: 'Mid-range PC' },
  highPC: { tris: 1_000_000, tex: 4096, vertexMem: 16 * 1024 * 1024, label: 'High-end PC' },
};

export const SYSTEM_PROMPT = `You are a 3D asset optimization advisor for game developers.

You will receive a JSON describing a 3D asset and a target platform. Your job is to:
1. Diagnose what's wrong (or right) about the asset for that platform
2. Recommend slider values to bring it within budget
3. Explain your reasoning concisely

Slider semantics (all values are 0.0 to 1.0):
- geometryDensity: triangle count. 1.0 = full quality (original), 0.5 ≈ half triangles, 0.0 ≈ 100 triangle minimum
- textureQuality: texture resolution. 1.0 = original, 0.0 ≈ 12.5% (8x smaller)
- vertexPrecision: vertex-position fidelity (Draco / meshopt-style quantization). 1.0 = fp32 positions (48 B/vertex), 0.5 = half-float (24 B/vertex), 0.0 = 8-bit quantized (12 B/vertex, visible PS1-style jitter)

Per-asset budgets (one hero asset / character / prop). Vertex-memory caps
reflect realistic per-asset vertex-buffer size after Draco / meshopt
compression at the platform's typical precision tier:
- mobile: 25,000 tris, 1024px textures, 0.5 MB vertex memory
- VR: 50,000 tris, 1024px textures, 1.0 MB vertex memory (low-latency requirement)
- midPC: 200,000 tris, 2048px textures, 4.0 MB vertex memory
- highPC: 1,000,000 tris, 4096px textures, 16 MB vertex memory

The vertex-memory budget is driven by vertex count × bytes-per-vertex. Lower
vertexPrecision means fewer bytes per vertex (12 → 48), which scales the
asset's vertex memory linearly.

Be specific with numbers. Reference the actual triangle count and texture sizes you see.

If a "currentState" field is present, the user has manually adjusted the sliders. In that case:
- Diagnose the CURRENT state against the budget (do they fit now? what's still over?)
- Your "preset" should be your fresh recommendation from the original (NOT the current sliders)
- Acknowledge whether the user's current settings already meet the budget

If "currentState.visualIntegrity" is present, it is a windowed-SSIM score
(0–1) comparing the live render against the untouched original. Lower
numbers signal possible *hole-like damage* in the optimized output (missing
polygons, torn surfaces). Use these guidelines:
- < 0.5 on Mobile/VR or < 0.7 on Mid/High PC → likely visible holes; warn
  the user and recommend less aggressive geometry settings.
- 0.5–0.8 on Mobile/VR or 0.7–0.9 on Mid/High PC → expected for that tier,
  no warning needed.
Mention visualIntegrity in your diagnosis only if it indicates a problem.

Respond ONLY with valid JSON in this exact structure (no markdown, no preamble):
{
  "diagnosis": "1-2 sentence diagnosis citing actual numbers",
  "recommendation": "1 sentence — what slider settings to apply and why",
  "reasoning": "2-3 sentence explanation tying preset values to budget targets",
  "preset": {
    "geometryDensity": <0.0-1.0>,
    "textureQuality": <0.0-1.0>,
    "vertexPrecision": <0.0-1.0>
  }
}`;

export type CurrentStateContext = {
  sliders: { geometryDensity: number; textureQuality: number; vertexPrecision: number };
  effective: SceneAnalysis;
  /** Windowed-SSIM perceptual similarity to the untouched original (0..1). */
  visualIntegrity?: number | null;
};

/**
 * Compact a SceneAnalysis into the JSON the LLM should reason over.
 * We strip noisy fields and keep just what affects optimization decisions.
 *
 * If `current` is supplied, we also include the post-slider state so the AI
 * can diagnose where the user currently sits relative to the target budget.
 */
export function buildContext(
  analysis: SceneAnalysis,
  target: TargetPlatform,
  current?: CurrentStateContext
): {
  asset: Record<string, unknown>;
  target: { name: string } & (typeof PLATFORM_BUDGETS)[TargetPlatform];
  currentState?: Record<string, unknown>;
} {
  const ctx: ReturnType<typeof buildContext> = {
    asset: {
      sceneType: analysis.sceneType,
      triangleCount: analysis.triangleCount,
      vertexCount: analysis.vertexCount,
      meshCount: analysis.meshCount,
      materialCount: analysis.materialCount,
      textureCount: analysis.textureCount,
      largestTextureDim: analysis.largestTextureDim,
      drawCallEstimate: analysis.drawCallEstimate,
      hasSkinning: analysis.hasSkinning,
      estimatedSizeBytes: analysis.estimatedSizeBytes,
      costScore: analysis.cost.total,
      issues: analysis.issues.map((i) => ({
        severity: i.severity,
        message: i.message,
      })),
    },
    target: {
      name: target,
      ...PLATFORM_BUDGETS[target],
    },
  };
  if (current) {
    ctx.currentState = {
      sliders: current.sliders,
      triangleCount: current.effective.triangleCount,
      largestTextureDim: current.effective.largestTextureDim,
      materialCount: current.effective.materialCount,
      drawCallEstimate: current.effective.drawCallEstimate,
      costScore: current.effective.cost.total,
    };
    if (current.visualIntegrity != null) {
      (ctx.currentState as Record<string, unknown>).visualIntegrity =
        Math.round(current.visualIntegrity * 100) / 100;
    }
  }
  return ctx;
}
