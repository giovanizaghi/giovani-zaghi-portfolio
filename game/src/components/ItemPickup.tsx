import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Group } from 'three'
import { useGameStore } from '../store/useGameStore'
import { ITEMS } from '../data/items'
import type { ItemId } from '../data/items'
import { burstBinary } from '../fx/particles'

const PICKUP_RADIUS = 0.9

interface ItemPickupProps {
  position: readonly [number, number, number]
  item: ItemId
}

const ITEM_DEFS = Object.fromEntries(ITEMS.map((i) => [i.id, i]))

/**
 * Item coletável flutuando no mundo. Só é coletado se houver espaço no
 * inventário (slotLimit); se estiver cheio, fica no lugar.
 */
export function ItemPickup({ position, item }: ItemPickupProps) {
  // Id estável por posição — o pickup não volta após coletado (save de mundo)
  const id = `pickup:${item}:${position[0]},${position[2]}`
  const consumed = useGameStore((s) => s.consumedEntities[id] === true)
  const group = useRef<Group>(null!)
  const angle = useRef(Math.random() * Math.PI * 2)
  const def = ITEM_DEFS[item]

  useFrame((_, delta) => {
    if (consumed || !group.current) return
    angle.current += delta * 1.8
    group.current.rotation.y = angle.current
    group.current.position.y = position[1] + Math.sin(angle.current * 1.4) * 0.08

    const { playerPosition, collectItem, consumeEntity } = useGameStore.getState()
    const dx = playerPosition.x - position[0]
    const dz = playerPosition.z - position[2]
    if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS && collectItem(item, 1) > 0) {
      consumeEntity(id)
      burstBinary(position[0], position[1], position[2], 12, 1.8, { size: 0.24 })
    }
  })

  const color = def.color

  if (consumed) return null

  return (
    <group ref={group} position={[position[0], position[1], position[2]]}>
      <mesh castShadow>
        <octahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.7} />
      </mesh>
      <Html position={[0, 0.55, 0]} center distanceFactor={12} zIndexRange={[10, 0]}>
        <div className="item-pickup-label" style={{ borderColor: color }}>
          {def.symbol}
        </div>
      </Html>
    </group>
  )
}
