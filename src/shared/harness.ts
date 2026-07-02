// The studio harness: the shape of `fabulist.json`, the checked-in manifest
// that turns a plain Claude Code project folder into a custom studio. The
// manifest only declares what Claude Code itself doesn't already know —
// doc types, UI actions, panels, and a permission profile. Skills, agents,
// hooks, and CLAUDE.md live in their native Claude Code locations; Fabulist
// discovers and renders them.
//
// Parsing is deliberately lenient: unknown keys are ignored and malformed
// entries are dropped with a warning, so a project authored against a newer
// app version still opens.

export const HARNESS_FILE = 'fabulist.json'
export const HARNESS_LOCAL_FILE = 'fabulist.local.json'

/** A kind of document this studio works with, matched by filename glob. */
export interface DocTypeDef {
  id: string
  /** filename glob, e.g. "*.scene.md" or "chapter-*.md" (top-level files only) */
  match: string
  /** human label shown in the rail, e.g. "Scene" */
  label?: string
  /** rail glyph — a single character or emoji */
  icon?: string
  /** how to derive the doc title: 'h1' (default), 'filename', or 'frontmatter:<key>' */
  titleFrom?: string
  /** seed content for new docs of this type; {{title}} is substituted */
  template?: string
}

export type ActionSurface = 'selection' | 'doc' | 'project'

/** A command surfaced in the palette / toolbar. Runs a skill, a canned prompt, or both. */
export interface ActionDef {
  id: string
  label: string
  /** what the action operates on; selection actions need highlighted text */
  surface: ActionSurface
  /** name of a .claude/skills entry to invoke */
  skill?: string
  /** instructions sent to the agent (alongside or instead of a skill) */
  prompt?: string
}

/** A read-only view over a project file, rendered as a workspace tab. */
export interface PanelDef {
  id: string
  title: string
  /** top-level markdown file to render, e.g. "bible.md" */
  source: string
}

/**
 * The permission profile requested by the manifest. `edits: 'auto'` only takes
 * effect once the user explicitly trusts the studio (trust is stored outside
 * the repo and keyed to this block's content). `bash: 'deny'` is applied
 * unconditionally — a manifest may always tighten the gate, never loosen it
 * without consent.
 */
export interface PermissionsDef {
  edits?: 'ask' | 'auto'
  bash?: 'ask' | 'deny'
}

/** The parsed manifest — everything optional; an empty object is valid. */
export interface HarnessConfig {
  name?: string
  description?: string
  docTypes: DocTypeDef[]
  actions: ActionDef[]
  panels: PanelDef[]
  permissions: PermissionsDef
}

/** A skill discovered under .claude/skills/<name>/SKILL.md */
export interface SkillInfo {
  name: string
  description: string
}

/** The resolved harness handed to the renderer for one project. */
export interface Harness {
  /** true when a fabulist.json exists (possibly invalid) */
  configPresent: boolean
  config: HarnessConfig
  skills: SkillInfo[]
  /** user has accepted this studio's permission profile */
  trusted: boolean
  /** lenient-parse notes, surfaced in the studio UI */
  warnings: string[]
}

export const EMPTY_CONFIG: HarnessConfig = {
  docTypes: [],
  actions: [],
  panels: [],
  permissions: {}
}

export const EMPTY_HARNESS: Harness = {
  configPresent: false,
  config: EMPTY_CONFIG,
  skills: [],
  trusted: false,
  warnings: []
}

/** Does the profile ask for anything beyond the default always-ask gate? */
export function wantsElevatedPermissions(config: HarnessConfig): boolean {
  return config.permissions.edits === 'auto'
}

// --- glob matching (single-segment: * and ? only, no directories) ---

export function globMatch(pattern: string, file: string): boolean {
  if (pattern.includes('/') || pattern.includes('\\')) return false
  const rx = pattern
    .split('')
    .map((ch) => {
      if (ch === '*') return '[^/]*'
      if (ch === '?') return '[^/]'
      return ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    })
    .join('')
  return new RegExp(`^${rx}$`, 'i').test(file)
}

/** The first doc type whose glob matches the filename, if any. */
export function docTypeFor(config: HarnessConfig, file: string): DocTypeDef | null {
  return config.docTypes.find((t) => globMatch(t.match, file)) ?? null
}

/**
 * Derive a filename for a new doc of a type from its glob: the `*` is replaced
 * with the slug ("*.scene.md" + "Cold Open" → "cold-open.scene.md"). Globs
 * without a single `*` fall back to `<slug>.md`.
 */
export function fileNameForType(type: DocTypeDef, slug: string): string {
  const stars = type.match.split('*')
  if (stars.length === 2 && !type.match.includes('?')) {
    return `${stars[0]}${slug}${stars[1]}`
  }
  return `${slug}.md`
}

// --- lenient parsing ---

function asString(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() ? v.trim() : undefined
}

function slugId(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Parse raw JSON into a HarnessConfig, dropping malformed entries and
 * collecting human-readable warnings. Never throws on shape problems.
 */
export function parseHarnessConfig(raw: unknown, warnings: string[]): HarnessConfig {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    warnings.push('fabulist.json must be a JSON object; using defaults')
    return { ...EMPTY_CONFIG }
  }
  const obj = raw as Record<string, unknown>
  const config: HarnessConfig = {
    name: asString(obj.name),
    description: asString(obj.description),
    docTypes: [],
    actions: [],
    panels: [],
    permissions: {}
  }

  if (obj.docTypes !== undefined) {
    if (!Array.isArray(obj.docTypes)) warnings.push('docTypes must be an array')
    else
      for (const [i, t] of (obj.docTypes as unknown[]).entries()) {
        const d = t as Record<string, unknown>
        const id = asString(d?.id)
        const match = asString(d?.match)
        if (!id || !match) {
          warnings.push(`docTypes[${i}] needs "id" and "match"; skipped`)
          continue
        }
        if (match.includes('/') || match.includes('\\')) {
          warnings.push(`docTypes[${i}] "${id}": nested paths are not supported yet; skipped`)
          continue
        }
        const titleFrom = asString(d.titleFrom)
        if (titleFrom && titleFrom !== 'h1' && titleFrom !== 'filename' && !titleFrom.startsWith('frontmatter:')) {
          warnings.push(`docTypes[${i}] "${id}": unknown titleFrom "${titleFrom}"; using h1`)
        }
        config.docTypes.push({
          id,
          match,
          label: asString(d.label),
          icon: asString(d.icon)?.slice(0, 2),
          titleFrom:
            titleFrom === 'h1' || titleFrom === 'filename' || titleFrom?.startsWith('frontmatter:')
              ? titleFrom
              : undefined,
          template: typeof d.template === 'string' ? d.template : undefined
        })
      }
  }

  if (obj.actions !== undefined) {
    if (!Array.isArray(obj.actions)) warnings.push('actions must be an array')
    else
      for (const [i, a] of (obj.actions as unknown[]).entries()) {
        const d = a as Record<string, unknown>
        const skill = asString(d?.skill)
        const prompt = asString(d?.prompt)
        const label = asString(d?.label) ?? skill
        if (!label || (!skill && !prompt)) {
          warnings.push(`actions[${i}] needs a "label" plus a "skill" or "prompt"; skipped`)
          continue
        }
        const surface = asString(d.surface)
        if (surface && !['selection', 'doc', 'project'].includes(surface)) {
          warnings.push(`actions[${i}] "${label}": unknown surface "${surface}"; using "project"`)
        }
        config.actions.push({
          id: asString(d.id) ?? slugId(label),
          label,
          surface: surface === 'selection' || surface === 'doc' ? surface : 'project',
          skill,
          prompt
        })
      }
  }

  if (obj.panels !== undefined) {
    if (!Array.isArray(obj.panels)) warnings.push('panels must be an array')
    else
      for (const [i, p] of (obj.panels as unknown[]).entries()) {
        const d = p as Record<string, unknown>
        const title = asString(d?.title)
        const source = asString(d?.source)
        if (!title || !source) {
          warnings.push(`panels[${i}] needs "title" and "source"; skipped`)
          continue
        }
        if (source.includes('/') || source.includes('\\') || source.startsWith('.')) {
          warnings.push(`panels[${i}] "${title}": source must be a top-level file; skipped`)
          continue
        }
        config.panels.push({ id: asString(d.id) ?? slugId(title), title, source })
      }
  }

  if (obj.permissions !== undefined) {
    const d = obj.permissions as Record<string, unknown>
    if (typeof d !== 'object' || d === null) warnings.push('permissions must be an object')
    else {
      if (d.edits !== undefined) {
        if (d.edits === 'ask' || d.edits === 'auto') config.permissions.edits = d.edits
        else warnings.push(`permissions.edits must be "ask" or "auto"`)
      }
      if (d.bash !== undefined) {
        if (d.bash === 'ask' || d.bash === 'deny') config.permissions.bash = d.bash
        else warnings.push(`permissions.bash must be "ask" or "deny"`)
      }
    }
  }

  return config
}

/**
 * Overlay a personal fabulist.local.json onto the shared config. Scalars are
 * replaced; list entries with a matching id replace their shared counterpart,
 * others are appended. Permissions from the overlay win.
 */
export function mergeHarnessConfigs(base: HarnessConfig, local: HarnessConfig): HarnessConfig {
  const mergeList = <T extends { id: string }>(a: T[], b: T[]): T[] => [
    ...a.filter((x) => !b.some((y) => y.id === x.id)),
    ...b
  ]
  return {
    name: local.name ?? base.name,
    description: local.description ?? base.description,
    docTypes: mergeList(base.docTypes, local.docTypes),
    actions: mergeList(base.actions, local.actions),
    panels: mergeList(base.panels, local.panels),
    permissions: { ...base.permissions, ...local.permissions }
  }
}
