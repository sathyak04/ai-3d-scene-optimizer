import { SceneViewer } from './components/viewer/SceneViewer';
import { SceneLoader } from './components/controls/SceneLoader';
import { AIExplanationPanel } from './components/dashboard/AIExplanationPanel';
import { SliderPanel } from './components/dashboard/SliderPanel';
import { DeltaPanel } from './components/dashboard/DeltaPanel';
import { TargetPanel } from './components/dashboard/TargetPanel';
import { LandingPage } from './components/landing/LandingPage';
import { useSceneStore } from './store/sceneStore';

export default function App() {
  const view = useSceneStore((s) => s.view);
  const wireframe = useSceneStore((s) => s.wireframe);
  const setWireframe = useSceneStore((s) => s.setWireframe);
  const autoRotate = useSceneStore((s) => s.autoRotate);
  const setAutoRotate = useSceneStore((s) => s.setAutoRotate);
  const groqEnabled = useSceneStore((s) => s.groqEnabled);
  const setGroqEnabled = useSceneStore((s) => s.setGroqEnabled);

  if (view === 'landing') {
    return <LandingPage />;
  }

  return (
    <div className="min-h-screen bg-bg text-text font-sans flex flex-col">
      <header className="border-b border-bg-border px-6 py-3.5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-baseline gap-1.5">
          <svg
            viewBox="0 0 24 24"
            className="w-5 h-5 text-accent self-center"
            style={{ filter: 'drop-shadow(0 0 6px rgba(124,92,255,0.55))' }}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinejoin="round"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {/* Origami pyramid — left face slightly filled, right face outline */}
            <path
              d="M12 3 L4 20 L12 17 Z"
              fill="currentColor"
              fillOpacity="0.18"
            />
            <path d="M12 3 L12 17 L20 20 Z" />
            <path d="M12 3 L4 20 L12 17 Z" />
          </svg>
          <h1 className="text-lg font-semibold lowercase tracking-tight text-text ml-1">
            paper
          </h1>
          <span className="text-[10px] font-mono uppercase tracking-wider text-text-dim ml-2">
            3d optimization for everyone
          </span>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setGroqEnabled(!groqEnabled)}
            title={
              groqEnabled
                ? 'Live AI is on — disable to use cached responses and save Groq tokens.'
                : 'Live AI is off — using cached responses only. Click to re-enable Groq.'
            }
            className={[
              'flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider rounded px-2 py-1 border transition-colors',
              groqEnabled
                ? 'border-accent/40 bg-accent/10 text-accent hover:bg-accent/20'
                : 'border-bg-border bg-bg-panel text-text-dim hover:text-text-muted',
            ].join(' ')}
          >
            <span
              className={[
                'inline-block w-1.5 h-1.5 rounded-full',
                groqEnabled
                  ? 'bg-accent shadow-[0_0_6px] shadow-accent-glow animate-pulse'
                  : 'bg-text-dim',
              ].join(' ')}
            />
            <span>{groqEnabled ? 'Live AI · ON' : 'Live AI · OFF'}</span>
          </button>
          <span
            className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-good border border-good/30 bg-good/10 rounded px-2 py-1"
            title="All optimization runs locally in your browser. No 3D asset data is uploaded — only aggregated metrics (triangle count, texture dimensions) are sent to the AI advisor."
          >
            <svg
              viewBox="0 0 24 24"
              className="w-3 h-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d="M7 11 V7 a5 5 0 0 1 10 0 V11" />
            </svg>
            <span>Client-Side · No Data Uploaded</span>
          </span>
          <span className="text-xs font-mono text-text-dim">v0.1</span>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-[1fr_320px] gap-4 p-4 min-h-0">
        <section className="flex flex-col gap-3 min-h-0">
          <div className="relative aspect-[4/3] w-full max-h-[70vh] mx-auto">
            <SceneViewer />
            <div className="absolute top-3 right-3 z-10 w-[230px]">
              <SliderPanel />
            </div>
            <div className="absolute bottom-3 left-3 z-10">
              <SceneLoader />
            </div>
          </div>
          <div className="flex items-center gap-4 px-1">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={wireframe}
                onChange={(e) => setWireframe(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent"
              />
              <span className="text-xs text-text-muted">Wireframe</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={autoRotate}
                onChange={(e) => setAutoRotate(e.target.checked)}
                className="w-3.5 h-3.5 accent-accent"
              />
              <span className="text-xs text-text-muted">Auto-rotate</span>
            </label>
            <span className="text-[11px] text-text-dim ml-auto font-mono">
              sliders update the model in real time
            </span>
          </div>
        </section>

        <aside className="flex flex-col gap-3 overflow-y-auto min-h-0 pr-1">
          <TargetPanel />
          <AIExplanationPanel />
          <DeltaPanel />
        </aside>
      </main>
    </div>
  );
}
