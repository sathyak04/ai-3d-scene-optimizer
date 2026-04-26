import { useSceneStore } from '@/store/sceneStore';
import { PLATFORM_BUDGETS } from '@/lib/ai/prompt';

/**
 * Small standalone panel that owns the target platform selector. Drives
 * every panel below it. Visual-fidelity (windowed-SSIM) is still computed
 * silently in the background and surfaced to the AI advisor as a
 * hole-detection signal — it's just not shown to the user as a number.
 */
export function TargetPanel() {
  const targetPlatform = useSceneStore((s) => s.targetPlatform);
  const setTargetPlatform = useSceneStore((s) => s.setTargetPlatform);

  return (
    <div className="panel p-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-wider text-text-dim shrink-0">
          Target
        </span>
        <select
          value={targetPlatform}
          onChange={(e) =>
            setTargetPlatform(e.target.value as typeof targetPlatform)
          }
          className="flex-1 min-w-0 bg-bg-panel border border-bg-border text-[11px] text-text rounded px-2 py-1 font-mono cursor-pointer focus:outline-none focus:border-accent/60"
        >
          {Object.entries(PLATFORM_BUDGETS).map(([key, b]) => (
            <option key={key} value={key}>
              {b.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
