# AI Adaptive 3D Scene Optimizer

A web-based AI tool that analyzes 3D scenes, explains performance issues, recommends optimization presets via sliders, and converts high-poly assets into game-ready models with measurable before/after improvements.

**Context: 24-hour hackathon.** Ship a working demo, not a product. Cut anything that doesn't show up in the live pitch.

---

## Locked decisions (do not re-debate)

### Tech stack
| Layer | Choice |
|-------|--------|
| Build | Vite + React 18 + TypeScript |
| 3D | Three.js via `@react-three/fiber` + `@react-three/drei` |
| UI | Tailwind CSS + shadcn/ui (Radix primitives) |
| State | Zustand (one store: scene, sliders, analysis, AI response) |
| Mesh ops | `@gltf-transform/core` + `@gltf-transform/functions` (wraps meshoptimizer WASM) |
| Texture ops | Canvas-based downscale only (NO KTX2/Basis in v1) |
| AI | **Groq + Llama 3.3 70B Versatile** (JSON mode + Zod validation client-side) |
| Backend | Vercel Edge Function (single file) — proxies Groq, hides API key |
| Export | gltf-transform `write()` → GLB (binary, single file) |
| Hosting | Vercel free tier |

### Architecture
- **100% client-side optimization** in a Web Worker. No file uploads, no server-side mesh work.
- Backend exists ONLY as a thin Groq proxy to hide `GROQ_API_KEY`.
- Hard cap on input: 100MB / 1M tris.
- Pre-cache Groq responses for the 3 demo scenes in `public/ai-cache/{sceneHash}.json` as fallback if the live API fails during the pitch.

### Why Groq over Gemini
Hackathon demo = latency matters. Groq returns in ~300–700ms vs Gemini's 2–5s. Pre-caching covers the JSON-schema reliability gap. Provider lives behind an interface (`lib/ai/providerInterface.ts`) so swapping is one file.

---

## 24-hour phased plan

| Hours | Phase | Demoable outcome |
|-------|-------|------------------|
| 0–2 | Bootstrap + scene download script | Vite app runs, 3 demo `.glb` files in `public/scenes/` |
| 2–3 | Viewer | Pick scene from dropdown, orbit around it |
| 3–7 | Analysis Engine | Cost Score + metrics panel populated on scene load |
| 7–12 | Optimization v1 + sliders + worker | Drag sliders → click Optimize → tris drop, delta panel updates |
| 12–13 | Export | Download optimized `.glb`, opens in Blender |
| 13–17 | AI integration | Groq explains scene + auto-adjusts sliders |
| 17–19 | Before/after toggle + wireframe | A/B button swaps original vs optimized |
| 19–21 | Demo polish + AI response pre-caching | All 3 demo scenes have rehearsed AI flow |
| 21–23 | Bug bash | Whatever broke |
| 23–24 | Slides + rehearsal | 60-second demo runs cleanly |

**Demo-ready checkpoint: end of hour 19.** Hours 19–24 are buffer + polish.

---

## v1 scope (IN)

- 3 preloaded demo scenes (no upload UI)
- Scene Analysis Engine (deterministic): poly/object/material/texture extraction, scene type classification, issue flags, Cost Score 0–1000
- 3 sliders: **Geometry Density**, **Texture Quality**, **Material Complexity**
- Optimization Engine: gltf-transform decimate + dedupe materials + canvas-resize textures
- AI panel: Groq-generated explanation + recommended slider preset (auto-applied, user can override)
- Before/after A/B toggle + wireframe overlay
- Metrics delta panel (geometry, cost score, materials, texture size)
- GLB export

## Stretch goals (CUT from 24h, revisit ONLY if hours 19–24 free up)

Listed in priority order — pull from top of list if time permits:

1. **User upload** with drag-drop + 100MB cap (~2h)
2. **LOD Aggression slider + LOD generation** via gltf-transform (~3h)
3. **Side-by-side split-screen comparison** instead of toggle (~1.5h)
4. **Deformation Protection slider** — see explanation below (~4h for conservative version)
5. **Device budget bar** (mobile / low-PC / mid-PC / high-PC utilization) (~1.5h)
6. **`.gltf` separated export** alongside `.glb` (~1h)
7. **Scene hashing / integrity stub** for "security layer" story (~1h)
8. **Smoke tests on analysis engine** (Vitest, ~2h)
9. **VR device profile** (~30m)
10. **FPS overlay** (~1h, low value)
11. **KTX2/Basis texture encoding** — DO NOT pull, takes longer than estimated

### Deformation protection — explained
A rigged character (mesh with bones) has joints — elbows, knees, knuckles. Aggressive simplification collapses triangles around those joints. When the character animates, those zones pinch/tear/look broken. "Deformation protection" means preserving more detail in animation-critical regions.

**v1 behavior (already in scope):** if `gltf` document contains a `skin`, the optimizer caps geometry reduction at 30% and focuses on materials/textures. AI panel says "rigged character detected — preserving animation integrity." No slider, no UI complexity.

**Stretch version:** add the slider with OFF/LOW/HIGH, where HIGH protects mesh regions weighted to bones with influence > threshold.

---

## Demo scenes (sourced via script)

Sourced from [Khronos glTF Sample Assets](https://github.com/KhronosGroup/glTF-Sample-Assets) (CC0, no licensing risk).

`scripts/download-demo-scenes.sh` runs on `npm install` (postinstall hook) and pulls:

1. **DamagedHelmet.glb** — high-detail PBR asset, demonstrates texture/material optimization wins
2. **Sponza.glb** — classic scene clutter, many objects + materials, demonstrates draw-call reduction
3. **BrainStem.glb** (or RiggedFigure) — rigged character, demonstrates the rig-detection / conservative-decimation behavior

If any scene's tri count is too low to make the "before" look bad, we subdivide once on load to inflate it.

---

## File structure (target)

```
clean/
├── CLAUDE.md                            # this file
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── index.html
├── scripts/
│   └── download-demo-scenes.sh
├── public/
│   ├── scenes/                          # downloaded GLBs
│   └── ai-cache/                        # pre-recorded Groq responses per scene hash
├── api/
│   └── groq.ts                          # Vercel Edge Function: proxy + key hiding
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── viewer/
│   │   │   ├── SceneViewer.tsx
│   │   │   ├── SceneModel.tsx
│   │   │   ├── ABToggle.tsx             # before/after switch
│   │   │   └── WireframeOverlay.tsx
│   │   ├── dashboard/
│   │   │   ├── MetricsPanel.tsx
│   │   │   ├── AIExplanationPanel.tsx
│   │   │   ├── SliderPanel.tsx
│   │   │   └── DeltaPanel.tsx
│   │   ├── controls/
│   │   │   ├── SceneLoader.tsx
│   │   │   ├── OptimizeButton.tsx
│   │   │   └── ExportButton.tsx
│   │   └── ui/                          # shadcn primitives
│   ├── lib/
│   │   ├── analysis/
│   │   │   ├── sceneAnalyzer.ts
│   │   │   ├── sceneClassifier.ts
│   │   │   ├── issueDetector.ts
│   │   │   └── costScore.ts
│   │   ├── context/
│   │   │   └── contextBuilder.ts
│   │   ├── ai/
│   │   │   ├── providerInterface.ts
│   │   │   ├── groqClient.ts
│   │   │   ├── prompt.ts
│   │   │   └── responseSchema.ts        # Zod schema for slider preset
│   │   ├── optimization/
│   │   │   ├── pipeline.ts
│   │   │   ├── worker.ts
│   │   │   ├── decimate.ts
│   │   │   ├── mergeMaterials.ts
│   │   │   └── resizeTextures.ts
│   │   ├── export/
│   │   │   └── glbExporter.ts
│   │   └── utils/
│   │       ├── gltfLoader.ts
│   │       └── format.ts
│   ├── store/
│   │   └── sceneStore.ts                # Zustand
│   └── styles/
│       └── globals.css
```

---

## Key risks (watch list)

- **gltf-transform + Vite WASM bundling** — needs `vite-plugin-wasm` + `vite-plugin-top-level-await`. Budget 30 min in Phase 1, not later.
- **Web Worker can't import three directly** — keep worker scope to gltf-transform pure ops; do not pass Three.js objects across the worker boundary, only ArrayBuffers.
- **Groq API outage during pitch** — pre-cached responses in `public/ai-cache/` are non-negotiable.
- **Rigged mesh + aggressive decimation = visible mesh tearing** — guard with `skin` detection; cap reduction at 30% for rigged scenes.
- **Memory blowup on large scenes** — hard cap at 1M tris before parsing. Demo scenes stay under this.

---

## Working agreements

- **Don't re-debate locked decisions** above. If a tradeoff comes up mid-build, pick the option that ships fastest and note it for v2.
- **Stretch goals only get pulled in after hour 19** and only if the demo flow already works end-to-end.
- **Pre-cache AI responses** the moment the AI integration works — don't wait until hour 23.
- **Test the export in Blender at end of Phase 4** (hour 13). If the GLB is broken, we lose the export story and need to fix immediately.
- **One commit per phase** so we can roll back if a phase breaks the build.
