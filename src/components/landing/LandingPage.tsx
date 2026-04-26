import { useEffect, useRef, useState } from 'react';
import { useSceneStore } from '@/store/sceneStore';

const PARTICLE_COUNT = 2400;
const ACCENT = '#7c5cff';
const ACCENT_GLOW = 'rgba(124, 92, 255, 0.6)';
const TEXT_WHITE = '#ffffff';
const TEXT_GLOW = 'rgba(255, 255, 255, 0.4)';
const BG = '#0d0d12';

// Pyramid silhouette in cursor-relative coords. Particles inside this triangle
// get pushed outward — a triangular hole that follows the cursor without any
// visible cursor replacement.
const PYRAMID_SCALE = 32;
const PYRAMID_VERTICES: [number, number][] = [
  [0, -1.0 * PYRAMID_SCALE],
  [-0.85 * PYRAMID_SCALE, 0.85 * PYRAMID_SCALE],
  [0.85 * PYRAMID_SCALE, 0.85 * PYRAMID_SCALE],
];

type ParticleColor = 'accent' | 'white';

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  textTargetX: number;
  textTargetY: number;
  headerTargetX: number;
  headerTargetY: number;
  jitter: number;
  color: ParticleColor;
};

function sampleDrawnPixels(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
  step: number
): { x: number; y: number }[] {
  const off = document.createElement('canvas');
  off.width = width;
  off.height = height;
  const ctx = off.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];
  draw(ctx);
  const data = ctx.getImageData(0, 0, width, height).data;
  const out: { x: number; y: number }[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      if (data[idx + 3] > 100) out.push({ x, y });
    }
  }
  return out;
}

function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pointInTriangle(
  px: number,
  py: number,
  v: [number, number][]
): boolean {
  const [[ax, ay], [bx, by], [cx, cy]] = v;
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Draw the origami pyramid (left face filled, right face outline) at the given
 * center + radius. Proportions match the header SVG paths exactly:
 *   apex          (12, 3)   →  (0, -r)
 *   bottom-left   (4, 20)   →  (-0.94r, +r)
 *   bottom-front  (12, 17)  →  (0, +0.65r)
 *   bottom-right  (20, 20)  →  (+0.94r, +r)
 * (derived from viewBox 0 0 24 24, half-height 8.5 mapped to r.)
 */
const PY_X = 0.94;
const PY_FRONT_Y = 0.65;

function drawPyramid(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: string
) {
  const r = radius;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(2, r * 0.12);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  // Left filled face: apex → bottom-left → bottom-front
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(-PY_X * r, r);
  ctx.lineTo(0, PY_FRONT_Y * r);
  ctx.closePath();
  ctx.fill();
  // Right outline face: apex → bottom-front → bottom-right
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(0, PY_FRONT_Y * r);
  ctx.lineTo(PY_X * r, r);
  ctx.closePath();
  ctx.stroke();
  // Outline the left face too (matches the third path in the SVG)
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.lineTo(-PY_X * r, r);
  ctx.lineTo(0, PY_FRONT_Y * r);
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

export function LandingPage() {
  const setView = useSceneStore((s) => s.setView);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const morphRef = useRef(0);
  const mouseRef = useRef<{ x: number; y: number; inside: boolean }>({
    x: 0,
    y: 0,
    inside: false,
  });
  const [hoveringButton, setHoveringButton] = useState(false);
  const [overlayShown, setOverlayShown] = useState(false);

  // Drive the morph value toward target each frame.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const target = hoveringButton ? 1 : 0;
      morphRef.current += (target - morphRef.current) * 0.08;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [hoveringButton]);

  useEffect(() => {
    if (hoveringButton) {
      const t = setTimeout(() => setOverlayShown(true), 260);
      return () => clearTimeout(t);
    }
    setOverlayShown(false);
    return;
  }, [hoveringButton]);

  // Particle system
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const setSize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    setSize();

    const W = canvas.clientWidth;
    const H = canvas.clientHeight;

    /**
     * Lay out [pyramid · paper] composition centered on (cx, cy). Returns the
     * actual centers each shape should be drawn at so the combined width is
     * exactly centered around `cx`.
     */
    const layoutLogoAndText = (
      cx: number,
      cy: number,
      logoRadius: number,
      fontSize: number,
      gap: number
    ) => {
      // Measure "paper" text width using the canvas API for accurate centering.
      ctx.save();
      ctx.font = `700 ${fontSize}px Inter, sans-serif`;
      const textWidth = ctx.measureText('paper').width;
      ctx.restore();
      const logoWidth = 2 * logoRadius;
      const totalWidth = logoWidth + gap + textWidth;
      const startX = cx - totalWidth / 2;
      return {
        logoCx: startX + logoRadius,
        logoCy: cy,
        textCx: startX + logoWidth + gap + textWidth / 2,
        textCy: cy,
      };
    };

    // ── IDLE LAYOUT: large pyramid (purple) + "paper" (white), centered
    const idleFontSize = Math.min(W / 5.2, H / 1.9);
    const idleLogoRadius = idleFontSize * 0.55;
    const idleGap = idleLogoRadius * 0.7;
    const idle = layoutLogoAndText(
      W / 2,
      H / 2,
      idleLogoRadius,
      idleFontSize,
      idleGap
    );

    const idlePyramidPositions = sampleDrawnPixels(
      W,
      H,
      (c) => drawPyramid(c, idle.logoCx, idle.logoCy, idleLogoRadius, '#fff'),
      4
    );
    const idleTextPositions = sampleDrawnPixels(
      W,
      H,
      (c) => {
        c.fillStyle = '#fff';
        c.font = `700 ${idleFontSize}px Inter, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('paper', idle.textCx, idle.textCy);
      },
      4
    );

    // ── HEADER LAYOUT: mid-size pyramid + "paper" word, also centered.
    const headerFontSize = Math.min(W / 11, H / 6.5);
    const headerLogoRadius = headerFontSize * 0.55;
    const headerGap = headerLogoRadius * 0.7;
    const header = layoutLogoAndText(
      W / 2,
      H / 2 - 30,
      headerLogoRadius,
      headerFontSize,
      headerGap
    );

    const headerPyramidPositions = sampleDrawnPixels(
      W,
      H,
      (c) =>
        drawPyramid(c, header.logoCx, header.logoCy, headerLogoRadius, '#fff'),
      3
    );
    const headerTextPositions = sampleDrawnPixels(
      W,
      H,
      (c) => {
        c.fillStyle = '#fff';
        c.font = `700 ${headerFontSize}px Inter, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('paper', header.textCx, header.textCy);
      },
      3
    );

    if (
      idlePyramidPositions.length === 0 ||
      idleTextPositions.length === 0 ||
      headerPyramidPositions.length === 0 ||
      headerTextPositions.length === 0
    ) {
      return;
    }

    const idleP = shuffle(idlePyramidPositions);
    const idleT = shuffle(idleTextPositions);
    const headP = shuffle(headerPyramidPositions);
    const headT = shuffle(headerTextPositions);

    // Allocate particle counts proportional to source sample density so
    // visual weight stays consistent between pyramid and text.
    const totalIdle = idleP.length + idleT.length;
    const pyramidShare = Math.round(
      (idleP.length / totalIdle) * PARTICLE_COUNT
    );
    const textShare = PARTICLE_COUNT - pyramidShare;

    const particles: Particle[] = [];
    for (let i = 0; i < pyramidShare; i++) {
      const t = idleP[i % idleP.length];
      const h = headP[i % headP.length];
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: 0,
        vy: 0,
        textTargetX: t.x,
        textTargetY: t.y,
        headerTargetX: h.x,
        headerTargetY: h.y,
        jitter: Math.random() * Math.PI * 2,
        color: 'accent',
      });
    }
    for (let i = 0; i < textShare; i++) {
      const t = idleT[i % idleT.length];
      const h = headT[i % headT.length];
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        vx: 0,
        vy: 0,
        textTargetX: t.x,
        textTargetY: t.y,
        headerTargetX: h.x,
        headerTargetY: h.y,
        jitter: Math.random() * Math.PI * 2,
        color: 'white',
      });
    }

    let raf = 0;
    let frame = 0;
    const tick = () => {
      frame++;
      const morph = morphRef.current;
      ctx.fillStyle = 'rgba(13, 13, 18, 0.28)';
      ctx.fillRect(0, 0, W, H);

      const m = mouseRef.current;
      const repelActive = m.inside && morph < 0.5;

      for (const p of particles) {
        const tx = p.textTargetX * (1 - morph) + p.headerTargetX * morph;
        const ty = p.textTargetY * (1 - morph) + p.headerTargetY * morph;

        const stiffness = 0.014 + morph * 0.04;
        const friction = 0.86 + morph * 0.05;
        p.vx += (tx - p.x) * stiffness;
        p.vy += (ty - p.y) * stiffness;

        if (morph < 0.2) {
          p.vx += Math.cos(frame * 0.012 + p.jitter) * 0.04;
          p.vy += Math.sin(frame * 0.012 + p.jitter) * 0.04;
        }

        if (repelActive) {
          const rx = p.x - m.x;
          const ry = p.y - m.y;
          if (rx * rx + ry * ry < (PYRAMID_SCALE * 1.6) ** 2) {
            if (pointInTriangle(rx, ry, PYRAMID_VERTICES)) {
              const dist = Math.hypot(rx, ry) || 1;
              const force = (PYRAMID_SCALE * 1.4 - dist) * 0.18;
              p.vx += (rx / dist) * force;
              p.vy += (ry / dist) * force;
            }
          }
        }

        p.vx *= friction;
        p.vy *= friction;
        p.x += p.vx;
        p.y += p.vy;
      }

      // Render in passes: glow halo first (additive), then crisp dots.
      // Group by color so we minimize fillStyle flips.
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = ACCENT_GLOW;
      for (const p of particles) {
        if (p.color !== 'accent') continue;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      ctx.fillStyle = TEXT_GLOW;
      for (const p of particles) {
        if (p.color !== 'white') continue;
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = ACCENT;
      for (const p of particles) {
        if (p.color !== 'accent') continue;
        ctx.fillRect(p.x - 0.5, p.y - 0.5, 1, 1);
      }
      ctx.fillStyle = TEXT_WHITE;
      for (const p of particles) {
        if (p.color !== 'white') continue;
        ctx.fillRect(p.x - 0.5, p.y - 0.5, 1, 1);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        inside: true,
      };
    };
    const onLeave = () => {
      mouseRef.current.inside = false;
    };
    const onResize = () => setSize();
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', onLeave);
    window.addEventListener('resize', onResize);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousemove', onMove);
      canvas.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return (
    <div
      className="min-h-screen w-full bg-bg text-text font-sans relative overflow-hidden"
      style={{ background: BG }}
    >
      {/* Particle field fills the entire viewport — content rendered at H/2
          inside the canvas now lands exactly on viewport vertical center. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-full max-w-6xl h-full flex items-center justify-center">
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full transition-opacity duration-500"
            style={{ opacity: overlayShown ? 0.0 : 1 }}
          />
          {/* Real DOM logo + text + mission, fades in when particles morph */}
          <div
            className={[
              'absolute pointer-events-none transition-opacity duration-500 flex flex-col items-center text-center px-6',
              overlayShown ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          >
            <div className="flex items-baseline gap-3">
              <svg
                viewBox="0 0 24 24"
                className="w-24 h-24 text-accent self-center"
                style={{
                  filter: 'drop-shadow(0 0 24px rgba(124,92,255,0.75))',
                }}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path
                  d="M12 3 L4 20 L12 17 Z"
                  fill="currentColor"
                  fillOpacity="0.18"
                />
                <path d="M12 3 L12 17 L20 20 Z" />
                <path d="M12 3 L4 20 L12 17 Z" />
              </svg>
              <span className="text-7xl font-semibold lowercase tracking-tight text-text ml-2">
                paper
              </span>
            </div>
            <span className="mt-3 text-[12px] font-mono uppercase tracking-[0.2em] text-text-dim">
              3d optimization for everyone
            </span>
            <p className="mt-7 max-w-xl text-sm leading-relaxed text-text-muted">
              Paper turns 3D asset optimization into three sliders and a button.
              Drop in any model, pick a target — mobile, VR, or PC — and ship a
              platform-ready GLB in seconds. No installs, no expertise, no
              data ever leaves your browser.
            </p>
          </div>
        </div>
      </div>

      {/* Button + helper text pinned near the bottom of the viewport so they
          don't compete with the centered canvas content for vertical space. */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center z-10">
        <button
          type="button"
          onMouseEnter={() => setHoveringButton(true)}
          onMouseLeave={() => setHoveringButton(false)}
          onClick={() => setView('app')}
          className="px-7 py-3 rounded-md text-sm font-semibold border border-accent/40 bg-accent/15 text-text hover:bg-accent/25 hover:border-accent/70 transition-all duration-200 tracking-wide uppercase"
        >
          Explore paper →
        </button>
        <p className="mt-5 text-[11px] font-mono uppercase tracking-widest text-text-dim">
          Move your cursor through the particles · Hover the button to read more
        </p>
      </div>
    </div>
  );
}
