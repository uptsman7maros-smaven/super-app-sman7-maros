import { adminApi } from './admin-api.js';
import { escapeHtml } from './utils.js';

let selectedFile = null;
let generatedRows = [];
let classes = [];
let voterPage = 1;
let voterPageCount = 0;
let voterTotal = 0;
let refreshVoterSummary = async () => {};

function excelDateToISO(value) {
  if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const d = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const s = String(value ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)) {
    const [y,m,d] = s.split('-');
    return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
  }
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  return '';
}

function normalizeKey(k) {
  return String(k ?? '').trim().toLowerCase().replace(/\s+/g,' ').replace(/_/g,' ');
}

function findValue(row, names) {
  const map = Object.keys(row).reduce((a,k) => { a[normalizeKey(k)] = row[k]; return a; }, {});
  for (const name of names) {
    const v = map[normalizeKey(name)];
    if (v !== undefined) return v;
  }
  return '';
}

function formatDateTime(value) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('id-ID', { dateStyle:'short', timeStyle:'short' });
}

export function initVoterModule(onVotersUpdated = async () => {}) {
  refreshVoterSummary = onVotersUpdated;
  document.getElementById('syncDataIndukBtn').onclick = syncFromDataInduk;
  document.getElementById('studentFile').addEventListener('change', e => {
    selectedFile = e.target.files[0] || null;
    document.getElementById('studentFileName').textContent = selectedFile ? selectedFile.name : 'XLSX, XLS, atau CSV';
    generatedRows = [];
    document.getElementById('generateImportBtn').disabled = !selectedFile;
    document.getElementById('importBtn').disabled = true;
    document.getElementById('fileSelectedInfo').textContent = selectedFile ? `File dipilih: ${selectedFile.name}` : '';
    document.getElementById('importPreview').innerHTML = '';
    document.getElementById('importInfo').classList.add('hidden');
    document.getElementById('importMessage').textContent = '';
  });
  document.getElementById('generateImportBtn').onclick = generatePreview;
  document.getElementById('importBtn').onclick = importRows;
  document.getElementById('templateBtn').onclick = downloadTemplate;
  document.getElementById('refreshClassesBtn').onclick = loadClasses;
  document.getElementById('refreshVotersBtn').onclick = () => loadVoters();
  document.getElementById('voterRegistry').addEventListener('click', event => {
    const button = event.target.closest('[data-voter-page]');
    if (!button || button.disabled) return;
    loadVoters(Number(button.dataset.voterPage));
  });

  document.getElementById('classForm').onsubmit = async e => {
    e.preventDefault();
    const msg = document.getElementById('classMessage');
    msg.textContent = 'Menyimpan...';
    try {
      await adminApi.addClass(document.getElementById('className').value);
      document.getElementById('className').value = '';
      msg.textContent = 'Kelas berhasil ditambahkan.';
      await loadClasses();
    } catch (err) { msg.textContent = err.message; }
  };
}

async function syncFromDataInduk() {
  const btn = document.getElementById('syncDataIndukBtn');
  const msg = document.getElementById('syncDataIndukMessage');
  btn.disabled = true;
  msg.textContent = 'Menyinkronkan siswa aktif dari Data Induk...';

  try {
    const result = await adminApi.syncDataInduk();
    await Promise.all([loadClasses(), loadVoters()]);
    await refreshVoterSummary();
    msg.textContent = `Sinkron selesai: ${result.processed} siswa, ${result.created} baru, ${result.updated} diperbarui, ${result.ineligible} tidak aktif untuk eOSIS.`;
  } catch (err) {
    msg.textContent = err.message;
  } finally {
    btn.disabled = false;
  }
}

async function generatePreview() {
  if (!selectedFile) return;
  const info = document.getElementById('importInfo');
  info.textContent = 'Membaca Excel...';
  info.classList.remove('hidden');
  let rows;
  try {
    const data = await selectedFile.arrayBuffer();
    const wb = XLSX.read(data, { type:'array', cellDates:true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json(ws, { defval:'' });

    rows = raw.map(r => ({
      nisn: String(findValue(r,['NISN','nisn'])).trim(),
      nama: String(findValue(r,['Nama','Nama Siswa','nama'])).trim(),
      kelas: String(findValue(r,['Kelas','kelas'])).trim(),
      tgl_lahir: excelDateToISO(findValue(r,['Tanggal Lahir','Tgl Lahir','tanggal_lahir'])),
      jenis_kelamin: String(findValue(r,['Jenis Kelamin','JK','jenis_kelamin'])).trim()
    })).filter(r => r.nisn || r.nama || r.kelas || r.tgl_lahir || r.jenis_kelamin);

    if (!rows.length) throw new Error('Tidak ada baris data yang dapat dibaca.');
  } catch (err) {
    info.textContent = 'Gagal membaca file: ' + err.message;
    document.getElementById('importBtn').disabled = true;
    return;
  }

  try {
    const existing = await adminApi.voters();
    const byNisn = new Map(existing.map(x => [String(x.nisn), x]));
    generatedRows = rows.map(r => {
      const old = byNisn.get(r.nisn);
      return {
        ...r,
        status_memilih: old?.status_memilih ?? false,
        waktu_memilih: old?.waktu_memilih ?? null
      };
    });
    const missing = generatedRows.filter(r => !r.nisn || !r.nama || !r.kelas || !r.tgl_lahir || !r.jenis_kelamin);
    renderImportPreview(generatedRows);
    info.textContent = `Generate selesai: ${generatedRows.length} baris. Status hak suara dan waktu memilih ditarik dari Supabase untuk NISN yang sudah ada. ${missing.length ? `Ada ${missing.length} baris yang belum lengkap dan akan dilewati saat import.` : 'Semua data wajib terisi.'}`;
    document.getElementById('importBtn').disabled = !generatedRows.length || missing.length === generatedRows.length;
  } catch (err) {
    info.textContent = 'Gagal mengambil status pemilih dari Supabase: ' + err.message;
    document.getElementById('importBtn').disabled = true;
  }
}

function renderImportPreview(rows) {
  const box = document.getElementById('importPreview');
  box.innerHTML = `<table><thead><tr>
    <th>#</th><th>NISN</th><th>Nama</th><th>Kelas</th><th>Tanggal Lahir</th><th>Jenis Kelamin</th><th>Status Hak Suara</th><th>Waktu Memilih</th>
  </tr></thead><tbody>
  ${rows.slice(0,100).map((r,i) => `<tr>
    <td>${i+1}</td><td>${escapeHtml(r.nisn)}</td><td>${escapeHtml(r.nama)}</td><td>${escapeHtml(r.kelas)}</td>
    <td>${escapeHtml(r.tgl_lahir)}</td><td>${escapeHtml(r.jenis_kelamin || '-')}</td>
    <td><span class="status-pill ${r.status_memilih?'open':'closed'}">${r.status_memilih?'SUDAH MEMILIH':'BELUM MEMILIH'}</span></td>
    <td>${escapeHtml(formatDateTime(r.waktu_memilih))}</td>
  </tr>`).join('')}</tbody></table>
  ${rows.length>100 ? `<p class="small-note">Preview ${100} baris pertama dari ${rows.length}.</p>` : ''}
  <p class="small-note">Setelah import, gunakan tabel "Daftar Pemilih Tersinkron" untuk melihat status hak suara dan waktu memilih yang aktual dari Supabase.</p>`;
}

async function importRows() {
  const validRows = generatedRows.filter(r => r.nisn && r.nama && r.kelas && r.tgl_lahir && r.jenis_kelamin);
  if (!validRows.length) return;
  const msg = document.getElementById('importMessage');
  const btn = document.getElementById('importBtn');
  btn.disabled = true; msg.textContent = `Menyinkronkan ${validRows.length} data...`;
  try {
    const result = await adminApi.importStudents(validRows);
    msg.textContent = `Sinkron selesai. Diproses ${result.processed}, data baru ${result.created}, diperbarui ${result.updated}.`;
    await loadClasses();
    await loadVoters();
    await refreshVoterSummary();
  } catch (err) {
    msg.textContent = err.message;
    btn.disabled = false;
  }
}

export async function loadClasses() {
  const box = document.getElementById('classList');
  box.innerHTML = '<div class="muted">Memuat kelas...</div>';
  try {
    classes = await adminApi.classes();
    box.innerHTML = classes.length ? classes.map(c => `
      <div class="class-row">
        <div><strong>${escapeHtml(c.nama_kelas)}</strong><small>${c.total_siswa} siswa</small></div>
        <button class="btn danger small delete-class" data-id="${c.id}" ${Number(c.total_siswa)>0?'disabled title="Kelas masih digunakan"':''}>Hapus</button>
      </div>`).join('') : '<div class="empty">Belum ada kelas.</div>';
    box.querySelectorAll('.delete-class').forEach(btn => btn.onclick = async () => {
      if (!confirm('Hapus kelas ini?')) return;
      try { await adminApi.deleteClass(Number(btn.dataset.id)); await loadClasses(); await loadVoters(); }
      catch(e) { alert(e.message); }
    });
  } catch(e) { box.textContent = e.message; }
}

export async function loadVoters(page = 1) {
  const box = document.getElementById('voterRegistry');
  box.innerHTML = '<div class="muted">Memuat data pemilih...</div>';
  try {
    const result = await adminApi.votersPage(page);
    if (!Array.isArray(result?.rows) || !Number.isFinite(Number(result.total_count))) {
      throw new Error('Respons daftar pemilih dari Supabase tidak valid.');
    }

    voterPage = Number(result.page);
    voterTotal = Number(result.total_count);
    voterPageCount = Number(result.page_count);
    const startIndex = voterTotal ? (voterPage - 1) * 100 : 0;
    const endIndex = Math.min(startIndex + result.rows.length, voterTotal);

    box.innerHTML = voterTotal ? `<table><thead><tr>
      <th>#</th><th>NISN</th><th>Nama</th><th>Kelas</th><th>Tanggal Lahir</th><th>Jenis Kelamin</th><th>Status Hak Suara</th><th>Waktu Memilih</th>
    </tr></thead><tbody>${result.rows.map((r,i) => `<tr>
      <td>${startIndex + i + 1}</td><td>${escapeHtml(r.nisn)}</td><td>${escapeHtml(r.nama)}</td><td>${escapeHtml(r.nama_kelas)}</td>
      <td>${escapeHtml(r.tgl_lahir || '-')}</td><td>${escapeHtml(r.jenis_kelamin || '-')}</td>
      <td><span class="status-pill ${r.status_memilih?'open':'closed'}">${r.status_memilih?'SUDAH MEMILIH':'BELUM MEMILIH'}</span></td>
      <td>${escapeHtml(formatDateTime(r.waktu_memilih))}</td>
    </tr>`).join('')}</tbody></table>
    <nav class="voter-pagination" aria-label="Navigasi daftar pemilih">
      <span>Menampilkan ${startIndex + 1}–${endIndex} dari ${voterTotal} pemilih · Halaman ${voterPage} dari ${voterPageCount}</span>
      <div>
        <button class="btn secondary small" type="button" data-voter-page="${voterPage - 1}" ${voterPage <= 1 ? 'disabled' : ''}>Sebelumnya</button>
        <button class="btn secondary small" type="button" data-voter-page="${voterPage + 1}" ${voterPage >= voterPageCount ? 'disabled' : ''}>Berikutnya</button>
      </div>
    </nav>` : '<div class="empty">Belum ada data pemilih. Total pemilih: 0.</div>';
  } catch(e) {
    box.innerHTML = `<div class="notice">${escapeHtml(e.message)}</div>`;
  }
}

function downloadTemplate() {
  const data = [
    ['NISN','Nama','Kelas','Tanggal Lahir','Jenis Kelamin'],
    ['1234567890','Agus','XII IPA 1','2006-05-14','L'],
    ['0987654321','Citra','XII IPA 2','2007-08-20','P']
  ];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [{wch:18},{wch:30},{wch:18},{wch:18},{wch:18}];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Pemilih');
  XLSX.writeFile(wb, 'template-data-pemilih-eOSIS-v3.xlsx');
}
