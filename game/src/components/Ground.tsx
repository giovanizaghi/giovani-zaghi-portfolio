import { useEffect } from 'react'
import { Vector3 } from 'three'
import { useGameStore } from '../store/useGameStore'

const blocks = [
  { pos: [4, 0.5, -3] as const, size: 1, color: '#8a6f4d' },
  { pos: [-5, 0.75, 2] as const, size: 1.5, color: '#7a6250' },
  { pos: [2, 0.4, 5] as const, size: 0.8, color: '#8a6f4d' },
]

/** Chão do mapa: plano + grid + blocos decorativos com colisão */
export function Ground() {
  useEffect(() => {
    const { registerCollider, unregisterCollider } = useGameStore.getState()
    blocks.forEach((b, i) => {
      registerCollider({
        id: `ground-block-${i}`,
        position: new Vector3(b.pos[0], 0, b.pos[2]),
        radius: b.size * 0.55,
      })
    })
    return () => {
      blocks.forEach((_, i) => unregisterCollider(`ground-block-${i}`))
    }
  }, [])

  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} receiveShadow>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#3a5f4a" />
      </mesh>
      <gridHelper args={[40, 40, '#527a63', '#2c4a3a']} position={[0, 0.01, 0]} />

      {blocks.map((b, i) => (
        <mesh key={i} position={b.pos} castShadow receiveShadow>
          <boxGeometry args={[b.size, b.size, b.size]} />
          <meshStandardMaterial color={b.color} />
        </mesh>
      ))}
    </group>
  )
}
