export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'server-devtools-theme'
export const THEME_OPTIONS = [
  { value: 'system' as const, label: 'System' },
  { value: 'light' as const, label: 'Light' },
  { value: 'dark' as const, label: 'Dark' },
]

type StorageLike = {
  getItem: (key: string) => string | null | undefined
  setItem: (key: string, value: string) => void
}
type ThemeRoot = {
  classList: { toggle: (value: string, force?: boolean) => boolean }
  style: { colorScheme: string }
}

export function getBrowserStorage(): StorageLike | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

const isThemePreference = (value: string | null | undefined): value is ThemePreference =>
  value === 'light' || value === 'dark' || value === 'system'

export function readThemePreference(storage: StorageLike | null | undefined): ThemePreference {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY)
    return isThemePreference(value) ? value : 'system'
  } catch {
    return 'system'
  }
}

export function writeThemePreference(preference: ThemePreference, storage: StorageLike | null | undefined): void {
  try {
    storage?.setItem(THEME_STORAGE_KEY, preference)
  } catch {
    // Storage can be unavailable in private browsing or with blocked cookies.
  }
}

export function resolveThemePreference(preference: ThemePreference, prefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return prefersDark ? 'dark' : 'light'
  return preference
}

export function applyTheme(theme: ResolvedTheme, root: ThemeRoot): void {
  root.classList.toggle('dark', theme === 'dark')
  root.style.colorScheme = theme
}
