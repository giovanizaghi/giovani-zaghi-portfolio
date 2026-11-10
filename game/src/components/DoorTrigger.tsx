import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useGameStore } from '../store/useGameStore'
import { isEditMode } from '../store/editMode'
import type { DoorTarget } from '../store/useGameStore'
import type { KeyColor } from '../data/keys'
import type { Vec3 } from '../data/world'
import { Padlock } from './Padlock'

interface DoorTriggerProps {
  /** Id da entidade — chave do unlockedDoors e identidade do alvo */
  id: string
  /** Centro do gatilho no chão */
  x: number
  z: number
  /** Raio de interação (o anel desenhado é radius - 0.07 .. radius) */
  radius: number
  label: string
  toScene: string
  toSpawn: Vec3
  /** Trava por chave — o primeiro E consome a chave e abre */
  lock?: KeyColor
  /** Posição do cadeado solto — renderizado enquanto a porta estiver trancada */
  padlock?: Vec3
}

/**
 * Porta sem painel físico: só o anel de interação no chão. Proximidade
 * edge-detected preenche `interactDoor` (mesmo padrão do SideTrigger do
 * LockedDoor — limpa só se o hint atual for o desta porta) e E/clique chama
 * `interactWithDoor`, então travas por chave funcionam igual.
 */
export function DoorTrigger({
  id,
  x,
  z,
  radius,
  label,
  toScene,
  toSpawn,
  lock,
  padlock,
}: DoorTriggerProps) {
  const wasNear = useRef(false)
  const pos = useMemo(() => new Vector3(x, 0, z), [x, z])
  const unlocked = useGameStore((s) => s.unlockedDoors[id] === true)

  const target = useMemo<DoorTarget>(() => {
    const door: DoorTarget = {
      label,
      scene: toScene,
      spawn: [toSpawn[0], toSpawn[1], toSpawn[2]],
    }
    if (lock) {
      door.lock = {
        id,
        color: lock,
        // Posição do cadeado para o burst de FX — y + 0.3 como no HouseExterior
        position: padlock
          ? [padlock[0], padlock[1] + 0.3, padlock[2]]
          : [x, 1.4, z],
      }
    }
    return door
  }, [id, label, toScene, toSpawn, lock, padlock, x, z])

  useFrame(() => {
    if (isEditMode()) return // preview do editor: congelado
    const { playerPosition, setInteractDoor, interactDoor } = useGameStore.getState()
    const near = playerPosition.distanceTo(pos) < radius
    if (near !== wasNear.current) {
      wasNear.current = near
      if (near) {
        setInteractDoor(target)
      } else if (interactDoor === target) {
        // Só limpa se o hint atual for desta porta — outra pode ter assumido
        setInteractDoor(null)
      }
    }
  })

  // Se a porta desmontar com o hint apontando para ela (troca de cena etc.), limpa
  useEffect(() => {
    return () => {
      const { interactDoor, setInteractDoor } = useGameStore.getState()
      if (interactDoor === target) setInteractDoor(null)
    }
  }, [target])

  const tryEnter = () => {
    if (isEditMode()) return // preview do editor: sem interação
    const { playerPosition, interactWithDoor } = useGameStore.getState()
    const dx = playerPosition.x - x
    const dz = playerPosition.z - z
    if (dx * dx + dz * dz < radius * radius) {
      interactWithDoor(target)
    }
  }

  return (
    <group>
      {/* Anel de interação no chão */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[x, 0.03, z]}
        onClick={tryEnter}
      >
        <ringGeometry args={[radius - 0.07, radius, 32]} />
        <meshBasicMaterial color="#e8c170" transparent opacity={0.35} />
      </mesh>

      {/* Cadeado solto enquanto a porta estiver trancada */}
      {lock && padlock && !unlocked && (
        <Padlock position={padlock} color={lock} scale={1.1} />
      )}
    </group>
  )
}
