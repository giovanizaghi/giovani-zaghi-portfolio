import bundledJson from './default-world.json'
import { parseWorld } from './worldSchema'
import type { WorldData } from './world'

/**
 * Mundo embutido no build — ponto único de acesso ao JSON bundled tanto
 * pelo jogo (useWorldStore) quanto pelo editor (botão "restaurar padrão").
 * Sempre validado por `parseWorld`; inválido = erro fatal no boot.
 */
const parsed = parseWorld(bundledJson)
if (!parsed.ok) {
  throw new Error(`default-world.json inválido: ${parsed.errors.join('; ')}`)
}

export const bundledWorld: WorldData = parsed.world
