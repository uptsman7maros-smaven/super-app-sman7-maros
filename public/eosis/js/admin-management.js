import { adminApi } from './admin-api.js';
import { escapeHtml } from './utils.js';

let kpuStudents = [];

export function initAdminManagement() {
  const search = document.getElementById('kpuSearch');
  const refresh = document.getElementById('refreshKpuBtn');
  const list = document.getElementById('kpuStudentList');

  if (!search || !refresh || !list) return;

  search.addEventListener('input', renderKpuStudents);
  refresh.addEventListener('click', loadKpuMembers);
  list.addEventListener('click', async event => {
    const button = event.target.closest('[data-profile-id]');
    if (!button || button.disabled) return;

    const profileId = button.dataset.profileId;
    if (!profileId) return;

    const enabled = button.dataset.isKpu !== 'true';
    const message = document.getElementById('kpuMessage');
    button.disabled = true;
    message.textContent = enabled ? 'Memberikan akses KPU...' : 'Mencabut akses KPU...';

    try {
      await adminApi.setKpuMember(profileId, enabled);
      message.textContent = enabled ? 'Akun siswa ditambahkan sebagai anggota KPU.' : 'Akses KPU akun siswa dicabut.';
      await loadKpuMembers();
    } catch (error) {
      message.textContent = error instanceof Error ? error.message : String(error);
      button.disabled = false;
    }
  });
}

export async function loadKpuMembers() {
  const list = document.getElementById('kpuStudentList');
  const message = document.getElementById('kpuMessage');
  if (!list || !message) return;

  list.innerHTML = '<div class="muted">Memuat daftar akun siswa...</div>';
  try {
    const result = await adminApi.kpuStudents();
    if (!Array.isArray(result)) throw new Error('Respons daftar akun siswa dari Supabase tidak valid.');
    kpuStudents = result;
    renderKpuStudents();
  } catch (error) {
    list.innerHTML = `<div class="notice">${escapeHtml(error instanceof Error ? error.message : String(error))}</div>`;
  }
}

function renderKpuStudents() {
  const list = document.getElementById('kpuStudentList');
  const search = document.getElementById('kpuSearch');
  if (!list || !search) return;

  const query = search.value.trim().toLocaleLowerCase('id-ID');
  const rows = kpuStudents.filter(student =>
    `${student.full_name || ''} ${student.nisn || ''}`.toLocaleLowerCase('id-ID').includes(query)
  );

  if (!rows.length) {
    list.innerHTML = '<div class="empty">Tidak ada akun siswa aktif yang cocok.</div>';
    return;
  }

  list.innerHTML = rows.map(student => `
    <div class="kpu-student-row">
      <div>
        <strong>${escapeHtml(student.full_name || 'Tanpa nama')}</strong>
        <small>NISN ${escapeHtml(student.nisn || '-')} · ${escapeHtml(student.class_name || 'Kelas belum diatur')}</small>
      </div>
      <button
        class="btn small ${student.is_kpu ? 'kpu-enabled' : 'secondary'}"
        type="button"
        data-profile-id="${escapeHtml(student.profile_id)}"
        data-is-kpu="${student.is_kpu ? 'true' : 'false'}"
        aria-pressed="${student.is_kpu ? 'true' : 'false'}"
      >${student.is_kpu ? 'Cabut akses KPU' : 'Jadikan anggota KPU'}</button>
    </div>`).join('');
}
