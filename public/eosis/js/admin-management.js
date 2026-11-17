import { adminApi } from './admin-api.js';
import { escapeHtml } from './utils.js';

export function initAdminManagement() {
  const form = document.getElementById('addAdminForm');
  const refresh = document.getElementById('refreshAdminsBtn');
  if (form) form.onsubmit = addAdmin;
  if (refresh) refresh.onclick = loadAdmins;
}

export async function loadAdmins() {
  const box = document.getElementById('adminList');
  if (!box) return;
  box.innerHTML = '<div class="muted">Memuat daftar admin...</div>';
  try {
    const data = await adminApi.admins();
    box.innerHTML = data.length ? data.map(a => `
      <div class="class-row">
        <div>
          <strong>${escapeHtml(a.username)}</strong>
          <small>Ditambahkan: ${formatDate(a.created_at)}</small>
        </div>
        <button class="btn danger small delete-admin" data-id="${a.id}" data-username="${escapeHtml(a.username)}">Hapus</button>
      </div>`).join('') : '<div class="empty">Belum ada admin.</div>';
    box.querySelectorAll('.delete-admin').forEach(btn => {
      btn.onclick = async () => {
        if (!confirm(`Hapus admin "${btn.dataset.username}"?`)) return;
        try {
          await adminApi.deleteAdmin(Number(btn.dataset.id));
          await loadAdmins();
          alert('Admin berhasil dihapus.');
        } catch (e) { alert(e.message); }
      };
    });
  } catch (e) {
    box.innerHTML = `<div class="notice">${escapeHtml(e.message)}</div>`;
  }
}

async function addAdmin(e) {
  e.preventDefault();
  const msg = document.getElementById('addAdminMessage');
  const username = document.getElementById('addAdminUsername').value.trim();
  const password = document.getElementById('addAdminPassword').value;
  msg.textContent = 'Menambahkan admin...';
  try {
    await adminApi.addAdmin({ p_new_username: username, p_new_password: password });
    msg.textContent = 'Admin baru berhasil ditambahkan.';
    e.target.reset();
    await loadAdmins();
  } catch (err) {
    msg.textContent = err.message;
  }
}

function formatDate(value) {
  if (!value) return '-';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString('id-ID');
}
