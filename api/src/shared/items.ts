/** Itens consumíveis do hotbar — um por linguagem (tema do portfólio) */

export type ItemId = 'java' | 'csharp' | 'javascript' | 'python'

export interface ItemDef {
  id: ItemId
  name: string
  /** Símbolo exibido no slot até termos o logo da linguagem */
  symbol: string
  /** Cor de marca da linguagem */
  color: string
  description: string
}

/** Ordem fixa = slots 1–4 do hotbar */
export const ITEMS: ItemDef[] = [
  {
    id: 'java',
    name: 'Java',
    symbol: 'J',
    color: '#e76f00',
    description: 'Café forte: enche a stamina e acelera o movimento por 6s',
  },
  {
    id: 'csharp',
    name: 'C#',
    symbol: 'C#',
    color: '#68217a',
    description: 'Explosão orientada a objetos que empurra inimigos para longe',
  },
  {
    id: 'javascript',
    name: 'JavaScript',
    symbol: 'JS',
    color: '#c9b200',
    description: 'A linguagem que tem de tudo — inclusive +1 coração',
  },
  {
    id: 'python',
    name: 'Python',
    symbol: 'Py',
    color: '#3776ab',
    description: 'Solta uma cobra de dados que desliza no chão até o alvo',
  },
]

export const ITEM_IDS = ITEMS.map((i) => i.id)

/** Limite inicial de itens carregados por tipo */
export const INITIAL_SLOT_LIMIT = 3
/** Quantidade inicial de cada item (para testar) */
export const INITIAL_ITEM_COUNT = 3

/** Custo em moedas para aumentar o limite de slots em 1 (cresce a cada compra) */
export function slotUpgradeCost(currentLimit: number): number {
  return 25 * (currentLimit - INITIAL_SLOT_LIMIT + 1)
}
