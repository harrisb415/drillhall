import { useEffect, useRef } from "react";

/**
 * A one-shot confetti burst on a throwaway canvas overlay. Hand-rolled rather
 * than pulled from a package: it's ~50 lines, and this app ships to a 1GB VM
 * where every dependency is weight someone has to download and audit.
 *
 * Fires once on mount, cleans up its own rAF, and does nothing at all when the
 * user has asked for reduced motion.
 */
const COLORS = ["#d9a441", "#8b6914", "#e8c67a", "#5fae5f", "#b4441c"];
const PARTICLES = 90;
const DURATION_MS = 2600;

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rot: number;
  vr: number;
}

export function Confetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = (canvas.width = window.innerWidth * dpr);
    const h = (canvas.height = window.innerHeight * dpr);
    ctx.scale(dpr, dpr);
    const vw = window.innerWidth;

    // Two side cannons angled inward — reads as celebratory rather than as
    // something falling on the page.
    const particles: Particle[] = Array.from({ length: PARTICLES }, (_, i) => {
      const fromLeft = i % 2 === 0;
      return {
        x: fromLeft ? 0 : vw,
        y: window.innerHeight * 0.42 + Math.random() * 60,
        vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 7),
        vy: -(4 + Math.random() * 7),
        size: 4 + Math.random() * 5,
        color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
      };
    });

    const start = performance.now();
    let raf = 0;

    const frame = (now: number) => {
      const elapsed = now - start;
      ctx.clearRect(0, 0, w, h);

      for (const p of particles) {
        p.vy += 0.22; // gravity
        p.vx *= 0.99; // drag
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = Math.max(0, 1 - elapsed / DURATION_MS);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        ctx.restore();
      }

      if (elapsed < DURATION_MS) raf = requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(frame);

    return () => cancelAnimationFrame(raf);
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-50 h-full w-full"
    />
  );
}
