import { useGameStore } from '../store/useGameStore'

/**
 * Indicador de autosave no canto inferior esquerdo — aparece enquanto
 * `saving` está ativo (o dígito alterna entre 0 e 1, tema das partículas).
 */
export function SaveIndicator() {
  const saving = useGameStore((s) => s.saving)

  if (!saving) return null

  return (
    <div className="save-indicator">
      <span className="save-digit">
        <span className="d0">0</span>
        <span className="d1">1</span>
      </span>
      salvando
      <span className="save-dots" />
    </div>
  )
}
