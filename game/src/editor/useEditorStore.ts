import { create } from 'zustand'
import type { Dialogue, Entity, SceneData, WorldData } from '../data/world'
import { createEmptyScene } from '../data/world'
import { loadDraft, saveDraft, bundledClone } from './draft'
import { ENTITY_DEF_MAP, ENTITY_DEFS } from './entityDefs'
import * as ops from './ops'
import type { SceneReference } from './ops'

/**
 * Store do editor de níveis (/editor) — mundo em edição, seleção, ferramenta,
 * câmera, histórico (undo/redo) e rascunho no localStorage.
 *
 * Todo `commit` tira um snapshot do mundo anterior para `history.past`
 * (cap 100) e agenda `saveDraft` com debounce de 800 ms. Drags (mover
 * entidades, spawn, bordas do bounds) usam `beginEdit`/`editLive`/`endEdit`
 * para gerar UM único passo de undo por gesto.
 */

export type EditorTool = 'select' | Entity['type']

export interface CameraState {
  /** Centro do viewport em coordenadas do mundo (x, z) */
  cx: number
  cz: number
  /** Pixels por unidade do mundo */
  scale: number
}

export interface PickMode {
  entityId: string
  sourceSceneId: string
  field: 'toSpawn'
}

/** Fatia da Fase 3 — placeholder, nada é chamado ainda */
export interface RemoteState {
  status: 'idle' | 'saving' | 'saved' | 'error'
  lastSavedAt: number | null
  publishedVersion: number | null
}

interface EditorStore {
  world: WorldData
  currentSceneId: string
  /** Ids das entidades selecionadas na cena atual */
  selection: string[]
  tool: EditorTool
  paletteTab: 'entities' | 'dialogues'
  /** Diálogo aberto no painel direito (aba Diálogos) */
  editingDialogueId: string | null
  camera: CameraState
  /** Tamanho do canvas em px CSS — alimenta o ajuste de câmera */
  viewport: { w: number; h: number }
  showGrid: boolean
  /** Há alterações ainda não gravadas no localStorage (debounce pendente) */
  dirty: boolean
  lastSavedAt: number | null
  pickMode: PickMode | null
  mouse: { x: number; z: number } | null
  /** Modal remoto aberto: login do token da API ou lista de versões */
  remoteModal: 'login' | 'versions' | null
  /** Visão do viewport: mapa 2D ou cena 3D real (mesma área, estado compartilhado) */
  viewMode: '2d' | '3d'
  /** Modo do gizmo TransformControls na visão 3D */
  gizmoMode: 'translate' | 'rotate' | 'scale'
  history: { past: WorldData[]; future: WorldData[] }
  remote: RemoteState

  // ---- núcleo ----
  /** Aplica mutação num clone do mundo: 1 snapshot no histórico + save debounced */
  commit: (mutator: (w: WorldData) => void) => void
  /** Substitui o mundo inteiro como um commit (undoável) — import/restaurar */
  replaceWorld: (world: WorldData) => void
  /** Mutação ao vivo durante drag — SEM histórico; o snapshot vai no endEdit */
  editLive: (mutator: (w: WorldData) => void) => void
  beginEdit: () => void
  endEdit: () => void
  undo: () => void
  redo: () => void
  /** Grava o rascunho imediatamente (botão Salvar / Testar) */
  saveNow: () => void

  // ---- navegação/UI ----
  setCurrentScene: (id: string) => void
  setSelection: (ids: string[]) => void
  toggleSelection: (id: string) => void
  clearSelection: () => void
  setTool: (tool: EditorTool) => void
  setPaletteTab: (tab: 'entities' | 'dialogues') => void
  setEditingDialogue: (id: string | null) => void
  setCamera: (camera: CameraState) => void
  /** Centraliza a câmera nos bounds da cena (ajuste = caber com margem) */
  centerCameraOn: (sceneId?: string) => void
  setViewport: (w: number, h: number) => void
  toggleGrid: () => void
  setMouse: (x: number, z: number) => void
  setPickMode: (pick: PickMode | null) => void
  setViewMode: (mode: '2d' | '3d') => void
  toggleViewMode: () => void
  setGizmoMode: (mode: 'translate' | 'rotate' | 'scale') => void
  setRemoteModal: (modal: 'login' | 'versions' | null) => void

  // ---- entidades ----
  addEntityAt: (type: Entity['type'], x: number, z: number) => void
  updateEntity: (sceneId: string, entityId: string, mutator: (e: Entity) => void) => void
  setEntityField: (sceneId: string, entityId: string, key: string, value: unknown) => void
  removeEntities: (sceneId: string, ids: string[]) => void
  duplicateEntities: (sceneId: string, ids: string[]) => void
  rotateEntities: (sceneId: string, ids: string[]) => void

  // ---- cenas ----
  createScene: () => void
  duplicateScene: (id: string) => void
  renameScene: (id: string) => void
  deleteScene: (id: string) => void
  setStartScene: (id: string) => void
  updateScene: (sceneId: string, mutator: (s: SceneData) => void) => void

  // ---- diálogos ----
  addDialogue: () => void
  renameDialogue: (oldId: string, newId: string) => void
  deleteDialogue: (id: string) => void
  updateDialogue: (id: string, mutator: (d: Dialogue) => void) => void

  // ---- spawn picker ----
  startPick: (entityId: string) => void
  cancelPick: () => void
  completePick: (x: number, z: number) => void
}

// ---- Internos do módulo (fora do estado reativo) ----

const HISTORY_CAP = 100
const SAVE_DEBOUNCE_MS = 800

let dragSnapshot: WorldData | null = null
let dragChanged = false
let saveTimer: ReturnType<typeof setTimeout> | null = null

function scheduleSave(get: () => EditorStore, set: (p: Partial<EditorStore>) => void) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    saveDraft(get().world)
    set({ dirty: false, lastSavedAt: Date.now() })
  }, SAVE_DEBOUNCE_MS)
}

function saveNow(get: () => EditorStore, set: (p: Partial<EditorStore>) => void) {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  saveDraft(get().world)
  set({ dirty: false, lastSavedAt: Date.now() })
}

/** Ajusta a câmera para caber nos bounds da cena com margem */
function cameraForBounds(
  bounds: SceneData['bounds'],
  viewport: { w: number; h: number }
): CameraState {
  const bw = Math.max(4, bounds.maxX - bounds.minX + 6)
  const bd = Math.max(4, bounds.maxZ - bounds.minZ + 6)
  const scale = Math.min(viewport.w / bw, viewport.h / bd)
  return {
    cx: (bounds.minX + bounds.maxX) / 2,
    cz: (bounds.minZ + bounds.maxZ) / 2,
    scale: Math.min(90, Math.max(6, scale)),
  }
}

const SCENE_ID_RE = /^[a-z0-9_-]+$/

function promptSceneId(suggested: string): string | null {
  const id = prompt('Id da cena (a-z, 0-9, _ e - — imutável depois de criada):', suggested)
  if (id === null) return null
  const trimmed = id.trim()
  if (!SCENE_ID_RE.test(trimmed)) {
    alert('Id inválido — use apenas letras minúsculas, números, _ e -')
    return null
  }
  return trimmed
}

const initialWorld = loadDraft() ?? bundledClone()

export const useEditorStore = create<EditorStore>((set, get) => {
  const firstSceneId =
    initialWorld.startScene in initialWorld.scenes
      ? initialWorld.startScene
      : Object.keys(initialWorld.scenes)[0]

  return {
    world: initialWorld,
    currentSceneId: firstSceneId,
    selection: [],
    tool: 'select',
    paletteTab: 'entities',
    editingDialogueId: null,
    camera: { cx: 0, cz: 20, scale: 24 },
    viewport: { w: 1200, h: 800 },
    showGrid: true,
    dirty: false,
    lastSavedAt: null,
    pickMode: null,
    mouse: null,
    viewMode: '2d',
    gizmoMode: 'translate',
    remoteModal: null,
    history: { past: [], future: [] },
    remote: { status: 'idle', lastSavedAt: null, publishedVersion: null },

    commit: (mutator) => {
      const { world, history } = get()
      const next = structuredClone(world)
      mutator(next)
      set({
        world: next,
        dirty: true,
        history: {
          past: [...history.past, world].slice(-HISTORY_CAP),
          future: [],
        },
      })
      scheduleSave(get, set)
    },

    replaceWorld: (world) => {
      get().commit((w) => {
        w.version = world.version
        w.startScene = world.startScene
        w.scenes = structuredClone(world.scenes)
        w.dialogues = structuredClone(world.dialogues)
      })
      // Cena atual/seleção/diálogo editado podem não existir no mundo novo
      const w = get().world
      const editing = get().editingDialogueId
      if (!w.scenes[get().currentSceneId]) {
        set({
          currentSceneId:
            w.startScene in w.scenes ? w.startScene : Object.keys(w.scenes)[0],
          selection: [],
        })
      }
      if (editing && !w.dialogues[editing]) set({ editingDialogueId: null })
    },

    editLive: (mutator) => {
      const next = structuredClone(get().world)
      mutator(next)
      dragChanged = true
      set({ world: next, dirty: true })
      scheduleSave(get, set)
    },

    beginEdit: () => {
      dragSnapshot = structuredClone(get().world)
      dragChanged = false
    },

    endEdit: () => {
      if (dragSnapshot && dragChanged) {
        const { history } = get()
        set({
          history: {
            past: [...history.past, dragSnapshot].slice(-HISTORY_CAP),
            future: [],
          },
        })
      }
      dragSnapshot = null
      dragChanged = false
    },

    undo: () => {
      const { history, world, currentSceneId, selection } = get()
      const prev = history.past[history.past.length - 1]
      if (!prev) return
      const sceneOk = prev.scenes[currentSceneId] !== undefined
      const kept = sceneOk
        ? selection.filter((id) =>
            prev.scenes[currentSceneId].entities.some((e) => e.id === id)
          )
        : []
      set({
        world: prev,
        history: {
          past: history.past.slice(0, -1),
          future: [...history.future, world].slice(-HISTORY_CAP),
        },
        dirty: true,
        currentSceneId: sceneOk ? currentSceneId : prev.startScene,
        selection: kept,
      })
      scheduleSave(get, set)
    },

    redo: () => {
      const { history, world, currentSceneId, selection } = get()
      const next = history.future[history.future.length - 1]
      if (!next) return
      const sceneOk = next.scenes[currentSceneId] !== undefined
      const kept = sceneOk
        ? selection.filter((id) =>
            next.scenes[currentSceneId].entities.some((e) => e.id === id)
          )
        : []
      set({
        world: next,
        history: {
          past: [...history.past, world].slice(-HISTORY_CAP),
          future: history.future.slice(0, -1),
        },
        dirty: true,
        currentSceneId: sceneOk ? currentSceneId : next.startScene,
        selection: kept,
      })
      scheduleSave(get, set)
    },

    saveNow: () => saveNow(get, set),

    setCurrentScene: (id) => {
      const scene = get().world.scenes[id]
      if (!scene) return
      set({ currentSceneId: id, selection: [] })
      get().centerCameraOn(id)
    },

    setSelection: (ids) => set({ selection: ids }),
    toggleSelection: (id) =>
      set((s) => ({
        selection: s.selection.includes(id)
          ? s.selection.filter((x) => x !== id)
          : [...s.selection, id],
      })),
    clearSelection: () => set({ selection: [] }),
    setTool: (tool) => set({ tool }),
    setPaletteTab: (tab) => set({ paletteTab: tab }),
    setEditingDialogue: (id) => set({ editingDialogueId: id }),
    setCamera: (camera) => set({ camera }),
    centerCameraOn: (sceneId) => {
      const id = sceneId ?? get().currentSceneId
      const scene = get().world.scenes[id]
      if (!scene) return
      set({ camera: cameraForBounds(scene.bounds, get().viewport) })
    },
    setViewport: (w, h) => set({ viewport: { w, h } }),
    toggleGrid: () => set((s) => ({ showGrid: !s.showGrid })),
    setMouse: (x, z) => set({ mouse: { x, z } }),
    setPickMode: (pick) => set({ pickMode: pick }),
    setViewMode: (viewMode) => set({ viewMode }),
    toggleViewMode: () => set((s) => ({ viewMode: s.viewMode === '2d' ? '3d' : '2d' })),
    setGizmoMode: (gizmoMode) => set({ gizmoMode }),
    setRemoteModal: (remoteModal) => set({ remoteModal }),

    addEntityAt: (type, x, z) => {
      const { world, currentSceneId } = get()
      const def = ENTITY_DEFS.find((d) => d.type === type)
      if (!def) return
      const entity = def.defaults({ sceneId: currentSceneId, x, z, world })
      get().commit((w) => ops.addEntityTo(w, currentSceneId, entity))
      set({ selection: [entity.id] })
    },

    updateEntity: (sceneId, entityId, mutator) => {
      get().commit((w) => {
        const e = ops.findEntity(w, sceneId, entityId)
        if (!e) return
        mutator(e)
        const def = ENTITY_DEF_MAP[e.type]
        if (def.normalize) {
          const normalized = def.normalize(e, { sceneId })
          const scene = w.scenes[sceneId]
          const i = scene?.entities.indexOf(e) ?? -1
          if (scene && i >= 0) scene.entities[i] = normalized
        }
      })
    },

    setEntityField: (sceneId, entityId, key, value) => {
      get().updateEntity(sceneId, entityId, (e) => {
        ops.setDot(e as unknown as Record<string, unknown>, key, value)
      })
    },

    removeEntities: (sceneId, ids) => {
      get().commit((w) => ops.removeEntitiesFrom(w, sceneId, ids))
      set((s) => ({ selection: s.selection.filter((id) => !ids.includes(id)) }))
    },

    duplicateEntities: (sceneId, ids) => {
      const created: Entity[] = []
      get().commit((w) => {
        created.push(...ops.duplicateEntitiesIn(w, sceneId, ids))
      })
      if (created.length) set({ selection: created.map((e) => e.id) })
    },

    rotateEntities: (sceneId, ids) => {
      get().commit((w) => ops.rotateEntities(w, sceneId, ids, Math.PI / 2))
    },

    createScene: () => {
      const id = promptSceneId('')
      if (!id) return
      if (get().world.scenes[id]) {
        alert(`Já existe uma cena '${id}'`)
        return
      }
      const name = prompt('Nome de exibição da cena:', id)
      if (name === null) return
      get().commit((w) => {
        w.scenes[id] = createEmptyScene(id, name.trim() || id)
      })
      set({ currentSceneId: id })
      get().centerCameraOn(id)
    },

    duplicateScene: (id) => {
      const newId = promptSceneId(`${id}-copia`)
      if (!newId) return
      if (get().world.scenes[newId]) {
        alert(`Já existe uma cena '${newId}'`)
        return
      }
      get().commit((w) => {
        ops.duplicateSceneIn(w, id, newId)
      })
      set({ currentSceneId: newId })
      get().centerCameraOn(newId)
    },

    renameScene: (id) => {
      const scene = get().world.scenes[id]
      if (!scene) return
      const name = prompt('Nome de exibição (o id não muda — saves dependem dele):', scene.name)
      if (name === null || !name.trim()) return
      get().commit((w) => {
        const s = w.scenes[id]
        if (s) s.name = name.trim()
      })
    },

    deleteScene: (id) => {
      const { world } = get()
      if (!world.scenes[id]) return
      if (id === world.startScene) {
        alert(`'${id}' é a cena inicial — defina outra cena como inicial antes de apagar`)
        return
      }
      const refs: SceneReference[] = ops.sceneReferences(world, id)
      if (refs.length > 0) {
        alert(
          `Não dá para apagar '${id}' — estas entidades apontam para ela:\n\n` +
            refs.map((r) => `• ${r.sceneId} → ${r.entityId} (${r.label})`).join('\n')
        )
        return
      }
      if (!confirm(`Apagar a cena '${id}' e todas as suas entidades?`)) return
      get().commit((w) => {
        delete w.scenes[id]
      })
      const w = get().world
      const current = get().currentSceneId
      if (!w.scenes[current]) {
        const fallback = w.startScene in w.scenes ? w.startScene : Object.keys(w.scenes)[0]
        set({ currentSceneId: fallback, selection: [] })
      }
    },

    setStartScene: (id) => {
      if (!get().world.scenes[id]) return
      get().commit((w) => {
        w.startScene = id
      })
    },

    updateScene: (sceneId, mutator) => {
      get().commit((w) => {
        const s = w.scenes[sceneId]
        if (s) mutator(s)
      })
    },

    addDialogue: () => {
      const id = prompt('Id do diálogo (a-z, 0-9, _ e -):')
      if (id === null) return
      const trimmed = id.trim()
      if (!SCENE_ID_RE.test(trimmed)) {
        alert('Id inválido — use apenas letras minúsculas, números, _ e -')
        return
      }
      if (get().world.dialogues[trimmed]) {
        alert(`Já existe um diálogo '${trimmed}'`)
        return
      }
      get().commit((w) => {
        w.dialogues[trimmed] = { name: trimmed, lines: [''] }
      })
      set({ editingDialogueId: trimmed, paletteTab: 'dialogues' })
    },

    renameDialogue: (oldId, newId) => {
      const trimmed = newId.trim()
      if (!SCENE_ID_RE.test(trimmed)) {
        alert('Id inválido — use apenas letras minúsculas, números, _ e -')
        return
      }
      if (trimmed === oldId) return
      if (get().world.dialogues[trimmed]) {
        alert(`Já existe um diálogo '${trimmed}'`)
        return
      }
      get().commit((w) => ops.renameDialogueIn(w, oldId, trimmed))
      if (get().editingDialogueId === oldId) set({ editingDialogueId: trimmed })
    },

    deleteDialogue: (id) => {
      const { world } = get()
      if (!world.dialogues[id]) return
      const refs = ops.dialogueReferences(world, id)
      if (refs.length > 0) {
        alert(
          `Não dá para apagar o diálogo '${id}' — estas entidades o usam:\n\n` +
            refs.map((r) => `• ${r.sceneId} → ${r.entityId} (${r.label})`).join('\n')
        )
        return
      }
      if (!confirm(`Apagar o diálogo '${id}'?`)) return
      get().commit((w) => {
        delete w.dialogues[id]
      })
      if (get().editingDialogueId === id) set({ editingDialogueId: null })
    },

    updateDialogue: (id, mutator) => {
      get().commit((w) => {
        const d = w.dialogues[id]
        if (d) mutator(d)
      })
    },

    startPick: (entityId) => {
      const { world, currentSceneId } = get()
      const e = ops.findEntity(world, currentSceneId, entityId)
      if (!e || (e.type !== 'door' && e.type !== 'transport')) return
      set({ pickMode: { entityId, sourceSceneId: currentSceneId, field: 'toSpawn' } })
      const toScene = e.toScene
      if (toScene && toScene !== currentSceneId && world.scenes[toScene]) {
        set({ currentSceneId: toScene, selection: [] })
        get().centerCameraOn(toScene)
      }
    },

    cancelPick: () => {
      const { pickMode } = get()
      if (!pickMode) return
      set({
        pickMode: null,
        currentSceneId: pickMode.sourceSceneId,
        selection: [pickMode.entityId],
      })
    },

    completePick: (x, z) => {
      const { pickMode } = get()
      if (!pickMode) return
      get().commit((w) => {
        const e = ops.findEntity(w, pickMode.sourceSceneId, pickMode.entityId)
        if (e && (e.type === 'door' || e.type === 'transport')) {
          e.toSpawn = [x, 0, z]
        }
      })
      set({
        pickMode: null,
        currentSceneId: pickMode.sourceSceneId,
        selection: [pickMode.entityId],
      })
    },
  }
})
