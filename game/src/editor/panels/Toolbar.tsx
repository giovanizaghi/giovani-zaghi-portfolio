import { useRef } from 'react'
import { useEditorStore } from '../useEditorStore'
import { exportJson, importJsonFile, bundledClone } from '../draft'
import { validateWorldCached } from '../validate'
import { apiConfigured } from '../api'
import { openVersions, publishWorld, saveToServer, withRemoteAuth } from '../remote'

/**
 * Barra superior do editor: cenas, histórico, salvar/testar/exportar/importar.
 * "Salvar no servidor" e "Publicar" ficam desabilitados até a Fase 3.
 */
export function Toolbar() {
  const world = useEditorStore((s) => s.world)
  const sceneId = useEditorStore((s) => s.currentSceneId)
  const dirty = useEditorStore((s) => s.dirty)
  const lastSavedAt = useEditorStore((s) => s.lastSavedAt)
  const history = useEditorStore((s) => s.history)
  const viewMode = useEditorStore((s) => s.viewMode)
  const gizmoMode = useEditorStore((s) => s.gizmoMode)
  // Ações estáveis — getState() dentro dos handlers evita re-render por mouse
  const store = () => useEditorStore.getState()
  const fileRef = useRef<HTMLInputElement>(null)

  const sceneIds = Object.keys(world.scenes)
  const issues = validateWorldCached(world)
  const errorCount = issues.filter((i) => i.level === 'error').length
  const canTest = errorCount === 0

  const onImportFile = async (file: File | undefined) => {
    if (!file) return
    const result = await importJsonFile(file)
    if (fileRef.current) fileRef.current.value = ''
    if (!result.ok || !result.world) {
      const list = (result.errors ?? ['erro desconhecido']).slice(0, 10)
      alert(`Importação recusada — ${result.errors?.length ?? 0} erro(s):\n\n${list.join('\n')}`)
      return
    }
    const sceneCount = Object.keys(result.world.scenes).length
    if (
      !confirm(
        `Importar mundo com ${sceneCount} cena(s) e ${Object.keys(result.world.dialogues).length} diálogo(s)?\n\nO mundo atual será substituído (Ctrl+Z desfaz).`
      )
    )
      return
    store().replaceWorld(result.world)
  }

  const restoreDefault = () => {
    if (
      !confirm(
        'Restaurar o mundo padrão (bundled)?\n\nTodas as edições atuais serão substituídas (Ctrl+Z desfaz).'
      )
    )
      return
    store().replaceWorld(bundledClone())
  }

  const testGame = () => {
    store().saveNow()
    window.open(`/?world=draft&scene=${encodeURIComponent(sceneId)}`, 'game-preview')
  }

  const isStart = sceneId === world.startScene

  return (
    <header className="toolbar">
      <div className="toolbar-group">
        <select
          className="scene-select"
          value={sceneId}
          onChange={(e) => store().setCurrentScene(e.target.value)}
          title="Cena atual"
        >
          {sceneIds.map((id) => (
            <option key={id} value={id}>
              {world.scenes[id].name} ({id}){id === world.startScene ? ' ★' : ''}
            </option>
          ))}
        </select>
        <button className="tb-btn" title="Nova cena" onClick={() => store().createScene()}>
          +
        </button>
        <button
          className="tb-btn"
          title="Duplicar cena"
          onClick={() => store().duplicateScene(sceneId)}
        >
          ⧉
        </button>
        <button
          className="tb-btn"
          title="Renomear cena (o id não muda)"
          onClick={() => store().renameScene(sceneId)}
        >
          ✎
        </button>
        <button
          className="tb-btn danger"
          title={isStart ? 'Cena inicial não pode ser apagada' : 'Apagar cena'}
          disabled={isStart}
          onClick={() => store().deleteScene(sceneId)}
        >
          ×
        </button>
        <button
          className="tb-btn"
          title={isStart ? 'Já é a cena inicial' : 'Definir como cena inicial do jogo'}
          disabled={isStart}
          onClick={() => store().setStartScene(sceneId)}
        >
          ★
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className="tb-btn"
          title="Desfazer (Ctrl+Z)"
          disabled={history.past.length === 0}
          onClick={() => store().undo()}
        >
          ↶
        </button>
        <button
          className="tb-btn"
          title="Refazer (Ctrl+Y / Ctrl+Shift+Z)"
          disabled={history.future.length === 0}
          onClick={() => store().redo()}
        >
          ↷
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className="tb-btn"
          title={viewMode === '2d' ? 'Ver em 3D (Tab)' : 'Ver mapa 2D (Tab)'}
          onClick={() => store().toggleViewMode()}
        >
          {viewMode === '2d' ? '3D' : '2D'}
        </button>
        {viewMode === '3d' && (
          <>
            <button
              className={`tb-btn${gizmoMode === 'translate' ? ' active' : ''}`}
              title="Mover (G)"
              onClick={() => store().setGizmoMode('translate')}
            >
              ↔
            </button>
            <button
              className={`tb-btn${gizmoMode === 'rotate' ? ' active' : ''}`}
              title="Rotacionar (R)"
              onClick={() => store().setGizmoMode('rotate')}
            >
              ⟳
            </button>
            <button
              className={`tb-btn${gizmoMode === 'scale' ? ' active' : ''}`}
              title="Escalar bloco (S)"
              onClick={() => store().setGizmoMode('scale')}
            >
              ⤢
            </button>
          </>
        )}
      </div>

      <div className="toolbar-group">
        <button
          className="tb-btn save"
          title="Salvar rascunho local agora"
          onClick={() => store().saveNow()}
        >
          Salvar local {dirty ? '…' : lastSavedAt ? '✓' : ''}
        </button>
        <button
          className="tb-btn"
          disabled={!apiConfigured()}
          title={
            apiConfigured()
              ? 'Salvar o rascunho na API (pede token se necessário)'
              : 'VITE_API_URL não configurada'
          }
          onClick={() => withRemoteAuth(saveToServer)}
        >
          Salvar no servidor
        </button>
        <button
          className="tb-btn"
          disabled={!apiConfigured() || !canTest}
          title={
            !apiConfigured()
              ? 'VITE_API_URL não configurada'
              : !canTest
                ? `Corrija os ${errorCount} erro(s) de validação para publicar`
                : 'Salvar e publicar uma nova versão do mundo'
          }
          onClick={() => withRemoteAuth(publishWorld)}
        >
          Publicar
        </button>
        <button
          className="tb-btn"
          disabled={!apiConfigured()}
          title={
            apiConfigured()
              ? 'Versões publicadas — listar e restaurar (rollback)'
              : 'VITE_API_URL não configurada'
          }
          onClick={() => withRemoteAuth(async () => openVersions())}
        >
          Versões
        </button>
      </div>

      <div className="toolbar-group">
        <button
          className="tb-btn test"
          disabled={!canTest}
          title={
            canTest
              ? 'Salvar e abrir o jogo com este rascunho'
              : `Corrija os ${errorCount} erro(s) de validação para testar`
          }
          onClick={testGame}
        >
          Testar ▶
        </button>
        <button className="tb-btn" title="Baixar world.json" onClick={() => exportJson(world)}>
          Exportar
        </button>
        <button className="tb-btn" title="Importar world.json" onClick={() => fileRef.current?.click()}>
          Importar
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => void onImportFile(e.target.files?.[0])}
        />
        <button className="tb-btn" title="Restaurar o mundo padrão" onClick={restoreDefault}>
          Restaurar padrão
        </button>
      </div>
    </header>
  )
}
