import { Vector3 } from 'three'

/**
 * Estado compartilhado do orbe companheiro (module-level, sem re-render).
 * O Companion escreve a posição por frame; o combo corpo a corpo lê para
 * fazer os cortes saírem do orbe e pede que ele se posicione à frente.
 */
export const orbPosition = new Vector3()

let forwardUntil = 0

/** Mantém o orbe à frente do player pelos próximos `seconds` */
export function holdOrbForward(seconds: number) {
  forwardUntil = Math.max(forwardUntil, performance.now() + seconds * 1000)
}

export function isOrbForward() {
  return performance.now() < forwardUntil
}
