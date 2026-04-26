import * as THREE from 'three';
import type { SceneAnalysis, Issue, SceneType, CostBreakdown } from './types';

type AnalyzeOptions = {
  sourceUrl?: string;
};

/**
 * Walks a Three.js scene graph and emits deterministic metrics, scene-type
 * classification, issues, and a Cost Score. Pure function — no I/O, no async.
 */
export function analyzeThreeScene(
  root: THREE.Object3D,
  _opts: AnalyzeOptions = {}
): SceneAnalysis {
  let triangleCount = 0;
  let vertexCount = 0;
  let meshCount = 0;
  let objectCount = 0;
  let hasSkinning = false;
  let hasAnimation = false;
  let estimatedSizeBytes = 0;

  const materialIds = new Set<number>();
  const textureIds = new Set<number>();
  let totalTexturePixels = 0;
  let largestTextureDim = 0;

  const box = new THREE.Box3();

  root.traverse((obj) => {
    objectCount += 1;

    if ((obj as THREE.SkinnedMesh).isSkinnedMesh) {
      hasSkinning = true;
    }

    if (obj instanceof THREE.Mesh) {
      meshCount += 1;
      const geom = obj.geometry as THREE.BufferGeometry | undefined;
      if (geom) {
        const posAttr = geom.attributes.position;
        if (posAttr) vertexCount += posAttr.count;
        if (geom.index) {
          triangleCount += geom.index.count / 3;
        } else if (posAttr) {
          triangleCount += posAttr.count / 3;
        }

        for (const name in geom.attributes) {
          const attr = geom.attributes[name];
          if (attr.array) estimatedSizeBytes += attr.array.byteLength;
        }
        if (geom.index?.array) estimatedSizeBytes += geom.index.array.byteLength;

        if (!geom.boundingBox) geom.computeBoundingBox();
        if (geom.boundingBox) {
          const localBox = geom.boundingBox.clone();
          obj.updateWorldMatrix(true, false);
          localBox.applyMatrix4(obj.matrixWorld);
          box.union(localBox);
        }
      }

      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!m) continue;
        materialIds.add(m.id);
        for (const key in m) {
          const val = (m as unknown as Record<string, unknown>)[key];
          if (val && val instanceof THREE.Texture) {
            if (textureIds.has(val.id)) continue;
            textureIds.add(val.id);
            const img = val.image as { width?: number; height?: number } | undefined;
            const w = img?.width ?? 0;
            const h = img?.height ?? 0;
            if (w > 0 && h > 0) {
              totalTexturePixels += w * h;
              largestTextureDim = Math.max(largestTextureDim, w, h);
              estimatedSizeBytes += w * h * 4;
            }
          }
        }
      }
    }
  });

  const anims = (root as unknown as { animations?: unknown[] }).animations;
  if (Array.isArray(anims) && anims.length > 0) hasAnimation = true;

  triangleCount = Math.round(triangleCount);
  const drawCallEstimate = meshCount;

  const size = new THREE.Vector3();
  if (!box.isEmpty()) box.getSize(size);
  const boundingBoxVolume = Math.max(0, size.x * size.y * size.z);

  const sceneType = classifyScene({
    meshCount,
    materialCount: materialIds.size,
    triangleCount,
    hasSkinning,
    objectCount,
  });

  const issues = detectIssues({
    triangleCount,
    materialCount: materialIds.size,
    largestTextureDim,
    drawCallEstimate,
    hasSkinning,
  });

  const cost = computeCost({
    triangleCount,
    materialCount: materialIds.size,
    totalTexturePixels,
    largestTextureDim,
    drawCallEstimate,
  });

  return {
    triangleCount,
    vertexCount,
    meshCount,
    objectCount,
    materialCount: materialIds.size,
    textureCount: textureIds.size,
    totalTexturePixels,
    largestTextureDim,
    drawCallEstimate,
    hasSkinning,
    hasAnimation,
    estimatedSizeBytes,
    boundingBoxVolume,
    sceneType,
    issues,
    cost,
  };
}

function classifyScene(args: {
  meshCount: number;
  materialCount: number;
  triangleCount: number;
  hasSkinning: boolean;
  objectCount: number;
}): SceneType {
  const { meshCount, materialCount, triangleCount, hasSkinning, objectCount } = args;

  if (hasSkinning) return 'character';

  if (meshCount >= 20 && materialCount >= 10) return 'environment';
  if (objectCount >= 50 && materialCount >= 6) return 'environment';

  const trisPerMaterial = materialCount > 0 ? triangleCount / materialCount : triangleCount;
  if (materialCount <= 4 && trisPerMaterial > 50_000) return 'cad';

  if (meshCount <= 3) return 'object';

  return 'mixed';
}

function detectIssues(args: {
  triangleCount: number;
  materialCount: number;
  largestTextureDim: number;
  drawCallEstimate: number;
  hasSkinning: boolean;
}): Issue[] {
  const issues: Issue[] = [];
  const { triangleCount, materialCount, largestTextureDim, drawCallEstimate, hasSkinning } = args;

  if (triangleCount > 250_000) {
    issues.push({
      code: 'high_poly_density',
      severity: 'high',
      message: `${triangleCount.toLocaleString()} triangles — far above mobile/mid-range PC budget`,
    });
  } else if (triangleCount > 100_000) {
    issues.push({
      code: 'high_poly_density',
      severity: 'medium',
      message: `${triangleCount.toLocaleString()} triangles — heavy for low-end devices`,
    });
  }

  if (materialCount >= 16) {
    issues.push({
      code: 'excessive_materials',
      severity: 'high',
      message: `${materialCount} unique materials — increases shader switches and draw calls`,
    });
  } else if (materialCount >= 8) {
    issues.push({
      code: 'excessive_materials',
      severity: 'medium',
      message: `${materialCount} unique materials — opportunity to merge`,
    });
  }

  if (largestTextureDim >= 4096) {
    issues.push({
      code: 'oversized_textures',
      severity: 'high',
      message: `${largestTextureDim}px textures present — overkill for most real-time use`,
    });
  } else if (largestTextureDim >= 2048) {
    issues.push({
      code: 'oversized_textures',
      severity: 'medium',
      message: `${largestTextureDim}px textures present — can be downscaled with minimal visual loss`,
    });
  }

  if (drawCallEstimate >= 50) {
    issues.push({
      code: 'high_draw_calls',
      severity: 'high',
      message: `~${drawCallEstimate} draw calls — instancing or merging will help`,
    });
  } else if (drawCallEstimate >= 25) {
    issues.push({
      code: 'high_draw_calls',
      severity: 'medium',
      message: `~${drawCallEstimate} draw calls — consider merging static geometry`,
    });
  }

  issues.push({
    code: 'no_lod',
    severity: 'low',
    message: 'No LOD levels detected — distant rendering will be unnecessarily expensive',
  });

  if (hasSkinning) {
    issues.push({
      code: 'rigged_mesh_present',
      severity: 'low',
      message: 'Rigged mesh detected — geometry decimation must preserve animation integrity',
    });
  }

  return issues;
}

function computeCost(args: {
  triangleCount: number;
  materialCount: number;
  totalTexturePixels: number;
  largestTextureDim: number;
  drawCallEstimate: number;
}): CostBreakdown {
  const { triangleCount, materialCount, totalTexturePixels, drawCallEstimate } = args;

  const TRI_FULL = 500_000;
  const TEX_FULL = 4096 * 4096 * 4;
  const MAT_FULL = 24;
  const DRAW_FULL = 60;

  const geometry = clamp01(triangleCount / TRI_FULL) * 1000;
  const texture = clamp01(totalTexturePixels / TEX_FULL) * 1000;
  const materialDraw =
    (clamp01(materialCount / MAT_FULL) * 0.5 +
      clamp01(drawCallEstimate / DRAW_FULL) * 0.5) *
    1000;

  const total = Math.round(geometry * 0.5 + texture * 0.3 + materialDraw * 0.2);

  return {
    geometry: Math.round(geometry),
    texture: Math.round(texture),
    material: Math.round(materialDraw),
    total: clampInt(total, 0, 1000),
  };
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
