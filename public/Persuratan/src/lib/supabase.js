import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) console.warn('Isi VITE_SUPABASE_URL dan VITE_SUPABASE_ANON_KEY pada .env')

export const supabase = createClient(url || 'http://localhost', anonKey || 'public-anon-key')
