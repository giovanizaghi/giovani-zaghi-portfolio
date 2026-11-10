// Copia os arquivos-fonte do schema do jogo para api/src/shared/.
// As cópias devem permanecer BYTE-IDÊNTICAS — nunca edite shared/ na mão;
// rode `npm run sync-schema` após mudar game/src/data/{worldSchema,world,
// items,keys,transports}.ts. `npm run check-schema` falha se divergirem.
import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const apiRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const srcDir = join(apiRoot, '..', 'game', 'src', 'data')
const dstDir = join(apiRoot, 'src', 'shared')

const FILES = ['worldSchema.ts', 'world.ts', 'items.ts', 'keys.ts', 'transports.ts']

mkdirSync(dstDir, { recursive: true })
for (const f of FILES) {
  copyFileSync(join(srcDir, f), join(dstDir, f))
  console.log(`sync: ${f}`)
}
console.log('schema sincronizado — shared/ agora é idêntico a game/src/data/')
