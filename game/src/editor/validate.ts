import { parseWorld } from '../data/worldSchema'
import type { Entity, SceneData, WorldData } from '../data/world'

/**
 * Validação ao vivo do mundo no editor — roda `parseWorld` (erros estruturais
 * e de referência) + checagens semânticas que o schema não cobre (warnings).
 * Puro: sem DOM, sem store — recebe o WorldData e devolve a lista de issues.
 */

export interface Issue {
  level: 'error' | 'warning'
  sceneId?: string
  entityId?: string
  message: string
}

/** Tipos "consumíveis" cujo save id é posicional — dois na mesma posição
 *  compartilhariam o progresso (moeda/XP coletados uma vez só) */
const POSITIONAL_TYPES = new Set(['coin', 'coffee', 'item', 'key', 'crawler', 'flyer'])

/** Extrai sceneId/entityId de um erro do parseWorld (`path: mensagem`):
 *  `scenes.<cena>.entities[<i>].<campo>` ou `scenes.<cena>.entities` —
 *  recebe o erro inteiro porque a mensagem pode citar o id duplicado */
function locateIssue(
  world: WorldData,
  error: string
): { sceneId?: string; entityId?: string } {
  const m = /^scenes\.([^.[]+)(?:\.entities\[(\d+)\]|\.entities)?/.exec(error)
  if (!m) return {}
  const sceneId = m[1]
  const scene = world.scenes[sceneId]
  if (!scene) return { sceneId }
  if (m[2] !== undefined) {
    const entity = scene.entities[Number(m[2])]
    return { sceneId, entityId: entity?.id }
  }
  // Erro no array `entities` inteiro (ex.: id duplicado) — tenta casar pelo id citado
  const idMatch = /id duplicado '([^']+)'/.exec(error)
  if (idMatch) {
    const entity = scene.entities.find((e) => e.id === idMatch[1])
    if (entity) return { sceneId, entityId: entity.id }
  }
  return { sceneId }
}

function inBounds(
  b: SceneData['bounds'],
  x: number,
  z: number
): boolean {
  return x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ
}

function entityLabel(e: Entity): string {
  const door = e as { label?: string }
  return door.label ? `${e.type} "${door.label}"` : e.type
}

/**
 * Valida o mundo inteiro. `errors` vêm do parseWorld (estrutural + referências);
 * `warnings` são checagens semânticas não-bloqueantes.
 */
export function validateWorld(world: WorldData): Issue[] {
  const issues: Issue[] = []

  // ---- Erros: tudo que o parseWorld pega (estrutura, enums, refs, ids únicos)
  const parsed = parseWorld(world)
  if (!parsed.ok) {
    for (const error of parsed.errors) {
      // locateIssue recebe o erro INTEIRO — o texto após ':' pode trazer o id
      // duplicado, necessário para mapear o issue à entidade certa
      const { sceneId, entityId } = locateIssue(world, error)
      issues.push({ level: 'error', sceneId, entityId, message: error })
    }
  }

  // ---- Warnings semânticos (independentes de erros estruturais)
  for (const scene of Object.values(world.scenes)) {
    // Spawn da cena fora dos próprios bounds
    if (!inBounds(scene.bounds, scene.spawn[0], scene.spawn[2])) {
      issues.push({
        level: 'warning',
        sceneId: scene.id,
        message: `spawn (${scene.spawn[0]}, ${scene.spawn[2]}) fora dos bounds da cena`,
      })
    }

    // Dois "consumíveis" na mesma posição dividiriam o id de save
    const seen = new Map<string, Entity[]>()
    for (const e of scene.entities) {
      if (!POSITIONAL_TYPES.has(e.type)) continue
      const key = `${e.x},${e.z}`
      const list = seen.get(key) ?? []
      list.push(e)
      seen.set(key, list)
    }
    for (const list of seen.values()) {
      if (list.length < 2) continue
      const first = list[0]
      issues.push({
        level: 'warning',
        sceneId: scene.id,
        entityId: first.id,
        message: `${list.length} entidades ${first.type} na mesma posição (${first.x}, ${first.z}) dividem o progresso de save`,
      })
    }
  }

  // toSpawn de portas/transportes fora dos bounds do destino (warning)
  for (const scene of Object.values(world.scenes)) {
    for (const e of scene.entities) {
      if (e.type !== 'door' && e.type !== 'transport') continue
      const toScene = e.toScene
      const toSpawn = e.toSpawn
      if (!toScene || !toSpawn) continue
      const dest = world.scenes[toScene]
      if (!dest) continue // erro de referência já reportado pelo parseWorld
      if (!inBounds(dest.bounds, toSpawn[0], toSpawn[2])) {
        issues.push({
          level: 'warning',
          sceneId: scene.id,
          entityId: e.id,
          message: `${entityLabel(e)}: toSpawn (${toSpawn[0]}, ${toSpawn[2]}) fora dos bounds de '${toScene}'`,
        })
      }
    }
  }

  return issues
}

// ---- Memo por referência — o mundo é substituído a cada commit, então a
// mesma referência sempre produz o mesmo resultado (barato no draw loop) ----

let cachedWorld: WorldData | null = null
let cachedIssues: Issue[] = []

export function validateWorldCached(world: WorldData): Issue[] {
  if (world !== cachedWorld) {
    cachedWorld = world
    cachedIssues = validateWorld(world)
  }
  return cachedIssues
}
