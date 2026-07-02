// Regenerates the derived schema artifacts from the descriptor tables in
// src/shared/harness.ts:
//   - docs/fabulist.schema.json          (JSON Schema for editor autocomplete)
//   - docs/harness.md                    (the section between the schema markers)
//
// Run with: npm run gen:schema
// A vitest test asserts these files match the descriptors, so forgetting to
// regenerate fails CI/tests rather than silently drifting.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { jsonSchema, schemaMarkdown } from '../src/shared/harness'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const SCHEMA_JSON_PATH = path.join(root, 'docs', 'fabulist.schema.json')
export const HARNESS_DOC_PATH = path.join(root, 'docs', 'harness.md')
export const MARK_START = '<!-- generated:schema:start (npm run gen:schema) -->'
export const MARK_END = '<!-- generated:schema:end -->'

export function renderSchemaJson(): string {
  return JSON.stringify(jsonSchema(), null, 2) + '\n'
}

export function spliceHarnessDoc(current: string): string {
  const start = current.indexOf(MARK_START)
  const end = current.indexOf(MARK_END)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`docs/harness.md is missing the schema markers (${MARK_START} … ${MARK_END})`)
  }
  return (
    current.slice(0, start + MARK_START.length) +
    '\n\n' +
    schemaMarkdown() +
    '\n\n' +
    current.slice(end)
  )
}

// generate when executed directly (tsx scripts/gen-harness-schema.ts)
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  writeFileSync(SCHEMA_JSON_PATH, renderSchemaJson())
  writeFileSync(HARNESS_DOC_PATH, spliceHarnessDoc(readFileSync(HARNESS_DOC_PATH, 'utf8')))
  console.log('regenerated docs/fabulist.schema.json and docs/harness.md schema section')
}
