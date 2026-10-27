import { Suspense, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Clone, useGLTF } from '@react-three/drei'
import { Box3, Vector3 } from 'three'
import { useGameStore } from '../store/useGameStore'
import { CoffeeCup } from './CoffeeCup'
import { LockedGate } from './LockedGate'
import { ItemPickup } from './ItemPickup'
import { Coin } from './Coin'
import { Crawler } from './Crawler'
import { Flyer } from './Flyer'

const TREE_MODELS = {
  deciduous: '/assets/models/meshy_tree_deciduous.glb',
  pine: '/assets/models/meshy_tree_pine.glb',
} as const

const STONE_COLORS = ['#7a7a7a', '#8b8b8b', '#6e6e6e']

function ForestExitTrigger() {
  const triggered = useRef(false)
  const checkPos = useMemo(() => new Vector3(0, 0, 12), [])

  useFrame(() => {
    if (triggered.current) return
    const { playerPosition, openDialogue } = useGameStore.getState()
    if (playerPosition.distanceToSquared(checkPos) < 12) {
      triggered.current = true
      openDialogue('journey')
    }
  })

  return null
}

/** Árvore GLB normalizada: `height` é a altura final em unidades do mundo,
 *  com a base do modelo apoiada no chão (y = 0) */
function Tree({ model, height, x, z }: { model: keyof typeof TREE_MODELS; height: number; x: number; z: number }) {
  const { scene } = useGLTF(TREE_MODELS[model])

  const { scale, offsetY } = useMemo(() => {
    scene.traverse((obj) => {
      obj.castShadow = true
      obj.receiveShadow = true
    })
    const box = new Box3().setFromObject(scene)
    const s = height / box.getSize(new Vector3()).y
    return { scale: s, offsetY: -box.min.y * s }
  }, [scene, height])

  // Rotação determinística por posição para variar os clones
  const rotation = useMemo(() => ((x * 7 + z * 13) % 360) * (Math.PI / 180), [x, z])

  return (
    <group position={[x, 0, z]} rotation-y={rotation}>
      <Clone object={scene} scale={scale} position-y={offsetY} />
    </group>
  )
}

function createTree(x: number, z: number, scale = 1, model: keyof typeof TREE_MODELS = 'deciduous') {
  return { x, z, height: 2.3 * scale, model }
}

const trees = [
  createTree(-10, 15, 1.2, 'pine'),
  createTree(-13, 18, 0.9),
  createTree(-8, 22, 1.1, 'pine'),
  createTree(-15, 24, 1.3),
  createTree(-6, 28, 0.8, 'pine'),
  createTree(10, 16, 1.1),
  createTree(14, 19, 1.0, 'pine'),
  createTree(9, 23, 1.2),
  createTree(16, 26, 0.9, 'pine'),
  createTree(11, 30, 1.1),
  createTree(-5, 35, 1.0, 'pine'),
  createTree(6, 36, 1.2),
  createTree(-11, 40, 0.9, 'pine'),
  createTree(13, 42, 1.1),
]

const stones = [
  { position: [2.2, 0.22, 14] as [number, number, number], size: [0.9, 0.45, 0.7] as [number, number, number], color: STONE_COLORS[0] },
  { position: [-3.1, 0.18, 20] as [number, number, number], size: [0.7, 0.36, 0.55] as [number, number, number], color: STONE_COLORS[1] },
  { position: [4.5, 0.28, 26] as [number, number, number], size: [1.1, 0.56, 0.9] as [number, number, number], color: STONE_COLORS[2] },
  { position: [-2.4, 0.18, 32] as [number, number, number], size: [0.65, 0.36, 0.6] as [number, number, number], color: STONE_COLORS[0] },
]

const path = [
  { position: [0, -0.08, 18] as [number, number, number], size: [3.2, 0.16, 8] as [number, number, number] },
  { position: [0, -0.08, 28] as [number, number, number], size: [3.2, 0.16, 8] as [number, number, number] },
  { position: [0, -0.08, 38] as [number, number, number], size: [3.2, 0.16, 8] as [number, number, number] },
  { position: [-5, -0.08, 44] as [number, number, number], size: [8, 0.16, 3.2] as [number, number, number] },
  { position: [5, -0.08, 44] as [number, number, number], size: [8, 0.16, 3.2] as [number, number, number] },
]

const altars = [
  { position: [-7, 0.6, 44] as [number, number, number], color: '#5e9bd4', glow: '#8ac6ff' },
  { position: [7, 0.6, 44] as [number, number, number], color: '#d46b5e', glow: '#ff968a' },
  { position: [0, 0.6, 50] as [number, number, number], color: '#6b5ed4', glow: '#9a8aff' },
]

const colliders = [
  ...trees.map((tree, index) => ({
    id: `forest-tree-${index}`,
    position: new Vector3(tree.x, 0, tree.z),
    radius: tree.height * 0.28,
  })),
  ...stones.map((stone, index) => ({
    id: `forest-stone-${index}`,
    position: new Vector3(stone.position[0], 0, stone.position[2]),
    radius: Math.max(stone.size[0], stone.size[2]) * 0.45,
  })),
  ...altars.map((altar, index) => ({
    id: `forest-altar-${index}`,
    position: new Vector3(altar.position[0], 0, altar.position[2]),
    radius: 0.6,
  })),
]

export function ForestScenario() {
  useEffect(() => {
    const { registerCollider, unregisterCollider } = useGameStore.getState()
    colliders.forEach(registerCollider)
    return () => colliders.forEach(({ id }) => unregisterCollider(id))
  }, [])

  return (
    <group>
      <ForestExitTrigger />
      <mesh position={[0, -0.2, 30]} receiveShadow>
        <boxGeometry args={[40, 0.2, 60]} />
        <meshBasicMaterial color="#5a8a4f" />
      </mesh>

      {path.map((segment, index) => (
        <mesh key={`path-${index}`} position={segment.position} receiveShadow>
          <boxGeometry args={segment.size} />
          <meshBasicMaterial color="#c6aa7b" />
        </mesh>
      ))}

      <Suspense fallback={null}>
        {trees.map((tree, index) => (
          <Tree key={`tree-${index}`} model={tree.model} height={tree.height} x={tree.x} z={tree.z} />
        ))}
      </Suspense>

      {stones.map((stone, index) => (
        <mesh key={`stone-${index}`} position={stone.position} castShadow>
          <boxGeometry args={stone.size} />
          <meshBasicMaterial color={stone.color} />
        </mesh>
      ))}

      {altars.map((altar, index) => (
        <group key={`altar-${index}`} position={altar.position}>
          <mesh position={[0, 0, 0]}>
            <boxGeometry args={[0.8, 1.2, 0.8]} />
            <meshBasicMaterial color={altar.color} />
          </mesh>
          <mesh position={[0, 0.8, 0]}>
            <boxGeometry args={[0.35, 0.35, 0.35]} />
            <meshBasicMaterial color={altar.glow} />
          </mesh>
        </group>
      ))}

      <CoffeeCup position={[2.5, 0.55, 16]} />
      <CoffeeCup position={[-2.2, 0.55, 25]} />
      <CoffeeCup position={[1.8, 0.55, 34]} />

      <ItemPickup position={[3.5, 0.6, 18]} item="java" />
      <ItemPickup position={[-3.4, 0.6, 26]} item="csharp" />
      <ItemPickup position={[2.6, 0.6, 36]} item="javascript" />
      <ItemPickup position={[-1.5, 0.6, 21]} item="python" />

      <Coin position={[1.2, 0.5, 19]} />
      <Coin position={[-0.8, 0.5, 23]} />
      <Coin position={[3.8, 0.5, 28]} />
      <Coin position={[-2.8, 0.5, 31]} />
      <Coin position={[0.5, 0.5, 38]} />
      <Coin position={[-4.2, 0.5, 40]} />

      <Crawler position={[3.2, 0, 24]} />
      <Crawler position={[-4, 0, 31]} />
      <Crawler position={[-5.5, 0, 33]} />
      <Crawler position={[2.4, 0, 39]} />
      <Crawler position={[4, 0, 41]} />

      <Flyer position={[0.5, 0, 27]} />
      <Flyer position={[-4.5, 0, 37]} />
      <Flyer position={[3.5, 0, 35]} />

      <LockedGate position={[-5, 1.1, 44]} skill="csharp" color="#5e9bd4" />
      <LockedGate position={[5, 1.1, 44]} skill="python" color="#d46b5e" />
      <LockedGate position={[0, 1.1, 50]} skill="design" color="#6b5ed4" />
    </group>
  )
}

useGLTF.preload(TREE_MODELS.deciduous)
useGLTF.preload(TREE_MODELS.pine)
