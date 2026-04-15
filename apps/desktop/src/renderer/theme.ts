export type { ThemePreference } from '../shared';
import type { ThemePreference } from '../shared';

export type ResolvedTheme = Exclude<ThemePreference, 'system'>;

export const THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';
const REDUCED_MOTION_MEDIA_QUERY = '(prefers-reduced-motion: reduce)';
const THEME_TRANSITION_TIMEOUT_MS = 320;

let activeThemeTransitionTimeout: number | null = null;

export function resolveThemePreference(
  preference: ThemePreference,
  systemPrefersDark = true,
): ResolvedTheme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }

  return preference;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === 'function'
    && window.matchMedia(REDUCED_MOTION_MEDIA_QUERY).matches;
}

function clearThemeTransition(root: HTMLElement): void {
  delete root.dataset['themeTransition'];

  if (activeThemeTransitionTimeout !== null) {
    window.clearTimeout(activeThemeTransitionTimeout);
    activeThemeTransitionTimeout = null;
  }
}

export function applyResolvedTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  const previousTheme = root.dataset['theme'];
  const shouldAnimateTransition =
    previousTheme !== undefined
    && previousTheme.length > 0
    && previousTheme !== theme
    && !prefersReducedMotion();

  clearThemeTransition(root);

  if (shouldAnimateTransition) {
    root.dataset['themeTransition'] = 'active';
  }

  root.dataset['theme'] = theme;
  root.style.colorScheme = theme;

  if (!shouldAnimateTransition) {
    return;
  }

  activeThemeTransitionTimeout = window.setTimeout(() => {
    delete root.dataset['themeTransition'];
    activeThemeTransitionTimeout = null;
  }, THEME_TRANSITION_TIMEOUT_MS);
}
