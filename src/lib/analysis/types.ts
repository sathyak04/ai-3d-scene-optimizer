export type SceneType = 'character' | 'environment' | 'cad' | 'mixed' | 'object';

export type IssueSeverity = 'low' | 'medium' | 'high';

export type Issue = {
  code:
    | 'high_poly_density'
    | 'excessive_materials'
    | 'oversized_textures'
    | 'no_lod'
    | 'rigged_mesh_present'
    | 'high_draw_calls'
    | 'fragmented_meshes';
  severity: IssueSeverity;
  message: string;
};

export type CostBreakdown = {
  geometry: number;   // 0..1000
  texture: number;    // 0..1000
  material: number;   // 0..1000
  total: number;      // 0..1000 (weighted)
};

export type SceneAnalysis = {
  // Raw metrics
  triangleCount: number;
  vertexCount: number;
  meshCount: number;
  objectCount: number;
  materialCount: number;
  textureCount: number;
  totalTexturePixels: number;     // sum of width*height across all textures
  largestTextureDim: number;      // max(width, height) across textures
  drawCallEstimate: number;
  hasSkinning: boolean;
  hasAnimation: boolean;
  estimatedSizeBytes: number;
  boundingBoxVolume: number;

  // Derived
  sceneType: SceneType;
  issues: Issue[];
  cost: CostBreakdown;
};
