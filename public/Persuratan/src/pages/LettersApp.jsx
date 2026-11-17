import React, { useEffect, useMemo, useState } from 'react'
import {
  LayoutDashboard, FilePlus2, Files, Inbox, Send, Archive, ClipboardCheck,
  Settings, Search, Bell, Menu, X, ChevronRight, Plus, RefreshCw, Eye,
  Download, Printer, Check, RotateCcw, Ban, FileText, CalendarDays, LogOut,
  ShieldCheck, Mail, BookOpen, Users, Activity, Sparkles
} from 'lucide-react'
import { supabase } from '../lib/supabase'

const nav = [
  ['Dashboard', LayoutDashboard, 'dashboard'],
  ['Ajukan Surat', FilePlus2, 'create'],
  ['Pengajuan Surat', Files, 'requests'],
  ['Persetujuan Surat', ClipboardCheck, 'approvals'],
  ['Surat Terbit', Send, 'issued'],
  ['Arsip Digital', Archive, 'archive'],
  ['Surat Masuk', Inbox, 'incoming'],
  ['Surat Keluar', Mail, 'outgoing'],
  ['Disposisi', BookOpen, 'dispositions'],
  ['Format Surat', FileText, 'templates'],
]
const roleLabels = { administrator:'Administrator', guru_staf:'Guru / Staf', kepala_tu:'Kepala Tata Usaha', kepala_sekolah:'Kepala Sekolah' }
const statusLabels = { draft:'Draft', submitted:'Diajukan', in_review:'Dalam Pemeriksaan', revision:'Perlu Revisi', resubmitted:'Diajukan Ulang', approved:'Disetujui', awaiting_number:'Menunggu Nomor', issued:'Diterbitkan', rejected:'Ditolak', archived:'Diarsipkan' }
const demoTemplates = [
  {id:'demo-und',name:'Surat Undangan',description:'Undangan rapat, kegiatan, atau pertemuan',category:{name:'Undangan',code:'UND'},fields_schema:[
    {name:'recipient',label:'Nama penerima',required:true},{name:'event_day',label:'Hari dan tanggal',required:true},{name:'event_time',label:'Waktu kegiatan',required:true},{name:'event_place',label:'Tempat kegiatan',required:true},{name:'agenda',label:'Agenda kegiatan',required:true},{name:'extra',label:'Keterangan tambahan'}
  ]},
  {id:'demo-tgs',name:'Surat Tugas',description:'Penugasan guru atau tenaga kependidikan',category:{name:'Tugas',code:'TGS'},fields_schema:[
    {name:'assigned_name',label:'Nama yang ditugaskan',required:true},{name:'assigned_nip',label:'NIP'},{name:'task',label:'Uraian tugas',required:true},{name:'location',label:'Tempat tugas',required:true},{name:'date_range',label:'Waktu pelaksanaan',required:true}
  ]}
]
export default function LettersApp(){
  const [session,setSession]=useState(null), [role,setRole]=useState(null), [profile,setProfile]=useState(null)
  const [page,setPage]=useState('dashboard'), [mobile,setMobile]=useState(false)
  const [loading,setLoading]=useState(true), [busy,setBusy]=useState(false), [error,setError]=useState('')
  const [requests,setRequests]=useState([]), [templates,setTemplates]=useState([]), [incoming,setIncoming]=useState([])
  const [notifications,setNotifications]=useState([]), [search,setSearch]=useState(''), [toast,setToast]=useState('')
  const [modal,setModal]=useState(null), [form,setForm]=useState({})
  const [email,setEmail]=useState(''), [password,setPassword]=useState('')
  const [selectedTemplate,setSelectedTemplate]=useState('')
  const [requestData,setRequestData]=useState({})
  const [myName,setMyName]=useState('')
  const [myNip,setMyNip]=useState('')
  const [myPosition,setMyPosition]=useState('')
  const isAdmin=['administrator','kepala_tu'].includes(role)
  const canApprove=['administrator','kepala_tu','kepala_sekolah'].includes(role)
  const activeTemplates=templates.length?templates:demoTemplates

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setSession(data.session))
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>setSession(s))
    return ()=>subscription.unsubscribe()
  },[])
  useEffect(()=>{
    if(!session){setLoading(false);setRole(null);return}
    loadAll()
  },[session])
  async function loadAll(){
    setLoading(true);setError('')
    const uid=session.user.id
    const [{data:roleData,error:roleErr},{data:reqData,error:reqErr},{data:tplData},{data:inData},{data:notifData}] = await Promise.all([
      supabase.from('letter_user_roles').select('role').eq('user_id',uid).eq('is_active',true).maybeSingle(),
      supabase.from('letter_requests').select('*, letter_templates(name, category_id)').order('created_at',{ascending:false}),
      supabase.from('letter_templates').select('*, letter_categories(name,code)').eq('is_active',true).order('name'),
      supabase.from('letter_incoming').select('*').order('received_date',{ascending:false}),
      supabase.from('letter_notifications').select('*').order('created_at',{ascending:false}).limit(8)
    ])
    if(roleErr) setError(roleErr.message)
    setRole(roleData?.role||null); setRequests(reqData||[]); setTemplates((tplData||[]).map(t=>({...t,category:t.letter_categories})))
    setIncoming(inData||[]); setNotifications(notifData||[])
    setLoading(false)
  }
  function notify(msg){setToast(msg);setTimeout(()=>setToast(''),3200)}
  async function signIn(e){e.preventDefault();setBusy(true);setError('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setError(error.message);setBusy(false)}
  async function signOut(){await supabase.auth.signOut();setSession(null)}
  async function createRequest(e){
    e.preventDefault();if(!selectedTemplate||!myName.trim()){notify('Lengkapi template dan nama pemohon');return}
    setBusy(true)
    const t=activeTemplates.find(x=>x.id===selectedTemplate)
    if(String(selectedTemplate).startsWith('demo-')){notify('Template contoh belum tersimpan di database. Buat template di menu Format Surat terlebih dahulu.');setBusy(false);return}
    const {data,error}=await supabase.from('letter_requests').insert({
      template_id:selectedTemplate,requester_id:session.user.id,requester_name:myName,
      requester_nip:myNip,requester_position:myPosition,subject:form.subject||t?.name||'Pengajuan surat',
      form_data:requestData,status:'draft'
    }).select().single()
    if(error)notify(error.message);else{notify('Draft pengajuan berhasil dibuat');setPage('requests');await loadAll()}
    setBusy(false)
  }
  async function submitRequest(id){
    setBusy(true);const {error}=await supabase.rpc('letter_submit_request',{p_request_id:id})
    if(error)notify(error.message);else{notify('Pengajuan berhasil dikirim ke Kepala TU');await loadAll()}
    setBusy(false)
  }
  async function review(id,decision){
    const note=window.prompt(decision==='approved'?'Catatan persetujuan (opsional):':'Tuliskan catatan/alasan:')
    if(note===null)return
    setBusy(true);const {error}=await supabase.rpc('letter_review_request',{p_request_id:id,p_decision:decision,p_note:note})
    if(error)notify(error.message);else{notify('Keputusan berhasil disimpan');await loadAll()}
    setBusy(false)
  }
  async function issue(id){
    const signer=window.prompt('Nama pejabat penandatangan:')
    if(!signer)return
    setBusy(true);const {error}=await supabase.rpc('letter_issue_number',{p_request_id:id,p_issue_date:new Date().toISOString().slice(0,10),p_signer_name:signer,p_signer_position:'Kepala Sekolah',p_signer_nip:null})
    if(error)notify(error.message);else{notify('Nomor surat berhasil diterbitkan dan masuk arsip');await loadAll()}
    setBusy(false)
  }
  async function createTemplate(e){
    e.preventDefault();setBusy(true)
    const {error}=await supabase.from('letter_templates').insert({
      name:form.name,description:form.description,category_id:form.category_id||null,
      subject:form.subject||form.name,html_content:form.html_content||'<h2 style="text-align:center">SURAT</h2><p>{{isi_surat}}</p>',
      fields_schema:[],created_by:session.user.id,updated_by:session.user.id
    })
    if(error)notify(error.message);else{notify('Template berhasil dibuat');setModal(null);setForm({});await loadAll()}
    setBusy(false)
  }
  async function createIncoming(e){
    e.preventDefault();setBusy(true)
    const {error}=await supabase.from('letter_incoming').insert({...form,created_by:session.user.id})
    if(error)notify(error.message);else{notify('Surat masuk berhasil dicatat');setModal(null);setForm({});await loadAll()}
    setBusy(false)
  }
  const visibleRequests=useMemo(()=>requests.filter(r=>{
    const q=search.toLowerCase()
    return !q||[r.request_code,r.subject,r.requester_name,r.status].some(v=>String(v||'').toLowerCase().includes(q))
  }),[requests,search])
  const stats=[
    ['Total Pengajuan',requests.length,Files],['Menunggu Pemeriksaan',requests.filter(r=>['submitted','resubmitted','in_review'].includes(r.status)).length,ClipboardCheck],
    ['Diterbitkan',requests.filter(r=>r.status==='issued').length,Send],['Perlu Revisi',requests.filter(r=>r.status==='revision').length,RefreshCw]
  ]
  if(!session) return <div className="login-shell"><div className="login-card"><div className="brand-mark">7</div><span className="eyebrow">SUPER APP · SMAN 7 MAROS</span><h1>Persuratan Digital</h1><p>Masuk untuk mengelola administrasi surat sekolah secara terintegrasi.</p><form onSubmit={signIn}><label>Email akun</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="nama@sekolah.id"/><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="Masukkan password"/>{error&&<div className="error">{error}</div>}<button className="primary full" disabled={busy}>{busy?'Memproses...':'Masuk ke aplikasi'} <ChevronRight size={17}/></button></form><small>Gunakan akun Supabase Auth yang telah diberi role persuratan.</small></div></div>
  return <div className="app-shell">
    <aside className={`sidebar ${mobile?'show':''}`}><div className="brand"><div className="brand-mark small">7</div><div><b>SMAN 7 MAROS</b><small>Persuratan Digital</small></div><button className="icon-btn mobile-close" onClick={()=>setMobile(false)}><X/></button></div>
      <div className="nav-caption">MENU UTAMA</div>{nav.filter(([label])=>{
        if(['Persetujuan Surat','Surat Masuk','Surat Keluar','Disposisi'].includes(label))return canApprove||role==='administrator'
        if(label==='Format Surat')return role==='administrator'||role==='kepala_tu'
        if(label==='Arsip Digital')return true
        return true
      }).map(([label,Icon,key])=><button key={key} className={`nav-item ${page===key?'active':''}`} onClick={()=>{setPage(key);setMobile(false)}}><Icon size={18}/><span>{label}</span>{page===key&&<span className="nav-dot"/>}</button>)}
      <div className="sidebar-bottom"><div className="user-mini"><div className="avatar">{(session.user.email||'U')[0].toUpperCase()}</div><div><b>{session.user.email}</b><small>{roleLabels[role]||'Role belum diatur'}</small></div></div><button className="nav-item" onClick={signOut}><LogOut size={18}/>Keluar</button></div>
    </aside>
    {mobile&&<div className="scrim" onClick={()=>setMobile(false)}/>}
    <main className="main-area"><header className="topbar"><button className="icon-btn mobile-menu" onClick={()=>setMobile(true)}><Menu/></button><div><span className="eyebrow">ADMINISTRASI SEKOLAH</span><h2>{nav.find(n=>n[2]===page)?.[0]||'Persuratan Digital'}</h2></div><div className="top-actions"><button className="icon-btn notification" onClick={()=>setModal({type:'notifications'})}><Bell size={19}/>{notifications.some(n=>!n.is_read)&&<i/>}</button><div className="top-user"><div className="avatar">{(session.user.email||'U')[0].toUpperCase()}</div><span>{roleLabels[role]||'Pengguna'}</span></div></div></header>
      <section className="content" key={page}>
        {loading?<div className="loading-grid"><div/><div/><div/><div/></div>:!role?<div className="empty-state"><ShieldCheck size={38}/><h3>Role belum dikonfigurasi</h3><p>Akun berhasil masuk, tetapi belum memiliki role pada <code>letter_user_roles</code>. Hubungi administrator.</p></div>:<>
        {page==='dashboard'&&<><div className="welcome"><div><span className="eyebrow light">RINGKASAN PERSURATAN</span><h1>Selamat datang kembali.</h1><p>Pantau proses administrasi surat SMAN 7 Maros dari satu tempat.</p></div><div className="welcome-icon"><Sparkles size={38}/></div></div><div className="stat-grid">{stats.map(([label,value,Icon],i)=><div className="stat-card" style={{'--delay':`${i*70}ms`}} key={label}><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={19}/></div></div><strong>{value}</strong><small>Data persuratan saat ini</small></div>)}</div><div className="panel"><div className="panel-head"><div><h3>Pengajuan terbaru</h3><p>Aktivitas surat yang baru masuk ke sistem</p></div><button className="text-btn" onClick={()=>setPage('requests')}>Lihat semua <ChevronRight size={16}/></button></div><RequestTable rows={requests.slice(0,5)} onSubmit={submitRequest} onReview={review} onIssue={issue} role={role}/></div></>}
        {page==='create'&&<div className="panel form-panel"><div className="panel-head"><div><h3>Buat pengajuan surat</h3><p>Pilih format dan lengkapi informasi yang dibutuhkan.</p></div><FilePlus2 className="panel-symbol"/></div><form onSubmit={createRequest} className="form-grid"><label className="span-2">Format surat<select value={selectedTemplate} onChange={e=>setSelectedTemplate(e.target.value)} required><option value="">Pilih format surat</option>{activeTemplates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Nama pemohon<input value={myName} onChange={e=>setMyName(e.target.value)} required placeholder="Nama lengkap"/></label><label>NIP<input value={myNip} onChange={e=>setMyNip(e.target.value)} placeholder="NIP (opsional)"/></label><label className="span-2">Jabatan<input value={myPosition} onChange={e=>setMyPosition(e.target.value)} placeholder="Guru / Staf / Jabatan"/></label><label className="span-2">Perihal<input value={form.subject||''} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="Perihal surat" required/></label>{(activeTemplates.find(t=>t.id===selectedTemplate)?.fields_schema||[]).map(f=><label key={f.name}>{f.label}{f.required?' *':''}<input required={!!f.required} value={requestData[f.name]||''} onChange={e=>setRequestData({...requestData,[f.name]:e.target.value})}/></label>)}<div className="span-2 form-actions"><button type="button" className="secondary" onClick={()=>{setPage('requests');notify('Isi formulir dapat dilanjutkan nanti jika disimpan sebagai draft.')}}>Batal</button><button className="primary" disabled={busy}>Simpan draft <ChevronRight size={17}/></button></div></form></div>}
        {page==='requests'&&<DataPanel title="Daftar pengajuan surat" subtitle="Pantau status dan riwayat pengajuan surat." search={search} setSearch={setSearch} action={()=>setPage('create')} actionLabel="Ajukan surat"><RequestTable rows={visibleRequests} onSubmit={submitRequest} onReview={review} onIssue={issue} role={role}/></DataPanel>}
        {page==='approvals'&&<DataPanel title="Pemeriksaan dan persetujuan" subtitle="Tinjau pengajuan yang menunggu keputusan administratif." search={search} setSearch={setSearch}><RequestTable rows={visibleRequests.filter(r=>['submitted','resubmitted','in_review','approved'].includes(r.status))} onSubmit={submitRequest} onReview={review} onIssue={issue} role={role}/></DataPanel>}
        {page==='issued'&&<DataPanel title="Surat terbit" subtitle="Dokumen yang telah memperoleh nomor surat." search={search} setSearch={setSearch}><RequestTable rows={visibleRequests.filter(r=>r.status==='issued')} onSubmit={submitRequest} onReview={review} onIssue={issue} role={role}/></DataPanel>}
        {page==='archive'&&<DataPanel title="Arsip digital" subtitle="Arsip surat terbit dan dokumen administrasi." search={search} setSearch={setSearch}><RequestTable rows={visibleRequests.filter(r=>['issued','archived'].includes(r.status))} onSubmit={submitRequest} onReview={review} onIssue={issue} role={role}/></DataPanel>}
        {page==='templates'&&<div className="panel"><div className="panel-head"><div><h3>Manajemen format surat</h3><p>Kelola format dinamis yang dapat digunakan berulang kali.</p></div><button className="primary" onClick={()=>{setForm({});setModal({type:'template'})}}><Plus size={17}/> Template baru</button></div><div className="template-grid">{activeTemplates.map(t=><div className="template-card" key={t.id}><div className="template-icon"><FileText/></div><h4>{t.name}</h4><p>{t.description||'Format surat sekolah'}</p><span className="soft-tag">{t.category?.name||'Umum'}</span></div>)}</div></div>}
        {page==='incoming'&&<DataPanel title="Surat masuk" subtitle="Catat surat yang diterima sekolah." search={search} setSearch={setSearch} action={()=>{setForm({});setModal({type:'incoming'})}} actionLabel="Catat surat masuk"><div className="simple-list">{incoming.filter(x=>!search||`${x.external_number} ${x.sender} ${x.subject}`.toLowerCase().includes(search.toLowerCase())).map(x=><div className="simple-row" key={x.id}><div className="template-icon"><Inbox/></div><div className="grow"><b>{x.subject}</b><small>{x.external_number} · {x.sender} · {x.received_date}</small></div><span className="soft-tag">{x.follow_up_status}</span></div>)}</div></DataPanel>}
        {page==='outgoing'&&<div className="empty-state"><Mail size={36}/><h3>Surat keluar</h3><p>Surat yang diterbitkan melalui alur pengajuan otomatis tercatat pada Surat Terbit dan Arsip. Pencatatan surat keluar eksternal tersedia pada pengembangan berikutnya.</p></div>}
        {page==='dispositions'&&<div className="empty-state"><BookOpen size={36}/><h3>Disposisi surat</h3><p>Struktur data disposisi telah disiapkan. Antarmuka penugasan dan tindak lanjut perlu diaktifkan pada tahap integrasi lanjutan.</p></div>}
        </>}
      </section>
    </main>
    {toast&&<div className="toast"><Check size={17}/>{toast}</div>}
    {modal?.type==='template'&&<Modal title="Tambah template surat" close={()=>setModal(null)}><form className="modal-form" onSubmit={createTemplate}><label>Nama template<input required value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Deskripsi<input value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>HTML template<textarea rows="7" value={form.html_content||''} onChange={e=>setForm({...form,html_content:e.target.value})} placeholder="<h2>SURAT</h2><p>{{isi_surat}}</p>"/></label><p className="hint">Variabel dapat ditulis sebagai <code>{'{{nama_variabel}}'}</code>. Untuk template dinamis yang lebih lengkap, atur skema field pada database.</p><button className="primary" disabled={busy}>Simpan template</button></form></Modal>}
    {modal?.type==='incoming'&&<Modal title="Catat surat masuk" close={()=>setModal(null)}><form className="modal-form" onSubmit={createIncoming}><label>Nomor surat<input required value={form.external_number||''} onChange={e=>setForm({...form,external_number:e.target.value})}/></label><label>Asal surat<input required value={form.sender||''} onChange={e=>setForm({...form,sender:e.target.value})}/></label><label>Perihal<input required value={form.subject||''} onChange={e=>setForm({...form,subject:e.target.value})}/></label><label>Tanggal surat<input type="date" value={form.letter_date||''} onChange={e=>setForm({...form,letter_date:e.target.value})}/></label><label>Ringkasan<textarea rows="3" value={form.summary||''} onChange={e=>setForm({...form,summary:e.target.value})}/></label><button className="primary" disabled={busy}>Simpan surat masuk</button></form></Modal>}
    {modal?.type==='notifications'&&<Modal title="Notifikasi" close={()=>setModal(null)}><div className="notification-list">{notifications.length?notifications.map(n=><div className="notification-row" key={n.id}><Bell size={17}/><div><b>{n.title}</b><p>{n.body}</p><small>{new Date(n.created_at).toLocaleString('id-ID')}</small></div></div>):<p className="muted">Belum ada notifikasi.</p>}</div></Modal>}
  </div>
}
function DataPanel({title,subtitle,search,setSearch,action,actionLabel,children}){return <div className="panel"><div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div>{action&&<button className="primary" onClick={action}><Plus size={17}/>{actionLabel}</button>}</div><div className="toolbar"><div className="search-box"><Search size={17}/><input placeholder="Cari nomor, perihal, atau pemohon..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div>{children}</div>}
function RequestTable({rows,onSubmit,onReview,onIssue,role}){
 if(!rows.length)return <div className="table-empty"><Files size={25}/><b>Belum ada data pengajuan</b><span>Data akan muncul setelah pengguna membuat pengajuan surat.</span></div>
 return <div className="table-wrap"><table><thead><tr><th>Pengajuan</th><th>Pemohon</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><b>{r.subject}</b><small>{r.request_code}</small></td><td>{r.requester_name}<small>{r.requester_position||'—'}</small></td><td>{new Date(r.created_at).toLocaleDateString('id-ID')}</td><td><span className={`status status-${r.status}`}>{statusLabels[r.status]||r.status}</span></td><td><div className="row-actions">{['draft','revision'].includes(r.status)&&r.requester_id&&<button title="Kirim pengajuan" onClick={()=>onSubmit(r.id)}><Send size={16}/></button>}{['submitted','resubmitted','in_review'].includes(r.status)&&['kepala_tu','administrator'].includes(role)&&<><button title="Setujui" onClick={()=>onReview(r.id,'approved')}><Check size={16}/></button><button title="Revisi" onClick={()=>onReview(r.id,'revision')}><RotateCcw size={16}/></button><button title="Tolak" onClick={()=>onReview(r.id,'rejected')}><Ban size={16}/></button></>}{r.status==='approved'&&['kepala_tu','administrator'].includes(role)&&<button className="issue-action" onClick={()=>onIssue(r.id)}>Terbitkan nomor</button>}</div></td></tr>)}</tbody></table></div>
}
function Modal({title,close,children}){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="modal-card"><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={close}><X size={18}/></button></div>{children}</div></div>}
