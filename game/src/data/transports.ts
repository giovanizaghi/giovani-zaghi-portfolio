/**
 * Transportes — veículos que levam o player de uma cena para outra com
 * uma animação de viagem (em vez do teleporte instantâneo das portas).
 *
 * O fluxo é: `DoorTarget.transport` → `interactWithDoor` → `startTransport`
 * (guarda `ActiveTransition` na store) → o `<Transport>` animado na cena de
 * origem detecta a transição pelo `id` e roda a animação pelo relógio →
 * `finishTransport` → `enterScene` carrega a cena destino.
 */

/** Tipos de transporte disponíveis */
export type TransportKind = 'elevator' | 'car' | 'van' | 'bus' | 'plane'

/**
 * Direções de bússola no plano XZ do MUNDO (não da câmera):
 * north = -Z, south = +Z, east = +X, west = -X.
 * As diagonais são vetores unitários normalizados (√2/2 em cada eixo).
 */
export type CompassDirection =
  | 'north'
  | 'northeast'
  | 'east'
  | 'southeast'
  | 'south'
  | 'southwest'
  | 'west'
  | 'northwest'

export const DIRECTION_VECTORS: Record<CompassDirection, { x: number; z: number }> = {
  north: { x: 0, z: -1 },
  northeast: { x: Math.SQRT1_2, z: -Math.SQRT1_2 },
  east: { x: 1, z: 0 },
  southeast: { x: Math.SQRT1_2, z: Math.SQRT1_2 },
  south: { x: 0, z: 1 },
  southwest: { x: -Math.SQRT1_2, z: Math.SQRT1_2 },
  west: { x: -1, z: 0 },
  northwest: { x: -Math.SQRT1_2, z: -Math.SQRT1_2 },
}

/** Sentido vertical do elevador — o único transporte sem direção de bússola */
export type VerticalDirection = 'up' | 'down'

/**
 * A viagem programada num `<Transport>`/`DoorTarget`:
 * - elevador: sempre sobe ou desce (nunca sai andando)
 * - carro/van/ônibus: partem na `direction` programada
 * - avião: taxi na `direction` e depois escala diagonal para cima
 */
export type TransportRide =
  | { kind: 'elevator'; vertical: VerticalDirection }
  | { kind: 'car' | 'van' | 'bus' | 'plane'; direction: CompassDirection }

/** Vínculo entre a porta/anel de interação e a viagem — vai em `DoorTarget.transport` */
export interface TransportLink {
  /** Id do `<Transport>` na cena de origem que executa a animação */
  id: string
  ride: TransportRide
}

export interface TransportConfig {
  /** Rótulo do hint de interação ("E — ...") */
  label: string
  /** Duração total da animação de viagem (s) — a cena destino só carrega no fim */
  duration: number
  /** Distância percorrida no plano XZ (veículos de rua); 0 nos demais */
  travel: number
  /** Fração da duração em que o avião ainda está taxiando no chão */
  taxiFraction: number
  /** Altura máxima da escalada do avião (subida em ~30°) */
  climbHeight: number
  /** Curso vertical do elevador (subida positiva / descida negativa) */
  rise: number
  /** Tempo de fechamento das portas do elevador no início da viagem */
  doorTime: number
}

/**
 * Configuração por tipo. As distâncias são calibradas para o veículo sair
 * da tela antes do fim da animação (meio-altura do ortho ≈ 7–8 unidades).
 */
export const TRANSPORT_CONFIG: Record<TransportKind, TransportConfig> = {
  elevator: {
    label: 'Pegar o elevador',
    duration: 2.8,
    travel: 0,
    taxiFraction: 0,
    climbHeight: 0,
    rise: 9,
    doorTime: 0.5,
  },
  car: {
    label: 'Entrar no carro',
    duration: 2.4,
    travel: 30,
    taxiFraction: 0,
    climbHeight: 0,
    rise: 0,
    doorTime: 0,
  },
  van: {
    label: 'Entrar na van',
    duration: 2.6,
    travel: 32,
    taxiFraction: 0,
    climbHeight: 0,
    rise: 0,
    doorTime: 0,
  },
  bus: {
    label: 'Pegar o ônibus',
    duration: 3.0,
    travel: 34,
    taxiFraction: 0,
    climbHeight: 0,
    rise: 0,
    doorTime: 0,
  },
  plane: {
    label: 'Embarcar no avião',
    duration: 4.0,
    travel: 10,
    taxiFraction: 0.35,
    climbHeight: 12,
    rise: 0,
    doorTime: 0,
  },
}
