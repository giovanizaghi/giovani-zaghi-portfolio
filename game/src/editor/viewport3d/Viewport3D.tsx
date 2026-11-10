import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  Line,
  OrbitControls,
  PerspectiveCamera,
  TransformControls,
} from '@react-three/drei'
import { DoubleSide, Vector3 } from 'three'
import type { Object3D } from 'three'
import { WorldEnvironment } from '../../components/WorldEnvironment'
import { EntityView, SceneGround, entityY } from '../../components/SceneRenderer'
import { useEditorStore } from '../useEditorStore'
import { useWorldStore } from '../../store/useWorldStore'
import { useGameStore } from '../../store/useGameStore'
import { ENTITY_DEFS } from '../entityDefs'
import { pickRadius } from '../canvas/hitTest'
import { validateWorldCached } from '../validate'
import { PickBanner } from '../canvas/MapCanvas'
import type { Entity, SceneData } from '../../data/world'

/**
 * Visão 3D do editor — cena real do jogo (EntityView/WorldEnvironment/
 * SceneGround) "congelada" via isEditMode: nada anima, coleta ou dispara.
 * Seleção e ferramentas são compartilhadas com o mapa 2D (useEditorStore).
 * Carregado sob demanda (lazy) — three/@react-three ficam fora do chunk 2D.
 */

const SNAP = 0.5
const normAngle = (r: number) => {
  let n = (r + Math.PI) % (Math.PI * 2)
  if (n < 0) n += Math.PI * 2
  n -= Math.PI
  return n <= -Math.PI ? n + Math.PI * 2 : n // (−π, π]
}
const snapVal = (v: number, alt: boolean) =>
  alt ? v : Math.round(v / SNAP) * SNAP

/** Timestamp do fim do último drag de gizmo — evita desselecionar no clique
 *  que encerra o arrasto sobre o chão. */
let gizmoDragEnd = 0

function isTypingTarget(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null
  return (
    !!t &&
    (t.tagName === 'INPUT' ||
      t.tagName === 'TEXTAREA' ||
      t.tagName === 'SELECT' ||
      t.isContentEditable)
  )
}

function defOf(e: Entity) {
  return ENTITY_DEFS.find((d) => d.type === e.type)
}

// ---------------------------------------------------------------------------
// Camada de entidades + helpers de edição
// ---------------------------------------------------------------------------

function EntitySlot({
  e,
  scene,
  selected,
  hasError,
}: {
  e: Entity
  scene: SceneData
  selected: boolean
  hasError: boolean
}) {
  const onClick = (ev: { stopPropagation: () => void; shiftKey: boolean }) => {
    ev.stopPropagation()
    const s = useEditorStore.getState()
    if (ev.shiftKey) s.toggleSelection(e.id)
    else s.setSelection([e.id])
  }
  return (
    <group onClick={onClick}>
      {hasError ? (
        <ErrorBox e={e} />
      ) : (
        <EntityBoundary fallback={<ErrorBox e={e} />}>
          <EntityView entity={e} />
        </EntityBoundary>
      )}
      <EntityHelpers e={e} scene={scene} />
      {selected && <SelectionOutline e={e} />}
    </group>
  )
}

class EntityBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** Caixa wireframe vermelha — entidade inválida ou que quebrou o render */
function ErrorBox({ e }: { e: Entity }) {
  const [w, h, d] = outlineDims(e)
  const cy = e.type === 'block' ? entityY(e) : entityY(e) + h / 2
  return (
    <mesh position={[e.x, cy, e.z]} rotation-y={e.rotY ?? 0}>
      <boxGeometry args={[w, h, d]} />
      <meshBasicMaterial wireframe color="#ff5555" transparent opacity={0.85} />
    </mesh>
  )
}

function outlineDims(e: Entity): [number, number, number] {
  if (e.type === 'block') return [e.size[0], e.size[1], e.size[2]]
  if (e.type === 'house') return [16, 4.5, 12]
  const r = pickRadius(e)
  return [r * 2, e.type === 'trigger' ? 0.6 : 2, r * 2]
}

function SelectionOutline({ e }: { e: Entity }) {
  const [w, h, d] = outlineDims(e)
  const cy = e.type === 'block' ? entityY(e) : entityY(e) + h / 2
  return (
    <mesh
      position={[e.x, cy, e.z]}
      rotation-y={e.rotY ?? 0}
      raycast={() => null}
    >
      <boxGeometry args={[w + 0.08, h + 0.08, d + 0.08]} />
      <meshBasicMaterial wireframe color="#58a6ff" transparent opacity={0.9} />
    </mesh>
  )
}

/** Helpers visuais só do editor (o jogo não renderiza nada disso) */
function EntityHelpers({ e, scene }: { e: Entity; scene: SceneData }) {
  if (e.type === 'trigger') {
    // Sem raycast=null: o anel é o alvo de clique da trigger (seleciona)
    return (
      <mesh rotation-x={-Math.PI / 2} position={[e.x, 0.02, e.z]}>
        <ringGeometry args={[Math.max(0.05, e.radius - 0.05), e.radius, 48]} />
        <meshBasicMaterial
          color="#9a8aff"
          transparent
          opacity={0.55}
          side={DoubleSide}
        />
      </mesh>
    )
  }
  if (e.type === 'block' && e.visible === false) {
    return (
      <mesh
        position={[e.x, e.y ?? e.size[1] / 2, e.z]}
        rotation-y={e.rotY ?? 0}
      >
        <boxGeometry args={e.size} />
        <meshBasicMaterial wireframe color="#9a9a9a" transparent opacity={0.7} />
      </mesh>
    )
  }
  if (e.type === 'label') {
    return (
      <mesh position={[e.x, entityY(e) + 0.35, e.z]}>
        <sphereGeometry args={[0.14, 10, 10]} />
        <meshBasicMaterial color="#4a6fa5" />
      </mesh>
    )
  }
  // Marcador do spawn de destino quando a porta/transporte fica na mesma cena
  if (e.type === 'door' || e.type === 'transport') {
    const dest = e.type === 'door' ? (e.toScene ?? scene.id) : e.toScene
    if (e.toSpawn && dest === scene.id) {
      return (
        <mesh position={[e.toSpawn[0], 0.18, e.toSpawn[2]]}>
          <sphereGeometry args={[0.16, 10, 10]} />
          <meshBasicMaterial color="#58d6a4" />
        </mesh>
      )
    }
  }
  return null
}

/** Spawn ★ e retângulo dos bounds — marcadores de cena (não selecionáveis) */
function SceneMarkers({ scene }: { scene: SceneData }) {
  const b = scene.bounds
  const pts: [number, number, number][] = [
    [b.minX, 0.03, b.minZ],
    [b.maxX, 0.03, b.minZ],
    [b.maxX, 0.03, b.maxZ],
    [b.minX, 0.03, b.maxZ],
    [b.minX, 0.03, b.minZ],
  ]
  return (
    <group>
      <Line
        points={pts}
        color="#e8c170"
        lineWidth={1.5}
        dashed
        dashSize={0.5}
        gapSize={0.3}
      />
      <group position={[scene.spawn[0], 0, scene.spawn[2]]}>
        <mesh position={[0, 0.5, 0]} raycast={() => null}>
          <coneGeometry args={[0.22, 0.6, 4]} />
          <meshBasicMaterial color="#ffd75e" />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.03, 0]} raycast={() => null}>
          <ringGeometry args={[0.4, 0.55, 24]} />
          <meshBasicMaterial color="#ffd75e" transparent opacity={0.7} side={DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}

function EntityLayer({ scene }: { scene: SceneData }) {
  const world = useEditorStore((s) => s.world)
  const selection = useEditorStore((s) => s.selection)
  const errorIds = useMemo(() => {
    const ids = new Set<string>()
    for (const i of validateWorldCached(world)) {
      if (i.level === 'error' && i.entityId) ids.add(i.entityId)
    }
    return ids
  }, [world])
  const selSet = useMemo(() => new Set(selection), [selection])
  return (
    <Suspense fallback={null}>
      {scene.entities.map((e) => (
        <EntitySlot
          key={e.id}
          e={e}
          scene={scene}
          selected={selSet.has(e.id)}
          hasError={errorIds.has(e.id)}
        />
      ))}
      <SceneMarkers scene={scene} />
    </Suspense>
  )
}

// ---------------------------------------------------------------------------
// Chão invisível para raycast (clique vazio → colocar/pegar spawn/limpar)
// ---------------------------------------------------------------------------

function GroundPlane() {
  const onClick = (ev: { point: Vector3; nativeEvent: MouseEvent; stopPropagation: () => void }) => {
    ev.stopPropagation()
    const s = useEditorStore.getState()
    const alt = ev.nativeEvent.altKey
    const wx = snapVal(ev.point.x, alt)
    const wz = snapVal(ev.point.z, alt)
    if (s.pickMode) {
      s.completePick(wx, wz)
      return
    }
    if (s.tool !== 'select') {
      s.addEntityAt(s.tool, wx, wz)
      return
    }
    if (performance.now() - gizmoDragEnd > 120) s.clearSelection()
  }
  return (
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.01, 0]} onClick={onClick}>
      <planeGeometry args={[800, 800]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

// ---------------------------------------------------------------------------
// Gizmo (TransformControls) — proxy Object3D na entidade primária
// ---------------------------------------------------------------------------

interface DragBase {
  proxyPos: Vector3
  proxyRotY: number
  proxyScale: Vector3
  primaryId: string
  primaryRotY: number
  primarySize: [number, number, number] | null
  ents: {
    id: string
    x: number
    z: number
    y: number | undefined
    effY: number
    capsY: boolean
  }[]
}

function useAltKey(): boolean {
  const [alt, setAlt] = useState(false)
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAlt(true)
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') setAlt(false)
    }
    const clear = () => setAlt(false)
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', clear)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', clear)
    }
  }, [])
  return alt
}

function GizmoRig({ scene }: { scene: SceneData }) {
  const selection = useEditorStore((s) => s.selection)
  const gizmoMode = useEditorStore((s) => s.gizmoMode)
  const [proxy, setProxy] = useState<Object3D | null>(null)
  const proxyRef = useRef<Object3D | null>(null)
  const dragging = useRef(false)
  const dragBase = useRef<DragBase | null>(null)
  const altDown = useAltKey()

  const primary =
    selection.length > 0
      ? scene.entities.find((e) => e.id === selection[selection.length - 1])
      : undefined
  const caps = primary ? defOf(primary)?.gizmo : undefined
  const canRotate =
    !!caps?.rotate && !(primary?.type === 'door' && primary.panel !== true)
  const canScale = caps?.scale === true
  const modeOk =
    !!primary &&
    (gizmoMode === 'translate' ||
      (gizmoMode === 'rotate' && canRotate) ||
      (gizmoMode === 'scale' && canScale))

  // Proxy segue a entidade primária — exceto durante o drag (o TC comanda)
  useFrame(() => {
    const p = proxyRef.current
    if (!p || dragging.current || !primary) return
    p.position.set(primary.x, entityY(primary), primary.z)
    p.rotation.set(0, primary.rotY ?? 0, 0)
    p.scale.set(1, 1, 1)
  })

  const onMouseDown = () => {
    const p = proxyRef.current
    if (!p || !primary) return
    dragging.current = true
    useEditorStore.getState().beginEdit()
    const s = useEditorStore.getState()
    dragBase.current = {
      proxyPos: p.position.clone(),
      proxyRotY: p.rotation.y,
      proxyScale: p.scale.clone(),
      primaryId: primary.id,
      primaryRotY: primary.rotY ?? 0,
      primarySize: primary.type === 'block' ? [...primary.size] : null,
      ents: s.selection
        .map((id) => scene.entities.find((e) => e.id === id))
        .filter((e): e is Entity => !!e)
        .map((e) => ({
          id: e.id,
          x: e.x,
          z: e.z,
          y: e.y,
          effY: entityY(e),
          capsY: defOf(e)?.gizmo.y ?? false,
        })),
    }
  }

  const onObjectChange = () => {
    const base = dragBase.current
    const p = proxyRef.current
    if (!base || !p) return
    const s = useEditorStore.getState()
    if (gizmoMode === 'translate') {
      const dx = p.position.x - base.proxyPos.x
      const dy = p.position.y - base.proxyPos.y
      const dz = p.position.z - base.proxyPos.z
      s.editLive((w) => {
        const sc = w.scenes[s.currentSceneId]
        if (!sc) return
        for (const b of base.ents) {
          const e = sc.entities.find((x) => x.id === b.id)
          if (!e) continue
          e.x = b.x + dx
          e.z = b.z + dz
          // y explícito só quando o usuário arrastou no eixo Y
          if (Math.abs(dy) > 1e-4 && b.capsY) e.y = (b.y ?? b.effY) + dy
        }
      })
    } else if (gizmoMode === 'rotate') {
      const d = p.rotation.y - base.proxyRotY
      s.editLive((w) => {
        const sc = w.scenes[s.currentSceneId]
        if (!sc) return
        const e = sc.entities.find((x) => x.id === base.primaryId)
        if (!e) return
        const r = normAngle(base.primaryRotY + d)
        if (Math.abs(r) < 1e-9) delete e.rotY
        else e.rotY = r
      })
    } else {
      // scale — só block; size = tamanho no início do drag × escala do proxy
      s.editLive((w) => {
        const sc = w.scenes[s.currentSceneId]
        if (!sc || !base.primarySize) return
        const e = sc.entities.find((x) => x.id === base.primaryId)
        if (!e || e.type !== 'block') return
        e.size = [
          Math.max(0.1, base.primarySize[0] * p.scale.x),
          Math.max(0.1, base.primarySize[1] * p.scale.y),
          Math.max(0.1, base.primarySize[2] * p.scale.z),
        ]
      })
    }
  }

  const onMouseUp = () => {
    dragging.current = false
    dragBase.current = null
    gizmoDragEnd = performance.now()
    useEditorStore.getState().endEdit()
  }

  return (
    <>
      <object3D
        ref={(o) => {
          proxyRef.current = o
          setProxy(o)
        }}
      />
      {proxy && modeOk && (
        <TransformControls
          object={proxy}
          mode={gizmoMode}
          translationSnap={altDown ? null : SNAP}
          rotationSnap={altDown ? null : Math.PI / 12}
          scaleSnap={altDown ? null : 0.25}
          showX={gizmoMode !== 'rotate'}
          showZ={gizmoMode !== 'rotate'}
          showY={gizmoMode === 'scale' || gizmoMode === 'rotate' || !!caps?.y}
          onMouseDown={onMouseDown}
          onObjectChange={onObjectChange}
          onMouseUp={onMouseUp}
        />
      )}
    </>
  )
}

// ---------------------------------------------------------------------------
// Câmera: enquadra bounds ao entrar/trocar de cena; F enquadra a seleção
// ---------------------------------------------------------------------------

function frameOn(
  camera: { position: Vector3; fov?: number },
  controls: { target: Vector3; update: () => void } | null,
  center: Vector3,
  size: number
) {
  const dist = Math.max(size * 1.35, 7)
  camera.position.set(center.x + dist * 0.72, dist * 0.95, center.z + dist * 0.72)
  if (controls) {
    controls.target.set(center.x, 0, center.z)
    controls.update()
  } else {
    camera.position.set(center.x + dist * 0.72, dist * 0.95, center.z + dist * 0.72)
    // lookAt manual se controls ainda não montou
    ;(camera as { lookAt?: (v: Vector3) => void }).lookAt?.(center)
  }
}

function Keys3D({ scene }: { scene: SceneData }) {
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls) as {
    target: Vector3
    update: () => void
  } | null
  const sceneId = useEditorStore((s) => s.currentSceneId)

  // Enquadra os bounds ao montar e a cada troca de cena
  useEffect(() => {
    const b = scene.bounds
    const center = new Vector3(
      (b.minX + b.maxX) / 2,
      0,
      (b.minZ + b.maxZ) / 2
    )
    const size = Math.max(b.maxX - b.minX, b.maxZ - b.minZ)
    frameOn(camera, controls, center, size)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só ao trocar de cena / controls montar
  }, [sceneId, controls])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e)) return
      const s = useEditorStore.getState()
      const k = e.key.toLowerCase()
      if (k === 'g') s.setGizmoMode('translate')
      else if (k === 'r') s.setGizmoMode('rotate')
      else if (k === 's') s.setGizmoMode('scale')
      else if (k === 'f') {
        // F — enquadra a seleção (ou os bounds se nada selecionado)
        const sc = s.world.scenes[s.currentSceneId]
        if (!sc) return
        const sel = sc.entities.filter((en) => s.selection.includes(en.id))
        if (sel.length === 0) {
          const b = sc.bounds
          frameOn(
            camera,
            controls,
            new Vector3((b.minX + b.maxX) / 2, 0, (b.minZ + b.maxZ) / 2),
            Math.max(b.maxX - b.minX, b.maxZ - b.minZ)
          )
        } else {
          let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
          for (const en of sel) {
            const r = pickRadius(en) + 0.5
            minX = Math.min(minX, en.x - r); maxX = Math.max(maxX, en.x + r)
            minZ = Math.min(minZ, en.z - r); maxZ = Math.max(maxZ, en.z + r)
          }
          frameOn(
            camera,
            controls,
            new Vector3((minX + maxX) / 2, 0, (minZ + maxZ) / 2),
            Math.max(maxX - minX, maxZ - minZ)
          )
        }
        e.preventDefault()
        return
      } else {
        return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [camera, controls])

  return null
}

// ---------------------------------------------------------------------------
// Raiz do viewport 3D
// ---------------------------------------------------------------------------

export default function Viewport3D() {
  const world = useEditorStore((s) => s.world)
  const sceneId = useEditorStore((s) => s.currentSceneId)
  const pickMode = useEditorStore((s) => s.pickMode)
  const scene = world.scenes[sceneId] ?? world.scenes[world.startScene]

  // Sincroniza o mundo do editor com os stores do jogo — Npc/diálogos e
  // portas leem useWorldStore; a cena atual alimenta fallbacks de portas.
  // (Persistência já está off: isEditMode() no useGameStore.)
  useEffect(() => {
    useWorldStore.getState().setWorld(world, 'draft')
  }, [world])
  useEffect(() => {
    useGameStore.setState({ scene: sceneId })
  }, [sceneId])

  if (!scene) return null

  return (
    <div className="viewport-3d">
      <Canvas
        flat
        onPointerMissed={() => useEditorStore.getState().clearSelection()}
      >
        <PerspectiveCamera
          makeDefault
          fov={40}
          near={0.1}
          far={3000}
          position={[18, 15, 18]}
        />
        <Suspense fallback={null}>
          <WorldEnvironment env={scene.env} />
          <SceneGround ground={scene.env.ground} />
          <EntityLayer scene={scene} />
          <GroundPlane />
          <GizmoRig scene={scene} />
          <OrbitControls
            makeDefault
            enableDamping
            dampingFactor={0.08}
            minDistance={2}
            maxDistance={250}
            maxPolarAngle={Math.PI / 2.02}
          />
          <Keys3D scene={scene} />
        </Suspense>
      </Canvas>
      {pickMode && <PickBanner />}
    </div>
  )
}
