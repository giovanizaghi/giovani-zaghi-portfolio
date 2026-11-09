import { Transport } from './Transport'
import type { TransportKind, TransportRide } from '../data/transports'
import type { SceneId } from '../store/useGameStore'

/**
 * Ponto de embarque dos transportes da cena 'outside' — cada um leva ao
 * Terminal Central e deixa o player na plataforma correspondente de lá.
 *
 * Convenção de direção (eixos do MUNDO): north = -Z, south = +Z,
 * east = +X, west = -X — ver DIRECTION_VECTORS em data/transports.ts.
 *
 * Posicionamento:
 * - elevador  up       (-13, 4)   — lado oeste, em frente ao gramado
 * - carro     east     (12.5, 2)  — faixa leste, próximo à casa
 * - van       south    (18.5, 7)  — faixa leste, mais ao sul
 * - ônibus    north    (16, 16)   — fundo da faixa leste
 * - avião     northwest(-16, 9)   — lado oeste, "pista" implícita
 */

interface Departure {
  id: string
  kind: TransportKind
  position: [number, number, number]
  ride: TransportRide
  /** Spawn no Terminal Central — em frente à plataforma do mesmo tipo */
  spawn: [number, number, number]
}

// Todos os transportes do quintal levam ao Terminal (único destino por ora)
const DEPARTURES: (Departure & { scene: SceneId })[] = [
  {
    id: 'outside-elevator',
    kind: 'elevator',
    position: [-13, 0, 4],
    ride: { kind: 'elevator', vertical: 'up' },
    scene: 'terminal',
    spawn: [-10.5, 0, -4.0],
  },
  {
    id: 'outside-car',
    kind: 'car',
    position: [12.5, 0, 2],
    ride: { kind: 'car', direction: 'east' },
    scene: 'terminal',
    spawn: [-5.5, 0, -4.0],
  },
  {
    id: 'outside-van',
    kind: 'van',
    position: [18.5, 0, 7],
    ride: { kind: 'van', direction: 'south' },
    scene: 'terminal',
    spawn: [-1, 0, -4.0],
  },
  {
    id: 'outside-bus',
    kind: 'bus',
    position: [16, 0, 16],
    ride: { kind: 'bus', direction: 'north' },
    scene: 'terminal',
    spawn: [4.5, 0, -3.9],
  },
  {
    id: 'outside-plane',
    kind: 'plane',
    position: [-16, 0, 9],
    ride: { kind: 'plane', direction: 'northwest' },
    scene: 'terminal',
    spawn: [9.5, 0, 5.6],
  },
]

/** Os 5 transportes de partida espalhados pelo quintal/floresta */
export function TransportStation() {
  return (
    <group>
      {DEPARTURES.map((d) => (
        <Transport
          key={d.id}
          id={d.id}
          kind={d.kind}
          position={d.position}
          ride={d.ride}
          scene={d.scene}
          spawn={d.spawn}
        />
      ))}
    </group>
  )
}
