import { Html } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Vector3 } from 'three'
import { useGameStore } from '../store/useGameStore'

type Block = {
  position: [number, number, number]
  size: [number, number, number]
  color: string
}

const walls: Block[] = [
  { position: [0, 0.2, -6], size: [16, 0.4, 0.3], color: '#d9c7a5' },
  { position: [-8, 0.2, 0], size: [0.3, 0.4, 12], color: '#d9c7a5' },
  { position: [8, 0.2, 0], size: [0.3, 0.4, 12], color: '#d9c7a5' },
  { position: [-2.5, 0.2, 6], size: [11, 0.4, 0.3], color: '#d9c7a5' },
  { position: [7, 0.2, 6], size: [2, 0.4, 0.3], color: '#d9c7a5' },
  { position: [-2.5, 0.2, -3.8], size: [0.3, 0.4, 4.4], color: '#c7b38f' },
  { position: [-2.5, 0.2, 3.5], size: [0.3, 0.4, 5], color: '#c7b38f' },
  { position: [3.5, 0.2, -3.5], size: [0.3, 0.4, 5], color: '#c7b38f' },
]

const furniture: Block[] = [
  { position: [-5.4, 0.35, -4.5], size: [3.2, 0.7, 1.8], color: '#54709a' },
  { position: [-5.4, 0.78, -5.05], size: [3.2, 0.18, 0.55], color: '#e8e1d1' },
  { position: [-7.1, 0.55, -2.2], size: [1.1, 1.1, 0.7], color: '#7b5035' },
  { position: [0.2, 0.45, -1.2], size: [2.8, 0.9, 1], color: '#9d604c' },
  { position: [0.2, 0.35, 1.1], size: [2.2, 0.7, 1.1], color: '#705748' },
  { position: [0.2, 0.42, 0], size: [1.6, 0.18, 0.8], color: '#bc8a52' },
  { position: [5.8, 0.55, -4.9], size: [3.6, 1.1, 0.8], color: '#6f8a70' },
  { position: [7.1, 0.55, -2.5], size: [0.8, 1.1, 3], color: '#6f8a70' },
  { position: [5.2, 0.45, -2.4], size: [1.8, 0.9, 1.2], color: '#a7764f' },
  { position: [5.2, 0.95, -5.28], size: [0.8, 0.8, 0.12], color: '#9fc5d5' },
  { position: [4.7, 0.12, 3.2], size: [2.8, 0.24, 1.1], color: '#8b6545' },
  { position: [6.5, 0.38, 1.8], size: [0.7, 0.76, 0.7], color: '#5b7d50' },
]

const roomLabels = [
  { name: 'BEDROOM', position: [-5.2, 0.12, -1.8] as [number, number, number] },
  { name: 'LIVING ROOM', position: [0.4, 0.12, 3.9] as [number, number, number] },
  { name: 'KITCHEN', position: [5.7, 0.12, -0.8] as [number, number, number] },
]

/** Parede invisível no vão da porta — a saída é via E/clique no trigger */
const doorThreshold: Block = { position: [4.5, 0.2, 6], size: [3, 0.4, 0.3], color: '' }

const colliderWalls = [...walls, doorThreshold]

const colliderPoints = colliderWalls.flatMap((wall, wallIndex) => {
  const horizontal = wall.size[0] > wall.size[2]
  const length = horizontal ? wall.size[0] : wall.size[2]
  const count = Math.ceil(length / 0.55)
  return Array.from({ length: count + 1 }, (_, index) => {
    const offset = -length / 2 + (index / count) * length
    return {
      id: `home-wall-${wallIndex}-${index}`,
      position: new Vector3(
        wall.position[0] + (horizontal ? offset : 0),
        0,
        wall.position[2] + (horizontal ? 0 : offset)
      ),
      radius: 0.28,
    }
  })
})

const EXIT_DOOR = {
  position: new Vector3(4.5, 0, 4.8),
  radius: 1.4,
  spawn: [4.5, 0, 8.5] as [number, number, number],
}

/** Trigger para sair da casa (E ou clique no anel) */
function ExitDoorTrigger() {
  const wasNear = useRef(false)

  useFrame(() => {
    const { playerPosition, setInteractDoor } = useGameStore.getState()
    const near = playerPosition.distanceTo(EXIT_DOOR.position) < EXIT_DOOR.radius
    if (near !== wasNear.current) {
      wasNear.current = near
      setInteractDoor(
        near ? { label: 'Sair de casa', scene: 'outside', spawn: EXIT_DOOR.spawn } : null
      )
    }
  })

  const tryExit = () => {
    const { playerPosition, enterScene } = useGameStore.getState()
    if (playerPosition.distanceTo(EXIT_DOOR.position) < EXIT_DOOR.radius) {
      enterScene('outside', EXIT_DOOR.spawn)
    }
  }

  return (
    <mesh
      rotation-x={-Math.PI / 2}
      position={[EXIT_DOOR.position.x, 0.03, EXIT_DOOR.position.z]}
      onClick={tryExit}
    >
      <ringGeometry args={[EXIT_DOOR.radius - 0.06, EXIT_DOOR.radius, 32]} />
      <meshBasicMaterial color="#e8c170" transparent opacity={0.35} />
    </mesh>
  )
}

function JourneyIntroTrigger() {
  const triggered = useRef(false)

  useFrame(() => {
    if (triggered.current) return
    const { playerPosition, openDialogue } = useGameStore.getState()
    if (playerPosition.lengthSq() < 2.25) {
      triggered.current = true
      openDialogue('giovani')
    }
  })

  return null
}

/** Cena do interior da casa — montada quando scene === 'house' */
export function HomeScenario() {
  useEffect(() => {
    const { registerCollider, unregisterCollider } = useGameStore.getState()
    colliderPoints.forEach(registerCollider)
    return () => colliderPoints.forEach(({ id }) => unregisterCollider(id))
  }, [])

  return (
    <group>
      <JourneyIntroTrigger />
      <ExitDoorTrigger />

      <mesh position={[0, -0.12, 0]} receiveShadow>
        <boxGeometry args={[16, 0.24, 12]} />
        <meshBasicMaterial color="#b98757" />
      </mesh>

      {walls.map((block, index) => (
        <mesh key={`wall-${index}`} position={block.position} castShadow receiveShadow>
          <boxGeometry args={block.size} />
          <meshBasicMaterial color={block.color} />
        </mesh>
      ))}
      {furniture.map((block, index) => (
        <mesh key={`furniture-${index}`} position={block.position} castShadow receiveShadow>
          <boxGeometry args={block.size} />
          <meshBasicMaterial color={block.color} />
        </mesh>
      ))}

      {/* Batente sobre o vão da porta (lado de dentro) */}
      <mesh position={[4, 1.45, 5.92]}>
        <boxGeometry args={[2, 0.18, 0.18]} />
        <meshBasicMaterial color="#e8c170" />
      </mesh>

      {roomLabels.map((room) => (
        <Html key={room.name} position={room.position} center distanceFactor={18} rotation={[-Math.PI / 2, 0, 0]} transform>
          <div className="room-label">{room.name}</div>
        </Html>
      ))}
    </group>
  )
}
