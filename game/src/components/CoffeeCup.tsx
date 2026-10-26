import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { useGameStore } from '../store/useGameStore'

interface CoffeeCupProps {
  position: readonly [number, number, number]
}

const PICKUP_RADIUS = 0.9

export function CoffeeCup({ position }: CoffeeCupProps) {
  // Id estável por posição — o café não volta após coletado (save de mundo)
  const id = `coffee:${position[0]},${position[2]}`
  const consumed = useGameStore((s) => s.consumedEntities[id] === true)
  const group = useRef<Group>(null!)
  const angle = useRef(Math.random() * Math.PI * 2)

  useFrame((_, delta) => {
    if (consumed || !group.current) return
    angle.current += delta * 2.5
    group.current.position.y = position[1] + Math.sin(angle.current) * 0.08

    const store = useGameStore.getState()
    const dx = store.playerPosition.x - position[0]
    const dz = store.playerPosition.z - position[2]
    if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
      store.consumeEntity(id)
      store.addHeart(1)
      store.addStamina(0.4)
    }
  })

  if (consumed) return null

  return (
    <group ref={group} position={[position[0], position[1], position[2]]}>
      <mesh rotation-x={Math.PI * 0.5}>
        <cylinderGeometry args={[0.18, 0.18, 0.32, 12]} />
        <meshBasicMaterial color="#5c4033" />
      </mesh>
      <mesh position={[0.18, 0, 0]} rotation-z={Math.PI * 0.5}>
        <torusGeometry args={[0.1, 0.03, 8, 16]} />
        <meshBasicMaterial color="#5c4033" />
      </mesh>
      <mesh position={[0, -0.03, 0]} rotation-x={Math.PI * 0.5}>
        <cylinderGeometry args={[0.15, 0.15, 0.02, 12]} />
        <meshBasicMaterial color="#3e2b1f" />
      </mesh>
    </group>
  )
}
