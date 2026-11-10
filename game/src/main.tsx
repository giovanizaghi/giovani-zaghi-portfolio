import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { loadWorld } from './store/useWorldStore'

async function start() {
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
