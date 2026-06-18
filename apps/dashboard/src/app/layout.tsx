import type { Metadata } from "next";
import "./globals.css";
import { I18nProvider } from "@/i18n/I18nProvider";
import { AppHeader } from "@/components/AppHeader";

export const metadata: Metadata = {
  title: "Conclave — Acceptance workspace for AI-built software",
  description:
    "Turn product intent into acceptance checks, review history, and fix instructions for AI-built software.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <I18nProvider>
          <AppHeader />
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
