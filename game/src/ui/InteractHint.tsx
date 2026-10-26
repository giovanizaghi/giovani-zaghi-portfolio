import { useGameStore } from '../store/useGameStore'
import { dialogues } from '../data/dialogues'

/** "Pressione E para falar" exibido quando o player está perto de um NPC */
export function InteractHint() {
  const interactTarget = useGameStore((s) => s.interactTarget)
  const interactDoor = useGameStore((s) => s.interactDoor)
  const activeNpc = useGameStore((s) => s.activeNpc)
  const gameOver = useGameStore((s) => s.gameOver)

  if (gameOver || activeNpc || (!interactTarget && !interactDoor)) return null

  return (
    <div className="interact-hint">
      <kbd>E</kbd>{' '}
      {interactDoor ? interactDoor.label : `Falar com ${dialogues[interactTarget!]?.name ?? 'NPC'}`}
    </div>
  )
}
