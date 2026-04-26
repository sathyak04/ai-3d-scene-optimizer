import { useEffect, useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { useSceneStore } from '@/store/sceneStore';
import { analyzeThreeScene } from '@/lib/analysis/sceneAnalyzer';
import { precomputeLODs, applyLOD, pickLODIndex } from '@/lib/preview/lodCache';
import {
  precomputeTextureLODs,
  applyTextureLOD,
} from '@/lib/preview/textureCache';
import {
  applyVertexPrecision,
  cacheOriginalPositions,
} from '@/lib/preview/vertexQuantize';
import { setCurrentRenderable } from '@/lib/export/exportGLB';
import { captureSnapshot } from '@/lib/quality/snapshot';
import { ssim } from '@/lib/quality/ssim';

const TARGET_SIZE = 2;
const WIREFRAME_COLOR = '#7c5cff';

type Props = {
  url: string;
  wireframe?: boolean;
};

export function GLBSubmodel({ url, wireframe = false }: Props) {
  const { scene } = useGLTF(url);
  const sliders = useSceneStore((s) => s.sliders);
  const setOriginalAnalysis = useSceneStore((s) => s.setOriginalAnalysis);
  const setOptimizedAnalysis = useSceneStore((s) => s.setOptimizedAnalysis);
  const setPrecomputeStatus = useSceneStore((s) => s.setPrecomputeStatus);
  const precomputeStatus = useSceneStore((s) => s.precomputeStatus);
  const setQualityScore = useSceneStore((s) => s.setQualityScore);
  const referenceSnapshotRef = useRef<Uint8ClampedArray | null>(null);

  const wireMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: WIREFRAME_COLOR,
        wireframe: true,
      }),
    []
  );

  const renderable = useMemo(() => {
    const cloned = scene.clone(true);
    cloned.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      const cloneMat = (m: THREE.Material): THREE.Material => {
        const c = m.clone();
        if ('flatShading' in c) {
          (c as THREE.MeshStandardMaterial).flatShading = true;
          c.needsUpdate = true;
        }
        return c;
      };
      if (Array.isArray(obj.material)) {
        obj.material = obj.material.map(cloneMat);
      } else if (obj.material) {
        obj.material = cloneMat(obj.material);
      }
    });
    cacheOriginalPositions(cloned);

    cloned.updateMatrixWorld(true);
    const box = computeMeshOnlyBoundingBox(cloned);
    const wrapper = new THREE.Group();
    if (!box.isEmpty()) {
      const size = new THREE.Vector3();
      box.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const scale = TARGET_SIZE / maxDim;
      const bottomCenter = new THREE.Vector3(
        (box.min.x + box.max.x) / 2,
        box.min.y,
        (box.min.z + box.max.z) / 2
      );
      cloned.position.sub(bottomCenter);
      wrapper.scale.setScalar(scale);
    }
    wrapper.add(cloned);
    return wrapper;
  }, [scene]);

  useEffect(() => {
    let cancelled = false;
    setPrecomputeStatus('loading');
    Promise.all([precomputeLODs(renderable), precomputeTextureLODs(renderable)])
      .then(() => {
        if (cancelled) return;
        setPrecomputeStatus('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Precompute failed', err);
        setPrecomputeStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [renderable, setPrecomputeStatus]);

  // Geometry pipeline: LOD swap first, then re-cache positions on the
  // newly-swapped LOD, then quantize. Combining ensures vertex precision
  // doesn't "lose" itself when the LOD swap replaces the geometry refs.
  useEffect(() => {
    if (precomputeStatus !== 'ready') return;
    applyLOD(renderable, pickLODIndex(sliders.geometryDensity));
    cacheOriginalPositions(renderable);
    applyVertexPrecision(renderable, sliders.vertexPrecision);
  }, [
    renderable,
    sliders.geometryDensity,
    sliders.vertexPrecision,
    precomputeStatus,
  ]);

  useEffect(() => {
    if (precomputeStatus !== 'ready') return;
    applyTextureLOD(renderable, sliders.textureQuality);
  }, [renderable, sliders.textureQuality, precomputeStatus]);

  useEffect(() => {
    if (precomputeStatus !== 'ready') return;
    setOptimizedAnalysis(analyzeThreeScene(renderable, { sourceUrl: url }));
  }, [
    renderable,
    precomputeStatus,
    sliders.geometryDensity,
    sliders.textureQuality,
    sliders.vertexPrecision,
    url,
    setOptimizedAnalysis,
  ]);

  // Reference snapshot: taken once when the asset first becomes ready, with
  // sliders at default (1.0/1.0/1.0) so the renderable is in pristine state.
  useEffect(() => {
    referenceSnapshotRef.current = null;
    setQualityScore(null);
  }, [renderable, setQualityScore]);

  useEffect(() => {
    if (precomputeStatus !== 'ready') return;
    if (referenceSnapshotRef.current) return; // already captured
    // Defer one frame so the slider effects above have applied to the GPU.
    const handle = requestAnimationFrame(() => {
      try {
        referenceSnapshotRef.current = captureSnapshot(renderable);
        setQualityScore(1.0);
      } catch (err) {
        console.error('Reference snapshot failed', err);
      }
    });
    return () => cancelAnimationFrame(handle);
  }, [renderable, precomputeStatus, setQualityScore]);

  // Current snapshot + SSIM: re-runs after each slider mutation. Debounced
  // long enough that we only compute when the user pauses dragging — the
  // offscreen render + pixel readback is the expensive bit on heavy meshes.
  useEffect(() => {
    if (precomputeStatus !== 'ready') return;
    if (!referenceSnapshotRef.current) return;
    const handle = setTimeout(() => {
      // Defer one rAF so the latest mutation has flushed to the GPU before
      // we render the offscreen pass and read pixels back.
      requestAnimationFrame(() => {
        try {
          const current = captureSnapshot(renderable);
          const ref = referenceSnapshotRef.current;
          if (!ref) return;
          const score = ssim(ref, current);
          setQualityScore(score);
        } catch (err) {
          console.error('Quality snapshot failed', err);
        }
      });
    }, 500);
    return () => clearTimeout(handle);
  }, [
    renderable,
    precomputeStatus,
    sliders.geometryDensity,
    sliders.textureQuality,
    sliders.vertexPrecision,
    setQualityScore,
  ]);

  useEffect(() => {
    renderable.traverse((obj) => {
      if (!(obj instanceof THREE.Mesh)) return;
      if (wireframe) {
        if (!obj.userData.__realMaterial) {
          obj.userData.__realMaterial = obj.material;
        }
        obj.material = wireMat;
      } else {
        const real = obj.userData.__realMaterial as
          | THREE.Material
          | THREE.Material[]
          | undefined;
        if (real) {
          obj.material = real;
          delete obj.userData.__realMaterial;
        }
      }
    });
  }, [renderable, wireframe, wireMat]);

  useEffect(() => {
    setOriginalAnalysis(analyzeThreeScene(scene, { sourceUrl: url }));
  }, [scene, url, setOriginalAnalysis]);

  // Register the current renderable so the Export button can serialize it.
  useEffect(() => {
    setCurrentRenderable(renderable);
    return () => setCurrentRenderable(null);
  }, [renderable]);

  return <primitive object={renderable} />;
}

function computeMeshOnlyBoundingBox(root: THREE.Object3D): THREE.Box3 {
  const box = new THREE.Box3();
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.geometry) {
      if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
      const localBox = obj.geometry.boundingBox;
      if (!localBox) return;
      const worldBox = localBox.clone();
      worldBox.applyMatrix4(obj.matrixWorld);
      box.union(worldBox);
    }
  });
  return box;
}

useGLTF.preload('/scenes/baseball_01_2k.gltf/baseball_01_2k.gltf');
useGLTF.preload('/scenes/Camera_01_2k.gltf/Camera_01_2k.gltf');
useGLTF.preload('/scenes/boulder_01_2k.gltf/boulder_01_2k.gltf');
