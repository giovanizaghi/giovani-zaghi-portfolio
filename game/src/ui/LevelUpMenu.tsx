import { useEffect } from 'react'
import { useGameStore, getEffectiveStats } from '../store/useGameStore'
import { LEVEL_UP_OPTIONS, MAX_PROJECTILES } from '../data/stats'
import type { StatBlock } from '../data/stats'

/** Formata o valor atual/próximo de cada stat no card */
const FORMAT: Record<string, (v: number) => string> = {
  attackSpeed: (v) => `${v.toFixed(1)}/s`,
  damage: (v) => v.toFixed(1),
  projectiles: (v) => `×${Math.round(v)}`,
}

const isMaxed = (option: (typeof LEVEL_UP_OPTIONS)[number], stats: StatBlock) =>
  option.stat === 'projectiles' && stats.projectiles >= MAX_PROJECTILES

/**
 * Tela de level-up: abre quando `pendingLevelUps > 0` (ver addXp) e pausa o
 * jogo. O jogador escolhe 1 upgrade por nível ganho — clique ou teclas 1–3.
 */
export function LevelUpMenu() {
  const pendingLevelUps = useGameStore((s) => s.pendingLevelUps)
  const level = useGameStore((s) => s.level)
  const statBonuses = useGameStore((s) => s.statBonuses)

  useEffect(() => {
    if (pendingLevelUps <= 0) return
    const onKeyDown = (e: KeyboardEvent) => {
      const index = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(
        e.code
      ) % 3
      const option = LEVEL_UP_OPTIONS[index]
      if (index >= 0 && option) {
        e.preventDefault()
        useGameStore.getState().chooseUpgrade(option.id)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [pendingLevelUps])

  if (pendingLevelUps <= 0) return null

  const stats = getEffectiveStats()

  return (
    <div className="levelup">
      <div className="levelup-title">LEVEL UP!</div>
      <p className="levelup-sub">
        Nível {level} alcançado — escolha um upgrade
        {pendingLevelUps > 1 && (
          <span className="levelup-remaining"> ({pendingLevelUps} escolhas restantes)</span>
        )}
      </p>
      <div className="levelup-cards">
        {LEVEL_UP_OPTIONS.map((option, i) => {
          const maxed = isMaxed(option, stats)
          const picked = Math.round(statBonuses[option.stat] / option.amount)
          return (
            <button
              key={option.id}
              className="levelup-card"
              disabled={maxed}
              onClick={() => useGameStore.getState().chooseUpgrade(option.id)}
            >
              <span className="levelup-key">{i + 1}</span>
              <span className="levelup-icon">{option.icon}</span>
              <span className="levelup-name">{option.name}</span>
              <span className="levelup-desc">{option.description}</span>
              <span className="levelup-value">
                {maxed ? (
                  'MÁX'
                ) : (
                  <>
                    {FORMAT[option.id](stats[option.stat])}
                    <span className="levelup-arrow"> → </span>
                    {FORMAT[option.id](stats[option.stat] + option.amount)}
                  </>
                )}
              </span>
              {picked > 0 && <span className="levelup-rank">Nv {picked}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
