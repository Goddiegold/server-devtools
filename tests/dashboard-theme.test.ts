import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  THEME_STORAGE_KEY,
  THEME_OPTIONS,
  applyTheme,
  readThemePreference,
  resolveThemePreference,
  writeThemePreference,
} from '../dashboard/src/theme'

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  }
}

function createRoot() {
  const classes = new Set<string>()
  return {
    classList: {
      toggle: (value: string, force?: boolean) => {
        const shouldAdd = force ?? !classes.has(value)
        if (shouldAdd) classes.add(value)
        else classes.delete(value)
        return shouldAdd
      },
      contains: (value: string) => classes.has(value),
    },
    style: { colorScheme: '' },
  }
}

test('reads only valid saved theme preferences', () => {
  const storage = createStorage({ [THEME_STORAGE_KEY]: 'dark' })
  assert.equal(readThemePreference(storage), 'dark')
  assert.equal(readThemePreference(createStorage({ [THEME_STORAGE_KEY]: 'invalid' })), 'system')
  assert.equal(readThemePreference(null), 'system')
})

test('handles storage failures without throwing', () => {
  const failingStorage = {
    getItem: () => { throw new Error('blocked') },
    setItem: () => { throw new Error('blocked') },
  }

  assert.equal(readThemePreference(failingStorage), 'system')
  assert.doesNotThrow(() => writeThemePreference('dark', failingStorage))
})

test('resolves system preference from the operating system', () => {
  assert.equal(resolveThemePreference('light', true), 'light')
  assert.equal(resolveThemePreference('dark', false), 'dark')
  assert.equal(resolveThemePreference('system', true), 'dark')
  assert.equal(resolveThemePreference('system', false), 'light')
})

test('applies the resolved theme to the document root', () => {
  const root = createRoot()

  applyTheme('dark', root)
  assert.equal(root.classList.contains('dark'), true)
  assert.equal(root.style.colorScheme, 'dark')

  applyTheme('light', root)
  assert.equal(root.classList.contains('dark'), false)
  assert.equal(root.style.colorScheme, 'light')
})

test('offers all accessible theme preferences', () => {
  assert.deepEqual(THEME_OPTIONS.map((option) => option.value), ['system', 'light', 'dark'])
})
