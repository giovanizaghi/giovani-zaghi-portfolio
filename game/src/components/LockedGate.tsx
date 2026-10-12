import { useGameStore } from '../store/useGameStore'

interface LockedGateProps {
  position: readonly [number, number, number]
  /** Identificador da skill que abre o portão. */
  skill: string
  color: string
  /** Dimensões [largura, altura, profundidade] do portão. */
  size?: readonly [number, number, number]
}

export function LockedGate({ position, skill, color, size = [1.2, 2.4, 0.25] }: LockedGateProps) {
  const hasSkill = useGameStore((s) => s.skills.includes(skill))

  if (hasSkill) return null

  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={size} />
        <meshBasicMaterial color={color} transparent opacity={0.92} />
      </mesh>
      <mesh position={[0, size[1] * 0.35, 0.02]}>
        <boxGeometry args={[size[0] * 0.35, size[0] * 0.35, 0.05]} />
        <meshBasicMaterial color="#fff4d6" />
      </mesh>
    </group>
  )
}
