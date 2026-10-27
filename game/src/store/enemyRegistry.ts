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

/** Zera o rastreio de combate — a Lua de Sangue chama ao remontar o mundo,
 *  senão ids de inimigos desmontados deixariam a batalha (e o bloqueio do
 *  autosave) presos para sempre */
export function clearCombat() {
  combatIds.clear()
  const store = useGameStore.getState()
  if (store.inBattle) store.endBattle()
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

/** Separação de horda: empurra `pos` para fora do raio dos outros inimigos
 *  vivos. Cada inimigo resolve só a METADE da penetração — o outro faz a
 *  parte dele no próprio useFrame, então o par se separa simetricamente
 *  sem overshoot. */
export function separateEnemy(selfId: string, pos: { x: number; z: number }, radius: number) {
  enemies.forEach((enemy) => {
    if (enemy.id === selfId || !enemy.isAlive()) return
    const dx = pos.x - enemy.position.x
    const dz = pos.z - enemy.position.z
    const min = radius + enemy.radius
    const d2 = dx * dx + dz * dz
    if (d2 < min * min && d2 > 1e-8) {
      const d = Math.sqrt(d2)
      const push = (min - d) * 0.5
      pos.x += (dx / d) * push
      pos.z += (dz / d) * push
    }
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

/** Timestamp (performance.now) do último dano aplicado — o Player usa para o solavanco + flash vermelho */
export function getLastPlayerHitAt() {
  return lastPlayerHitAt
}
