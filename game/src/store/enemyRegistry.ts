import { Vector3 } from 'three'
import { useGameStore } from './useGameStore'

/** Dano aplicado a um inimigo — `from` dá a direção do knockback */
export interface EnemyHit {
  damage: number
  /** Força do pulo pra trás (stun). 0 = sem knockback */
  knockback?: number
  /** Posição de origem do golpe (projétil, explosão...) */
  from?: Vector3
}

/** Handle que ataques e efeitos de mundo usam para acertar um inimigo vivo */
export interface EnemyHandle {
  id: string
  /** Posição compartilhada — mutada por frame pelo próprio inimigo */
  position: Vector3
  /** Raio de colisão para receber hits */
  radius: number
  /** Aplica dano; o inimigo decide stun/knockback/morte */
  hit: (hit: EnemyHit) => void
  isAlive: () => boolean
  /** Alerta o inimigo (chamado pela horda quando um membro detecta o player) */
  alert: () => void
  /** Está engajado em combate agora (persegue/ataca) */
  inCombat: () => boolean
}

// Registry module-level (mesmo padrão do pool de partículas) —
// lido por Companion (projéteis) e ItemEffects (explosão/cobra) por frame
const enemies = new Map<string, EnemyHandle>()

// ---- Controle de batalha ----
// Inimigos engajados se registram aqui; 0→1 inicia a batalha, 1→0 termina
// (horda derrotada ou que perdeu o interesse) — usado para o autosave
const combatIds = new Set<string>()

export function setInCombat(id: string, active: boolean) {
  const wasInBattle = combatIds.size > 0
  if (active) combatIds.add(id)
  else combatIds.delete(id)
  const inBattle = combatIds.size > 0
  if (inBattle !== wasInBattle) {
    const store = useGameStore.getState()
    if (inBattle) store.startBattle()
    else store.endBattle()
  }
}

/** Alerta todos os inimigos vivos — um membro detectou o player, a horda toda ataca */
export function alertAllEnemies() {
  forEachEnemy((e) => e.alert())
}

export function registerEnemy(enemy: EnemyHandle) {
  enemies.set(enemy.id, enemy)
  return () => {
    enemies.delete(enemy.id)
  }
}

export function forEachEnemy(cb: (enemy: EnemyHandle) => void) {
  enemies.forEach((enemy) => {
    if (enemy.isAlive()) cb(enemy)
  })
}

/** Inimigo vivo mais próximo de `pos` (plano XZ), dentro de `maxDist` */
export function nearestEnemy(pos: Vector3, maxDist = Infinity): EnemyHandle | null {
  let best: EnemyHandle | null = null
  let bestDist = maxDist * maxDist
  enemies.forEach((enemy) => {
    if (!enemy.isAlive()) return
    const dx = enemy.position.x - pos.x
    const dz = enemy.position.z - pos.z
    const d = dx * dx + dz * dz
    if (d < bestDist) {
      bestDist = d
      best = enemy
    }
  })
  return best
}

/** I-frames do player contra inimigos — evita stunlock com vários crawlers */
const PLAYER_IFRAMES_MS = 900
let lastPlayerHitAt = -Infinity

/** Aplica dano no player respeitando a janela de invencibilidade pós-hit */
export function damagePlayer(amount: number) {
  const now = performance.now()
  if (now - lastPlayerHitAt < PLAYER_IFRAMES_MS) return
  lastPlayerHitAt = now
  useGameStore.getState().takeDamage(amount)
}
