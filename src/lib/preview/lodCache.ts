import * as THREE from 'three';
import { MeshoptSimplifier } from 'meshoptimizer';
import { mergeVertices } from 'three-stdlib';

/**
 * 20 LOD ratios on an exponential curve from 1.0 down to 0.0015. Linear
 * distributions waste the upper half of the slider on barely-visible
 * reductions; exponential keeps tri count visibly halving every few steps.
 */
export const LOD_RATIOS = (() => {
  const N = 20;
  const FLOOR = 0.0015;
  return Array.from({ length: N }, (_, i) =>
    Math.pow(FLOOR, i / (N - 1))
  );
})();

const MIN_TRIANGLES = 100;
const MIN_INDICES = MIN_TRIANGLES * 3;

export function pickLODIndex(geometryDensitySlider: number): number {
  const total = LOD_RATIOS.length;
  const t = clamp01(1 - geometryDensitySlider);
  return Math.round(t * (total - 1));
}

export function pickLODRatio(geometryDensitySlider: number): number {
  return LOD_RATIOS[pickLODIndex(geometryDensitySlider)];
}

/**
 * For each Mesh under root, precompute LOD geometries and stash them in
 * `mesh.userData.__lods`. Yields between LOD levels so the main thread
 * stays responsive enough to keep the viewer animating.
 */
export async function precomputeLODs(root: THREE.Object3D): Promise<void> {
  await MeshoptSimplifier.ready;

  const meshes: THREE.Mesh[] = [];
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) meshes.push(obj);
  });

  for (const mesh of meshes) {
    if (mesh.userData.__lods) continue;
    const originalGeom = mesh.geometry;
    if (!originalGeom || !originalGeom.attributes.position) continue;
    const isSkinned = (mesh as THREE.SkinnedMesh).isSkinnedMesh === true;

    // Build a separate "merged base" used ONLY for lower-LOD simplification
    // input. The pristine originalGeom is kept untouched so slider 100%
    // shows the real asset (no mergeVertices artifacts like seam holes).
    let mergedBase = originalGeom;
    try {
      const merged = mergeVertices(originalGeom, 0.02);
      if (
        !originalGeom.index ||
        merged.attributes.position.count <
          (originalGeom.attributes.position?.count ?? Infinity)
      ) {
        mergedBase = merged;
      }
    } catch (e) {
      console.warn('mergeVertices failed for mesh', mesh.name, e);
    }

    const lods: THREE.BufferGeometry[] = [];
    for (const ratio of LOD_RATIOS) {
      try {
        const lod =
          ratio >= 0.99
            ? originalGeom
            : simplifyGeometry(mergedBase, ratio, isSkinned);
        lods.push(lod);
      } catch (e) {
        console.warn('LOD simplify failed for mesh', mesh.name, e);
        lods.push(originalGeom);
      }
      // Yield to keep the main thread breathing
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    mesh.userData.__lods = lods;
  }
}

function simplifyGeometry(
  geom: THREE.BufferGeometry,
  ratio: number,
  isSkinned: boolean
): THREE.BufferGeometry {
  const positionAttr = geom.attributes.position;
  const positions = positionAttr.array as Float32Array;

  let originalIndices: Uint32Array;
  if (geom.index) {
    const idx = geom.index.array;
    originalIndices = idx instanceof Uint32Array ? idx : new Uint32Array(idx);
  } else {
    originalIndices = new Uint32Array(positionAttr.count);
    for (let i = 0; i < originalIndices.length; i++) originalIndices[i] = i;
  }

  // meshoptimizer requires target_index_count to be a multiple of 3.
  const targetRaw = Math.max(
    MIN_INDICES,
    Math.floor(originalIndices.length * ratio)
  );
  const targetIndexCount = targetRaw - (targetRaw % 3);
  if (targetIndexCount >= originalIndices.length) return geom;

  // Primary pass: high-quality simplify
  const flags = (isSkinned ? ['LockBorder'] : []) as unknown as never[];
  const primary = MeshoptSimplifier.simplify(
    originalIndices,
    positions,
    3,
    targetIndexCount,
    1.0,
    flags
  );
  let simplified = primary[0];

  // Iterative simplifySloppy fallback (non-skinned only). Each pass clusters
  // further on the previous output, until target reached or no progress.
  if (
    !isSkinned &&
    typeof (MeshoptSimplifier as { simplifySloppy?: unknown }).simplifySloppy ===
      'function'
  ) {
    try {
      const sloppyFn = (
        MeshoptSimplifier as unknown as {
          simplifySloppy: (
            i: Uint32Array,
            p: Float32Array,
            s: number,
            t: number,
            e?: number
          ) => [Uint32Array, number];
        }
      ).simplifySloppy;
      let workingIndices = originalIndices;
      for (let pass = 0; pass < 5; pass++) {
        const result = sloppyFn(workingIndices, positions, 3, targetIndexCount);
        if (
          !result[0] ||
          result[0].length === 0 ||
          result[0].length >= workingIndices.length
        )
          break;
        workingIndices = result[0];
        if (workingIndices.length <= targetIndexCount) break;
      }
      if (workingIndices.length > 0 && workingIndices.length < simplified.length) {
        simplified = workingIndices;
      }
    } catch {
      /* keep simplify result */
    }
  }

  const lod = new THREE.BufferGeometry();
  for (const name in geom.attributes) {
    lod.setAttribute(name, geom.attributes[name]);
  }
  lod.setIndex(new THREE.BufferAttribute(simplified, 1));
  if (geom.boundingBox) lod.boundingBox = geom.boundingBox.clone();
  if (geom.boundingSphere) lod.boundingSphere = geom.boundingSphere.clone();
  return lod;
}

export function applyLOD(root: THREE.Object3D, lodIndex: number): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const lods = obj.userData.__lods as THREE.BufferGeometry[] | undefined;
      if (lods && lods[lodIndex]) {
        obj.geometry = lods[lodIndex];
      }
    }
  });
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
