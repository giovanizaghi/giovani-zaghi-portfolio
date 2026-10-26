import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Shape, ShapeGeometry, Vector3 } from 'three'
import { useGameStore } from '../store/useGameStore'

/** Footprint da casa (16x12 centrada na origem) — a porta fica na parede sul */
const DOOR_X = 4.5
const DOOR_Z = 6
const DOOR_INTERACT_RADIUS = 1.6

/** Casa vista de fora: caixa de alvenaria + telhado de duas águas + porta/janelas */
export function HouseExterior() {
  const wasNear = useRef(false)
  const doorPos = useMemo(() => new Vector3(DOOR_X, 0, DOOR_Z + 0.9), [])

  // Triângulo do frontão (empena) do telhado
  const gable = useMemo(
    () =>
      new ShapeGeometry(
        new Shape().moveTo(-8, 0).lineTo(8, 0).lineTo(0, 2)
      ),
    []
  )

  // Colisores no perímetro todo da casa (a porta é fechada — entrada via E)
  useEffect(() => {
    const { registerCollider, unregisterCollider } = useGameStore.getState()
    const ids: string[] = []
    for (let x = -8; x <= 8; x += 0.6) {
      ids.push(`house-n-${x}`, `house-s-${x}`)
      registerCollider({ id: `house-n-${x}`, position: new Vector3(x, 0, -6), radius: 0.35 })
      registerCollider({ id: `house-s-${x}`, position: new Vector3(x, 0, 6), radius: 0.35 })
    }
    for (let z = -6; z <= 6; z += 0.6) {
      ids.push(`house-w-${z}`, `house-e-${z}`)
      registerCollider({ id: `house-w-${z}`, position: new Vector3(-8, 0, z), radius: 0.35 })
      registerCollider({ id: `house-e-${z}`, position: new Vector3(8, 0, z), radius: 0.35 })
    }
    return () => ids.forEach(unregisterCollider)
  }, [])

  useFrame(() => {
    const { playerPosition, setInteractDoor } = useGameStore.getState()
    const near = playerPosition.distanceTo(doorPos) < DOOR_INTERACT_RADIUS
    if (near !== wasNear.current) {
      wasNear.current = near
      setInteractDoor(
        near
          ? { label: 'Entrar na casa', scene: 'house', spawn: [DOOR_X, 0, 4.2] }
          : null
      )
    }
  })

  const tryEnter = () => {
    const { playerPosition, enterScene } = useGameStore.getState()
    if (playerPosition.distanceTo(doorPos) < DOOR_INTERACT_RADIUS) {
      enterScene('house', [DOOR_X, 0, 4.2])
    }
  }

  return (
    <group>
      {/* Gramado do quintal + passarela até a porta */}
      <mesh position={[0, -0.16, 12]} receiveShadow>
        <boxGeometry args={[30, 0.2, 12]} />
        <meshBasicMaterial color="#496948" />
      </mesh>
      <mesh position={[4.2, -0.05, 8.7]} rotation-y={-0.18} receiveShadow>
        <boxGeometry args={[2.2, 0.12, 6]} />
        <meshBasicMaterial color="#c6aa7b" />
      </mesh>

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

      {/* Porta + batente + degrau — clicável quando perto */}
      <mesh position={[DOOR_X, 1.1, DOOR_Z + 0.02]} onClick={tryEnter} castShadow>
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

      {/* Anel de interação da porta */}
      <mesh rotation-x={-Math.PI / 2} position={[DOOR_X, 0.03, DOOR_Z + 0.9]}>
        <ringGeometry args={[DOOR_INTERACT_RADIUS - 0.07, DOOR_INTERACT_RADIUS, 32]} />
        <meshBasicMaterial color="#e8c170" transparent opacity={0.35} />
      </mesh>
    </group>
  )
}
