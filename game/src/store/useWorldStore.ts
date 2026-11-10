import { create } from 'zustand'
import bundledJson from '../data/default-world.json'
import { parseWorld } from '../data/worldSchema'
import type { SceneData, Vec3, WorldData } from '../data/world'

/**
 * Store do mundo — fonte única das cenas/diálogos em runtime.
 *
 * Inicializada de forma síncrona com o JSON embutido no build
 * (`src/data/default-world.json`, sempre validado por `parseWorld`).
 * `loadWorld()` pode trocar o mundo por um draft do editor (`?world=draft`
 * lê `localStorage['editor-world-draft']`) antes do App montar — a Fase 3
 * adiciona a busca do mundo publicado na API aqui também.
 */

export type WorldSource = 'bundled' | 'draft' | 'published'

interface WorldStore {
  world: WorldData
  /** De onde veio o mundo atual — 'bundled' = JSON do build */
  source: WorldSource
  setWorld: (world: WorldData, source: WorldSource) => void
  getScene: (id: string) => SceneData | undefined
  /** Spawn (respawn/fallback) da cena — undefined se a cena não existe */
  getSpawn: (id: string) => Vec3 | undefined
  getBounds: (id: string) => SceneData['bounds'] | undefined
  hasScene: (id: string) => boolean
}

// O JSON embutido SEMPRE passa pelo validador — nunca um cast cego
const bundled = parseWorld(bundledJson)
if (!bundled.ok) {
  throw new Error(`default-world.json inválido: ${bundled.errors.join('; ')}`)
}

export const useWorldStore = create<WorldStore>((set, get) => ({
  world: bundled.world,
  source: 'bundled',
  setWorld: (world, source) => set({ world, source }),
  getScene: (id) => get().world.scenes[id],
  getSpawn: (id) => get().world.scenes[id]?.spawn,
  getBounds: (id) => get().world.scenes[id]?.bounds,
  hasScene: (id) => Object.hasOwn(get().world.scenes, id),
}))

const DRAFT_STORAGE_KEY = 'editor-world-draft'

/**
 * Carrega o mundo ativo antes de montar o App:
 * `?world=draft` → rascunho do editor no localStorage (JSON.parse + parseWorld;
 * inválido/ausente → console.warn e mantém o bundled). Sem o parâmetro, não faz nada.
 */
export async function loadWorld(): Promise<void> {
  if (typeof window === 'undefined') return
  if (new URLSearchParams(window.location.search).get('world') !== 'draft') return
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
    if (!raw) {
      console.warn('[world] ?world=draft sem rascunho salvo — usando o mundo bundled')
      return
    }
    const parsed = parseWorld(JSON.parse(raw))
    if (!parsed.ok) {
      console.warn('[world] rascunho inválido — usando o mundo bundled:', parsed.errors)
      return
    }
    useWorldStore.getState().setWorld(parsed.world, 'draft')
  } catch (err) {
    console.warn('[world] falha ao carregar o rascunho — usando o mundo bundled', err)
  }
}
