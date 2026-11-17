import { adminApi } from './admin-api.js';
import { readImageAsDataUrl } from './utils.js';

let logoData = '';
let currentSettings = {};

function setValue(id, value='') {
  const el = document.getElementById(id);
  if (el) el.value = value ?? '';
}
function preview(src) {
  const p = document.getElementById('schoolLogoPreview');
  if (src) { p.innerHTML = `<img src="${src}" alt="Logo">`; p.classList.remove('hidden'); }
  else { p.innerHTML=''; p.classList.add('hidden'); }
}

export async function loadSettings() {
  const { data, error } = await adminApi.settings();
  if (error) throw error;
  currentSettings = data || {};
  setValue('schoolNameInput', currentSettings.nama_sekolah);
  setValue('kopNameInput', currentSettings.kop_nama_sekolah);
  setValue('kopSubtitleInput', currentSettings.kop_subjudul);
  setValue('kopAddressInput', currentSettings.kop_alamat);
  setValue('kopContactInput', currentSettings.kop_kontak);
  setValue('masaBaktiMulai', currentSettings.masa_bakti_mulai);
  setValue('masaBaktiSelesai', currentSettings.masa_bakti_selesai);
  setValue('ditetapkanDi', currentSettings.ditetapkan_di);
  setValue('tanggalDitetapkan', currentSettings.tanggal_ditetapkan);
  setValue('pembinaNama', currentSettings.pembina_osis_nama);
  setValue('pembinaNip', currentSettings.pembina_osis_nip);
  setValue('ketuaPanitiaNama', currentSettings.ketua_panitia_nama);
  setValue('ketuaPanitiaNisn', currentSettings.ketua_panitia_nisn);
  setValue('kepalaSekolahNama', currentSettings.kepala_sekolah_nama);
  setValue('kepalaSekolahNip', currentSettings.kepala_sekolah_nip);
  logoData = currentSettings.logo_url || '';
  preview(logoData);
  return currentSettings;
}

export function getCurrentSettings() { return currentSettings; }

export function initSettings() {
  document.getElementById('schoolLogoInput').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById('schoolLogoName').textContent = file.name;
    try {
      logoData = await readImageAsDataUrl(file, 500, .82);
      preview(logoData);
    } catch(err) { alert(err.message); }
  });

  document.getElementById('settingsForm').onsubmit = async e => {
    e.preventDefault();
    const msg = document.getElementById('settingsMessage');
    msg.textContent = 'Menyimpan pengaturan...';
    try {
      await adminApi.saveSettings({
        p_nama_sekolah: document.getElementById('schoolNameInput').value.trim(),
        p_logo_url: logoData,
        p_kop_nama_sekolah: document.getElementById('kopNameInput').value.trim(),
        p_kop_subjudul: document.getElementById('kopSubtitleInput').value.trim(),
        p_kop_alamat: document.getElementById('kopAddressInput').value.trim(),
        p_kop_kontak: document.getElementById('kopContactInput').value.trim(),
        p_masa_bakti_mulai: document.getElementById('masaBaktiMulai').value || null,
        p_masa_bakti_selesai: document.getElementById('masaBaktiSelesai').value || null,
        p_ditetapkan_di: document.getElementById('ditetapkanDi').value.trim(),
        p_tanggal_ditetapkan: document.getElementById('tanggalDitetapkan').value || null,
        p_pembina_osis_nama: document.getElementById('pembinaNama').value.trim(),
        p_pembina_osis_nip: document.getElementById('pembinaNip').value.trim(),
        p_ketua_panitia_nama: document.getElementById('ketuaPanitiaNama').value.trim(),
        p_ketua_panitia_nisn: document.getElementById('ketuaPanitiaNisn').value.trim(),
        p_kepala_sekolah_nama: document.getElementById('kepalaSekolahNama').value.trim(),
        p_kepala_sekolah_nip: document.getElementById('kepalaSekolahNip').value.trim()
      });
      currentSettings = await loadSettings();
      document.querySelectorAll('[data-school-name]').forEach(x => x.textContent = currentSettings.nama_sekolah);
      document.querySelectorAll('[data-school-logo]').forEach(x => { if (logoData) { x.src=logoData; x.classList.remove('hidden'); } });
      msg.textContent = 'Pengaturan berhasil disimpan dan tersinkron ke Supabase.';
    } catch(err) { msg.textContent = err.message; }
  };

  document.getElementById('previewPdfBtn').onclick = async () => {
    try {
      const { exportResultsPdf } = await import('./admin-export.js');
      await exportResultsPdf();
    } catch(e) { alert(e.message); }
  };
}
