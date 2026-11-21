import { clearAdminSession, hasAdminSession } from './admin-session.js';

const adminRpcNames = new Set([
  'get_public_settings',
  'admin_login',
  'get_dashboard_stats',
  'get_voting_results',
  'get_class_stats',
  'get_classes_v3',
  'get_voter_registry_v3',
  'get_voter_registry_page_v3',
  'get_system_sync_status_v3',
  'set_voting_status',
  'reset_voting_results',
  'save_candidate',
  'delete_candidate',
  'save_school_settings_v3',
  'add_class',
  'delete_class_v3',
  'import_students',
  'eosis_sync_voters_from_datainduk',
  'eosis_is_super_admin',
  'eosis_get_kpu_students',
  'eosis_set_kpu_member',
  'eosis_current_student',
  'get_candidates',
  'eosis_cast_vote'
]);

let rpcRequestNumber = 0;

export async function adminRpc(name, args = {}) {
  if (!adminRpcNames.has(name)) throw new Error(`RPC admin tidak diizinkan: ${name}`);
  if (window.parent === window) {
    const { supabase } = await import('./supabase.js');
    return supabase.rpc(name, args);
  }

  const requestId = `${Date.now()}-${++rpcRequestNumber}`;
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Super App tidak merespons permintaan eOSIS. Muat ulang halaman lalu coba lagi.'));
    }, 15000);

    function onMessage(event) {
      if (event.source !== window.parent || event.origin !== window.location.origin) return;
      const response = event.data;
      if (response?.type !== 'eosis-admin-rpc-result' || response.requestId !== requestId) return;

      window.clearTimeout(timeout);
      window.removeEventListener('message', onMessage);
      if (response.error) {
        const error = Object.assign(new Error(response.error.message), {
          code: response.error.code,
          details: response.error.details,
          hint: response.error.hint
        });
        resolve({ data: null, error });
      } else {
        resolve({ data: response.data, error: null });
      }
    }

    window.addEventListener('message', onMessage);
    window.parent.postMessage({
      type: 'eosis-admin-rpc',
      requestId,
      name,
      args
    }, window.location.origin);
  });
}

async function call(name, args = {}) {
  if (!hasAdminSession()) throw new Error('Sesi admin belum aktif.');
  const { data, error } = await adminRpc(name, { p_username: '', p_password: '', ...args });
  if (['PGRST301', '401'].includes(error?.code) || /JWT expired|Sesi Super App tidak terbaca/i.test(error?.message || '')) {
    clearAdminSession();
    window.dispatchEvent(new Event('eosis-auth-expired'));
  }
  if (error) throw new Error(error.message);
  return data;
}

export const adminApi = {
  settings: () => adminRpc('get_public_settings'),
  stats: () => call('get_dashboard_stats'),
  results: () => call('get_voting_results'),
  classStats: () => call('get_class_stats'),
  classes: () => call('get_classes_v3'),
  voters: () => call('get_voter_registry_v3'),
  votersPage: page => call('get_voter_registry_page_v3', { p_page: page, p_page_size: 100 }),
  sync: () => call('get_system_sync_status_v3'),
  setVoting: active => call('set_voting_status', { p_aktif: active }),
  reset: () => call('reset_voting_results'),
  saveCandidate: args => call('save_candidate', args),
  deleteCandidate: id => call('delete_candidate', { p_id: id }),
  saveSettings: args => call('save_school_settings_v3', args),
  syncDataInduk: async () => {
    if (!hasAdminSession()) throw new Error('Sesi admin belum aktif.');
    const { data, error } = await adminRpc('eosis_sync_voters_from_datainduk');
    if (error) throw new Error(error.message);
    return data;
  },
  addClass: name => call('add_class', { p_nama_kelas: name }),
  deleteClass: id => call('delete_class_v3', { p_id: id }),
  importStudents: rows => call('import_students', { p_rows: rows }),
  isSuperAdmin: async () => {
    const { data, error } = await adminRpc('eosis_is_super_admin');
    if (error) throw new Error(error.message);
    return data === true;
  },
  kpuStudents: async () => {
    const { data, error } = await adminRpc('eosis_get_kpu_students');
    if (error) throw new Error(error.message);
    return data;
  },
  setKpuMember: async (profileId, enabled) => {
    const { data, error } = await adminRpc('eosis_set_kpu_member', {
      p_profile_id: profileId,
      p_is_kpu: enabled
    });
    if (error) throw new Error(error.message);
    return data;
  }
};
