import { useCallback, useEffect, useState } from 'react'
import type { DocSkill } from '@shared/types'

/**
 * Skills panel — deliberately self-contained: all state is local and all IO
 * goes straight through window.fabulist.skills. Nothing here touches the
 * global store, so the feature can be removed by deleting this file and its
 * tab button.
 */
export default function SkillsPanel({ docId }: { docId: string }): React.JSX.Element {
  const [skills, setSkills] = useState<DocSkill[]>([])
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setSkills(await window.fabulist.skills.listForDoc(docId).catch(() => []))
  }, [docId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const install = async (action: () => Promise<{ name: string }[]>): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const added = await action()
      if (added.length > 0) setNotice(`Installed ${added.map((s) => s.name).join(', ')}`)
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message.replace(/^Error invoking remote method.*?: Error: /, '') : String(err))
    } finally {
      setBusy(false)
    }
  }

  const toggle = async (slug: string, on: boolean): Promise<void> => {
    await window.fabulist.skills.setEnabled(docId, slug, on).catch(() => {})
    await refresh()
  }

  const removeSkill = async (slug: string, name: string): Promise<void> => {
    if (!window.confirm(`Remove the skill "${name}" from your library?`)) return
    await window.fabulist.skills.remove(slug).catch(() => {})
    await refresh()
  }

  return (
    <div className="skills">
      <div className="skills-add">
        <button
          className="btn-ghost"
          disabled={busy}
          onClick={() => install(() => window.fabulist.skills.installFromDisk())}
        >
          Add from file…
        </button>
        <div className="skills-url">
          <input
            type="text"
            placeholder="skills.sh or archive URL"
            value={url}
            disabled={busy}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url.trim()) {
                void install(() => window.fabulist.skills.installFromUrl(url.trim())).then(() =>
                  setUrl('')
                )
              }
            }}
          />
          <button
            className="btn-ghost btn-small"
            disabled={busy || !url.trim()}
            onClick={() =>
              install(() => window.fabulist.skills.installFromUrl(url.trim())).then(() => setUrl(''))
            }
          >
            Add
          </button>
        </div>
        {busy && <p className="skills-status">Installing…</p>}
        {error && <p className="skills-status skills-error">{error}</p>}
        {notice && <p className="skills-status">{notice}</p>}
      </div>

      {skills.length === 0 ? (
        <div className="skills-empty">
          <p>
            Skills are reusable instruction packs for Claude — a folder with a SKILL.md.
            Install one from a file or URL, then switch it on per document.
          </p>
        </div>
      ) : (
        <ul className="skills-list">
          {skills.map(({ skill, enabled }) => (
            <SkillRow
              key={skill.slug}
              name={skill.name}
              slug={skill.slug}
              description={skill.description}
              enabled={enabled}
              onToggle={(on) => toggle(skill.slug, on)}
              onRemove={() => removeSkill(skill.slug, skill.name)}
            />
          ))}
        </ul>
      )}

      <div className="skills-foot">
        <button className="btn-ghost btn-small" onClick={() => window.fabulist.skills.reveal()}>
          Reveal library in Finder
        </button>
      </div>
    </div>
  )
}

function SkillRow(props: {
  name: string
  slug: string
  description: string
  enabled: boolean
  onToggle: (on: boolean) => void
  onRemove: () => void
}): React.JSX.Element {
  const [body, setBody] = useState<string | null>(null)

  const review = async (): Promise<void> => {
    if (body !== null) return setBody(null)
    setBody(await window.fabulist.skills.read(props.slug).catch(() => '(unreadable)'))
  }

  return (
    <li className="skill-row">
      <div className="skill-row-main">
        <label className="skill-row-toggle" title={`Enable "${props.name}" for this document`}>
          <input
            type="checkbox"
            checked={props.enabled}
            onChange={(e) => props.onToggle(e.target.checked)}
          />
          <span className="skill-row-name">{props.name}</span>
        </label>
        <span className="skill-row-actions">
          <button className="btn-ghost btn-small" onClick={review} title="Read the skill's instructions">
            {body !== null ? 'Hide' : 'View'}
          </button>
          <button className="btn-ghost btn-small" onClick={props.onRemove} title="Remove from library">
            ✕
          </button>
        </span>
      </div>
      {props.description && <p className="skill-row-desc">{props.description}</p>}
      {body !== null && <pre className="skill-row-body">{body}</pre>}
    </li>
  )
}
