import { useGameStore } from '../store/useGameStore'
import { KEY_COLOR_IDS, KEY_COLORS } from '../data/keys'

/** Ícone SVG de chave na cor da liga — uma linha por cor de chave na mochila */
function KeyIcon({ color }: { color: string }) {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="7" cy="12" r="4" fill="none" stroke={color} strokeWidth="2.4" />
      <path
        d="M10.5 12h10M17 12v3.5M20.5 12v2.5"
        fill="none"
        stroke={color}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  )
}

/** Chaves coletadas — canto superior direito, abaixo do display de moedas */
export function KeysDisplay() {
  const keys = useGameStore((s) => s.keys)
  const held = KEY_COLOR_IDS.filter((color) => keys[color] > 0)
  if (held.length === 0) return null

  return (
    <div className="keys-display">
      {held.map((color) => (
        <div key={color} className="keys-row" title={`Chave ${KEY_COLORS[color].name}`}>
          <KeyIcon color={KEY_COLORS[color].color} />
          <span className="keys-count">×{keys[color]}</span>
        </div>
      ))}
    </div>
  )
}
