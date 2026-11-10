// Falha (exit 1) se qualquer cópia em api/src/shared/ divergir da fonte em
// game/src/data/. Rode após `npm run sync-schema` ou no CI.
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(apiRoot, '..', 'game', 'src', 'data')
const dstDir = join(apiRoot, 'src', 'shared')

const FILES = ['worldSchema.ts', 'world.ts', 'items.ts', 'keys.ts', 'transports.ts']

let failed = false
for (const f of FILES) {
  const a = readFileSync(join(srcDir, f))
  const b = readFileSync(join(dstDir, f))
  if (a.equals(b)) {
    console.log(`ok: ${f}`)
  } else {
    failed = true
    console.error(`DIVERGE: ${f} — rode npm run sync-schema em api/`)
  }
}
if (failed) {
  console.error('\nshared/ está dessincronizado de game/src/data/')
  process.exit(1)
}
console.log('schema em sync')
