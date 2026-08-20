import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'

/**
 * Tecla E: abre diálogo com o NPC em alcance ou avança a fala atual.
 * Escape: fecha o diálogo.
 */
export function useInteractionKey() {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const { activeNpc, interactTarget, openDialogue, advanceDialogue, closeDialogue } =
        useGameStore.getState()

      if (e.code === 'Escape' && activeNpc) {
        closeDialogue()
        return
      }

      if (e.code !== 'KeyE') return
      if (activeNpc) {
        advanceDialogue()
      } else if (interactTarget) {
        openDialogue(interactTarget)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])
}
