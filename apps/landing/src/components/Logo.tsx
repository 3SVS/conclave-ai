/**
 * Conclave AI logo — icon + wordmark.
 *
 * Concept: three filled dots in triangle layout inside a circle outline.
 *   - 3 dots = 3 agents (Claude / OpenAI / Gemini) — the council
 *   - triangle = balanced council, no center
 *   - outer ring = "conclave" (Latin root: "with key" → closed gathering)
 *   - geometric only, zero ornament — fits "serious dev tool" tone
 *
 * Designed by hand in SVG; scalable to any size. The icon is independent
 * of the wordmark — use <LogoIcon /> alone for favicon / app icon, or
 * <Logo /> for inline header (icon + text).
 *
 * Single-color: pass `color` prop (defaults to currentColor so it inherits
 * from text-COLOR Tailwind classes on the parent).
 */

interface LogoProps {
  size?: number;
  className?: string;
  /** Override stroke/fill color. Defaults to currentColor. */
  color?: string;
}

/**
 * The icon mark alone — three dots inside an outline circle.
 * 24x24 viewBox, scales cleanly to favicon (16) all the way up to hero (96+).
 */
export function LogoIcon({ size = 24, className, color = "currentColor" }: LogoProps) {
  // Triangle vertices for three council dots, inscribed inside the ring.
  // Computed: circle radius 9 from center (12,12), dots at angles
  // -90°, 30°, 150° from center, dot radius 1.8.
  const cx = 12;
  const cy = 12;
  const r = 4.5;
  const top = { x: cx, y: cy - r };
  const right = { x: cx + r * Math.cos((30 * Math.PI) / 180), y: cy + r * Math.sin((30 * Math.PI) / 180) };
  const left = { x: cx - r * Math.cos((30 * Math.PI) / 180), y: cy + r * Math.sin((30 * Math.PI) / 180) };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <circle cx={cx} cy={cy} r="10" stroke={color} strokeWidth="1.4" />
      <circle cx={top.x} cy={top.y} r="1.6" fill={color} />
      <circle cx={right.x} cy={right.y} r="1.6" fill={color} />
      <circle cx={left.x} cy={left.y} r="1.6" fill={color} />
    </svg>
  );
}

/**
 * Inline horizontal logo: icon + wordmark "conclave-ai".
 * The "-ai" suffix is colored with the Tailwind accent palette so it
 * pops against the dark wordmark in light mode + reads as "the SaaS".
 */
export function Logo({ size = 22, className }: { size?: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <LogoIcon size={size} className="text-accent-900" />
      <span className="font-mono tracking-tight text-base">
        <span className="text-neutral-900">conclave</span>
        <span className="text-accent-700">-ai</span>
      </span>
    </span>
  );
}

/**
 * Wordmark only (no icon) — for the footer or small contexts where the
 * mark would crowd the surrounding type.
 */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`font-mono tracking-tight text-base ${className ?? ""}`}>
      <span className="text-neutral-900">conclave</span>
      <span className="text-accent-700">-ai</span>
    </span>
  );
}
