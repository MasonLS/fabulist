import { useEffect } from 'react'
import { useStore } from '@/store'

export default function HistoryPanel(): React.JSX.Element {
  const commits = useStore((s) => s.commits)
  const preview = useStore((s) => s.preview)
  const loadHistory = useStore((s) => s.loadHistory)
  const openPreview = useStore((s) => s.openPreview)
  const closePreview = useStore((s) => s.closePreview)
  const snapshot = useStore((s) => s.snapshot)

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  return (
    <div className="history">
      <div className="history-intro">
        <p>
          Every save, snapshot, and approved Claude edit is a point you can return to.
          Restoring never erases history — it adds to it.
        </p>
        <button className="btn-ghost btn-small" onClick={() => void snapshot()}>
          Snapshot now
        </button>
      </div>
      <div className="history-list">
        {commits.length === 0 && <p className="history-empty">No history yet.</p>}
        {commits.map((c, i) => {
          const isClaude = c.subject.startsWith('Claude:')
          const active = preview?.hash === c.hash
          return (
            <button
              key={c.hash}
              className={`history-item ${active ? 'is-active' : ''} ${isClaude ? 'is-claude' : ''}`}
              onClick={() => (active ? closePreview() : void openPreview(c))}
            >
              <span className="history-rail">
                <span className="history-node" />
                {i < commits.length - 1 && <span className="history-line" />}
              </span>
              <span className="history-body">
                <span className="history-subject">{c.subject}</span>
                <span className="history-time">
                  {new Date(c.at * 1000).toLocaleString(undefined, {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit'
                  })}
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
