import { Vector3 } from 'three'
import type { Collider } from '../store/useGameStore'
import type { SceneData } from './world'

/**
 * Colliders estáticos de uma cena, calculados dos dados (puro — sem React/GLB).
 *
 * O `SceneRenderer` registra o resultado no useGameStore ao montar a cena.
 * Colliders que dependem de componente (LockedDoor, Transport, ParkedVehicle,
 * Npc) continuam registrados pelos próprios componentes.
 *
 * Fórmulas preservadas do código original para o resultado ser idêntico:
 * - árvore: um círculo de `height * 0.28` no centro
 * - bloco com `collideRadius`: UM círculo em (x, z)
 * - bloco com `collide`: amostragem de pontos a cada ~0.55 ao longo do maior
 *   eixo local (count = ceil(len / 0.55), count + 1 pontos, raio 0.28),
 *   rotacionada por `rotY`
 * - casa: perímetro a cada 0.6, raio 0.35 (mesmo passo do HouseExterior)
 */
export function computeSceneColliders(scene: SceneData): Collider[] {
  const colliders: Collider[] = []

  const pushSampled = (
    id: string,
    cx: number,
    cz: number,
    sizeX: number,
    sizeZ: number,
    rotY: number | undefined
  ) => {
    const horizontal = sizeX > sizeZ
    const length = horizontal ? sizeX : sizeZ
    const count = Math.ceil(length / 0.55)
    const cos = Math.cos(rotY ?? 0)
    const sin = Math.sin(rotY ?? 0)
    for (let i = 0; i <= count; i++) {
      const offset = -length / 2 + (i / count) * length
      const ox = horizontal ? offset : 0
      const oz = horizontal ? 0 : offset
      colliders.push({
        id: `${id}-col-${i}`,
        position: new Vector3(cx + ox * cos + oz * sin, 0, cz - ox * sin + oz * cos),
        radius: 0.28,
      })
    }
  }

  for (const e of scene.entities) {
    switch (e.type) {
      case 'tree':
        colliders.push({
          id: `${e.id}-col`,
          position: new Vector3(e.x, 0, e.z),
          radius: e.height * 0.28,
        })
        break

      case 'block':
        if (e.collideRadius !== undefined) {
          colliders.push({
            id: `${e.id}-col`,
            position: new Vector3(e.x, 0, e.z),
            radius: e.collideRadius,
          })
        } else if (e.collide) {
          pushSampled(e.id, e.x, e.z, e.size[0], e.size[2], e.rotY)
        }
        break

      case 'house': {
        // Perímetro da casa (16x12 local) — mesmo laço do HouseExterior:
        // fileira norte/sul a cada 0.6 em X, fileira leste/oeste a cada 0.6 em Z
        const cos = Math.cos(e.rotY ?? 0)
        const sin = Math.sin(e.rotY ?? 0)
        const toWorld = (lx: number, lz: number): Vector3 =>
          new Vector3(e.x + lx * cos + lz * sin, 0, e.z - lx * sin + lz * cos)
        let n = 0
        for (let lx = -8; lx <= 8; lx += 0.6) {
          colliders.push({ id: `${e.id}-n-${n++}`, position: toWorld(lx, -6), radius: 0.35 })
          colliders.push({ id: `${e.id}-s-${n++}`, position: toWorld(lx, 6), radius: 0.35 })
        }
        for (let lz = -6; lz <= 6; lz += 0.6) {
          colliders.push({ id: `${e.id}-w-${n++}`, position: toWorld(-8, lz), radius: 0.35 })
          colliders.push({ id: `${e.id}-e-${n++}`, position: toWorld(8, lz), radius: 0.35 })
        }
        break
      }
    }
  }

  return colliders
}
