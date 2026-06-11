import { useState } from 'react'
import { useStore } from '@/store'
import DiffView from '@/components/DiffView'

export default function VersionPreview(): React.JSX.Element {
  const preview = useStore((s) => s.preview)
  const content = useStore((s) => s.content)
  const closePreview = useStore((s) => s.closePreview)
  const restorePreview = useStore((s) => s.restorePreview)
  const [view, setView] = useState<'diff' | 'text'>('diff')

  if (!preview) return <></>

  const identical = preview.content === content

  return (
    <div className="version-preview">
      <div className="version-banner">
        <div className="version-banner-info">
          <span className="version-banner-label">Viewing</span>
          <strong>{preview.subject}</strong>
        </div>
        <div className="version-banner-actions">
          <div className="seg">
            <button className={view === 'diff' ? 'is-on' : ''} onClick={() => setView('diff')}>
              Changes
            </button>
            <button className={view === 'text' ? 'is-on' : ''} onClick={() => setView('text')}>
              Full text
            </button>
          </div>
          {!identical && (
            <button className="btn-primary btn-small" onClick={() => void restorePreview()}>
              Restore this version
            </button>
          )}
          <button className="btn-ghost btn-small" onClick={closePreview}>
            Back to current
          </button>
        </div>
      </div>
      <div className="version-body">
        {identical ? (
          <p className="version-same">This version is identical to the current document.</p>
        ) : view === 'diff' ? (
          <DiffView before={preview.content} after={content} context={3} />
        ) : (
          <pre className="version-text">{preview.content}</pre>
        )}
        {view === 'diff' && !identical && (
          <p className="version-legend">
            <del>removed since this version</del> · <ins>added since this version</ins>
          </p>
        )}
      </div>
    </div>
  )
}
