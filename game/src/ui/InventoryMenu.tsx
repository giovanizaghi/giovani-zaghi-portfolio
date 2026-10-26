import { useState } from 'react'
import { useGameStore, getEffectiveStats } from '../store/useGameStore'
import { ITEMS } from '../data/items'
import type { ItemId } from '../data/items'
import { CharacterPreview } from '../components/CharacterPreview'

/**
 * Menu de inventário estilo Breath of the Wild (abre com Tab):
 * painel escuro à esquerda com os itens — hover mostra nome, descrição e
 * quantidade — e o personagem 3D em idle à direita.
 * Clicar num item também o usa.
 */
export function InventoryMenu() {
  const menuOpen = useGameStore((s) => s.menuOpen)
  const inventory = useGameStore((s) => s.inventory)
  const slotLimit = useGameStore((s) => s.slotLimit)
  const coins = useGameStore((s) => s.coins)
  const level = useGameStore((s) => s.level)
  const hearts = useGameStore((s) => s.hearts)
  const maxHearts = useGameStore((s) => s.maxHearts)
  const [hovered, setHovered] = useState<ItemId | null>(null)

  if (!menuOpen) return null

  const stats = getEffectiveStats()
  const hoveredItem = ITEMS.find((i) => i.id === hovered)

  return (
    <div className="inventory-menu">
      <div className="menu-left">
        <h2 className="menu-title">Itens</h2>

        <div className="menu-items">
          {ITEMS.map((item, i) => {
            const count = inventory[item.id]
            return (
              <button
                key={item.id}
                className={`menu-slot ${count === 0 ? 'empty' : ''}`}
                onMouseEnter={() => setHovered(item.id)}
                onMouseLeave={() => setHovered(null)}
                onClick={() => useGameStore.getState().useItem(i)}
              >
                <span className="hotbar-key">{i + 1}</span>
                <span className="menu-symbol" style={{ color: item.color }}>
                  {item.symbol}
                </span>
                <span className="menu-count">×{count}</span>
              </button>
            )
          })}
        </div>

        <div className="menu-desc">
          {hoveredItem ? (
            <>
              <div className="menu-desc-name" style={{ color: hoveredItem.color }}>
                {hoveredItem.name}
                <span className="menu-desc-qty">
                  {inventory[hoveredItem.id]}/{slotLimit}
                </span>
              </div>
              <div className="menu-desc-text">{hoveredItem.description}</div>
            </>
          ) : (
            <div className="menu-desc-text dim">
              Passe o mouse sobre um item para ver o que ele faz.
            </div>
          )}
        </div>

        <div className="menu-footer">
          <span>Nv {level}</span>
          <span>
            ♥ {hearts}/{maxHearts}
          </span>
          <span title="Dano por projétil">⚔ {stats.damage.toFixed(1)}</span>
          <span title="Ataques por segundo">⚡ {stats.attackSpeed.toFixed(1)}/s</span>
          <span className="menu-coins">● {coins}</span>
        </div>
      </div>

      <div className="menu-right">
        <CharacterPreview />
      </div>
    </div>
  )
}
