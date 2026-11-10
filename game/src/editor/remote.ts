import {
  ApiError,
  apiConfigured,
  apiUrl,
  checkToken,
  clearToken,
  getDraft,
  getPublishedMeta,
  getToken,
  listVersions,
  publish,
  putDraft,
  rollback,
  setToken,
} from './api'
import { parseWorld } from '../data/worldSchema'
import { useEditorStore } from './useEditorStore'
import type { RemoteState } from './useEditorStore'
import { DRAFT_UPDATED_AT_KEY } from './draft'
import type { WorldData } from '../data/world'

/**
 * Orquestração das ações remotas do editor (Fase 3): login sob demanda,
 * salvar/publicar/versões. Estado remoto fica na fatia `remote` da store.
 */

let pendingAction: (() => void) | null = null

function setRemote(patch: Partial<RemoteState>): void {
  useEditorStore.setState((st) => ({
    remote: { ...st.remote, ...patch },
  }))
}

/** JSON estável (chaves ordenadas) para comparar mundos sem falso positivo */
function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`
  const o = v as Record<string, unknown>
  return `{${Object.keys(o)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`)
    .join(',')}}`
}

/** Erro amigável para alert/status — details do 400 aparecem na lista */
export function remoteErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.details && err.details.length > 0) {
      const list = err.details.slice(0, 10).join('\n')
      return `${err.message} (${err.details.length} problema(s)):\n\n${list}`
    }
    return err.status === 0 ? err.message : `${err.message} (HTTP ${err.status})`
  }
  return err instanceof Error ? err.message : String(err)
}

/**
 * Executa uma ação remota: sem token abre o modal de login e guarda a ação
 * para rodar depois do login bem-sucedido. Sem VITE_API_URL nem deveria
 * chegar aqui (botões ficam desabilitados).
 */
export function withRemoteAuth(action: () => Promise<void>): void {
  if (!apiConfigured()) return
  if (getToken()) {
    void action()
    return
  }
  pendingAction = () => void action()
  useEditorStore.getState().setRemoteModal('login')
}

/** Chamado pelo modal de login após checkToken OK */
export async function completeLogin(token: string): Promise<boolean> {
  const ok = await checkToken(token)
  if (!ok) return false
  setToken(token)
  useEditorStore.getState().setRemoteModal(null)
  // Após logar: se o servidor tem rascunho mais novo que o local, oferece importar
  void maybeImportRemoteDraft()
  const action = pendingAction
  pendingAction = null
  if (action) action()
  return true
}

export function cancelLogin(): void {
  pendingAction = null
  useEditorStore.getState().setRemoteModal(null)
}

/** Logout — limpa o token (próxima ação remota pede login de novo) */
export function logoutRemote(): void {
  clearToken()
}

/**
 * Compara o rascunho remoto com o local: se o servidor for mais novo e o
 * conteúdo diferir, pergunta se quer usar a versão do servidor.
 */
async function maybeImportRemoteDraft(): Promise<void> {
  try {
    const remote = await getDraft()
    if (!remote) return
    const s = useEditorStore.getState()
    const localTs = Number(localStorage.getItem(DRAFT_UPDATED_AT_KEY) ?? 0)
    const remoteTs = Date.parse(remote.updatedAt)
    if (!Number.isFinite(remoteTs) || remoteTs <= localTs) return
    const parsed = parseWorld(remote.data)
    if (!parsed.ok) return
    const differs =
      stableStringify(parsed.world) !== stableStringify(s.world)
    if (!differs) return
    const when = new Date(remoteTs).toLocaleString('pt-BR')
    if (
      confirm(
        `Há um rascunho mais novo no servidor (${when}).\n\nUsar a versão do servidor?`
      )
    ) {
      s.replaceWorld(parsed.world)
    }
  } catch {
    // sem rascunho remoto ou API fora — segue com o local
  }
}

/** "Salvar no servidor" — PUT do mundo atual como draft */
export async function saveToServer(): Promise<void> {
  const s = useEditorStore.getState()
  setRemote({ status: 'saving' })
  try {
    await putDraft(s.world)
    setRemote({ status: 'saved', lastSavedAt: Date.now() })
  } catch (err) {
    setRemote({ status: 'error' })
    alert(`Falha ao salvar no servidor:\n\n${remoteErrorMessage(err)}`)
  }
}

function worldStats(world: WorldData): { scenes: number; entities: number } {
  let entities = 0
  for (const sc of Object.values(world.scenes)) entities += sc.entities.length
  return { scenes: Object.keys(world.scenes).length, entities }
}

/** "Publicar" — confirma resumo, PUT draft + POST publish */
export async function publishWorld(): Promise<void> {
  const s = useEditorStore.getState()
  const { scenes, entities } = worldStats(s.world)
  let current: number | null = null
  try {
    current = (await getPublishedMeta())?.version ?? null
  } catch {
    current = null // sem meta não bloqueia — publish dirá se falhar
  }
  const next = (current ?? 0) + 1
  const ok = confirm(
    `Publicar este mundo?\n\n` +
      `${scenes} cena(s), ${entities} entidade(s).\n` +
      `Versão publicada atual: ${current === null ? 'nenhuma' : `v${current}`} → v${next}\n\n` +
      `O rascunho local também será salvo no servidor antes de publicar.`
  )
  if (!ok) return
  setRemote({ status: 'saving' })
  try {
    await putDraft(s.world)
    const result = await publish()
    setRemote({
      status: 'saved',
      lastSavedAt: Date.now(),
      publishedVersion: result.version,
    })
    alert(
      `Mundo publicado como v${result.version}!\n\n` +
        `O jogo já serve a nova versão em:\n${location.origin}/`
    )
  } catch (err) {
    setRemote({ status: 'error' })
    alert(`Falha ao publicar:\n\n${remoteErrorMessage(err)}`)
  }
}

/** Abre o modal de versões (lista + rollback) */
export function openVersions(): void {
  useEditorStore.getState().setRemoteModal('versions')
}

export { listVersions, rollback, getPublishedMeta, apiUrl }
