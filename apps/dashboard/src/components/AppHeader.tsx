"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageToggle } from "@/components/LanguageToggle";

/** Thin global top bar: wordmark (left) + language toggle (right). */
export function AppHeader() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-20 flex items-center justify-between border-b border-gray-200 bg-white/90 px-5 py-2.5 backdrop-blur">
      <Link href="/projects" className="flex items-baseline gap-2">
        <span className="text-sm font-semibold tracking-tight text-gray-900">{t.brand.wordmark}</span>
        <span className="hidden text-xs text-gray-400 sm:inline">{t.brand.tagline}</span>
      </Link>
      <LanguageToggle />
    </header>
  );
}
