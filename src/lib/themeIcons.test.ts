import { describe, expect, it } from 'vitest'

import {
  APP_ICON_OPTIONS,
  getAppIconImage,
  getThemeIcon,
  normalizeAppIconTheme,
} from './themeIcons'
import { DEFAULT_PREFERENCES } from './types'

describe('app icon themes', () => {
  it('makes the Arcadia logo the default', () => {
    expect(DEFAULT_PREFERENCES.appIconTheme).toBe('arcadia')
    expect(APP_ICON_OPTIONS[0]).toEqual({ id: 'arcadia', label: 'Arcadia' })
  })

  it('moves a removed icon choice to the Arcadia logo', () => {
    for (const removed of ['elite-original', 'elite-pure-black', 'elite-indigo', 'elite-blush']) {
      expect(normalizeAppIconTheme(removed)).toBe('arcadia')
    }
    expect(normalizeAppIconTheme(undefined)).toBe('arcadia')
    expect(normalizeAppIconTheme('carvalho')).toBe('carvalho')
  })

  it('ships the icon at the master and every taskbar size', () => {
    expect(getAppIconImage('arcadia')).toContain('arcadia')
    for (const size of [32, 48, 64]) expect(getThemeIcon('arcadia', size)).toContain('arcadia')
  })
})
