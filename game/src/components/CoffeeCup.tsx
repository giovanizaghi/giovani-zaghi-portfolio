import { useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGameStore } from '../store/useGameStore'

interface CoffeeCupProps {
  position: readonly [number, number, number]
}

const PICKUP_RADIUS = 0.9

export function CoffeeCup({ position }: CoffeeCupProps) {
  const [collected, setCollected] = useState(false)
  const [yOffset, setYOffset] = useState(0)

  useFrame((_, delta) => {
    if (collected) return
    setYOffset((prev) => prev + delta * 2.5)
    const playerPos = useGameStore.getState().playerPosition
    const dx = playerPos.x - position[0]
    const dz = playerPos.z - position[2]
    if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
      setCollected(true)
      const store = useGameStore.getState()
      store.addHeart(1)
      store.addStamina(0.4)
    }
  })

  if (collected) return null

  const y = position[1] + Math.sin(yOffset) * 0.08

  return (
    <group position={[position[0], y, position[2]]}>
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
