import { useMemo } from 'react'
import { Shape, ShapeGeometry } from 'three'

/** Medidas do modelo da casa — footprint 16x12 centrado na origem local */
const DOOR_X = 4.5
const DOOR_Z = 6

interface HouseModelProps {
  /** Posição do centro da casa no mundo */
  x: number
  z: number
  rotY?: number
}

/**
 * Casa vista de fora: corpo de alvenaria + telhado de duas águas + frontões +
 * chaminé + porta/janelas. Versão extraída do antigo HouseExterior — a
 * decoração do quintal (gramado, passarela, chave, cadeado, anel) virou
 * entidades próprias no JSON do mundo, e os colliders do perímetro são
 * calculados por computeSceneColliders.
 */
export function HouseModel({ x, z, rotY = 0 }: HouseModelProps) {
  // Triângulo do frontão (empena) do telhado
  const gable = useMemo(
    () =>
      new ShapeGeometry(
        new Shape().moveTo(-8, 0).lineTo(8, 0).lineTo(0, 2)
      ),
    []
  )

  return (
    <group position={[x, 0, z]} rotation-y={rotY}>
      {/* Corpo da casa */}
      <mesh position={[0, 1.2, 0]} castShadow receiveShadow>
        <boxGeometry args={[16, 2.4, 12]} />
        <meshStandardMaterial color="#e6d7b8" />
      </mesh>

      {/* Telhado de duas águas */}
      <mesh position={[0, 3.2, -3.6]} rotation-x={0.32} castShadow>
        <boxGeometry args={[17, 0.3, 7.6]} />
        <meshStandardMaterial color="#b4552e" />
      </mesh>
      <mesh position={[0, 3.2, 3.6]} rotation-x={-0.32} castShadow>
        <boxGeometry args={[17, 0.3, 7.6]} />
        <meshStandardMaterial color="#b4552e" />
      </mesh>

      {/* Frontões (triângulos nas laterais do telhado) */}
      <mesh geometry={gable} position={[0, 2.4, 6.01]} />
      <mesh geometry={gable} position={[0, 2.4, -6.01]} rotation-y={Math.PI} />

      {/* Chaminé */}
      <mesh position={[-4, 4.6, 0]} castShadow>
        <boxGeometry args={[1.1, 1.8, 1.1]} />
        <meshStandardMaterial color="#8a6f4d" />
      </mesh>

      {/* Porta + batente + maçaneta + degrau — a interação é pelo anel (DoorTrigger) */}
      <mesh position={[DOOR_X, 1.1, DOOR_Z + 0.02]} castShadow>
        <boxGeometry args={[1.7, 2.2, 0.18]} />
        <meshStandardMaterial color="#5c4033" />
      </mesh>
      <mesh position={[DOOR_X, 2.32, DOOR_Z + 0.05]}>
        <boxGeometry args={[2.1, 0.24, 0.24]} />
        <meshStandardMaterial color="#c9b391" />
      </mesh>
      <mesh position={[DOOR_X, 1.1, DOOR_Z + 0.14]}>
        <sphereGeometry args={[0.07, 8, 8]} />
        <meshStandardMaterial color="#e8c170" />
      </mesh>
      <mesh position={[DOOR_X, 0.07, DOOR_Z + 0.7]} receiveShadow>
        <boxGeometry args={[2.4, 0.14, 1.2]} />
        <meshStandardMaterial color="#9a8a72" />
      </mesh>

      {/* Janelas */}
      <mesh position={[-4, 1.5, DOOR_Z + 0.02]}>
        <boxGeometry args={[2, 1.3, 0.15]} />
        <meshStandardMaterial color="#9fc5d5" />
      </mesh>
      <mesh position={[0.5, 1.5, DOOR_Z + 0.02]}>
        <boxGeometry args={[2, 1.3, 0.15]} />
        <meshStandardMaterial color="#9fc5d5" />
      </mesh>
      <mesh position={[8.02, 1.5, -1]}>
        <boxGeometry args={[0.15, 1.3, 2]} />
        <meshStandardMaterial color="#9fc5d5" />
      </mesh>
    </group>
  )
}
