import { useEffect, useRef, useState } from 'react';
import { useSceneStore } from '@/store/sceneStore';

const PARTICLE_COUNT = 1800;
const ACCENT = '#7c5cff';
const ACCENT_GLOW = 'rgba(124, 92, 255, 0.65)';
const BG = '#0d0d12';

// Pyramid silhouette in cursor-relative coords (matches the header logo).
// Particles inside this triangle get pushed outward — the cursor effectively
// IS the logo, and particles flow around it.
const PYRAMID_SCALE = 32;
const PYRAMID_VERTICES: [number, number][] = [
  [0, -1.0 * PYRAMID_SCALE],   // apex
  [-0.85 * PYRAMID_SCALE, 0.85 * PYRAMID_SCALE], // bottom-left
  [0.85 * PYRAMID_SCALE, 0.85 * PYRAMID_SCALE],  // bottom-right
];

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Two target sets that we lerp between based on `morph` (0 = paper text, 1 = header layout)
  textTargetX: number;
  textTargetY: number;
  headerTargetX: number;
  headerTargetY: number;
  jitter: number; // tiny per-particle phase offset for idle motion
};

/**
 * Sample the alpha pixels of a rendered string (or any draw callback) at
 * regular intervals, returning N candidate positions. Used to lay out
 * particles into the shape of "paper" text and the smaller header layout.
 */
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

/** Standard point-in-triangle barycentric test. */
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

export function LandingPage() {
  const setView = useSceneStore((s) => s.setView);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const morphRef = useRef(0); // 0 = paper text, 1 = header layout
  const mouseRef = useRef<{ x: number; y: number; inside: boolean }>({
    x: 0,
    y: 0,
    inside: false,
  });
  const [hoveringButton, setHoveringButton] = useState(false);
  const [overlayShown, setOverlayShown] = useState(false);

  // Drive the morph target via the hover state.
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

  // Once particles have substantially morphed to header layout, also fade in
  // the real DOM logo+text so it feels like the particles are "settling" into
  // the actual header element.
  useEffect(() => {
    if (hoveringButton) {
      const t = setTimeout(() => setOverlayShown(true), 240);
      return () => clearTimeout(t);
    }
    setOverlayShown(false);
    return;
  }, [hoveringButton]);

  // Particle system + render loop.
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

    // ── Sample target positions ─────────────────────────────────────────
    // 1) Big "paper" text positions (idle layout)
    const textPositions = sampleDrawnPixels(
      W,
      H,
      (c) => {
        const fontSize = Math.min(W / 4.6, H / 1.8);
        c.fillStyle = '#fff';
        c.font = `700 ${fontSize}px Inter, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('paper', W / 2, H / 2);
      },
      4
    );

    // 2) Header-layout positions: small pyramid + "paper" + tagline,
    //    drawn at the size and position they'd occupy in the real header.
    const headerPositions = sampleDrawnPixels(
      W,
      H,
      (c) => {
        const cx = W / 2 - 110;
        const cy = H / 2;
        const logoSize = 22;
        // Pyramid logo (left-face filled, right-face outline) — matches header SVG
        c.save();
        c.translate(cx, cy);
        c.fillStyle = '#fff';
        c.beginPath();
        c.moveTo(0, -logoSize / 2);
        c.lineTo(-logoSize / 2.4, logoSize / 2);
        c.lineTo(0, logoSize / 4);
        c.closePath();
        c.fill();
        c.lineWidth = 2;
        c.strokeStyle = '#fff';
        c.beginPath();
        c.moveTo(0, -logoSize / 2);
        c.lineTo(0, logoSize / 4);
        c.lineTo(logoSize / 2.4, logoSize / 2);
        c.closePath();
        c.stroke();
        c.restore();
        // "paper" word
        c.fillStyle = '#fff';
        c.font = `600 22px Inter, sans-serif`;
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText('paper', cx + 18, cy);
        // tagline
        c.font = `500 11px "JetBrains Mono", monospace`;
        c.fillStyle = 'rgba(255,255,255,0.6)';
        c.fillText('3D OPTIMIZATION FOR EVERYONE', cx + 90, cy + 1);
      },
      3
    );

    if (textPositions.length === 0 || headerPositions.length === 0) return;

    // Build particles, mapping each to a paired target in both layouts.
    const shuffledText = shuffle(textPositions);
    const shuffledHeader = shuffle(headerPositions);
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const t = shuffledText[i % shuffledText.length];
      const h = shuffledHeader[i % shuffledHeader.length];
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
      });
    }

    // ── Animation loop ───────────────────────────────────────────────────
    let raf = 0;
    let frame = 0;
    const tick = () => {
      frame++;
      const morph = morphRef.current;
      // Subtle motion-blur background instead of full clear, so trails feel softer.
      ctx.fillStyle = 'rgba(13, 13, 18, 0.28)';
      ctx.fillRect(0, 0, W, H);

      const m = mouseRef.current;
      const repelActive = m.inside && morph < 0.5;

      for (const p of particles) {
        // Lerp between the two layouts based on morph value.
        const tx = p.textTargetX * (1 - morph) + p.headerTargetX * morph;
        const ty = p.textTargetY * (1 - morph) + p.headerTargetY * morph;

        // Spring toward target (stiffer when in header mode so it settles cleanly)
        const stiffness = 0.014 + morph * 0.04;
        const friction = 0.86 + morph * 0.05;
        p.vx += (tx - p.x) * stiffness;
        p.vy += (ty - p.y) * stiffness;

        // Idle micro-jitter so the text breathes when at rest
        if (morph < 0.2) {
          p.vx += Math.cos(frame * 0.012 + p.jitter) * 0.04;
          p.vy += Math.sin(frame * 0.012 + p.jitter) * 0.04;
        }

        // Pyramid-shaped cursor repulsion (only in idle / paper-text mode)
        if (repelActive) {
          const rx = p.x - m.x;
          const ry = p.y - m.y;
          // Quick bounding-circle reject before doing the triangle test
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

      // Render in two passes: glow halo, then crisp dots
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = ACCENT_GLOW;
      for (const p of particles) {
        ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = ACCENT;
      for (const p of particles) {
        ctx.fillRect(p.x - 0.5, p.y - 0.5, 1, 1);
      }

      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    // ── Mouse handlers ───────────────────────────────────────────────────
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
    const onResize = () => {
      setSize();
    };
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
      className="min-h-screen w-full bg-bg text-text font-sans flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: BG }}
    >
      {/* Particle field — fills the central area */}
      <div className="relative w-full max-w-5xl h-[60vh] flex items-center justify-center">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full transition-opacity duration-300"
          style={{
            cursor: 'none',
            opacity: overlayShown ? 0.0 : 1,
          }}
        />
        {/* Custom cursor: pyramid logo following the mouse over the canvas */}
        <CursorPyramid
          getMouse={() => mouseRef.current}
          getCanvas={() => canvasRef.current}
          hidden={hoveringButton}
        />
        {/* Real DOM logo+text that fades in when particles morph to header layout */}
        <div
          className={[
            'flex items-baseline gap-1.5 absolute pointer-events-none transition-opacity duration-500',
            overlayShown ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
        >
          <svg
            viewBox="0 0 24 24"
            className="w-6 h-6 text-accent self-center"
            style={{ filter: 'drop-shadow(0 0 6px rgba(124,92,255,0.55))' }}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
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
          <span className="text-2xl font-semibold lowercase tracking-tight text-text ml-1">
            paper
          </span>
          <span className="text-[11px] font-mono uppercase tracking-wider text-text-dim ml-2">
            3d optimization for everyone
          </span>
        </div>
      </div>

      {/* CTA */}
      <button
        type="button"
        onMouseEnter={() => setHoveringButton(true)}
        onMouseLeave={() => setHoveringButton(false)}
        onClick={() => setView('app')}
        className="mt-12 px-6 py-3 rounded-md text-sm font-semibold border border-accent/40 bg-accent/15 text-text hover:bg-accent/25 hover:border-accent/70 transition-all duration-200 tracking-wide uppercase"
      >
        Explore paper →
      </button>

      <p className="mt-8 text-[11px] font-mono uppercase tracking-widest text-text-dim">
        Hover the particles · Hover the button
      </p>
    </div>
  );
}

/**
 * Renders the origami-pyramid logo at the cursor position, replacing the
 * native cursor over the canvas. Hidden when not hovering or when the
 * button-hover transition is active.
 */
function CursorPyramid({
  getMouse,
  getCanvas,
  hidden,
}: {
  getMouse: () => { x: number; y: number; inside: boolean };
  getCanvas: () => HTMLCanvasElement | null;
  hidden: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const m = getMouse();
      const canvas = getCanvas();
      const el = ref.current;
      if (el && canvas) {
        const visible = m.inside && !hidden;
        el.style.opacity = visible ? '1' : '0';
        el.style.transform = `translate3d(${m.x - 16}px, ${m.y - 16}px, 0)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getMouse, getCanvas, hidden]);

  return (
    <div
      ref={ref}
      className="absolute top-0 left-0 pointer-events-none transition-opacity duration-200 will-change-transform"
      style={{ opacity: 0 }}
    >
      <svg
        viewBox="0 0 24 24"
        className="w-8 h-8 text-accent"
        style={{ filter: 'drop-shadow(0 0 10px rgba(124,92,255,0.85))' }}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
        strokeLinecap="round"
      >
        <path d="M12 3 L4 20 L12 17 Z" fill="currentColor" fillOpacity="0.22" />
        <path d="M12 3 L12 17 L20 20 Z" />
        <path d="M12 3 L4 20 L12 17 Z" />
      </svg>
    </div>
  );
}
