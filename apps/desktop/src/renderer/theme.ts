export type { ThemePreference } from '../shared/settings';
import type { ThemePreference } from '../shared/settings';

export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

export function resolveThemePreference(
  preference: ThemePreference,
  systemPrefersDark = true,
): ResolvedTheme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }

  return preference;
}

export function applyResolvedTheme(theme: ResolvedTheme): void {
  document.documentElement.dataset['theme'] = theme;
  document.documentElement.style.colorScheme = theme;
}
