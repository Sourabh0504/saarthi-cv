import { cn } from "@/lib/utils";
import { SaarthiMark } from "./SaarthiMark";

/**
 * Animated Saarthi mark for loading states — a slow compass-like rotation
 * (fitting for a "guide" brand), not a generic spinner. Respects
 * prefers-reduced-motion via the `.saarthi-loader-spin` rule in styles.css.
 */
export function SaarthiLoader({
  theme = "dark",
  size = 64,
  label,
  className,
}: {
  theme?: "dark" | "light";
  size?: number;
  label?: string;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-4", className)} role="status" aria-live="polite">
      <SaarthiMark theme={theme} size={size} className="saarthi-loader-spin" />
      {label ? (
        <p
          className="text-xs font-medium uppercase tracking-[0.22em]"
          style={{ color: theme === "dark" ? "#8CA3FF" : "#5678D9" }}
        >
          {label}
        </p>
      ) : (
        <span className="sr-only">Loading</span>
      )}
    </div>
  );
}
