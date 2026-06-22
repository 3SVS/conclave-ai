import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Simsa for Developers",
  description:
    "Developer docs for Simsa — review, compare, and accept AI-built software with evidence.",
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
