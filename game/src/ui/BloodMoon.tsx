import { useState } from 'react'
import { useGameStore } from '../store/useGameStore'
import { clearCombat } from '../store/enemyRegistry'

/**
 * Lua de Sangue — botão no canto inferior esquerdo que reseta o mundo
 * (estilo Zelda BOTW): limpa `consumedEntities` e remonta o cenário, então
 * inimigos, moedas e pickups voltam a existir. Um flash vermelho cobre a
 * tela por um instante, como a cutscene da lua de sangue.
 */
export function BloodMoon() {
  const gameOver = useGameStore((s) => s.gameOver)
  // Contador que re-dispara a animação do flash a cada clique
  const [flash, setFlash] = useState(0)

  if (gameOver) return null

  const rise = () => {
    clearCombat() // solta o inBattle antes de remontar — senão o autosave trava
    useGameStore.getState().resetWorld()
    setFlash((f) => f + 1)
  }

  return (
    <>
      <button
        className="blood-moon"
        // Blur no clique: sem isso o botão fica focado e o Espaço (ataque)
        // re-dispara o reset — comportamento padrão de button no browser
        onClick={(e) => {
          e.currentTarget.blur()
          rise()
        }}
        title="Lua de Sangue — o mundo renasce (inimigos e itens voltam)"
        aria-label="Lua de Sangue: resetar o mundo"
      >
        <span className="blood-moon-disc" />
      </button>
      {flash > 0 && <div key={flash} className="blood-moon-flash" />}
    </>
  )
}
