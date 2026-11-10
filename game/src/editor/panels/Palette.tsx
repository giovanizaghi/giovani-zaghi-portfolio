import { useEditorStore } from '../useEditorStore'
import { ENTITY_DEFS } from '../entityDefs'

/**
 * Coluna esquerda: abas Entidades (ferramentas de colocação) e Diálogos
 * (lista rápida — a edição completa fica no painel direito).
 */
export function Palette() {
  const tab = useEditorStore((s) => s.paletteTab)
  const tool = useEditorStore((s) => s.tool)
  const setPaletteTab = useEditorStore((s) => s.setPaletteTab)
  const setTool = useEditorStore((s) => s.setTool)

  return (
    <aside className="palette">
      <div className="palette-tabs">
        <button
          className={tab === 'entities' ? 'tab active' : 'tab'}
          onClick={() => setPaletteTab('entities')}
        >
          Entidades
        </button>
        <button
          className={tab === 'dialogues' ? 'tab active' : 'tab'}
          onClick={() => setPaletteTab('dialogues')}
        >
          Diálogos
        </button>
      </div>

      {tab === 'entities' ? (
        <div className="palette-list">
          <button
            className={tool === 'select' ? 'pal-item active' : 'pal-item'}
            onClick={() => setTool('select')}
          >
            <span className="pal-glyph">➤</span>
            <span>Selecionar / mover</span>
            <kbd>Esc</kbd>
          </button>
          {ENTITY_DEFS.map((def) => (
            <button
              key={def.type}
              className={tool === def.type ? 'pal-item active' : 'pal-item'}
              onClick={() => setTool(def.type)}
              title={`Colocar ${def.label} — clique no mapa`}
            >
              <span className="pal-glyph" style={{ color: def.color }}>
                {def.glyph}
              </span>
              <span>{def.label}</span>
            </button>
          ))}
          <p className="palette-hint">
            Com uma ferramenta ativa, clique no mapa para posicionar (snap 0,5 ·
            Alt desliga). Esc volta para selecionar.
          </p>
        </div>
      ) : (
        <DialogueList />
      )}
    </aside>
  )
}

function DialogueList() {
  const world = useEditorStore((s) => s.world)
  const editing = useEditorStore((s) => s.editingDialogueId)
  const addDialogue = useEditorStore((s) => s.addDialogue)
  const setEditingDialogue = useEditorStore((s) => s.setEditingDialogue)

  return (
    <div className="palette-list">
      <button className="pal-item add" onClick={() => addDialogue()}>
        <span className="pal-glyph">+</span>
        <span>Novo diálogo</span>
      </button>
      {Object.entries(world.dialogues).map(([id, d]) => (
        <button
          key={id}
          className={editing === id ? 'pal-item active' : 'pal-item'}
          onClick={() => setEditingDialogue(id)}
          title={id}
        >
          <span className="pal-glyph" style={{ color: '#9a8aff' }}>
            ❝
          </span>
          <span>
            {d.name}
            <small className="pal-sub">{id}</small>
          </span>
        </button>
      ))}
      {Object.keys(world.dialogues).length === 0 && (
        <p className="palette-hint">Nenhum diálogo ainda.</p>
      )}
      <p className="palette-hint">
        Selecione um diálogo para editar nome e falas no painel da direita.
      </p>
    </div>
  )
}
