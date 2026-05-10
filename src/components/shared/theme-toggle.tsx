// TEMPORARY: Remove after theme comparison
import { useThemeStore } from '@/stores/theme-store';
import type { ThemeId } from '@/stores/theme-store';

const THEME_OPTIONS: Array<{ id: ThemeId; label: string }> = [
  { id: 'cloud', label: 'Cloud' },
  { id: 'mobile', label: 'Mobile' },
  { id: 'sentinel', label: 'Sentinel' },
];

export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);

  return (
    <div className="flex items-center gap-1 rounded-full bg-white/10 p-0.5">
      {THEME_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => setTheme(option.id)}
          className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors cursor-pointer ${
            theme === option.id
              ? 'bg-white text-primary-navy'
              : 'text-white/70 hover:text-white'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
