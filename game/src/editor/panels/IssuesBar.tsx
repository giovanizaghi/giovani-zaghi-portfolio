import { useState } from 'react'
import { useEditorStore } from '../useEditorStore'
import { validateWorldCached } from '../validate'

/**
 * Barra de status: contagem de erros/warnings de validação. Clique abre a
 * lista; clicar num issue navega para a cena/entidade correspondente.
 */
export function IssuesBar() {
  const world = useEditorStore((s) => s.world)
  const [open, setOpen] = useState(false)
  const setCurrentScene = useEditorStore((s) => s.setCurrentScene)
  const setSelection = useEditorStore((s) => s.setSelection)
  const clearSelection = useEditorStore((s) => s.clearSelection)

  const issues = validateWorldCached(world)
  const errors = issues.filter((i) => i.level === 'error')
  const warnings = issues.filter((i) => i.level === 'warning')
  const remote = useEditorStore((s) => s.remote)

  const goToIssue = (issue: (typeof issues)[number]) => {
    if (issue.sceneId && world.scenes[issue.sceneId]) {
      setCurrentScene(issue.sceneId)
    }
    if (issue.entityId) {
      setSelection([issue.entityId])
    } else {
      clearSelection()
    }
    setOpen(false)
  }

  return (
    <div className="issues-bar">
      <button
        className="issues-toggle"
        onClick={() => setOpen((v) => !v)}
        title="Problemas de validação — clique para listar"
      >
        {errors.length > 0 && <span className="badge error">{errors.length} erro(s)</span>}
        {warnings.length > 0 && <span className="badge warning">{warnings.length} aviso(s)</span>}
        {errors.length === 0 && warnings.length === 0 && <span className="badge ok">✓ válido</span>}
      </button>

      {remote.status !== 'idle' && (
        <span
          className={`remote-status ${remote.status}`}
          title={
            remote.status === 'error'
              ? 'Última ação remota falhou — veja o alerta'
              : undefined
          }
        >
          {remote.status === 'saving' && 'servidor: salvando…'}
          {remote.status === 'saved' &&
            remote.lastSavedAt &&
            `servidor: salvo às ${new Date(remote.lastSavedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`}
          {remote.status === 'saved' && !remote.lastSavedAt && 'servidor: salvo'}
          {remote.status === 'error' && 'servidor: erro ao salvar'}
        </span>
      )}

      {open && (
        <div className="issues-list">
          {issues.length === 0 && <p className="hint">Nenhum problema encontrado.</p>}
          {issues.map((issue, i) => (
            <button
              key={i}
              className={`issue-item ${issue.level}`}
              onClick={() => goToIssue(issue)}
              title="Ir para a cena/entidade"
            >
              <span className="issue-level">{issue.level === 'error' ? '✕' : '⚠'}</span>
              <span className="issue-scene">{issue.sceneId ?? 'mundo'}</span>
              <span className="issue-msg">{issue.message}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
