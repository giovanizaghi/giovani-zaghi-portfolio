/**
 * Flag global de "modo edição" — ligado pelo main.tsx ao entrar em /editor.
 * Componentes de gameplay consultam `isEditMode()` para congelar animações
 * e interações no preview 3D do editor (sem three/zustand — módulo folha).
 */
let editMode = false

export function setEditMode(v: boolean): void {
  editMode = v
}

export function isEditMode(): boolean {
  return editMode
}
