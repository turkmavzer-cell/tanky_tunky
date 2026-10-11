#!/usr/bin/env node
// Appends an entry to docs/CHANGELOG.md (newest first, right below the LOG:START marker).
// Usage: npm run log -- <kind> "Short title" ["Optional details"]
// Kinds: yenilik | degisiklik | duzeltme | geri-alma | karar | konusma | acik-soru
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const KINDS = ['yenilik', 'degisiklik', 'duzeltme', 'geri-alma', 'karar', 'konusma', 'acik-soru']
const MARKER = '<!-- LOG:START -->'

const [kind, title, details = ''] = process.argv.slice(2)

if (!kind || !title || !KINDS.includes(kind)) {
  console.error('Usage: npm run log -- <kind> "Short title" ["Optional details"]')
  console.error(`Kinds: ${KINDS.join(' | ')}`)
  process.exit(1)
}

const file = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'CHANGELOG.md')
const text = readFileSync(file, 'utf8')
const at = text.indexOf(MARKER)
if (at === -1) {
  console.error(`Marker ${MARKER} not found in ${file}`)
  process.exit(1)
}

const date = new Date().toISOString().slice(0, 10)
const body = details.trim() ? `\n${details.trim()}` : ''
const entry = `\n### ${date} — [${kind}] ${title.trim()}${body}`
const insertAt = at + MARKER.length

writeFileSync(file, text.slice(0, insertAt) + entry + text.slice(insertAt), 'utf8')
console.log(`Logged: ${date} [${kind}] ${title.trim()}`)
