import { EditorView, Decoration, type DecorationSet, keymap, placeholder } from '@codemirror/view'
import { EditorState, StateField, StateEffect, RangeSetBuilder } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'

// ---------- comment highlights ----------

export interface ThreadRange {
  id: string
  from: number
  to: number
  active: boolean
}

export const setThreadRanges = StateEffect.define<ThreadRange[]>()

function buildDecorations(ranges: ThreadRange[], docLength: number): DecorationSet {
  const sorted = [...ranges]
    .filter((r) => r.from < r.to && r.to <= docLength)
    .sort((a, b) => a.from - b.from || a.to - b.to)
  const builder = new RangeSetBuilder<Decoration>()
  for (const r of sorted) {
    builder.add(
      r.from,
      r.to,
      Decoration.mark({
        class: r.active ? 'cm-thread cm-thread-active' : 'cm-thread',
        attributes: { 'data-thread': r.id }
      })
    )
  }
  return builder.finish()
}

export const threadField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setThreadRanges)) deco = buildDecorations(e.value, tr.newDoc.length)
    }
    return deco
  },
  provide: (f) => EditorView.decorations.from(f)
})

/** Read current (mapped) thread positions back out of the decoration set. */
export function currentThreadRanges(state: EditorState): { id: string; from: number; to: number }[] {
  const out: { id: string; from: number; to: number }[] = []
  const deco = state.field(threadField, false)
  if (!deco) return out
  const iter = deco.iter()
  while (iter.value) {
    const id = iter.value.spec.attributes?.['data-thread']
    if (id) out.push({ id, from: iter.from, to: iter.to })
    iter.next()
  }
  return out
}

// ---------- markdown typography ----------

const mdHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontFamily: 'var(--font-display)', fontSize: '1.7em', fontWeight: '560', lineHeight: '1.25' },
  { tag: tags.heading2, fontFamily: 'var(--font-display)', fontSize: '1.4em', fontWeight: '540', lineHeight: '1.3' },
  { tag: tags.heading3, fontFamily: 'var(--font-display)', fontSize: '1.15em', fontWeight: '560' },
  { tag: tags.heading4, fontFamily: 'var(--font-display)', fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strong, fontWeight: '640' },
  { tag: tags.strikethrough, textDecoration: 'line-through', opacity: '0.6' },
  { tag: tags.link, color: 'var(--accent)' },
  { tag: tags.url, color: 'var(--ink-faint)' },
  { tag: tags.quote, color: 'var(--ink-soft)', fontStyle: 'italic' },
  { tag: tags.monospace, fontFamily: 'var(--font-mono)', fontSize: '0.85em', color: 'var(--accent-deep)' },
  { tag: tags.meta, color: 'var(--ink-faint)' },
  { tag: tags.processingInstruction, color: 'var(--ink-faint)' },
  { tag: tags.contentSeparator, color: 'var(--ink-faint)' },
  { tag: tags.list, color: 'inherit' }
])

const editorTheme = EditorView.theme({
  '&': {
    height: '100%',
    fontSize: '17.5px',
    backgroundColor: 'transparent',
    color: 'var(--ink)'
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-serif)',
    lineHeight: '1.72',
    padding: '0 max(48px, calc(50% - 37ch)) 30vh'
  },
  '.cm-content': {
    maxWidth: '74ch',
    caretColor: 'var(--accent)',
    padding: '40px 0 0'
  },
  '.cm-line': { padding: '0' },
  '&.cm-focused': { outline: 'none' },
  '.cm-selectionBackground': { backgroundColor: 'var(--selection) !important' },
  '&.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--selection) !important' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '.cm-thread': {
    backgroundColor: 'var(--thread-bg)',
    borderBottom: '2px solid var(--thread-edge)',
    cursor: 'pointer',
    transition: 'background-color 160ms ease'
  },
  '.cm-thread-active': {
    backgroundColor: 'var(--thread-bg-active)',
    borderBottomColor: 'var(--accent)'
  },
  '.cm-placeholder': { color: 'var(--ink-faint)', fontStyle: 'italic' }
})

export function baseExtensions(): ReturnType<typeof markdown>[] {
  return [
    history(),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(mdHighlight),
    EditorView.lineWrapping,
    editorTheme,
    placeholder('Begin…'),
    threadField
  ] as ReturnType<typeof markdown>[]
}
