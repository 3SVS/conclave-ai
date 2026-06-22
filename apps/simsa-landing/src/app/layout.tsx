import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simsa — The acceptance layer for AI-built software.",
  description: "Review, compare, and accept AI-built software with evidence.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
