import { useThemeStore } from '@/stores/theme-store';
import type { ThemeId } from '@/stores/theme-store';

interface MapColors {
  observed: string;
  connectivity: string;
  warning: string;
  cluster: string;
  grid: string;
}

interface ThemeTokens {
  mapColors: MapColors;
  navy: string;
}

const THEME_TOKEN_MAP: Record<ThemeId, ThemeTokens> = {
  cloud: {
    mapColors: {
      observed: '#1F6FFF',
      connectivity: '#0F9D58',
      warning: '#FF6B00',
      cluster: '#7C3AED',
      grid: '#04145C',
    },
    navy: '#04145C',
  },
  mobile: {
    mapColors: {
      observed: '#E85C41',
      connectivity: '#529214',
      warning: '#FF9933',
      cluster: '#E85C41',
      grid: '#020E62',
    },
    navy: '#020E62',
  },
  sentinel: {
    mapColors: {
      observed: '#0053CD',
      connectivity: '#008649',
      warning: '#E86200',
      cluster: '#5B21B6',
      grid: '#04145C',
    },
    navy: '#04145C',
  },
};

function useThemeTokens(): ThemeTokens {
  const theme = useThemeStore((s) => s.theme);
  return THEME_TOKEN_MAP[theme];
}

export { useThemeTokens };
export type { ThemeTokens, MapColors };
