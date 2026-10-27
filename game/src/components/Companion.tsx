import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import { AdditiveBlending, CanvasTexture, Group, Vector3 } from 'three'
import { useGameStore, getEffectiveStats } from '../store/useGameStore'
import { MAX_PROJECTILES } from '../data/stats'
import { forEachEnemy, nearestEnemy } from '../store/enemyRegistry'
import { emitBinary, burstBinary } from '../fx/particles'
import type { MovementKey } from '../App'

/** Altura que o orbe flutua acima do player */
const ORB_HEIGHT = 1.45
/** Raio da órbita lenta ao redor do player */
const ORB_RADIUS = 0.9
const ORB_ORBIT_SPEED = 0.9
const ORB_BOB_SPEED = 2.4

const PROJECTILE_SPEED = 11
const PROJECTILE_LIFE = 0.85
const PROJECTILE_RADIUS = 0.2
/** Ângulo entre cada projétil do leque em tiros múltiplos (~10°) */
const SPREAD_STEP = 0.18
/** Dígitos emitidos por segundo enquanto o projétil voa */
const TRAIL_RATE = 110
/** Intervalo entre "faíscas" idle que o orbe solta */
const MOTE_INTERVAL = 0.14
/** Distância em que o projétil começa a curvar atrás de um inimigo */
const HOMING_RANGE = 7
/** Rapidez da curva do projétil (maior = gruda mais no alvo) */
const HOMING_TURN = 5
/** Altura mínima do ponto de mira — não enterra o tiro no chão atrás de rastejantes */
const MIN_AIM_Y = 0.5

/** Gradiente radial usado nos sprites de brilho do orbe */
function createGlowTexture() {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')!
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(255,255,255,1)')
  grad.addColorStop(0.35, 'rgba(120,200,255,0.55)')
  grad.addColorStop(1, 'rgba(60,140,255,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  return new CanvasTexture(canvas)
}

interface Projectile {
  active: boolean
  pos: Vector3
  dir: Vector3
  age: number
  emitAcc: number
  /** Dano rolado no disparo (com crit) — consumido por inimigos futuros */
  damage: number
  crit: boolean
}

/**
 * Orbe companheiro estilo "Sein" (Ori): flutua ao redor do player com brilho
 * azul e, ao apertar Espaço, dispara um projétil na direção do player deixando
 * um rastro de cometa feito de dígitos 0 e 1 cintilantes.
 */
export function Companion() {
  const orb = useRef<Group>(null!)
  const [, getKeys] = useKeyboardControls<MovementKey>()

  const orbitAngle = useRef(0)
  const cooldown = useRef(0)
  const wasAttack = useRef(false)
  const attackPulse = useRef(0)
  const moteAcc = useRef(0)

  const glowTexture = useMemo(() => createGlowTexture(), [])

  const projectiles = useMemo<Projectile[]>(
    () =>
      Array.from({ length: MAX_PROJECTILES }, () => ({
        active: false,
        pos: new Vector3(),
        dir: new Vector3(),
        age: 0,
        emitAcc: 0,
        damage: 0,
        crit: false,
      })),
    []
  )

  const tmp = useMemo(
    () => ({
      target: new Vector3(),
      aim: new Vector3(),
      shotDir: new Vector3(),
      up: new Vector3(0, 1, 0),
    }),
    []
  )

  const spawnProjectile = (origin: Vector3, dir: Vector3) => {
    const p = projectiles.find((p) => !p.active)
    if (!p) return
    const stats = getEffectiveStats()
    p.crit = Math.random() < stats.critChance
    p.damage = stats.damage * (p.crit ? stats.critDamage : 1)
    p.active = true
    p.pos.copy(origin)
    p.dir.copy(dir)
    p.age = 0
    p.emitAcc = 0
  }

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime
    const gameStore = useGameStore.getState()
    const {
      playerPosition,
      playerDirection,
      colliders,
      activeNpc,
      menuOpen,
      gameOver,
      pendingLevelUps,
    } = gameStore

    // ---- Orbe: órbita lenta + bob + lag de mola ao seguir o player ----
    orbitAngle.current += delta * ORB_ORBIT_SPEED
    tmp.target.set(
      playerPosition.x + Math.cos(orbitAngle.current) * ORB_RADIUS,
      playerPosition.y + ORB_HEIGHT + Math.sin(t * ORB_BOB_SPEED) * 0.08,
      playerPosition.z + Math.sin(orbitAngle.current) * ORB_RADIUS
    )
    orb.current.position.lerp(tmp.target, 1 - Math.exp(-8 * delta))

    attackPulse.current *= Math.exp(-6 * delta)
    const pulse = 1 + attackPulse.current * 0.6
    orb.current.scale.setScalar(pulse)

    // ---- Ataque: Espaço dispara projétil na direção do player ----
    cooldown.current -= delta
    const attackDown = getKeys().attack === true
    if (
      attackDown &&
      !wasAttack.current &&
      cooldown.current <= 0 &&
      !activeNpc &&
      !menuOpen &&
      !gameOver &&
      pendingLevelUps === 0
    ) {
      const stats = getEffectiveStats()
      cooldown.current = 1 / stats.attackSpeed
      attackPulse.current = 1
      // Tiro adicional: leque simétrico em volta da direção do player
      const shots = Math.min(stats.projectiles, MAX_PROJECTILES)
      for (let i = 0; i < shots; i++) {
        const offset = (i - (shots - 1) / 2) * SPREAD_STEP
        tmp.shotDir.copy(playerDirection).applyAxisAngle(tmp.up, offset)
        spawnProjectile(orb.current.position, tmp.shotDir)
      }
      burstBinary(orb.current.position.x, orb.current.position.y, orb.current.position.z, 8, 1.2)
    }
    wasAttack.current = attackDown

    // ---- Faíscas idle que o orbe solta ----
    moteAcc.current += delta
    if (moteAcc.current >= MOTE_INTERVAL) {
      moteAcc.current = 0
      emitBinary(
        orb.current.position.x + (Math.random() - 0.5) * 0.15,
        orb.current.position.y,
        orb.current.position.z + (Math.random() - 0.5) * 0.15,
        (Math.random() - 0.5) * 0.4,
        0.4 + Math.random() * 0.4,
        (Math.random() - 0.5) * 0.4,
        { life: 0.5 + Math.random() * 0.3, size: 0.14 + Math.random() * 0.08 }
      )
    }

    // ---- Projéteis: movem, emitem trail, explodem em colisor/fim de vida ----
    for (const p of projectiles) {
      if (!p.active) continue
      p.age += delta

      // Homing: curva em direção ao inimigo mais próximo — alcança voadores em altura
      const target = nearestEnemy(p.pos, HOMING_RANGE)
      if (target) {
        tmp.aim.copy(target.position)
        tmp.aim.y = Math.max(tmp.aim.y, MIN_AIM_Y)
        tmp.aim.sub(p.pos).normalize()
        p.dir.lerp(tmp.aim, 1 - Math.exp(-HOMING_TURN * delta)).normalize()
      }
      p.pos.addScaledVector(p.dir, PROJECTILE_SPEED * delta)

      let hit = p.age >= PROJECTILE_LIFE
      // Inimigos têm prioridade sobre cenário — aplica dano + knockback
      forEachEnemy((e) => {
        if (hit) return
        const dx = p.pos.x - e.position.x
        const dz = p.pos.z - e.position.z
        const minDist = PROJECTILE_RADIUS + e.radius
        if (dx * dx + dz * dz < minDist * minDist) {
          e.hit({ damage: p.damage, knockback: 3, from: p.pos })
          hit = true
        }
      })
      for (const c of colliders) {
        const dx = p.pos.x - c.position.x
        const dz = p.pos.z - c.position.z
        const minDist = PROJECTILE_RADIUS + c.radius
        if (dx * dx + dz * dz < minDist * minDist) {
          hit = true
          break
        }
      }

      if (hit) {
        p.active = false
        burstBinary(p.pos.x, p.pos.y, p.pos.z, 16, 2.2)
        continue
      }

      p.emitAcc += TRAIL_RATE * delta
      while (p.emitAcc >= 1) {
        p.emitAcc -= 1
        emitBinary(
          p.pos.x + (Math.random() - 0.5) * 0.12,
          p.pos.y + (Math.random() - 0.5) * 0.12,
          p.pos.z + (Math.random() - 0.5) * 0.12,
          -p.dir.x * (0.5 + Math.random()) + (Math.random() - 0.5) * 0.8,
          (Math.random() - 0.5) * 0.8,
          -p.dir.z * (0.5 + Math.random()) + (Math.random() - 0.5) * 0.8,
          { life: 0.3 + Math.random() * 0.35, size: 0.2 + Math.random() * 0.22 }
        )
      }
    }
  })

  return (
    <group ref={orb}>
      <pointLight color="#4db8ff" intensity={5} distance={5} decay={2} />
      <mesh>
        <sphereGeometry args={[0.09, 16, 16]} />
        <meshBasicMaterial color="#dff2ff" />
      </mesh>
      <sprite scale={[0.7, 0.7, 1]}>
        <spriteMaterial
          map={glowTexture}
          color="#9fdcff"
          transparent
          opacity={0.9}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
      <sprite scale={[1.7, 1.7, 1]}>
        <spriteMaterial
          map={glowTexture}
          color="#3399ff"
          transparent
          opacity={0.45}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </sprite>
    </group>
  )
}
