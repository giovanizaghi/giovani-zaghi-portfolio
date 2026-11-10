import { useEffect, useState } from 'react'
import { useEditorStore } from '../useEditorStore'
import {
  cancelLogin,
  completeLogin,
  listVersions,
  remoteErrorMessage,
  rollback,
} from '../remote'
import type { VersionInfo } from '../api'

/**
 * Modais remotos do editor (Fase 3): login do token da API (sob demanda —
 * nunca ao abrir o editor) e lista de versões publicadas com rollback.
 */
export function RemoteModals() {
  const modal = useEditorStore((s) => s.remoteModal)
  if (modal === 'login') return <LoginModal />
  if (modal === 'versions') return <VersionsModal />
  return null
}

function ModalShell({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <strong>{title}</strong>
          <button className="tb-btn" onClick={onClose} title="Fechar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function LoginModal() {
  const [token, setTokenValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const t = token.trim()
    if (!t || busy) return
    setBusy(true)
    setError(null)
    const ok = await completeLogin(t)
    setBusy(false)
    if (!ok) setError('Token recusado pela API — confira e tente de novo.')
    // sucesso → completeLogin fecha o modal e roda a ação pendente
  }

  return (
    <ModalShell title="API do editor — token" onClose={cancelLogin}>
      <p className="hint">
        Ações remotas (salvar/publicar/versões) precisam do token do editor.
        Ele fica só nesta aba (sessionStorage).
      </p>
      <input
        type="password"
        className="modal-input"
        placeholder="EDITOR_TOKEN"
        value={token}
        autoFocus
        onChange={(e) => setTokenValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void submit()
        }}
      />
      {error && <p className="modal-error">{error}</p>}
      <div className="modal-actions">
        <button className="tb-btn" onClick={cancelLogin}>
          Cancelar
        </button>
        <button className="tb-btn save" disabled={busy || !token.trim()} onClick={() => void submit()}>
          {busy ? 'Verificando…' : 'Conectar'}
        </button>
      </div>
    </ModalShell>
  )
}

function VersionsModal() {
  const [versions, setVersions] = useState<VersionInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const close = () => useEditorStore.getState().setRemoteModal(null)

  const reload = async () => {
    setError(null)
    try {
      setVersions(await listVersions())
    } catch (err) {
      setError(remoteErrorMessage(err))
      setVersions([])
    }
  }

  useEffect(() => {
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carrega uma vez ao abrir
  }, [])

  const restore = async (v: number) => {
    if (
      !confirm(
        `Restaurar a versão v${v} como publicada?\n\n` +
          `Isso cria uma NOVA versão com os dados da v${v} — o rascunho do editor não muda.`
      )
    )
      return
    setBusy(v)
    try {
      const result = await rollback(v)
      useEditorStore.setState((st) => ({
        remote: { ...st.remote, publishedVersion: result.version },
      }))
      alert(`v${result.version} publicada com os dados da v${v}.`)
      await reload()
    } catch (err) {
      alert(`Falha no rollback:\n\n${remoteErrorMessage(err)}`)
    } finally {
      setBusy(null)
    }
  }

  return (
    <ModalShell title="Versões publicadas" onClose={close}>
      {error && <p className="modal-error">{error}</p>}
      {versions === null && <p className="hint">Carregando…</p>}
      {versions !== null && versions.length === 0 && !error && (
        <p className="hint">Nenhuma versão publicada ainda.</p>
      )}
      {versions !== null && versions.length > 0 && (
        <ul className="versions-list">
          {versions.map((v, i) => (
            <li key={v.version} className="version-item">
              <div>
                <strong>v{v.version}</strong>
                {/* a lista vem DESC — a ativa é a mais nova (o que /published serve) */}
                {i === 0 && <span className="badge ok"> ativa</span>}
                <div className="hint">
                  {new Date(v.publishedAt).toLocaleString('pt-BR')} ·{' '}
                  {v.sceneCount} cena(s)
                </div>
              </div>
              <button
                className="tb-btn"
                disabled={busy !== null}
                onClick={() => void restore(v.version)}
              >
                {busy === v.version ? '…' : 'Restaurar esta versão'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </ModalShell>
  )
}
