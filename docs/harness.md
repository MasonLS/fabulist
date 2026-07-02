# The studio harness: `fabulist.json`

A Fabulist project is a plain Claude Code project folder. Dropping a
`fabulist.json` at its root turns it into a **studio** — the manifest tells the
app what kind of work the project holds and what UI to grow around it. The file
is meant to be committed: one collaborator can design the harness, everyone who
opens the project (in Fabulist, or with plain `claude` in a terminal) gets the
same setup. The app hot-reloads it, so edits — by you, by a teammate's pull, or
by the agent in a workshop conversation — appear in the UI immediately.

The manifest only declares what Claude Code doesn't already know. Everything
behavioral lives in its native Claude Code location and is discovered from
there:

| concern | where it lives |
| --- | --- |
| standing instructions | `CLAUDE.md` |
| reusable skills | `.claude/skills/<name>/SKILL.md` |
| subagent personas | `.claude/agents/<name>.md` |
| doc types, actions, panels, permissions | `fabulist.json` |
| personal overrides (gitignored) | `fabulist.local.json` |

## Schema

Every field is optional; unknown fields are ignored; malformed entries are
dropped with a warning shown in the app. An empty object is a valid manifest.

```jsonc
{
  "name": "Novel Studio",              // shown as a chip in the header and rail
  "description": "Long-form fiction with continuity checking",

  "docTypes": [
    {
      "id": "scene",                   // required
      "match": "*.scene.md",          // required — filename glob, top-level files only
      "label": "Scene",               // rail badge; defaults to the id
      "icon": "S",                    // 1–2 chars/emoji, replaces the rail glyph
      "titleFrom": "h1",              // "h1" (default) | "filename" | "frontmatter:<key>"
      "template": "---\npov: \n---\n\n# {{title}}\n\n"   // seeds new docs of this type
    }
  ],

  "actions": [
    {
      "id": "punch-up",               // optional; derived from the label
      "label": "Punch up dialogue",    // required — appears in the ⌘K palette
      "surface": "selection",         // "selection" | "doc" | "project" (default)
      "skill": "punch-up-dialogue",   // a .claude/skills name to invoke, and/or:
      "prompt": "Sharpen this dialogue without changing what's said."
    }
  ],

  "panels": [
    // read-only rendered views of top-level markdown files, shown as tabs
    { "id": "bible", "title": "Story Bible", "source": "bible.md" }
  ],

  "permissions": {
    "edits": "ask",                   // "ask" (default) | "auto"
    "bash": "ask"                     // "ask" (default) | "deny"
  }
}
```

### Doc types

`match` globs against top-level filenames (`*` and `?`, no directories). A
matching doc gets the type's icon and label in the rail, its title derived per
`titleFrom` (frontmatter blocks are stripped before `h1` derivation), and the
"new document" pickers offer the type — the filename follows the glob
(`*.scene.md` + "Cold Open" → `cold-open.scene.md`) and `template` seeds the
content with `{{title}}` substituted.

### Actions

Actions run through the project's writing agent. `skill` asks the agent to
invoke that skill; `prompt` sends instructions; with both, the skill is invoked
with the prompt as guidance. `surface: "selection"` attaches the current editor
selection as a quoted passage (and is disabled in the palette without one);
`surface: "doc"` targets the focused document. Skills that aren't referenced by
any action still appear in the palette under **Skills**.

### Permissions and trust

A manifest can always *tighten* the gate (`"bash": "deny"` applies
unconditionally). Loosening it — `"edits": "auto"`, which applies the agent's
file edits without per-edit approval — only takes effect after the user accepts
the studio in the app. That acceptance is stored **outside the repo** (in the
app's user data), keyed to a hash of the permissions block: a cloned project
can't grant itself anything, and any change to the block — including by the
agent — drops back to untrusted until re-accepted. `fabulist.local.json` may
override looks but never permissions.

## The workshop

The **Workshop** button opens a dedicated agent conversation whose system
prompt carries this schema. Describe the work — "this is a D&D campaign; I
keep session notes and NPC sheets" — and the agent interviews you, then writes
`fabulist.json`, skills, and CLAUDE.md itself. Every edit goes through the
normal approval flow, and the UI grows the new buttons as soon as the edits
land.

## Sharing a studio

Commit `fabulist.json` and `.claude/` and push. Anyone can then use
**Open folder…** in the library (or clone into `~/Documents/Fabulist/`) to open
the project with its studio intact. A repo that is mostly harness plus a few
seed documents works as a template: clone, open, write.
