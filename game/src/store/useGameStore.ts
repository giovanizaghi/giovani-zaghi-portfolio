import { create } from 'zustand'
import { Vector3 } from 'three'
import { dialogues } from '../data/dialogues'

export interface Collider {
  id: string
  position: Vector3
  radius: number
}

interface GameStore {
  /** Posição atual do player (Vector3 mutado por frame — leia via getState, sem re-render) */
  playerPosition: Vector3
  /** Id do NPC em alcance de interação (null = nenhum) */
  interactTarget: string | null
  /** Id do NPC com diálogo aberto (null = diálogo fechado) */
  activeNpc: string | null
  /** Índice da fala atual dentro do diálogo ativo */
  lineIndex: number
  /** Obstáculos que o player não pode atravessar */
  colliders: Collider[]
  setInteractTarget: (id: string | null) => void
  openDialogue: (npcId: string) => void
  /** Avança para a próxima fala; fecha o diálogo ao chegar no fim */
  advanceDialogue: () => void
  closeDialogue: () => void
  registerCollider: (collider: Collider) => void
  unregisterCollider: (id: string) => void
}

export const useGameStore = create<GameStore>((set, get) => ({
  playerPosition: new Vector3(0, 0, 0),
  interactTarget: null,
  activeNpc: null,
  lineIndex: 0,
  colliders: [],
  setInteractTarget: (id) => {
    if (get().interactTarget !== id) set({ interactTarget: id })
  },
  openDialogue: (npcId) => set({ activeNpc: npcId, lineIndex: 0 }),
  advanceDialogue: () => {
    const { activeNpc, lineIndex } = get()
    if (!activeNpc) return
    const total = dialogues[activeNpc]?.lines.length ?? 0
    if (lineIndex + 1 >= total) {
      set({ activeNpc: null, lineIndex: 0 })
    } else {
      set({ lineIndex: lineIndex + 1 })
    }
  },
  closeDialogue: () => set({ activeNpc: null, lineIndex: 0 }),
  registerCollider: (collider) => {
    set((state) => ({
      colliders: state.colliders.some((c) => c.id === collider.id)
        ? state.colliders
        : [...state.colliders, collider],
    }))
  },
  unregisterCollider: (id) => {
    set((state) => ({
      colliders: state.colliders.filter((c) => c.id !== id),
    }))
  },
}))
