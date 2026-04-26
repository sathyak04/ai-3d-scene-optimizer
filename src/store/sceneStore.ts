import { create } from 'zustand';
import type { SceneAnalysis } from '@/lib/analysis/types';

export type AssetKind = 'baseball' | 'camera' | 'boulder' | 'uploaded';
export type BuiltInAssetKind = Exclude<AssetKind, 'uploaded'>;

export type AssetOption = {
  id: BuiltInAssetKind;
  label: string;
  description: string;
  url: string;
};

export const ASSET_OPTIONS: AssetOption[] = [
  {
    id: 'baseball',
    label: 'Baseball',
    description: 'Polyhaven scan · single material · rich textures',
    url: '/scenes/baseball_01_2k.gltf/baseball_01_2k.gltf',
  },
  {
    id: 'camera',
    label: 'Vintage Camera',
    description: 'Polyhaven scan · body + lens detail · rich textures',
    url: '/scenes/Camera_01_2k.gltf/Camera_01_2k.gltf',
  },
  {
    id: 'boulder',
    label: 'Boulder',
    description: 'Polyhaven scan · high-poly · geometry slider hero',
    url: '/scenes/boulder_01_2k.gltf/boulder_01_2k.gltf',
  },
];

export type SliderConfig = {
  geometryDensity: number; // 0..1   (1 = preserve, 0 = aggressive decimate)
  textureQuality: number; // 0..1   (1 = preserve, 0.125 = downscale to 1/8)
  vertexPrecision: number; // 0..1   (1 = fp32 positions, 0 = 8-bit quantized)
};

export const DEFAULT_SLIDERS: SliderConfig = {
  geometryDensity: 1.0,
  textureQuality: 1.0,
  vertexPrecision: 1.0,
};

export type PrecomputeStatus = 'idle' | 'loading' | 'ready' | 'error';
export type TargetPlatform = 'mobile' | 'midPC' | 'highPC' | 'VR';

type SceneState = {
  currentAsset: AssetKind;

  originalAnalysis: SceneAnalysis | null;
  optimizedAnalysis: SceneAnalysis | null;

  sliders: SliderConfig;
  wireframe: boolean;
  autoRotate: boolean;
  precomputeStatus: PrecomputeStatus;
  targetPlatform: TargetPlatform;
  appliedAIPreset: SliderConfig | null;
  uploadedAssetUrl: string | null;
  uploadedAssetName: string | null;
  qualityScore: number | null;
  /** Live AI toggle. False = use cached fallback only (saves Groq tokens). */
  groqEnabled: boolean;
  /** Top-level view: 'landing' on first load, 'app' once user enters. */
  view: 'landing' | 'app';

  setCurrentAsset: (id: AssetKind) => void;
  setOriginalAnalysis: (a: SceneAnalysis | null) => void;
  setOptimizedAnalysis: (a: SceneAnalysis | null) => void;
  setSliders: (config: Partial<SliderConfig>) => void;
  setWireframe: (on: boolean) => void;
  setAutoRotate: (on: boolean) => void;
  setPrecomputeStatus: (status: PrecomputeStatus) => void;
  setTargetPlatform: (target: TargetPlatform) => void;
  setAppliedAIPreset: (preset: SliderConfig | null) => void;
  loadUploadedAsset: (url: string, name: string) => void;
  setQualityScore: (score: number | null) => void;
  setGroqEnabled: (on: boolean) => void;
  setView: (v: 'landing' | 'app') => void;
};

export const useSceneStore = create<SceneState>((set) => ({
  currentAsset: 'baseball',

  originalAnalysis: null,
  optimizedAnalysis: null,

  sliders: { ...DEFAULT_SLIDERS },
  wireframe: false,
  autoRotate: true,
  precomputeStatus: 'idle',
  targetPlatform: 'mobile',
  appliedAIPreset: null,
  uploadedAssetUrl: null,
  uploadedAssetName: null,
  qualityScore: null,
  groqEnabled: true,
  view: 'landing',

  setCurrentAsset: (id) =>
    set({
      currentAsset: id,
      originalAnalysis: null,
      optimizedAnalysis: null,
      precomputeStatus: 'idle',
      sliders: { ...DEFAULT_SLIDERS },
      appliedAIPreset: null,
      qualityScore: null,
    }),
  setOriginalAnalysis: (a) => set({ originalAnalysis: a }),
  setOptimizedAnalysis: (a) => set({ optimizedAnalysis: a }),
  setSliders: (config) =>
    set((state) => ({ sliders: { ...state.sliders, ...config } })),
  setWireframe: (on) => set({ wireframe: on }),
  setAutoRotate: (on) => set({ autoRotate: on }),
  setPrecomputeStatus: (status) => set({ precomputeStatus: status }),
  setTargetPlatform: (target) =>
    // Clear the previous applied preset so the "✓ applied" badge doesn't
    // bleed across platforms. The user's current slider values are kept;
    // only the "this matches the AI's recommendation" claim is dropped.
    set({ targetPlatform: target, appliedAIPreset: null }),
  setAppliedAIPreset: (preset) => set({ appliedAIPreset: preset }),
  loadUploadedAsset: (url, name) =>
    set({
      currentAsset: 'uploaded',
      uploadedAssetUrl: url,
      uploadedAssetName: name,
      originalAnalysis: null,
      optimizedAnalysis: null,
      precomputeStatus: 'idle',
      sliders: { ...DEFAULT_SLIDERS },
      appliedAIPreset: null,
      qualityScore: null,
    }),
  setQualityScore: (score) => set({ qualityScore: score }),
  setGroqEnabled: (on) => set({ groqEnabled: on }),
  setView: (v) => set({ view: v }),
}));
