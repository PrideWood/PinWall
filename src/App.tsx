import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowRightLeft, LogIn, LogOut } from 'lucide-react'
import './App.css'
import { getOwnerSession, onOwnerSessionChange, signOutOwner } from './lib/authRepository'
import { BoardView } from './views/BoardView'
import { ForgotPasswordView } from './views/ForgotPasswordView'
import { UpdatePasswordView } from './views/UpdatePasswordView'
import { WallView } from './views/WallView'

type Route = 'wall' | 'board' | 'forgot-password' | 'update-password'

const getRouteFromPath = (): Route => {
  if (window.location.pathname === '/board') return 'board'
  if (window.location.pathname === '/forgot-password') return 'forgot-password'
  if (window.location.pathname === '/update-password') return 'update-password'
  return 'wall'
}

const getPathForRoute = (route: Route) => (route === 'board' ? '/board' : route === 'forgot-password' ? '/forgot-password' : route === 'update-password' ? '/update-password' : '/wall')

function App() {
  const [route, setRoute] = useState<Route>(getRouteFromPath)
  const [ownerSession, setOwnerSession] = useState<Session | null>(null)
  const [authNotice, setAuthNotice] = useState('')
  const [isAuthBusy, setIsAuthBusy] = useState(false)
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [shouldOpenWallLogin, setShouldOpenWallLogin] = useState(false)
  const isSurfaceRoute = route === 'wall' || route === 'board'

  useEffect(() => {
    const handlePopState = () => setRoute(getRouteFromPath())

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    getOwnerSession()
      .then(setOwnerSession)
      .catch((error: Error) => {
        setAuthNotice(error.message)
      })

    try {
      return onOwnerSessionChange(setOwnerSession)
    } catch (error) {
      setAuthNotice(error instanceof Error ? error.message : 'Could not watch owner session.')
    }
  }, [])

  const navigateToRoute = (nextRoute: Route) => {
    if (nextRoute === route) return

    setRoute(nextRoute)
    window.history.pushState(null, '', getPathForRoute(nextRoute))
  }

  const switchSurface = () => {
    navigateToRoute(route === 'wall' ? 'board' : 'wall')
  }

  const openWallLogin = () => {
    navigateToRoute('wall')
  }

  const openFloatingLogin = () => {
    setShouldOpenWallLogin(true)
    navigateToRoute('wall')
  }

  const logoutOwner = async () => {
    setIsAuthBusy(true)

    try {
      await signOutOwner()
      setOwnerSession(null)
      setIsLogoutConfirmOpen(false)
      setAuthNotice('Owner mode is off.')
    } catch (error) {
      setAuthNotice(error instanceof Error ? error.message : 'Could not sign out.')
    } finally {
      setIsAuthBusy(false)
    }
  }

  const renderRoute = () => {
    if (route === 'board') return <BoardView />
    if (route === 'forgot-password') return <ForgotPasswordView onBackToLogin={openWallLogin} />
    if (route === 'update-password') return <UpdatePasswordView onBackToLogin={openWallLogin} />
    return (
      <WallView
        authNotice={authNotice}
        ownerSession={ownerSession}
        shouldOpenLogin={shouldOpenWallLogin}
        onAuthNotice={setAuthNotice}
        onForgotPassword={() => navigateToRoute('forgot-password')}
        onLoginRequestHandled={() => setShouldOpenWallLogin(false)}
        onOwnerSessionChange={setOwnerSession}
      />
    )
  }

  return (
    <div className="workspace-shell">
      <div className="surface-slot">{renderRoute()}</div>

      {isSurfaceRoute ? (
        <div className="floating-control-stack" aria-label="Floating workspace controls">
          <button className="mode-switch-bubble" type="button" onClick={switchSurface} aria-label={`Switch to ${route === 'wall' ? 'Board' : 'Wall'}`}>
            <ArrowRightLeft size={19} strokeWidth={2.2} aria-hidden="true" />
          </button>
          {ownerSession ? (
            <button className="auth-float-bubble" type="button" onClick={() => setIsLogoutConfirmOpen(true)} disabled={isAuthBusy} aria-label="Log out" title="Log out">
              <LogOut size={19} strokeWidth={2.2} aria-hidden="true" />
            </button>
          ) : (
            <button className="auth-float-bubble" type="button" onClick={openFloatingLogin} aria-label="Log in" title="Log in">
              <LogIn size={19} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </div>
      ) : null}

      {isLogoutConfirmOpen ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setIsLogoutConfirmOpen(false)}>
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-label="Confirm logout" onMouseDown={(event) => event.stopPropagation()}>
            <h2>Leave owner mode?</h2>
            <p>You will be signed out and editing controls will be hidden.</p>
            <div className="confirm-actions">
              <button className="quiet-button" type="button" onClick={() => setIsLogoutConfirmOpen(false)}>
                Stay
              </button>
              <button className="primary-button danger-action" type="button" onClick={logoutOwner} disabled={isAuthBusy}>
                {isAuthBusy ? 'Leaving...' : 'Leave'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default App
