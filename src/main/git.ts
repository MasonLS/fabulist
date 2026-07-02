import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { promises as fs } from 'node:fs'
import type { CommitInfo } from '@shared/types'

const exec = promisify(execFile)

// Identity is passed per-invocation so commits work even with no global git config.
const ID = ['-c', 'user.name=Fabulist', '-c', 'user.email=fabulist@local']

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec('git', [...ID, ...args], { cwd, maxBuffer: 32 * 1024 * 1024 })
  return stdout
}

/**
 * True only when `cwd` is itself the root of a git repo. git commands walk up
 * the directory tree, so a project folder that lives INSIDE another repo (a
 * symlinked folder in a dev repo, a subfolder of a monorepo) would otherwise
 * stage and commit the OUTER repo — Fabulist must never do that.
 */
async function isRepoRoot(cwd: string): Promise<boolean> {
  try {
    const top = (await git(cwd, ['rev-parse', '--show-toplevel'])).trim()
    return (await fs.realpath(top)) === (await fs.realpath(cwd))
  } catch {
    return false
  }
}

/** Init a repo at cwd — unless cwd already sits inside one (never nest repos). */
export async function initRepo(cwd: string): Promise<void> {
  try {
    await git(cwd, ['rev-parse', '--show-toplevel'])
  } catch {
    await git(cwd, ['init', '-q', '-b', 'main'])
  }
}

/**
 * Stage everything and commit. No-op (returns false) when the tree is clean
 * or when cwd is not its own repo root.
 */
export async function commitAll(cwd: string, message: string): Promise<boolean> {
  if (!(await isRepoRoot(cwd))) return false
  await git(cwd, ['add', '-A'])
  const status = await git(cwd, ['status', '--porcelain'])
  if (!status.trim()) return false
  await git(cwd, ['commit', '-q', '-m', message])
  return true
}

export async function log(cwd: string, limit = 200): Promise<CommitInfo[]> {
  try {
    if (!(await isRepoRoot(cwd))) return []
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
