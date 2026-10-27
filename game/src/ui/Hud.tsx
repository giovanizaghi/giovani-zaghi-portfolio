import { useGameStore } from '../store/useGameStore'
import { xpToNext, MAX_LEVEL } from '../data/stats'

export function Hud() {
  const hearts = useGameStore((s) => s.hearts)
  const maxHearts = useGameStore((s) => s.maxHearts)
  const level = useGameStore((s) => s.level)
  const xp = useGameStore((s) => s.xp)
  const inBattle = useGameStore((s) => s.inBattle)
  const isMaxLevel = level >= MAX_LEVEL
  const xpProgress = isMaxLevel ? 1 : Math.min(1, xp / xpToNext(level))

  return (
    <div className="hud">
      <div className="hud-hearts">
        {Array.from({ length: maxHearts }).map((_, index) => (
          <span key={index} className={`heart ${index < hearts ? 'heart-full' : 'heart-empty'}`}>
            ♥
          </span>
        ))}
      </div>
      <div className="hud-level">
        <span className="hud-level-badge">Nv {level}{isMaxLevel ? ' MÁX' : ''}</span>
        <div className="hud-xp-bar">
          <div className="hud-xp-fill" style={{ width: `${xpProgress * 100}%` }} />
        </div>
      </div>
      {inBattle && <div className="battle-indicator">⚔ EM BATALHA</div>}
    </div>
  )
}
