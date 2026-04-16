import { useEffect, useRef, useState, type FocusEvent } from 'react'
import type { Session } from '@supabase/supabase-js'
import { ArrowLeftRight, LogIn, LogOut } from 'lucide-react'
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
  const [isWorkspaceMenuOpen, setIsWorkspaceMenuOpen] = useState(false)
  const [shouldOpenWallLogin, setShouldOpenWallLogin] = useState(false)
  const [wallResetToken, setWallResetToken] = useState(0)
  const workspaceMenuCloseTimeoutRef = useRef<number | null>(null)

  useEffect(() => {
    const handlePopState = () => setRoute(getRouteFromPath())

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    setIsWorkspaceMenuOpen(false)

    if (route === 'wall') {
      setWallResetToken((current) => current + 1)
    }
  }, [route])

  useEffect(
    () => () => {
      if (workspaceMenuCloseTimeoutRef.current) {
        window.clearTimeout(workspaceMenuCloseTimeoutRef.current)
      }
    },
    [],
  )

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
    setIsWorkspaceMenuOpen(false)
    navigateToRoute(route === 'wall' ? 'board' : 'wall')
  }

  const switchToWall = () => {
    setIsWorkspaceMenuOpen(false)
    navigateToRoute('wall')
  }

  const openWallLogin = () => {
    navigateToRoute('wall')
  }

  const openFloatingLogin = () => {
    setIsWorkspaceMenuOpen(false)
    setShouldOpenWallLogin(true)
    navigateToRoute('wall')
  }

  const requestLogout = () => {
    setIsWorkspaceMenuOpen(false)
    setIsLogoutConfirmOpen(true)
  }

  const closeWorkspaceMenuOnBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) {
      setIsWorkspaceMenuOpen(false)
    }
  }

  const clearWorkspaceMenuCloseTimer = () => {
    if (!workspaceMenuCloseTimeoutRef.current) return

    window.clearTimeout(workspaceMenuCloseTimeoutRef.current)
    workspaceMenuCloseTimeoutRef.current = null
  }

  const scheduleWorkspaceMenuClose = () => {
    clearWorkspaceMenuCloseTimer()
    workspaceMenuCloseTimeoutRef.current = window.setTimeout(() => {
      setIsWorkspaceMenuOpen(false)
      workspaceMenuCloseTimeoutRef.current = null
    }, 260)
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
        resetViewSignal={wallResetToken}
      />
    )
  }

  return (
    <div className="workspace-shell">
      <div className="surface-slot">{renderRoute()}</div>

      {route === 'wall' ? (
        <nav
          className={`workspace-brand-nav is-${route}`}
          aria-label="PinWall navigation"
          onMouseEnter={clearWorkspaceMenuCloseTimer}
          onMouseLeave={route === 'wall' ? scheduleWorkspaceMenuClose : undefined}
          onBlur={closeWorkspaceMenuOnBlur}
        >
          <button
            className="brand brand-trigger"
            type="button"
            onClick={() => setIsWorkspaceMenuOpen((current) => !current)}
            aria-expanded={isWorkspaceMenuOpen}
            aria-haspopup="menu"
          >
            <span className="brand-pin" aria-hidden="true" />
            <div>
              <h1>PinWall</h1>
            </div>
          </button>

          {isWorkspaceMenuOpen ? (
            <div className="workspace-menu" role="menu">
              <button type="button" role="menuitem" onClick={switchSurface}>
                <ArrowLeftRight size={15} strokeWidth={2.1} aria-hidden="true" />
                <span>{route === 'wall' ? 'Board' : 'Wall'}</span>
              </button>
              {ownerSession ? (
                <button type="button" role="menuitem" onClick={requestLogout} disabled={isAuthBusy}>
                  <LogOut size={15} strokeWidth={2.1} aria-hidden="true" />
                  <span>Log out</span>
                </button>
              ) : (
                <button type="button" role="menuitem" onClick={openFloatingLogin}>
                  <LogIn size={15} strokeWidth={2.1} aria-hidden="true" />
                  <span>Log in</span>
                </button>
              )}
            </div>
          ) : null}
        </nav>
      ) : null}

      {route === 'board' ? (
        <button className="board-wall-switch" type="button" onClick={switchToWall} aria-label="Switch to Wall" title="Switch to Wall">
          <ArrowLeftRight size={16} strokeWidth={2.05} aria-hidden="true" />
        </button>
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
