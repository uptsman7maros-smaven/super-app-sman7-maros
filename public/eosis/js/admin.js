import { setAdminSession, hasAdminSession, clearAdminSession } from './admin-session.js';
import { loadBranding } from './branding.js';
import { loadDashboard, updateStatusBadge } from './admin-dashboard.js';
import { initCandidateModule, loadCandidates } from './admin-candidates.js';
import { initSettings, loadSettings } from './admin-settings.js';
import { initVoterModule, loadClasses, loadVoters } from './admin-voters.js';
import { exportResultsExcel, exportResultsPdf } from './admin-export.js';
import { adminApi, adminRpc } from './admin-api.js';
import { initAdminManagement, loadKpuMembers } from './admin-management.js';

const loginForm = document.getElementById('adminLoginForm');
const loginCard = document.getElementById('adminLoginCard');
const dashboard = document.getElementById('dashboard');
const message = document.getElementById('adminMessage');
const verifyButton = loginForm.querySelector('button[type="submit"]');
let settings = null;
let verifyingAdmin = false;
let isSuperAdmin = false;

window.addEventListener('eosis-auth-expired', () => {
  dashboard.classList.add('hidden');
  loginCard.classList.remove('hidden');
  message.textContent = 'Sesi Super App tidak aktif. Masuk kembali melalui Super App.';
  message.style.color = '#b42318';
});

(async()=>{ try { await loadBranding(); } catch(e) { console.error(e); } })();

loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  if (verifyingAdmin) return;
  verifyingAdmin = true;
  verifyButton.disabled = true;
  message.textContent = 'Memeriksa akun...';
  message.style.color = '#333';
  try {
    const { data, error } = await adminRpc('admin_login', { p_username: '', p_password: '' });
    const loginSuccess = data === true || data?.success === true;
    if (error || !loginSuccess) {
      message.textContent = error
        ? `Verifikasi akses gagal${error.code ? ` (${error.code})` : ''}: ${error.message}`
        : 'Akun ini tidak memiliki role admin Super App yang aktif.';
      message.style.color = '#b42318';
      return;
    }
    setAdminSession();
    loginCard.classList.add('hidden');
    dashboard.classList.remove('hidden');
    try { await startDashboard(); }
    catch(err) { showMessage(err.message); }
  } catch (err) {
    message.textContent = err instanceof Error ? err.message : String(err);
    message.style.color = '#b42318';
  } finally {
    verifyingAdmin = false;
    verifyButton.disabled = false;
  }
});

document.getElementById('adminLogout').onclick = () => {
  clearAdminSession();
  dashboard.classList.add('hidden');
  loginCard.classList.remove('hidden');
};

document.getElementById('refreshBtn').onclick = async () => {
  try { await loadDashboard(); showMessage('Dashboard diperbarui dari Supabase.'); }
  catch(e) { showMessage(e.message); }
};

document.getElementById('exportExcelBtn').onclick = async () => {
  try { await exportResultsExcel(); } catch(e) { showMessage(e.message); }
};

document.getElementById('exportPdfBtn').onclick = async () => {
  try { await exportResultsPdf(); } catch(e) { showMessage(e.message); }
};

document.getElementById('toggleVotingBtn').onclick = async () => {
  try {
    const current = Boolean(settings?.pemilihan_aktif);
    if (!confirm(current ? 'Tutup pemilihan sekarang? Siswa tidak akan dapat login.' : 'Buka pemilihan sekarang?')) return;
    await adminApi.setVoting(!current);
    settings = await loadSettings();
    updateStatusBadge(Boolean(settings.pemilihan_aktif));
    showMessage(settings.pemilihan_aktif ? 'Pemilihan dibuka.' : 'Pemilihan ditutup.');
  } catch(e) { showMessage(e.message); }
};

document.getElementById('resetBtn').onclick = async () => {
  if (!hasAdminSession()) return;
  if (!confirm('Yakin reset SEMUA hasil pemilihan? Semua suara dihapus, status hak suara kembali BELUM MEMILIH, dan waktu memilih dikosongkan.')) return;
  try {
    await adminApi.reset();
    await loadDashboard();
    await loadVoters();
    await runSyncCheck();
    showMessage('Reset berhasil. Semua suara menjadi 0, semua pemilih kembali BELUM MEMILIH, dan waktu memilih dikosongkan.');
  } catch(e) { showMessage(e.message); }
};

document.querySelectorAll('.tab').forEach(tab => tab.onclick = async () => {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  tab.classList.add('active');
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.getElementById(tab.dataset.tab).classList.remove('hidden');
  try {
    if (tab.dataset.tab === 'dashboardTab') await loadDashboard();
    if (tab.dataset.tab === 'candidateTab') await loadCandidates();
    if (tab.dataset.tab === 'voterTab') { await loadClasses(); await loadVoters(); }
    if (tab.dataset.tab === 'settingsTab') {
      await loadSettings();
      if (isSuperAdmin) await loadKpuMembers();
    }
    if (tab.dataset.tab === 'syncTab') await runSyncCheck();
  } catch(e) { showMessage(e.message); }
});

document.getElementById('syncBtn').onclick = runSyncCheck;

async function runSyncCheck() {
  const box = document.getElementById('syncResult');
  const raw = document.getElementById('syncRaw');
  box.innerHTML = '<div class="muted">Memeriksa Supabase...</div>';
  raw.classList.add('hidden');
  try {
    const data = await adminApi.sync();
    const items = [
      ['Koneksi Database', data.database_connected ? 'TERHUBUNG' : 'GAGAL'],
      ['Pengaturan Sekolah', data.pengaturan],
      ['Kelas', data.kelas],
      ['Siswa/Pemilih', data.siswa],
      ['Kandidat', data.kandidat],
      ['Suara', data.suara],
      ['Siswa Sudah Memilih', data.siswa_sudah_memilih],
      ['Total Suara Kandidat', data.total_suara_kandidat],
      ['Status Sinkronisasi', data.sinkron_status],
      ['Diperiksa', new Date(data.checked_at).toLocaleString('id-ID')]
    ];
    box.innerHTML = items.map(([k,v]) => `<div class="sync-card"><span>${k}</span><strong>${v}</strong></div>`).join('');
    raw.textContent = JSON.stringify(data, null, 2);
    raw.classList.remove('hidden');
  } catch(e) {
    box.innerHTML = `<div class="notice">${e.message}</div>`;
  }
}

initCandidateModule();
initSettings();
initVoterModule(async () => {
  try {
    await loadDashboard();
    await runSyncCheck();
  } catch (error) {
    showMessage(`Data pemilih tersimpan, tetapi ringkasan belum diperbarui: ${error.message}`);
  }
});
initAdminManagement();

async function startDashboard() {
  isSuperAdmin = await adminApi.isSuperAdmin();
  document.getElementById('kpuManagementPanel').classList.toggle('hidden', !isSuperAdmin);
  settings = await loadSettings();
  updateStatusBadge(Boolean(settings.pemilihan_aktif));
  await loadDashboard();
  await loadCandidates();
  await loadClasses();
  await loadVoters();
}

if (window.parent !== window) {
  loginForm.requestSubmit();
}

function showMessage(text) {
  const el = document.getElementById('globalMessage');
  el.textContent = text;
  el.classList.add('notice');
  setTimeout(() => { el.textContent=''; el.classList.remove('notice'); }, 6000);
}
