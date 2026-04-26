import * as THREE from 'three';

const TEX_PROPS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'emissiveMap',
  'aoMap',
  'alphaMap',
  'bumpMap',
] as const;

const TEX_RATIOS = [1.0, 0.5, 0.25, 0.125] as const;

type Mat = THREE.Material;

export function pickTextureLODIndex(textureQualitySlider: number): number {
  const t = clamp01(1 - textureQualitySlider);
  return Math.round(t * (TEX_RATIOS.length - 1));
}

export function pickTextureRatio(textureQualitySlider: number): number {
  return TEX_RATIOS[pickTextureLODIndex(textureQualitySlider)];
}

/**
 * For every texture used by every material under root, precompute downscaled
 * versions at 50% / 25% / 12.5% of original size. Variants are stored on
 * `texture.userData.__lods` (so shared textures are only processed once).
 *
 * Each material gets its `userData.__originalTextures` set so we can always
 * find the source texture for each property even after swapping.
 */
export async function precomputeTextureLODs(root: THREE.Object3D): Promise<void> {
  const materials = collectMaterials(root);

  for (const mat of materials) {
    if (mat.userData.__originalTextures) continue;
    const originals: Record<string, THREE.Texture> = {};

    for (const prop of TEX_PROPS) {
      const tex = (mat as unknown as Record<string, unknown>)[prop] as THREE.Texture | null | undefined;
      if (!tex || !(tex as THREE.Texture).isTexture) continue;
      originals[prop] = tex;

      if (!tex.userData.__lods) {
        const variants: THREE.Texture[] = [tex];
        for (let i = 1; i < TEX_RATIOS.length; i++) {
          const ds = await downscaleTexture(tex, TEX_RATIOS[i]);
          if (ds) variants.push(ds);
        }
        tex.userData.__lods = variants;
      }
      await new Promise<void>((r) => setTimeout(r, 0));
    }
    mat.userData.__originalTextures = originals;
  }
}

/**
 * Swap each material's texture properties to the LOD variant matching the
 * current slider value. Cheap — just changes references on already-uploaded
 * textures.
 */
export function applyTextureLOD(root: THREE.Object3D, textureQualitySlider: number): void {
  const idx = pickTextureLODIndex(textureQualitySlider);
  const materials = collectMaterials(root);

  for (const mat of materials) {
    const originals = mat.userData.__originalTextures as Record<string, THREE.Texture> | undefined;
    if (!originals) continue;
    let changed = false;
    for (const prop in originals) {
      const source = originals[prop];
      const variants = source.userData.__lods as THREE.Texture[] | undefined;
      if (!variants) continue;
      const target = variants[Math.min(idx, variants.length - 1)] ?? source;
      const current = (mat as unknown as Record<string, unknown>)[prop];
      if (current !== target) {
        (mat as unknown as Record<string, THREE.Texture>)[prop] = target;
        changed = true;
      }
    }
    if (changed) mat.needsUpdate = true;
  }
}

async function downscaleTexture(tex: THREE.Texture, ratio: number): Promise<THREE.Texture | null> {
  const img = tex.image as { width?: number; height?: number } | null;
  if (!img || !img.width || !img.height) return null;

  const w = Math.max(8, Math.round(img.width * ratio));
  const h = Math.max(8, Math.round(img.height * ratio));

  let bitmap: ImageBitmap;
  try {
    if (
      img instanceof ImageBitmap ||
      img instanceof HTMLImageElement ||
      img instanceof HTMLCanvasElement ||
      (typeof OffscreenCanvas !== 'undefined' && img instanceof OffscreenCanvas)
    ) {
      bitmap = await createImageBitmap(img as ImageBitmapSource, {
        resizeWidth: w,
        resizeHeight: h,
        resizeQuality: 'medium',
      });
    } else {
      return null;
    }
  } catch (e) {
    console.warn('downscaleTexture failed', e);
    return null;
  }

  const newTex = new THREE.Texture();
  newTex.image = bitmap;
  newTex.colorSpace = tex.colorSpace;
  newTex.wrapS = tex.wrapS;
  newTex.wrapT = tex.wrapT;
  newTex.magFilter = tex.magFilter;
  newTex.minFilter = tex.minFilter;
  newTex.flipY = tex.flipY;
  newTex.needsUpdate = true;
  return newTex;
}

/**
 * Walks meshes and collects unique materials, also reaching into
 * `mesh.userData.__realMaterial` so wireframe-mode swaps don't hide them.
 */
function collectMaterials(root: THREE.Object3D): Mat[] {
  const set = new Set<Mat>();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const real = obj.userData.__realMaterial as Mat | Mat[] | undefined;
    const candidate = real ?? obj.material;
    const mats = Array.isArray(candidate) ? candidate : [candidate];
    for (const m of mats) if (m) set.add(m);
  });
  return [...set];
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export { collectMaterials };
