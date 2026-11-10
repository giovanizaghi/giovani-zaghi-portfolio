import { Suspense, lazy, useEffect } from 'react'
import { Toolbar } from './panels/Toolbar'
import { Palette } from './panels/Palette'
import { MapCanvas } from './canvas/MapCanvas'
import { Inspector } from './panels/Inspector'
import { IssuesBar } from './panels/IssuesBar'
import { PasswordGate } from './PasswordGate'
import { useEditorStore } from './useEditorStore'
import './editor.css'

// Visão 3D sob demanda — three/@react-three/componentes do jogo ficam num
// chunk separado, carregado só quando o usuário alterna para 3D (Tab/botão).
const Viewport3D = lazy(() => import('./viewport3d/Viewport3D'))

/**
 * App do editor de níveis (/editor) — grade full-viewport:
 * toolbar em cima, paleta à esquerda, viewport (2D ou 3D) no centro,
 * inspector à direita, barra de issues embaixo. Carregado via lazy() no
 * main.tsx — este chunk base nunca pode importar three/@react-three.
 */
export default function EditorApp() {
  const viewMode = useEditorStore((s) => s.viewMode)

  // Tab alterna 2D ↔ 3D (ignorado dentro de inputs, como os demais atalhos)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const t = e.target as HTMLElement | null
      if (
        t &&
        (t.tagName === 'INPUT' ||
          t.tagName === 'TEXTAREA' ||
          t.tagName === 'SELECT' ||
          t.isContentEditable)
      )
        return
      e.preventDefault()
      useEditorStore.getState().toggleViewMode()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <PasswordGate>
      <div className="editor-app">
        <Toolbar />
        <div className="editor-body">
          <Palette />
          <div className="editor-center">
            {viewMode === '2d' ? (
              <MapCanvas />
            ) : (
              <Suspense
                fallback={
                  <div className="viewport-3d-loading">Carregando visão 3D…</div>
                }
              >
                <Viewport3D />
              </Suspense>
            )}
            <IssuesBar />
          </div>
          <Inspector />
        </div>
      </div>
    </PasswordGate>
  )
}
