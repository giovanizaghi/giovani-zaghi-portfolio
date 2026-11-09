import { useEffect } from 'react'
import { Html } from '@react-three/drei'
import { Vector3 } from 'three'
import { useGameStore } from '../store/useGameStore'
import { Transport, ParkedVehicle } from './Transport'
import type { TransportKind } from '../data/transports'

/**
 * Terminal Central — destino único de todos os transportes do jogo.
 *
 * Layout: fileira de plataformas de embarque ao norte (z = -6.5), uma por
 * tipo de veículo, cada uma com o veículo estacionado (`ParkedVehicle`);
 * a pista do avião fica a leste; o elevador de retorno (único `<Transport>`
 * interativo da cena) fica ao sul, voltando para 'outside'.
 *
 * Os spawns de chegada ficam ao sul de cada plataforma — ver TransportStation.
 */

interface Platform {
  kind: TransportKind
  label: string
  /** Centro da plataforma/veículo */
  position: [number, number, number]
  /** Direção para a qual o veículo estacionado "olha" */
  direction?: 'east' | 'south' | 'north' | 'west'
  /** Cor da faixa frontal da plataforma */
  accent: string
}

// Fileira norte de plataformas (z = -6.5), da mais oeste para a mais leste
const PLATFORMS: Platform[] = [
  { kind: 'elevator', label: 'ELEVADOR', position: [-10.5, 0, -6.5], accent: '#7fb3d5' },
  { kind: 'car', label: 'CARRO', position: [-5.5, 0, -6.5], direction: 'east', accent: '#d94f3d' },
  { kind: 'van', label: 'VAN', position: [-1, 0, -6.5], direction: 'east', accent: '#e8e4da' },
  { kind: 'bus', label: 'ÔNIBUS', position: [4.5, 0, -6.5], direction: 'east', accent: '#3d6ea5' },
]

// Pista do avião — a leste, com o avião virado para +X
const RUNWAY = { position: [9, -0.06, 3] as [number, number, number], size: [9, 0.08, 4] as [number, number, number] }
const PLANE_PLATFORM: Platform = {
  kind: 'plane',
  label: 'AVIÃO',
  position: [9.5, 0, 3],
  direction: 'east',
  accent: '#d94f3d',
}

// Tamanho da laje de cada plataforma [largura X, profundidade Z]
const PLATFORM_SIZES: Record<TransportKind, [number, number]> = {
  elevator: [3.4, 3.2],
  car: [3.6, 3.2],
  van: [4.0, 3.2],
  bus: [6.6, 3.4],
  plane: [10, 4.4],
}

// Letreiros de plataforma — flutuam na borda frontal (sul) de cada baia
const LABEL_Y = 0.55

// Elevador de retorno — único transporte interativo do terminal
const RETURN_ELEVATOR = {
  id: 'terminal-elevator',
  position: [-1.5, 0, 7] as [number, number, number],
  // Desce de volta ao quintal, do lado do elevador de partida (-13, 4)
  spawn: [-10.8, 0, 4] as [number, number, number],
}

// Placas de canteiro — decoração com colisão
const PLANTERS: { position: [number, number, number]; size: number }[] = [
  { position: [-12, 0, 8.5], size: 1.3 },
  { position: [12, 0, 7.5], size: 1.3 },
  { position: [-11.5, 0, -9.3], size: 1.3 },
  { position: [11.5, 0, -9.3], size: 1.3 },
]

// Postes do letreiro TERMINAL
const SIGN_POSTS: [number, number, number][] = [
  [-3.4, 0, -9.6],
  [3.4, 0, -9.6],
]

const SIGN_Z = -9.6

/** Colliders fixos do cenário: postes do letreiro + canteiros */
const FIXED_COLLIDERS = [
  ...SIGN_POSTS.map(([x, , z], i) => ({
    id: `terminal-sign-${i}`,
    position: new Vector3(x, 0, z),
    radius: 0.35,
  })),
  ...PLANTERS.map((p, i) => ({
    id: `terminal-planter-${i}`,
    position: new Vector3(p.position[0], 0, p.position[2]),
    radius: p.size * 0.6,
  })),
]

/** Terminal Central — montada quando scene === 'terminal' */
export function TerminalScenario() {
  useEffect(() => {
    const { registerCollider, unregisterCollider } = useGameStore.getState()
    FIXED_COLLIDERS.forEach(registerCollider)
    return () => FIXED_COLLIDERS.forEach(({ id }) => unregisterCollider(id))
  }, [])

  return (
    <group>
      {/* chão pavimentado da praça */}
      <mesh position={[0, -0.2, 0]} receiveShadow>
        <boxGeometry args={[30, 0.2, 24]} />
        <meshBasicMaterial color="#6f7683" />
      </mesh>

      {/* pista do avião + faixa central tracejada */}
      <mesh position={RUNWAY.position} receiveShadow>
        <boxGeometry args={RUNWAY.size} />
        <meshBasicMaterial color="#454c57" />
      </mesh>
      {[5.5, 7, 8.5, 10, 11.5].map((x, i) => (
        <mesh key={`dash-${i}`} position={[x, -0.015, RUNWAY.position[2]]} receiveShadow>
          <boxGeometry args={[0.5, 0.02, 0.12]} />
          <meshBasicMaterial color="#e8ecf2" />
        </mesh>
      ))}

      {/* letreiro TERMINAL — dois postes + travessa + texto */}
      {SIGN_POSTS.map(([x, , z], i) => (
        <mesh key={`sign-post-${i}`} position={[x, 2.1, z]} castShadow>
          <boxGeometry args={[0.3, 4.2, 0.3]} />
          <meshStandardMaterial color="#3c4653" />
        </mesh>
      ))}
      <mesh position={[0, 4.3, SIGN_Z]} castShadow>
        <boxGeometry args={[7.6, 0.35, 0.35]} />
        <meshStandardMaterial color="#3c4653" />
      </mesh>
      {/* sem distanceFactor: com câmera ortográfica zoom=62 ele geraria
          escala ~zoom*factor e o letreiro cobriria a tela inteira */}
      <Html position={[0, 4.85, SIGN_Z]} center zIndexRange={[8, 0]}>
        <div className="terminal-sign">TERMINAL</div>
      </Html>

      {/* plataformas de embarque + veículos estacionados */}
      {PLATFORMS.map((p) => {
        const [w, d] = PLATFORM_SIZES[p.kind]
        const [x, , z] = p.position
        return (
          <group key={`platform-${p.kind}`}>
            <mesh position={[x, -0.05, z]} receiveShadow>
              <boxGeometry args={[w, 0.12, d]} />
              <meshBasicMaterial color="#8d97a5" />
            </mesh>
            {/* faixa de destaque na borda frontal */}
            <mesh position={[x, 0.02, z + d / 2 - 0.12]}>
              <boxGeometry args={[w * 0.92, 0.02, 0.18]} />
              <meshBasicMaterial color={p.accent} />
            </mesh>
            <ParkedVehicle
              kind={p.kind}
              position={p.position}
              direction={p.direction}
            />
            <Html
              position={[x, LABEL_Y, z + d / 2 + 0.45]}
              center
              zIndexRange={[8, 0]}
            >
              <div className="platform-label">{p.label}</div>
            </Html>
          </group>
        )
      })}

      {/* plataforma do avião = a própria pista */}
      <ParkedVehicle kind={PLANE_PLATFORM.kind} position={PLANE_PLATFORM.position} direction={PLANE_PLATFORM.direction} />
      <Html
        position={[PLANE_PLATFORM.position[0], LABEL_Y, PLANE_PLATFORM.position[2] + PLATFORM_SIZES.plane[1] / 2 + 0.4]}
        center
        zIndexRange={[8, 0]}
      >
        <div className="platform-label">{PLANE_PLATFORM.label}</div>
      </Html>

      {/* elevador de retorno — desce de volta ao quintal */}
      <Transport
        id={RETURN_ELEVATOR.id}
        kind="elevator"
        position={RETURN_ELEVATOR.position}
        ride={{ kind: 'elevator', vertical: 'down' }}
        scene="outside"
        spawn={RETURN_ELEVATOR.spawn}
      />

      {/* canteiros */}
      {PLANTERS.map((p, i) => (
        <group key={`planter-${i}`} position={p.position}>
          <mesh position={[0, 0.35, 0]} castShadow receiveShadow>
            <boxGeometry args={[p.size, 0.7, p.size]} />
            <meshStandardMaterial color="#7a5c3f" />
          </mesh>
          <mesh position={[0, 0.8, 0]} castShadow>
            <boxGeometry args={[p.size + 0.15, 0.3, p.size + 0.15]} />
            <meshStandardMaterial color="#4f7a45" />
          </mesh>
        </group>
      ))}
    </group>
  )
}
