import type {
  Dialogue,
  EnemyStats,
  Entity,
  SceneData,
  SceneEnv,
  Vec3,
  WorldData,
} from './world'

/**
 * Validador manual do formato WorldData — sem dependências, reutilizado na
 * API da Fase 3. Mantido autocontido (só `import type`): as listas de valores
 * válidos espelham data/items.ts, data/keys.ts e data/transports.ts.
 *
 * `parseWorld` nunca confia no input: valida estrutura e referências
 * (cenas, diálogos, ids únicos) antes de devolver o mundo tipado.
 */

export type ParseWorldResult =
  | { ok: true; world: WorldData }
  | { ok: false; errors: string[] }

// ---- Listas de valores válidos (espelham os data/* correspondentes) ----
const ITEM_IDS = ['java', 'csharp', 'javascript', 'python'] as const
const KEY_COLORS = ['silver', 'gold'] as const
const TREE_MODELS = ['deciduous', 'pine'] as const
const LABEL_VARIANTS = ['room', 'platform', 'sign'] as const
const BLOCK_MATERIALS = ['basic', 'standard'] as const
const TRANSPORT_KINDS = ['elevator', 'car', 'van', 'bus', 'plane'] as const
const COMPASS_DIRECTIONS = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
] as const
const VERTICAL_DIRECTIONS = ['up', 'down'] as const

const ENTITY_TYPES = [
  'tree',
  'block',
  'label',
  'house',
  'coin',
  'coffee',
  'item',
  'key',
  'crawler',
  'flyer',
  'npc',
  'gate',
  'door',
  'transport',
  'parked',
  'trigger',
] as const

// ---- Helpers de verificação ----

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v)
}

function isVec3(v: unknown): v is Vec3 {
  return (
    Array.isArray(v) &&
    v.length === 3 &&
    v.every((n) => isFiniteNumber(n))
  )
}

function isPair(v: unknown): v is [number, number] {
  return (
    Array.isArray(v) &&
    v.length === 2 &&
    v.every((n) => isFiniteNumber(n))
  )
}

function err(errors: string[], path: string, msg: string) {
  errors.push(`${path}: ${msg}`)
}

function checkEnum(
  errors: string[],
  path: string,
  value: unknown,
  allowed: readonly string[]
): value is string {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    err(errors, path, `valor inválido (esperado um de: ${allowed.join(', ')})`)
    return false
  }
  return true
}

function checkOptionalNumber(
  errors: string[],
  path: string,
  obj: Record<string, unknown>,
  key: string
) {
  if (obj[key] !== undefined && !isFiniteNumber(obj[key])) {
    err(errors, `${path}.${key}`, 'deve ser número')
  }
}

function checkVec3Field(
  errors: string[],
  path: string,
  obj: Record<string, unknown>,
  key: string,
  required: boolean
) {
  const v = obj[key]
  if (v === undefined) {
    if (required) err(errors, `${path}.${key}`, 'obrigatório')
    return
  }
  if (!isVec3(v)) err(errors, `${path}.${key}`, 'deve ser [x, y, z] numérico')
}

// ---- Validadores por seção ----

function validateDialogue(
  errors: string[],
  path: string,
  value: unknown
): asserts value is Dialogue {
  if (!isRecord(value)) {
    err(errors, path, 'deve ser um objeto')
    return
  }
  if (typeof value.name !== 'string') err(errors, `${path}.name`, 'deve ser texto')
  if (
    !Array.isArray(value.lines) ||
    value.lines.some((l) => typeof l !== 'string')
  ) {
    err(errors, `${path}.lines`, 'deve ser lista de textos')
  }
}

function validateEnv(errors: string[], path: string, value: unknown): asserts value is SceneEnv {
  if (!isRecord(value)) {
    err(errors, path, 'deve ser um objeto')
    return
  }
  if (typeof value.background !== 'string')
    err(errors, `${path}.background`, 'deve ser texto')

  const ground = value.ground
  if (!isRecord(ground)) {
    err(errors, `${path}.ground`, 'deve ser um objeto')
  } else {
    if (typeof ground.color !== 'string')
      err(errors, `${path}.ground.color`, 'deve ser texto')
    if (!isPair(ground.center))
      err(errors, `${path}.ground.center`, 'deve ser [x, z] numérico')
    if (!isPair(ground.size))
      err(errors, `${path}.ground.size`, 'deve ser [w, d] numérico')
    checkOptionalNumber(errors, `${path}.ground`, ground, 'y')
    checkOptionalNumber(errors, `${path}.ground`, ground, 'thickness')
  }

  const hemi = value.hemi
  if (!isRecord(hemi)) {
    err(errors, `${path}.hemi`, 'deve ser um objeto')
  } else {
    if (typeof hemi.sky !== 'string')
      err(errors, `${path}.hemi.sky`, 'deve ser texto')
    if (typeof hemi.ground !== 'string')
      err(errors, `${path}.hemi.ground`, 'deve ser texto')
    if (!isFiniteNumber(hemi.intensity))
      err(errors, `${path}.hemi.intensity`, 'deve ser número')
  }

  if (!isFiniteNumber(value.ambient))
    err(errors, `${path}.ambient`, 'deve ser número')

  const sun = value.sun
  if (!isRecord(sun)) {
    err(errors, `${path}.sun`, 'deve ser um objeto')
  } else {
    checkVec3Field(errors, `${path}.sun`, sun, 'position', true)
    if (!isFiniteNumber(sun.intensity))
      err(errors, `${path}.sun.intensity`, 'deve ser número')
  }
}

function validateEnemyStats(
  errors: string[],
  path: string,
  value: unknown
): asserts value is EnemyStats {
  if (!isRecord(value)) {
    err(errors, path, 'deve ser um objeto')
    return
  }
  checkOptionalNumber(errors, path, value, 'hp')
  checkOptionalNumber(errors, path, value, 'damage')
  checkOptionalNumber(errors, path, value, 'xp')
}

function validateTransportRide(
  errors: string[],
  path: string,
  value: unknown
) {
  if (!isRecord(value)) {
    err(errors, path, 'deve ser um objeto')
    return
  }
  if (value.kind === 'elevator') {
    checkEnum(errors, `${path}.vertical`, value.vertical, VERTICAL_DIRECTIONS)
  } else if (
    typeof value.kind === 'string' &&
    (TRANSPORT_KINDS as readonly string[]).includes(value.kind)
  ) {
    checkEnum(errors, `${path}.direction`, value.direction, COMPASS_DIRECTIONS)
  } else {
    checkEnum(errors, `${path}.kind`, value.kind, TRANSPORT_KINDS)
  }
}

function validateEntity(
  errors: string[],
  path: string,
  value: unknown,
  sceneIds: Record<string, true>,
  dialogueIds: Record<string, true>
): asserts value is Entity {
  if (!isRecord(value)) {
    err(errors, path, 'deve ser um objeto')
    return
  }
  if (typeof value.id !== 'string' || value.id.length === 0)
    err(errors, `${path}.id`, 'deve ser texto não vazio')
  if (!isFiniteNumber(value.x)) err(errors, `${path}.x`, 'deve ser número')
  if (!isFiniteNumber(value.z)) err(errors, `${path}.z`, 'deve ser número')
  checkOptionalNumber(errors, path, value, 'y')
  checkOptionalNumber(errors, path, value, 'rotY')
  if (typeof value.type !== 'string' || !(ENTITY_TYPES as readonly string[]).includes(value.type)) {
    err(errors, `${path}.type`, `tipo desconhecido (esperado um de: ${ENTITY_TYPES.join(', ')})`)
    return
  }

  switch (value.type) {
    case 'tree':
      checkEnum(errors, `${path}.model`, value.model, TREE_MODELS)
      if (!isFiniteNumber(value.height) || (value.height as number) <= 0)
        err(errors, `${path}.height`, 'deve ser número positivo')
      break

    case 'block': {
      if (!isVec3(value.size)) {
        err(errors, `${path}.size`, 'deve ser [w, h, d] numérico')
      } else if (value.size.some((n) => n <= 0)) {
        err(errors, `${path}.size`, 'dimensões devem ser positivas')
      }
      if (typeof value.color !== 'string')
        err(errors, `${path}.color`, 'deve ser texto')
      if (typeof value.collide !== 'boolean')
        err(errors, `${path}.collide`, 'deve ser booleano')
      checkOptionalNumber(errors, path, value, 'collideRadius')
      if (value.material !== undefined)
        checkEnum(errors, `${path}.material`, value.material, BLOCK_MATERIALS)
      if (value.visible !== undefined && typeof value.visible !== 'boolean')
        err(errors, `${path}.visible`, 'deve ser booleano')
      break
    }

    case 'label':
      if (typeof value.text !== 'string')
        err(errors, `${path}.text`, 'deve ser texto')
      checkEnum(errors, `${path}.variant`, value.variant, LABEL_VARIANTS)
      break

    case 'coin':
      checkOptionalNumber(errors, path, value, 'value')
      break

    case 'item':
      checkEnum(errors, `${path}.item`, value.item, ITEM_IDS)
      break

    case 'key':
      checkEnum(errors, `${path}.color`, value.color, KEY_COLORS)
      break

    case 'crawler':
    case 'flyer':
      if (value.stats !== undefined) validateEnemyStats(errors, `${path}.stats`, value.stats)
      break

    case 'npc':
      if (typeof value.dialogueId !== 'string' || value.dialogueId.length === 0)
        err(errors, `${path}.dialogueId`, 'deve ser texto')
      else if (!dialogueIds[value.dialogueId])
        err(errors, `${path}.dialogueId`, `diálogo '${value.dialogueId}' não existe`)
      if (value.color !== undefined && typeof value.color !== 'string')
        err(errors, `${path}.color`, 'deve ser texto')
      break

    case 'gate':
      if (typeof value.skill !== 'string' || value.skill.length === 0)
        err(errors, `${path}.skill`, 'deve ser texto')
      if (typeof value.color !== 'string')
        err(errors, `${path}.color`, 'deve ser texto')
      checkVec3Field(errors, path, value, 'size', false)
      break

    case 'door': {
      if (typeof value.label !== 'string' || value.label.length === 0)
        err(errors, `${path}.label`, 'deve ser texto')
      for (const k of ['labelFront', 'labelBack'] as const) {
        if (value[k] !== undefined && typeof value[k] !== 'string')
          err(errors, `${path}.${k}`, 'deve ser texto')
      }
      if (value.lock !== undefined) checkEnum(errors, `${path}.lock`, value.lock, KEY_COLORS)
      checkOptionalNumber(errors, path, value, 'width')
      checkOptionalNumber(errors, path, value, 'radius')
      if (value.panel !== undefined && typeof value.panel !== 'boolean')
        err(errors, `${path}.panel`, 'deve ser booleano')
      checkVec3Field(errors, path, value, 'padlock', false)

      const panel = value.panel === true
      const hasToScene = value.toScene !== undefined
      const hasToSpawn = value.toSpawn !== undefined
      if (hasToScene !== hasToSpawn)
        err(errors, path, 'toScene e toSpawn devem vir juntos')
      if (hasToScene) {
        if (typeof value.toScene === 'string') {
          if (!sceneIds[value.toScene])
            err(errors, `${path}.toScene`, `cena '${value.toScene}' não existe`)
        } else {
          err(errors, `${path}.toScene`, 'deve ser texto')
        }
        checkVec3Field(errors, path, value, 'toSpawn', true)
      } else {
        checkVec3Field(errors, path, value, 'toSpawn', false)
      }
      if (!panel) {
        if (value.toScene === undefined)
          err(errors, `${path}.toScene`, 'obrigatório em porta sem painel')
        if (value.toSpawn === undefined)
          err(errors, `${path}.toSpawn`, 'obrigatório em porta sem painel')
        if (!isFiniteNumber(value.radius) || (value.radius as number) <= 0)
          err(errors, `${path}.radius`, 'obrigatório e positivo em porta sem painel')
      }
      break
    }

    case 'transport': {
      checkEnum(errors, `${path}.kind`, value.kind, TRANSPORT_KINDS)
      validateTransportRide(errors, `${path}.ride`, value.ride)
      if (typeof value.toScene === 'string') {
        if (!sceneIds[value.toScene])
          err(errors, `${path}.toScene`, `cena '${value.toScene}' não existe`)
      } else {
        err(errors, `${path}.toScene`, 'deve ser texto')
      }
      checkVec3Field(errors, path, value, 'toSpawn', true)
      if (value.label !== undefined && typeof value.label !== 'string')
        err(errors, `${path}.label`, 'deve ser texto')
      break
    }

    case 'parked':
      checkEnum(errors, `${path}.kind`, value.kind, TRANSPORT_KINDS)
      if (value.direction !== undefined)
        checkEnum(errors, `${path}.direction`, value.direction, COMPASS_DIRECTIONS)
      break

    case 'trigger':
      if (!isFiniteNumber(value.radius) || (value.radius as number) <= 0)
        err(errors, `${path}.radius`, 'deve ser número positivo')
      if (typeof value.dialogueId !== 'string' || value.dialogueId.length === 0)
        err(errors, `${path}.dialogueId`, 'deve ser texto')
      else if (!dialogueIds[value.dialogueId])
        err(errors, `${path}.dialogueId`, `diálogo '${value.dialogueId}' não existe`)
      if (typeof value.once !== 'boolean')
        err(errors, `${path}.once`, 'deve ser booleano')
      break
  }
}

function validateScene(
  errors: string[],
  key: string,
  value: unknown,
  sceneIds: Record<string, true>,
  dialogueIds: Record<string, true>
): asserts value is SceneData {
  const path = `scenes.${key}`
  if (!isRecord(value)) {
    err(errors, path, 'deve ser um objeto')
    return
  }
  if (typeof value.id !== 'string' || value.id.length === 0)
    err(errors, `${path}.id`, 'deve ser texto não vazio')
  else if (value.id !== key)
    err(errors, `${path}.id`, `deve ser igual à chave '${key}'`)
  if (typeof value.name !== 'string')
    err(errors, `${path}.name`, 'deve ser texto')
  checkVec3Field(errors, path, value, 'spawn', true)

  const bounds = value.bounds
  if (!isRecord(bounds)) {
    err(errors, `${path}.bounds`, 'deve ser um objeto')
  } else {
    for (const k of ['minX', 'maxX', 'minZ', 'maxZ'] as const) {
      if (!isFiniteNumber(bounds[k]))
        err(errors, `${path}.bounds.${k}`, 'deve ser número')
    }
  }

  validateEnv(errors, `${path}.env`, value.env)

  if (!Array.isArray(value.entities)) {
    err(errors, `${path}.entities`, 'deve ser uma lista')
    return
  }
  value.entities.forEach((entity, i) =>
    validateEntity(errors, `${path}.entities[${i}]`, entity, sceneIds, dialogueIds)
  )
}

/**
 * Valida um WorldData desconhecido (JSON.parse de arquivo/draft/API).
 * Retorna o mundo tipado quando ok; senão a lista de erros encontrados.
 */
export function parseWorld(input: unknown): ParseWorldResult {
  const errors: string[] = []

  if (!isRecord(input)) {
    return { ok: false, errors: ['raiz: deve ser um objeto'] }
  }
  if (input.version !== 1) err(errors, 'version', 'deve ser 1')

  // Diálogos primeiro — entidades referenciam dialogueId
  const dialogues: Record<string, Dialogue> = {}
  if (!isRecord(input.dialogues)) {
    err(errors, 'dialogues', 'deve ser um objeto')
  } else {
    for (const [id, d] of Object.entries(input.dialogues)) {
      validateDialogue(errors, `dialogues.${id}`, d)
      dialogues[id] = d as Dialogue
    }
  }
  const dialogueIds: Record<string, true> = {}
  for (const id of Object.keys(dialogues)) dialogueIds[id] = true

  const scenes: Record<string, SceneData> = {}
  if (!isRecord(input.scenes)) {
    err(errors, 'scenes', 'deve ser um objeto')
  } else {
    // sceneIds é necessário para validar toScene das portas/transportes
    const sceneIds: Record<string, true> = {}
    for (const key of Object.keys(input.scenes)) sceneIds[key] = true
    for (const [key, s] of Object.entries(input.scenes)) {
      validateScene(errors, key, s, sceneIds, dialogueIds)
      scenes[key] = s as SceneData
    }
  }

  if (typeof input.startScene !== 'string' || input.startScene.length === 0) {
    err(errors, 'startScene', 'deve ser texto')
  } else if (!scenes[input.startScene]) {
    err(errors, 'startScene', `cena '${input.startScene}' não existe`)
  }

  // Ids de entidade únicos no mundo inteiro (alimentam saves/colliders)
  const seenIds = new Set<string>()
  for (const [sceneKey, scene] of Object.entries(scenes)) {
    for (const entity of scene.entities ?? []) {
      if (isRecord(entity) && typeof entity.id === 'string') {
        if (seenIds.has(entity.id)) {
          err(errors, `scenes.${sceneKey}.entities`, `id duplicado '${entity.id}'`)
        }
        seenIds.add(entity.id)
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }

  return {
    ok: true,
    world: {
      version: 1,
      startScene: input.startScene as string,
      scenes,
      dialogues,
    },
  }
}
