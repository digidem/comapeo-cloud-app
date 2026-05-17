import { defineMessages, useIntl } from 'react-intl';

import { useThemeStore } from '@/stores/theme-store';

const messages = defineMessages({
  light: {
    id: 'theme.light',
    defaultMessage: 'Light',
  },
  dark: {
    id: 'theme.dark',
    defaultMessage: 'Dark',
  },
  system: {
    id: 'theme.system',
    defaultMessage: 'System',
  },
  ariaSetLight: {
    id: 'theme.ariaSetLight',
    defaultMessage: 'Use light theme',
  },
  ariaSetDark: {
    id: 'theme.ariaSetDark',
    defaultMessage: 'Use dark theme',
  },
  ariaSetSystem: {
    id: 'theme.ariaSetSystem',
    defaultMessage: 'Use system theme',
  },
});

export function ThemeToggle() {
  const intl = useIntl();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);

  const modes = ['light', 'dark', 'system'] as const;
  const ariaKeys = {
    light: 'ariaSetLight',
    dark: 'ariaSetDark',
    system: 'ariaSetSystem',
  } as const;

  return (
    <div className="flex items-center gap-1 rounded-pill border border-border bg-surface p-1">
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={`rounded-pill px-3 py-1 text-xs font-medium transition-colors ${
            mode === m
              ? 'bg-primary text-white'
              : 'text-text-muted hover:text-text'
          }`}
          aria-label={intl.formatMessage(messages[ariaKeys[m]])}
          aria-pressed={mode === m}
        >
          {intl.formatMessage(messages[m])}
        </button>
      ))}
    </div>
  );
}
