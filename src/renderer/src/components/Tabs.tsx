import { useState } from 'react'
import { useStore } from '@/store'

export default function Tabs(): React.JSX.Element {
  const docs = useStore((s) => s.docs)
  const openDocs = useStore((s) => s.openDocs)
  const activeDoc = useStore((s) => s.activeDoc)
  const setActiveDoc = useStore((s) => s.setActiveDoc)
  const closeTab = useStore((s) => s.closeTab)
  const createDoc = useStore((s) => s.createDoc)
  const harness = useStore((s) => s.harness)
  const openPanels = useStore((s) => s.openPanels)
  const activePanel = useStore((s) => s.activePanel)
  const openPanel = useStore((s) => s.openPanel)
  const closePanel = useStore((s) => s.closePanel)

  const [adding, setAdding] = useState(false)
  const [title, setTitle] = useState('')
  const [typeId, setTypeId] = useState('')

  const docTypes = harness?.config.docTypes ?? []
  const panelFor = (id: string): { title: string; source: string } | undefined =>
    harness?.config.panels.find((p) => p.id === id)

  const titleFor = (file: string): string => docs.find((d) => d.file === file)?.title || file

  const submit = async (): Promise<void> => {
    const t = title.trim()
    setAdding(false)
    setTitle('')
    if (t) await createDoc(t, typeId || undefined)
  }

  return (
    <div className="tabs-strip">
      {openDocs.map((file) => (
          <div
            key={file}
            className={`tab ${file === activeDoc && !activePanel ? 'is-active' : ''}`}
            onMouseDown={(e) => {
              // middle-click closes, like a browser
              if (e.button === 1) {
                e.preventDefault()
                void closeTab(file)
              }
            }}
          >
            <button className="tab-main" onClick={() => void setActiveDoc(file)} title={file}>
              {titleFor(file)}
            </button>
            <button
              className="tab-close"
              title="Close tab"
              onClick={(e) => {
                e.stopPropagation()
                void closeTab(file)
              }}
            >
              ×
            </button>
          </div>
        ))}

        {openPanels.map((id) => {
          const p = panelFor(id)
          if (!p) return null
          return (
            <div
              key={`panel:${id}`}
              className={`tab tab-panel ${id === activePanel ? 'is-active' : ''}`}
              onMouseDown={(e) => {
                if (e.button === 1) {
                  e.preventDefault()
                  closePanel(id)
                }
              }}
            >
              <button
                className="tab-main"
                onClick={() => openPanel(id)}
                title={`${p.source} — view from fabulist.json`}
              >
                <span className="tab-panel-glyph" aria-hidden>
                  ▦
                </span>
                {p.title}
              </button>
              <button
                className="tab-close"
                title="Close view"
                onClick={(e) => {
                  e.stopPropagation()
                  closePanel(id)
                }}
              >
                ×
              </button>
            </div>
          )
        })}

        {adding ? (
          <form
            className="tab-create"
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
          >
            <input
              autoFocus
              value={title}
              placeholder="Document title…"
              onChange={(e) => setTitle(e.target.value)}
              onBlur={(e) => {
                // choosing a doc type shouldn't submit-and-close the form
                if (!e.relatedTarget || !(e.relatedTarget as HTMLElement).closest('.tab-create')) {
                  void submit()
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setAdding(false)
                  setTitle('')
                }
              }}
            />
            {docTypes.length > 0 && (
              <select
                className="tab-create-type"
                value={typeId}
                onChange={(e) => setTypeId(e.target.value)}
                title="Document type"
              >
                <option value="">Document</option>
                {docTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label ?? t.id}
                  </option>
                ))}
              </select>
            )}
          </form>
        ) : (
          <button className="tab-add" title="New document" onClick={() => setAdding(true)}>
            +
          </button>
        )}
    </div>
  )
}
