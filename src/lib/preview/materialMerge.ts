import * as THREE from 'three';
import { collectMaterials } from './textureCache';

type ColoredMaterial = THREE.Material & { color: THREE.Color };

/**
 * Apply a "merge similar materials" preview by clustering each material's
 * base color into K groups (K shrinks as the slider drops) and replacing each
 * group's color with that cluster's mean. Visual approximation of "fewer
 * distinct materials in the scene."
 */
export function applyMaterialMerge(
  root: THREE.Object3D,
  materialComplexitySlider: number
): void {
  const materials = collectMaterials(root).filter(hasColor);
  if (materials.length === 0) return;

  if (materialComplexitySlider >= 0.99) {
    // Restore original colors
    for (const mat of materials) {
      const orig = mat.userData.__originalColor as THREE.Color | undefined;
      if (orig) mat.color.copy(orig);
    }
    return;
  }

  const targetClusters = Math.max(
    1,
    Math.ceil(materials.length * materialComplexitySlider)
  );

  if (targetClusters >= materials.length) {
    for (const mat of materials) {
      const orig = mat.userData.__originalColor as THREE.Color | undefined;
      if (orig) mat.color.copy(orig);
    }
    return;
  }

  // Sort by lightness so visually-similar shades end up in the same bucket
  const sorted = [...materials]
    .filter((m) => m.userData.__originalColor)
    .sort(
      (a, b) =>
        getLightness(a.userData.__originalColor as THREE.Color) -
        getLightness(b.userData.__originalColor as THREE.Color)
    );

  for (let k = 0; k < targetClusters; k++) {
    const start = Math.floor((k * sorted.length) / targetClusters);
    const end = Math.floor(((k + 1) * sorted.length) / targetClusters);
    if (end <= start) continue;

    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      const orig = sorted[i].userData.__originalColor as THREE.Color;
      r += orig.r;
      g += orig.g;
      b += orig.b;
      count++;
    }
    const cr = r / count;
    const cg = g / count;
    const cb = b / count;
    for (let i = start; i < end; i++) {
      sorted[i].color.setRGB(cr, cg, cb);
    }
  }
}

/**
 * Cache each material's original `.color` so we can restore or cluster it
 * later. Idempotent — call this once on every cloned mesh's materials.
 */
export function cacheOriginalColors(root: THREE.Object3D): void {
  const materials = collectMaterials(root).filter(hasColor);
  for (const mat of materials) {
    if (!mat.userData.__originalColor) {
      mat.userData.__originalColor = mat.color.clone();
    }
  }
}

/**
 * Same merge logic as `applyMaterialMerge`, but takes an explicit array of
 * materials rather than walking a scene tree. Use when you already have the
 * materials in hand (e.g. a procedural multi-material mesh) and don't want
 * to risk re-parenting the mesh away from R3F's scene to traverse.
 */
export function mergeMaterialColors(
  materials: THREE.Material[],
  materialComplexitySlider: number
): void {
  const colored = materials.filter(hasColor);
  if (colored.length === 0) return;

  for (const mat of colored) {
    if (!mat.userData.__originalColor) {
      mat.userData.__originalColor = mat.color.clone();
    }
  }

  if (materialComplexitySlider >= 0.99) {
    for (const mat of colored) {
      const orig = mat.userData.__originalColor as THREE.Color | undefined;
      if (orig) mat.color.copy(orig);
    }
    return;
  }

  const targetClusters = Math.max(
    1,
    Math.ceil(colored.length * materialComplexitySlider)
  );

  if (targetClusters >= colored.length) {
    for (const mat of colored) {
      const orig = mat.userData.__originalColor as THREE.Color | undefined;
      if (orig) mat.color.copy(orig);
    }
    return;
  }

  const sorted = [...colored].sort(
    (a, b) =>
      getLightness(a.userData.__originalColor as THREE.Color) -
      getLightness(b.userData.__originalColor as THREE.Color)
  );

  for (let k = 0; k < targetClusters; k++) {
    const start = Math.floor((k * sorted.length) / targetClusters);
    const end = Math.floor(((k + 1) * sorted.length) / targetClusters);
    if (end <= start) continue;
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = start; i < end; i++) {
      const orig = sorted[i].userData.__originalColor as THREE.Color;
      r += orig.r;
      g += orig.g;
      b += orig.b;
      count++;
    }
    const cr = r / count;
    const cg = g / count;
    const cb = b / count;
    for (let i = start; i < end; i++) {
      sorted[i].color.setRGB(cr, cg, cb);
    }
  }
}

function hasColor(m: THREE.Material): m is ColoredMaterial {
  return 'color' in m && (m as { color?: unknown }).color instanceof THREE.Color;
}

function getLightness(c: THREE.Color): number {
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  // Mostly lightness, with hue as a secondary tiebreaker so different hues
  // at the same lightness still land in different buckets when possible.
  return hsl.l + hsl.h * 0.001;
}
