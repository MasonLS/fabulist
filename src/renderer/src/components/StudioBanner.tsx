import { useState } from 'react'
import { wantsElevatedPermissions } from '@shared/harness'
import { useStore } from '@/store'

/**
 * Surfaces the studio's trust decision. A checked-in fabulist.json may request
 * auto-applied edits, but that only takes effect after the user accepts here —
 * the acceptance is stored outside the repo, keyed to the permissions block.
 */
export default function StudioBanner(): React.JSX.Element | null {
  const harness = useStore((s) => s.harness)
  const trustStudio = useStore((s) => s.trustStudio)
  const [dismissed, setDismissed] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!harness?.configPresent || dismissed) return null

  const config = harness.config
  const wantsAuto = wantsElevatedPermissions(config)
  const name = config.name ?? 'This project'

  // a template exists to be instantiated; editing it changes the template itself
  if (config.template) return <TemplateBanner name={name} />

  if (!wantsAuto || harness.trusted) {
    // no pending decision; only surface manifest problems
    if (harness.warnings.length === 0) return null
    return (
      <div className="studio-banner is-warning">
        <span className="studio-banner-text">
          {name}: {harness.warnings.length === 1 ? 'a manifest warning' : `${harness.warnings.length} manifest warnings`} —{' '}
          {harness.warnings[0]}
        </span>
        <button className="btn-ghost btn-small" onClick={() => setDismissed(true)}>
          Dismiss
        </button>
      </div>
    )
  }

  const decide = async (trusted: boolean): Promise<void> => {
    setBusy(true)
    try {
      if (trusted) await trustStudio(true)
      else setDismissed(true)
    } finally {
      setBusy(false)
    }
  }

  const grants: string[] = []
  if (config.permissions.edits === 'auto') {
    grants.push('apply the agent’s file edits without approval')
  }
  if (config.permissions.mcp === 'ask') {
    grants.push('connect the project’s MCP servers (their tools still ask)')
  }
  if (config.permissions.mcp === 'allow') {
    grants.push('connect the project’s MCP servers and run their tools without approval')
  }

  return (
    <div className="studio-banner">
      <span className="studio-banner-text">
        <strong>{name}</strong> asks to {grants.join(', and to ')}{' '}
        ({config.actions.length} {config.actions.length === 1 ? 'action' : 'actions'},{' '}
        {harness.skills.length} {harness.skills.length === 1 ? 'skill' : 'skills'}
        {config.permissions.bash === 'deny' ? ', shell disabled' : ''}). Until you trust it,
        none of that takes effect.
      </span>
      <button className="btn-primary btn-small" disabled={busy} onClick={() => void decide(true)}>
        Trust studio
      </button>
      <button className="btn-ghost btn-small" disabled={busy} onClick={() => void decide(false)}>
        Keep asking
      </button>
    </div>
  )
}

function TemplateBanner({ name }: { name: string }): React.JSX.Element {
  const createProjectFromCurrent = useStore((s) => s.createProjectFromCurrent)
  const [title, setTitle] = useState('')
  const [naming, setNaming] = useState(false)
  const [busy, setBusy] = useState(false)

  const create = async (): Promise<void> => {
    const t = title.trim()
    if (!t || busy) return
    setBusy(true)
    try {
      await createProjectFromCurrent(t)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="studio-banner is-template">
      <span className="studio-banner-text">
        <strong>{name}</strong> is a studio template — edits here change the template for
        everyone who starts from it.
      </span>
      {naming ? (
        <form
          className="studio-banner-form"
          onSubmit={(e) => {
            e.preventDefault()
            void create()
          }}
        >
          <input
            autoFocus
            value={title}
            placeholder="Project title…"
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setNaming(false)
            }}
          />
          <button type="submit" className="btn-primary btn-small" disabled={!title.trim() || busy}>
            {busy ? 'Creating…' : 'Create'}
          </button>
        </form>
      ) : (
        <button className="btn-primary btn-small" onClick={() => setNaming(true)}>
          New project from this studio
        </button>
      )}
    </div>
  )
}
