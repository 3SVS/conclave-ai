"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageToggle } from "@/components/LanguageToggle";

/** Thin global top bar: brand mark + wordmark (left), language toggle (right). */
export function AppHeader() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-gray-200 bg-white/85 px-5 backdrop-blur">
      <Link href="/projects" className="group flex items-center gap-2">
        <span className="grid h-5 w-5 place-items-center rounded-[5px] bg-brand-600 text-[11px] font-bold leading-none text-white">
          C
        </span>
        <span className="text-sm font-semibold tracking-tight text-gray-900">{t.brand.wordmark}</span>
        <span className="hidden border-l border-gray-200 pl-2 text-xs text-gray-400 md:inline">
          {t.brand.tagline}
        </span>
      </Link>
      <LanguageToggle />
    </header>
  );
}
