import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'

/**
 * Tab: abre/fecha o menu de inventário (ignora durante diálogo).
 * Escape: fecha o menu antes do diálogo.
 */
export function useMenuKey() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { menuOpen, activeNpc, setMenuOpen, gameOver } = useGameStore.getState()

      if (gameOver) return

      if (e.code === 'Tab') {
        // Tab move o foco do browser — sempre previnir
        e.preventDefault()
        if (!activeNpc) setMenuOpen(!menuOpen)
        return
      }

      if (e.code === 'Escape' && menuOpen) {
        setMenuOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
