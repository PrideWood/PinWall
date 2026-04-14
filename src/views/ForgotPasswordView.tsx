import { useState } from 'react'
import '../App.css'
import { sendPasswordResetEmail } from '../lib/authRepository'

type ForgotPasswordViewProps = {
  onBackToLogin: () => void
}

export function ForgotPasswordView({ onBackToLogin }: ForgotPasswordViewProps) {
  const [email, setEmail] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [isSending, setIsSending] = useState(false)

  const submitResetRequest = async () => {
    const normalizedEmail = email.trim()

    if (!normalizedEmail) {
      setError('Enter the email address for the owner account.')
      setNotice('')
      return
    }

    setIsSending(true)
    setError('')
    setNotice('')

    try {
      // Password reset flow: send Supabase's recovery email with /update-password as redirect target.
      await sendPasswordResetEmail(normalizedEmail)
      setNotice('Password reset email sent. Check your inbox, then return through the link in the email.')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not send reset email.')
    } finally {
      setIsSending(false)
    }
  }

  return (
    <main className="auth-page-shell">
      <section className="auth-card" aria-label="Send password reset email">
        <div className="auth-card-copy">
          <span className="brand-pin" aria-hidden="true" />
          <h1>Reset password</h1>
          <p>Enter the owner email and Supabase will send a secure reset link.</p>
        </div>

        <form
          className="auth-form"
          onSubmit={(event) => {
            event.preventDefault()
            void submitResetRequest()
          }}
        >
          <label>
            Email
            <input
              autoFocus
              aria-label="Password reset email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="owner@example.com"
              autoComplete="email"
            />
          </label>

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
            <button className="primary-button" type="submit" disabled={isSending}>
              {isSending ? 'Sending...' : 'Send reset email'}
            </button>
          </div>
        </form>
      </section>
    </main>
  )
}
