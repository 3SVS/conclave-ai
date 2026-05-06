import type { Metadata } from "next";
import "./globals.css";

const SITE_URL = "https://conclave-ai.dev";

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
    <html lang="en">
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
