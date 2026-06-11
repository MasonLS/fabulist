import type { CommentAnchor } from '@shared/types'

export const CONTEXT = 32

/** Build an anchor for a selection range in the given content. */
export function makeAnchor(content: string, from: number, to: number): CommentAnchor {
  return {
    text: content.slice(from, to),
    prefix: content.slice(Math.max(0, from - CONTEXT), from),
    suffix: content.slice(to, to + CONTEXT),
    from,
    to
  }
}

/**
 * Re-locate an anchor in (possibly changed) content.
 * Exact quote match, disambiguated by surrounding context, then by
 * proximity to the last known offset. Returns null when the quote is gone.
 */
export function locateAnchor(content: string, anchor: CommentAnchor): { from: number; to: number } | null {
  const { text } = anchor
  if (!text) return null

  const candidates: number[] = []
  let i = content.indexOf(text)
  while (i !== -1 && candidates.length < 200) {
    candidates.push(i)
    i = content.indexOf(text, i + 1)
  }
  if (candidates.length === 0) return null
  if (candidates.length === 1) return { from: candidates[0], to: candidates[0] + text.length }

  let best = candidates[0]
  let bestScore = -Infinity
  for (const c of candidates) {
    const prefix = content.slice(Math.max(0, c - CONTEXT), c)
    const suffix = content.slice(c + text.length, c + text.length + CONTEXT)
    let score = 0
    score += sharedSuffixLen(prefix, anchor.prefix) * 2
    score += sharedPrefixLen(suffix, anchor.suffix) * 2
    score -= Math.abs(c - anchor.from) / 100
    if (score > bestScore) {
      bestScore = score
      best = c
    }
  }
  return { from: best, to: best + text.length }
}

function sharedSuffixLen(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++
  return n
}

function sharedPrefixLen(a: string, b: string): number {
  let n = 0
  while (n < a.length && n < b.length && a[n] === b[n]) n++
  return n
}
