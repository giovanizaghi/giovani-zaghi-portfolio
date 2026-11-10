import { useEditorStore } from '../useEditorStore'
import { ENTITY_DEF_MAP } from '../entityDefs'
import { DraftNumber, DraftText, EntityField, fieldValue } from './fields'
import { DialoguesPanel } from './DialoguesPanel'
import type { Entity } from '../../data/world'

/**
 * Painel direito do editor: formulário da entidade selecionada ou, sem
 * seleção, o painel da cena atual (nome, spawn, bounds, env).
 */
export function Inspector() {
  const paletteTab = useEditorStore((s) => s.paletteTab)
  if (paletteTab === 'dialogues') return <DialoguesPanel />
  return <InspectorBody />
}

function InspectorBody() {
  const world = useEditorStore((s) => s.world)
  const sceneId = useEditorStore((s) => s.currentSceneId)
  const selection = useEditorStore((s) => s.selection)
  const scene = world.scenes[sceneId]

  if (!scene) return <div className="panel-empty">Cena não encontrada</div>

  if (selection.length === 0) return <ScenePanel />

  if (selection.length > 1) {
    return (
      <div className="inspector">
        <h3>{selection.length} entidades selecionadas</h3>
        <p className="hint">
          Arrastar move todas juntas · R gira 90° · Del apaga · Ctrl+D duplica
        </p>
        <button
          className="btn danger"
          onClick={() => useEditorStore.getState().removeEntities(sceneId, selection)}
        >
          Apagar selecionadas
        </button>
      </div>
    )
  }

  const entity = scene.entities.find((e) => e.id === selection[0])
  if (!entity) {
    return (
      <div className="panel-empty">
        Entidade não encontrada nesta cena.
        <button className="mini-btn" onClick={() => useEditorStore.getState().clearSelection()}>
          limpar seleção
        </button>
      </div>
    )
  }

  return <EntityInspector entity={entity} sceneId={sceneId} />
}

// ---- Entidade ----

function EntityInspector({ entity, sceneId }: { entity: Entity; sceneId: string }) {
  const def = ENTITY_DEF_MAP[entity.type]
  // Ações são estáveis — seletores evitam re-render a cada movimento do mouse
  const setEntityField = useEditorStore((s) => s.setEntityField)
  const duplicateEntities = useEditorStore((s) => s.duplicateEntities)
  const removeEntities = useEditorStore((s) => s.removeEntities)

  const setField = (key: string, value: unknown) =>
    setEntityField(sceneId, entity.id, key, value)

  return (
    <div className="inspector">
      <div className="inspector-head">
        <span className="entity-glyph" style={{ color: def.color }}>
          {def.glyph}
        </span>
        <div>
          <h3>{def.label}</h3>
          <code className="entity-id" title={entity.id}>{entity.id}</code>
        </div>
        <div className="inspector-actions">
          <button
            className="mini-btn"
            title="Duplicar (Ctrl+D)"
            onClick={() => duplicateEntities(sceneId, [entity.id])}
          >
            ⧉
          </button>
          <button
            className="mini-btn danger"
            title="Apagar (Del)"
            onClick={() => removeEntities(sceneId, [entity.id])}
          >
            ×
          </button>
        </div>
      </div>

      <div className="fields">
        {/* Campos comuns a toda entidade */}
        <label className="field">
          <span className="field-label">X</span>
          <DraftNumber value={String(entity.x)} step={0.5} onCommit={(t) => { const n = Number(t); if (Number.isFinite(n)) setField('x', n) }} />
        </label>
        <label className="field">
          <span className="field-label">Z</span>
          <DraftNumber value={String(entity.z)} step={0.5} onCommit={(t) => { const n = Number(t); if (Number.isFinite(n)) setField('z', n) }} />
        </label>
        <label className="field">
          <span className="field-label">Y (altura)</span>
          <DraftNumber
            value={entity.y === undefined ? '' : String(entity.y)}
            step={0.05}
            onCommit={(t) => {
              if (t.trim() === '') setField('y', undefined)
              else { const n = Number(t); if (Number.isFinite(n)) setField('y', n) }
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Rotação (graus)</span>
          <DraftNumber
            value={entity.rotY === undefined ? '' : String(Math.round((entity.rotY * 180) / Math.PI))}
            step={15}
            onCommit={(t) => {
              if (t.trim() === '') setField('rotY', undefined)
              else { const n = Number(t); if (Number.isFinite(n)) setField('rotY', (n * Math.PI) / 180) }
            }}
          />
        </label>

        {/* Campos específicos do tipo */}
        {def.fields
          .filter((f) => !f.show || f.show(entity))
          .map((f) => (
            <EntityField
              key={f.key}
              field={f}
              value={fieldValue(entity, f.key)}
              entity={entity}
              onCommit={(v) => setField(f.key, v)}
            />
          ))}
      </div>
    </div>
  )
}

// ---- Cena (sem seleção) ----

function ScenePanel() {
  const world = useEditorStore((s) => s.world)
  const sceneId = useEditorStore((s) => s.currentSceneId)
  const scene = world.scenes[sceneId]
  const updateScene = useEditorStore((s) => s.updateScene)
  const centerCameraOn = useEditorStore((s) => s.centerCameraOn)

  if (!scene) return null

  const setScene = (mutator: (s: typeof scene) => void) =>
    updateScene(sceneId, mutator)

  const numField = (
    label: string,
    get: () => number,
    set: (n: number) => void,
    step = 0.5
  ) => (
    <label className="field">
      <span className="field-label">{label}</span>
      <DraftNumber value={String(get())} step={step} onCommit={(t) => { const n = Number(t); if (Number.isFinite(n)) set(n) }} />
    </label>
  )

  return (
    <div className="inspector">
      <h3>Cena</h3>

      <div className="fields">
        <label className="field">
          <span className="field-label">Nome</span>
          <DraftText
            value={scene.name}
            onCommit={(t) => {
              if (t.trim()) setScene((s) => { s.name = t.trim() })
            }}
          />
        </label>
        <label className="field">
          <span className="field-label">Id (imutável)</span>
          <code className="ro-value">{scene.id}</code>
        </label>
        {scene.id === world.startScene && <p className="hint">★ cena inicial do jogo</p>}

        <h4 className="section">Spawn</h4>
        {numField('X', () => scene.spawn[0], (n) => setScene((s) => { s.spawn = [n, s.spawn[1], s.spawn[2]] }))}
        {numField('Z', () => scene.spawn[2], (n) => setScene((s) => { s.spawn = [s.spawn[0], s.spawn[1], n] }))}

        <h4 className="section">Bounds (região jogável)</h4>
        {numField('min X', () => scene.bounds.minX, (n) => setScene((s) => { s.bounds.minX = n }))}
        {numField('max X', () => scene.bounds.maxX, (n) => setScene((s) => { s.bounds.maxX = n }))}
        {numField('min Z', () => scene.bounds.minZ, (n) => setScene((s) => { s.bounds.minZ = n }))}
        {numField('max Z', () => scene.bounds.maxZ, (n) => setScene((s) => { s.bounds.maxZ = n }))}

        <h4 className="section">Ambiente</h4>
        <label className="field">
          <span className="field-label">Céu (background)</span>
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(scene.env.background) ? scene.env.background : '#ffffff'}
            onChange={(e) => setScene((s) => { s.env.background = e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">Chão — cor</span>
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(scene.env.ground.color) ? scene.env.ground.color : '#ffffff'}
            onChange={(e) => setScene((s) => { s.env.ground.color = e.target.value })}
          />
        </label>
        {numField('Chão — centro X', () => scene.env.ground.center[0], (n) => setScene((s) => { s.env.ground.center = [n, s.env.ground.center[1]] }))}
        {numField('Chão — centro Z', () => scene.env.ground.center[1], (n) => setScene((s) => { s.env.ground.center = [s.env.ground.center[0], n] }))}
        {numField('Chão — largura', () => scene.env.ground.size[0], (n) => setScene((s) => { s.env.ground.size = [n, s.env.ground.size[1]] }))}
        {numField('Chão — profundidade', () => scene.env.ground.size[1], (n) => setScene((s) => { s.env.ground.size = [s.env.ground.size[0], n] }))}
        {numField('Chão — Y', () => scene.env.ground.y ?? -0.2, (n) => setScene((s) => { s.env.ground.y = n }), 0.05)}
        {numField('Chão — espessura', () => scene.env.ground.thickness ?? 0.2, (n) => setScene((s) => { s.env.ground.thickness = n }), 0.05)}
        {numField('Luz ambiente', () => scene.env.ambient, (n) => setScene((s) => { s.env.ambient = n }), 0.1)}
        {numField('Hemisphere — intensidade', () => scene.env.hemi.intensity, (n) => setScene((s) => { s.env.hemi.intensity = n }), 0.1)}
        {numField('Sol — intensidade', () => scene.env.sun.intensity, (n) => setScene((s) => { s.env.sun.intensity = n }), 0.1)}
      </div>

      <button className="btn" onClick={() => centerCameraOn(sceneId)}>
        Centralizar câmera nos bounds
      </button>
    </div>
  )
}
