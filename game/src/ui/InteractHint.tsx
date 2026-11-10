import { useGameStore } from '../store/useGameStore'
import { useWorldStore } from '../store/useWorldStore'
import { KEY_COLORS } from '../data/keys'

/** "Pressione E para falar" exibido quando o player está perto de um NPC ou porta */
export function InteractHint() {
  const interactTarget = useGameStore((s) => s.interactTarget)
  const interactDoor = useGameStore((s) => s.interactDoor)
  const activeNpc = useGameStore((s) => s.activeNpc)
  const gameOver = useGameStore((s) => s.gameOver)
  const transition = useGameStore((s) => s.transition)
  // Assina chaves e portas abertas para o texto atualizar ao vivo
  const keys = useGameStore((s) => s.keys)
  const unlockedDoors = useGameStore((s) => s.unlockedDoors)
  const npcName = useWorldStore((s) =>
    interactTarget ? s.world.dialogues[interactTarget]?.name : undefined
  )

  if (transition || gameOver || activeNpc || (!interactTarget && !interactDoor)) return null

  let label = interactDoor
    ? interactDoor.label
    : `Falar com ${npcName ?? 'NPC'}`

  const lock = interactDoor?.lock
  if (lock && !unlockedDoors[lock.id]) {
    const keyName = KEY_COLORS[lock.color].name
    label =
      keys[lock.color] > 0
        ? `Destrancar (chave ${keyName})`
        : `Trancada — precisa da chave ${keyName}`
  }

  return (
    <div className="interact-hint">
      <kbd>E</kbd> {label}
    </div>
  )
}
