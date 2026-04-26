import * as THREE from 'three';
import { GLTFExporter } from 'three-stdlib';

let currentRenderable: THREE.Object3D | null = null;

/** Called by GLBSubmodel when its renderable changes; the export button reads it. */
export function setCurrentRenderable(obj: THREE.Object3D | null): void {
  currentRenderable = obj;
}

export function hasExportableScene(): boolean {
  return currentRenderable !== null;
}

export type ExportResult = {
  filename: string;
  byteSize: number;
  /** Hex-encoded SHA-256 of the exported GLB for downstream integrity checks. */
  sha256: string;
};

/**
 * Serialize the currently rendered scene (with applied LOD/texture/material
 * mutations) to binary glTF, trigger a browser download, AND return integrity
 * metadata (size + SHA-256 hash) so a downstream pipeline can verify the
 * exported file hasn't been tampered with.
 */
export async function exportCurrentScene(
  filename = 'optimized.glb'
): Promise<ExportResult> {
  const target = currentRenderable;
  if (!target) throw new Error('No scene available to export');

  const exporter = new GLTFExporter();
  const result = await new Promise<ArrayBuffer>((resolve, reject) => {
    exporter.parse(
      target,
      (out) => {
        if (out instanceof ArrayBuffer) resolve(out);
        else reject(new Error('GLTFExporter returned non-binary output'));
      },
      (err) => reject(err),
      { binary: true, embedImages: true }
    );
  });

  // Compute SHA-256 via the browser's WebCrypto API. Synchronous-feeling but
  // hashing 10MB+ on the main thread is still <100ms.
  const hashBuffer = await crypto.subtle.digest('SHA-256', result);
  const sha256 = Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const blob = new Blob([result], { type: 'model/gltf-binary' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { filename, byteSize: result.byteLength, sha256 };
}
