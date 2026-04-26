import * as THREE from 'three';

/**
 * Renders an Object3D to a fixed-camera offscreen canvas at a known framing
 * and returns the RGBA pixel buffer. Used to capture before/after images for
 * perceptual similarity (SSIM) comparison.
 *
 * The rendered framing matches the main viewer's default camera so the
 * captured image looks like what the user sees, but the offscreen pass is
 * isolated — it doesn't touch the live render loop.
 */

// 192×192 — large enough that small holes and topology damage are visible
// to windowed SSIM, but still cheap to render + read pixels back. Combined
// with a 500ms slider debounce, it doesn't lag the UI on heavy assets.
const SIZE = 192;

let _renderer: THREE.WebGLRenderer | null = null;
let _scene: THREE.Scene | null = null;
let _camera: THREE.PerspectiveCamera | null = null;
let _readCanvas: HTMLCanvasElement | null = null;
let _readCtx: CanvasRenderingContext2D | null = null;

function ensureInfra(): {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  readCanvas: HTMLCanvasElement;
  readCtx: CanvasRenderingContext2D;
} {
  if (!_renderer) {
    _renderer = new THREE.WebGLRenderer({
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: true,
    });
    _renderer.setSize(SIZE, SIZE);
    _renderer.setClearColor(new THREE.Color('#0d0d12'), 1.0);
    _renderer.outputColorSpace = THREE.SRGBColorSpace;
  }
  if (!_scene) {
    _scene = new THREE.Scene();
    _scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const dl1 = new THREE.DirectionalLight(0xffffff, 1.4);
    dl1.position.set(5, 10, 5);
    _scene.add(dl1);
    const dl2 = new THREE.DirectionalLight(0x9a82ff, 0.7);
    dl2.position.set(-5, 4, -5);
    _scene.add(dl2);
  }
  if (!_camera) {
    _camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
    _camera.position.set(0, 1.6, 4.0);
    _camera.lookAt(0, 0.7, 0);
  }
  if (!_readCanvas) {
    _readCanvas = document.createElement('canvas');
    _readCanvas.width = SIZE;
    _readCanvas.height = SIZE;
    _readCtx = _readCanvas.getContext('2d', { willReadFrequently: true });
  }
  return {
    renderer: _renderer,
    scene: _scene,
    camera: _camera,
    readCanvas: _readCanvas,
    readCtx: _readCtx!,
  };
}

/**
 * Render the given Object3D and return the RGBA pixel buffer.
 *
 * Uses Object3D.clone(true) to produce a hierarchy that shares geometry and
 * material refs with the source — so any in-place slider mutations on the
 * source are reflected in the snapshot without disturbing the main scene.
 */
export function captureSnapshot(object: THREE.Object3D): Uint8ClampedArray {
  const { renderer, scene, camera, readCtx } = ensureInfra();
  const proxy = object.clone(true);
  scene.add(proxy);
  renderer.render(scene, camera);
  scene.remove(proxy);

  readCtx.clearRect(0, 0, SIZE, SIZE);
  readCtx.drawImage(renderer.domElement, 0, 0);
  return readCtx.getImageData(0, 0, SIZE, SIZE).data;
}

export const SNAPSHOT_SIZE = SIZE;
