import type { SliderConfig } from '@/store/sceneStore';

export type OptimizeRequest = {
  glbBuffer: ArrayBuffer;
  sliders: SliderConfig;
};

export type OptimizeProgress = {
  type: 'progress';
  stage: string;
  percent: number;
};

export type OptimizeDone = {
  type: 'done';
  glbBytes: ArrayBuffer;
  inputBytes: number;
  outputBytes: number;
  appliedRatio: number;
  textureMultiplier: number;
  riggedCappedReduction: boolean;
};

export type OptimizeError = {
  type: 'error';
  message: string;
};

export type WorkerMessage = OptimizeProgress | OptimizeDone | OptimizeError;
