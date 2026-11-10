import type { ItemId } from './items'
import type { KeyColor } from './keys'
import type { CompassDirection, TransportKind, TransportRide } from './transports'

/**
 * Formato de dados do mundo — o conteúdo das cenas vive em JSON
 * (`src/data/default-world.json`) e é renderizado pelo `SceneRenderer`.
 *
 * ATENÇÃO — ids são progresso: `entity.id` alimenta `consumedEntities`,
 * `unlockedDoors`, `transition.id` e os colliders. Trocar o id de uma
 * entidade (especialmente `door`/`transport`) reseta o progresso dela
 * para quem já jogou (save em `portfolio-game-save`).
 */

export type Vec3 = [number, number, number]

/** Diálogo de NPC — antes vivia em data/dialogues.ts, agora é dado do mundo */
export interface Dialogue {
  /** Nome exibido na caixa de diálogo */
  name: string
  /** Falas exibidas em sequência (E / clique avança) */
  lines: string[]
}

export interface WorldData {
  version: 1
  /** Cena inicial de um save novo */
  startScene: string
  scenes: Record<string, SceneData>
  dialogues: Record<string, Dialogue>
}

export interface SceneData {
  id: string
  name: string
  /** Ponto de respawn/fallback da cena (ex-SCENE_SPAWNS) */
  spawn: Vec3
  /** Região jogável — loadGame valida o playerPos salvo contra ela */
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
  env: SceneEnv
  entities: Entity[]
}

export interface SceneEnv {
  background: string
  ground: {
    color: string
    /** Centro XZ do chão */
    center: [number, number]
    /** Tamanho XZ do chão */
    size: [number, number]
    /** Altura do centro da caixa — default -0.2 */
    y?: number
    /** Espessura da caixa — default 0.2 */
    thickness?: number
  }
  hemi: { sky: string; ground: string; intensity: number }
  ambient: number
  sun: { position: Vec3; intensity: number }
}

type Base = { id: string; x: number; z: number; y?: number; rotY?: number }

/** Stats opcionais de inimigo — sobrescrevem os BASE_* antes do enemyScaling */
export interface EnemyStats {
  hp?: number
  damage?: number
  xp?: number
}

export type Entity = Base &
  (
    | { type: 'tree'; model: 'deciduous' | 'pine'; height: number }
    | {
        type: 'block'
        size: Vec3
        color: string
        collide: boolean
        /** Se definido, UM círculo em (x,z) com esse raio em vez da amostragem de parede */
        collideRadius?: number
        material?: 'basic' | 'standard'
        /** false = só colisor, sem malha (ex.: vão da porta da casa) */
        visible?: boolean
      }
    | { type: 'label'; text: string; variant: 'room' | 'platform' | 'sign' }
    | { type: 'house' }
    | { type: 'coin'; value?: number }
    | { type: 'coffee' }
    | { type: 'item'; item: ItemId }
    | { type: 'key'; color: KeyColor }
    | { type: 'crawler'; stats?: EnemyStats }
    | { type: 'flyer'; stats?: EnemyStats }
    | { type: 'npc'; dialogueId: string; color?: string }
    | { type: 'gate'; skill: string; color: string; size?: Vec3 }
    | {
        type: 'door'
        label: string
        labelFront?: string
        labelBack?: string
        /** Trava por chave — primeiro E consome a chave e abre; depois vira porta normal */
        lock?: KeyColor
        /** Largura do painel (só panel: true) */
        width?: number
        /** true = painel físico (LockedDoor); false/ausente = só anel de trigger (DoorTrigger) */
        panel?: boolean
        /** Obrigatórios quando panel !== true */
        toScene?: string
        toSpawn?: Vec3
        /** Raio de interação do anel — obrigatório quando panel !== true */
        radius?: number
        /** Posição do cadealho solto (DoorTrigger com lock) — o burst de FX usa y + 0.3 */
        padlock?: Vec3
      }
    | {
        type: 'transport'
        kind: TransportKind
        ride: TransportRide
        toScene: string
        toSpawn: Vec3
        label?: string
      }
    | { type: 'parked'; kind: TransportKind; direction?: CompassDirection }
    | { type: 'trigger'; radius: number; dialogueId: string; once: boolean }
  )

/** Id de entidade gerado: `${sceneId}:${type}:${n}` */
export function entityId(sceneId: string, type: string, n: number): string {
  return `${sceneId}:${type}:${n}`
}

/** Cena vazia para o editor (Fase 2) criar do zero */
export function createEmptyScene(id: string, name: string): SceneData {
  return {
    id,
    name,
    spawn: [0, 0, 0],
    bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 },
    env: {
      background: '#9fc8d6',
      ground: { color: '#5a8a4f', center: [0, 0], size: [20, 20] },
      hemi: { sky: '#dff4ff', ground: '#7f9a68', intensity: 1.5 },
      ambient: 1.2,
      sun: { position: [8, 12, 4], intensity: 2.2 },
    },
    entities: [],
  }
}
