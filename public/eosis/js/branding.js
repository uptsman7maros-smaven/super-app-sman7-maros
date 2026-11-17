import { adminRpc } from './admin-api.js';
import { escapeHtml } from './utils.js';

export async function loadBranding() {
  const { data, error } = await adminRpc('get_public_settings');
  if (error) throw error;
  const s = data || {};
  document.querySelectorAll('[data-school-name]').forEach(el => el.textContent = s.nama_sekolah || 'SMAN 7 MAROS');
  document.querySelectorAll('[data-school-logo]').forEach(el => {
    if (s.logo_url) {
      el.src = s.logo_url;
      el.classList.remove('hidden');
    } else {
      el.classList.add('hidden');
    }
  });
  document.querySelectorAll('[data-voting-status]').forEach(el => {
    el.textContent = s.pemilihan_aktif ? 'PEMILIHAN DIBUKA' : 'PEMILIHAN DITUTUP';
    el.className = `status-pill ${s.pemilihan_aktif ? 'open' : 'closed'}`;
  });
  return s;
}
