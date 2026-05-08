import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm cream paper. Used as the dominant page background to
        // step away from the generic pure-white "AI tool" look without
        // sacrificing serious-dev-tool restraint.
        paper: {
          DEFAULT: "#FAFAF7",
          dim: "#F1F0EA",
          line: "#E4E2D9",
          ruleHi: "#1A1817",
        },
        // Near-black ink for text. Slight warm undertone matches the
        // paper bg; pure #000 looks overconfident on cream.
        ink: {
          DEFAULT: "#09090B",
          subtle: "#27272A",
          muted: "#52525B",
          mute: "#71717A",
          ghost: "#A1A1AA",
        },
        // Single deep accent — Stripe-grade ink blue. Applied as a
        // dominant 5–10% color (links, highlight underlines, the
        // primary CTA, focus rings) rather than spread thin.
        accent: {
          50: "#EEF2F7",
          100: "#D9E2EE",
          200: "#B0C0D5",
          300: "#7E94B3",
          400: "#4F6B8E",
          500: "#27466E",
          600: "#163255",
          700: "#0E2547",
          800: "#0A1E3C",
          900: "#0A2540",
          950: "#05132B",
        },
        // Used sparingly for risk/reject affordances + ribbon labels.
        flag: {
          DEFAULT: "#A85410",
          subtle: "#F2E8DA",
        },
      },
      fontFamily: {
        // Display headings — Bricolage Grotesque. Variable axes give us
        // optical-size + width adjustments at large sizes.
        display: ["var(--font-display)", "Bricolage Grotesque", "Georgia", "serif"],
        // Body — Geist (Vercel). Distinctive, technical, but warmer
        // than Inter; pairs with Bricolage's 90s grotesque attitude.
        sans: ["var(--font-sans)", "Geist", "system-ui", "-apple-system", "sans-serif"],
        // Monospace — JetBrains Mono. Used for cli commands, version
        // markers, "001" section labels, code-style accents.
        mono: ["var(--font-mono)", "JetBrains Mono", "ui-monospace", "Menlo", "monospace"],
        // Serif italic — Newsreader Italic. Used for editorial
        // emphasis (one or two pulled quotes), not body.
        serif: ["var(--font-serif)", "Newsreader", "Georgia", "serif"],
      },
      letterSpacing: {
        tightx: "-0.022em",
        tightxx: "-0.034em",
      },
      maxWidth: {
        prose: "62ch",
        page: "1180px",
      },
      boxShadow: {
        // Crisp 1px outer keylines for cards. Softer than CSS default
        // shadow; reads as a printed plate edge rather than a popup.
        plate: "0 0 0 1px #E4E2D9, 0 1px 2px rgba(15,15,15,0.04)",
        plateHi: "0 0 0 1.5px #1A1817, 0 12px 28px -16px rgba(15,15,15,0.18)",
        ring: "0 0 0 2px #FAFAF7, 0 0 0 4px #0A2540",
      },
      keyframes: {
        rise: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        ticker: {
          from: { transform: "translateX(0)" },
          to: { transform: "translateX(-50%)" },
        },
      },
      animation: {
        rise: "rise 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        ticker: "ticker 32s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
