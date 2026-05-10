import { useEffect } from 'react';

import { useThemeStore } from '@/stores/theme-store';
import type { ThemeId } from '@/stores/theme-store';

const THEME_META_COLORS: Record<ThemeId, string> = {
  cloud: '#04145C',
  mobile: '#020E62',
  sentinel: '#04145C',
};

function useThemeClass() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    const html = document.documentElement;
    html.className = `theme-${theme}`;
    html.dataset.theme = theme;

    let meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = THEME_META_COLORS[theme];
  }, [theme]);
}

export { useThemeClass };
