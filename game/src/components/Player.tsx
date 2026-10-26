import { Component, Suspense, useEffect, useMemo, useRef } from 'react'
import type { ReactNode, RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { useAnimations, useGLTF, useKeyboardControls } from '@react-three/drei'
import { Group, Vector3 } from 'three'
import { useGameStore, getEffectiveStats } from '../store/useGameStore'
import type { MovementKey } from '../App'

/** Modelo base (sem animações) */
export const MODEL_URL =
  '/assets/models/Meshy_AI_Meshy_AI_Blond_Minima_biped_Character_output.glb'

/** GLBs separados contendo um clip de animação cada (mesma rig do modelo base) */
export const ANIMATION_URLS = {
  idle: '/assets/models/Meshy_AI_Meshy_AI_Blond_Minima_biped_Animation_Idle_02_withSkin.glb',
  walk: '/assets/models/Meshy_AI_Meshy_AI_Blond_Minima_biped_Animation_Walking_withSkin.glb',
  run: '/assets/models/Meshy_AI_Meshy_AI_Blond_Minima_biped_Animation_Running_withSkin.glb',
}

const WALK_SPEED = 4
const RUN_SPEED = 7.5
/** Ajuste se o modelo vier grande/pequeno demais */
const MODEL_SCALE = 1
/** Raio do colisor do player */
const PLAYER_RADIUS = 0.35
/** Custo de stamina por segundo ao correr */
const STAMINA_DRAIN = 0.9
/** Recarga de stamina por segundo */
const STAMINA_RECHARGE = 0.4
/** Stamina precisa chegar a este valor para poder correr de novo após esgotar */
const STAMINA_RESUME = 1

interface MovementState {
  moving: boolean
  running: boolean
}

/** Modelo GLB do personagem + animações mescladas de arquivos separados */
function CharacterModel({ movement }: { movement: RefObject<MovementState> }) {
  const group = useRef<Group>(null!)
  const { scene } = useGLTF(MODEL_URL)
  const idle = useGLTF(ANIMATION_URLS.idle)
  const walk = useGLTF(ANIMATION_URLS.walk)
  const run = useGLTF(ANIMATION_URLS.run)

  // Renomeia o primeiro clip de cada arquivo para um nome fixo ('idle' | 'walk' | 'run')
  const animations = useMemo(() => {
    const sources: [typeof idle, string][] = [
      [idle, 'idle'],
      [walk, 'walk'],
      [run, 'run'],
    ]
    return sources.flatMap(([gltf, name]) =>
      gltf.animations.map((clip, i) => {
        clip.name = i === 0 ? name : `${name}_${i}`
        return clip
      })
    )
  }, [idle, walk, run])

  const { actions, names } = useAnimations(animations, group)
  const currentAnim = useRef<string | null>(null)

  useEffect(() => {
    console.log('[Player] Clips de animação disponíveis:', names)
    scene.traverse((obj) => {
      obj.castShadow = true
    })
  }, [names, scene])

  const play = (name: string) => {
    if (currentAnim.current === name || !actions[name]) return
    if (currentAnim.current) actions[currentAnim.current]?.fadeOut(0.2)
    actions[name]?.reset().fadeIn(0.2).play()
    currentAnim.current = name
  }

  useFrame(() => {
    if (movement.current.moving) play(movement.current.running ? 'run' : 'walk')
    else play('idle')
  })

  return (
    <group ref={group}>
      <primitive object={scene} scale={MODEL_SCALE} />
    </group>
  )
}

/** Placeholder exibido enquanto o GLB não existe em public/assets/models/ */
function CharacterPlaceholder() {
  return (
    <group>
      <mesh position={[0, 0.6, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.6, 4, 12]} />
        <meshStandardMaterial color="#e8c170" />
      </mesh>
      <mesh position={[0, 0.75, 0.28]} rotation-x={Math.PI / 2}>
        <coneGeometry args={[0.12, 0.3, 8]} />
        <meshStandardMaterial color="#c9541e" />
      </mesh>
    </group>
  )
}

/** Se o GLB não existir, cai no placeholder em vez de quebrar a cena */
class ModelErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch() {
    console.warn(
      `[Player] Não foi possível carregar o modelo em ${MODEL_URL}. ` +
        'Usando placeholder por enquanto.'
    )
  }
  render() {
    return this.state.failed ? <CharacterPlaceholder /> : this.props.children
  }
}

export function Player() {
  const group = useRef<Group>(null!)
  const movement = useRef<MovementState>({ moving: false, running: false })
  const exhausted = useRef(false)
  const [, getKeys] = useKeyboardControls<MovementKey>()

  // Vetores temporários (evita alocação por frame)
  const tmp = useMemo(
    () => ({ dir: new Vector3(), forward: new Vector3(), right: new Vector3(), up: new Vector3(0, 1, 0), next: new Vector3() }),
    []
  )

  const checkCollision = (position: Vector3) => {
    const colliders = useGameStore.getState().colliders
    for (const c of colliders) {
      const dx = position.x - c.position.x
      const dz = position.z - c.position.z
      const minDist = PLAYER_RADIUS + c.radius
      if (dx * dx + dz * dz < minDist * minDist) return true
    }
    return false
  }

  useFrame((state, delta) => {
    const pos = group.current.position
    const gameStore = useGameStore.getState()

    if (gameStore.pendingSpawn) {
      pos.copy(gameStore.pendingSpawn)
      gameStore.clearPendingSpawn()
    }

    // Anti-stuck: se spawnou dentro de um colisor (save corrompido etc.),
    // empurra pra fora na direção mais próxima da superfície
    for (const c of gameStore.colliders) {
      const dx = pos.x - c.position.x
      const dz = pos.z - c.position.z
      const minDist = PLAYER_RADIUS + c.radius
      const d2 = dx * dx + dz * dz
      if (d2 < minDist * minDist) {
        const d = Math.sqrt(d2)
        if (d < 1e-4) {
          pos.x = c.position.x + minDist
        } else {
          pos.x = c.position.x + (dx / d) * minDist
          pos.z = c.position.z + (dz / d) * minDist
        }
      }
    }

    const inputBlocked =
      gameStore.activeNpc !== null || gameStore.menuOpen || gameStore.gameOver

    const keys = getKeys()
    const inputX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0)
    const inputY = (keys.forward ? 1 : 0) - (keys.back ? 1 : 0)
    const stats = getEffectiveStats()

    if (!inputBlocked && (inputX !== 0 || inputY !== 0)) {
      // Direção relativa à câmera isométrica (projetada no plano XZ)
      state.camera.getWorldDirection(tmp.forward)
      tmp.forward.y = 0
      tmp.forward.normalize()
      tmp.right.crossVectors(tmp.forward, tmp.up)

      tmp.dir
        .set(0, 0, 0)
        .addScaledVector(tmp.forward, inputY)
        .addScaledVector(tmp.right, inputX)
        .normalize()

      if (gameStore.stamina <= 0) exhausted.current = true
      else if (gameStore.stamina >= STAMINA_RESUME) exhausted.current = false
      const wantsToRun = keys.run === true && !exhausted.current
      if (wantsToRun) {
        gameStore.consumeStamina(STAMINA_DRAIN * delta)
      } else {
        gameStore.addStamina(STAMINA_RECHARGE * stats.staminaRegen * delta)
      }
      movement.current.running = wantsToRun
      const speed =
        (movement.current.running ? RUN_SPEED : WALK_SPEED) * stats.moveSpeed * delta

      // Verifica colisão eixo a eixo para permitir deslizar nas paredes
      tmp.next.set(pos.x + tmp.dir.x * speed, 0, pos.z)
      if (!checkCollision(tmp.next)) pos.x = tmp.next.x

      tmp.next.set(pos.x, 0, pos.z + tmp.dir.z * speed)
      if (!checkCollision(tmp.next)) pos.z = tmp.next.z

      // Rotação suave do modelo na direção do movimento
      const targetAngle = Math.atan2(tmp.dir.x, tmp.dir.z)
      const diff =
        ((targetAngle - group.current.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI
      group.current.rotation.y += diff * Math.min(1, delta * 12)

      movement.current.moving = true
    } else {
      movement.current.moving = false
      movement.current.running = false
      useGameStore.getState().addStamina(STAMINA_RECHARGE * stats.staminaRegen * delta)
    }

    // Compartilha posição, direção e nível de ruído — sem re-render
    useGameStore
      .getState()
      .setPlayerNoise(movement.current.running, movement.current.moving)
    useGameStore.getState().playerPosition.copy(pos)
    useGameStore
      .getState()
      .playerDirection.set(Math.sin(group.current.rotation.y), 0, Math.cos(group.current.rotation.y))
  })

  return (
    <group ref={group} position={[4.5, 0, 8.5]}>
      <ModelErrorBoundary>
        <Suspense fallback={<CharacterPlaceholder />}>
          <CharacterModel movement={movement} />
        </Suspense>
      </ModelErrorBoundary>
    </group>
  )
}

useGLTF.preload(MODEL_URL)
useGLTF.preload(ANIMATION_URLS.idle)
useGLTF.preload(ANIMATION_URLS.walk)
useGLTF.preload(ANIMATION_URLS.run)
