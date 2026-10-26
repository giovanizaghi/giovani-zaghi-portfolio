import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Mesh } from 'three'
import { useGameStore } from '../store/useGameStore'
import { burstBinary } from '../fx/particles'

const PICKUP_RADIUS = 0.9
const COIN_VALUE = 5

interface CoinProps {
  position: readonly [number, number, number]
  value?: number
}

/** Moeda giratória coletável — usada para comprar mais slots do hotbar */
export function Coin({ position, value = COIN_VALUE }: CoinProps) {
  // Id estável por posição — a moeda não volta após coletada (save de mundo)
  const id = `coin:${position[0]},${position[2]}`
  const consumed = useGameStore((s) => s.consumedEntities[id] === true)
  const mesh = useRef<Mesh>(null!)
  const angle = useRef(Math.random() * Math.PI * 2)

  useFrame((_, delta) => {
    if (consumed || !mesh.current) return
    angle.current += delta * 3
    mesh.current.rotation.y = angle.current
    mesh.current.position.y = position[1] + Math.sin(angle.current * 0.8) * 0.06

    const { playerPosition, addCoins, consumeEntity } = useGameStore.getState()
    const dx = playerPosition.x - position[0]
    const dz = playerPosition.z - position[2]
    if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
      consumeEntity(id)
      addCoins(value)
      burstBinary(position[0], position[1], position[2], 8, 1.5, { size: 0.2 })
    }
  })

  if (consumed) return null

  return (
    <mesh
      ref={mesh}
      position={[position[0], position[1], position[2]]}
      rotation-z={Math.PI / 2}
      castShadow
    >
      <cylinderGeometry args={[0.16, 0.16, 0.05, 16]} />
      <meshStandardMaterial color="#f5c542" emissive="#c98a1b" emissiveIntensity={0.5} />
    </mesh>
  )
}
