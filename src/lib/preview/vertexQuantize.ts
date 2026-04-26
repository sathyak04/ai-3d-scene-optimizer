import * as THREE from 'three';

const ORIG_POS_KEY = '__origPositions';
const ORIG_BBOX_KEY = '__origBBoxExtent';

/**
 * Cache pristine vertex positions on each Mesh's geometry so that vertex
 * precision can quantize from the original each time (instead of compounding).
 */
export function cacheOriginalPositions(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geom = obj.geometry as THREE.BufferGeometry | undefined;
    if (!geom) return;
    const posAttr = geom.getAttribute('position') as
      | THREE.BufferAttribute
      | undefined;
    if (!posAttr) return;

    if (!geom.userData[ORIG_POS_KEY]) {
      const arr = posAttr.array as Float32Array;
      geom.userData[ORIG_POS_KEY] = new Float32Array(arr); // deep copy
      // bbox extent for proportional snapping
      if (!geom.boundingBox) geom.computeBoundingBox();
      const bb = geom.boundingBox!;
      const size = new THREE.Vector3();
      bb.getSize(size);
      geom.userData[ORIG_BBOX_KEY] = Math.max(size.x, size.y, size.z) || 1;
    }
  });
}

/**
 * Apply vertex precision quantization. precision = 1.0 keeps the original
 * positions; lower values snap each coordinate to a coarser grid producing
 * progressive PS1-style jitter on curved surfaces.
 *
 * The grid step is proportional to each mesh's bounding-box max extent so
 * the visual effect is consistent across asset scales.
 */
export function applyVertexPrecision(
  root: THREE.Object3D,
  precision: number
): void {
  // Map slider to fraction-of-bbox grid step.
  // 1.0 → 0 (no snapping, original positions)
  // 0.5 → ~0.005 of bbox extent (mild jitter)
  // 0.0 → ~0.04 of bbox extent (very visible PS1 jitter)
  const t = 1 - Math.max(0, Math.min(1, precision));
  const fractionStep = t * t * 0.04;

  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const geom = obj.geometry as THREE.BufferGeometry | undefined;
    if (!geom) return;
    const posAttr = geom.getAttribute('position') as
      | THREE.BufferAttribute
      | undefined;
    const original = geom.userData[ORIG_POS_KEY] as Float32Array | undefined;
    const extent = geom.userData[ORIG_BBOX_KEY] as number | undefined;
    if (!posAttr || !original || !extent) return;

    const dst = posAttr.array as Float32Array;
    const len = Math.min(dst.length, original.length);

    if (fractionStep <= 0) {
      // restore originals
      dst.set(original.subarray(0, len));
    } else {
      const step = fractionStep * extent;
      const inv = 1 / step;
      for (let i = 0; i < len; i++) {
        dst[i] = Math.round(original[i] * inv) * step;
      }
    }
    posAttr.needsUpdate = true;
    geom.computeVertexNormals(); // re-derive normals after position change
    geom.computeBoundingSphere();
  });
}

/**
 * Effective bytes-per-vertex at the current precision level. Used to compute
 * vertex-buffer memory usage for the platform budget.
 *
 *  1.0 → 48 bytes/vertex  (fp32 pos + fp32 normal + fp32 UV + fp32 tangent)
 *  0.5 → 24 bytes/vertex  (half-floats)
 *  0.0 → 12 bytes/vertex  (8-bit quantized + oct-encoded normals)
 */
export function bytesPerVertexAt(precision: number): number {
  const p = Math.max(0, Math.min(1, precision));
  return 12 + p * 36; // 12 → 48
}
