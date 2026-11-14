import { invoke } from '@tauri-apps/api/core'

export type GithubAccountStatus = {
  /** False when the build has no GitHub OAuth App, so sign-in cannot start. */
  configured: boolean
  connected: boolean
  login: string | null
  name: string | null
  avatar_url: string | null
}

export type GithubDeviceStart = {
  device_code: string
  user_code: string
  verification_uri: string
  interval: number
  expires_in: number
}

export type GithubRepo = {
  id: number
  full_name: string
  name: string
  owner: string
  description: string | null
  private: boolean
  fork: boolean
  archived: boolean
  updated_at: string | null
  clone_url: string
}

export async function githubAccountStatus(): Promise<GithubAccountStatus> {
  return invoke<GithubAccountStatus>('github_account_status')
}

export async function githubAccountDeviceStart(): Promise<GithubDeviceStart> {
  return invoke<GithubDeviceStart>('github_account_device_start')
}

export async function githubAccountDeviceFinish(
  start: GithubDeviceStart,
): Promise<GithubAccountStatus> {
  return invoke<GithubAccountStatus>('github_account_device_finish', {
    deviceCode: start.device_code,
    interval: start.interval,
    expiresIn: start.expires_in,
  })
}

export async function githubAccountLogout(): Promise<GithubAccountStatus> {
  return invoke<GithubAccountStatus>('github_account_logout')
}

export async function githubAccountRepos(): Promise<GithubRepo[]> {
  return invoke<GithubRepo[]>('github_account_repos')
}

/** Keeps repositories that match every word of the query in the name, owner or description. */
export function filterGithubRepos(repos: GithubRepo[], query: string): GithubRepo[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return repos
  return repos.filter((repo) => {
    const haystack = `${repo.full_name} ${repo.description ?? ''}`.toLowerCase()
    return words.every((word) => haystack.includes(word))
  })
}
