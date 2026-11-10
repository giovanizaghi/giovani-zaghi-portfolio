import { useEffect, useRef, useState } from 'react'
import { useEditorStore } from '../useEditorStore'
import type { CameraState } from '../useEditorStore'
import { drawScene, screenToWorld } from './draw'
import { hitTest } from './hitTest'
import { validateWorldCached } from '../validate'
import * as ops from '../ops'
import type { SceneData } from '../../data/world'

/**
 * Canvas 2D top-down do editor — grade, entidades, spawn, bounds e interações
 * (colocar, selecionar, mover, box-select, pan, zoom, spawn/bounds drag).
 *
 * O desenho é sob demanda: um rAF só roda quando algo mudou (store, hover,
 * marquee, resize). Coordenadas: x → direita, z → baixo (norte = -Z = cima).
 */

const SNAP = 0.5
const MIN_SCALE = 4
const MAX_SCALE = 200

// ---- Estado interno do drag (refs — não precisa re-render) ----

type Drag =
  | { mode: 'idle' }
  | { mode: 'pan'; startX: number; startY: number; cam: CameraState }
  | {
      mode: 'entity'
      ids: string[]
      orig: Map<string, { x: number; z: number }>
      startWX: number
      startWZ: number
      startCX: number
      startCY: number
      moved: boolean
    }
  | { mode: 'box'; startWX: number; startWZ: number; additive: boolean }
  | { mode: 'spawn'; origY: number }
  | { mode: 'bounds'; mask: number; orig: SceneData['bounds'] }

export function MapCanvas() {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dragRef = useRef<Drag>({ mode: 'idle' })
  const hoverRef = useRef<string | null>(null)
  const marqueeRef = useRef<{ x0: number; z0: number; x1: number; z1: number } | null>(null)
  const rafRef = useRef(0)
  const [cursor, setCursor] = useState('default')

  const pickMode = useEditorStore((s) => s.pickMode)

  // ---------- Desenho sob demanda ----------

  const schedule = () => {
    if (rafRef.current) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      const s = useEditorStore.getState()
      const scene = s.world.scenes[s.currentSceneId]
      if (!canvas || !wrap || !scene) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const issues = validateWorldCached(s.world)
      const errorIds = new Set(
        issues.filter((i) => i.level === 'error' && i.entityId).map((i) => i.entityId!)
      )
      drawScene({
        ctx,
        w: wrap.clientWidth,
        h: wrap.clientHeight,
        camera: s.camera,
        scene,
        world: s.world,
        selection: s.selection,
        hoverId: hoverRef.current,
        errorIds,
        showGrid: s.showGrid,
        marquee: marqueeRef.current,
        pickCursor: s.pickMode ? s.mouse : null,
      })
    })
  }

  // Redesenha quando a store muda (mundo, câmera, seleção, pickMode, mouse…)
  useEffect(() => useEditorStore.subscribe(schedule), [])

  // ---------- Helpers de coordenada ----------

  const canvasRect = () => canvasRef.current?.getBoundingClientRect() ?? null

  const eventToWorld = (e: MouseEvent): [number, number] => {
    const rect = canvasRect()
    const s = useEditorStore.getState()
    if (!rect) return [0, 0]
    return screenToWorld(s.camera, rect.width, rect.height, e.clientX - rect.left, e.clientY - rect.top)
  }

  const snapVal = (v: number, alt: boolean) => (alt ? v : Math.round(v / SNAP) * SNAP)

  // ---------- Hit tests auxiliares ----------

  /** Distância do ponto ao spawn em px de tela */
  const nearSpawn = (scene: SceneData, wx: number, wz: number): boolean => {
    const rect = canvasRect()
    const s = useEditorStore.getState()
    if (!rect) return false
    const dx = (scene.spawn[0] - wx) * s.camera.scale
    const dz = (scene.spawn[2] - wz) * s.camera.scale
    return dx * dx + dz * dz < 14 * 14
  }

  /** Máscara de bordas do bounds sob o ponto (1=minX 2=maxX 4=minZ 8=maxZ) */
  const boundsEdgeMask = (scene: SceneData, wx: number, wz: number): number => {
    const s = useEditorStore.getState()
    const t = 10 / s.camera.scale // ~10px de tolerância
    const b = scene.bounds
    let mask = 0
    if (Math.abs(wx - b.minX) < t && wz >= b.minZ - t && wz <= b.maxZ + t) mask |= 1
    if (Math.abs(wx - b.maxX) < t && wz >= b.minZ - t && wz <= b.maxZ + t) mask |= 2
    if (Math.abs(wz - b.minZ) < t && wx >= b.minX - t && wx <= b.maxX + t) mask |= 4
    if (Math.abs(wz - b.maxZ) < t && wx >= b.minX - t && wx <= b.maxX + t) mask |= 8
    return mask
  }

  // ---------- Mouse ----------

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onMouseDown = (e: MouseEvent) => {
      if (e.target !== canvas) return
      const s = useEditorStore.getState()
      const scene = s.world.scenes[s.currentSceneId]
      if (!scene) return
      const [wx, wz] = eventToWorld(e)

      // Spawn picker: qualquer clique esquerdo define o destino
      if (s.pickMode && e.button === 0) {
        s.completePick(snapVal(wx, e.altKey), snapVal(wz, e.altKey))
        return
      }

      // Pan: botão do meio ou direito
      if (e.button === 1 || e.button === 2) {
        e.preventDefault()
        dragRef.current = { mode: 'pan', startX: e.clientX, startY: e.clientY, cam: { ...s.camera } }
        setCursor('grabbing')
        return
      }
      if (e.button !== 0) return

      // Ferramenta de colocação: clique posiciona a entidade e mantém a tool
      if (s.tool !== 'select') {
        s.addEntityAt(s.tool, snapVal(wx, e.altKey), snapVal(wz, e.altKey))
        return
      }

      // ★ spawn — drag dedicado
      if (nearSpawn(scene, wx, wz)) {
        s.beginEdit()
        dragRef.current = { mode: 'spawn', origY: scene.spawn[1] }
        return
      }

      // Bordas do bounds — drag dedicado
      const edgeMask = boundsEdgeMask(scene, wx, wz)
      if (edgeMask) {
        s.beginEdit()
        dragRef.current = { mode: 'bounds', mask: edgeMask, orig: { ...scene.bounds } }
        return
      }

      // Entidade sob o cursor
      const hit = hitTest(scene, wx, wz)
      if (hit) {
        if (e.shiftKey) {
          s.toggleSelection(hit.id)
          return
        }
        const ids = s.selection.includes(hit.id) ? s.selection : [hit.id]
        if (!s.selection.includes(hit.id)) s.setSelection(ids)
        const orig = new Map<string, { x: number; z: number }>()
        for (const id of ids) {
          const ent = scene.entities.find((x) => x.id === id)
          if (ent) orig.set(id, { x: ent.x, z: ent.z })
        }
        dragRef.current = {
          mode: 'entity',
          ids,
          orig,
          startWX: wx,
          startWZ: wz,
          startCX: e.clientX,
          startCY: e.clientY,
          moved: false,
        }
        return
      }

      // Vazio: box-select (ou clique para desselecionar)
      dragRef.current = { mode: 'box', startWX: wx, startWZ: wz, additive: e.shiftKey }
    }

    const onMouseMove = (e: MouseEvent) => {
      const s = useEditorStore.getState()
      const scene = s.world.scenes[s.currentSceneId]
      const rect = canvasRect()
      const overCanvas = rect !== null && e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom

      // Hover + coords do mouse (só com o cursor sobre o canvas)
      if (overCanvas && scene) {
        const [wx, wz] = eventToWorld(e)
        const mx = snapVal(wx, e.altKey)
        const mz = snapVal(wz, e.altKey)
        if (s.mouse?.x !== mx || s.mouse?.z !== mz) s.setMouse(mx, mz)
        const hit = s.tool === 'select' && !s.pickMode ? hitTest(scene, wx, wz) : null
        const newHover = hit?.id ?? null
        if (newHover !== hoverRef.current) {
          hoverRef.current = newHover
          schedule()
        }
        updateCursor(e, hit !== null, scene, wx, wz)
      } else if (hoverRef.current !== null) {
        hoverRef.current = null
        schedule()
      }

      const drag = dragRef.current
      if (drag.mode === 'idle' || !scene) return
      const [wx, wz] = eventToWorld(e)

      switch (drag.mode) {
        case 'pan': {
          const rect = canvasRect()
          if (!rect) break
          const dx = e.clientX - drag.startX
          const dy = e.clientY - drag.startY
          s.setCamera({
            cx: drag.cam.cx - dx / drag.cam.scale,
            cz: drag.cam.cz - dy / drag.cam.scale,
            scale: drag.cam.scale,
          })
          break
        }
        case 'entity': {
          const dx = e.clientX - drag.startCX
          const dy = e.clientY - drag.startCY
          if (!drag.moved && dx * dx + dy * dy > 16) {
            drag.moved = true
            s.beginEdit()
          }
          if (drag.moved) {
            const mwx = snapVal(wx, e.altKey) - snapVal(drag.startWX, e.altKey)
            const mwz = snapVal(wz, e.altKey) - snapVal(drag.startWZ, e.altKey)
            const positions = drag.ids
              .map((id) => {
                const o = drag.orig.get(id)
                return o ? { id, x: o.x + mwx, z: o.z + mwz } : null
              })
              .filter((p): p is { id: string; x: number; z: number } => p !== null)
            if (positions.length) {
              s.editLive((w) => ops.moveEntitiesTo(w, s.currentSceneId, positions))
            }
          }
          break
        }
        case 'box': {
          marqueeRef.current = { x0: drag.startWX, z0: drag.startWZ, x1: wx, z1: wz }
          schedule()
          break
        }
        case 'spawn': {
          s.editLive((w) => {
            const sc = w.scenes[s.currentSceneId]
            if (sc) sc.spawn = [snapVal(wx, e.altKey), drag.origY, snapVal(wz, e.altKey)]
          })
          break
        }
        case 'bounds': {
          s.editLive((w) => {
            const sc = w.scenes[s.currentSceneId]
            if (!sc) return
            // Sempre a partir dos bounds originais do mousedown — sem drift
            const b = { ...drag.orig }
            const mx = snapVal(wx, e.altKey)
            const mz = snapVal(wz, e.altKey)
            if (drag.mask & 1) b.minX = Math.min(mx, b.maxX - 1)
            if (drag.mask & 2) b.maxX = Math.max(mx, b.minX + 1)
            if (drag.mask & 4) b.minZ = Math.min(mz, b.maxZ - 1)
            if (drag.mask & 8) b.maxZ = Math.max(mz, b.minZ + 1)
            // Trava contra valores absurdos
            b.minX = Math.max(-500, Math.min(500, b.minX))
            b.maxX = Math.max(-500, Math.min(500, b.maxX))
            b.minZ = Math.max(-500, Math.min(500, b.minZ))
            b.maxZ = Math.max(-500, Math.min(500, b.maxZ))
            sc.bounds = b
          })
          break
        }
      }
    }

    const finishDrag = (e?: MouseEvent) => {
      const drag = dragRef.current
      const s = useEditorStore.getState()
      const scene = s.world.scenes[s.currentSceneId]
      if (drag.mode === 'idle') return
      dragRef.current = { mode: 'idle' }
      marqueeRef.current = null
      schedule()

      switch (drag.mode) {
        case 'entity':
          if (drag.moved) s.endEdit()
          break
        case 'spawn':
        case 'bounds':
          s.endEdit()
          break
        case 'box': {
          if (e && scene) {
            const [wx, wz] = eventToWorld(e)
            const x0 = Math.min(drag.startWX, wx)
            const x1 = Math.max(drag.startWX, wx)
            const z0 = Math.min(drag.startWZ, wz)
            const z1 = Math.max(drag.startWZ, wz)
            const tiny = (x1 - x0) * s.camera.scale < 4 && (z1 - z0) * s.camera.scale < 4
            if (tiny) {
              // Clique no vazio: desseleciona (shift preserva)
              if (!drag.additive) s.clearSelection()
            } else {
              const inside = scene.entities
                .filter((ent) => ent.x >= x0 && ent.x <= x1 && ent.z >= z0 && ent.z <= z1)
                .map((ent) => ent.id)
              if (drag.additive) {
                s.setSelection([...new Set([...s.selection, ...inside])])
              } else {
                s.setSelection(inside)
              }
            }
          }
          break
        }
        case 'pan':
          break
      }
      setCursor('default')
    }

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0 || e.button === 1 || e.button === 2) finishDrag(e)
    }

    const onContextMenu = (e: Event) => e.preventDefault()
    canvas.addEventListener('mousedown', onMouseDown)
    canvas.addEventListener('contextmenu', onContextMenu)
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      canvas.removeEventListener('contextmenu', onContextMenu)
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- Zoom (rueda) — listener nativo passivo:false ----------

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const s = useEditorStore.getState()
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const cam = s.camera
      // Ponto do mundo sob o cursor fica parado durante o zoom
      const wx = (mx - rect.width / 2) / cam.scale + cam.cx
      const wz = (my - rect.height / 2) / cam.scale + cam.cz
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, cam.scale * Math.exp(-e.deltaY * 0.0012)))
      s.setCamera({
        cx: wx - (mx - rect.width / 2) / scale,
        cz: wz - (my - rect.height / 2) / scale,
        scale,
      })
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  // ---------- Resize ----------

  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const ro = new ResizeObserver(() => {
      const w = wrap.clientWidth
      const h = wrap.clientHeight
      const dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(w * dpr)
      canvas.height = Math.round(h * dpr)
      canvas.style.width = `${w}px`
      canvas.style.height = `${h}px`
      const ctx = canvas.getContext('2d')
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
      useEditorStore.getState().setViewport(w, h)
      schedule()
    })
    ro.observe(wrap)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------- Teclado ----------

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
      )
        return
      const s = useEditorStore.getState()
      const scene = s.world.scenes[s.currentSceneId]
      if (!scene) return
      const mod = e.ctrlKey || e.metaKey

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (s.selection.length) s.removeEntities(s.currentSceneId, s.selection)
      } else if ((e.key === 'r' || e.key === 'R') && s.selection.length) {
        s.rotateEntities(s.currentSceneId, s.selection)
      } else if (mod && e.key === 'd') {
        e.preventDefault()
        if (s.selection.length) s.duplicateEntities(s.currentSceneId, s.selection)
      } else if (mod && e.key === 'z' && e.shiftKey) {
        e.preventDefault()
        s.redo()
      } else if (mod && e.key === 'z') {
        e.preventDefault()
        s.undo()
      } else if (mod && e.key === 'y') {
        e.preventDefault()
        s.redo()
      } else if (e.key === 'Escape') {
        if (s.pickMode) s.cancelPick()
        else {
          s.setTool('select')
          s.clearSelection()
        }
      } else if (e.key === 'g' || e.key === 'G') {
        s.toggleGrid()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---------- Cursor ----------

  const updateCursor = (e: MouseEvent, overEntity: boolean, scene: SceneData, wx: number, wz: number) => {
    const s = useEditorStore.getState()
    let c = 'default'
    if (s.pickMode) c = 'crosshair'
    else if (s.tool !== 'select') c = 'crosshair'
    else if (e.buttons === 1 || e.buttons === 2) c = 'grabbing'
    else if (overEntity) c = 'grab'
    else if (nearSpawn(scene, wx, wz) || boundsEdgeMask(scene, wx, wz)) c = 'move'
    setCursor((prev) => (prev === c ? prev : c))
  }

  return (
    <div ref={wrapRef} className="map-canvas-wrap">
      <canvas ref={canvasRef} style={{ cursor }} />
      {pickMode && <PickBanner />}
    </div>
  )
}

/** Banner do modo "escolher spawn no mapa" — nome da cena de destino
 *  (exportado: a visão 3D reusa o mesmo banner) */
export function PickBanner() {
  const pickMode = useEditorStore((s) => s.pickMode)
  if (!pickMode) return null
  const s = useEditorStore.getState()
  const e = ops.findEntity(s.world, pickMode.sourceSceneId, pickMode.entityId)
  const toScene =
    e && (e.type === 'door' || e.type === 'transport') ? e.toScene : undefined
  const destId = toScene && s.world.scenes[toScene] ? toScene : s.currentSceneId
  const destName = s.world.scenes[destId]?.name ?? destId
  return (
    <div className="pick-banner">
      Clique para definir o spawn em <strong>{destName}</strong> (Esc cancela)
    </div>
  )
}
