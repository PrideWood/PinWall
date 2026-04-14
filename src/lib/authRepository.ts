import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { getMissingSupabaseEnvVars, hasSupabaseConfig, supabase } from './supabase'

const requireSupabase = () => {
  if (!hasSupabaseConfig || !supabase) {
    throw new Error(`Missing ${getMissingSupabaseEnvVars().join(' and ')}.`)
  }

  return supabase
}

export const getOwnerSession = async (): Promise<Session | null> => {
  const client = requireSupabase()
  const { data, error } = await client.auth.getSession()

  if (error) {
    throw new Error(`Could not read owner session. ${error.message}`)
  }

  return data.session
}

export const onOwnerSessionChange = (callback: (session: Session | null) => void) => {
  const client = requireSupabase()
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((_event, session) => callback(session))

  return () => subscription.unsubscribe()
}

// Password reset flow: Supabase redirects recovery links back to /update-password.
// Use the current origin so local dev, preview deploys, and production domains do not hardcode localhost.
export const getPasswordResetRedirectUrl = () => `${window.location.origin}/update-password`

export const sendPasswordResetEmail = async (email: string) => {
  const client = requireSupabase()
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: getPasswordResetRedirectUrl(),
  })

  if (error) {
    throw new Error(`Could not send reset email. ${error.message}`)
  }
}

export const updateOwnerPassword = async (password: string) => {
  const client = requireSupabase()
  const { error } = await client.auth.updateUser({ password })

  if (error) {
    throw new Error(`Could not update password. ${error.message}`)
  }
}

export const onPasswordRecoverySession = (callback: (session: Session | null) => void) => {
  const client = requireSupabase()
  const {
    data: { subscription },
  } = client.auth.onAuthStateChange((event: AuthChangeEvent, session) => {
    if (event === 'PASSWORD_RECOVERY') {
      callback(session)
    }
  })

  return () => subscription.unsubscribe()
}

export const signInOwner = async (email: string, password: string): Promise<Session> => {
  const client = requireSupabase()
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    throw new Error(`Owner login failed. ${error.message}`)
  }

  if (!data.session) {
    throw new Error('Owner login failed. No session was returned.')
  }

  return data.session
}

export const signOutOwner = async () => {
  const client = requireSupabase()
  const { error } = await client.auth.signOut()

  if (error) {
    throw new Error(`Could not sign out. ${error.message}`)
  }
}
