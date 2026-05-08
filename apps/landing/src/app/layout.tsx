import type { Metadata } from "next";
import { Bricolage_Grotesque, Geist, JetBrains_Mono, Newsreader } from "next/font/google";
import "./globals.css";

const SITE_URL = "https://conclave-ai.dev";

// Editorial-dev-tool typography stack:
//   - Bricolage Grotesque: distinctive display/heading face. Variable
//     axes (wdth/opsz) give us tightening at large sizes without
//     swapping cuts.
//   - Geist: Vercel's body sans — technical, slightly warmer than Inter.
//   - JetBrains Mono: monospace for cli commands, section markers,
//     numeric data.
//   - Newsreader Italic: serif italic used sparingly for editorial
//     emphasis (the "honest numbers" pulled quote, the v0.16 marker).
const fontDisplay = Bricolage_Grotesque({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-display",
  weight: ["400", "500", "600", "700", "800"],
});

const fontSans = Geist({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-sans",
  weight: ["300", "400", "500", "600", "700"],
});

const fontMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-mono",
  weight: ["400", "500", "700"],
});

const fontSerif = Newsreader({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-serif",
  style: ["italic"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "Conclave AI — multi-agent code review for your PRs",
  description:
    "A council of AI agents reviews every PR against your PRD. Catches real blockers, then auto-fixes them.",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: "Conclave AI",
    description:
      "A council of AI agents reviews every PR against your PRD. Catches real blockers, then auto-fixes them.",
    type: "website",
    url: SITE_URL,
    siteName: "Conclave AI",
  },
  twitter: {
    card: "summary",
    title: "Conclave AI",
    description:
      "A council of AI agents reviews every PR against your PRD. Catches real blockers, then auto-fixes them.",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${fontDisplay.variable} ${fontSans.variable} ${fontMono.variable} ${fontSerif.variable}`}
    >
      <body className="antialiased font-sans bg-paper text-ink">{children}</body>
    </html>
  );
}
