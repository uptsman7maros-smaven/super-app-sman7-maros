import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from './lib/supabase';
import { logAppActivity } from './services/activityLogService';
import './LaporanAnalitik.css';
import './LaporanPermissions.css';

type Announcement = { id: string; title: string; body: string; audience: string; published_at: string; is_published: boolean; created_by?: string };
type Agenda = { id: string; title: string; description: string | null; starts_at: string; ends_at: string | null; location: string | null; audience: string; status: string };
type Notice = { id: string; title: string; body: string; target_group: string; category: string; created_at: string; is_read?: boolean };
type DocumentItem = { id: string; title: string; description: string | null; category: string; url: string; audience: string; created_at: string };
type CrossModuleMetric = { label: string; value: number | null; description: string; color: string; icon: string };
type Tab = 'ringkasan' | 'pengumuman' | 'agenda' | 'notifikasi' | 'dokumen';
const groups = ['Semua pengguna', 'Guru', 'Siswa', 'Tenaga Kependidikan', 'Operator', 'Kepala Sekolah'];
const categories = ['Umum', 'Persetujuan', 'Tugas', 'Surat', 'Akademik', 'Kegiatan'];
const fmt = (v?: string | null) => v ? new Date(v).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

export default function LaporanAnalitik({ userRole = "" }: { userRole?: string }) {
  const canManage = ["super_admin", "operator"].includes(userRole);
  const [tab, setTab] = useState<Tab>('ringkasan');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [agenda, setAgenda] = useState<Agenda[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [crossModuleMetrics, setCrossModuleMetrics] = useState<CrossModuleMetric[]>([]);
  const [metricsError, setMetricsError] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({ audience: 'Semua pengguna', target_group: 'Semua pengguna', category: 'Umum' });

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [a, g, n, d] = await Promise.all([
        supabase.from('school_announcements').select('*').order('published_at', { ascending: false }).limit(100),
        supabase.from('school_agenda').select('*').order('starts_at', { ascending: true }).limit(100),
        supabase.from('school_notifications').select('*').order('created_at', { ascending: false }).limit(100),
        supabase.from('school_documents').select('*').order('created_at', { ascending: false }).limit(100),
      ]);
      const failures = [a.error, g.error, n.error, d.error].filter(Boolean);
      if (failures.length) {
        setError(`Sebagian data belum dapat dimuat. Pastikan tabel tersedia dan izin akses sesuai. Detail: ${failures[0]!.message}`);
      }
      if (!a.error) setAnnouncements(a.data ?? []);
      if (!g.error) setAgenda(g.data ?? []);
      if (!n.error) setNotices(n.data ?? []);
      if (!d.error) setDocuments(d.data ?? []);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Data laporan gagal dimuat.');
    } finally {
      setLoading(false);
    }
  }, []);
  const loadCrossModuleMetrics = useCallback(async () => {
    type CountQuery = PromiseLike<{ count: number | null; error: { message: string } | null }>;
    const queries: Array<{
      label: string;
      description: string;
      color: string;
      icon: string;
      query: CountQuery;
    }> = [];
    const todayParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Makassar',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());
    const year = todayParts.find(part => part.type === 'year')?.value;
    const month = todayParts.find(part => part.type === 'month')?.value;
    const day = todayParts.find(part => part.type === 'day')?.value;
    const attendanceDate = year && month && day ? `${year}-${month}-${day}` : null;
    const canViewAttendance = ['super_admin', 'operator', 'kepala_sekolah'].includes(userRole);
    const canViewBK = ['super_admin', 'operator', 'guru_bk'].includes(userRole);
    const canViewLetters = ['super_admin', 'operator', 'kepala_sekolah', 'kepala_tata_usaha'].includes(userRole);
    const canViewFinance = ['super_admin', 'kepala_sekolah', 'kepala_tata_usaha'].includes(userRole);
    const canViewInventory = ['super_admin', 'operator', 'kepala_sekolah', 'kepala_tata_usaha'].includes(userRole);

    if (canViewAttendance && attendanceDate) {
      queries.push({
        label: 'Kehadiran hari ini',
        description: 'Catatan kehadiran lintas sekolah',
        color: 'green',
        icon: '✓',
        query: supabase.from('attendance_records').select('id', { count: 'exact', head: true }).eq('attendance_date', attendanceDate),
      });
    }
    if (canViewBK) {
      queries.push(
        {
          label: 'Peringatan BK belum dibaca',
          description: 'Peringatan absensi yang perlu ditinjau',
          color: 'pink',
          icon: '🔔',
          query: supabase.from('attendance_bk_alerts').select('id', { count: 'exact', head: true }).eq('is_read', false),
        },
        {
          label: 'Kasus BK aktif',
          description: 'Kasus selain status selesai',
          color: 'purple',
          icon: '♡',
          query: supabase.from('kb_catatan_bk').select('id', { count: 'exact', head: true }).neq('status_kasus', 'Selesai'),
        },
        {
          label: 'Total prestasi',
          description: 'Data prestasi siswa tercatat',
          color: 'blue',
          icon: '★',
          query: supabase.from('kb_prestasi').select('id', { count: 'exact', head: true }),
        },
      );
    }
    if (canViewLetters) {
      queries.push({
        label: 'Surat perlu diproses',
        description: 'Pengajuan menunggu pemeriksaan',
        color: 'blue',
        icon: '✉',
        query: supabase.from('letter_requests').select('id', { count: 'exact', head: true }).in('status', ['submitted', 'resubmitted', 'in_review']),
      });
    }
    if (canViewFinance) {
      queries.push({
        label: 'Transaksi menunggu',
        description: 'Antrean persetujuan keuangan',
        color: 'green',
        icon: 'Rp',
        query: supabase.from('finance_transactions').select('id', { count: 'exact', head: true }).eq('status', 'menunggu'),
      });
    }
    if (canViewInventory) {
      queries.push({
        label: 'Laporan inventaris terbuka',
        description: 'Masalah aset belum selesai',
        color: 'pink',
        icon: '!',
        query: supabase.from('inv_issues').select('id', { count: 'exact', head: true }).neq('status', 'Selesai'),
      });
    }

    const results = await Promise.all(queries.map(async metric => ({
      metric,
      result: await metric.query,
    })));
    const nextMetrics = results.map(({ metric, result }) => ({
      label: metric.label,
      value: result.count,
      description: metric.description,
      color: metric.color,
      icon: metric.icon,
    }));
    const failures = results.filter(({ result }) => result.error).map(({ metric, result }) =>
      `${metric.label}: ${result.error?.message ?? 'gagal dimuat'}`,
    );
    setCrossModuleMetrics(nextMetrics);
    setMetricsError(failures.length ? `Sebagian metrik lintas modul gagal dimuat. ${failures.join(' · ')}` : '');
    if (failures.length) console.error('Metrik analitik lintas modul gagal dimuat:', failures);
  }, [userRole]);

  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      void loadCrossModuleMetrics().catch(error => {
        if (!active) return;
        const message = error instanceof Error ? error.message : 'Metrik lintas modul gagal dimuat.';
        setMetricsError(message);
        console.error('Metrik analitik lintas modul gagal dimuat:', error);
      });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [loadCrossModuleMetrics]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const filteredAnnouncements = useMemo(() => announcements.filter(x => `${x.title} ${x.body} ${x.audience}`.toLowerCase().includes(search.toLowerCase())), [announcements, search]);
  const filteredAgenda = useMemo(() => agenda.filter(x => `${x.title} ${x.description ?? ''} ${x.location ?? ''}`.toLowerCase().includes(search.toLowerCase())), [agenda, search]);
  const filteredDocuments = useMemo(() => documents.filter(x => `${x.title} ${x.description ?? ''} ${x.category}`.toLowerCase().includes(search.toLowerCase())), [documents, search]);
  const resetForm = () => { setForm({ audience: 'Semua pengguna', target_group: 'Semua pengguna', category: 'Umum' }); setShowForm(false); };
  async function auditInformation(action: string, moduleKey: string, details: string) {
    try {
      await logAppActivity({ action, moduleKey, details });
      return '';
    } catch (auditError) {
      return `Data tersimpan, tetapi audit aktivitas gagal: ${auditError instanceof Error ? auditError.message : String(auditError)}`;
    }
  }
  const save = async () => {
    if (!canManage) { setError('Role Anda hanya dapat melihat informasi sekolah.'); return; }
    setError(''); setMessage('');
    try {
      let result: { error: { message: string } | null };
      if (tab === 'pengumuman') {
        if (!form.title?.trim() || !form.body?.trim()) return setError('Judul dan isi pengumuman wajib diisi.');
        result = await supabase.from('school_announcements').insert({ title: form.title.trim(), body: form.body.trim(), audience: form.audience || 'Semua pengguna', is_published: true, published_at: new Date().toISOString() });
      } else if (tab === 'agenda') {
        if (!form.title?.trim() || !form.starts_at) return setError('Judul dan waktu mulai wajib diisi.');
        result = await supabase.from('school_agenda').insert({ title: form.title.trim(), description: form.description || null, starts_at: new Date(form.starts_at).toISOString(), ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null, location: form.location || null, audience: form.audience || 'Semua pengguna', status: 'terjadwal' });
      } else if (tab === 'dokumen') {
        if (!form.title?.trim() || !form.url?.trim()) return setError('Nama dokumen dan tautan wajib diisi.');
        result = await supabase.from('school_documents').insert({ title: form.title.trim(), description: form.description || null, category: form.category || 'Umum', url: form.url.trim(), audience: form.audience || 'Semua pengguna' });
      } else {
        if (!form.title?.trim() || !form.body?.trim()) return setError('Judul dan isi notifikasi wajib diisi.');
        result = await supabase.from('school_notifications').insert({ title: form.title.trim(), body: form.body.trim(), target_group: form.target_group || 'Semua pengguna', category: form.category || 'Umum' });
      }
      if (result.error) return setError(result.error.message);
      const auditWarning = await auditInformation(
        tab === 'pengumuman' ? 'Pengumuman dibuat' : tab === 'agenda' ? 'Agenda dibuat' : tab === 'dokumen' ? 'Dokumen ditambahkan' : 'Notifikasi dibuat',
        'Laporan & Analitik',
        form.title.trim(),
      );
      setMessage(auditWarning || 'Data berhasil disimpan.'); resetForm(); await load();
      if (auditWarning) setError(auditWarning);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Data gagal disimpan.');
    }
  };
  const remove = async (table: string, id: string) => {
    if (!canManage) { setError('Role Anda tidak dapat menghapus informasi sekolah.'); return; }
    if (!window.confirm('Hapus data ini? Tindakan ini tidak dapat dibatalkan.')) return;
    try {
      const { error: e } = await supabase.from(table).delete().eq('id', id);
      if (e) throw e;
      const auditWarning = await auditInformation('Informasi sekolah dihapus', 'Laporan & Analitik', `${table} · ${id}`);
      setMessage(auditWarning || 'Data berhasil dihapus.'); await load();
      if (auditWarning) setError(auditWarning);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Data gagal dihapus.');
    }
  };
  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'ringkasan', label: 'Ringkasan', icon: '✦' }, { id: 'pengumuman', label: 'Pengumuman', icon: '📣' },
    { id: 'agenda', label: 'Kalender & Agenda', icon: '🗓️' }, { id: 'notifikasi', label: 'Notifikasi', icon: '🔔' }, { id: 'dokumen', label: 'Pusat Dokumen', icon: '📁' },
  ];
  const startCreate = (t: Tab) => { if (!canManage) return; setTab(t); setForm({ audience: 'Semua pengguna', target_group: 'Semua pengguna', category: 'Umum' }); setShowForm(true); setError(''); setMessage(''); };

  return <main className={`la-page${canManage ? '' : ' la-read-only'}`}>
    {!canManage && <div className="la-alert la-read-only-notice">Mode baca saja. Pengelolaan informasi tersedia untuk Super Admin dan Operator.</div>}
    <section className="la-hero"><div className="la-orb la-orb-one"/><div className="la-orb la-orb-two"/><div className="la-hero-content"><span className="la-eyebrow">SUPER APP · SMAN 7 MAROS</span><h1>Laporan & Analitik</h1><p>Pusat informasi sekolah, agenda, notifikasi, dan dokumen dalam satu tempat.</p><div className="la-hero-actions"><button className="la-btn la-btn-light" onClick={() => { void load(); void loadCrossModuleMetrics(); }}>↻ Muat ulang</button><span className="la-live"><i/> Data terhubung ke Supabase</span></div></div><div className="la-hero-art"><div className="la-art-card"><span>📊</span><strong>Informasi sekolah</strong><small>Terorganisasi & terpusat</small><div className="la-mini-bars"><i/><i/><i/><i/><i/></div></div></div></section>
    <nav className="la-tabs">{tabs.map(t => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); setShowForm(false); setSearch(''); }}>{t.icon} <span>{t.label}</span></button>)}</nav>
    {error && <div className="la-alert error">⚠️ {error}</div>}{metricsError && <div className="la-alert error">⚠️ {metricsError}</div>}{message && <div className="la-alert success">✓ {message}</div>}
    {tab === 'ringkasan' && <><section className="la-stats"><article className="la-stat purple"><span>📣</span><small>Pengumuman</small><strong>{announcements.length}</strong><em>informasi sekolah</em></article><article className="la-stat blue"><span>🗓️</span><small>Agenda mendatang</small><strong>{agenda.filter(x => new Date(x.starts_at) >= new Date()).length}</strong><em>kegiatan terjadwal</em></article><article className="la-stat pink"><span>🔔</span><small>Notifikasi</small><strong>{notices.length}</strong><em>pemberitahuan tercatat</em></article><article className="la-stat green"><span>📁</span><small>Pusat dokumen</small><strong>{documents.length}</strong><em>tautan dan dokumen</em></article>{crossModuleMetrics.map(metric => <article className={`la-stat ${metric.color}`} key={metric.label}><span>{metric.icon}</span><small>{metric.label}</small><strong>{metric.value === null ? '—' : metric.value.toLocaleString('id-ID')}</strong><em>{metric.description}</em></article>)}</section><section className="la-two-col"><div className="la-panel"><div className="la-panel-head"><div><h2>Pengumuman terbaru</h2><p>Informasi resmi sekolah</p></div><button className="la-link" onClick={() => setTab('pengumuman')}>Lihat semua →</button></div>{announcements.filter(x => x.is_published).slice(0, 4).map(x => <div className="la-list-item" key={x.id}><span className="la-list-icon">📣</span><div><strong>{x.title}</strong><p>{x.body}</p><small>{fmt(x.published_at)} · {x.audience}</small></div></div>)}{!announcements.length && <div className="la-empty">Belum ada pengumuman. Tambahkan informasi resmi pertama.</div>}</div><div className="la-panel"><div className="la-panel-head"><div><h2>Agenda berikutnya</h2><p>Kalender kegiatan sekolah</p></div><button className="la-link" onClick={() => setTab('agenda')}>Lihat semua →</button></div>{agenda.filter(x => new Date(x.starts_at) >= new Date()).slice(0, 4).map(x => <div className="la-agenda-item" key={x.id}><div className="la-date-chip"><b>{new Date(x.starts_at).toLocaleDateString('id-ID',{day:'2-digit'})}</b><small>{new Date(x.starts_at).toLocaleDateString('id-ID',{month:'short'})}</small></div><div><strong>{x.title}</strong><p>{fmt(x.starts_at)}{x.location ? ` · ${x.location}` : ''}</p></div></div>)}{!agenda.length && <div className="la-empty">Belum ada agenda yang dijadwalkan.</div>}</div></section><section className="la-panel la-quick-panel"><div className="la-panel-head"><div><h2>Akses cepat</h2><p>Tambahkan informasi baru dengan cepat</p></div></div><div className="la-quick-grid"><button onClick={() => startCreate('pengumuman')}>📣<strong>Buat pengumuman</strong><small>Informasi resmi</small></button><button onClick={() => startCreate('agenda')}>🗓️<strong>Tambah agenda</strong><small>Kegiatan sekolah</small></button><button onClick={() => startCreate('notifikasi')}>🔔<strong>Kirim notifikasi</strong><small>Kelompok pengguna</small></button><button onClick={() => startCreate('dokumen')}>📁<strong>Tambah dokumen</strong><small>Tautan layanan</small></button></div></section></>}
    {tab !== 'ringkasan' && <section className="la-panel la-content-panel"><div className="la-panel-head"><div><h2>{tabs.find(t => t.id === tab)?.label}</h2><p>Kelola informasi dan layanan sekolah</p></div>{!showForm && <button className="la-btn la-btn-primary" onClick={() => startCreate(tab)}>＋ Tambah baru</button>}</div>
      {!showForm && <input className="la-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari berdasarkan judul, keterangan, atau kategori…"/>}
      {showForm && canManage && <div className="la-form"><div className="la-form-grid"><label>Judul / nama *<input value={form.title ?? ''} onChange={e => setForm({...form,title:e.target.value})} placeholder="Masukkan judul"/></label>{tab === 'agenda' && <label>Waktu mulai *<input type="datetime-local" value={form.starts_at ?? ''} onChange={e => setForm({...form,starts_at:e.target.value})}/></label>}{tab === 'agenda' && <label>Waktu selesai<input type="datetime-local" value={form.ends_at ?? ''} onChange={e => setForm({...form,ends_at:e.target.value})}/></label>}{tab === 'agenda' && <label>Lokasi<input value={form.location ?? ''} onChange={e => setForm({...form,location:e.target.value})} placeholder="Lokasi kegiatan"/></label>}{tab === 'dokumen' && <label>Tautan URL *<input type="url" value={form.url ?? ''} onChange={e => setForm({...form,url:e.target.value})} placeholder="https://…"/></label>}{(tab === 'dokumen' || tab === 'notifikasi') && <label>Kategori<select value={form.category ?? 'Umum'} onChange={e => setForm({...form,category:e.target.value})}>{categories.map(c => <option key={c}>{c}</option>)}</select></label>}<label>{tab === 'notifikasi' ? 'Kirim kepada' : 'Ditampilkan kepada'}<select value={tab === 'notifikasi' ? form.target_group ?? 'Semua pengguna' : form.audience ?? 'Semua pengguna'} onChange={e => setForm({...form,[tab === 'notifikasi' ? 'target_group' : 'audience']:e.target.value})}>{groups.map(g => <option key={g}>{g}</option>)}</select></label>{(tab === 'pengumuman' || tab === 'notifikasi' || tab === 'agenda' || tab === 'dokumen') && tab !== 'dokumen' && <label className="la-full">Isi / keterangan *<textarea rows={4} value={form.body ?? form.description ?? ''} onChange={e => setForm({...form,[tab === 'agenda' ? 'description' : 'body']:e.target.value})} placeholder="Tulis informasi selengkapnya…"/></label>}{tab === 'dokumen' && <label className="la-full">Deskripsi<textarea rows={3} value={form.description ?? ''} onChange={e => setForm({...form,description:e.target.value})}/></label>}</div><div className="la-form-actions"><button className="la-btn la-btn-muted" onClick={resetForm}>Batal</button><button className="la-btn la-btn-primary" onClick={() => void save()}>Simpan data</button></div></div>}
      {loading ? <div className="la-empty">Memuat data…</div> : <div className="la-records">
        {tab === 'pengumuman' && filteredAnnouncements.map(x => <article className="la-record" key={x.id}><span className="la-record-icon purple">📣</span><div className="la-record-main"><h3>{x.title}</h3><p>{x.body}</p><small>{fmt(x.published_at)} · {x.audience} · {x.is_published ? 'Dipublikasikan' : 'Draf'}</small></div><button className="la-delete" onClick={() => void remove('school_announcements',x.id)} title="Hapus">🗑</button></article>)}
        {tab === 'agenda' && filteredAgenda.map(x => <article className="la-record" key={x.id}><span className="la-record-icon blue">🗓️</span><div className="la-record-main"><h3>{x.title}</h3><p>{x.description || 'Tidak ada keterangan.'}</p><small>{fmt(x.starts_at)}{x.location ? ` · ${x.location}` : ''} · {x.audience}</small></div><button className="la-delete" onClick={() => void remove('school_agenda',x.id)} title="Hapus">🗑</button></article>)}
        {tab === 'notifikasi' && notices.filter(x => `${x.title} ${x.body} ${x.target_group} ${x.category}`.toLowerCase().includes(search.toLowerCase())).map(x => <article className="la-record" key={x.id}><span className="la-record-icon pink">🔔</span><div className="la-record-main"><h3>{x.title}</h3><p>{x.body}</p><small>{fmt(x.created_at)} · Untuk: {x.target_group} · {x.category}</small></div><button className="la-delete" onClick={() => void remove('school_notifications',x.id)} title="Hapus">🗑</button></article>)}
        {tab === 'dokumen' && filteredDocuments.map(x => <article className="la-record" key={x.id}><span className="la-record-icon green">📁</span><div className="la-record-main"><h3>{x.title}</h3><p>{x.description || x.category}</p><small>{x.category} · {x.audience}</small><a className="la-doc-link" href={x.url} target="_blank" rel="noreferrer">Buka tautan ↗</a></div><button className="la-delete" onClick={() => void remove('school_documents',x.id)} title="Hapus">🗑</button></article>)}
        {((tab === 'pengumuman' && !filteredAnnouncements.length) || (tab === 'agenda' && !filteredAgenda.length) || (tab === 'notifikasi' && !notices.filter(x => `${x.title} ${x.body} ${x.target_group} ${x.category}`.toLowerCase().includes(search.toLowerCase())).length) || (tab === 'dokumen' && !filteredDocuments.length)) && <div className="la-empty">Tidak ada data yang cocok. Gunakan tombol Tambah baru untuk memulai.</div>}
      </div>}
    </section>}
    <footer className="la-footer">Super App SMAN 7 Maros <span>•</span> Pusat informasi dan layanan sekolah</footer>
  </main>;
}
