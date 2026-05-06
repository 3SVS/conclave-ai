import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Conclave AI — multi-agent code review for your PRs",
  description:
    "A council of AI agents reviews every PR against your PRD. Catches real blockers, then auto-fixes them.",
  openGraph: {
    title: "Conclave AI",
    description:
      "A council of AI agents reviews every PR against your PRD. Catches real blockers, then auto-fixes them.",
    type: "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">{children}</body>
    </html>
  );
}
