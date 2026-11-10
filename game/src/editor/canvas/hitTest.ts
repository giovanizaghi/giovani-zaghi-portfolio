import type { Entity, SceneData } from '../../data/world'

/**
 * Hit test do canvas do editor — ponto do mundo (x,z) → entidade.
 * Considera a pegada real de cada tipo: retângulo rotacionado para blocos e
 * casa, círculo (raio do colisor/interação) para o resto. Puro, sem DOM.
 */

/** Raio de interação aproximado por tipo (unidades do mundo) */
const PICK_RADIUS: Partial<Record<Entity['type'], number>> = {
  coin: 0.6,
  coffee: 0.6,
  item: 0.6,
  key: 0.6,
  crawler: 0.7,
  flyer: 0.7,
  npc: 0.8,
  label: 0.9,
  trigger: 0, // usa e.radius
  door: 0, // usa radius ou footprint do painel
  gate: 1.1,
  house: 0, // retângulo 16x12
  transport: 0, // por kind
  parked: 0, // por kind
}

/** Pegada aproximada dos transportes (KIND_DIMS do jogo, só para picking) */
const TRANSPORT_PICK_R: Record<string, number> = {
  elevator: 1.1,
  car: 1.5,
  van: 1.7,
  bus: 2.3,
  plane: 2.1,
}

/** Ponto (dx,dz) no referencial do mundo → local da entidade.
 *  O desenho espelha o `rotation.y` do three: no plano XZ visto de cima
 *  (x→direita, z→baixo) a rotação aparece como R(−rotY). Logo o offset
 *  local→mundo é R(−rotY) e a inversa é R(+rotY): projeta o delta nos
 *  eixos (cos,−sen) e (sen,cos). */
function toLocal(dx: number, dz: number, rotY: number): [number, number] {
  const cos = Math.cos(rotY)
  const sin = Math.sin(rotY)
  return [dx * cos - dz * sin, dx * sin + dz * cos]
}

function inRotatedRect(
  e: { x: number; z: number; rotY?: number },
  wx: number,
  wz: number,
  sx: number,
  sz: number
): boolean {
  const [lx, lz] = toLocal(wx - e.x, wz - e.z, e.rotY ?? 0)
  return Math.abs(lx) <= sx / 2 && Math.abs(lz) <= sz / 2
}

/** Raio de pegada aproximado — exportado p/ placeholders do viewport 3D */
export function pickRadius(e: Entity): number {
  switch (e.type) {
    case 'tree':
      return e.height * 0.28
    case 'trigger':
      return e.radius
    case 'door':
      if (e.panel === true) return (e.width ?? 1.6) / 2 + 0.3
      return e.radius ?? 1.4
    case 'transport':
    case 'parked':
      return TRANSPORT_PICK_R[e.kind] ?? 1.5
    case 'gate':
      return e.size ? Math.max(e.size[0], e.size[2]) / 2 : 1.1
    default:
      return PICK_RADIUS[e.type] ?? 0.7
  }
}

/**
 * Maior prioridade = desenhada por último. Retorna a entidade atingida ou
 * null. A ordem de `entities` é a ordem de desenho — iteramos de trás para
 * frente para pegar a que está "em cima".
 */
export function hitTest(scene: SceneData, wx: number, wz: number): Entity | null {
  const entities = scene.entities
  for (let i = entities.length - 1; i >= 0; i--) {
    const e = entities[i]
    let hit = false
    if (e.type === 'block') {
      hit = inRotatedRect(e, wx, wz, e.size[0], e.size[2])
    } else if (e.type === 'house') {
      // Mesma pegada do modelo: 16x12 local, rotacionada por rotY
      hit = inRotatedRect(e, wx, wz, 16, 12)
    } else {
      const r = pickRadius(e)
      const dx = wx - e.x
      const dz = wz - e.z
      hit = dx * dx + dz * dz <= r * r
    }
    if (hit) return e
  }
  return null
}

/** Distância do ponto ao centro da entidade (para drag com offset) */
export function entityCenter(e: Entity): { x: number; z: number } {
  return { x: e.x, z: e.z }
}
