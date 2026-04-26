import * as THREE from 'three';

const NORMAL_MAP_SIZE = 256;

/**
 * Build a procedural normal map: noise-based height field, then per-pixel
 * gradients encoded as RGB (XY = derivatives, Z = 1.0). Pair with
 * `MeshStandardMaterial.normalMap` and modulate `normalScale` from the
 * material slider to control how rocky/bumpy the surface looks.
 */
function buildNormalMap(): THREE.CanvasTexture {
  const size = NORMAL_MAP_SIZE;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return new THREE.CanvasTexture(canvas);

  // Step 1: build a heightmap using a sum of sine waves at different freqs.
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const v =
        Math.sin(x * 0.21 + y * 0.13) * 0.5 +
        Math.sin(x * 0.07 - y * 0.09) * 0.7 +
        Math.sin((x + y) * 0.31) * 0.3 +
        Math.sin((x * 0.4) * Math.cos(y * 0.4)) * 0.4;
      height[y * size + x] = v;
    }
  }

  // Step 2: derive normals by sampling neighbors and taking gradients.
  const data = ctx.createImageData(size, size);
  const sampleH = (x: number, y: number) => {
    const xx = (x + size) % size;
    const yy = (y + size) % size;
    return height[yy * size + xx];
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = sampleH(x + 1, y) - sampleH(x - 1, y);
      const dy = sampleH(x, y + 1) - sampleH(x, y - 1);
      // Normalize a vector (-dx, -dy, 1) and encode to [0..255]
      const nx = -dx;
      const ny = -dy;
      const nz = 1;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
      const r = (nx / len) * 0.5 + 0.5;
      const g = (ny / len) * 0.5 + 0.5;
      const b = (nz / len) * 0.5 + 0.5;
      const i = (y * size + x) * 4;
      data.data[i] = Math.floor(r * 255);
      data.data[i + 1] = Math.floor(g * 255);
      data.data[i + 2] = Math.floor(b * 255);
      data.data[i + 3] = 255;
    }
  }
  ctx.putImageData(data, 0, 0);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 2);
  tex.needsUpdate = true;
  return tex;
}

let CACHED_NORMAL_MAP: THREE.CanvasTexture | null = null;

export function getProceduralNormalMap(): THREE.CanvasTexture {
  if (CACHED_NORMAL_MAP) return CACHED_NORMAL_MAP;
  CACHED_NORMAL_MAP = buildNormalMap();
  return CACHED_NORMAL_MAP;
}

const MAX_NORMAL_SCALE = 2.0;

export function pickNormalScale(materialComplexitySlider: number): number {
  const t = clamp01(materialComplexitySlider);
  return t * MAX_NORMAL_SCALE;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
