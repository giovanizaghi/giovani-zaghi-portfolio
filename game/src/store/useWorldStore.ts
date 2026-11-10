import { create } from 'zustand'
import { bundledWorld } from '../data/bundledWorld'
import { parseWorld } from '../data/worldSchema'
import type { SceneData, Vec3, WorldData } from '../data/world'

/**
 * Store do mundo — fonte única das cenas/diálogos em runtime.
 *
 * Inicializada de forma síncrona com o JSON embutido no build
 * (`src/data/bundledWorld.ts`, já validado por `parseWorld`).
 * `loadWorld()` pode trocar o mundo por um draft do editor (`?world=draft`
 * lê `localStorage['editor-world-draft']`) antes do App montar — a Fase 3
 * adiciona a busca do mundo publicado na API aqui também.
 */

export type WorldSource = 'bundled' | 'draft' | 'published'

interface WorldStore {
  world: WorldData
  /** De onde veio o mundo atual — 'bundled' = JSON do build */
  source: WorldSource
  /** Versão publicada na API (só com source 'published'; null nos demais) */
  version: number | null
  /** Cena forçada por `?world=draft&scene=<id>` (modo teste do editor) —
   *  null = usa world.startScene. Só existe com source 'draft'. */
  testScene: string | null
  setWorld: (world: WorldData, source: WorldSource, version?: number | null) => void
  setTestScene: (sceneId: string | null) => void
  getScene: (id: string) => SceneData | undefined
  /** Spawn (respawn/fallback) da cena — undefined se a cena não existe */
  getSpawn: (id: string) => Vec3 | undefined
  getBounds: (id: string) => SceneData['bounds'] | undefined
  hasScene: (id: string) => boolean
}

export const useWorldStore = create<WorldStore>((set, get) => ({
  world: bundledWorld,
  source: 'bundled',
  version: null,
  testScene: null,
  setWorld: (world, source, version = null) => set({ world, source, version }),
  setTestScene: (sceneId) => set({ testScene: sceneId }),
  getScene: (id) => get().world.scenes[id],
  getSpawn: (id) => get().world.scenes[id]?.spawn,
  getBounds: (id) => get().world.scenes[id]?.bounds,
  hasScene: (id) => Object.hasOwn(get().world.scenes, id),
}))

const DRAFT_STORAGE_KEY = 'editor-world-draft'
const PUBLISHED_CACHE_KEY = 'world-published'
const PUBLISHED_TIMEOUT_MS = 4000

interface PublishedCache {
  version: number
  publishedAt: string
  data: unknown
}

function readPublishedCache(): PublishedCache | null {
  try {
    const raw = localStorage.getItem(PUBLISHED_CACHE_KEY)
    if (!raw) return null
    const c = JSON.parse(raw) as PublishedCache
    if (typeof c?.version !== 'number' || typeof c?.data !== 'object' || c.data === null)
      return null
    return c
  } catch {
    return null
  }
}

function writePublishedCache(c: PublishedCache): void {
  try {
    localStorage.setItem(PUBLISHED_CACHE_KEY, JSON.stringify(c))
  } catch {
    // sem espaço — cache é best-effort
  }
}

function clearPublishedCache(): void {
  try {
    localStorage.removeItem(PUBLISHED_CACHE_KEY)
  } catch {
    // ignora
  }
}

/**
 * Tenta carregar o mundo publicado na API (Fase 3). Prioridade:
 * 200 válido → published; 304 → cache; 404/rede/timeout → cache válido ou
 * bundled. Falhas são silenciosas para o jogador (no máximo um console.info).
 */
async function loadPublished(apiUrl: string): Promise<void> {
  const store = useWorldStore.getState()
  const cache = readPublishedCache()
  const headers: Record<string, string> = {}
  if (cache) headers['If-None-Match'] = `"v${cache.version}"`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), PUBLISHED_TIMEOUT_MS)
  try {
    const res = await fetch(`${apiUrl}/worlds/published`, {
      headers,
      signal: ctrl.signal,
    })
    if (res.status === 200) {
      const body = (await res.json()) as {
        version?: number
        publishedAt?: string
        data?: unknown
      }
      const parsed = parseWorld(body?.data)
      if (parsed.ok && typeof body.version === 'number') {
        writePublishedCache({
          version: body.version,
          publishedAt: body.publishedAt ?? '',
          data: body.data,
        })
        store.setWorld(parsed.world, 'published', body.version)
        console.info(`[world] mundo publicado v${body.version} carregado da API`)
        return
      }
      // 200 com payload inválido → cai para cache/bundled abaixo
    } else if (res.status === 304 && cache) {
      const parsed = parseWorld(cache.data)
      if (parsed.ok) {
        store.setWorld(parsed.world, 'published', cache.version)
        console.info(`[world] mundo publicado v${cache.version} (cache)`)
        return
      }
      clearPublishedCache()
    }
    // 404 e demais status → cache ou bundled
  } catch {
    // rede/timeout/JSON inválido → cache ou bundled
  } finally {
    clearTimeout(timer)
  }
  if (cache) {
    const parsed = parseWorld(cache.data)
    if (parsed.ok) {
      store.setWorld(parsed.world, 'published', cache.version)
      console.info(`[world] API indisponível — mundo publicado v${cache.version} do cache`)
      return
    }
    clearPublishedCache()
  }
  console.info('[world] sem mundo publicado — usando o bundled')
}

/**
 * Carrega o mundo ativo antes de montar o App:
 * 1. `?world=draft` → rascunho do editor no localStorage (modo teste);
 * 2. `VITE_API_URL` definido → mundo publicado na API (com cache/ETag);
 * 3. fallback: JSON embutido (já é o default da store).
 */
export async function loadWorld(): Promise<void> {
  if (typeof window === 'undefined') return
  const params = new URLSearchParams(window.location.search)

  if (params.get('world') === 'draft') {
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
      const store = useWorldStore.getState()
      store.setWorld(parsed.world, 'draft')
      // ?scene=<id> só vale se existir no draft — força a cena do teste
      const testScene = params.get('scene')
      store.setTestScene(
        testScene && parsed.world.scenes[testScene] ? testScene : null
      )
    } catch (err) {
      console.warn('[world] falha ao carregar o rascunho — usando o mundo bundled', err)
    }
    return
  }

  const apiUrl = import.meta.env.VITE_API_URL
  if (apiUrl) await loadPublished(String(apiUrl).replace(/\/+$/, ''))
}
