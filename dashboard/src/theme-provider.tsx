import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type PropsWithChildren } from 'react'
import {
  applyTheme,
  getBrowserStorage,
  readThemePreference,
  resolveThemePreference,
  writeThemePreference,
  type ThemePreference,
} from './theme.ts'
import { ThemeContext } from './theme-context'

function getPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false
}

function subscribeToSystemTheme(preference: ThemePreference, onChange: () => void): () => void {
  if (preference !== 'system' || typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => undefined
  }

  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  if (mediaQuery.addEventListener) mediaQuery.addEventListener('change', onChange)
  else mediaQuery.addListener?.(onChange)
  return () => {
    if (mediaQuery.removeEventListener) mediaQuery.removeEventListener('change', onChange)
    else mediaQuery.removeListener?.(onChange)
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() =>
    readThemePreference(getBrowserStorage()),
  )
  const subscribe = useCallback(
    (onChange: () => void) => subscribeToSystemTheme(preference, onChange),
    [preference],
  )
  const prefersDark = useSyncExternalStore(
    subscribe,
    getPrefersDark,
    () => false,
  )
  const resolvedTheme = resolveThemePreference(preference, prefersDark)

  useEffect(() => {
    if (typeof document !== 'undefined') applyTheme(resolvedTheme, document.documentElement)
  }, [resolvedTheme])

  const setPreference = (nextPreference: ThemePreference) => {
    setPreferenceState(nextPreference)
    writeThemePreference(nextPreference, getBrowserStorage())
  }

  const value = useMemo(() => ({ preference, resolvedTheme, setPreference }), [preference, resolvedTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
