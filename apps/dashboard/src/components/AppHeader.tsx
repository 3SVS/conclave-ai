"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { LanguageToggle } from "@/components/LanguageToggle";

/**
 * Minimal workspace top bar. No letter-in-a-box logo (the generic AI-startup
 * cliché) — a confident wordmark with a hairline mark and a quiet beta tag.
 */
export function AppHeader() {
  const { t } = useI18n();
  return (
    <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-gray-200 bg-white px-5">
      <Link href="/projects" className="group flex items-center gap-2.5">
        {/* hairline ring mark — geometric, not a boxed initial */}
        <span
          aria-hidden
          className="h-3 w-3 rounded-full border-[1.5px] border-brand-600 transition-colors group-hover:bg-brand-600"
        />
        <span className="text-[15px] font-semibold tracking-[-0.02em] text-gray-900">
          {t.brand.wordmark}
        </span>
        <span className="rounded bg-gray-100 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-gray-400">
          beta
        </span>
      </Link>
      <LanguageToggle />
    </header>
  );
}
