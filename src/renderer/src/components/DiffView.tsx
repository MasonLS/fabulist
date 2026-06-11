import { useMemo } from 'react'
import { diffLines, diffWordsWithSpace } from 'diff'

interface Props {
  before: string
  after: string
  /** 'words' suits small string replacements; 'lines' suits whole files */
  mode?: 'words' | 'lines'
  /** collapse unchanged runs longer than this many lines (lines mode) */
  context?: number
}

export default function DiffView({ before, after, mode = 'lines', context = 2 }: Props): React.JSX.Element {
  if (mode === 'words') return <WordDiff before={before} after={after} />
  return <LineDiff before={before} after={after} context={context} />
}

function WordDiff({ before, after }: { before: string; after: string }): React.JSX.Element {
  const parts = useMemo(() => diffWordsWithSpace(before, after), [before, after])
  return (
    <div className="diff diff-words">
      {parts.map((p, i) =>
        p.added ? (
          <ins key={i}>{p.value}</ins>
        ) : p.removed ? (
          <del key={i}>{p.value}</del>
        ) : (
          <span key={i}>{p.value}</span>
        )
      )}
    </div>
  )
}

interface Row {
  kind: 'add' | 'del' | 'ctx' | 'skip'
  text: string
  skipped?: number
}

function LineDiff({ before, after, context }: { before: string; after: string; context: number }): React.JSX.Element {
  const rows = useMemo<Row[]>(() => {
    const parts = diffLines(before, after)
    const out: Row[] = []
    parts.forEach((p, idx) => {
      const lines = p.value.replace(/\n$/, '').split('\n')
      if (p.added) {
        lines.forEach((l) => out.push({ kind: 'add', text: l }))
      } else if (p.removed) {
        lines.forEach((l) => out.push({ kind: 'del', text: l }))
      } else {
        // collapse the middle of long unchanged runs
        const isFirst = idx === 0
        const isLast = idx === parts.length - 1
        const head = isFirst ? 0 : context
        const tail = isLast ? 0 : context
        if (lines.length > head + tail + 2) {
          lines.slice(0, head).forEach((l) => out.push({ kind: 'ctx', text: l }))
          out.push({ kind: 'skip', text: '', skipped: lines.length - head - tail })
          lines.slice(lines.length - tail).forEach((l) => out.push({ kind: 'ctx', text: l }))
        } else {
          lines.forEach((l) => out.push({ kind: 'ctx', text: l }))
        }
      }
    })
    return out
  }, [before, after, context])

  return (
    <div className="diff diff-lines">
      {rows.map((r, i) =>
        r.kind === 'skip' ? (
          <div key={i} className="diff-skip">
            ⋯ {r.skipped} unchanged {r.skipped === 1 ? 'line' : 'lines'}
          </div>
        ) : (
          <div key={i} className={`diff-row diff-${r.kind}`}>
            <span className="diff-gutter">{r.kind === 'add' ? '+' : r.kind === 'del' ? '−' : ''}</span>
            <span className="diff-text">{r.text || ' '}</span>
          </div>
        )
      )}
    </div>
  )
}
