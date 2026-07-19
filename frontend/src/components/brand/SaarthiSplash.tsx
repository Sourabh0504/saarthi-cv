import { useEffect, useRef, useState } from "react";
import { SaarthiMark } from "./SaarthiMark";

/**
 * Full-screen Saarthi splash — the platform-level equivalent of
 * CreativeVisibility's own SplashLoader (dashboard.tsx), reusing the exact
 * same structural/animation classes already defined globally in styles.css
 * (.splash-overlay, .splash-grid, .splash-orbit-1/2, .splash-title/sub/
 * bar-track, .splash-shimmer, the spin-slow/spin-rev/shimmer keyframes) so
 * the motion language matches, with Saarthi's own mark, indigo palette, and
 * generic copy — no personal developer-credit section, since that's a
 * choice specific to the Creative Visibility tool's own branding.
 *
 * `visible`/`secs` follow the same contract as SplashLoader: the host page
 * ticks `secs` once per second while the splash is shown, and keeps
 * `visible` true for a minimum of 5 real seconds from load start regardless
 * of how fast the actual fetch finishes (see useMinSplashDuration below).
 */
export function SaarthiSplash({ visible, secs }: { visible: boolean; secs: number }) {
  const pct = Math.min(97, secs < 5 ? secs * 19 : 95 + (secs - 5) * 0.5);

  const msg =
    secs === 0
      ? "Initializing Saarthi…"
      : secs < 2
      ? "Connecting to your workspace…"
      : secs < 4
      ? "Loading account data…"
      : "Almost there…";

  return (
    <div className={`sr-theme splash-overlay no-print${visible ? "" : " fade-out"}`} aria-live="polite" aria-label="Loading Saarthi" role="status">
      <div className="splash-grid" aria-hidden />

      <div className="relative z-10 flex w-full max-w-sm flex-col items-center gap-8 px-6">
        {/* Mark with orbiting rings */}
        <div className="relative flex h-28 w-28 items-center justify-center">
          <div className="splash-orbit-1 absolute inset-0">
            <svg viewBox="0 0 112 112" className="h-full w-full" aria-hidden>
              <circle cx="56" cy="56" r="52" fill="none" stroke="hsl(230 92% 68% / 0.22)" strokeWidth="1" strokeDasharray="6 10" />
              <circle cx="56" cy="4" r="3" fill="hsl(230 92% 68% / 0.85)" />
            </svg>
          </div>
          <div className="splash-orbit-2 absolute inset-4">
            <svg viewBox="0 0 80 80" className="h-full w-full" aria-hidden>
              <circle cx="40" cy="40" r="36" fill="none" stroke="hsl(265 88% 72% / 0.16)" strokeWidth="1" strokeDasharray="3 8" />
              <circle cx="40" cy="4" r="2" fill="hsl(265 88% 72% / 0.6)" />
            </svg>
          </div>
          <div className="animate-sr-breathe relative flex h-16 w-16 items-center justify-center rounded-full border border-sr-primary/35 bg-gradient-to-br from-sr-primary/15 to-sr-primary/5">
            <SaarthiMark theme="dark" size={28} />
          </div>
        </div>

        {/* Brand name */}
        <div className="space-y-1.5 text-center">
          <h1 className="splash-title text-2xl font-bold tracking-tight text-sr-foreground">Saarthi</h1>
          <p className="splash-sub text-xs uppercase tracking-widest text-sr-muted-foreground">Insight · Intelligence · Impact</p>
        </div>

        {/* Progress bar + status */}
        <div className="splash-bar-track w-full space-y-3">
          <div className="flex items-center justify-between text-xs text-sr-muted-foreground">
            <span>{msg}</span>
            <span className="font-sr-num tabular-nums">{secs}s</span>
          </div>
          <div className="relative h-[3px] overflow-hidden rounded-full bg-sr-foreground/5">
            <div className="splash-shimmer absolute inset-0" aria-hidden />
            <div className="h-full rounded-full bg-sr-gradient-brand transition-all duration-1000 ease-out" style={{ width: `${pct}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Drives the SaarthiSplash's `visible`/`secs` props: keeps the splash on
 * screen for a minimum of 5 real seconds from when `loading` first becomes
 * true, regardless of how fast the underlying fetch actually finishes.
 * Pass the same `loading` boolean the page already tracks for its data fetch.
 */
export function useMinSplashDuration(loading: boolean, minMs = 5000) {
  const [visible, setVisible] = useState(true);
  const [secs, setSecs] = useState(0);
  // Set once at mount (this component instance's own load start), never reset.
  const startedAtRef = useRef(Date.now());

  useEffect(() => {
    if (loading) return;
    const elapsed = Date.now() - startedAtRef.current;
    const delay = Math.max(300, minMs - elapsed);
    const t = setTimeout(() => setVisible(false), delay);
    return () => clearTimeout(t);
  }, [loading, minMs]);

  useEffect(() => {
    if (!visible) { setSecs(0); return; }
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [visible]);

  return { visible, secs };
}
