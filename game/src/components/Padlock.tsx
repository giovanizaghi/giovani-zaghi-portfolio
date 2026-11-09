import type { KeyColor } from '../data/keys'
import { KEY_COLORS } from '../data/keys'

interface PadlockProps {
  /** Base do cadeado no centro (y = onde ele "apóia") */
  position: readonly [number, number, number]
  /** Cor da trava — aceita KeyColor ou hex direto */
  color: KeyColor | string
  scale?: number
  /** Rotação euler — use [0, Math.PI, 0] para a face oposta */
  rotation?: readonly [number, number, number]
}

function resolveColor(color: KeyColor | string): string {
  return color === 'silver' || color === 'gold' ? KEY_COLORS[color].color : color
}

/** Cadeado grande montado de primitivas (corpo + argola + fechadura) — puramente visual */
export function Padlock({ position, color, scale = 1, rotation = [0, 0, 0] }: PadlockProps) {
  const metal = resolveColor(color)
  return (
    <group
      position={[position[0], position[1], position[2]]}
      scale={scale}
      rotation={[rotation[0], rotation[1], rotation[2]]}
    >
      {/* argola (meio toro com a abertura para baixo) */}
      <mesh position={[0, 0.38, 0]}>
        <torusGeometry args={[0.15, 0.045, 8, 20, Math.PI]} />
        <meshStandardMaterial
          color={metal}
          metalness={0.75}
          roughness={0.3}
          emissive={metal}
          emissiveIntensity={0.25}
        />
      </mesh>
      {/* corpo */}
      <mesh position={[0, 0.2, 0]} castShadow>
        <boxGeometry args={[0.44, 0.4, 0.26]} />
        <meshStandardMaterial
          color={metal}
          metalness={0.75}
          roughness={0.3}
          emissive={metal}
          emissiveIntensity={0.25}
        />
      </mesh>
      {/* fechadura escura na face da frente */}
      <mesh position={[0, 0.2, 0.135]}>
        <boxGeometry args={[0.07, 0.14, 0.02]} />
        <meshStandardMaterial color="#191920" roughness={0.9} />
      </mesh>
    </group>
  )
}
