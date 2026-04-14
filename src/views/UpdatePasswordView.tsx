import { useEffect, useState } from 'react'
import '../App.css'
import { getOwnerSession, onPasswordRecoverySession, updateOwnerPassword } from '../lib/authRepository'

type UpdatePasswordViewProps = {
  onBackToLogin: () => void
}

const minimumPasswordLength = 8

export function UpdatePasswordView({ onBackToLogin }: UpdatePasswordViewProps) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [hasRecoverySession, setHasRecoverySession] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  useEffect(() => {
    let isMounted = true

    // Password reset flow: Supabase v2 emits PASSWORD_RECOVERY when the recovery link is consumed.
    const unsubscribeRecovery = onPasswordRecoverySession((session) => {
      if (!isMounted) return
      setHasRecoverySession(Boolean(session))
      setError('')
      setIsCheckingSession(false)
    })

    getOwnerSession()
      .then((session) => {
        if (!isMounted) return
        setHasRecoverySession(Boolean(session))
        setError(session ? '' : 'This reset link is invalid or has expired. Please request a new password reset email.')
      })
      .catch((sessionError: Error) => {
        if (!isMounted) return
        setError(sessionError.message)
      })
      .finally(() => {
        if (isMounted) setIsCheckingSession(false)
      })

    return () => {
      isMounted = false
      unsubscribeRecovery()
    }
  }, [])

  const submitNewPassword = async () => {
    setError('')
    setNotice('')

    if (!hasRecoverySession) {
      setError('This reset link is invalid or has expired. Please request a new password reset email.')
      return
    }

    if (newPassword.length < minimumPasswordLength) {
      setError(`Use at least ${minimumPasswordLength} characters for the new password.`)
      return
    }

    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match.')
      return
    }

    setIsUpdating(true)

    try {
      // Password reset flow: once the recovery session exists, update the current Supabase user password.
      await updateOwnerPassword(newPassword)
      setNewPassword('')
      setConfirmPassword('')
      setNotice('Password updated. You can return to the Wall login and sign in with the new password.')
      setHasRecoverySession(false)
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update password.')
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <main className="auth-page-shell">
      <section className="auth-card" aria-label="Update password">
        <div className="auth-card-copy">
          <span className="brand-pin" aria-hidden="true" />
          <h1>Choose a new password</h1>
          <p>Use the reset link from your email, then set a new owner password here.</p>
        </div>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submitNewPassword()
          }}
        >
          <label>
            New password
            <input
              autoFocus
              aria-label="New password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              placeholder="new password"
              autoComplete="new-password"
              disabled={isCheckingSession || !hasRecoverySession || Boolean(notice)}
            />
          </label>
          <label>
            Confirm password
            <input
              aria-label="Confirm new password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              placeholder="confirm password"
              autoComplete="new-password"
              disabled={isCheckingSession || !hasRecoverySession || Boolean(notice)}
            />
          </label>

          {isCheckingSession ? (
            <p className="auth-message" role="status">
              Checking reset link...
            </p>
          ) : null}
          {error ? (
            <p className="auth-message is-error" role="alert">
              {error}
            </p>
          ) : null}
          {notice ? (
            <p className="auth-message" role="status">
              {notice}
            </p>
          ) : null}

          <div className="auth-actions">
            <button className="quiet-button" type="button" onClick={onBackToLogin}>
              Back to login
            </button>
            <button className="primary-button" type="submit" disabled={isCheckingSession || !hasRecoverySession || isUpdating || Boolean(notice)}>
              {isUpdating ? 'Updating...' : 'Update password'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
