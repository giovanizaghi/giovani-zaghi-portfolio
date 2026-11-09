import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Mesh, Vector3 } from 'three'
import { useGameStore } from '../store/useGameStore'
import type { Collider, DoorTarget, SceneId } from '../store/useGameStore'
import { DIRECTION_VECTORS, TRANSPORT_CONFIG } from '../data/transports'
import type {
  CompassDirection,
  TransportKind,
  TransportRide,
} from '../data/transports'

// ---------------------------------------------------------------------------
// Dimensões por tipo — footprint de colisão, ponto de embarque e reach do hint.
// Os modelos são primitivas low-poly (trocar por GLB depois — ver AGENTS.md).
// ---------------------------------------------------------------------------

interface KindDims {
  /** Extensão do footprint no eixo local X (largura) */
  footWidth: number
  /** Extensão do footprint no eixo local Z (comprimento / eixo de viagem) */
  footLength: number
  /** Colliders distribuídos na horizontal (eixo X local) */
  cols: number
  /** Colliders distribuídos na vertical (eixo Z local — direção do modelo) */
  rows: number
  colliderRadius: number
  /** Offset local Z do ponto de embarque — negativo = traseira, positivo = frente */
  boardZ: number
  triggerRadius: number
}

const KIND_DIMS: Record<TransportKind, KindDims> = {
  // Elevador: caixa larga e rasa — colliders em 2 colunas na horizontal
  elevator: { footWidth: 1.4, footLength: 0, cols: 2, rows: 1, colliderRadius: 1.0, boardZ: 1.6, triggerRadius: 1.8 },
  car: { footWidth: 1.2, footLength: 1.9, cols: 1, rows: 3, colliderRadius: 0.7, boardZ: -2.4, triggerRadius: 1.7 },
  van: { footWidth: 1.4, footLength: 2.5, cols: 1, rows: 4, colliderRadius: 0.85, boardZ: -2.9, triggerRadius: 1.8 },
  bus: { footWidth: 1.6, footLength: 4.6, cols: 1, rows: 6, colliderRadius: 1.0, boardZ: -3.9, triggerRadius: 2.0 },
  // Avião: colliders só na fuselagem — as asas são finas e altas
  plane: { footWidth: 0.9, footLength: 4.0, cols: 1, rows: 4, colliderRadius: 0.6, boardZ: -3.4, triggerRadius: 2.2 },
}

// Posição X das portas do elevador: aberto (recuado) / fechado (juntas ao centro)
const DOOR_OPEN_X = 0.9
const DOOR_CLOSED_X = 0.43
// Ângulo da escalada do avião (~30° acima do horizonte) e pitch do nariz
const PLANE_CLIMB_ANGLE = Math.PI / 6
const PLANE_PITCH = 0.5

const easeInQuad = (t: number) => t * t
const easeInOutQuad = (t: number) => t * t * (3 - 2 * t)

// ---------------------------------------------------------------------------
// Modelos dos veículos — primitivas low-poly, um componente por tipo para
// facilitar a troca futura por GLB (basta trocar o retorno de VehicleModel).
// Todos são construídos "de frente para +Z"; o grupo pai rotaciona pelo heading.
// ---------------------------------------------------------------------------

/** Roda simples — cilindro deitado no eixo X */
function Wheel({
  position,
  radius = 0.3,
  width = 0.24,
  color = '#22262c',
}: {
  position: readonly [number, number, number]
  radius?: number
  width?: number
  color?: string
}) {
  return (
    <mesh position={[...position]} rotation-z={Math.PI / 2} castShadow>
      <cylinderGeometry args={[radius, radius, width, 12]} />
      <meshStandardMaterial color={color} />
    </mesh>
  )
}

/** Carro (~2.2 de comprimento) */
function CarModel() {
  return (
    <group>
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.5, 0.55, 2.2]} />
        <meshStandardMaterial color="#d94f3d" />
      </mesh>
      <mesh position={[0, 1.0, -0.2]} castShadow>
        <boxGeometry args={[1.3, 0.5, 1.0]} />
        <meshStandardMaterial color="#b8433a" />
      </mesh>
      <Wheel position={[-0.72, 0.3, 0.72]} />
      <Wheel position={[0.72, 0.3, 0.72]} />
      <Wheel position={[-0.72, 0.3, -0.72]} />
      <Wheel position={[0.72, 0.3, -0.72]} />
    </group>
  )
}

/** Van (~2.8 de comprimento, mais alta que o carro) */
function VanModel() {
  return (
    <group>
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[1.7, 1.5, 2.8]} />
        <meshStandardMaterial color="#e8e4da" />
      </mesh>
      {/* faixa de vidros nas laterais */}
      <mesh position={[0.86, 1.25, -0.2]}>
        <boxGeometry args={[0.04, 0.45, 2.1]} />
        <meshStandardMaterial color="#2e3d4d" />
      </mesh>
      <mesh position={[-0.86, 1.25, -0.2]}>
        <boxGeometry args={[0.04, 0.45, 2.1]} />
        <meshStandardMaterial color="#2e3d4d" />
      </mesh>
      {/* para-brisa */}
      <mesh position={[0, 1.35, 1.42]}>
        <boxGeometry args={[1.5, 0.5, 0.06]} />
        <meshStandardMaterial color="#2e3d4d" />
      </mesh>
      <Wheel position={[-0.8, 0.38, 0.95]} radius={0.36} width={0.28} />
      <Wheel position={[0.8, 0.38, 0.95]} radius={0.36} width={0.28} />
      <Wheel position={[-0.8, 0.38, -0.95]} radius={0.36} width={0.28} />
      <Wheel position={[0.8, 0.38, -0.95]} radius={0.36} width={0.28} />
    </group>
  )
}

/** Ônibus (~5 de comprimento, fileira de janelas) */
function BusModel() {
  return (
    <group>
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[1.9, 1.9, 5.0]} />
        <meshStandardMaterial color="#3d6ea5" />
      </mesh>
      {/* faixa de janelas */}
      <mesh position={[0, 1.55, 0]}>
        <boxGeometry args={[1.94, 0.5, 4.5]} />
        <meshStandardMaterial color="#d7e6f2" />
      </mesh>
      <Wheel position={[-0.85, 0.42, 1.7]} radius={0.42} width={0.3} />
      <Wheel position={[0.85, 0.42, 1.7]} radius={0.42} width={0.3} />
      <Wheel position={[-0.85, 0.42, -1.7]} radius={0.42} width={0.3} />
      <Wheel position={[0.85, 0.42, -1.7]} radius={0.42} width={0.3} />
    </group>
  )
}

interface ModelRefs {
  cabinRef?: RefObject<Group | null>
  doorLRef?: RefObject<Mesh | null>
  doorRRef?: RefObject<Mesh | null>
  pitchRef?: RefObject<Group | null>
}

/** Avião (~4.4 de fuselagem, envergadura ~4.6) — `pitchRef` recebe o cablage */
function PlaneModel({ pitchRef }: ModelRefs) {
  return (
    <group ref={pitchRef}>
      {/* fuselagem ao longo de Z */}
      <mesh position={[0, 0.8, -0.1]} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.32, 0.32, 4.2, 12]} />
        <meshStandardMaterial color="#e8ecf2" />
      </mesh>
      {/* nariz afunilado */}
      <mesh position={[0, 0.8, 2.15]} rotation-x={Math.PI / 2} castShadow>
        <cylinderGeometry args={[0.1, 0.32, 0.9, 12]} />
        <meshStandardMaterial color="#e8ecf2" />
      </mesh>
      {/* asas */}
      <mesh position={[1.15, 0.78, -0.3]} castShadow>
        <boxGeometry args={[2.3, 0.08, 0.75]} />
        <meshStandardMaterial color="#d94f3d" />
      </mesh>
      <mesh position={[-1.15, 0.78, -0.3]} castShadow>
        <boxGeometry args={[2.3, 0.08, 0.75]} />
        <meshStandardMaterial color="#d94f3d" />
      </mesh>
      {/* leme vertical + estabilizadores */}
      <mesh position={[0, 1.15, -1.95]} castShadow>
        <boxGeometry args={[0.08, 0.75, 0.6]} />
        <meshStandardMaterial color="#d94f3d" />
      </mesh>
      <mesh position={[0, 0.82, -1.95]} castShadow>
        <boxGeometry args={[1.5, 0.06, 0.4]} />
        <meshStandardMaterial color="#d94f3d" />
      </mesh>
    </group>
  )
}

/**
 * Elevador: poço fixo (pilares + verga + fundo) e cabine que sobe/desce.
 * As portas vão dentro da cabine — fecham no início da viagem e sobem/descem
 * junto com ela. `cabinRef`/`doorLRef`/`doorRRef` são animados pelo Transport.
 */
function ElevatorModel({ cabinRef, doorLRef, doorRRef }: ModelRefs) {
  return (
    <group>
      {/* fundo do poço */}
      <mesh position={[0, 1.45, -0.98]}>
        <boxGeometry args={[2.7, 2.9, 0.1]} />
        <meshStandardMaterial color="#2c3138" />
      </mesh>
      {/* 4 pilares do poço */}
      <mesh position={[-1.35, 1.5, -1.0]} castShadow>
        <boxGeometry args={[0.18, 3.0, 0.18]} />
        <meshStandardMaterial color="#5a6470" />
      </mesh>
      <mesh position={[1.35, 1.5, -1.0]} castShadow>
        <boxGeometry args={[0.18, 3.0, 0.18]} />
        <meshStandardMaterial color="#5a6470" />
      </mesh>
      <mesh position={[-1.35, 1.5, 1.0]} castShadow>
        <boxGeometry args={[0.18, 3.0, 0.18]} />
        <meshStandardMaterial color="#5a6470" />
      </mesh>
      <mesh position={[1.35, 1.5, 1.0]} castShadow>
        <boxGeometry args={[0.18, 3.0, 0.18]} />
        <meshStandardMaterial color="#5a6470" />
      </mesh>
      {/* verga superior fechando o poço */}
      <mesh position={[0, 2.95, -1.0]} castShadow>
        <boxGeometry args={[2.9, 0.22, 0.2]} />
        <meshStandardMaterial color="#5a6470" />
      </mesh>
      <mesh position={[0, 2.95, 1.0]} castShadow>
        <boxGeometry args={[2.9, 0.22, 0.2]} />
        <meshStandardMaterial color="#5a6470" />
      </mesh>
      <mesh position={[-1.35, 2.95, 0]} castShadow>
        <boxGeometry args={[0.2, 0.22, 2.2]} />
        <meshStandardMaterial color="#5a6470" />
      </mesh>
      <mesh position={[1.35, 2.95, 0]} castShadow>
        <boxGeometry args={[0.2, 0.22, 2.2]} />
        <meshStandardMaterial color="#5a6470" />
      </mesh>

      {/* cabine — move no eixo Y durante a viagem */}
      <group ref={cabinRef}>
        <mesh position={[0, 1.05, 0]} castShadow>
          <boxGeometry args={[2.4, 2.1, 1.7]} />
          <meshStandardMaterial color="#b9c0ca" />
        </mesh>
        {/* vão escuro da porta na face frontal */}
        <mesh position={[0, 1.0, 0.87]}>
          <boxGeometry args={[1.7, 1.85, 0.05]} />
          <meshStandardMaterial color="#1c2126" />
        </mesh>
        {/* portas de correr — posição X animada pelo Transport */}
        <mesh ref={doorLRef} position={[-DOOR_OPEN_X, 1.0, 0.9]} castShadow>
          <boxGeometry args={[0.86, 1.83, 0.07]} />
          <meshStandardMaterial color="#eef1f5" />
        </mesh>
        <mesh ref={doorRRef} position={[DOOR_OPEN_X, 1.0, 0.9]} castShadow>
          <boxGeometry args={[0.86, 1.83, 0.07]} />
          <meshStandardMaterial color="#eef1f5" />
        </mesh>
      </group>
    </group>
  )
}

/** Escolhe o modelo pelo tipo — ponto único de troca para GLBs futuros */
function VehicleModel({ kind, ...refs }: ModelRefs & { kind: TransportKind }) {
  switch (kind) {
    case 'elevator':
      return <ElevatorModel {...refs} />
    case 'plane':
      return <PlaneModel {...refs} />
    case 'bus':
      return <BusModel />
    case 'van':
      return <VanModel />
    default:
      return <CarModel />
  }
}

// ---------------------------------------------------------------------------
// Colisores do footprint — malha cols×lines no plano local, rotacionada pelo heading
// ---------------------------------------------------------------------------

function footprintColliders(
  id: string,
  position: readonly [number, number, number],
  heading: number,
  dims: KindDims
): Collider[] {
  const px = position[0]
  const pz = position[2]
  const cos = Math.cos(heading)
  const sin = Math.sin(heading)
  const colliders: Collider[] = []
  for (let ix = 0; ix < dims.cols; ix++) {
    const lx =
      dims.cols === 1 ? 0 : -dims.footWidth / 2 + (ix / (dims.cols - 1)) * dims.footWidth
    for (let iz = 0; iz < dims.rows; iz++) {
      const lz =
        dims.rows === 1
          ? 0
          : -dims.footLength / 2 + (iz / (dims.rows - 1)) * dims.footLength
      colliders.push({
        id: `transport-${id}-col-${ix}-${iz}`,
        position: new Vector3(
          px + lx * cos + lz * sin,
          0,
          pz - lx * sin + lz * cos
        ),
        radius: dims.colliderRadius,
      })
    }
  }
  return colliders
}

/** Registra os colliders do veículo enquanto montado (Transport e ParkedVehicle) */
function useFootprintColliders(
  colliderId: string,
  position: readonly [number, number, number],
  heading: number,
  dims: KindDims
) {
  const px = position[0]
  const pz = position[2]
  useEffect(() => {
    const colliders = footprintColliders(colliderId, [px, 0, pz], heading, dims)
    const { registerCollider, unregisterCollider } = useGameStore.getState()
    colliders.forEach(registerCollider)
    return () => colliders.forEach((c) => unregisterCollider(c.id))
  }, [colliderId, px, pz, heading, dims])
}

// ---------------------------------------------------------------------------
// Transport — veículo interativo que anima a viagem antes de trocar de cena
// ---------------------------------------------------------------------------

interface TransportProps {
  /** Id único — casa com `DoorTarget.transport.id` e `transition.id` */
  id: string
  kind: TransportKind
  /** Posição base no chão */
  position: readonly [number, number, number]
  /** Viagem programada (destino + tipo de movimento) */
  ride: TransportRide
  /** Cena e spawn de destino */
  scene: SceneId
  spawn: readonly [number, number, number]
  /** Rótulo custom do hint (default: o do TRANSPORT_CONFIG) */
  label?: string
}

export function Transport({ id, kind, position, ride, scene, spawn, label }: TransportProps) {
  const dims = KIND_DIMS[kind]
  const config = TRANSPORT_CONFIG[kind]
  const [px, py, pz] = position

  // Direção de viagem no plano XZ — o elevador "viaja" para +Z (lado da porta)
  const dir = useMemo(
    () => (ride.kind === 'elevator' ? { x: 0, z: 1 } : DIRECTION_VECTORS[ride.direction]),
    [ride]
  )
  const heading = Math.atan2(dir.x, dir.z)

  // Ponto de embarque no mundo: traseira dos veículos, frente do elevador
  const boardPos = useMemo(
    () => new Vector3(px + dir.x * dims.boardZ, 0, pz + dir.z * dims.boardZ),
    [px, pz, dir, dims.boardZ]
  )

  const target = useMemo<DoorTarget>(
    () => ({
      label: label ?? config.label,
      scene,
      spawn: [spawn[0], spawn[1], spawn[2]],
      transport: { id, ride },
    }),
    [label, config.label, scene, spawn, id, ride]
  )

  const wasNear = useRef(false)
  const mover = useRef<Group>(null!)
  const cabin = useRef<Group>(null!)
  const doorL = useRef<Mesh>(null!)
  const doorR = useRef<Mesh>(null!)
  const pitch = useRef<Group>(null!)
  const finished = useRef(false)
  // Esta viagem é a minha? (anima só o transporte cujo id está na transition)
  const riding = useGameStore((s) => s.transition?.id === id)

  useFootprintColliders(id, position, heading, dims)

  // Se o transporte desmontar com o hint apontando para ele, limpa
  useEffect(() => {
    return () => {
      const { interactDoor, setInteractDoor } = useGameStore.getState()
      if (interactDoor === target) setInteractDoor(null)
    }
  }, [target])

  const tryBoard = () => {
    const { playerPosition, interactWithDoor } = useGameStore.getState()
    const dx = playerPosition.x - boardPos.x
    const dz = playerPosition.z - boardPos.z
    if (dx * dx + dz * dz < dims.triggerRadius * dims.triggerRadius) {
      interactWithDoor(target)
    }
  }

  useFrame(() => {
    const store = useGameStore.getState()

    // ---- Proximidade → hint de interação (edge-detected, igual às portas) ----
    const near = store.playerPosition.distanceTo(boardPos) < dims.triggerRadius
    if (near !== wasNear.current) {
      wasNear.current = near
      if (near) {
        store.setInteractDoor(target)
      } else if (store.interactDoor === target) {
        // Só limpa se o hint atual for deste transporte — outro pode ter assumido
        store.setInteractDoor(null)
      }
    }

    // ---- Viagem: anima pelo relógio (sobrevive a remounts) ----
    const t = store.transition
    if (!t || t.id !== id) {
      finished.current = false
      // Pose de repouso — também cobre abortos de viagem sem troca de cena
      if (mover.current) mover.current.position.set(0, 0, 0)
      if (cabin.current) cabin.current.position.y = 0
      if (pitch.current) pitch.current.rotation.x = 0
      if (doorL.current) doorL.current.position.x = -DOOR_OPEN_X
      if (doorR.current) doorR.current.position.x = DOOR_OPEN_X
      return
    }

    const elapsed = (performance.now() - t.startedAt) / 1000
    if (elapsed >= config.duration) {
      // A cena destino SÓ carrega aqui — depois da animação completa
      if (!finished.current) {
        finished.current = true
        store.finishTransport()
      }
      return
    }

    if (kind === 'elevator') {
      // Fase 1: portas fecham (~doorTime). Fase 2: cabine sobe/desce (ease-in)
      const doorK = easeInOutQuad(Math.min(1, elapsed / config.doorTime))
      const slide = (DOOR_OPEN_X - DOOR_CLOSED_X) * doorK
      if (doorL.current) doorL.current.position.x = -DOOR_OPEN_X + slide
      if (doorR.current) doorR.current.position.x = DOOR_OPEN_X - slide

      const moveT = Math.max(
        0,
        (elapsed - config.doorTime) / (config.duration - config.doorTime)
      )
      const up = ride.kind === 'elevator' && ride.vertical === 'up' ? 1 : -1
      if (cabin.current) cabin.current.position.y = up * config.rise * easeInQuad(moveT)
    } else if (kind === 'plane') {
      // Fase 1: taxi acelerando no chão. Fase 2: escalada diagonal ~30°
      const taxiEnd = config.duration * config.taxiFraction
      if (elapsed < taxiEnd) {
        const u = easeInQuad(elapsed / taxiEnd)
        mover.current?.position.set(0, 0, config.travel * u)
        if (pitch.current) pitch.current.rotation.x = 0
      } else {
        const u = easeInOutQuad((elapsed - taxiEnd) / (config.duration - taxiEnd))
        const climbFwd = config.climbHeight / Math.tan(PLANE_CLIMB_ANGLE)
        mover.current?.position.set(
          0,
          config.climbHeight * u,
          config.travel + climbFwd * u
        )
        if (pitch.current) pitch.current.rotation.x = -PLANE_PITCH * u
      }
    } else {
      // Rua: acelera na direção programada até sair da tela
      const u = easeInQuad(Math.min(1, elapsed / config.duration))
      mover.current?.position.set(0, 0, config.travel * u)
    }
  })

  return (
    <group position={[px, py, pz]} rotation-y={heading} onClick={tryBoard}>
      {/* mover: translação da viagem (rua/avião); no elevador a cabine anima por dentro */}
      <group ref={mover}>
        <VehicleModel
          kind={kind}
          cabinRef={cabin}
          doorLRef={doorL}
          doorRRef={doorR}
          pitchRef={pitch}
        />
      </group>

      {/* anel de interação no lado de embarque — some durante a viagem */}
      <mesh
        rotation-x={-Math.PI / 2}
        position={[0, 0.03, dims.boardZ]}
        visible={!riding}
        onClick={tryBoard}
      >
        <ringGeometry args={[dims.triggerRadius - 0.07, dims.triggerRadius, 32]} />
        <meshBasicMaterial color="#e8c170" transparent opacity={0.35} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// ParkedVehicle — veículo decorativo de plataforma (modelo + colliders, sem E)
// ---------------------------------------------------------------------------

interface ParkedVehicleProps {
  kind: TransportKind
  position: readonly [number, number, number]
  /** Direção para a qual o veículo "olha" (estética das plataformas) */
  direction?: CompassDirection
}

export function ParkedVehicle({ kind, position, direction }: ParkedVehicleProps) {
  const dims = KIND_DIMS[kind]
  const dir = direction ? DIRECTION_VECTORS[direction] : { x: 0, z: 1 }
  const heading = Math.atan2(dir.x, dir.z)
  // Id estável por posição — mesmo padrão dos pickups/inimigos
  const colliderId = `parked-${kind}-${position[0]},${position[2]}`
  useFootprintColliders(colliderId, position, heading, dims)

  return (
    <group position={[position[0], position[1], position[2]]} rotation-y={heading}>
      <VehicleModel kind={kind} />
    </group>
  )
}
