import { useEffect, useState } from 'react';
import { useAIRecommendation } from '@/hooks/useAIRecommendation';
import { useSceneStore, type SliderConfig } from '@/store/sceneStore';
import { PLATFORM_BUDGETS } from '@/lib/ai/prompt';

export function AIExplanationPanel() {
  const state = useAIRecommendation();
  const targetPlatform = useSceneStore((s) => s.targetPlatform);
  const setSliders = useSceneStore((s) => s.setSliders);
  const setAppliedAIPreset = useSceneStore((s) => s.setAppliedAIPreset);
  const sliders = useSceneStore((s) => s.sliders);
  const appliedAIPreset = useSceneStore((s) => s.appliedAIPreset);
  const platformLabel = PLATFORM_BUDGETS[targetPlatform].label;

  // Compare sliders against the *current* AI recommendation (not the
  // historically-applied one). This way switching target platform or asset
  // automatically clears the "applied" badge — the new recommendation
  // doesn't match the old slider settings, so the user can re-apply.
  const aiPreset = state.status === 'ready' ? state.response.preset : null;
  const matchesAIPreset =
    !!aiPreset &&
    !!appliedAIPreset &&
    Math.abs(sliders.geometryDensity - aiPreset.geometryDensity) < 0.005 &&
    Math.abs(sliders.textureQuality - aiPreset.textureQuality) < 0.005 &&
    Math.abs(sliders.vertexPrecision - aiPreset.vertexPrecision) < 0.005;

  // Snapshot of sliders before the user clicked Apply, so Undo can restore.
  const [backup, setBackup] = useState<SliderConfig | null>(null);

  // Reset backup whenever the AI re-fires with a fresh recommendation
  // (new scene, new platform, drag-induced re-eval).
  const responseKey =
    state.status === 'ready' ? state.response.diagnosis : null;
  useEffect(() => {
    setBackup(null);
  }, [responseKey]);

  const handleApply = () => {
    if (state.status !== 'ready') return;
    setBackup({ ...useSceneStore.getState().sliders });
    setSliders(state.response.preset);
    setAppliedAIPreset({ ...state.response.preset });
  };

  const handleUndo = () => {
    if (!backup) return;
    setSliders(backup);
    // Keep `backup` populated so the button reads "Re-apply AI Preset"
    // until the recommendation changes (new platform / asset / drag).
    setAppliedAIPreset(null);
  };

  return (
    <div className="panel p-3 space-y-2">
      <h3 className="panel-title flex items-center gap-2">
        <span className="text-accent">AI</span>
        <span>Recommendation</span>
      </h3>

      {state.status === 'idle' && (
        <div className="text-[11px] text-text-dim italic">
          Pick a target platform to begin.
        </div>
      )}

      {state.status === 'loading' && (
        <div className="flex items-center gap-2 text-[11px] text-text-muted">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
          <span>Analyzing for {platformLabel}...</span>
        </div>
      )}

      {state.status === 'error' && (
        <div className="text-[11px] text-bad bg-bad/10 border border-bad/30 rounded px-2 py-1.5">
          {state.message}
        </div>
      )}

      {state.status === 'ready' && (
        <div className="space-y-2">
          <div className="text-[12px] leading-snug text-text">
            {state.response.diagnosis}
          </div>
          <div className="text-[12px] leading-snug text-text-muted">
            <span className="text-accent font-semibold">→</span>{' '}
            {state.response.recommendation}
          </div>
          <details className="text-[11px] leading-snug text-text-dim">
            <summary className="cursor-pointer hover:text-text-muted select-none">
              reasoning
            </summary>
            <div className="italic border-l-2 border-bg-border pl-2 mt-1">
              {state.response.reasoning}
            </div>
          </details>

          <div className="flex items-center gap-2 pt-1">
            {!matchesAIPreset ? (
              <button
                onClick={handleApply}
                className="flex-1 px-3 py-1.5 rounded text-[11px] font-semibold bg-accent text-white hover:bg-accent-glow transition-colors"
              >
                {backup ? 'Re-apply AI Preset' : 'Apply Optimization'}
              </button>
            ) : (
              <>
                <span className="text-[10px] uppercase tracking-wider text-good font-mono">
                  ✓ applied · g:{Math.round(state.response.preset.geometryDensity * 100)}% t:{Math.round(state.response.preset.textureQuality * 100)}% v:{Math.round(state.response.preset.vertexPrecision * 100)}%
                </span>
                <button
                  onClick={handleUndo}
                  className="ml-auto px-2 py-1 rounded text-[11px] border border-bg-border bg-bg-panel hover:bg-bg-panelHover text-text-muted transition-colors"
                >
                  Undo
                </button>
              </>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
