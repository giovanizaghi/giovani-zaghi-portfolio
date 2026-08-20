import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Vector3 } from 'three'
import { useGameStore } from '../store/useGameStore'
import { dialogues } from '../data/dialogues'

const INTERACT_RADIUS = 1.8
const NPC_COLLIDER_RADIUS = 0.45

interface NpcProps {
  position: readonly [number, number, number]
  /** Id do diálogo em src/data/dialogues.ts */
  dialogueId: string
  color?: string
}

export function Npc({ position, dialogueId, color = '#b5651d' }: NpcProps) {
  const wasNear = useRef(false)
  const npcPos = useMemo(() => new Vector3(...position), [position])
  const name = dialogues[dialogueId]?.name ?? dialogueId

  useEffect(() => {
    const { registerCollider, unregisterCollider } = useGameStore.getState()
    registerCollider({
      id: `npc-${dialogueId}`,
      position: npcPos,
      radius: NPC_COLLIDER_RADIUS,
    })
    return () => unregisterCollider(`npc-${dialogueId}`)
  }, [dialogueId, npcPos])

  useFrame(() => {
    const { playerPosition, activeNpc, setInteractTarget } = useGameStore.getState()
    const near = playerPosition.distanceTo(npcPos) < INTERACT_RADIUS
    if (near !== wasNear.current) {
      wasNear.current = near
      setInteractTarget(near ? dialogueId : activeNpc === dialogueId ? dialogueId : null)
    }
  })

  return (
    <group position={position}>
      {/* Corpo placeholder — troque por um GLB se quiser */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <capsuleGeometry args={[0.3, 0.6, 4, 12]} />
        <meshStandardMaterial color={color} />
      </mesh>

      {/* Anel de alcance de interação */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.02, 0]}>
        <ringGeometry args={[INTERACT_RADIUS - 0.06, INTERACT_RADIUS, 32]} />
        <meshBasicMaterial color="#e8c170" transparent opacity={0.35} />
      </mesh>

      <Html position={[0, 1.6, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
        <div className="npc-label">{name}</div>
      </Html>
    </group>
  )
}
