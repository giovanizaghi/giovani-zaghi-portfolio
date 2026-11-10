import { parseWorld } from '../data/worldSchema'
import { bundledWorld } from '../data/bundledWorld'
import type { WorldData } from '../data/world'

/**
 * Persistência local do rascunho do editor — localStorage, sem rede.
 * `editor-world-draft` guarda o JSON serializado do WorldData; se o conteúdo
 * salvo estiver inválido, a string bruta é preservada em
 * `editor-world-draft-invalid-backup` antes de qualquer sobrescrita.
 */

export const DRAFT_KEY = 'editor-world-draft'
const INVALID_BACKUP_KEY = 'editor-world-draft-invalid-backup'

/** Lê o rascunho salvo. Inválido/ausente → null (com backup do bruto se inválido). */
export function loadDraft(): WorldData | null {
  let raw: string | null = null
  try {
    raw = localStorage.getItem(DRAFT_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = parseWorld(JSON.parse(raw))
    if (parsed.ok) return parsed.world
    // Rascunho quebrado: preserva o bruto antes do próximo save sobrescrever
    try {
      localStorage.setItem(INVALID_BACKUP_KEY, raw)
    } catch {
      // sem espaço — segue sem backup
    }
    console.warn('[editor] rascunho inválido — usando o mundo bundled:', parsed.errors)
  } catch (err) {
    console.warn('[editor] falha ao ler o rascunho — usando o mundo bundled', err)
  }
  return null
}

/** Grava o rascunho (chamado com debounce pela store; `saveDraftNow` força). */
export function saveDraft(world: WorldData): void {
  try {
    // Se o que está gravado hoje é inválido, guarda backup antes de sobrescrever
    const raw = localStorage.getItem(DRAFT_KEY)
    if (raw) {
      try {
        const parsed = parseWorld(JSON.parse(raw))
        if (!parsed.ok) localStorage.setItem(INVALID_BACKUP_KEY, raw)
      } catch {
        localStorage.setItem(INVALID_BACKUP_KEY, raw)
      }
    }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(world))
  } catch (err) {
    console.warn('[editor] falha ao salvar o rascunho', err)
  }
}

/** Exporta o mundo como download `world.json`. */
export function exportJson(world: WorldData): void {
  const blob = new Blob([JSON.stringify(world, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'world.json'
  a.click()
  URL.revokeObjectURL(url)
}

export interface ImportResult {
  ok: boolean
  world?: WorldData
  errors?: string[]
}

/** Lê um arquivo .json escolhido no input e valida com parseWorld. */
export async function importJsonFile(file: File): Promise<ImportResult> {
  let input: unknown
  try {
    input = JSON.parse(await file.text())
  } catch {
    return { ok: false, errors: ['arquivo não é JSON válido'] }
  }
  const parsed = parseWorld(input)
  if (!parsed.ok) return { ok: false, errors: parsed.errors }
  return { ok: true, world: parsed.world }
}

/** Cópia independente do mundo bundled (para "restaurar padrão"). */
export function bundledClone(): WorldData {
  return structuredClone(bundledWorld)
}
