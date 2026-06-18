import type { Config } from "tailwindcss";
import colors from "tailwindcss/colors";

/**
 * Stage 60 — Linear-grade, neutral-first design tokens.
 *
 * - `gray` is remapped to `zinc` so the whole UI reads as a calm, neutral B2B
 *   workspace instead of the slightly-blue default Tailwind gray.
 * - `indigo` (used app-wide for primary actions/links) is remapped to a calm,
 *   low-saturation deep green — this recolors every legacy `indigo-*` class without
 *   touching 13 screens. `brand` is the same scale for new code.
 * - `decision` status moves off bright violet to slate (info), per the restrained
 *   accent rule: status color only where it carries meaning, no high-chroma purple.
 */
const forest = {
  50: "#f1f7f4",
  100: "#dceae3",
  200: "#bbd6c8",
  300: "#90bba6",
  400: "#629a80",
  500: "#437d63",
  600: "#326b52",
  700: "#28543f",
  800: "#234435",
  900: "#1e392d",
  950: "#0f211a",
};

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          "var(--font-geist-sans)",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Apple SD Gothic Neo",
          "Pretendard",
          "sans-serif",
        ],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        gray: colors.zinc,
        indigo: forest,
        brand: forest,
        passed: { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
        failed: { bg: "#fef2f2", text: "#b91c1c", border: "#fecaca" },
        inconclusive: { bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
        decision: { bg: "#f8fafc", text: "#475569", border: "#e2e8f0" },
      },
      borderColor: {
        DEFAULT: colors.zinc[200],
      },
    },
  },
  plugins: [],
};

export default config;
