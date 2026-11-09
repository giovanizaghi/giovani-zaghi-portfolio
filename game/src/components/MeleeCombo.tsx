import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useKeyboardControls } from '@react-three/drei'
import {
  AdditiveBlending,
  DoubleSide,
  Group,
  Mesh,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from 'three'
import { useGameStore, getEffectiveStats } from '../store/useGameStore'
import { BASE_STATS } from '../data/stats'
import { forEachEnemy } from '../store/enemyRegistry'
import { holdOrbForward, orbPosition } from '../store/orbState'
import { burstBinary, emitBinary } from '../fx/particles'
import type { MovementKey } from '../App'

/** Um golpe do combo — `half` é metade do arco (rad), `dir` o sentido do corte */
interface SlashConfig {
  half: number
  dir: 1 | -1
  /** Inclinação do plano do corte (diagonal pra lá / pra cá) */
  tilt: number
  /** Multiplicador sobre o dano base */
  damage: number
  knockback: number
  range: number
}

/** Corte 1 e 2 vão e voltam; o 3º é um giro largo e mais forte */
const COMBO: SlashConfig[] = [
  { half: 1.1, dir: 1, tilt: 0.35, damage: 1, knockback: 1.5, range: 1.7 },
  { half: 1.1, dir: -1, tilt: -0.35, damage: 1, knockback: 1.5, range: 1.7 },
  { half: 1.45, dir: 1, tilt: 0, damage: 1.8, knockback: 4.5, range: 2.0 },
]

/** Duração da varredura visual de um corte */
const SWING_TIME = 0.14
/** Fade do rastro depois da varredura */
const FADE_TIME = 0.16
/** Intervalo entre cortes 1→2→3 (no attackSpeed base) */
const SWING_GAP = 0.26
/** Recuperação após o 3º corte antes de recomeçar o combo */
const FINISHER_RECOVERY = 0.5
/** Janela após um corte para emendar o próximo — senão o combo reinicia */
const COMBO_WINDOW = 0.45
/** Tempo que um aperto fica "guardado" esperando o corte atual terminar */
const INPUT_BUFFER = 0.3
/** Inimigos colados no player acertam mesmo fora do arco */
const POINT_BLANK = 0.5
/** Inclinação para baixo do arco — sai do orbe no alto e desce na frente */
const PITCH = 0.45
/** Raio interno do arco em fração do alcance */
const INNER_RATIO = 0.35
/** Vagalumes de dígitos soltos por segundo durante a varredura */
const FIREFLY_RATE = 320
/** Comprimento do rastro, em fração do arco */
const TRAIL = 0.55

/** Arco que acende progressivamente do início ao fim com rastro desbotando */
function createSlashMaterial(cfg: SlashConfig, inner: number, outer: number) {
  const start = -Math.PI / 2 - cfg.half
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: AdditiveBlending,
    uniforms: {
      uStart: { value: start },
      uLength: { value: cfg.half * 2 },
      uDir: { value: cfg.dir },
      uHead: { value: 0 },
      uOpacity: { value: 0 },
      uInner: { value: inner },
      uOuter: { value: outer },
    },
    vertexShader: /* glsl */ `
      varying vec2 vPos;
      void main() {
        vPos = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uStart, uLength, uDir, uHead, uOpacity, uInner, uOuter;
      varying vec2 vPos;
      void main() {
        float t = (atan(vPos.y, vPos.x) - uStart) / uLength;
        if (uDir < 0.0) t = 1.0 - t;
        float trail = uHead - t;
        if (trail < 0.0 || trail > ${TRAIL.toFixed(2)}) discard;
        float a = 1.0 - trail / ${TRAIL.toFixed(2)};
        float r = clamp((length(vPos) - uInner) / (uOuter - uInner), 0.0, 1.0);
        float radial = pow(r, 1.6) * smoothstep(1.0, 0.85, r);
        vec3 color = mix(vec3(0.25, 0.6, 1.0), vec3(0.9, 0.97, 1.0), r * a);
        gl_FragColor = vec4(color, a * a * radial * uOpacity);
      }
    `,
  })
}

/**
 * Combo corpo a corpo no Espaço: três cortes de curto alcance alternando
 * o sentido (pra lá, pra cá) e um terceiro golpe largo com mais dano e
 * knockback. Apertos durante um corte ficam guardados e emendam o próximo.
 */
export function MeleeCombo() {
  const [, getKeys] = useKeyboardControls<MovementKey>()
  const riding = useGameStore((s) => s.transition !== null)

  const roots = useRef<(Group | null)[]>([])
  const wasAttack = useRef(false)
  const step = useRef(0)
  const swingTimer = useRef(0)
  const comboTimer = useRef(0)
  const buffered = useRef(-1)
  const ages = useRef(COMBO.map(() => Infinity))
  const meshes = useRef<(Mesh | null)[]>([])
  const emitAcc = useRef(COMBO.map(() => 0))
  const tmp = useMemo(() => new Vector3(), [])

  const slashes = useMemo(
    () =>
      COMBO.map((cfg) => {
        const inner = cfg.range * INNER_RATIO
        const start = -Math.PI / 2 - cfg.half
        return {
          geometry: new RingGeometry(inner, cfg.range, 32, 1, start, cfg.half * 2),
          material: createSlashMaterial(cfg, inner, cfg.range),
        }
      }),
    []
  )

  const swing = (index: number) => {
    const cfg = COMBO[index]
    const { playerPosition, playerDirection } = useGameStore.getState()
    const stats = getEffectiveStats()
    const cosHalf = Math.cos(cfg.half)

    const root = roots.current[index]
    if (root) root.rotation.y = Math.atan2(playerDirection.x, playerDirection.z)
    ages.current[index] = 0
    emitAcc.current[index] = 0
    holdOrbForward(SWING_GAP + COMBO_WINDOW)

    forEachEnemy((e) => {
      const dx = e.position.x - playerPosition.x
      const dz = e.position.z - playerPosition.z
      const dist = Math.sqrt(dx * dx + dz * dz)
      if (dist > cfg.range + e.radius) return
      if (dist > POINT_BLANK && (dx * playerDirection.x + dz * playerDirection.z) / dist < cosHalf)
        return
      const crit = Math.random() < stats.critChance
      e.hit({
        damage: stats.damage * cfg.damage * (crit ? stats.critDamage : 1),
        knockback: cfg.knockback,
        from: playerPosition,
      })
      burstBinary(e.position.x, Math.max(e.position.y, 0.5), e.position.z, crit ? 18 : 10, 2, {
        firefly: true,
        life: 0.6 + Math.random() * 0.5,
      })
    })
  }

  useFrame((_, delta) => {
    const { activeNpc, menuOpen, gameOver, pendingLevelUps, transition } = useGameStore.getState()
    const blocked =
      activeNpc !== null || menuOpen || gameOver || transition !== null || pendingLevelUps > 0

    const attackDown = getKeys().attack === true
    if (attackDown && !wasAttack.current && !blocked) buffered.current = 0
    wasAttack.current = attackDown

    swingTimer.current -= delta
    comboTimer.current -= delta
    if (comboTimer.current <= 0) step.current = 0
    if (buffered.current >= 0) buffered.current += delta
    if (blocked || buffered.current > INPUT_BUFFER) buffered.current = -1

    if (buffered.current >= 0 && swingTimer.current <= 0) {
      buffered.current = -1
      const speed = getEffectiveStats().attackSpeed / BASE_STATS.attackSpeed
      const finisher = step.current === COMBO.length - 1
      swing(step.current)
      swingTimer.current = (finisher ? FINISHER_RECOVERY : SWING_GAP) / speed
      comboTimer.current = swingTimer.current + COMBO_WINDOW
      step.current = (step.current + 1) % COMBO.length
    }

    // ---- Rastro visual: o arco sai do orbe, varre e desbota ----
    slashes.forEach(({ material }, i) => {
      const root = roots.current[i]
      const mesh = meshes.current[i]
      if (!root || !mesh) return
      const age = (ages.current[i] += delta)
      const visible = age < SWING_TIME + FADE_TIME
      root.visible = visible
      if (!visible) return
      root.position.copy(orbPosition)
      // Varredura com ease-out; no fade a cauda continua andando e some
      const p = Math.min(1, age / SWING_TIME)
      const fade = Math.max(0, (age - SWING_TIME) / FADE_TIME)
      const head = 1 - (1 - p) * (1 - p)
      material.uniforms.uHead.value = head + fade * TRAIL
      material.uniforms.uOpacity.value = 1 - fade

      // ---- Vagalumes de 0/1 soltos na ponta do corte ----
      if (age >= SWING_TIME) return
      const cfg = COMBO[i]
      const inner = cfg.range * INNER_RATIO
      root.updateMatrixWorld(true)
      emitAcc.current[i] += FIREFLY_RATE * delta
      while (emitAcc.current[i] >= 1) {
        emitAcc.current[i] -= 1
        // Concentra na cabeça do corte e na borda externa — degradê para dentro/para trás
        const t = Math.max(0, head - Math.random() * Math.random() * 0.35)
        const along = cfg.dir > 0 ? t : 1 - t
        const angle = -Math.PI / 2 - cfg.half + along * cfg.half * 2
        const rn = 0.35 + 0.65 * Math.sqrt(Math.random())
        const r = inner + (cfg.range - inner) * rn
        mesh.localToWorld(tmp.set(Math.cos(angle) * r, Math.sin(angle) * r, 0))
        emitBinary(
          tmp.x,
          tmp.y,
          tmp.z,
          (Math.random() - 0.5) * 0.6,
          0.1 + Math.random() * 0.3,
          (Math.random() - 0.5) * 0.6,
          {
            firefly: true,
            life: 0.7 + Math.random() * 0.8 * rn,
            size: 0.1 + 0.16 * rn * (1 - (head - t)),
          }
        )
      }
    })
  })

  return (
    <group visible={!riding}>
      {slashes.map(({ geometry, material }, i) => (
        <group
          key={i}
          ref={(g) => {
            roots.current[i] = g
          }}
          visible={false}
        >
          <group rotation-x={PITCH}>
            <group rotation-z={COMBO[i].tilt}>
              <mesh
                ref={(m) => {
                  meshes.current[i] = m
                }}
                geometry={geometry}
                material={material}
                rotation-x={-Math.PI / 2}
              />
            </group>
          </group>
        </group>
      ))}
    </group>
  )
}
