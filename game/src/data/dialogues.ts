export interface Dialogue {
  /** Nome exibido na caixa de diálogo */
  name: string
  /** Falas exibidas em sequência (E / clique avança) */
  lines: string[]
}

export const dialogues: Record<string, Dialogue> = {
  elder: {
    name: 'Ancião da Vila',
    lines: [
      'Bem-vindo, viajante! Faz tempo que ninguém passa por estas terras...',
      'Dizem que um tesouro está escondido além das montanhas do norte.',
      'Mas cuidado: o caminho é perigoso. Leve suprimentos e coragem!',
    ],
  },
  merchant: {
    name: 'Mercador',
    lines: [
      'Ora, ora... um cliente! Tenho poções, espadas e bugigangas raras.',
      'Tudo com 10% de desconto para heróis de botas empoeiradas.',
    ],
  },
}
