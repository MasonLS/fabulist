import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { CommitInfo } from '@shared/types'

const exec = promisify(execFile)

// Identity is passed per-invocation so commits work even with no global git config.
const ID = ['-c', 'user.name=Fabulist', '-c', 'user.email=fabulist@local']

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', [...ID, ...args], { cwd, maxBuffer: 32 * 1024 * 1024 })
  return stdout
}

export async function initRepo(cwd: string): Promise<void> {
  await git(cwd, ['init', '-q', '-b', 'main'])
}

/** Stage everything and commit. No-op (returns false) when the tree is clean. */
export async function commitAll(cwd: string, message: string): Promise<boolean> {
  await git(cwd, ['add', '-A'])
  const status = await git(cwd, ['status', '--porcelain'])
  if (!status.trim()) return false
  await git(cwd, ['commit', '-q', '-m', message])
  return true
}

export async function log(cwd: string, limit = 200): Promise<CommitInfo[]> {
  try {
    const out = await git(cwd, ['log', `-n${limit}`, '--pretty=format:%H%x09%at%x09%s'])
    if (!out.trim()) return []
    return out
      .trim()
      .split('\n')
      .map((line) => {
        const [hash, at, ...rest] = line.split('\t')
        return { hash, at: Number(at), subject: rest.join('\t') }
      })
  } catch {
    return [] // no commits yet
  }
}

export async function showFile(cwd: string, rev: string, file: string): Promise<string> {
  return git(cwd, ['show', `${rev}:${file}`])
}
