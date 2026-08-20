import { useEffect, useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import { dialogues } from '../data/dialogues'

const TYPEWRITER_MS = 25

/** Caixa de diálogo estilo RPG com efeito typewriter. Clique/E: completa a fala ou avança. */
export function DialogueBox() {
  const activeNpc = useGameStore((s) => s.activeNpc)
  const lineIndex = useGameStore((s) => s.lineIndex)
  const advanceDialogue = useGameStore((s) => s.advanceDialogue)

  const dialogue = activeNpc ? dialogues[activeNpc] : null
  const line = dialogue?.lines[lineIndex] ?? ''
  const [displayed, setDisplayed] = useState('')

  useEffect(() => {
    setDisplayed('')
    if (!line) return
    let i = 0
    const interval = setInterval(() => {
      i += 1
      setDisplayed(line.slice(0, i))
      if (i >= line.length) clearInterval(interval)
    }, TYPEWRITER_MS)
    return () => clearInterval(interval)
  }, [line])

  if (!dialogue) return null

  const finished = displayed.length >= line.length

  const onAdvance = () => {
    if (finished) advanceDialogue()
    else setDisplayed(line)
  }

  return (
    <div className="dialogue-box" onClick={onAdvance}>
      <span className="dialogue-name">{dialogue.name}</span>
      <p className="dialogue-text">{displayed}</p>
      <span className="dialogue-next">{finished ? 'E / clique ▼' : '...'}</span>
    </div>
  )
}
