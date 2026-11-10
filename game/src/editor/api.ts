import type { WorldData } from '../data/world'

/**
 * Cliente da API do editor (Fase 3). Token em sessionStorage — some ao
 * fechar a aba, nunca vai para localStorage nem aparece em logs.
 * Qualquer 401 limpa o token e lança ApiError(401) para a UI pedir de novo.
 */

const API_URL = (import.meta.env.VITE_API_URL ?? '').replace(/\/+$/, '')
const TOKEN_KEY = 'editor-api-token'

export class ApiError extends Error {
  status: number
  details?: string[]
  constructor(message: string, status: number, details?: string[]) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function apiConfigured(): boolean {
  return API_URL.length > 0
}

export function apiUrl(): string {
  return API_URL
}

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  try {
    sessionStorage.setItem(TOKEN_KEY, token)
  } catch {
    // sessionStorage indisponível — segue sem persistir
  }
}

export function clearToken(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignora
  }
}

interface RequestOpts {
  method?: string
  body?: unknown
  /** Token explícito (login) — default: o guardado */
  token?: string | null
  auth?: boolean
}

async function request<T>(path: string, opts: RequestOpts = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = opts
  const token = opts.token !== undefined ? opts.token : auth ? getToken() : null
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (token) headers['Authorization'] = `Bearer ${token}`

  let res: Response
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    throw new ApiError(`API inacessível: ${(err as Error).message}`, 0)
  }

  if (res.status === 401 && auth) {
    clearToken()
    throw new ApiError('token inválido ou expirado', 401)
  }
  if (res.status === 204) return undefined as T

  let json: { error?: string; details?: string[] } & Record<string, unknown>
  try {
    json = (await res.json()) as typeof json
  } catch {
    throw new ApiError(`resposta inválida da API (HTTP ${res.status})`, res.status)
  }
  if (!res.ok) {
    throw new ApiError(
      json.error ?? `erro HTTP ${res.status}`,
      res.status,
      json.details
    )
  }
  return json as T
}

export interface DraftRemote {
  data: WorldData
  updatedAt: string
}

export interface PublishedInfo {
  version: number
  publishedAt: string
}

export interface VersionInfo {
  version: number
  publishedAt: string
  sceneCount: number
}

/** Valida um token candidato (tela de login) — não grava nada */
export async function checkToken(token: string): Promise<boolean> {
  try {
    await request<undefined>('/auth/check', {
      method: 'POST',
      token,
      auth: false,
    })
    return true
  } catch {
    return false
  }
}

/** Rascunho remoto ou null se não houver (404) */
export async function getDraft(): Promise<DraftRemote | null> {
  try {
    return await request<DraftRemote>('/worlds/draft')
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function putDraft(world: WorldData): Promise<{ savedAt: string }> {
  return request('/worlds/draft', { method: 'PUT', body: world })
}

export async function publish(): Promise<{ version: number; publishedAt: string }> {
  return request('/worlds/publish', { method: 'POST' })
}

/** Metadados da versão publicada ativa — null se nada publicado (404) */
export async function getPublishedMeta(): Promise<PublishedInfo | null> {
  try {
    const r = await request<PublishedInfo & { data: WorldData }>(
      '/worlds/published',
      { auth: false }
    )
    return { version: r.version, publishedAt: r.publishedAt }
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null
    throw err
  }
}

export async function listVersions(): Promise<VersionInfo[]> {
  return request<VersionInfo[]>('/worlds/versions')
}

export async function rollback(
  version: number
): Promise<{ version: number; publishedAt: string }> {
  return request(`/worlds/rollback/${version}`, { method: 'POST' })
}
