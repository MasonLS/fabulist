import { useEffect, useState } from 'react'
import type { PanelDef, PanelViewKind } from '@shared/harness'
import { useStore } from '@/store'
import Markdown from '@/components/Markdown'

/**
 * Harness panels: views over project files, declared in fabulist.json and
 * opened as tabs. Each `view` kind is a row in PANEL_VIEWS — adding a kind
 * (cards, checklist, timeline…) is one component plus one entry here, plus
 * the enum value in the schema descriptor. Sources re-read whenever the doc
 * list refreshes (agent edits and external changes both trigger that).
 */

interface PanelViewProps {
  panel: PanelDef
  content: string
}

function MarkdownPanel({ content }: PanelViewProps): React.JSX.Element {
  return <Markdown text={content} />
}

const PANEL_VIEWS: Record<PanelViewKind, (props: PanelViewProps) => React.JSX.Element> = {
  markdown: MarkdownPanel
}

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

  const View = PANEL_VIEWS[panel.view]

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
        ) : content === null ? null : View ? (
          <View panel={panel} content={content} />
        ) : (
          <p className="panel-view-missing">
            This studio uses a panel view kind (<code>{panel.view}</code>) this version of
            Fabulist doesn&rsquo;t know. Update the app, or change the panel&rsquo;s{' '}
            <code>view</code> in fabulist.json.
          </p>
        )}
      </div>
    </div>
  )
}
