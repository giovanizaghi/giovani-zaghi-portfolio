/** Cores de chave que abrem portas trancadas — consumidas ao destrancar */
export type KeyColor = 'silver' | 'gold'

export const KEY_COLORS: Record<KeyColor, { name: string; color: string }> = {
  silver: { name: 'Prata', color: '#cfd8e0' },
  gold: { name: 'Dourada', color: '#f5c542' },
}

export const KEY_COLOR_IDS: KeyColor[] = ['silver', 'gold']
