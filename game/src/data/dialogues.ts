export interface Dialogue {
  /** Nome exibido na caixa de diálogo */
  name: string
  /** Falas exibidas em sequência (E / clique avança) */
  lines: string[]
}

export const dialogues: Record<string, Dialogue> = {
  giovani: {
    name: 'Giovani',
    lines: [
      "Hey, I'm Giovani. Welcome to the room where this journey first began.",
      'I created this world because learning has always felt like an adventure to me: every new skill opens another door.',
      'This little house holds the foundations — curiosity in the bedroom, ideas shared in the living room, and experiments cooking in the kitchen.',
      "Everything beyond that door represents what comes next: new challenges, projects, people, and lessons I haven't discovered yet.",
      "Take a look around, then follow the path outside. Let's begin the adventure together.",
    ],
  },
  journey: {
    name: '???',
    lines: [
      'You step beyond the threshold. The familiar warmth of home stays behind, but it does not leave you.',
      'Out here, every tree is a problem to solve, every fork in the road a decision to learn from.',
      'The blue altar hums with code yet to be written. The red one burns with design yet to be shaped. The violet one whispers of ideas yet to be shared.',
      'Pick any path. There is no wrong way — only the next lesson.',
    ],
  },
}
