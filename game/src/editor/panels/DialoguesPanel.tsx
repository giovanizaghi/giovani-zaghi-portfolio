import { useEffect, useState } from 'react'
import { useEditorStore } from '../useEditorStore'
import { DraftText } from './fields'
import type { Dialogue } from '../../data/world'

/**
 * Painel de edição de diálogos (aba "Diálogos" da paleta + painel direito).
 * Lista na paleta; aqui edita o diálogo selecionado em `editingDialogueId`.
 */
export function DialoguesPanel() {
  const world = useEditorStore((s) => s.world)
  const editingId = useEditorStore((s) => s.editingDialogueId)

  if (!editingId || !world.dialogues[editingId]) {
    return (
      <div className="inspector">
        <h3>Diálogos</h3>
        <p className="hint">
          Selecione um diálogo na lista à esquerda ou crie um novo.
        </p>
      </div>
    )
  }

  const dialogue = world.dialogues[editingId]

  return <DialogueEditor id={editingId} dialogue={dialogue} />
}

function DialogueEditor({ id, dialogue }: { id: string; dialogue: Dialogue }) {
  const deleteDialogue = useEditorStore((s) => s.deleteDialogue)
  const updateDialogue = useEditorStore((s) => s.updateDialogue)

  const update = (mutator: (d: Dialogue) => void) => updateDialogue(id, mutator)

  const moveLine = (index: number, dir: -1 | 1) => {
    update((d) => {
      const j = index + dir
      if (j < 0 || j >= d.lines.length) return
      const tmp = d.lines[index]
      d.lines[index] = d.lines[j]
      d.lines[j] = tmp
    })
  }

  return (
    <div className="inspector">
      <div className="inspector-head">
        <span className="entity-glyph" style={{ color: '#9a8aff' }}>
          ❝
        </span>
        <div>
          <h3>Diálogo</h3>
          <code className="entity-id" title={id}>{id}</code>
        </div>
        <div className="inspector-actions">
          <button
            className="mini-btn danger"
            title="Apagar diálogo (bloqueado se estiver em uso)"
            onClick={() => deleteDialogue(id)}
          >
            ×
          </button>
        </div>
      </div>

      <div className="fields">
        <label className="field">
          <span className="field-label">Id (renomeia referências)</span>
          <DialogueIdField id={id} />
        </label>
        <label className="field">
          <span className="field-label">Nome de exibição</span>
          <DraftText
            value={dialogue.name}
            onCommit={(t) => {
              if (t.trim()) update((d) => { d.name = t.trim() })
            }}
          />
        </label>

        <h4 className="section">Falas ({dialogue.lines.length})</h4>
        {dialogue.lines.map((line, i) => (
          <div className="line-row" key={i}>
            <LineEditor
              value={line}
              onCommit={(v) => {
                if (v !== line) {
                  update((d) => {
                    d.lines[i] = v
                  })
                }
              }}
            />
            <div className="line-btns">
              <button
                className="mini-btn"
                title="Subir"
                disabled={i === 0}
                onClick={() => moveLine(i, -1)}
              >
                ↑
              </button>
              <button
                className="mini-btn"
                title="Descer"
                disabled={i === dialogue.lines.length - 1}
                onClick={() => moveLine(i, 1)}
              >
                ↓
              </button>
              <button
                className="mini-btn danger"
                title="Remover fala"
                disabled={dialogue.lines.length <= 1}
                onClick={() =>
                  update((d) => {
                    d.lines.splice(i, 1)
                  })
                }
              >
                ×
              </button>
            </div>
          </div>
        ))}
        <button
          className="btn"
          onClick={() => update((d) => { d.lines.push('') })}
        >
          + Adicionar fala
        </button>
      </div>
    </div>
  )
}

/** Textarea de uma fala — rascunho local, commit no blur/Enter.
 *  Controlado de fora para baixo: reordenar falas ressincroniza o texto. */
function LineEditor({ value, onCommit }: { value: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState(value)
  useEffect(() => setDraft(value), [value])
  return (
    <textarea
      className="line-text"
      rows={2}
      value={draft}
      placeholder="Fala"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft !== value) onCommit(draft)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) (e.target as HTMLTextAreaElement).blur()
        e.stopPropagation()
      }}
    />
  )
}

/** Renomeia o id do diálogo — a store atualiza npc/trigger automaticamente */
function DialogueIdField({ id }: { id: string }) {
  const renameDialogue = useEditorStore((s) => s.renameDialogue)
  return (
    <span className="field-inline">
      <DraftText
        value={id}
        onCommit={(t) => renameDialogue(id, t)}
      />
      <span className="field-hint">enter/blur confirma</span>
    </span>
  )
}
