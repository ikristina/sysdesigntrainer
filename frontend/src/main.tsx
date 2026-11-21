import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ReactFlowProvider } from '@xyflow/react'
import '@xyflow/react/style.css' // React Flow's base styles, before ours so ours win
import './index.css'
import App from './App.tsx'
import { startLink } from './link'

startLink() // mirror state to the backend for Claude; harmless if no backend is running

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Lets any component (not just ones inside <ReactFlow>) use React Flow's hooks. */}
    <ReactFlowProvider>
      <App />
    </ReactFlowProvider>
  </StrictMode>,
)
