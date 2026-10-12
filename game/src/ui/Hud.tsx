import { useGameStore } from '../store/useGameStore'

export function Hud() {
  const hearts = useGameStore((s) => s.hearts)
  const maxHearts = useGameStore((s) => s.maxHearts)

  return (
    <div className="hud">
      <div className="hud-hearts">
        {Array.from({ length: maxHearts }).map((_, index) => (
          <span key={index} className={`heart ${index < hearts ? 'heart-full' : 'heart-empty'}`}>
            ♥
          </span>
        ))}
      </div>
    </div>
  )
}
