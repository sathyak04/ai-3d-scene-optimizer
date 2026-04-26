import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import {
  OrbitControls,
  Environment,
  AdaptiveDpr,
  AdaptiveEvents,
} from '@react-three/drei';
import { useSceneStore } from '@/store/sceneStore';
import { SceneModel } from './SceneModel';
import { validateGltfFile } from '@/lib/security/validateGltf';

const AUTO_ROTATE_SPEED = 1.4;
// Camera looks slightly downward at the platform; orbit target is mid-object height
const CAMERA_POSITION: [number, number, number] = [0, 1.6, 4.0];
const ORBIT_TARGET: [number, number, number] = [0, 0.7, 0];

export function SceneViewer() {
  const wireframe = useSceneStore((s) => s.wireframe);
  const loadUploadedAsset = useSceneStore((s) => s.loadUploadedAsset);
  const [isDragging, setIsDragging] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const dragDepth = useRef(0);

  const handleFile = useCallback(
    async (file: File) => {
      const result = await validateGltfFile(file);
      if (!result.ok) {
        setDropError(result.reason);
        setTimeout(() => setDropError(null), 4000);
        return;
      }
      setDropError(null);
      const url = URL.createObjectURL(file);
      loadUploadedAsset(url, file.name);
    },
    [loadUploadedAsset]
  );

  const onDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    const isFile = e.dataTransfer.types.includes('Files');
    e.preventDefault(); // suppress browser "no drop" cursor on slider drags
    if (!isFile) return;
    dragDepth.current += 1;
    setIsDragging(true);
  };
  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    const isFile = e.dataTransfer.types.includes('Files');
    e.preventDefault(); // suppress browser "no drop" cursor on slider drags
    if (!isFile) return;
    e.dataTransfer.dropEffect = 'copy';
  };
  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  return (
    <div
      className="w-full h-full relative bg-bg-panel rounded-lg overflow-hidden border border-bg-border"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <Canvas
        camera={{ position: CAMERA_POSITION, fov: 38, near: 0.01, far: 100 }}
        dpr={[0.4, 1]}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
      >
        <AdaptiveDpr pixelated />
        <AdaptiveEvents />
        <color attach="background" args={['#0d0d12']} />

        <ambientLight intensity={0.75} />
        <directionalLight position={[5, 10, 5]} intensity={1.4} />
        <directionalLight position={[-5, 4, -5]} intensity={0.7} color="#9a82ff" />

        <Suspense fallback={null}>
          <SceneModel wireframe={wireframe} />
          <Environment preset="city" />
        </Suspense>

        {/* Sandbox platform — circular pedestal beneath the model */}
        <Platform />

        <DirectionalAutoRotateControls />
      </Canvas>

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-accent/15 border-2 border-dashed border-accent rounded-lg">
          <div className="bg-bg-panel/95 backdrop-blur-sm border border-accent/60 rounded-lg px-5 py-3 text-center shadow-xl">
            <div className="text-sm font-semibold text-accent">Drop to load</div>
            <div className="text-[11px] text-text-muted mt-0.5 font-mono">.glb / .gltf</div>
          </div>
        </div>
      )}
      {dropError && (
        <div className="pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 bg-bad/15 border border-bad/40 text-bad text-[11px] px-3 py-1.5 rounded font-medium">
          {dropError}
        </div>
      )}
    </div>
  );
}

function Platform() {
  return (
    <group>
      {/* Outer disc — slightly raised, dark surface */}
      <mesh position={[0, -0.025, 0]} receiveShadow>
        <cylinderGeometry args={[1.65, 1.65, 0.05, 64]} />
        <meshStandardMaterial
          color="#16161d"
          roughness={0.7}
          metalness={0.2}
        />
      </mesh>
      {/* Thin accent ring around the edge */}
      <mesh position={[0, 0.001, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.6, 1.65, 64]} />
        <meshBasicMaterial color="#7c5cff" transparent opacity={0.4} />
      </mesh>
    </group>
  );
}

/**
 * Camera controls: rotation only (no zoom, no pan), orbits a target above
 * the platform. Auto-rotates continuously; on user drag the rotation
 * direction follows the drag.
 */
function DirectionalAutoRotateControls() {
  const controlsRef = useRef<React.ElementRef<typeof OrbitControls>>(null);
  const startAngleRef = useRef(0);
  const autoRotate = useSceneStore((s) => s.autoRotate);

  useEffect(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    const handleStart = () => {
      startAngleRef.current = controls.getAzimuthalAngle();
    };

    const handleEnd = () => {
      const end = controls.getAzimuthalAngle();
      let delta = end - startAngleRef.current;
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      if (Math.abs(delta) < 0.005) return;
      controls.autoRotateSpeed =
        Math.sign(delta) * -Math.abs(AUTO_ROTATE_SPEED);
    };

    controls.addEventListener('start', handleStart);
    controls.addEventListener('end', handleEnd);
    return () => {
      controls.removeEventListener('start', handleStart);
      controls.removeEventListener('end', handleEnd);
    };
  }, []);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableZoom
      enablePan={false}
      enableDamping
      dampingFactor={0.08}
      autoRotate={autoRotate}
      autoRotateSpeed={AUTO_ROTATE_SPEED}
      target={ORBIT_TARGET}
      minDistance={1.5}
      maxDistance={9}
      zoomSpeed={1.1}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI / 2 - 0.02}
    />
  );
}
