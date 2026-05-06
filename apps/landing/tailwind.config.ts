import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // Single accent color (deep blue) — swap when Bae picks final brand color.
      colors: {
        accent: {
          50: "#eef4f9",
          100: "#d6e3ed",
          200: "#aec7da",
          300: "#7fa4be",
          400: "#5b87a3",
          500: "#3c6a89",
          600: "#2c536e",
          700: "#234058",
          800: "#1c3145",
          900: "#0a3a5e",
          950: "#06243d",
        },
      },
      fontFamily: {
        // System fonts for tech-tool feel; swap when designer picks one.
        sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      maxWidth: {
        prose: "65ch",
      },
    },
  },
  plugins: [],
};

export default config;
