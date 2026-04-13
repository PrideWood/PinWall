import { createClient } from '@supabase/supabase-js'

export const supabaseEnvNames = {
  url: 'VITE_SUPABASE_URL',
  publishableKey: 'VITE_SUPABASE_PUBLISHABLE_KEY',
} as const

const readViteEnv = (name: (typeof supabaseEnvNames)[keyof typeof supabaseEnvNames]) => {
  const value = import.meta.env[name] as string | undefined
  return value?.trim() || undefined
}

const supabaseUrl = readViteEnv(supabaseEnvNames.url)
const supabasePublishableKey = readViteEnv(supabaseEnvNames.publishableKey)

export const hasSupabaseConfig = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = supabaseUrl && supabasePublishableKey ? createClient(supabaseUrl, supabasePublishableKey) : null

export const getMissingSupabaseEnvVars = () =>
  [
    [supabaseEnvNames.url, supabaseUrl],
    [supabaseEnvNames.publishableKey, supabasePublishableKey],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name)
