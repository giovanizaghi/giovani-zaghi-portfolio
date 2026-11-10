import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGameStore } from '../store/useGameStore'

interface SceneTriggerProps {
  /** Centro do gatilho no plano XZ */
  x: number
  z: number
  radius: number
  dialogueId: string
  /** true = dispara uma vez por mount; false = redISpara ao sair e voltar */
  once: boolean
}

/**
 * Gatilho de proximidade que abre um diálogo — versão genérica dos antigos
 * JourneyIntroTrigger/ForestExitTrigger. Com `once`, dispara uma única vez
 * por mount quando o player entra no raio; sem `once`, dispara a cada
 * entrada (borda de subida).
 */
export function SceneTrigger({ x, z, radius, dialogueId, once }: SceneTriggerProps) {
  const fired = useRef(false)
  const inside = useRef(false)
  const r2 = radius * radius

  useFrame(() => {
    const { playerPosition, openDialogue } = useGameStore.getState()
    const dx = playerPosition.x - x
    const dz = playerPosition.z - z
    const near = dx * dx + dz * dz < r2

    if (once) {
      if (!fired.current && near) {
        fired.current = true
        openDialogue(dialogueId)
      }
    } else {
      if (near && !inside.current) openDialogue(dialogueId)
      inside.current = near
    }
  })

  return null
}
