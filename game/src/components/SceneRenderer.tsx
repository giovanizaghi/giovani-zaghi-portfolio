import { Suspense, useEffect, useMemo } from 'react'
import { Clone, Html, useGLTF } from '@react-three/drei'
import { Box3, Vector3 } from 'three'
import { useGameStore } from '../store/useGameStore'
import { computeSceneColliders } from '../data/sceneColliders'
import type { Entity, SceneData } from '../data/world'
import { Coin } from './Coin'
import { CoffeeCup } from './CoffeeCup'
import { ItemPickup } from './ItemPickup'
import { KeyPickup } from './KeyPickup'
import { Crawler } from './Crawler'
import { Flyer } from './Flyer'
import { Npc } from './Npc'
import { LockedGate } from './LockedGate'
import { LockedDoor } from './LockedDoor'
import { DoorTrigger } from './DoorTrigger'
import { SceneTrigger } from './SceneTrigger'
import { Transport, ParkedVehicle } from './Transport'
import { HouseModel } from './HouseModel'

const TREE_MODELS = {
  deciduous: '/assets/models/meshy_tree_deciduous.glb',
  pine: '/assets/models/meshy_tree_pine.glb',
} as const

/** Alturas padrão de cada tipo de entidade quando `y` não é explícito */
const DEFAULT_Y: Partial<Record<Entity['type'], number>> = {
  coin: 0.5,
  coffee: 0.55,
  item: 0.6,
  key: 0.6,
  gate: 1.1,
}

function entityY(e: Entity): number {
  return e.y ?? DEFAULT_Y[e.type] ?? 0
}

/** Árvore GLB normalizada: `height` é a altura final em unidades do mundo,
 *  com a base do modelo apoiada no chão (y = 0) */
function Tree({
  model,
  height,
  x,
  y,
  z,
  rotY,
}: {
  model: keyof typeof TREE_MODELS
  height: number
  x: number
  y: number
  z: number
  rotY?: number
}) {
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

  // Rotação determinística por posição para variar os clones — a entidade pode
  // sobrescrever com `rotY` explícito
  const rotation = useMemo(
    () => rotY ?? ((x * 7 + z * 13) % 360) * (Math.PI / 180),
    [x, z, rotY]
  )

  return (
    <group position={[x, y, z]} rotation-y={rotation}>
      <Clone object={scene} scale={scale} position-y={offsetY} />
    </group>
  )
}

/** Renderiza uma entidade do JSON — `key` = entity.id (vem do map) */
function renderEntity(e: Entity) {
  const pos: [number, number, number] = [e.x, entityY(e), e.z]
  switch (e.type) {
    case 'tree':
      // Suspense por árvore: o GLB carregando não esconde o resto da cena
      return (
        <Suspense key={e.id} fallback={null}>
          <Tree model={e.model} height={e.height} x={e.x} y={pos[1]} z={e.z} rotY={e.rotY} />
        </Suspense>
      )

    case 'block':
      if (e.visible === false) return null // só colisor, sem malha
      return (
        <mesh
          key={e.id}
          position={[e.x, e.y ?? e.size[1] / 2, e.z]}
          rotation-y={e.rotY ?? 0}
          castShadow
          receiveShadow
        >
          <boxGeometry args={e.size} />
          {e.material === 'standard' ? (
            <meshStandardMaterial color={e.color} />
          ) : (
            <meshBasicMaterial color={e.color} />
          )}
        </mesh>
      )

    case 'label': {
      if (e.variant === 'room') {
        return (
          <Html
            key={e.id}
            position={pos}
            center
            distanceFactor={18}
            rotation={[-Math.PI / 2, 0, 0]}
            transform
          >
            <div className="room-label">{e.text}</div>
          </Html>
        )
      }
      if (e.variant === 'sign') {
        // sem distanceFactor: com câmera ortográfica zoom=62 ele geraria
        // escala ~zoom*factor e o letreiro cobriria a tela inteira
        return (
          <Html key={e.id} position={pos} center zIndexRange={[8, 0]}>
            <div className="terminal-sign">{e.text}</div>
          </Html>
        )
      }
      return (
        <Html key={e.id} position={pos} center zIndexRange={[8, 0]}>
          <div className="platform-label">{e.text}</div>
        </Html>
      )
    }

    case 'house':
      return <HouseModel key={e.id} x={e.x} z={e.z} rotY={e.rotY} />

    case 'coin':
      return <Coin key={e.id} position={pos} value={e.value} />

    case 'coffee':
      return <CoffeeCup key={e.id} position={pos} />

    case 'item':
      return <ItemPickup key={e.id} position={pos} item={e.item} />

    case 'key':
      return <KeyPickup key={e.id} position={pos} color={e.color} />

    case 'crawler':
      return <Crawler key={e.id} position={pos} stats={e.stats} />

    case 'flyer':
      return <Flyer key={e.id} position={pos} stats={e.stats} />

    case 'npc':
      return <Npc key={e.id} position={pos} dialogueId={e.dialogueId} color={e.color} />

    case 'gate':
      return (
        <LockedGate
          key={e.id}
          position={pos}
          skill={e.skill}
          color={e.color}
          size={e.size}
        />
      )

    case 'door':
      if (e.panel) {
        return (
          <LockedDoor
            key={e.id}
            id={e.id}
            lock={e.lock}
            position={pos}
            rotationY={e.rotY ?? 0}
            width={e.width}
            label={e.label}
            labelFront={e.labelFront}
            labelBack={e.labelBack}
            toScene={e.toScene}
            toSpawn={e.toSpawn}
          />
        )
      }
      return (
        <DoorTrigger
          key={e.id}
          id={e.id}
          x={e.x}
          z={e.z}
          // o schema garante esses campos em porta sem painel
          radius={e.radius!}
          label={e.label}
          toScene={e.toScene!}
          toSpawn={e.toSpawn!}
          lock={e.lock}
          padlock={e.padlock}
        />
      )

    case 'transport':
      return (
        <Transport
          key={e.id}
          id={e.id}
          kind={e.kind}
          position={pos}
          ride={e.ride}
          scene={e.toScene}
          spawn={e.toSpawn}
          label={e.label}
        />
      )

    case 'parked':
      return <ParkedVehicle key={e.id} kind={e.kind} position={pos} direction={e.direction} />

    case 'trigger':
      return (
        <SceneTrigger
          key={e.id}
          x={e.x}
          z={e.z}
          radius={e.radius}
          dialogueId={e.dialogueId}
          once={e.once}
        />
      )
  }
}

/**
 * Renderiza uma cena inteira a partir dos dados (JSON do mundo): chão do
 * `env.ground` + uma entidade por `type`. Registra os colliders estáticos
 * calculados por `computeSceneColliders` enquanto montada.
 */
export function SceneRenderer({ scene }: { scene: SceneData }) {
  useEffect(() => {
    const colliders = computeSceneColliders(scene)
    const { registerCollider, unregisterCollider } = useGameStore.getState()
    colliders.forEach(registerCollider)
    return () => colliders.forEach((c) => unregisterCollider(c.id))
  }, [scene])

  const ground = scene.env.ground

  return (
    <group>
      <mesh
        position={[ground.center[0], ground.y ?? -0.2, ground.center[1]]}
        receiveShadow
      >
        <boxGeometry
          args={[ground.size[0], ground.thickness ?? 0.2, ground.size[1]]}
        />
        <meshBasicMaterial color={ground.color} />
      </mesh>

      {scene.entities.map((e) => renderEntity(e))}
    </group>
  )
}

useGLTF.preload(TREE_MODELS.deciduous)
useGLTF.preload(TREE_MODELS.pine)
