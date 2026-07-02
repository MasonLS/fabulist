import { useEffect, useState } from 'react'
import type { PanelDef } from '@shared/harness'
import { useStore } from '@/store'
import Markdown from '@/components/Markdown'

/**
 * A harness panel: a read-only rendered view of a top-level markdown file,
 * declared in fabulist.json. Re-reads whenever the doc list refreshes (agent
 * edits and external changes both trigger that), so it stays current while
 * Claude maintains the source file.
 */
export default function PanelView({ panel }: { panel: PanelDef }): React.JSX.Element {
  const projectId = useStore((s) => s.activeProjectId)
  const docs = useStore((s) => s.docs)
  const [content, setContent] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!projectId) return
    window.fabulist.doc
      .read(projectId, panel.source)
      .then((c) => {
        if (!cancelled) {
          setContent(c)
          setMissing(false)
        }
      })
      .catch(() => {
        if (!cancelled) setMissing(true)
      })
    return () => {
      cancelled = true
    }
  }, [projectId, panel.source, docs])

  return (
    <div className="panel-view">
      <div className="panel-view-inner">
        <header className="panel-view-head">
          <h1>{panel.title}</h1>
          <span className="panel-view-source">{panel.source}</span>
        </header>
        {missing ? (
          <p className="panel-view-missing">
            The source file <code>{panel.source}</code> doesn&rsquo;t exist yet. Ask the agent to
            create it, or add it yourself.
          </p>
        ) : content === null ? null : (
          <Markdown text={content} />
        )}
      </div>
    </div>
  )
}
