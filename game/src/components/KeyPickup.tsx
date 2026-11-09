import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { useGameStore } from '../store/useGameStore'
import { KEY_COLORS } from '../data/keys'
import type { KeyColor } from '../data/keys'
import { burstBinary } from '../fx/particles'

const PICKUP_RADIUS = 0.9

interface KeyPickupProps {
  position: readonly [number, number, number]
  color: KeyColor
}

/**
 * Chave coletável flutuando no mundo (argola + haste + dentes).
 * Sempre coletável — não usa slotLimit. O id `key:` faz o pickup
 * sobreviver à Lua de Sangue para não gerar chave infinita.
 */
export function KeyPickup({ position, color }: KeyPickupProps) {
  // Id estável por cor+posição — a chave não volta após coletada
  const id = `key:${color}:${position[0]},${position[2]}`
  const consumed = useGameStore((s) => s.consumedEntities[id] === true)
  const group = useRef<Group>(null!)
  const angle = useRef(Math.random() * Math.PI * 2)
  const keyColor = KEY_COLORS[color].color

  useFrame((_, delta) => {
    if (consumed || !group.current) return
    angle.current += delta * 1.8
    group.current.rotation.y = angle.current
    group.current.position.y = position[1] + Math.sin(angle.current * 1.4) * 0.08

    const { playerPosition, collectKey, consumeEntity } = useGameStore.getState()
    const dx = playerPosition.x - position[0]
    const dz = playerPosition.z - position[2]
    if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
      consumeEntity(id)
      collectKey(color)
      burstBinary(position[0], position[1], position[2], 12, 1.8, { size: 0.24 })
    }
  })

  if (consumed) return null

  const metal = (
    <meshStandardMaterial
      color={keyColor}
      metalness={0.85}
      roughness={0.25}
      emissive={keyColor}
      emissiveIntensity={0.4}
    />
  )

  return (
    <group ref={group} position={[position[0], position[1], position[2]]}>
      {/* argola */}
      <mesh position={[-0.17, 0, 0]} castShadow>
        <torusGeometry args={[0.11, 0.035, 8, 20]} />
        {metal}
      </mesh>
      {/* haste */}
      <mesh position={[0.1, 0, 0]} castShadow>
        <boxGeometry args={[0.36, 0.055, 0.05]} />
        {metal}
      </mesh>
      {/* dentes na ponta */}
      <mesh position={[0.22, -0.07, 0]} castShadow>
        <boxGeometry args={[0.05, 0.11, 0.05]} />
        {metal}
      </mesh>
      <mesh position={[0.13, -0.055, 0]} castShadow>
        <boxGeometry args={[0.05, 0.08, 0.05]} />
        {metal}
      </mesh>
    </group>
  )
}
