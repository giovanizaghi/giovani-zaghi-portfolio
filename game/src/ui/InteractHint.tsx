import { useGameStore } from '../store/useGameStore'
import { dialogues } from '../data/dialogues'

/** "Pressione E para falar" exibido quando o player está perto de um NPC */
export function InteractHint() {
  const interactTarget = useGameStore((s) => s.interactTarget)
  const activeNpc = useGameStore((s) => s.activeNpc)

  if (!interactTarget || activeNpc) return null

  return (
    <div className="interact-hint">
      <kbd>E</kbd> Falar com {dialogues[interactTarget]?.name ?? 'NPC'}
    </div>
  )
}
