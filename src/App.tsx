import { useEffect, useState } from 'react'
import './App.css'
import { BoardView } from './views/BoardView'
import { WallView } from './views/WallView'

type Surface = 'wall' | 'board'

const getSurfaceFromPath = (): Surface => (window.location.pathname === '/board' ? 'board' : 'wall')
const getPathForSurface = (surface: Surface) => (surface === 'board' ? '/board' : '/wall')

function App() {
  const [surface, setSurface] = useState<Surface>(getSurfaceFromPath)

  useEffect(() => {
    const handlePopState = () => setSurface(getSurfaceFromPath())

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigateToSurface = (nextSurface: Surface) => {
    setSurface(nextSurface)
    window.history.pushState(null, '', getPathForSurface(nextSurface))
  }

  return (
    <div className="workspace-shell">
      <nav className="workspace-nav" aria-label="Workspace views">
        <div className="workspace-name">PinWall</div>
        <div className="workspace-tabs">
          <button className={surface === 'wall' ? 'is-active' : ''} onClick={() => navigateToSurface('wall')}>
            Wall
          </button>
          <button className={surface === 'board' ? 'is-active' : ''} onClick={() => navigateToSurface('board')}>
            Board
          </button>
        </div>
      </nav>

      <div className="surface-slot">{surface === 'wall' ? <WallView /> : <BoardView />}</div>
    </div>
  )
}

export default App
