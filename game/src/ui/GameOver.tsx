import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'

/**
 * Tela de game over — abre quando `hearts` chega a 0 (ver takeDamage).
 * Continuar (Enter/E ou clique) respawna no ponto da cena atual com vida cheia.
 */
export function GameOver() {
  const gameOver = useGameStore((s) => s.gameOver)
  const respawn = useGameStore((s) => s.respawn)

  useEffect(() => {
    if (!gameOver) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Enter' || e.code === 'KeyE' || e.code === 'Space') {
        e.preventDefault()
        respawn()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [gameOver, respawn])

  if (!gameOver) return null

  return (
    <div className="gameover">
      <div className="gameover-title">GAME OVER</div>
      <p className="gameover-sub">Os dígitos se apagaram por um instante...</p>
      <button className="gameover-btn" onClick={respawn} autoFocus>
        Continuar <kbd>Enter</kbd>
      </button>
    </div>
  )
}
