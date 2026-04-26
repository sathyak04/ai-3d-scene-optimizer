import { useEffect, useRef, useState } from 'react';
import { useSceneStore } from '@/store/sceneStore';
import {
  getOptimizationRecommendation,
  GroqDisabledError,
} from '@/lib/ai/groqClient';
import { getFallbackResponse } from '@/lib/ai/fallbackCache';
import type { AIResponse } from '@/lib/ai/responseSchema';

export type AIState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; response: AIResponse }
  | { status: 'error'; message: string };

const DRAG_DEBOUNCE_MS = 900;

/**
 * On every scene load (originalAnalysis populated) or target-platform change,
 * fire a Groq call asking for an optimization recommendation. The response
 * is returned for the UI to display — it does NOT auto-apply the preset.
 * The user must click "Apply" to update sliders.
 *
 * Also re-fires (debounced) when the user has manually dragged sliders into
 * a "custom" state that doesn't match either the original or the AI preset,
 * so the diagnosis reflects the new settings.
 */
export function useAIRecommendation(): AIState {
  const original = useSceneStore((s) => s.originalAnalysis);
  const optimized = useSceneStore((s) => s.optimizedAnalysis);
  const sliders = useSceneStore((s) => s.sliders);
  const targetPlatform = useSceneStore((s) => s.targetPlatform);
  const currentAsset = useSceneStore((s) => s.currentAsset);
  const appliedAIPreset = useSceneStore((s) => s.appliedAIPreset);
  const groqEnabledFlag = useSceneStore((s) => s.groqEnabled);

  const [state, setState] = useState<AIState>({ status: 'idle' });
  const abortRef = useRef<AbortController | null>(null);

  // Primary: scene/platform/asset change -> fresh AI call.
  useEffect(() => {
    if (!original) {
      setState({ status: 'idle' });
      return;
    }

    // If the live AI is toggled off, go straight to fallback for built-ins
    // (no Groq token spent). Uploaded assets fall through to "error" since
    // there's no cached response we could honestly attribute to them.
    if (!useSceneStore.getState().groqEnabled) {
      const fallback = getFallbackResponse(currentAsset, targetPlatform);
      if (fallback) {
        setState({ status: 'ready', response: fallback });
      } else {
        setState({
          status: 'error',
          message: 'Live AI disabled. Re-enable it in the header to analyze uploaded assets.',
        });
      }
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ status: 'loading' });

    getOptimizationRecommendation(original, targetPlatform, controller.signal)
      .then((response) => {
        if (controller.signal.aborted) return;
        setState({ status: 'ready', response });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        const fallback = getFallbackResponse(currentAsset, targetPlatform);
        if (fallback) {
          setState({ status: 'ready', response: fallback });
          return;
        }
        if (err instanceof GroqDisabledError) {
          setState({
            status: 'error',
            message: 'Live AI disabled. Re-enable it in the header to analyze uploaded assets.',
          });
          return;
        }
        const message = err instanceof Error ? err.message : String(err);
        setState({ status: 'error', message });
      });

    return () => {
      controller.abort();
    };
  }, [original, targetPlatform, currentAsset, groqEnabledFlag]);

  // Secondary: re-eval when user is in "custom" mode (manual drag).
  // Debounced so we don't fire mid-drag.
  const isPristine =
    sliders.geometryDensity > 0.999 &&
    sliders.textureQuality > 0.999 &&
    sliders.vertexPrecision > 0.999;
  const matchesAIPreset =
    !!appliedAIPreset &&
    Math.abs(sliders.geometryDensity - appliedAIPreset.geometryDensity) < 0.005 &&
    Math.abs(sliders.textureQuality - appliedAIPreset.textureQuality) < 0.005 &&
    Math.abs(sliders.vertexPrecision - appliedAIPreset.vertexPrecision) <
      0.005;
  const isCustom = !isPristine && !matchesAIPreset;

  useEffect(() => {
    if (!original || !optimized || !isCustom) return;
    // Skip the drag-induced re-eval entirely when AI is disabled — fallback
    // is asset-level, not slider-state-aware, so re-firing wouldn't change
    // the displayed recommendation.
    if (!useSceneStore.getState().groqEnabled) return;
    const handle = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setState({ status: 'loading' });
      // Read qualityScore fresh from the store at fire time. SSIM debounce
      // (500ms) is shorter than AI debounce (900ms), so by now the latest
      // post-drag fidelity is in the store — but the closure captured at
      // effect-run time would still hold the stale value.
      const latestQuality = useSceneStore.getState().qualityScore;
      getOptimizationRecommendation(
        original,
        targetPlatform,
        controller.signal,
        { sliders, effective: optimized, visualIntegrity: latestQuality }
      )
        .then((response) => {
          if (controller.signal.aborted) return;
          setState({ status: 'ready', response });
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          const fallback = getFallbackResponse(currentAsset, targetPlatform);
          if (fallback) {
            setState({ status: 'ready', response: fallback });
            return;
          }
          const message = err instanceof Error ? err.message : String(err);
          setState({ status: 'error', message });
        });
    }, DRAG_DEBOUNCE_MS);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isCustom,
    currentAsset,
    optimized?.triangleCount,
    optimized?.largestTextureDim,
    optimized?.materialCount,
    sliders.geometryDensity,
    sliders.textureQuality,
    sliders.vertexPrecision,
    targetPlatform,
  ]);

  return state;
}
