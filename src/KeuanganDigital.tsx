import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  Wallet, TrendingUp, TrendingDown, ClipboardCheck, Plus, Search,
  Download, ShieldCheck, ReceiptText, Clock3, CheckCircle2,
  XCircle, Paperclip, Landmark, ChartNoAxesCombined, Filter
} from "lucide-react";
import { supabase } from "./lib/supabase";
import { useSchoolContext } from "./context/useSchoolContext";
import { logAppActivity } from "./services/activityLogService";
import "./KeuanganDigital.css";

type Transaction = {
  id: string;
  transaction_date: string;
  transaction_type: "pemasukan" | "pengeluaran";
  category: string;
  description: string;
  amount: number;
  status: "draft" | "menunggu" | "disetujui" | "ditolak" | "dibayar";
  reference_number?: string | null;
  evidence_path?: string | null;
  academic_year_id?: string | null;
  created_at?: string;
};

type Budget = {
  id: string;
  fiscal_year: number;
  name: string;
  category: string;
  planned_amount: number;
  realized_amount: number;
  status: string;
  academic_year_id?: string | null;
};

const money = (n: number) => new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", maximumFractionDigits: 0
}).format(Number(n || 0));

const csvCell = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`;

function evidencePath(id: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${id}/${Date.now()}-${safeName}`;
}

export default function KeuanganDigital({ userRole = "" }: { userRole?: string }) {
  const { currentUser, activeAcademicYear } = useSchoolContext();
  const canManageFinance = ["super_admin", "kepala_tata_usaha"].includes(userRole);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("semua");
  const [typeFilter, setTypeFilter] = useState("semua");
  const [showForm, setShowForm] = useState(false);
  const [showBudgetForm, setShowBudgetForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<"transaksi" | "anggaran" | "persetujuan">("transaksi");
  const [form, setForm] = useState({
    transaction_date: new Date().toISOString().slice(0, 10),
    transaction_type: "pengeluaran" as "pemasukan" | "pengeluaran",
    category: "Operasional sekolah",
    description: "",
    amount: "",
    reference_number: ""
  });
  const [budgetForm, setBudgetForm] = useState({
    fiscal_year: String(new Date().getFullYear()),
    name: "",
    category: "Operasional sekolah",
    planned_amount: ""
  });

  async function loadData() {
    setLoading(true); setError("");
    const [tx, bg] = await Promise.all([
      supabase.from("finance_transactions").select("*").order("transaction_date", { ascending: false }),
      supabase.from("finance_budgets").select("*").order("fiscal_year", { ascending: false })
    ]);
    if (tx.error || bg.error) {
      setError(tx.error?.message || bg.error?.message || "Data keuangan belum dapat dimuat.");
    } else {
      setTransactions((tx.data || []) as Transaction[]);
      setBudgets((bg.data || []) as Budget[]);
    }
    setLoading(false);
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void loadData(); }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visible = useMemo(() => transactions.filter(t => {
    const text = `${t.description} ${t.category} ${t.reference_number || ""}`.toLowerCase();
    return text.includes(query.toLowerCase())
      && (statusFilter === "semua" || t.status === statusFilter)
      && (typeFilter === "semua" || t.transaction_type === typeFilter);
  }), [transactions, query, statusFilter, typeFilter]);

  const totalIncome = transactions.filter(t => t.transaction_type === "pemasukan" && ["disetujui", "dibayar"].includes(t.status)).reduce((s,t) => s + Number(t.amount), 0);
  const totalExpense = transactions.filter(t => t.transaction_type === "pengeluaran" && ["disetujui", "dibayar"].includes(t.status)).reduce((s,t) => s + Number(t.amount), 0);
  const pending = transactions.filter(t => t.status === "menunggu").length;
  const planned = budgets.reduce((s,b) => s + Number(b.planned_amount), 0);
  const realized = budgets.reduce((s,b) => s + Number(b.realized_amount), 0);

  async function submitTransaction(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    if (!canManageFinance) { setSaving(false); setError("Role Anda hanya dapat melihat data keuangan."); return; }
    const actorId = currentUser?.id;
    if (!actorId) { setSaving(false); setError("Sesi login tidak aktif. Silakan masuk kembali."); return; }
    const { error: insertError } = await supabase.from("finance_transactions").insert({
      ...form,
      amount: Number(form.amount),
      status: "menunggu",
      created_by: actorId,
      academic_year_id: activeAcademicYear?.id ?? null,
    });
    if (insertError) setError(insertError.message);
    else {
      let auditWarning = "";
      try {
        await logAppActivity({
          actorId,
          actorLabel: currentUser?.full_name || currentUser?.username || "Pengguna",
          action: "Transaksi keuangan diajukan",
          moduleKey: "Keuangan",
          details: `${form.description} · ${form.transaction_type} Rp ${Number(form.amount).toLocaleString("id-ID")}`,
        });
      } catch (auditError) {
        auditWarning = auditError instanceof Error ? auditError.message : String(auditError);
      }
      setShowForm(false);
      setForm({ transaction_date: new Date().toISOString().slice(0,10), transaction_type: "pengeluaran", category: "Operasional sekolah", description: "", amount: "", reference_number: "" });
      await loadData();
      if (auditWarning) setError(`Transaksi tersimpan, tetapi audit gagal: ${auditWarning}`);
    }
    setSaving(false);
  }

  async function submitBudget(e: FormEvent) {
    e.preventDefault(); setSaving(true); setError("");
    if (!canManageFinance) { setSaving(false); setError("Role Anda tidak dapat mengubah anggaran."); return; }
    const actorId = currentUser?.id;
    if (!actorId) { setSaving(false); setError("Sesi login tidak aktif. Silakan masuk kembali."); return; }
    const { error: insertError } = await supabase.from("finance_budgets").insert({
      fiscal_year: Number(budgetForm.fiscal_year), name: budgetForm.name,
      category: budgetForm.category, planned_amount: Number(budgetForm.planned_amount),
      realized_amount: 0, status: "aktif", created_by: actorId,
      academic_year_id: activeAcademicYear?.id ?? null
    });
    if (insertError) setError(insertError.message);
    else {
      let auditWarning = "";
      try {
        await logAppActivity({
          actorId,
          actorLabel: currentUser?.full_name || currentUser?.username || "Pengguna",
          action: "Anggaran dibuat",
          moduleKey: "Keuangan",
          details: `${budgetForm.name} · tahun ${budgetForm.fiscal_year}`,
        });
      } catch (auditError) {
        auditWarning = auditError instanceof Error ? auditError.message : String(auditError);
      }
      setShowBudgetForm(false);
      setBudgetForm({ fiscal_year: String(new Date().getFullYear()), name: "", category: "Operasional sekolah", planned_amount: "" });
      await loadData();
      if (auditWarning) setError(`Anggaran tersimpan, tetapi audit gagal: ${auditWarning}`);
    }
    setSaving(false);
  }

  async function reviewTransaction(id: string, status: "disetujui" | "ditolak") {
    if (!canManageFinance) { setError("Role Anda tidak dapat menyetujui transaksi."); return; }
    setError("");
    const actorId = currentUser?.id;
    if (!actorId) { setError("Sesi login tidak aktif. Silakan masuk kembali."); return; }
    const { data: updatedTransaction, error: updateError } = await supabase.from("finance_transactions").update({
      status, reviewed_by: actorId, reviewed_at: new Date().toISOString()
    }).eq("id", id).eq("status", "menunggu").select("id").maybeSingle();
    if (updateError) {
      setError(updateError.message);
    } else if (!updatedTransaction) {
      setError("Transaksi tidak ditemukan atau sudah diproses oleh pengguna lain.");
    } else {
      try {
        await logAppActivity({
          actorId,
          actorLabel: currentUser?.full_name || currentUser?.username || "Pengguna",
          action: status === "disetujui" ? "Transaksi disetujui" : "Transaksi ditolak",
          moduleKey: "Keuangan",
          details: `Transaksi ${id} ${status}.`,
        });
        await loadData();
      } catch (logError) {
        setError(
          `Keputusan transaksi berhasil disimpan, tetapi audit gagal: ${
            logError instanceof Error ? logError.message : String(logError)
          }`,
        );
        await loadData();
      }
    }
  }

  async function uploadEvidence(id: string, file?: File) {
    if (!file || !canManageFinance) return;
    setError("");
    const path = evidencePath(id, file);
    const { error: uploadError } = await supabase.storage.from("finance-evidence").upload(path, file, { upsert: false });
    if (uploadError) { setError(uploadError.message); return; }
    const { error: updateError } = await supabase.from("finance_transactions").update({ evidence_path: path }).eq("id", id);
    if (updateError) setError(updateError.message); else await loadData();
  }

  function exportCsv() {
    const rows = [
      ["Tanggal", "Jenis", "Kategori", "Uraian", "Nominal", "Status", "No. Referensi"],
      ...visible.map(t => [t.transaction_date, t.transaction_type, t.category, t.description, t.amount, t.status, t.reference_number || ""])
    ];
    const csv = "\uFEFF" + rows.map(r => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a"); a.href = url; a.download = `laporan-keuangan-sman7-maros-${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return <section className="finance-page">
    <header className="finance-hero">
      <div className="finance-hero-icon"><Wallet size={30}/></div>
      <div className="finance-hero-copy">
        <span className="finance-eyebrow">SUPER APP • SMAN 7 MAROS</span>
        <h1>Keuangan Digital</h1>
        <p>Kelola anggaran, transaksi, bukti pembayaran, dan persetujuan dalam satu tempat.</p>
      </div>
      <div className="finance-hero-actions">
        <button className="finance-btn finance-btn-light" onClick={exportCsv}><Download size={16}/> Ekspor CSV</button>
        {canManageFinance && <button className="finance-btn finance-btn-white" onClick={() => setShowForm(true)}><Plus size={17}/> Catat transaksi</button>}
      </div>
    </header>

    {!canManageFinance && <div className="finance-security-note"><ShieldCheck size={18}/><span>Akses baca saja. Pengelolaan transaksi dan anggaran dibatasi untuk Super Admin dan Kepala Tata Usaha.</span></div>}
    <div className="finance-security-note"><ShieldCheck size={18}/><span>Akses data mengikuti autentikasi dan kebijakan RLS Supabase. Jangan bagikan laporan keuangan kepada pihak yang tidak berwenang.</span></div>
    {error && <div className="finance-error" role="alert">{error}</div>}

    <div className="finance-stats">
      <article className="finance-stat stat-income"><div className="finance-stat-top"><span>Total pemasukan disetujui</span><span className="finance-stat-icon"><TrendingUp size={19}/></span></div><strong>{money(totalIncome)}</strong><small>Transaksi berstatus disetujui/dibayar</small></article>
      <article className="finance-stat stat-expense"><div className="finance-stat-top"><span>Total pengeluaran disetujui</span><span className="finance-stat-icon"><TrendingDown size={19}/></span></div><strong>{money(totalExpense)}</strong><small>Transaksi berstatus disetujui/dibayar</small></article>
      <article className="finance-stat stat-pending"><div className="finance-stat-top"><span>Menunggu persetujuan</span><span className="finance-stat-icon"><Clock3 size={19}/></span></div><strong>{pending}</strong><small>Transaksi perlu ditinjau</small></article>
      <article className="finance-stat stat-budget"><div className="finance-stat-top"><span>Realisasi anggaran</span><span className="finance-stat-icon"><ChartNoAxesCombined size={19}/></span></div><strong>{planned ? `${Math.round(realized / planned * 100)}%` : "0%"}</strong><small>{money(realized)} dari {money(planned)}</small></article>
    </div>

    <div className="finance-tabs" role="tablist">
      <button className={activeTab === "transaksi" ? "active" : ""} onClick={() => setActiveTab("transaksi")}><ReceiptText size={16}/> Transaksi</button>
      <button className={activeTab === "anggaran" ? "active" : ""} onClick={() => setActiveTab("anggaran")}><Landmark size={16}/> Anggaran</button>
      {canManageFinance && <button className={activeTab === "persetujuan" ? "active" : ""} onClick={() => setActiveTab("persetujuan")}><ClipboardCheck size={16}/> Persetujuan <span className="finance-tab-count">{pending}</span></button>}
    </div>

    {activeTab === "anggaran" ? <section className="finance-panel">
      <div className="finance-panel-head"><div><h2>Perencanaan anggaran</h2><p>Pantau pagu dan realisasi anggaran per tahun dan kategori.</p></div>{canManageFinance && <button className="finance-btn finance-btn-primary" onClick={() => setShowBudgetForm(true)}><Plus size={16}/> Tambah anggaran</button>}</div>
      {loading ? <p className="finance-muted">Memuat anggaran…</p> : budgets.length === 0 ? <div className="finance-empty"><Landmark size={30}/><strong>Belum ada anggaran</strong><span>Tambahkan rencana anggaran pertama.</span></div> : <div className="finance-budget-grid">{budgets.map(b => {
        const pct = b.planned_amount ? Math.min(100, Math.round(Number(b.realized_amount) / Number(b.planned_amount) * 100)) : 0;
        return <article key={b.id} className="finance-budget-card"><div className="finance-budget-top"><span>{b.fiscal_year}</span><span className="finance-status status-disetujui">{b.status}</span></div><h3>{b.name}</h3><p>{b.category}</p><div className="finance-budget-values"><div><small>Anggaran</small><strong>{money(b.planned_amount)}</strong></div><div><small>Realisasi</small><strong>{money(b.realized_amount)}</strong></div></div><div className="finance-progress"><span style={{width: `${pct}%`}}/></div><small className="finance-muted">{pct}% terealisasi</small></article>;
      })}</div>}
    </section> : <section className="finance-panel">
      <div className="finance-panel-head"><div><h2>{activeTab === "persetujuan" ? "Antrean persetujuan" : "Riwayat transaksi"}</h2><p>{activeTab === "persetujuan" ? "Tinjau transaksi yang menunggu keputusan." : "Cari, saring, dan ekspor catatan transaksi."}</p></div></div>
      <div className="finance-filters"><label className="finance-search"><Search size={17}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari uraian, kategori, referensi…"/></label><label className="finance-select"><Filter size={16}/><select value={typeFilter} onChange={e => setTypeFilter(e.target.value)}><option value="semua">Semua jenis</option><option value="pemasukan">Pemasukan</option><option value="pengeluaran">Pengeluaran</option></select></label><label className="finance-select"><select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="semua">Semua status</option><option value="menunggu">Menunggu</option><option value="disetujui">Disetujui</option><option value="ditolak">Ditolak</option><option value="dibayar">Dibayar</option><option value="draft">Draft</option></select></label></div>
      {loading ? <p className="finance-muted">Memuat transaksi…</p> : visible.filter(t => activeTab !== "persetujuan" || t.status === "menunggu").length === 0 ? <div className="finance-empty"><ReceiptText size={30}/><strong>Tidak ada transaksi</strong><span>Data akan tampil sesuai hak akses dan filter yang dipilih.</span></div> : <div className="finance-table-wrap"><table className="finance-table"><thead><tr><th>Tanggal</th><th>Uraian</th><th>Jenis</th><th>Nominal</th><th>Status</th><th>Bukti</th>{activeTab === "persetujuan" && canManageFinance && <th>Tindakan</th>}</tr></thead><tbody>{visible.filter(t => activeTab !== "persetujuan" || t.status === "menunggu").map(t => <tr key={t.id}><td>{t.transaction_date}</td><td><strong>{t.description}</strong><small>{t.category}{t.reference_number ? ` • ${t.reference_number}` : ""}</small></td><td><span className={`finance-type type-${t.transaction_type}`}>{t.transaction_type}</span></td><td className="finance-amount">{money(t.amount)}</td><td><span className={`finance-status status-${t.status}`}>{t.status}</span></td><td>{canManageFinance ? <label className="finance-upload" title="Unggah bukti transaksi"><Paperclip size={15}/><input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={e => void uploadEvidence(t.id, e.target.files?.[0])}/>{t.evidence_path ? "Ganti bukti" : "Unggah"}</label> : t.evidence_path ? "Tersedia" : "—"}</td>{activeTab === "persetujuan" && canManageFinance && <td><div className="finance-row-actions"><button title="Setujui" onClick={() => void reviewTransaction(t.id, "disetujui")}><CheckCircle2 size={17}/></button><button title="Tolak" onClick={() => void reviewTransaction(t.id, "ditolak")}><XCircle size={17}/></button></div></td>}</tr>)}</tbody></table></div>}
    </section>}

    {showForm && canManageFinance && <div className="finance-modal-backdrop" role="presentation" onMouseDown={e => {if (e.target === e.currentTarget) setShowForm(false);}}>
      <div className="finance-modal" role="dialog" aria-modal="true" aria-labelledby="finance-tx-title">
        <div className="finance-modal-head"><div><span className="finance-eyebrow">PENCATATAN</span><h2 id="finance-tx-title">Transaksi baru</h2></div><button onClick={() => setShowForm(false)} aria-label="Tutup">×</button></div>
        <form onSubmit={e => void submitTransaction(e)} className="finance-form">
          <label>Tanggal<input required type="date" value={form.transaction_date} onChange={e => setForm({...form, transaction_date:e.target.value})}/></label>
          <label>Jenis transaksi<select value={form.transaction_type} onChange={e => setForm({...form, transaction_type:e.target.value as "pemasukan"|"pengeluaran"})}><option value="pengeluaran">Pengeluaran</option><option value="pemasukan">Pemasukan</option></select></label>
          <label>Kategori<select value={form.category} onChange={e => setForm({...form, category:e.target.value})}><option>Operasional sekolah</option><option>Sarana dan prasarana</option><option>Kegiatan siswa</option><option>Laboratorium</option><option>Perpustakaan</option><option>Hibah/Bantuan</option><option>Lainnya</option></select></label>
          <label>Nominal (Rp)<input required min="1" type="number" value={form.amount} onChange={e => setForm({...form, amount:e.target.value})} placeholder="Contoh: 250000"/></label>
          <label className="finance-form-wide">Uraian<input required maxLength={240} value={form.description} onChange={e => setForm({...form, description:e.target.value})} placeholder="Tujuan atau keterangan transaksi"/></label>
          <label className="finance-form-wide">Nomor referensi (opsional)<input value={form.reference_number} onChange={e => setForm({...form, reference_number:e.target.value})} placeholder="Nomor kuitansi / dokumen"/></label>
          <p className="finance-form-hint"><ShieldCheck size={15}/> Transaksi baru masuk antrean persetujuan dan belum dihitung sebagai realisasi disetujui.</p>
          <div className="finance-modal-actions"><button type="button" className="finance-btn finance-btn-quiet" onClick={() => setShowForm(false)}>Batal</button><button disabled={saving} type="submit" className="finance-btn finance-btn-primary">{saving ? "Menyimpan…" : "Kirim untuk persetujuan"}</button></div>
        </form>
      </div>
    </div>}

    {showBudgetForm && canManageFinance && <div className="finance-modal-backdrop" role="presentation" onMouseDown={e => {if (e.target === e.currentTarget) setShowBudgetForm(false);}}>
      <div className="finance-modal" role="dialog" aria-modal="true">
        <div className="finance-modal-head"><div><span className="finance-eyebrow">PERENCANAAN</span><h2>Tambah anggaran</h2></div><button onClick={() => setShowBudgetForm(false)} aria-label="Tutup">×</button></div>
        <form className="finance-form" onSubmit={e => void submitBudget(e)}>
          <label>Tahun anggaran<input required type="number" min="2020" max="2100" value={budgetForm.fiscal_year} onChange={e => setBudgetForm({...budgetForm, fiscal_year:e.target.value})}/></label>
          <label>Kategori<select value={budgetForm.category} onChange={e => setBudgetForm({...budgetForm, category:e.target.value})}><option>Operasional sekolah</option><option>Sarana dan prasarana</option><option>Kegiatan siswa</option><option>Laboratorium</option><option>Perpustakaan</option><option>Lainnya</option></select></label>
          <label className="finance-form-wide">Nama program/kegiatan<input required value={budgetForm.name} onChange={e => setBudgetForm({...budgetForm, name:e.target.value})} placeholder="Contoh: Pemeliharaan fasilitas"/></label>
          <label className="finance-form-wide">Pagu anggaran (Rp)<input required type="number" min="1" value={budgetForm.planned_amount} onChange={e => setBudgetForm({...budgetForm, planned_amount:e.target.value})}/></label>
          <div className="finance-modal-actions finance-form-wide"><button type="button" className="finance-btn finance-btn-quiet" onClick={() => setShowBudgetForm(false)}>Batal</button><button disabled={saving} type="submit" className="finance-btn finance-btn-primary">{saving ? "Menyimpan…" : "Simpan anggaran"}</button></div>
        </form>
      </div>
    </div>}
    <footer className="finance-footer"><ShieldCheck size={15}/> Modul keuangan • Semua perubahan sensitif wajib dibatasi oleh kebijakan database.</footer>
  </section>;
}
