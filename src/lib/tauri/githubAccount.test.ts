import { describe, expect, it } from 'vitest'

import { filterGithubRepos, type GithubRepo } from './githubAccount'

function repo(fullName: string, description: string | null = null): GithubRepo {
  const [owner, name] = fullName.split('/')
  return {
    id: fullName.length,
    full_name: fullName,
    name,
    owner,
    description,
    private: false,
    fork: false,
    archived: false,
    updated_at: null,
    clone_url: `https://github.com/${fullName}.git`,
  }
}

describe('filterGithubRepos', () => {
  const repos = [
    repo('me/arcadia', 'Desktop workspace for coding agents'),
    repo('me/blog', 'Personal site'),
    repo('acme/payments-api', 'Billing service'),
  ]

  it('keeps every repository when the query is empty', () => {
    expect(filterGithubRepos(repos, '   ')).toEqual(repos)
  })

  it('matches the owner, the name and the description, ignoring case', () => {
    expect(filterGithubRepos(repos, 'ACME').map((item) => item.full_name)).toEqual([
      'acme/payments-api',
    ])
    expect(filterGithubRepos(repos, 'coding agents').map((item) => item.full_name)).toEqual([
      'me/arcadia',
    ])
  })

  it('requires every word of the query to match', () => {
    expect(filterGithubRepos(repos, 'me site').map((item) => item.full_name)).toEqual(['me/blog'])
    expect(filterGithubRepos(repos, 'blog billing')).toEqual([])
  })
})
