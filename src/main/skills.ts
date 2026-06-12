import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { dialog } from 'electron'
import type { SkillMeta } from '@shared/types'
import { LIBRARY_ROOT, docPath } from './library'

/**
 * Skills: reusable Claude Code instruction packs (SKILL.md + supporting files).
 *
 * Local and stateless by design: the library at ~/Documents/Fabulist/.skills/
 * IS the source of truth — one folder per skill, no manifest, no provenance,
 * no update checks. Enabling a skill for a document symlinks (or copies) it
 * into the doc's .claude/skills/, where the Claude Code engine discovers it
 * via settingSources: ['project']. Nothing else in the app knows skills exist.
 */

export const SKILLS_ROOT = path.join(LIBRARY_ROOT, '.skills')
const DOC_SKILLS_DIR = path.join('.claude', 'skills')

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024
const MAX_SKILL_FILES = 500
const MAX_SCAN_DEPTH = 4

const run = promisify(execFile)

const exists = (p: string): Promise<boolean> =>
  fs.lstat(p).then(
    () => true,
    () => false
  )

// --- SKILL.md parsing ---

/** Minimal frontmatter read: name + description between leading `---` fences. */
function parseSkillMd(src: string): { name: string; description: string } | null {
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const field = (key: string): string =>
    m[1]
      .match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]
      .trim()
      .replace(/^["']|["']$/g, '') ?? ''
  const name = field('name')
  const description = field('description')
  return name ? { name, description } : null
}

async function readMeta(dir: string): Promise<SkillMeta | null> {
  const src = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf8').catch(() => null)
  if (src === null) return null
  const fm = parseSkillMd(src)
  if (!fm) return null
  return { slug: path.basename(dir), name: fm.name, description: fm.description }
}

// --- acquisition: everything funnels into install-from-directory ---

/** Find every directory (depth-limited) whose root contains a SKILL.md. */
async function findSkillRoots(root: string, depth = 0): Promise<string[]> {
  if (depth > MAX_SCAN_DEPTH) return []
  if (await exists(path.join(root, 'SKILL.md'))) return [root]
  const out: string[] = []
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.') || e.name === 'node_modules') continue
    out.push(...(await findSkillRoots(path.join(root, e.name), depth + 1)))
  }
  return out
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'skill'
  )
}

/**
 * Copy a skill tree into the library: regular files and directories only
 * (symlinks inside a skill are rejected — archive-hygiene line), capped count.
 */
async function copySkillTree(src: string, dest: string): Promise<void> {
  let copied = 0
  const walk = async (from: string, to: string): Promise<void> => {
    await fs.mkdir(to, { recursive: true })
    for (const e of await fs.readdir(from, { withFileTypes: true })) {
      const f = path.join(from, e.name)
      const t = path.join(to, e.name)
      if (e.isSymbolicLink()) throw new Error(`Skill contains a symlink (${e.name}) — rejected`)
      if (e.isDirectory()) await walk(f, t)
      else if (e.isFile()) {
        if (++copied > MAX_SKILL_FILES) throw new Error('Skill has too many files')
        await fs.copyFile(f, t)
      }
    }
  }
  await walk(src, dest)
}

/** Validate + copy every skill found under `tree` into the library. */
async function installFromDir(tree: string): Promise<SkillMeta[]> {
  const roots = await findSkillRoots(tree)
  if (roots.length === 0) throw new Error('No skill found (no SKILL.md in the selection)')
  await fs.mkdir(SKILLS_ROOT, { recursive: true })
  const installed: SkillMeta[] = []
  for (const root of roots) {
    const meta = await readMeta(root)
    if (!meta) throw new Error(`Invalid SKILL.md in ${path.basename(root)} (missing name)`)
    const slug = slugify(meta.name)
    const dest = path.join(SKILLS_ROOT, slug)
    if (await exists(dest)) {
      // same-name install replaces — reinstalling IS the update path
      await fs.rm(dest, { recursive: true, force: true })
    }
    await copySkillTree(root, dest)
    installed.push({ ...meta, slug })
  }
  return installed
}

async function extractArchive(archivePath: string): Promise<string> {
  const stat = await fs.stat(archivePath)
  if (stat.size > MAX_ARCHIVE_BYTES) throw new Error('Archive larger than 50 MB')
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'fabulist-skill-'))
  // bsdtar (macOS and Windows 10+) reads both zip and tar.gz; it refuses
  // absolute paths and `..` traversal by default (zip-slip protection)
  await run('tar', ['-xf', archivePath, '-C', tmp])
  return tmp
}

const isArchive = (p: string): boolean => /\.(zip|tgz|tar\.gz)$/i.test(p)

// --- public API (mirrors the ipc surface) ---

/** Open a native picker (zip archive or skill folder) and install the result. */
export async function installFromDisk(): Promise<SkillMeta[]> {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Add skill',
    message: 'Choose a skill folder or a .zip of skills',
    properties: ['openFile', 'openDirectory'],
    filters: [{ name: 'Skill archive or folder', extensions: ['zip', 'tgz', 'gz'] }]
  })
  if (canceled || filePaths.length === 0) return []
  return installFromPath(filePaths[0])
}

export async function installFromPath(p: string): Promise<SkillMeta[]> {
  const stat = await fs.stat(p)
  if (stat.isDirectory()) return installFromDir(p)
  if (!isArchive(p)) throw new Error('Expected a folder, .zip, or .tar.gz')
  const tmp = await extractArchive(p)
  try {
    return await installFromDir(tmp)
  } finally {
    await fs.rm(tmp, { recursive: true, force: true })
  }
}

/**
 * Install from a URL: a direct archive link, or a skills.sh-style page whose
 * HTML points at one. One fetch, then the skill is plain local files —
 * the URL is not recorded and never re-fetched.
 */
export async function installFromUrl(url: string): Promise<SkillMeta[]> {
  const fetched = await fetchOnce(url)
  if (fetched.kind === 'html') {
    const link = findArchiveLink(fetched.text, url)
    if (!link) throw new Error('No skill archive found at that URL')
    const inner = await fetchOnce(link)
    if (inner.kind !== 'archive') throw new Error('Linked file is not a skill archive')
    return installArchiveBytes(inner.bytes, link)
  }
  return installArchiveBytes(fetched.bytes, url)
}

type Fetched = { kind: 'archive'; bytes: Buffer } | { kind: 'html'; text: string }

async function fetchOnce(url: string): Promise<Fetched> {
  const u = new URL(url)
  if (u.protocol !== 'https:') throw new Error('Only https URLs are supported')
  const res = await fetch(u, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`)
  const len = Number(res.headers.get('content-length') ?? 0)
  if (len > MAX_ARCHIVE_BYTES) throw new Error('Download larger than 50 MB')
  const bytes = Buffer.from(await res.arrayBuffer())
  if (bytes.length > MAX_ARCHIVE_BYTES) throw new Error('Download larger than 50 MB')
  // sniff: zip = PK, gzip = 1f 8b — content-type headers lie too often
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b
  const isGz = bytes[0] === 0x1f && bytes[1] === 0x8b
  if (isZip || isGz) return { kind: 'archive', bytes }
  return { kind: 'html', text: bytes.toString('utf8') }
}

/** Pull the first archive href out of a registry page (e.g. skills.sh). */
function findArchiveLink(html: string, baseUrl: string): string | null {
  const m = html.match(/href="([^"]+\.(?:zip|tgz|tar\.gz))"/i)
  return m ? new URL(m[1], baseUrl).toString() : null
}

async function installArchiveBytes(bytes: Buffer, sourceUrl: string): Promise<SkillMeta[]> {
  const ext = /\.zip$/i.test(new URL(sourceUrl).pathname) || (bytes[0] === 0x50 && bytes[1] === 0x4b) ? '.zip' : '.tar.gz'
  const tmpFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'fabulist-dl-')), `skill${ext}`)
  await fs.writeFile(tmpFile, bytes)
  try {
    return await installFromPath(tmpFile)
  } finally {
    await fs.rm(path.dirname(tmpFile), { recursive: true, force: true })
  }
}

// --- library + per-doc enablement ---

export async function list(): Promise<SkillMeta[]> {
  const entries = await fs.readdir(SKILLS_ROOT, { withFileTypes: true }).catch(() => [])
  const out: SkillMeta[] = []
  for (const e of entries) {
    if (!e.isDirectory()) continue
    const meta = await readMeta(path.join(SKILLS_ROOT, e.name))
    if (meta) out.push(meta)
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}

const docSkillLink = (docId: string, slug: string): string =>
  path.join(docPath(docId), DOC_SKILLS_DIR, slug)

export async function listForDoc(
  docId: string
): Promise<{ skill: SkillMeta; enabled: boolean }[]> {
  const skills = await list()
  return Promise.all(
    skills.map(async (skill) => ({ skill, enabled: await exists(docSkillLink(docId, skill.slug)) }))
  )
}

export async function setEnabled(docId: string, slug: string, on: boolean): Promise<void> {
  const link = docSkillLink(docId, slug)
  if (!on) {
    await fs.rm(link, { recursive: true, force: true })
    return
  }
  const target = path.join(SKILLS_ROOT, slug)
  if (!(await exists(target))) throw new Error(`Skill "${slug}" is not installed`)
  if (await exists(link)) return
  await fs.mkdir(path.dirname(link), { recursive: true })
  try {
    // junction on Windows (no elevation needed); plain dir symlink elsewhere
    await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir')
  } catch {
    await copySkillTree(target, link) // symlink-hostile filesystems
  }
}

export async function remove(slug: string): Promise<void> {
  // resolve inside the library only — slug comes over ipc
  const dir = path.join(SKILLS_ROOT, slug)
  if (path.dirname(dir) !== SKILLS_ROOT) throw new Error('Bad skill name')
  await fs.rm(dir, { recursive: true, force: true })
  // sweep dangling doc links lazily: a dead symlink simply stops resolving,
  // and setEnabled(off) removes it; no doc bookkeeping kept here
}

/** Full SKILL.md body, for the pre-enable review step in the UI. */
export async function readSkillFile(slug: string): Promise<string> {
  const dir = path.join(SKILLS_ROOT, slug)
  if (path.dirname(dir) !== SKILLS_ROOT) throw new Error('Bad skill name')
  return fs.readFile(path.join(dir, 'SKILL.md'), 'utf8')
}
