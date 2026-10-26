import { useEffect } from 'react'
import { useGameStore } from '../store/useGameStore'
import { ITEMS, slotUpgradeCost } from '../data/items'

const SLOT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4']
const SLOT_KEYS_NUMPAD = ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad4']

/**
 * Hotbar estilo Minecraft na parte de baixo da tela.
 * Teclas 1–4 (ou clique no slot) usam o item diretamente.
 * O botão "+" compra +1 de limite de itens com moedas coletadas.
 */
export function Hotbar() {
  const inventory = useGameStore((s) => s.inventory)
  const selectedSlot = useGameStore((s) => s.selectedSlot)
  const coins = useGameStore((s) => s.coins)
  const slotLimit = useGameStore((s) => s.slotLimit)
  const activateSlot = useGameStore((s) => s.useItem)
  const buySlotUpgrade = useGameStore((s) => s.buySlotUpgrade)
  const cost = slotUpgradeCost(slotLimit)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const index = SLOT_KEYS.indexOf(e.code)
      const padIndex = SLOT_KEYS_NUMPAD.indexOf(e.code)
      const slot = index >= 0 ? index : padIndex
      if (slot >= 0) useGameStore.getState().useItem(slot)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <>
      <div className="coins-display" title="Moedas">
        <span className="coin-icon">●</span> {coins}
      </div>

      <div className="hotbar">
        <div className="hotbar-slots">
        {ITEMS.map((item, i) => {
          const count = inventory[item.id]
          return (
            <button
              key={item.id}
              className={`hotbar-slot ${i === selectedSlot ? 'selected' : ''} ${
                count === 0 ? 'empty' : ''
              }`}
              onClick={() => activateSlot(i)}
              title={`${item.name} — ${item.description}`}
            >
              <span className="hotbar-key">{i + 1}</span>
              <span className="hotbar-symbol" style={{ color: item.color }}>
                {item.symbol}
              </span>
              <span className="hotbar-count">
                {count}/{slotLimit}
              </span>
            </button>
          )
        })}

        <button
          className="hotbar-slot hotbar-buy"
          onClick={buySlotUpgrade}
          disabled={coins < cost}
          title={`Comprar +1 slot de itens (${cost} moedas)`}
        >
          <span className="hotbar-symbol">+</span>
          <span className="hotbar-count">{cost}●</span>
        </button>
      </div>
    </div>
    </>
  )
}
