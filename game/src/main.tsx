import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { loadWorld } from './store/useWorldStore'
import { setEditMode } from './store/editMode'

// O editor é um chunk separado — não pode entrar no bundle inicial do jogo
const EditorApp = lazy(() => import('./editor/EditorApp'))

async function start() {
  // /editor: app próprio (sem three/@react-three), não carrega o mundo do jogo.
  // editMode congela animações/interações dos componentes de gameplay no
  // preview 3D — precisa estar ligado ANTES de qualquer import do jogo.
  if (window.location.pathname.startsWith('/editor')) {
    setEditMode(true)
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <Suspense fallback={null}>
          <EditorApp />
        </Suspense>
      </StrictMode>,
    )
    return
  }

  // O mundo precisa estar carregado antes do App montar: o useGameStore lê
  // startScene/spawn na inicialização do módulo — por isso o import dinâmico.
  await loadWorld()
  const { default: App } = await import('./App')
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void start()
