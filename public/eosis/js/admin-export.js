import { adminApi } from './admin-api.js';
import { latestStats, latestResults } from './admin-dashboard.js';

function fmtDate(value) {
  if (!value) return '-';
  const d = new Date(value + (String(value).length === 10 ? 'T00:00:00' : ''));
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString('id-ID', {day:'2-digit', month:'long', year:'numeric'});
}

function safeText(v) { return String(v ?? '').trim(); }

function periodText(s) {
  if (s.masa_bakti_mulai && s.masa_bakti_selesai) {
    const a = String(s.masa_bakti_mulai).slice(0, 4);
    const b = String(s.masa_bakti_selesai).slice(0, 4);
    return `${a}/${b}`;
  }
  if (s.masa_bakti_mulai) return String(s.masa_bakti_mulai).slice(0, 4);
  return '-';
}

function getSettings() {
  return adminApi.settings().then(r => {
    if (r.error) throw r.error;
    return r.data || {};
  });
}

export async function exportResultsExcel() {
  const s = await getSettings();
  const stats = latestStats || await adminApi.stats();
  const results = latestResults.length ? latestResults : await adminApi.results();
  const classes = await adminApi.classStats();
  const total = Number(stats.total_suara || 0);
  const rows = [
    [s.kop_nama_sekolah || s.nama_sekolah || 'SMAN 7 MAROS'],
    [s.kop_subjudul || 'PEMILIHAN KETUA DAN WAKIL KETUA OSIS'],
    [s.kop_alamat || ''], [s.kop_kontak || ''], [''],
    ['BERITA ACARA & REKAPITULASI HASIL PEMUNGUTAN SUARA'],
    ['Masa Bakti', periodText(s)],
    ['Ditetapkan di', s.ditetapkan_di || '-'],
    ['Tanggal ditetapkan', fmtDate(s.tanggal_ditetapkan)],
    [''],
    ['RINGKASAN'], ['Total DPT', Number(stats.total_siswa||0)], ['Total Suara Sah Masuk', total],
    ['Belum Memilih', Number(stats.belum_memilih||0)], ['Tingkat Partisipasi', Number(stats.total_siswa||0) ? `${((Number(stats.sudah_memilih||0)/Number(stats.total_siswa||0))*100).toFixed(1)}%` : '0.0%'], [''],
    ['HASIL PASANGAN CALON'], ['No. Urut','Pasangan Calon','Slogan Kampanye','Suara Sah','Persentase','Keterangan']
  ];
  results.forEach(r => {
    const n = Number(r.total_suara||0);
    const pct = total ? `${(n/total*100).toFixed(1)}%` : '0.0%';
    rows.push([r.no_urut, `${safeText(r.nama_ketua)} & ${safeText(r.nama_wakil)}`, safeText(r.slogan), n, pct, '']);
  });
  rows.push([''],['REKAPITULASI PARTISIPASI PEMILIH PER KELAS'],['No','Nama Kelas','Total DPT','Sudah Memilih','Belum Memilih','Partisipasi (%)']);
  (Array.isArray(classes) ? classes : []).forEach((r, i) => {
    const dpt = Number(r.total_siswa||0), sudah = Number(r.sudah_memilih||0), belum = Math.max(dpt-sudah,0);
    rows.push([i+1, r.nama_kelas || '-', dpt, sudah, belum, dpt ? `${(sudah/dpt*100).toFixed(1)}%` : '0.0%']);
  });
  rows.push([''],['PENANDATANGAN'],['Pembina OSIS',s.pembina_osis_nama||'-',s.pembina_osis_nip||'-']);
  rows.push(['Ketua Panitia',s.ketua_panitia_nama||'-',s.ketua_panitia_nisn||'-']);
  rows.push(['Kepala Sekolah',s.kepala_sekolah_nama||'-',s.kepala_sekolah_nip||'-']);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:14},{wch:32},{wch:38},{wch:16},{wch:16},{wch:22}];
  const wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Hasil Pemilihan');
  XLSX.writeFile(wb,`hasil-pemilihan-eOSIS-${new Date().toISOString().slice(0,10)}.xlsx`);
}

export async function exportResultsPdf() {
  const s = await getSettings();
  const stats = latestStats || await adminApi.stats();
  const results = latestResults.length ? latestResults : await adminApi.results();
  const classes = await adminApi.classStats();
  const { jsPDF } = window.jspdf;
  if (!jsPDF) throw new Error('Library PDF belum termuat. Periksa koneksi internet.');

  const doc = new jsPDF({orientation:'portrait', unit:'mm', format:'a4'});
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 12;

  // =========================
  // KOP SURAT
  // =========================
  if (s.logo_url) {
    try {
      const type = String(s.logo_url).startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(s.logo_url, type, margin, y, 25, 25);
    } catch(e) {}
  }

  const textX = s.logo_url ? margin + 31 : pageW / 2;
  const align = s.logo_url ? 'left' : 'center';
  doc.setTextColor(25,25,25);
  doc.setFont('helvetica','bold');
  doc.setFontSize(14);
  doc.text(s.kop_nama_sekolah || s.nama_sekolah || 'SMAN 7 MAROS', textX, y + 7, {align});
  doc.setFontSize(10.5);
  doc.text(s.kop_subjudul || 'PEMILIHAN KETUA DAN WAKIL KETUA OSIS', textX, y + 14, {align});
  doc.setFont('helvetica','normal');
  doc.setFontSize(8);
  if (s.kop_alamat) doc.text(s.kop_alamat, textX, y + 19, {align, maxWidth: pageW - margin - textX});
  if (s.kop_kontak) doc.text(s.kop_kontak, textX, y + 23, {align, maxWidth: pageW - margin - textX});

  y += 30;
  doc.setLineWidth(0.8);
  doc.line(margin, y, pageW - margin, y);
  doc.setLineWidth(0.25);
  doc.line(margin, y + 1.5, pageW - margin, y + 1.5);
  y += 10;

  // =========================
  // JUDUL DOKUMEN
  // =========================
  doc.setFont('helvetica','bold');
  doc.setFontSize(12.5);
  doc.text('BERITA ACARA & REKAPITULASI HASIL PEMUNGUTAN SUARA', pageW/2, y, {align:'center'});
  y += 6;
  doc.setFontSize(10.5);
  doc.text('PEMILIHAN KETUA & WAKIL KETUA OSIS', pageW/2, y, {align:'center'});
  y += 5;
  doc.setFont('helvetica','normal');
  doc.setFontSize(9);
  doc.text(`Masa Bakti ${periodText(s)}`, pageW/2, y, {align:'center'});
  y += 4.5;
  doc.text('Sistem Digital eOSIS (LUBER JURDIL)', pageW/2, y, {align:'center'});
  y += 4.5;
  doc.setFontSize(7.5);
  doc.text(`Dicetak: ${fmtDate(new Date().toISOString().slice(0,10))}`, pageW/2, y, {align:'center'});
  y += 8;

  const totalDpt = Number(stats.total_siswa || 0);
  const sudah = Number(stats.sudah_memilih || 0);
  const belum = Math.max(totalDpt - sudah, 0);
  const totalSuara = Number(stats.total_suara || 0);
  const partisipasi = totalDpt ? `${(sudah/totalDpt*100).toFixed(1)}%` : '0.0%';

  // =========================
  // 4 KOLOM RINGKASAN
  // =========================
  doc.autoTable({
    startY: y,
    head:[['Total DPT','Total Suara Sah Masuk','Belum Memilih','Tingkat Partisipasi']],
    body:[[String(totalDpt),String(totalSuara),String(belum),partisipasi]],
    margin:{left:margin,right:margin},
    tableWidth:'auto',
    styles:{font:'helvetica',fontSize:8,cellPadding:2.2,halign:'center',valign:'middle'},
    headStyles:{fontStyle:'bold',halign:'center'},
    bodyStyles:{fontStyle:'bold',fontSize:10},
    theme:'grid'
  });
  y = doc.lastAutoTable.finalY + 7;

  // =========================
  // TABEL PASANGAN CALON
  // =========================
  const candidateBody = results.map(r => {
    const n = Number(r.total_suara || 0);
    const pct = totalSuara ? `${(n/totalSuara*100).toFixed(1)}%` : '0.0%';
    return [
      String(r.no_urut),
      `${safeText(r.nama_ketua)} & ${safeText(r.nama_wakil)}`,
      safeText(r.slogan) || '-',
      String(n),
      pct,
      ''
    ];
  });

  doc.setFont('helvetica','bold');
  doc.setFontSize(9);
  doc.text('REKAPITULASI HASIL PASANGAN CALON', margin, y);
  y += 2;
  doc.autoTable({
    startY:y,
    head:[['No. Urut','Pasangan Calon','Slogan Kampanye','Suara Sah','Persentase','Keterangan']],
    body:candidateBody,
    margin:{left:margin,right:margin},
    styles:{font:'helvetica',fontSize:7.5,cellPadding:2,overflow:'linebreak',valign:'middle'},
    headStyles:{fontStyle:'bold',halign:'center'},
    columnStyles:{0:{cellWidth:13,halign:'center'},1:{cellWidth:39},2:{cellWidth:45},3:{cellWidth:18,halign:'center'},4:{cellWidth:22,halign:'center'},5:{cellWidth:29}},
    theme:'grid'
  });
  y = doc.lastAutoTable.finalY + 7;

  // =========================
  // TABEL PARTISIPASI PER KELAS
  // =========================
  doc.setFontSize(9);
  doc.text('REKAPITULASI PARTISIPASI PEMILIH PER KELAS', margin, y);
  y += 2;
  const classRows = (Array.isArray(classes) ? classes : []).map((r, i) => {
    const dpt = Number(r.total_siswa || 0);
    const memilih = Number(r.sudah_memilih || 0);
    const tidak = Math.max(dpt - memilih, 0);
    return [String(i+1), safeText(r.nama_kelas) || '-', String(dpt), String(memilih), String(tidak), dpt ? `${(memilih/dpt*100).toFixed(1)}%` : '0.0%'];
  });
  doc.autoTable({
    startY:y,
    head:[['No','Nama Kelas','Total DPT','Sudah Memilih','Belum Memilih','Partisipasi (%)']],
    body:classRows.length ? classRows : [['-','Belum ada data kelas','0','0','0','0.0%']],
    margin:{left:margin,right:margin},
    styles:{font:'helvetica',fontSize:7.5,cellPadding:2,halign:'center',valign:'middle'},
    headStyles:{fontStyle:'bold',halign:'center'},
    columnStyles:{0:{cellWidth:12},1:{cellWidth:50,halign:'left'},2:{cellWidth:28},3:{cellWidth:32},4:{cellWidth:30},5:{cellWidth:29}},
    theme:'grid'
  });
  y = doc.lastAutoTable.finalY + 8;

  // =========================
  // PENETAPAN
  // =========================
  doc.setFont('helvetica','normal');
  doc.setFontSize(8.5);
  doc.text(`Ditetapkan di : ${safeText(s.ditetapkan_di) || '-'}`, pageW - margin, y, {align:'right'});
  doc.text(`Pada tanggal : ${fmtDate(s.tanggal_ditetapkan)}`, pageW - margin, y + 5, {align:'right'});
  y += 16;

  // =========================
  // TANDA TANGAN
  // =========================
  // Jika tabel membuat konten terlalu panjang, tanda tangan tetap berada
  // di halaman berikutnya agar tidak bertumpuk dengan tabel.
  if (y + 55 > pageH - 12) {
    doc.addPage();
    y = 20;
  }

  doc.setFontSize(8.5);
  doc.setFont('helvetica','normal');
  doc.text('Mengetahui,', pageW/2, y, {align:'center'});
  y += 8;

  const leftX = 47;
  const rightX = pageW - 47;
  const centerX = pageW/2;

  doc.text('Pembina OSIS', leftX, y, {align:'center'});
  doc.text('Ketua Panitia', rightX, y, {align:'center'});

  y += 24;
  doc.setFont('helvetica','bold');
  doc.text(s.pembina_osis_nama || '____________________________', leftX, y, {align:'center', maxWidth:55});
  doc.text(s.ketua_panitia_nama || '____________________________', rightX, y, {align:'center', maxWidth:55});
  doc.setFont('helvetica','normal');
  doc.text(s.pembina_osis_nip ? `NIP. ${s.pembina_osis_nip}` : 'NIP. __________________', leftX, y + 5, {align:'center'});
  doc.text(s.ketua_panitia_nisn ? `NISN. ${s.ketua_panitia_nisn}` : 'NISN. __________________', rightX, y + 5, {align:'center'});

  y += 18;
  doc.text('Kepala Sekolah', centerX, y, {align:'center'});
  y += 24;
  doc.setFont('helvetica','bold');
  doc.text(s.kepala_sekolah_nama || '____________________________', centerX, y, {align:'center', maxWidth:65});
  doc.setFont('helvetica','normal');
  doc.text(s.kepala_sekolah_nip ? `NIP. ${s.kepala_sekolah_nip}` : 'NIP. __________________', centerX, y + 5, {align:'center'});

  doc.setFontSize(6.5);
  doc.text('Dokumen ini dibuat dari data eOSIS dan dapat diverifikasi melalui panel admin.', margin, pageH - 7);
  doc.save(`hasil-pemilihan-eOSIS-${new Date().toISOString().slice(0,10)}.pdf`);
}
