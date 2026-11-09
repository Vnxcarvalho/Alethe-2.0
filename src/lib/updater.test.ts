import { beforeEach, describe, expect, it, vi } from 'vitest'

import { checkForUpdate, installPendingUpdate } from './updater'

const order = vi.hoisted(() => [] as string[])
const flush = vi.hoisted(() => vi.fn(async () => {}))
const guard = vi.hoisted(() =>
  vi.fn(async (enabled: boolean) => {
    order.push(enabled ? 'guard-on' : 'guard-off')
  }),
)

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn(async () => ({
    version: '9.9.9',
    currentVersion: '1.0.0',
    download: vi.fn(async () => {
      order.push('download')
    }),
    install: vi.fn(async () => {
      order.push('install')
    }),
  })),
}))
vi.mock('@tauri-apps/plugin-process', () => ({
  relaunch: vi.fn(async () => {
    order.push('relaunch')
  }),
}))
vi.mock('../stores/projectsStore', () => ({ flushProjectsState: flush }))
vi.mock('./tauri/releases', () => ({
  downloadRelease: vi.fn(),
  installDownloadedRelease: vi.fn(),
  setKillOnCloseGuard: guard,
}))

beforeEach(() => {
  order.length = 0
  flush.mockReset()
  flush.mockImplementation(async () => {
    order.push('flush')
  })
  guard.mockClear()
})

describe('installPendingUpdate', () => {
  it('saves the workspace before the installer takes the process down', async () => {
    await checkForUpdate()
    await installPendingUpdate()

    expect(order).toEqual(['download', 'flush', 'guard-off', 'install', 'relaunch'])
  })

  it('still installs when the workspace cannot be saved', async () => {
    flush.mockRejectedValueOnce(new Error('disk full'))
    await checkForUpdate()
    await installPendingUpdate()

    expect(order).toEqual(['download', 'guard-off', 'install', 'relaunch'])
  })

  it('releases the process guard before installing so the installer outlives the app', async () => {
    await checkForUpdate()
    await installPendingUpdate()

    expect(order.indexOf('guard-off')).toBeLessThan(order.indexOf('install'))
  })

  it('turns the guard back on when the installer cannot start', async () => {
    const { check } = await import('@tauri-apps/plugin-updater')
    vi.mocked(check).mockResolvedValueOnce({
      version: '9.9.9',
      currentVersion: '1.0.0',
      download: vi.fn(async () => {}),
      install: vi.fn(async () => {
        throw new Error('launch failed')
      }),
    } as never)
    await checkForUpdate()

    await expect(installPendingUpdate()).rejects.toThrow('launch failed')
    expect(order).toContain('guard-on')
    expect(order).not.toContain('relaunch')
  })
})
