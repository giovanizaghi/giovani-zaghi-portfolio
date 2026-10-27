/**
 * Sistema de stats/progressão do personagem.
 *
 * Arquitetura em camadas (facilita o save — só `level`, `xp` e `statBonuses`
 * precisam ser persistidos):
 *
 *   stat_final = base(nível 1) × crescimento_por_nível + bônus_coletados
 *
 * Curva de XP: geométrica suave `base × level^1.5` (estilo Diablo II) —
 * nem linear (níveis tardios triviais) nem exponencial pura (parede).
 */

/** Nível máximo do personagem — a barra de XP trava cheia ao atingi-lo */
export const MAX_LEVEL = 20

/** Máximo de projéteis por ataque (também limita o pool visual do orbe) */
export const MAX_PROJECTILES = 5

/** Stats que definem o poder do personagem */
export interface StatBlock {
  /** Dano base de cada projétil do orbe */
  damage: number
  /** Ataques por segundo (cooldown = 1 / attackSpeed) */
  attackSpeed: number
  /** Projéteis disparados por ataque (leque) */
  projectiles: number
  /** Multiplicador de velocidade de movimento */
  moveSpeed: number
  /** Chance de crítico (0–1) */
  critChance: number
  /** Multiplicador de dano no crítico */
  critDamage: number
  /** Redução de dano recebido (0–0.8) */
  defense: number
  /** Vida máxima em corações */
  maxHearts: number
  /** Multiplicador de recarga de stamina */
  staminaRegen: number
  /** Multiplicador de XP ganho */
  xpGain: number
}

/** Valores no nível 1 — calibrados para os números já existentes no jogo */
export const BASE_STATS: StatBlock = {
  damage: 1,
  attackSpeed: 2.5, // cooldown 0.4s — mesmo do ATTACK_COOLDOWN original
  projectiles: 1,
  moveSpeed: 1,
  critChance: 0.05,
  critDamage: 1.5,
  defense: 0,
  maxHearts: 3,
  staminaRegen: 1,
  xpGain: 1,
}

/** Bônus iniciais — tudo zero; pickups/upgrades incrementam isso */
export const EMPTY_BONUSES: StatBlock = {
  damage: 0,
  attackSpeed: 0,
  projectiles: 0,
  moveSpeed: 0,
  critChance: 0,
  critDamage: 0,
  defense: 0,
  maxHearts: 0,
  staminaRegen: 0,
  xpGain: 0,
}

const DAMAGE_GROWTH = 1.08 // +8% de dano por nível
const ATTACK_SPEED_GROWTH = 0.02 // +2% linear por nível
const MOVE_SPEED_GROWTH = 0.005 // +0.5% por nível
const CRIT_CHANCE_GROWTH = 0.005 // +0.5pp por nível
const LEVELS_PER_HEART = 4 // +1 coração a cada 4 níveis
const MAX_DEFENSE = 0.8

/** XP necessário para sair de `level` para `level + 1` */
export function xpToNext(level: number): number {
  return Math.floor(40 * Math.pow(level, 1.5))
}

/** Stats efetivos do personagem: base escalado pelo nível + bônus coletados */
export function deriveStats(level: number, bonuses: StatBlock): StatBlock {
  return {
    damage: BASE_STATS.damage * Math.pow(DAMAGE_GROWTH, level - 1) + bonuses.damage,
    attackSpeed:
      BASE_STATS.attackSpeed * (1 + ATTACK_SPEED_GROWTH * (level - 1)) +
      bonuses.attackSpeed,
    projectiles: Math.min(
      MAX_PROJECTILES,
      Math.round(BASE_STATS.projectiles + bonuses.projectiles)
    ),
    moveSpeed:
      BASE_STATS.moveSpeed * (1 + MOVE_SPEED_GROWTH * (level - 1)) + bonuses.moveSpeed,
    critChance:
      Math.min(1, BASE_STATS.critChance + CRIT_CHANCE_GROWTH * (level - 1)) +
      bonuses.critChance,
    critDamage: BASE_STATS.critDamage + bonuses.critDamage,
    defense: Math.min(MAX_DEFENSE, BASE_STATS.defense + bonuses.defense),
    maxHearts:
      BASE_STATS.maxHearts + Math.floor((level - 1) / LEVELS_PER_HEART) + bonuses.maxHearts,
    staminaRegen: BASE_STATS.staminaRegen + bonuses.staminaRegen,
    xpGain: BASE_STATS.xpGain + bonuses.xpGain,
  }
}

/** Buff temporário (ex.: item Java) — expira por timestamp Date.now() */
export interface Buff {
  stat: keyof StatBlock
  amount: number
  expiresAt: number
}

/** Aplica buffs ativos por cima dos stats derivados */
export function applyBuffs(stats: StatBlock, buffs: Buff[]): StatBlock {
  const now = Date.now()
  const active = buffs.filter((b) => b.expiresAt > now)
  if (active.length === 0) return stats
  const out = { ...stats }
  for (const b of active) out[b.stat] += b.amount
  return out
}

/**
 * Upgrades oferecidos na tela de level-up — cada nível concede 1 escolha.
 * `amount` é somado ao bônus flat do stat correspondente.
 */
export interface LevelUpOption {
  id: 'attackSpeed' | 'damage' | 'projectiles'
  stat: keyof StatBlock
  amount: number
  icon: string
  name: string
  description: string
}

export const LEVEL_UP_OPTIONS: LevelUpOption[] = [
  {
    id: 'attackSpeed',
    stat: 'attackSpeed',
    amount: 0.35,
    icon: '⚡',
    name: 'Velocidade de Ataque',
    description: 'Ataca mais rápido (menor cooldown entre disparos)',
  },
  {
    id: 'damage',
    stat: 'damage',
    amount: 0.5,
    icon: '⚔',
    name: 'Dano',
    description: 'Cada projétil causa mais dano',
  },
  {
    id: 'projectiles',
    stat: 'projectiles',
    amount: 1,
    icon: '»',
    name: 'Tiro Adicional',
    description: 'Dispara um projétil a mais por ataque, em leque',
  },
]

/**
 * Scaling de inimigos em relação ao nível do player.
 * Regra de ouro da curva de dificuldade: HP inimigo cresce um pouco ACIMA
 * do dano do player (+8%/nível), senão o jogo fica trivial — mas longe de
 * 1:1 por muito tempo, senão vira treadmill (o jogador não sente progresso).
 */
export function enemyScaling(playerLevel: number) {
  return {
    /** Multiplicador de HP do inimigo — cresce mais rápido que o dano do player */
    hpMult: Math.pow(1.14, playerLevel - 1),
    /** Multiplicador de dano do inimigo — mais suave que HP */
    damageMult: Math.pow(1.1, playerLevel - 1),
    /** XP base que um inimigo desse nível recompensa */
    xpReward: Math.floor(8 * Math.pow(1.12, playerLevel - 1)),
  }
}
