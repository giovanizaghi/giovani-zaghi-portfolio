import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { AdditiveBlending, Mesh, Vector3 } from 'three'
import { useGameStore } from '../store/useGameStore'
import { forEachEnemy, nearestEnemy } from '../store/enemyRegistry'
import type { EnemyHandle } from '../store/enemyRegistry'
import { emitBinary, burstBinary } from '../fx/particles'

const MAX_RINGS = 4
const RING_LIFE = 0.5
const EXPLOSION_RADIUS = 4.5
/** Dano e knockback aplicados em inimigos dentro do raio */
const EXPLOSION_DAMAGE = 2
export const EXPLOSION_KNOCKBACK = 8

const MAX_SNAKES = 4
const SNAKE_SPEED = 5.5
const SNAKE_LIFE = 3
/** Frequência/amplitude do zigue-zague da cobra */
const SNAKE_WIGGLE_FREQ = 9
const SNAKE_WIGGLE_AMP = 2.6
/** Quão rápido a cobra vira em direção ao alvo (rad/s) */
const SNAKE_TURN_RATE = 3.5
const SNAKE_TRAIL_RATE = 90
const SNAKE_DAMAGE = 2
/** Alcance máximo para a cobra preferir um inimigo a um colisor do cenário */
const SNAKE_TARGET_RANGE = 12

interface Ring {
  active: boolean
  pos: Vector3
  age: number
}

interface Snake {
  active: boolean
  pos: Vector3
  dir: Vector3
  age: number
  phase: number
  emitAcc: number
}

/**
 * Consome `pendingEffects` da store e executa os efeitos de mundo dos itens:
 * - C# 'explosion': anel roxo expandindo + burst de dígitos (+ knockback futuro)
 * - Python 'snake': projétil de dígitos que desliza no chão em zigue-zague
 *   e persegue o alvo (colisor) mais próximo
 * - 'use' (Java/JS): burst de dígitos subindo ao redor do player
 */
export function ItemEffects() {
  const ringRefs = useRef<Mesh[]>([])
  const tmp = useMemo(() => ({ toTarget: new Vector3(), perp: new Vector3() }), [])

  const rings = useMemo<Ring[]>(
    () => Array.from({ length: MAX_RINGS }, () => ({ active: false, pos: new Vector3(), age: 0 })),
    []
  )
  const snakes = useMemo<Snake[]>(
    () =>
      Array.from({ length: MAX_SNAKES }, () => ({
        active: false,
        pos: new Vector3(),
        dir: new Vector3(),
        age: 0,
        phase: Math.random() * Math.PI * 2,
        emitAcc: 0,
      })),
    []
  )

  const spawnExplosion = (origin: Vector3) => {
    const ring = rings.find((r) => !r.active)
    if (ring) {
      ring.active = true
      ring.pos.copy(origin)
      ring.age = 0
    }
    burstBinary(origin.x, origin.y + 0.8, origin.z, 40, 3.5, { size: 0.3 })
    // Dano + knockback em área nos inimigos
    forEachEnemy((e) => {
      const dx = e.position.x - origin.x
      const dz = e.position.z - origin.z
      if (dx * dx + dz * dz < EXPLOSION_RADIUS * EXPLOSION_RADIUS) {
        e.hit({ damage: EXPLOSION_DAMAGE, knockback: EXPLOSION_KNOCKBACK, from: origin })
      }
    })
  }

  const spawnSnake = (origin: Vector3, dir: Vector3) => {
    const s = snakes.find((s) => !s.active)
    if (!s) return
    s.active = true
    s.pos.set(origin.x, 0.3, origin.z)
    s.dir.copy(dir)
    s.age = 0
    s.emitAcc = 0
  }

  /** Alvo da cobra: prefere o inimigo mais próximo; senão, o colisor mais próximo */
  const nearestTarget = (pos: Vector3): { pos: Vector3; enemy: EnemyHandle | null } | null => {
    const enemy = nearestEnemy(pos, SNAKE_TARGET_RANGE)
    if (enemy) return { pos: enemy.position, enemy }
    const colliders = useGameStore.getState().colliders
    let best: Vector3 | null = null
    let bestDist = Infinity
    for (const c of colliders) {
      const dx = c.position.x - pos.x
      const dz = c.position.z - pos.z
      const d = dx * dx + dz * dz
      if (d < bestDist && d > 0.01) {
        bestDist = d
        best = c.position
      }
    }
    return best ? { pos: best, enemy: null } : null
  }

  useFrame((_, delta) => {
    const store = useGameStore.getState()

    // ---- Consome efeitos pendentes ----
    for (const effect of store.consumeEffects()) {
      switch (effect.type) {
        case 'explosion':
          spawnExplosion(store.playerPosition)
          break
        case 'snake':
          spawnSnake(store.playerPosition, store.playerDirection)
          break
        case 'use':
          for (let i = 0; i < 14; i++) {
            const a = (i / 14) * Math.PI * 2
            emitBinary(
              store.playerPosition.x + Math.cos(a) * 0.4,
              store.playerPosition.y + 0.4,
              store.playerPosition.z + Math.sin(a) * 0.4,
              Math.cos(a) * 0.3,
              1.2 + Math.random() * 0.8,
              Math.sin(a) * 0.3,
              { life: 0.6 + Math.random() * 0.3, size: 0.22 }
            )
          }
          break
      }
    }

    // ---- Anéis de explosão ----
    rings.forEach((ring, i) => {
      const mesh = ringRefs.current[i]
      if (!mesh) return
      if (!ring.active) {
        mesh.visible = false
        return
      }
      ring.age += delta
      const t = ring.age / RING_LIFE
      if (t >= 1) {
        ring.active = false
        mesh.visible = false
        return
      }
      mesh.visible = true
      mesh.position.copy(ring.pos).setY(0.06)
      const s = 0.5 + t * EXPLOSION_RADIUS
      mesh.scale.set(s, s, s)
      ;(mesh.material as { opacity: number }).opacity = (1 - t) * 0.8
    })

    // ---- Cobras: zigue-zague no chão + homing no colisor mais próximo ----
    for (const s of snakes) {
      if (!s.active) continue
      s.age += delta
      s.phase += SNAKE_WIGGLE_FREQ * delta

      const target = nearestTarget(s.pos)
      if (target) {
        tmp.toTarget.subVectors(target.pos, s.pos).setY(0).normalize()
        s.dir.lerp(tmp.toTarget, Math.min(1, SNAKE_TURN_RATE * delta)).normalize()
        // Chegou no alvo: explode (e acerta o inimigo, se for o alvo)
        if (s.pos.distanceTo(target.pos) < 0.6) {
          s.active = false
          if (target.enemy?.isAlive()) {
            target.enemy.hit({ damage: SNAKE_DAMAGE, knockback: 4, from: s.pos })
          }
          burstBinary(s.pos.x, s.pos.y, s.pos.z, 20, 2.5, { size: 0.28 })
          continue
        }
      }

      if (s.age >= SNAKE_LIFE) {
        s.active = false
        burstBinary(s.pos.x, s.pos.y, s.pos.z, 10, 1.5, { size: 0.24 })
        continue
      }

      // Zigue-zague: componente perpendicular oscilando
      tmp.perp.set(-s.dir.z, 0, s.dir.x)
      s.pos.addScaledVector(s.dir, SNAKE_SPEED * delta)
      s.pos.addScaledVector(tmp.perp, Math.cos(s.phase) * SNAKE_WIGGLE_AMP * delta)

      s.emitAcc += SNAKE_TRAIL_RATE * delta
      while (s.emitAcc >= 1) {
        s.emitAcc -= 1
        emitBinary(
          s.pos.x + (Math.random() - 0.5) * 0.08,
          s.pos.y,
          s.pos.z + (Math.random() - 0.5) * 0.08,
          (Math.random() - 0.5) * 0.5,
          0.3 + Math.random() * 0.4,
          (Math.random() - 0.5) * 0.5,
          { life: 0.35 + Math.random() * 0.25, size: 0.24 + Math.random() * 0.14 }
        )
      }
    }
  })

  return (
    <>
      {rings.map((_, i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) ringRefs.current[i] = m
          }}
          rotation-x={-Math.PI / 2}
          visible={false}
        >
          <ringGeometry args={[0.85, 1, 48]} />
          <meshBasicMaterial
            color="#a55eea"
            transparent
            opacity={0}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </>
  )
}
