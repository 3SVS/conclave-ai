import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        passed: { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
        failed: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
        inconclusive: { bg: "#fffbeb", text: "#d97706", border: "#fde68a" },
        decision: { bg: "#f5f3ff", text: "#7c3aed", border: "#ddd6fe" },
      },
    },
  },
  plugins: [],
};

export default config;
