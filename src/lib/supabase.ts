import { createClient } from '@supabase/supabase-js'

// Same env-var fallback chain as src/integrations/supabase/client.ts so the
// app works on Lovable Cloud, plain Vite, or an external Supabase project.
const env = import.meta.env as Record<string, string | undefined>
const supabaseUrl = env.VITE_SUPABASE_URL || env.SUPABASE_URL || ''
const supabaseAnonKey =
  env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  env.VITE_SUPABASE_ANON_KEY ||
  env.SUPABASE_ANON_KEY ||
  env.SUPABASE_PUBLISHABLE_KEY ||
  ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
