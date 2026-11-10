import type { Entity, Vec3, WorldData } from '../data/world'
import { ITEM_IDS } from '../data/items'
import { KEY_COLOR_IDS } from '../data/keys'
import type { CompassDirection, TransportKind } from '../data/transports'

/**
 * Registro único de tipos de entidade do editor — paleta, inspector e canvas
 * leem daqui. Adicionar um tipo novo = uma entrada nesta lista + um `case` no
 * `SceneRenderer` do jogo + o tipo em `world.ts`/`worldSchema.ts`.
 *
 * Este módulo é PURO (só dados/tipos) — não pode importar three nem
 * componentes do jogo, senão vazaria para o chunk inicial do `/editor`.
 */

// ---- Stats base dos inimigos (copiados de Crawler.tsx/Flyer.tsx) ----
// NÃO importar os componentes — eles puxam three/@react-three/yuka.
// xp = enemyScaling(1).xpReward = floor(8 * 1.12^0) = 8 (data/stats.ts).
const ENEMY_BASE: Record<'crawler' | 'flyer', { hp: number; damage: number; xp: number }> = {
  crawler: { hp: 3, damage: 0.5, xp: 8 },
  flyer: { hp: 2, damage: 0.5, xp: 8 },
}

export interface FieldDef {
  /** Caminho pontuado dentro da entidade: 'x', 'stats.hp', 'ride.direction', 'size' */
  key: string
  label: string
  kind:
    | 'number'
    | 'color'
    | 'select'
    | 'vec3'
    | 'text'
    | 'bool'
    | 'scene'
    | 'dialogue'
    | 'spawnPicker'
  /** true = campo opcional: input vazio remove a chave do objeto */
  optional?: boolean
  min?: number
  max?: number
  step?: number
  options?: { value: string; label: string }[]
  /** Condição de exibição — campos ocultos não são editados */
  show?: (e: Entity) => boolean
  placeholder?: string
}

export interface EntityDef {
  type: Entity['type']
  /** Rótulo em PT na paleta/inspector */
  label: string
  /** Glifo curto exibido na paleta e desenhado no canvas */
  glyph: string
  /** Cor base do glifo/desenho no canvas */
  color: string
  /** Cria a entidade no ponto (x,z) — id novo único no mundo */
  defaults: (ctx: { sceneId: string; x: number; z: number; world: WorldData }) => Entity
  fields: FieldDef[]
  /** Ajusta a entidade após edições (ex.: sincronizar ride.kind com kind) */
  normalize?: (e: Entity, ctx: { sceneId: string }) => Entity
  /** Capacidades do gizmo 3D: y = translação vertical, rotate = aro Y,
   *  scale = redimensionar (só block edita `size`) */
  gizmo: GizmoCaps
}

export interface GizmoCaps {
  y: boolean
  rotate: boolean
  scale: boolean
}

// ---- Opções reutilizáveis ----

const OPT = {
  treeModel: [
    { value: 'deciduous', label: 'Decídua' },
    { value: 'pine', label: 'Conífera' },
  ],
  labelVariant: [
    { value: 'room', label: 'Sala (room)' },
    { value: 'platform', label: 'Plataforma' },
    { value: 'sign', label: 'Placa (sign)' },
  ],
  blockMaterial: [
    { value: 'basic', label: 'Básico' },
    { value: 'standard', label: 'Standard' },
  ],
  item: ITEM_IDS.map((id) => ({
    value: id,
    label: { java: 'Java', csharp: 'C#', javascript: 'JavaScript', python: 'Python' }[id],
  })),
  keyColor: KEY_COLOR_IDS.map((id) => ({
    value: id,
    label: { silver: 'Prata', gold: 'Dourada' }[id],
  })),
  transportKind: (
    [
      ['elevator', 'Elevador'],
      ['car', 'Carro'],
      ['van', 'Van'],
      ['bus', 'Ônibus'],
      ['plane', 'Avião'],
    ] as [TransportKind, string][]
  ).map(([value, label]) => ({ value, label })),
  compass: (
    [
      ['north', 'Norte'],
      ['northeast', 'Nordeste'],
      ['east', 'Leste'],
      ['southeast', 'Sudeste'],
      ['south', 'Sul'],
      ['southwest', 'Sudoeste'],
      ['west', 'Oeste'],
      ['northwest', 'Noroeste'],
    ] as [CompassDirection, string][]
  ).map(([value, label]) => ({ value, label })),
  vertical: [
    { value: 'up', label: 'Subir' },
    { value: 'down', label: 'Descer' },
  ],
  /** Select opcional de trava: '' (vazio) remove a chave */
  lockOptional: [
    { value: '', label: '— sem trava —' },
    { value: 'silver', label: 'Prata' },
    { value: 'gold', label: 'Dourada' },
  ],
}

// ---- Helpers de id ----

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

/** Id novo: `${sceneId}:${type}:${6 chars}` — regenera até não colidir no mundo */
export function newEntityId(world: WorldData, sceneId: string, type: string): string {
  let id = `${sceneId}:${type}:${shortId()}`
  while (idExists(world, id)) id = `${sceneId}:${type}:${shortId()}`
  return id
}

/** Primeiro id de diálogo do mundo (para defaults de npc/trigger) */
function firstDialogueId(world: WorldData): string {
  return Object.keys(world.dialogues)[0] ?? ''
}

/** Cena "vizinha" para defaults de transporte: prefere outra que não a atual */
function defaultTargetScene(world: WorldData, sceneId: string): string {
  return Object.keys(world.scenes).find((id) => id !== sceneId) ?? sceneId
}

// ---- Stats de inimigo (campos opcionais com placeholder do valor base) ----

function enemyStatFields(kind: 'crawler' | 'flyer'): FieldDef[] {
  const base = ENEMY_BASE[kind]
  return [
    {
      key: 'stats.hp',
      label: 'HP (override)',
      kind: 'number',
      optional: true,
      min: 0,
      step: 1,
      placeholder: `base ${base.hp}`,
    },
    {
      key: 'stats.damage',
      label: 'Dano (override)',
      kind: 'number',
      optional: true,
      min: 0,
      step: 0.1,
      placeholder: `base ${base.damage}`,
    },
    {
      key: 'stats.xp',
      label: 'XP (override)',
      kind: 'number',
      optional: true,
      min: 0,
      step: 1,
      placeholder: `base ${base.xp} (nível 1)`,
    },
  ]
}

/** Remove `stats` quando os três campos ficam vazios */
function normalizeEnemyStats(e: Entity): Entity {
  if ((e.type !== 'crawler' && e.type !== 'flyer') || !e.stats) return e
  const s = e.stats
  if (s.hp === undefined && s.damage === undefined && s.xp === undefined) {
    const { stats: _stats, ...rest } = e
    return rest as Entity
  }
  return e
}

// ---- Capacidades de gizmo (shorthands) ----

const G_Y: GizmoCaps = { y: true, rotate: false, scale: false }
const G_Y_ROT: GizmoCaps = { y: true, rotate: true, scale: false }
const G_BLOCK: GizmoCaps = { y: true, rotate: true, scale: true }
const G_ROT: GizmoCaps = { y: false, rotate: true, scale: false }
const G_NONE: GizmoCaps = { y: false, rotate: false, scale: false }

// ---- Definições por tipo ----

export const ENTITY_DEFS: EntityDef[] = [
  {
    type: 'tree',
    label: 'Árvore',
    glyph: '♣',
    color: '#3e7c3a',
    gizmo: G_Y_ROT,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'tree'),
      type: 'tree',
      x,
      z,
      model: 'deciduous',
      height: 2.5,
    }),
    fields: [
      { key: 'model', label: 'Modelo', kind: 'select', options: OPT.treeModel },
      { key: 'height', label: 'Altura', kind: 'number', min: 0.5, step: 0.1 },
    ],
  },
  {
    type: 'block',
    label: 'Bloco',
    glyph: '▦',
    color: '#8b8b8b',
    gizmo: G_BLOCK,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'block'),
      type: 'block',
      x,
      z,
      size: [1, 1, 1],
      color: '#8b8b8b',
      collide: true,
    }),
    fields: [
      { key: 'size', label: 'Tamanho [x,y,z]', kind: 'vec3', min: 0.05, step: 0.1 },
      { key: 'color', label: 'Cor', kind: 'color' },
      { key: 'collide', label: 'Colide', kind: 'bool' },
      {
        key: 'collideRadius',
        label: 'Raio do colisor (vazio = amostra as faces)',
        kind: 'number',
        optional: true,
        min: 0,
        step: 0.05,
        show: (e) => e.type === 'block' && e.collide,
      },
      { key: 'material', label: 'Material', kind: 'select', options: OPT.blockMaterial, optional: true },
      { key: 'visible', label: 'Visível', kind: 'bool', optional: true },
    ],
  },
  {
    type: 'label',
    label: 'Rótulo',
    glyph: 'T',
    color: '#4a6fa5',
    gizmo: G_Y,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'label'),
      type: 'label',
      x,
      z,
      y: 2,
      text: 'RÓTULO',
      variant: 'sign',
    }),
    fields: [
      { key: 'text', label: 'Texto', kind: 'text' },
      { key: 'variant', label: 'Variante', kind: 'select', options: OPT.labelVariant },
    ],
  },
  {
    type: 'house',
    label: 'Casa',
    glyph: '⌂',
    color: '#b4552e',
    gizmo: G_ROT,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'house'),
      type: 'house',
      x,
      z,
    }),
    fields: [],
  },
  {
    type: 'coin',
    label: 'Moeda',
    glyph: '●',
    color: '#f5c542',
    gizmo: G_Y,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'coin'),
      type: 'coin',
      x,
      z,
    }),
    fields: [
      {
        key: 'value',
        label: 'Valor (vazio = 5)',
        kind: 'number',
        optional: true,
        min: 1,
        step: 1,
      },
    ],
  },
  {
    type: 'coffee',
    label: 'Café',
    glyph: '☕',
    color: '#8a5a2b',
    gizmo: G_Y,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'coffee'),
      type: 'coffee',
      x,
      z,
    }),
    fields: [],
  },
  {
    type: 'item',
    label: 'Item',
    glyph: '◆',
    color: '#c9b200',
    gizmo: G_Y,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'item'),
      type: 'item',
      x,
      z,
      item: 'java',
    }),
    fields: [{ key: 'item', label: 'Item', kind: 'select', options: OPT.item }],
  },
  {
    type: 'key',
    label: 'Chave',
    glyph: '⚿',
    color: '#cfd8e0',
    gizmo: G_Y,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'key'),
      type: 'key',
      x,
      z,
      color: 'silver',
    }),
    fields: [{ key: 'color', label: 'Cor', kind: 'select', options: OPT.keyColor }],
  },
  {
    type: 'crawler',
    label: 'Rastejante',
    glyph: '✚',
    color: '#4a3555',
    gizmo: G_NONE,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'crawler'),
      type: 'crawler',
      x,
      z,
    }),
    fields: enemyStatFields('crawler'),
    normalize: normalizeEnemyStats,
  },
  {
    type: 'flyer',
    label: 'Voador',
    glyph: '✈',
    color: '#2e3550',
    gizmo: G_NONE,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'flyer'),
      type: 'flyer',
      x,
      z,
    }),
    fields: enemyStatFields('flyer'),
    normalize: normalizeEnemyStats,
  },
  {
    type: 'npc',
    label: 'NPC',
    glyph: '☺',
    color: '#b5651d',
    gizmo: G_Y,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'npc'),
      type: 'npc',
      x,
      z,
      dialogueId: firstDialogueId(world),
      color: '#b5651d',
    }),
    fields: [
      { key: 'dialogueId', label: 'Diálogo', kind: 'dialogue' },
      { key: 'color', label: 'Cor', kind: 'color', optional: true },
    ],
  },
  {
    type: 'gate',
    label: 'Portão (skill)',
    glyph: '▣',
    color: '#5e9bd4',
    gizmo: G_Y,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'gate'),
      type: 'gate',
      x,
      z,
      skill: 'csharp',
      color: '#5e9bd4',
    }),
    fields: [
      { key: 'skill', label: 'Skill exigida', kind: 'text' },
      { key: 'color', label: 'Cor', kind: 'color' },
      { key: 'size', label: 'Tamanho [x,y,z] (vazio = padrão)', kind: 'vec3', optional: true },
    ],
  },
  {
    type: 'door',
    label: 'Porta',
    glyph: '⇄',
    color: '#e8c170',
    gizmo: G_ROT,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'door'),
      type: 'door',
      x,
      z,
      label: 'Porta',
      panel: false,
      toScene: sceneId,
      toSpawn: [x, 0, z + 2] as Vec3,
      radius: 1.4,
    }),
    fields: [
      { key: 'panel', label: 'Painel físico (LockedDoor)', kind: 'bool' },
      { key: 'label', label: 'Rótulo', kind: 'text' },
      {
        key: 'labelFront',
        label: 'Rótulo (frente)',
        kind: 'text',
        optional: true,
        show: (e) => e.type === 'door' && e.panel === true,
      },
      {
        key: 'labelBack',
        label: 'Rótulo (verso)',
        kind: 'text',
        optional: true,
        show: (e) => e.type === 'door' && e.panel === true,
      },
      { key: 'width', label: 'Largura do painel', kind: 'number', optional: true, min: 0.5, step: 0.1, show: (e) => e.type === 'door' && e.panel === true },
      {
        key: 'toScene',
        label: 'Cena destino (vazio = mesma cena)',
        kind: 'scene',
        optional: true,
        show: (e) => e.type === 'door',
      },
      {
        key: 'toSpawn',
        label: 'Spawn destino (escolher no mapa)',
        kind: 'spawnPicker',
        optional: true,
        show: (e) => e.type === 'door',
      },
      {
        key: 'radius',
        label: 'Raio do anel',
        kind: 'number',
        min: 0.3,
        step: 0.1,
        show: (e) => e.type === 'door' && e.panel !== true,
      },
      {
        key: 'lock',
        label: 'Trava',
        kind: 'select',
        options: OPT.lockOptional,
        optional: true,
        show: (e) => e.type === 'door',
      },
      {
        key: 'padlock',
        label: 'Posição do cadeado [x,y,z]',
        kind: 'vec3',
        optional: true,
        show: (e) => e.type === 'door' && e.panel !== true,
      },
    ],
    normalize: (e, { sceneId }) => {
      if (e.type !== 'door') return e
      // Painel desligado sem destino configurado: preenche com a cena atual
      if (e.panel !== true && (e.toScene === undefined || e.toSpawn === undefined || e.radius === undefined)) {
        return {
          ...e,
          toScene: e.toScene ?? sceneId,
          toSpawn: e.toSpawn ?? ([e.x, 0, e.z + 2] as Vec3),
          radius: e.radius ?? 1.4,
        }
      }
      return e
    },
  },
  {
    type: 'transport',
    label: 'Transporte',
    glyph: '➤',
    color: '#6b8e5a',
    gizmo: G_Y,
    defaults: ({ sceneId, x, z, world }) => {
      const toScene = defaultTargetScene(world, sceneId)
      return {
        id: newEntityId(world, sceneId, 'transport'),
        type: 'transport',
        x,
        z,
        kind: 'car',
        ride: { kind: 'car', direction: 'east' },
        toScene,
        // Spawn default = spawn da cena destino (sempre dentro dos bounds)
        toSpawn: world.scenes[toScene]?.spawn ?? ([x, 0, z + 2] as Vec3),
        label: 'Ir',
      }
    },
    fields: [
      { key: 'kind', label: 'Tipo', kind: 'select', options: OPT.transportKind },
      {
        key: 'ride.vertical',
        label: 'Sentido',
        kind: 'select',
        options: OPT.vertical,
        show: (e) => e.type === 'transport' && e.kind === 'elevator',
      },
      {
        key: 'ride.direction',
        label: 'Direção',
        kind: 'select',
        options: OPT.compass,
        show: (e) => e.type === 'transport' && e.kind !== 'elevator',
      },
      { key: 'toScene', label: 'Cena destino', kind: 'scene' },
      { key: 'toSpawn', label: 'Spawn destino (escolher no mapa)', kind: 'spawnPicker' },
      { key: 'label', label: 'Rótulo (vazio = padrão)', kind: 'text', optional: true },
    ],
    normalize: (e) => {
      if (e.type !== 'transport') return e
      // Sincroniza ride.kind/shape com kind — elevador usa vertical, o resto bússola
      if (e.kind === 'elevator') {
        const prev = e.ride.kind === 'elevator' ? e.ride.vertical : 'up'
        return { ...e, ride: { kind: 'elevator', vertical: prev } }
      }
      const prev = e.ride.kind !== 'elevator' ? e.ride.direction : 'east'
      return { ...e, ride: { kind: e.kind, direction: prev } }
    },
  },
  {
    type: 'parked',
    label: 'Veículo parado',
    glyph: '▭',
    color: '#7a8a99',
    gizmo: G_Y,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'parked'),
      type: 'parked',
      x,
      z,
      kind: 'car',
      direction: 'east',
    }),
    fields: [
      { key: 'kind', label: 'Tipo', kind: 'select', options: OPT.transportKind },
      {
        key: 'direction',
        label: 'Direção (frente do modelo)',
        kind: 'select',
        options: OPT.compass,
        optional: true,
        show: (e) => e.type === 'parked' && e.kind !== 'elevator',
      },
    ],
  },
  {
    type: 'trigger',
    label: 'Gatilho',
    glyph: '◎',
    color: '#9a8aff',
    gizmo: G_NONE,
    defaults: ({ sceneId, x, z, world }) => ({
      id: newEntityId(world, sceneId, 'trigger'),
      type: 'trigger',
      x,
      z,
      radius: 2,
      dialogueId: firstDialogueId(world),
      once: false,
    }),
    fields: [
      { key: 'radius', label: 'Raio', kind: 'number', min: 0.2, step: 0.1 },
      { key: 'dialogueId', label: 'Diálogo', kind: 'dialogue' },
      { key: 'once', label: 'Uma vez só', kind: 'bool' },
    ],
  },
]

export const ENTITY_DEF_MAP: Record<Entity['type'], EntityDef> = Object.fromEntries(
  ENTITY_DEFS.map((d) => [d.type, d])
) as Record<Entity['type'], EntityDef>
