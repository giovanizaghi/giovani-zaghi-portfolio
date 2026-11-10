import type { Dialogue, Entity, SceneData, Vec3, WorldData } from '../data/world'

/**
 * Mutações puras sobre WorldData — recebem o mundo (clone) e alteram no lugar.
 * Usadas tanto pelas actions da store (commit) quanto pelos drags do canvas
 * (editLive), garantindo um único jeito de mexer nos dados.
 */

export function findScene(world: WorldData, sceneId: string): SceneData | undefined {
  return world.scenes[sceneId]
}

export function findEntity(
  world: WorldData,
  sceneId: string,
  entityId: string
): Entity | undefined {
  return world.scenes[sceneId]?.entities.find((e) => e.id === entityId)
}

// ---- Caminho pontuado ('stats.hp', 'ride.direction', 'size') ----

/** Lê um valor por caminho pontuado; undefined se ausente */
export function getDot(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const key of path.split('.')) {
    if (typeof cur !== 'object' || cur === null) return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

/**
 * Escreve um valor por caminho pontuado, criando objetos intermediários.
 * `value === undefined` remove a chave-folha (campos opcionais vazios).
 */
export function setDot(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.')
  let cur: Record<string, unknown> = obj
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]
    const next = cur[key]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      cur[key] = {}
    }
    cur = cur[key] as Record<string, unknown>
  }
  const leaf = keys[keys.length - 1]
  if (value === undefined) {
    delete cur[leaf]
    // Pais esvaziados (ex.: stats:{}) são limpos pelo normalize da entidade
  } else {
    cur[leaf] = value
  }
}

// ---- Entidades ----

export function addEntityTo(world: WorldData, sceneId: string, entity: Entity): void {
  world.scenes[sceneId]?.entities.push(entity)
}

export function removeEntitiesFrom(world: WorldData, sceneId: string, ids: string[]): void {
  const scene = world.scenes[sceneId]
  if (!scene) return
  const drop = new Set(ids)
  scene.entities = scene.entities.filter((e) => !drop.has(e.id))
}

/** Posiciona entidades em novas coordenadas absolutas (usado no drag em grupo) */
export function moveEntitiesTo(
  world: WorldData,
  sceneId: string,
  positions: { id: string; x: number; z: number }[]
): void {
  const scene = world.scenes[sceneId]
  if (!scene) return
  const map = new Map(positions.map((p) => [p.id, p]))
  for (const e of scene.entities) {
    const p = map.get(e.id)
    if (p) {
      e.x = p.x
      e.z = p.z
    }
  }
}

/** Rotação em passos de 90° (radians) — normalizada para [0, 2π) */
export function rotateEntities(
  world: WorldData,
  sceneId: string,
  ids: string[],
  deltaRad: number
): void {
  const scene = world.scenes[sceneId]
  if (!scene) return
  const drop = new Set(ids)
  const TAU = Math.PI * 2
  for (const e of scene.entities) {
    if (!drop.has(e.id)) continue
    e.rotY = (((e.rotY ?? 0) + deltaRad) % TAU + TAU) % TAU
  }
}

const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'

function shortId(): string {
  const buf = new Uint8Array(6)
  crypto.getRandomValues(buf)
  return Array.from(buf, (b) => ID_CHARS[b % ID_CHARS.length]).join('')
}

function idExists(world: WorldData, id: string): boolean {
  for (const scene of Object.values(world.scenes)) {
    if (scene.entities.some((e) => e.id === id)) return true
  }
  return false
}

function freshId(world: WorldData, sceneId: string, type: string): string {
  let id = `${sceneId}:${type}:${shortId()}`
  while (idExists(world, id)) id = `${sceneId}:${type}:${shortId()}`
  return id
}

/**
 * Duplica entidades na mesma cena com ids novos e deslocamento de +1,+1
 * (para não sobrepor o original). Devolve as entidades criadas.
 */
export function duplicateEntitiesIn(
  world: WorldData,
  sceneId: string,
  ids: string[]
): Entity[] {
  const scene = world.scenes[sceneId]
  if (!scene) return []
  const drop = new Set(ids)
  const created: Entity[] = []
  // Itera sobre snapshot — as cópias são empilhadas durante o loop
  for (const e of [...scene.entities]) {
    if (!drop.has(e.id)) continue
    const copy = structuredClone(e) as Entity
    copy.id = freshId(world, sceneId, e.type)
    copy.x += 1
    copy.z += 1
    created.push(copy)
    scene.entities.push(copy)
  }
  return created
}

// ---- Cenas ----

export interface SceneReference {
  sceneId: string
  entityId: string
  /** Rótulo da entidade (label de porta/transporte ou tipo) */
  label: string
}

/** Referências a uma cena vindas de portas/transportes de OUTRAS cenas */
export function sceneReferences(world: WorldData, sceneId: string): SceneReference[] {
  const refs: SceneReference[] = []
  for (const scene of Object.values(world.scenes)) {
    if (scene.id === sceneId) continue
    for (const e of scene.entities) {
      if ((e.type === 'door' || e.type === 'transport') && e.toScene === sceneId) {
        refs.push({
          sceneId: scene.id,
          entityId: e.id,
          label: e.type === 'door' ? e.label : (e.label ?? e.kind),
        })
      }
    }
  }
  return refs
}

/** Cenas/entidades que referenciam um diálogo (npc.dialogueId / trigger.dialogueId) */
export function dialogueReferences(world: WorldData, dialogueId: string): SceneReference[] {
  const refs: SceneReference[] = []
  for (const scene of Object.values(world.scenes)) {
    for (const e of scene.entities) {
      if ((e.type === 'npc' || e.type === 'trigger') && e.dialogueId === dialogueId) {
        refs.push({ sceneId: scene.id, entityId: e.id, label: e.type })
      }
    }
  }
  return refs
}

/**
 * Duplica uma cena inteira com novo id: todos os entity ids são regerados
 * com o prefixo da nova cena; portas/transportes continuam apontando para
 * onde apontavam (inclusive para a cena original).
 */
export function duplicateSceneIn(world: WorldData, oldId: string, newId: string): SceneData | null {
  const src = world.scenes[oldId]
  if (!src) return null
  const copy = structuredClone(src) as SceneData
  copy.id = newId
  for (const e of copy.entities) {
    e.id = freshId(world, newId, e.type)
  }
  world.scenes[newId] = copy
  return copy
}

/** Renomeia um diálogo atualizando todas as referências npc/trigger */
export function renameDialogueIn(world: WorldData, oldId: string, newId: string): void {
  const d = world.dialogues[oldId]
  if (!d) return
  world.dialogues[newId] = d
  delete world.dialogues[oldId]
  for (const scene of Object.values(world.scenes)) {
    for (const e of scene.entities) {
      if ((e.type === 'npc' || e.type === 'trigger') && e.dialogueId === oldId) {
        e.dialogueId = newId
      }
    }
  }
}

/** Tipo de retorno auxiliar — reexporta para quem só precisa dos tipos */
export type { Dialogue, Vec3 }
