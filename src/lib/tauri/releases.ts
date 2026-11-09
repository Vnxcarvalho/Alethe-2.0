import { Channel, invoke } from '@tauri-apps/api/core'
import type { DownloadEvent } from '@tauri-apps/plugin-updater'

export async function downloadRelease(
  version: string,
  onEvent: (event: DownloadEvent) => void,
): Promise<void> {
  const channel = new Channel<DownloadEvent>()
  channel.onmessage = onEvent
  await invoke('download_release', { version, onEvent: channel })
}

export async function installDownloadedRelease(): Promise<void> {
  await invoke('install_downloaded_release')
}

/** Turns the app's kill-on-close process guard on or off (Windows). The updater turns it off before
 * handing over to the installer, which would otherwise be killed when the app exits. */
export async function setKillOnCloseGuard(enabled: boolean): Promise<void> {
  await invoke('set_kill_on_close_guard', { enabled })
}
