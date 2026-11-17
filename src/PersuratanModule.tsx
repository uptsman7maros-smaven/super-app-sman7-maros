import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import {
  LayoutDashboard, FilePlus2, Files, Inbox, Send, Archive, ClipboardCheck, Search, Bell,
  X, ChevronLeft, ChevronRight, Plus, RefreshCw, ShieldCheck, Mail, BookOpen, Printer,
  Check, RotateCcw, Ban, FileText, Sparkles
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { isSupabaseRateLimitError, supabase } from './lib/supabase'
import { isLetterInProgress } from './lib/letterMetrics'
import { logAppActivity } from './services/activityLogService'
import { useSchoolContext } from './context/useSchoolContext'
import PersonPicker from './components/shared/PersonPicker'
import type { PersonOption } from './services/masterDataService'
import './PersuratanModule.css'

type Page = 'dashboard' | 'create' | 'requests' | 'approvals' | 'issued' | 'archive' | 'incoming' | 'outgoing' | 'dispositions' | 'templates'
type LetterRole = 'administrator' | 'operator' | 'guru_staf' | 'pemohon' | 'staf_tu' | 'kepala_tu' | 'kepala_sekolah'
type LetterStatus = 'draft' | 'submitted' | 'in_review' | 'revision' | 'resubmitted' | 'approved' | 'awaiting_number' | 'issued' | 'rejected' | 'archived'
type TemplateField = { name: string; label: string; required?: boolean; type?: string }
type LetterTemplate = {
  id: string
  name: string
  description?: string | null
  subject?: string | null
  html_content?: string
  category?: { name: string; code?: string } | null
  fields_schema: TemplateField[]
}
type LetterRequest = {
  id: string
  request_code: string
  template_id: string
  requester_id: string
  requester_name: string
  requester_nip: string | null
  requester_position: string | null
  subject: string
  form_data: Record<string, unknown>
  status: LetterStatus
  created_at: string
  letter_templates?: { name?: string; category_id?: string | null; requires_principal_approval?: boolean } | null
  letter_issued?: { letter_number: string; issue_date: string; signer_name: string | null; signer_position: string | null; signer_nip: string | null } | null
}
type IncomingLetter = {
  id: string
  external_number: string
  sender: string
  subject: string
  received_date: string
  follow_up_status: string
}
type LetterNotification = { id: string; title: string; body: string; created_at: string; is_read: boolean }
type CurrentUser = { id?: string; username?: string; role?: string; full_name?: string; nip_or_nisn?: string; jabatan?: string | null; class_name?: string | null }
type LetterModal = null | { type: 'template' | 'incoming' | 'notifications' }
type NavItem = { label: string; icon: LucideIcon; key: Page }
type LetterForm = Record<string, string>

function isLetterRole(value: unknown): value is LetterRole {
  return typeof value === 'string' && Object.hasOwn(roleLabels, value)
}

function personFieldType(field: TemplateField): 'student' | 'teacher' | null {
  if (field.type === 'student' || field.type === 'teacher') return field.type
  const key = `${field.name} ${field.label}`.toLocaleLowerCase('id-ID')
  if (/(siswa|student|nisn)/.test(key)) return 'student'
  if (/(guru|teacher|nip|assigned_name)/.test(key)) return 'teacher'
  return null
}

const nav: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, key: 'dashboard' },
  { label: 'Ajukan Surat', icon: FilePlus2, key: 'create' },
  { label: 'Pengajuan Surat', icon: Files, key: 'requests' },
  { label: 'Persetujuan Surat', icon: ClipboardCheck, key: 'approvals' },
  { label: 'Surat Terbit', icon: Send, key: 'issued' },
  { label: 'Arsip Digital', icon: Archive, key: 'archive' },
  { label: 'Surat Masuk', icon: Inbox, key: 'incoming' },
  { label: 'Surat Keluar', icon: Mail, key: 'outgoing' },
  { label: 'Disposisi', icon: BookOpen, key: 'dispositions' },
  { label: 'Format Surat', icon: FileText, key: 'templates' },
]
const roleLabels: Record<LetterRole, string> = { administrator:'Administrator Super App', operator:'Operator Persuratan', guru_staf:'Guru / Tendik', pemohon:'Siswa', staf_tu:'Staf Tata Usaha', kepala_tu:'Kepala Tata Usaha', kepala_sekolah:'Kepala Sekolah' }
const rolePageAccess: Record<LetterRole, Page[]> = {
  administrator:nav.map(item=>item.key),
  operator:['dashboard','create','requests','issued','archive','incoming','outgoing','dispositions','templates'],
  kepala_tu:['dashboard','create','requests','approvals','issued','archive','incoming','outgoing','dispositions','templates'],
  staf_tu:['dashboard','create','requests','archive','incoming','outgoing','dispositions'],
  kepala_sekolah:['dashboard','create','requests','approvals','issued','archive','dispositions'],
  guru_staf:['dashboard','create','requests','issued','archive'],
  pemohon:['dashboard','create','requests','issued','archive']
}
const statusLabels: Record<LetterStatus, string> = { draft:'Draft', submitted:'Diajukan', in_review:'Dalam Pemeriksaan', revision:'Perlu Revisi', resubmitted:'Diajukan Ulang', approved:'Disetujui', awaiting_number:'Menunggu Nomor', issued:'Diterbitkan', rejected:'Ditolak', archived:'Diarsipkan' }
const pageDescriptions: Record<Page, string> = {
  dashboard:'Ringkasan proses surat dan aktivitas terbaru sekolah.',
  create:'Mulai pengajuan baru dengan format surat yang tersedia.',
  requests:'Lacak status pengajuan dan tindak lanjuti draf.',
  approvals:'Tinjau dan berikan keputusan untuk surat yang masuk.',
  issued:'Temukan surat yang sudah memperoleh nomor resmi.',
  archive:'Dokumen surat terbit yang tersimpan sebagai arsip.',
  incoming:'Catat dan pantau surat yang diterima sekolah.',
  outgoing:'Pantau surat keluar yang dicatat melalui sistem.',
  dispositions:'Lihat tindak lanjut dan disposisi surat.',
  templates:'Kelola format yang digunakan pada pengajuan surat.'
}
const demoTemplates: LetterTemplate[] = [
  {id:'demo-und',name:'Surat Undangan',description:'Undangan rapat, kegiatan, atau pertemuan',category:{name:'Undangan',code:'UND'},fields_schema:[
    {name:'recipient',label:'Nama penerima',required:true},{name:'event_day',label:'Hari dan tanggal',required:true},{name:'event_time',label:'Waktu kegiatan',required:true},{name:'event_place',label:'Tempat kegiatan',required:true},{name:'agenda',label:'Agenda kegiatan',required:true},{name:'extra',label:'Keterangan tambahan'}
  ]},
  {id:'demo-tgs',name:'Surat Tugas',description:'Penugasan guru atau tenaga kependidikan',category:{name:'Tugas',code:'TGS'},fields_schema:[
    {name:'assigned_name',label:'Nama yang ditugaskan',required:true},{name:'assigned_nip',label:'NIP'},{name:'task',label:'Uraian tugas',required:true},{name:'location',label:'Tempat tugas',required:true},{name:'date_range',label:'Waktu pelaksanaan',required:true}
  ]}
]
export default function LettersApp({onBack,currentUser}: { onBack?: () => void; currentUser?: CurrentUser | null }){
  const { currentUser: contextUser, schoolSettings } = useSchoolContext()
  const person = contextUser ?? currentUser ?? null
  const [session,setSession]=useState<Session | null>(null), [role,setRole]=useState<LetterRole | null>(null)
  const [page,setPage]=useState<Page>('dashboard')
  const [loading,setLoading]=useState(true), [sessionReady,setSessionReady]=useState(false), [busy,setBusy]=useState(false), [error,setError]=useState('')
  const [requests,setRequests]=useState<LetterRequest[]>([]), [templates,setTemplates]=useState<LetterTemplate[]>([]), [incoming,setIncoming]=useState<IncomingLetter[]>([])
  const [notifications,setNotifications]=useState<LetterNotification[]>([]), [search,setSearch]=useState(''), [toast,setToast]=useState('')
  const [modal,setModal]=useState<LetterModal>(null), [form,setForm]=useState<LetterForm>({})
  const [selectedTemplate,setSelectedTemplate]=useState('')
  const [requestData,setRequestData]=useState<LetterForm>({})
  const [personFields,setPersonFields]=useState<Record<string,PersonOption>>({})
  const [myName,setMyName]=useState('')
  const [myNip,setMyNip]=useState('')
  const [myPosition,setMyPosition]=useState('')
  const loadRequestRef=useRef<{userId:string|null;generation:number;promise:Promise<void>|null}>({userId:null,generation:0,promise:null})
  const loadedUserIdRef=useRef<string|null>(null)
  const isAdmin=role==='administrator'
  const activeTemplates=templates.length?templates:demoTemplates
  const rolePermissionError=/permission denied for table\s+letter_user_roles/i.test(error)
  const sessionRateLimitError=/\b429\b|rate limit|membatasi pembaruan sesi/i.test(error)
  const roleSourceMigrationError=/letter_current_role|could not find the function/i.test(error)
  const visibleNav=role ? nav.filter((item)=>rolePageAccess[role].includes(item.key)) : []

  const acceptSession=useCallback((nextSession:Session|null)=>{
    const nextUserId=nextSession?.user.id??null
    if(loadedUserIdRef.current!==nextUserId){
      loadedUserIdRef.current=nextUserId
      loadRequestRef.current={userId:nextUserId,generation:loadRequestRef.current.generation+1,promise:null}
      setRole(null);setRequests([]);setTemplates([]);setIncoming([]);setNotifications([]);setError('')
      setLoading(Boolean(nextUserId))
    }
    setSession(current=>current?.user.id===nextUserId?current:nextSession)
  },[])

  const loadAll=useCallback(async(silent=false):Promise<void>=>{
    const uid=session?.user.id
    if(!uid)return
    const currentRequest=loadRequestRef.current
    if(currentRequest.userId===uid&&currentRequest.promise)return currentRequest.promise
    const generation=currentRequest.generation+1
    loadRequestRef.current={userId:uid,generation,promise:null}
    if(!silent){setLoading(true);setError('')}
    const request=(async()=>{
      const [{data:roleData,error:roleErr},{data:reqData,error:reqErr},{data:tplData,error:tplErr},{data:inData,error:inErr},{data:notifData,error:notifErr}] = await Promise.all([
        supabase.rpc('letter_current_role'),
        supabase.from('letter_requests').select('*, letter_templates(name, category_id, requires_principal_approval), letter_issued(letter_number,issue_date,signer_name,signer_position,signer_nip)').order('created_at',{ascending:false}),
        supabase.from('letter_templates').select('*, letter_categories(name,code)').eq('is_active',true).order('name'),
        supabase.from('letter_incoming').select('*').order('received_date',{ascending:false}),
        supabase.from('letter_notifications').select('*').order('created_at',{ascending:false}).limit(8)
      ])
      if(loadRequestRef.current.generation!==generation)return
      const loadError=roleErr||reqErr||tplErr||inErr||notifErr
      setError(loadError?(isSupabaseRateLimitError(loadError)?`HTTP 429: ${loadError.message}`:loadError.message):'')
      if(!roleErr)setRole(isLetterRole(roleData)?roleData:null)
      if(!reqErr)setRequests(reqData||[])
      if(!tplErr)setTemplates((tplData||[]).map((t: LetterTemplate & {letter_categories?:LetterTemplate['category']})=>({...t,category:t.letter_categories})))
      if(!inErr)setIncoming(inData||[])
      if(!notifErr)setNotifications(notifData||[])
    })()
    loadRequestRef.current.promise=request
    try{
      await request
    }catch(loadError){
      if(!isSupabaseRateLimitError(loadError))console.error('Data Persuratan gagal dimuat:',loadError)
      if(loadRequestRef.current.generation===generation)setError(isSupabaseRateLimitError(loadError)?`HTTP 429: ${loadError instanceof Error?loadError.message:String(loadError)}`:loadError instanceof Error?loadError.message:String(loadError))
    }finally{
      if(loadRequestRef.current.generation===generation){
        loadRequestRef.current.promise=null
        setLoading(false)
      }
    }
  },[session?.user.id])

  useEffect(()=>{
    let active=true
    supabase.auth.getSession().then(({data,error:sessionError})=>{
      if(!active)return
      if(sessionError)setError(sessionError.message)
      acceptSession(data.session)
      setSessionReady(true)
    }).catch(sessionError=>{
      if(!active)return
      setError(sessionError instanceof Error?sessionError.message:String(sessionError))
      setSessionReady(true)
    })
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{
      if(active)acceptSession(s)
    })
    return ()=>{active=false;subscription.unsubscribe()}
  },[acceptSession])
  const sessionUserId=session?.user.id??null
  useEffect(()=>{
    if(!sessionUserId)return
    const timerId=window.setTimeout(()=>void loadAll(Boolean(role)),0)
    return ()=>window.clearTimeout(timerId)
  },[sessionUserId,role,loadAll])
  useEffect(()=>{
    if(!sessionUserId)return
    const refreshVisibleData=()=>{
      if(document.visibilityState==='visible')void loadAll(true)
    }
    const intervalId=window.setInterval(refreshVisibleData,60_000)
    document.addEventListener('visibilitychange',refreshVisibleData)
    return ()=>{
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange',refreshVisibleData)
    }
  },[sessionUserId,loadAll])
  function notify(msg:string){setToast(msg);setTimeout(()=>setToast(''),3200)}
  async function auditLetter(action:string,details:string){
    try{
      await logAppActivity({actorId:currentUser?.id,actorLabel:currentUser?.full_name||currentUser?.username,action,moduleKey:'Persuratan',details})
    }catch(error){
      notify(`Perubahan tersimpan, tetapi audit aktivitas gagal: ${error instanceof Error?error.message:String(error)}`)
    }
  }
  async function createRequest(e:FormEvent<HTMLFormElement>){
    const requesterName=person?.full_name||myName
    const requesterNip=person?.nip_or_nisn||myNip
    const requesterPosition=person?.jabatan||person?.class_name||myPosition
    e.preventDefault();if(!selectedTemplate||!requesterName.trim()){notify('Lengkapi template dan nama pemohon');return}
    if(!session){notify('Sesi login tidak tersedia. Masuk kembali untuk melanjutkan.');return}
    setBusy(true)
    const t=activeTemplates.find(x=>x.id===selectedTemplate)
    if(String(selectedTemplate).startsWith('demo-')){notify('Template contoh belum tersimpan di database. Buat template di menu Format Surat terlebih dahulu.');setBusy(false);return}
    const {error}=await supabase.from('letter_requests').insert({
      template_id:selectedTemplate,requester_id:session.user.id,requester_name:requesterName,
      requester_nip:requesterNip,requester_position:requesterPosition,subject:form.subject||t?.name||'Pengajuan surat',
      form_data:requestData,status:'draft'
    }).select().single()
    if(error)notify(error.message);else{await auditLetter('Draft pengajuan dibuat',`${requesterName} · ${form.subject||t?.name||'Pengajuan surat'}`);notify('Draft pengajuan berhasil dibuat');setPage('requests');await loadAll(true)}
    setBusy(false)
  }
  async function submitRequest(id:string){
    setBusy(true);const {error}=await supabase.rpc('letter_submit_request',{p_request_id:id})
    if(error)notify(error.message);else{await auditLetter('Pengajuan surat dikirim',`Pengajuan ${id} dikirim untuk diperiksa.`);notify('Pengajuan berhasil dikirim ke Kepala TU');await loadAll(true)}
    setBusy(false)
  }
  async function review(id:string,decision:'approved'|'revision'|'rejected'){
    const note=window.prompt(decision==='approved'?'Catatan persetujuan (opsional):':'Tuliskan catatan/alasan:')
    if(note===null)return
    setBusy(true);const {error}=await supabase.rpc('letter_review_request',{p_request_id:id,p_decision:decision,p_note:note})
    if(error)notify(error.message);else{await auditLetter(`Pengajuan surat ${decision}`,`Pengajuan ${id} · ${note||'Tanpa catatan'}`);notify('Keputusan berhasil disimpan');await loadAll(true)}
    setBusy(false)
  }
  async function issue(id:string){
    const signer=window.prompt('Nama pejabat penandatangan:')
    if(!signer)return
    setBusy(true);const {error}=await supabase.rpc('letter_issue_number',{p_request_id:id,p_issue_date:new Date().toISOString().slice(0,10),p_signer_name:signer,p_signer_position:'Kepala Sekolah',p_signer_nip:null})
    if(error)notify(error.message);else{await auditLetter('Nomor surat diterbitkan',`Pengajuan ${id} · Penandatangan ${signer}`);notify('Nomor surat berhasil diterbitkan dan masuk arsip');await loadAll(true)}
    setBusy(false)
  }
  async function createTemplate(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true)
    if(!session){notify('Sesi login tidak tersedia. Masuk kembali untuk melanjutkan.');setBusy(false);return}
    const {error}=await supabase.from('letter_templates').insert({
      name:form.name,description:form.description,category_id:form.category_id||null,
      subject:form.subject||form.name,html_content:form.html_content||'<h2 style="text-align:center">SURAT</h2><p>{{isi_surat}}</p>',
      fields_schema:[],created_by:session.user.id,updated_by:session.user.id
    })
    if(error)notify(error.message);else{notify('Template berhasil dibuat');setModal(null);setForm({});await loadAll(true)}
    setBusy(false)
  }
  async function createIncoming(e:FormEvent<HTMLFormElement>){
    e.preventDefault();setBusy(true)
    if(!session){notify('Sesi login tidak tersedia. Masuk kembali untuk melanjutkan.');setBusy(false);return}
    const {error}=await supabase.from('letter_incoming').insert({...form,created_by:session.user.id})
    if(error)notify(error.message);else{notify('Surat masuk berhasil dicatat');setModal(null);setForm({});await loadAll(true)}
    setBusy(false)
  }
  const printLetter=(request:LetterRequest)=>{
    const issued=Array.isArray(request.letter_issued)?request.letter_issued[0]:request.letter_issued
    const escapeHtml=(value:string)=>value.replace(/[&<>"']/g,(character)=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    })[character]??character)
    const schoolName=schoolSettings?.school_name||'SMAN 7 MAROS'
    const letterhead=(schoolSettings?.letterhead||'').split('\n').map(escapeHtml).join('<br>')
    const logoUrl=schoolSettings?.logo_url&&/^https?:\/\//i.test(schoolSettings.logo_url)
      ? `<img src="${escapeHtml(schoolSettings.logo_url)}" alt="" width="76">`
      : ''
    const fields=Object.entries(request.form_data||{}).map(([key,value])=>
      `<tr><th>${escapeHtml(key.replaceAll('_',' '))}</th><td>${escapeHtml(String(value??''))}</td></tr>`
    ).join('')
    const documentHtml=`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(request.subject)}</title><style>
      body{font:14px Arial,sans-serif;color:#111;margin:30mm 25mm}header{display:flex;align-items:center;gap:18px;border-bottom:3px double #111;padding-bottom:12px;margin-bottom:24px;text-align:center}header div{flex:1}h1{font-size:20px;margin:0 0 6px}.letterhead{line-height:1.5}table{width:100%;border-collapse:collapse;margin:18px 0}th,td{text-align:left;vertical-align:top;padding:7px;border-bottom:1px solid #bbb}th{width:35%;text-transform:capitalize}.signature{margin:44px 0 0 auto;width:230px;text-align:center}@media print{body{margin:22mm 20mm}}
      </style></head><body><header>${logoUrl}<div><h1>${escapeHtml(schoolName)}</h1><div class="letterhead">${letterhead}</div></div></header>
      <h2>${escapeHtml(request.subject)}</h2><p>Nomor: ${escapeHtml(issued?.letter_number||'—')}</p>
      <p>Tanggal: ${escapeHtml(issued?.issue_date||new Date().toISOString().slice(0,10))}</p>
      <p>Pemohon: ${escapeHtml(request.requester_name)}${request.requester_position?` — ${escapeHtml(request.requester_position)}`:''}</p>
      <table>${fields}</table><div class="signature"><p>${escapeHtml(issued?.signer_position||'Pejabat penandatangan')}</p><br><br><strong>${escapeHtml(issued?.signer_name||'')}</strong><br>${escapeHtml(issued?.signer_nip||'')}</div>
      </body></html>`
    const printWindow=window.open('','_blank')
    if(!printWindow){notify('Jendela cetak diblokir browser. Izinkan pop-up lalu coba lagi.');return}
    printWindow.opener=null
    printWindow.document.open()
    printWindow.document.write(documentHtml)
    printWindow.document.close()
    printWindow.focus()
    printWindow.setTimeout(()=>printWindow.print(),250)
  }
  const visibleRequests=useMemo(()=>requests.filter((r)=>{
    const q=search.toLowerCase()
    return !q||[r.request_code,r.subject,r.requester_name,r.status].some(v=>String(v||'').toLowerCase().includes(q))
  }),[requests,search])
  const renderTemplateField=(field:TemplateField)=>{
    const type=personFieldType(field)
    if(!type){
      return <label key={field.name}>{field.label}{field.required?' *':''}<input required={!!field.required} value={requestData[field.name]||''} onChange={e=>setRequestData({...requestData,[field.name]:e.target.value})}/></label>
    }
    return <label key={field.name}>{field.label}{field.required?' *':''}<PersonPicker
      value={personFields[field.name]??null}
      personType={type}
      required={!!field.required}
      onChange={(person)=>{
        setPersonFields((previous)=>{
          const next={...previous}
          if(person)next[field.name]=person
          else delete next[field.name]
          return next
        })
        setRequestData((previous)=>({
          ...previous,
          [field.name]:person?.full_name||'',
          [`${field.name}_id`]:person?.id||'',
          [`${field.name}_identifier`]:person?.identifier||'',
          [`${field.name}_class_name`]:person?.class_name||'',
        }))
      }}
    /></label>
  }
  const stats=[
    ['Total Pengajuan',requests.length,Files],['Surat Diproses',requests.filter(r=>isLetterInProgress(r.status)).length,ClipboardCheck],
    ['Diterbitkan',requests.filter(r=>r.status==='issued').length,Send],['Perlu Revisi',requests.filter(r=>r.status==='revision').length,RefreshCw]
  ] as const
  if(!session) return <div className="letter-app"><div className="sso-state"><div className="sso-card"><div className="brand-mark">7</div><span className="eyebrow">SUPER APP · SMAN 7 MAROS</span><h1>{sessionReady?'Sesi masuk tidak ditemukan':'Memverifikasi sesi masuk'}</h1><p>{sessionReady?error||'Persuratan menggunakan sesi login dari Super App. Kembali ke halaman utama untuk masuk.':'Memeriksa sesi Super App…'}</p>{sessionReady&&onBack&&<button className="primary" onClick={onBack}><ChevronLeft size={17}/> Kembali ke Super App</button>}</div></div></div>
  return <div className="letter-app"><div className="app-shell">
    <header className="portal-header">
      <button className="brand brand-button" onClick={()=>setPage('dashboard')} aria-label="Buka dashboard Persuratan"><div className="brand-mark small">{schoolSettings?.logo_url&&/^https?:\/\//i.test(schoolSettings.logo_url)?<img src={schoolSettings.logo_url} alt="" width="39" height="39"/>:'7'}</div><div><b>{schoolSettings?.school_name||'SMAN 7 MAROS'}</b><small>Persuratan Digital</small></div></button>
      <div className="portal-actions">{onBack&&<button className="back-portal" onClick={onBack}><ChevronLeft size={17}/> Super App</button>}<button className="icon-btn notification" onClick={()=>setModal({type:'notifications'})} aria-label="Notifikasi"><Bell size={19}/>{notifications.some(n=>!n.is_read)&&<i/>}</button><div className="top-user"><div className="avatar">{(person?.username||session.user.email||'U')[0].toUpperCase()}</div><span><b>{person?.username||session.user.email}</b><small>{role?roleLabels[role]:person?.role||'Pengguna'}</small></span></div></div>
    </header>
    <nav className="module-nav" aria-label="Navigasi Persuratan"><div className="module-nav-label"><span>MENU MODUL</span><small>{visibleNav.length} layanan</small></div><div className="module-nav-list">{visibleNav.map(({label,icon:Icon,key})=><button key={key} className={`module-nav-item ${page===key?'active':''}`} aria-current={page===key?'page':undefined} onClick={()=>setPage(key)}><Icon size={17}/><span>{label}</span></button>)}</div></nav>
    <main className="main-area">
      <div className="section-heading"><div><span className="eyebrow">WORKSPACE · PERSURATAN DIGITAL</span><h2>{nav.find(n=>n.key===page)?.label||'Persuratan Digital'}</h2><p>{pageDescriptions[page]}</p></div><div className="heading-meta"><span className="module-status"><i/> Administrasi sekolah</span><span className="role-chip">{role?roleLabels[role]:person?.role||'Role belum diatur'}</span></div></div>
      <section className="content" key={page}>
        {loading?<div className="loading-grid"><div/><div/><div/><div/></div>:!role?<div className="setup-layout">
          <div className="setup-intro">
            <div className="setup-icon"><ShieldCheck size={25}/></div>
            <span className="setup-eyebrow">{roleSourceMigrationError?'MIGRASI ROLE':rolePermissionError?'PENYIAPAN DATABASE':sessionRateLimitError?'SESI SEMENTARA DIBATASI':'KONFIGURASI AKUN'}</span>
            <h3>{roleSourceMigrationError?'Migrasi akses peran belum diterapkan':rolePermissionError?'Izin tabel Persuratan belum diterapkan':sessionRateLimitError?'Pembaruan sesi sedang dibatasi':'Role Persuratan belum dikonfigurasi'}</h3>
            <p>{roleSourceMigrationError?'Jalankan migrasi role terbaru agar hak akses Persuratan mengikuti profil Super App secara otomatis.':rolePermissionError?'Supabase menolak akses ke tabel Persuratan. Terapkan grant tabel, lalu coba muat ulang.':sessionRateLimitError?'Supabase membatasi permintaan sesi sementara. Data yang sudah tampil dipertahankan; tunggu sebentar sebelum mencoba lagi.':'Akun Super App belum aktif atau role-nya belum memiliki akses ke Persuratan. Periksa role pada menu Pengguna Super App.'}</p>
            <button className="primary" onClick={()=>loadAll(true)} disabled={loading}><RefreshCw size={16}/> Coba lagi</button>
          </div>
          <div className="setup-details">
            {roleSourceMigrationError?<div className="setup-step"><span>01</span><div><b>Jalankan migrasi akses role</b><p>SQL akan memakai public.profiles sebagai sumber tunggal role dan menerapkan hak akses sesuai peran.</p><a className="setup-download" href="/Persuratan/supabase/003_superapp_role_access.sql" download>Unduh migrasi akses role <ChevronRight size={15}/></a></div></div>:rolePermissionError?<div className="setup-step"><span>01</span><div><b>Terapkan izin database</b><p>Di Supabase SQL Editor, jalankan skrip grant tabel Persuratan. RLS tetap membatasi akses sesuai role.</p><a className="setup-download" href="/Persuratan/supabase/002_persuratan_table_grants.sql" download>Unduh SQL izin tabel <ChevronRight size={15}/></a></div></div>:sessionRateLimitError?<div className="setup-step"><span>01</span><div><b>Tunggu pembatasan berakhir</b><p>Permintaan refresh tidak diulang terus-menerus. Sesi yang masih valid tetap digunakan.</p></div></div>:<div className="setup-step"><span>01</span><div><b>Periksa akun Super App</b><p>Hanya profil aktif dengan role yang diizinkan yang mendapat akses. Pengguna nonaktif dan pending tetap dibatasi.</p></div></div>}
            <div className="setup-step"><span>02</span><div><b>Coba muat ulang setelah perbaikan</b><p>Setelah query berhasil atau jeda rate limit selesai, tekan “Coba lagi”.</p></div></div>
            {error&&<div className="setup-error"><span>Detail error</span><code>{error}</code></div>}
          </div>
        </div>:<>
        {error&&<div className="error" role="alert">{error}</div>}
        {page==='dashboard'&&<><div className="welcome"><div><span className="eyebrow light">SUPER APP · {schoolSettings?.school_name||'SMAN 7 MAROS'}</span><h1>Persuratan Digital</h1><p>Pantau pengajuan, persetujuan, surat terbit, dan arsip administrasi sekolah dalam satu tempat.</p></div><div className="welcome-icon"><span className="welcome-art-icon"><Sparkles size={22}/></span><strong>Administrasi surat</strong><small>Terstruktur & terdokumentasi</small><span className="welcome-bars"><i/><i/><i/><i/><i/></span></div></div><div className="stat-grid">{stats.map(([label,value,Icon],i)=><div className="stat-card" style={{'--delay':`${i*70}ms`} as CSSProperties} key={label}><div className="stat-top"><span>{label}</span><div className="stat-icon"><Icon size={19}/></div></div><strong>{value}</strong><small>Data persuratan saat ini</small></div>)}</div><div className="panel"><div className="panel-head"><div><h3>Pengajuan terbaru</h3><p>Aktivitas surat yang baru masuk ke sistem</p></div><button className="text-btn" onClick={()=>setPage('requests')}>Lihat semua <ChevronRight size={16}/></button></div><RequestTable rows={requests.slice(0,5)} onSubmit={submitRequest} onReview={review} onIssue={issue} onPrint={printLetter} role={role}/></div></>}
        {page==='create'&&<div className="panel form-panel"><div className="panel-head"><div><h3>Buat pengajuan surat</h3><p>Pilih format dan lengkapi informasi yang dibutuhkan.</p></div><FilePlus2 className="panel-symbol"/></div><form onSubmit={createRequest} className="form-grid"><label className="span-2">Format surat<select value={selectedTemplate} onChange={e=>{setSelectedTemplate(e.target.value);setRequestData({});setPersonFields({})}} required><option value="">Pilih format surat</option>{activeTemplates.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label><label>Nama pemohon<input value={person?.full_name||myName} onChange={e=>setMyName(e.target.value)} required readOnly={Boolean(person?.full_name)} placeholder="Nama lengkap"/></label><label>NIP / NISN<input value={person?.nip_or_nisn||myNip} onChange={e=>setMyNip(e.target.value)} readOnly={Boolean(person?.nip_or_nisn)} placeholder="NIP / NISN (opsional)"/></label><label className="span-2">Jabatan / Kelas<input value={person?.jabatan||person?.class_name||myPosition} onChange={e=>setMyPosition(e.target.value)} readOnly={Boolean(person?.jabatan||person?.class_name)} placeholder="Guru / Staf / Kelas"/></label><label className="span-2">Perihal<input value={form.subject||''} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="Perihal surat" required/></label>{(activeTemplates.find(t=>t.id===selectedTemplate)?.fields_schema||[]).map(renderTemplateField)}<div className="span-2 form-actions"><button type="button" className="secondary" onClick={()=>{setPage('requests');notify('Isi formulir dapat dilanjutkan nanti jika disimpan sebagai draft.')}}>Batal</button><button className="primary" disabled={busy}>Simpan draft <ChevronRight size={17}/></button></div></form></div>}
        {page==='requests'&&<DataPanel title="Daftar pengajuan surat" subtitle="Pantau status dan riwayat pengajuan surat." search={search} setSearch={setSearch} action={()=>setPage('create')} actionLabel="Ajukan surat"><RequestTable rows={visibleRequests} onSubmit={submitRequest} onReview={review} onIssue={issue} onPrint={printLetter} role={role}/></DataPanel>}
        {page==='approvals'&&<DataPanel title="Pemeriksaan dan persetujuan" subtitle="Tinjau pengajuan yang menunggu keputusan administratif." search={search} setSearch={setSearch}><RequestTable rows={visibleRequests.filter(r=>['submitted','resubmitted','in_review','approved'].includes(r.status)&&(role!=='kepala_sekolah'||(r.status==='approved'&&r.letter_templates?.requires_principal_approval)))} onSubmit={submitRequest} onReview={review} onIssue={issue} role={role}/></DataPanel>}
        {page==='issued'&&<DataPanel title="Surat terbit" subtitle="Dokumen yang telah memperoleh nomor surat." search={search} setSearch={setSearch}><RequestTable rows={visibleRequests.filter(r=>r.status==='issued')} onSubmit={submitRequest} onReview={review} onIssue={issue} onPrint={printLetter} role={role}/></DataPanel>}
        {page==='archive'&&<DataPanel title="Arsip digital" subtitle="Arsip surat terbit dan dokumen administrasi." search={search} setSearch={setSearch}><RequestTable rows={visibleRequests.filter(r=>['issued','archived'].includes(r.status))} onSubmit={submitRequest} onReview={review} onIssue={issue} onPrint={printLetter} role={role}/></DataPanel>}
        {page==='templates'&&<div className="panel"><div className="panel-head"><div><h3>{isAdmin?'Manajemen format surat':'Format surat tersedia'}</h3><p>{isAdmin?'Kelola format dinamis yang dapat digunakan berulang kali.':'Format yang dapat dipilih saat membuat pengajuan.'}</p></div>{isAdmin&&<button className="primary" onClick={()=>{setForm({});setModal({type:'template'})}}><Plus size={17}/> Template baru</button>}</div><div className="template-grid">{activeTemplates.map(t=><div className="template-card" key={t.id}><div className="template-icon"><FileText/></div><h4>{t.name}</h4><p>{t.description||'Format surat sekolah'}</p><span className="soft-tag">{t.category?.name||'Umum'}</span></div>)}</div></div>}
        {page==='incoming'&&<DataPanel title="Surat masuk" subtitle="Catat surat yang diterima sekolah." search={search} setSearch={setSearch} action={()=>{setForm({});setModal({type:'incoming'})}} actionLabel="Catat surat masuk"><div className="simple-list">{incoming.filter(x=>!search||`${x.external_number} ${x.sender} ${x.subject}`.toLowerCase().includes(search.toLowerCase())).map(x=><div className="simple-row" key={x.id}><div className="template-icon"><Inbox/></div><div className="grow"><b>{x.subject}</b><small>{x.external_number} · {x.sender} · {x.received_date}</small></div><span className="soft-tag">{x.follow_up_status}</span></div>)}</div></DataPanel>}
        {page==='outgoing'&&<div className="empty-state"><Mail size={36}/><h3>Surat keluar</h3><p>Surat yang diterbitkan melalui alur pengajuan otomatis tercatat pada Surat Terbit dan Arsip. Pencatatan surat keluar eksternal tersedia pada pengembangan berikutnya.</p></div>}
        {page==='dispositions'&&<div className="empty-state"><BookOpen size={36}/><h3>Disposisi surat</h3><p>Struktur data disposisi telah disiapkan. Antarmuka penugasan dan tindak lanjut perlu diaktifkan pada tahap integrasi lanjutan.</p></div>}
        </>}
      </section>
    </main>
    {toast&&<div className="toast"><Check size={17}/>{toast}</div>}
    {modal?.type==='template'&&<Modal title="Tambah template surat" close={()=>setModal(null)}><form className="modal-form" onSubmit={createTemplate}><label>Nama template<input required value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Deskripsi<input value={form.description||''} onChange={e=>setForm({...form,description:e.target.value})}/></label><label>HTML template<textarea rows={7} value={form.html_content||''} onChange={e=>setForm({...form,html_content:e.target.value})} placeholder="<h2>SURAT</h2><p>{{isi_surat}}</p>"/></label><p className="hint">Variabel dapat ditulis sebagai <code>{'{{nama_variabel}}'}</code>. Untuk template dinamis yang lebih lengkap, atur skema field pada database.</p><button className="primary" disabled={busy}>Simpan template</button></form></Modal>}
    {modal?.type==='incoming'&&<Modal title="Catat surat masuk" close={()=>setModal(null)}><form className="modal-form" onSubmit={createIncoming}><label>Nomor surat<input required value={form.external_number||''} onChange={e=>setForm({...form,external_number:e.target.value})}/></label><label>Asal surat<input required value={form.sender||''} onChange={e=>setForm({...form,sender:e.target.value})}/></label><label>Perihal<input required value={form.subject||''} onChange={e=>setForm({...form,subject:e.target.value})}/></label><label>Tanggal surat<input type="date" value={form.letter_date||''} onChange={e=>setForm({...form,letter_date:e.target.value})}/></label><label>Ringkasan<textarea rows={3} value={form.summary||''} onChange={e=>setForm({...form,summary:e.target.value})}/></label><button className="primary" disabled={busy}>Simpan surat masuk</button></form></Modal>}
    {modal?.type==='notifications'&&<Modal title="Notifikasi" close={()=>setModal(null)}><div className="notification-list">{notifications.length?notifications.map(n=><div className="notification-row" key={n.id}><Bell size={17}/><div><b>{n.title}</b><p>{n.body}</p><small>{new Date(n.created_at).toLocaleString('id-ID')}</small></div></div>):<p className="muted">Belum ada notifikasi.</p>}</div></Modal>}
  </div></div>
}
function DataPanel({title,subtitle,search,setSearch,action,actionLabel,children}: {
  title:string; subtitle:string; search:string; setSearch:(value:string)=>void;
  action?:()=>void; actionLabel?:string; children:ReactNode;
}){return <div className="panel"><div className="panel-head"><div><h3>{title}</h3><p>{subtitle}</p></div>{action&&<button className="primary" onClick={action}><Plus size={17}/>{actionLabel}</button>}</div><div className="toolbar"><div className="search-box"><Search size={17}/><input placeholder="Cari nomor, perihal, atau pemohon..." value={search} onChange={e=>setSearch(e.target.value)}/></div></div>{children}</div>}
function RequestTable({rows,onSubmit,onReview,onIssue,onPrint,role}: {
  rows:LetterRequest[];
  onSubmit:(id:string)=>void;
  onReview:(id:string,decision:'approved'|'revision'|'rejected')=>void;
  onIssue:(id:string)=>void;
  onPrint?:(request:LetterRequest)=>void;
  role:LetterRole|null;
}){
 if(!rows.length)return <div className="table-empty"><Files size={25}/><b>Belum ada data pengajuan</b><span>Data akan muncul setelah pengguna membuat pengajuan surat.</span></div>
 return <div className="table-wrap"><table><thead><tr><th>Pengajuan</th><th>Pemohon</th><th>Tanggal</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{rows.map(r=><tr key={r.id}><td><b>{r.subject}</b><small>{r.request_code}</small></td><td>{r.requester_name}<small>{r.requester_position||'—'}</small></td><td>{new Date(r.created_at).toLocaleDateString('id-ID')}</td><td><span className={`status status-${r.status}`}>{statusLabels[r.status]}</span></td><td><div className="row-actions">{['draft','revision'].includes(r.status)&&r.requester_id&&<button title="Kirim pengajuan" onClick={()=>onSubmit(r.id)}><Send size={16}/></button>}{(['submitted','resubmitted','in_review'].includes(r.status)&&['kepala_tu','administrator'].includes(role??'')||(role==='kepala_sekolah'&&r.status==='approved'&&r.letter_templates?.requires_principal_approval))&&<><button title="Setujui" onClick={()=>onReview(r.id,'approved')}><Check size={16}/></button><button title="Revisi" onClick={()=>onReview(r.id,'revision')}><RotateCcw size={16}/></button><button title="Tolak" onClick={()=>onReview(r.id,'rejected')}><Ban size={16}/></button></>}{r.status==='approved'&&['kepala_tu','administrator'].includes(role??'')&&<button className="issue-action" onClick={()=>onIssue(r.id)}>Terbitkan nomor</button>}{r.status==='issued'&&onPrint&&<button title="Cetak surat" onClick={()=>onPrint(r)}><Printer size={16}/></button>}</div></td></tr>)}</tbody></table></div>
}
function Modal({title,close,children}: {title:string;close:()=>void;children:ReactNode}){return <div className="modal-backdrop" onMouseDown={e=>e.target===e.currentTarget&&close()}><div className="modal-card"><div className="modal-head"><h3>{title}</h3><button className="icon-btn" onClick={close}><X size={18}/></button></div>{children}</div></div>}
