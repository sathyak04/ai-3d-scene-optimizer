/**
 * Structural Similarity Index (SSIM) — perceptual similarity between two
 * equally-sized RGBA images.
 *
 * Implementation notes:
 *  - Uses *windowed* SSIM (8×8 patches, the academic standard) rather than a
 *    single global statistic. Windowed SSIM is sensitive to local damage —
 *    holes, tears, missing polygons — which a global SSIM averages away.
 *  - Final score weights the worst-decile patch scores so a few catastrophic
 *    regions can pull the overall fidelity number down. A clean image with
 *    one ugly hole shouldn't grade "excellent".
 *
 * Score range: -1.0 to 1.0 (1.0 = identical).
 */

const K1 = 0.01;
const K2 = 0.03;
const L = 255;
const C1 = (K1 * L) ** 2;
const C2 = (K2 * L) ** 2;
const WINDOW = 8;

function toLuminance(rgba: Uint8ClampedArray): Float32Array {
  const out = new Float32Array(rgba.length / 4);
  for (let i = 0, j = 0; i < rgba.length; i += 4, j++) {
    // BT.601 luma
    out[j] = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
  }
  return out;
}

/**
 * Compute SSIM between two equally-sized RGBA buffers. Both buffers must have
 * length = width × height × 4 (e.g., the output of canvas.getImageData).
 *
 * The image dimensions are inferred assuming a square buffer; pass an explicit
 * width/height if you have non-square images.
 */
export function ssim(
  a: Uint8ClampedArray,
  b: Uint8ClampedArray,
  width?: number,
  height?: number
): number {
  if (a.length !== b.length) {
    throw new Error(`SSIM size mismatch: ${a.length} vs ${b.length}`);
  }
  const pixelCount = a.length / 4;
  const w = width ?? Math.round(Math.sqrt(pixelCount));
  const h = height ?? Math.round(Math.sqrt(pixelCount));
  if (w * h !== pixelCount) {
    throw new Error('SSIM: cannot infer non-square dimensions');
  }

  const aL = toLuminance(a);
  const bL = toLuminance(b);

  const windowScores: number[] = [];
  const winSize = WINDOW * WINDOW;

  for (let wy = 0; wy + WINDOW <= h; wy += WINDOW) {
    for (let wx = 0; wx + WINDOW <= w; wx += WINDOW) {
      let muA = 0;
      let muB = 0;
      for (let dy = 0; dy < WINDOW; dy++) {
        const row = (wy + dy) * w + wx;
        for (let dx = 0; dx < WINDOW; dx++) {
          muA += aL[row + dx];
          muB += bL[row + dx];
        }
      }
      muA /= winSize;
      muB /= winSize;

      let varA = 0;
      let varB = 0;
      let cov = 0;
      for (let dy = 0; dy < WINDOW; dy++) {
        const row = (wy + dy) * w + wx;
        for (let dx = 0; dx < WINDOW; dx++) {
          const da = aL[row + dx] - muA;
          const db = bL[row + dx] - muB;
          varA += da * da;
          varB += db * db;
          cov += da * db;
        }
      }
      varA /= winSize - 1;
      varB /= winSize - 1;
      cov /= winSize - 1;

      const numerator = (2 * muA * muB + C1) * (2 * cov + C2);
      const denominator =
        (muA * muA + muB * muB + C1) * (varA + varB + C2);
      const score = denominator === 0 ? 1 : numerator / denominator;
      windowScores.push(score);
    }
  }

  if (windowScores.length === 0) return 1;

  // Mean across all windows = "average similarity"
  let meanScore = 0;
  for (const s of windowScores) meanScore += s;
  meanScore /= windowScores.length;

  // Worst-decile mean = sensitivity to local damage. A few catastrophically
  // broken patches show up here even when the global average is high.
  const sorted = [...windowScores].sort((a, b) => a - b);
  const decileCount = Math.max(1, Math.floor(sorted.length * 0.1));
  let worstMean = 0;
  for (let i = 0; i < decileCount; i++) worstMean += sorted[i];
  worstMean /= decileCount;

  // Weighted blend: 60% overall similarity + 40% worst-region. Tuned so that
  // a clean image with visible holes / tears scores in the 0.6-0.8 range.
  return 0.6 * meanScore + 0.4 * worstMean;
}

/**
 * Per-platform fidelity thresholds. The same SSIM score grades differently
 * by target platform: aggressive Mobile optimization is *expected* to drop
 * fidelity vs. the original, so 0.7 against the original is "good for
 * Mobile" but "degraded for High PC". Tuned against typical decimation
 * + texture downsampling outputs at each platform's recommended budget.
 */
export type QualityPlatform = 'mobile' | 'VR' | 'midPC' | 'highPC';

const QUALITY_THRESHOLDS: Record<
  QualityPlatform,
  { excellent: number; good: number; acceptable: number; degraded: number }
> = {
  mobile: { excellent: 0.8, good: 0.6, acceptable: 0.45, degraded: 0.3 },
  VR: { excellent: 0.83, good: 0.65, acceptable: 0.5, degraded: 0.35 },
  midPC: { excellent: 0.92, good: 0.82, acceptable: 0.7, degraded: 0.55 },
  highPC: { excellent: 0.96, good: 0.9, acceptable: 0.8, degraded: 0.65 },
};

export function describeQuality(
  score: number,
  platform: QualityPlatform
): {
  label: string;
  tone: 'good' | 'warn' | 'bad';
} {
  const t = QUALITY_THRESHOLDS[platform];
  if (score >= t.excellent) return { label: 'excellent', tone: 'good' };
  if (score >= t.good) return { label: 'good', tone: 'good' };
  if (score >= t.acceptable) return { label: 'acceptable', tone: 'warn' };
  if (score >= t.degraded) return { label: 'degraded', tone: 'warn' };
  return { label: 'unacceptable', tone: 'bad' };
}
