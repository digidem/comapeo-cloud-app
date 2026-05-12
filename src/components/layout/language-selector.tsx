import { useEffect, useRef, useState } from 'react';

import { SUPPORTED_LOCALES } from '@/i18n/load-messages';
import { useLocaleStore } from '@/stores/locale-store';
import type { Locale } from '@/stores/locale-store';

const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  pt: 'Português',
  es: 'Español',
};

function GlobeIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

export function LanguageSelector() {
  const locale = useLocaleStore((s) => s.locale);
  const setLocale = useLocaleStore((s) => s.setLocale);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-1 h-9 px-2 rounded-btn text-sm font-medium text-text-muted hover:text-text hover:bg-black/5 transition-colors"
      >
        <GlobeIcon />
        <span className="uppercase font-semibold">{locale}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-card shadow-elevated border border-border py-1 z-50">
          {SUPPORTED_LOCALES.map((loc) => (
            <button
              key={loc}
              onClick={() => {
                setLocale(loc);
                setOpen(false);
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-surface transition-colors ${
                locale === loc ? 'font-bold text-primary' : 'text-text'
              }`}
            >
              {LOCALE_NAMES[loc]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
