import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Vector3 } from 'three'
import { useGameStore } from '../store/useGameStore'
import { isEditMode } from '../store/editMode'
import type { DoorTarget } from '../store/useGameStore'
import type { KeyColor } from '../data/keys'
import type { Vec3 } from '../data/world'
import { Padlock } from './Padlock'

const DOOR_HEIGHT = 2.2
const DOOR_THICKNESS = 0.18
/** Distância do centro da porta até o trigger de interação de cada lado */
const TRIGGER_DISTANCE = 1.0
const TRIGGER_RADIUS = 1.2
const COLLIDER_RADIUS = 0.28
const COLLIDER_SPACING = 0.55

interface LockedDoorProps {
  /** Id único — chave do unlockedDoors e prefixo dos colliders */
  id: string
  /** Cor da chave que destranca; sem lock a porta é sempre normal */
  lock?: KeyColor
  /** Centro da porta no chão */
  position: readonly [number, number, number]
  /** 0 = painel no eixo X (passagem em Z); π/2 = painel no eixo Z (passagem em X) */
  rotationY?: number
  /** Largura do vão (e do painel) */
  width?: number
  /** Rótulo base ao passar — labelFront/labelBack sobrescrevem por lado */
  label: string
  labelFront?: string
  labelBack?: string
  /** Destino em OUTRA cena — quando presentes, os dois lados usam esse alvo
   *  em vez do lado oposto da mesma porta (ex.: porta com painel que muda de cena) */
  toScene?: string
  toSpawn?: Vec3
}

/** Trigger de proximidade de um lado da porta — edge-detection igual às portas de cena */
function SideTrigger({
  target,
  position,
}: {
  target: DoorTarget
  position: readonly [number, number, number]
}) {
  const wasNear = useRef(false)
  const pos = useMemo(
    () => new Vector3(position[0], position[1], position[2]),
    [position]
  )

  useFrame(() => {
    if (isEditMode()) return // preview do editor: congelado
    const { playerPosition, setInteractDoor, interactDoor } = useGameStore.getState()
    const near = playerPosition.distanceTo(pos) < TRIGGER_RADIUS
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

  return null
}

/**
 * Porta genérica dentro da mesma cena: painel sempre fechado (com batente),
 * cadeados nas duas faces enquanto trancada e passagem por E/clique que
 * teleporta para o lado oposto. Com `lock`, o primeiro E consome a chave.
 */
export function LockedDoor({
  id,
  lock,
  position,
  rotationY = 0,
  width = 1.6,
  label,
  labelFront,
  labelBack,
  toScene,
  toSpawn,
}: LockedDoorProps) {
  const unlocked = useGameStore((s) => s.unlockedDoors[id] === true)
  const scene = useGameStore((s) => s.scene)
  const [px, py, pz] = position

  // Alvos dos dois lados: trigger a TRIGGER_DISTANCE, spawn no lado oposto,
  // lock.position = posição do cadeado naquela face (para o burst de FX)
  const sides = useMemo(() => {
    const cos = Math.cos(rotationY)
    const sin = Math.sin(rotationY)
    const toWorld = (lx: number, lz: number): [number, number, number] => [
      px + lx * cos + lz * sin,
      py,
      pz - lx * sin + lz * cos,
    ]
    const build = (side: 1 | -1) => {
      const trigger = toWorld(0, side * TRIGGER_DISTANCE)
      const spawn = toWorld(0, -side * TRIGGER_DISTANCE)
      const padlock = toWorld(0, side * (DOOR_THICKNESS / 2 + 0.08))
      const target: DoorTarget = {
        label: side > 0 ? (labelFront ?? label) : (labelBack ?? label),
        scene: toScene ?? scene,
        spawn: toSpawn ? [toSpawn[0], toSpawn[1], toSpawn[2]] : spawn,
        ...(lock
          ? {
              lock: {
                id,
                color: lock,
                position: [padlock[0], padlock[1] + 1.35, padlock[2]] as [
                  number,
                  number,
                  number,
                ],
              },
            }
          : {}),
      }
      return { target, trigger }
    }
    return { front: build(1), back: build(-1) }
  }, [px, py, pz, rotationY, scene, lock, id, label, labelFront, labelBack, toScene, toSpawn])

  // A porta está sempre fechada — colliders cobrem o vão inteiro
  useEffect(() => {
    const cos = Math.cos(rotationY)
    const sin = Math.sin(rotationY)
    const count = Math.max(1, Math.ceil(width / COLLIDER_SPACING))
    const colliders = Array.from({ length: count + 1 }, (_, i) => {
      const lx = -width / 2 + (i / count) * width
      return {
        id: `${id}-col-${i}`,
        position: new Vector3(px + lx * cos, 0, pz - lx * sin),
        radius: COLLIDER_RADIUS,
      }
    })
    const { registerCollider, unregisterCollider } = useGameStore.getState()
    colliders.forEach(registerCollider)
    return () => colliders.forEach((c) => unregisterCollider(c.id))
  }, [id, px, pz, rotationY, width])

  // Se a porta desmontar com o hint apontando para ela (reset de mundo etc.), limpa
  const frontTarget = sides.front.target
  const backTarget = sides.back.target
  useEffect(() => {
    return () => {
      const { interactDoor, setInteractDoor } = useGameStore.getState()
      if (interactDoor === frontTarget || interactDoor === backTarget) {
        setInteractDoor(null)
      }
    }
  }, [frontTarget, backTarget])

  const tryPass = () => {
    if (isEditMode()) return // preview do editor: sem interação
    const { playerPosition, interactWithDoor } = useGameStore.getState()
    const dx = playerPosition.x - px
    const dz = playerPosition.z - pz
    // Z no espaço local da porta decide de que lado o player está
    const localZ = dx * Math.sin(rotationY) + dz * Math.cos(rotationY)
    const side = localZ >= 0 ? sides.front : sides.back
    const [tx, , tz] = side.trigger
    const ddx = playerPosition.x - tx
    const ddz = playerPosition.z - tz
    if (ddx * ddx + ddz * ddz < TRIGGER_RADIUS * TRIGGER_RADIUS) {
      interactWithDoor(side.target)
    }
  }

  return (
    <group position={[px, py, pz]} rotation-y={rotationY}>
      {/* batente: dois pilares e verga */}
      <mesh position={[-(width / 2 + 0.09), DOOR_HEIGHT / 2, 0]} castShadow>
        <boxGeometry args={[0.18, DOOR_HEIGHT, DOOR_THICKNESS + 0.14]} />
        <meshStandardMaterial color="#4a3524" />
      </mesh>
      <mesh position={[width / 2 + 0.09, DOOR_HEIGHT / 2, 0]} castShadow>
        <boxGeometry args={[0.18, DOOR_HEIGHT, DOOR_THICKNESS + 0.14]} />
        <meshStandardMaterial color="#4a3524" />
      </mesh>
      <mesh position={[0, DOOR_HEIGHT + 0.09, 0]} castShadow>
        <boxGeometry args={[width + 0.36, 0.18, DOOR_THICKNESS + 0.14]} />
        <meshStandardMaterial color="#4a3524" />
      </mesh>

      {/* painel — sempre fechado; a passagem é por E/clique (teleporte) */}
      <mesh
        position={[0, DOOR_HEIGHT / 2, 0]}
        onClick={tryPass}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[width, DOOR_HEIGHT, DOOR_THICKNESS]} />
        <meshStandardMaterial color="#5c4033" />
      </mesh>

      {/* cadeados nas duas faces enquanto a porta estiver trancada */}
      {lock && !unlocked && (
        <>
          <Padlock
            position={[0, 1.15, DOOR_THICKNESS / 2 + 0.07]}
            color={lock}
            scale={0.7}
          />
          <Padlock
            position={[0, 1.15, -(DOOR_THICKNESS / 2 + 0.07)]}
            color={lock}
            scale={0.7}
            rotation={[0, Math.PI, 0]}
          />
        </>
      )}

      <SideTrigger target={sides.front.target} position={sides.front.trigger} />
      <SideTrigger target={sides.back.target} position={sides.back.trigger} />
    </group>
  )
}
