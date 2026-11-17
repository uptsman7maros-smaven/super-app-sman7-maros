import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';
export const SUPABASE_URL = 'https://ytbbuzarkqgssnmgiwwg.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_R3CzqB76KomrO2i_CKYkxw_0hZOoj5L';
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: false
  }
});
