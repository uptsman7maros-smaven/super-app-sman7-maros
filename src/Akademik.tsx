import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "./lib/supabase";
import { BookOpen, CalendarDays, ClipboardCheck, FileText, BellRing, ExternalLink, Plus, Search, RefreshCw, Trash2, CheckCircle2, GraduationCap, Megaphone } from "lucide-react";
import type { SchoolUser } from "./context/school-context";
import { useSchoolContext } from "./context/useSchoolContext";
import "./Akademik.css";
import "./AkademikPermissions.css";

type RecordRow = {
 id:string; category:string; title:string; detail:string|null; owner:string|null; due_date:string|null;
 status:string; link_url:string|null; created_at:string; class_id:string|null; academic_year_id:string|null;
 teacher_id:string|null; subject:string|null;
};
type ClassOption = { id:string; name:string; grade_level:number; academic_year_id?:string };
type TeacherAssignment = { assignment_id:string; subject:string; class_id:string; class_name:string; grade_level:number };
const categories = ["Jadwal Mengajar","Pembagian Tugas","Perangkat Ajar","Administrasi Guru","Materi Kelas","Tugas Kelas","Pengumuman","Kehadiran Mengajar","Tautan E-learning"];
const studentCategories = ["Jadwal Mengajar","Materi Kelas","Tugas Kelas","Pengumuman","Tautan E-learning"];
const emptyForm = { category:"Jadwal Mengajar", title:"", detail:"", owner:"", due_date:"", status:"Belum selesai", link_url:"", class_id:"", subject:"" };
const isTeacherAssignment = (value: unknown): value is TeacherAssignment => {
 if (!value || typeof value !== "object") return false;
 const row = value as Record<string, unknown>;
 return typeof row.assignment_id === "string" && typeof row.subject === "string"
  && typeof row.class_id === "string" && typeof row.class_name === "string"
  && typeof row.grade_level === "number";
};
const isClassOption = (value: unknown): value is ClassOption => {
 if (!value || typeof value !== "object") return false;
 const row = value as Record<string, unknown>;
 return typeof row.id === "string" && typeof row.name === "string" && typeof row.grade_level === "number"
  && (row.academic_year_id === undefined || typeof row.academic_year_id === "string");
};
const fmt = (v:string|null) => v ? new Date(v+"T00:00:00").toLocaleDateString("id-ID",{day:"2-digit",month:"short",year:"numeric"}) : "—";
export default function Akademik({ userRole = "", currentUser = null }: { userRole?: string; currentUser?: SchoolUser | null }) {
 const { activeAcademicYear } = useSchoolContext();
 const activeAcademicYearId=activeAcademicYear?.id;
 const currentClassId=currentUser?.class_id;
 const isStudent=userRole==="siswa";
 const canManage=["super_admin","operator","guru"].includes(userRole);
 const canDelete=["super_admin","operator"].includes(userRole);
 const [rows,setRows]=useState<RecordRow[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [tab,setTab]=useState("Semua");
 const [search,setSearch]=useState("");
 const [showForm,setShowForm]=useState(false);
 const [form,setForm]=useState(emptyForm);
 const [saving,setSaving]=useState(false);
 const [filter,setFilter]=useState("Semua");
 const [classOptions,setClassOptions]=useState<ClassOption[]>([]);
 const [teacherAssignments,setTeacherAssignments]=useState<TeacherAssignment[]>([]);
 useEffect(()=>{
  let active=true;
  const loadClassOptions=async()=>{
   try {
    if(userRole==="guru"){
     const {data,error}=await supabase.rpc("get_my_attendance_subject_assignments");
     if(error) throw error;
     if(!Array.isArray(data)||!data.every(isTeacherAssignment)) throw new Error("Daftar kelas dan mata pelajaran tidak valid.");
     if(active) {
      setTeacherAssignments(data);
      setClassOptions([...new Map(data.map(item=>[item.class_id,{id:item.class_id,name:item.class_name,grade_level:item.grade_level}])).values()]);
     }
    }else if(["super_admin","operator"].includes(userRole)){
     let query=supabase.from("classes").select("id,name,grade_level,academic_year_id").order("grade_level").order("name");
     if(activeAcademicYearId) query=query.eq("academic_year_id",activeAcademicYearId);
     const {data,error}=await query;
     if(error) throw error;
     if(!Array.isArray(data)||!data.every(isClassOption)) throw new Error("Daftar kelas dari Data Induk tidak valid.");
     if(active) setClassOptions(data);
    }
   }catch(loadError){
    if(active) setError(loadError instanceof Error?loadError.message:"Kelas dan penugasan gagal dimuat.");
   }
  };
  void loadClassOptions();
  return()=>{active=false};
 },[activeAcademicYearId,userRole]);
 const load=useCallback(async()=>{
  setLoading(true);
  setError("");
  try {
   let query=supabase.from("academic_records").select("*").order("created_at",{ascending:false}).limit(500);
   if(isStudent){
    query=query.in("category",studentCategories);
    if(currentClassId){
     query=query.or(`class_id.eq.${currentClassId},and(class_id.is.null,category.eq.Pengumuman)`);
    }else{
     query=query.is("class_id",null).eq("category","Pengumuman");
    }
   }else if(activeAcademicYearId){
    query=query.or(`academic_year_id.eq.${activeAcademicYearId},academic_year_id.is.null`);
   }
   const {data,error}=await query;
   if(error) throw error;
   setRows((data||[]) as RecordRow[]);
  } catch(error) {
   setError(error instanceof Error ? error.message : "Data akademik gagal dimuat.");
  } finally {
   setLoading(false);
  }
 },[activeAcademicYearId,currentClassId,isStudent]);
 useEffect(()=>{const timer=window.setTimeout(()=>{void load()},0);return()=>window.clearTimeout(timer)},[load]);
 const visibleRows=rows;
 const filtered=useMemo(()=>visibleRows.filter(r=>(tab==="Semua"||r.category===tab)&&(filter==="Semua"||r.status===filter)&&(`${r.title} ${r.detail||""} ${r.owner||""} ${r.category}`).toLowerCase().includes(search.toLowerCase())),[visibleRows,tab,filter,search]);
 const overdue=visibleRows.filter(r=>r.due_date && r.due_date < new Date().toISOString().slice(0,10) && r.status!=="Selesai").length;
 const add=async(e:React.FormEvent)=>{
  e.preventDefault();
  if(!canManage)return;
  setSaving(true);
  setNotice("");
  setError("");
  try {
   if(userRole==="guru"&&form.category!=="Pengumuman"&&(!form.class_id||!form.subject)){
    throw new Error("Pilih kelas dan mata pelajaran sesuai penugasan Anda.");
   }
   const owner=userRole==="guru"?currentUser?.full_name||null:form.owner||null;
   const {error}=await supabase.from("academic_records").insert({
    ...form,class_id:form.class_id||null,subject:form.subject||null,
    teacher_id:userRole==="guru"?currentUser?.teacher_id||null:null,
    due_date:form.due_date||null,detail:form.detail||null,owner,link_url:form.link_url||null,
   });
   if(error) throw error;
   setForm(emptyForm);
   setShowForm(false);
   setNotice("Data akademik berhasil disimpan.");
   await load();
  } catch(error) {
   setError(error instanceof Error ? error.message : "Data akademik gagal disimpan.");
  } finally {
   setSaving(false);
  }
 };
 const updateStatus=async(r:RecordRow)=>{
  if(!canUpdateRecord(r))return;
  const status=r.status==="Selesai"?"Belum selesai":"Selesai";
  setError("");
  try {
   const {error}=await supabase.from("academic_records").update({status}).eq("id",r.id);
   if(error) throw error;
   setRows(prev=>prev.map(x=>x.id===r.id?{...x,status}:x));
  } catch(error) {
   setError(error instanceof Error ? error.message : "Status agenda gagal diperbarui.");
  }
 };
 const remove=async(r:RecordRow)=>{
  if(!canDelete)return;
  if(!window.confirm(`Hapus "${r.title}"?`))return;
  setError("");
  try {
   const {error}=await supabase.from("academic_records").delete().eq("id",r.id);
   if(error) throw error;
   setRows(prev=>prev.filter(x=>x.id!==r.id));
   setNotice("Data dihapus.");
  } catch(error) {
   setError(error instanceof Error ? error.message : "Data akademik gagal dihapus.");
  }
 };
 const canUpdateRecord=(record:RecordRow)=>{
  if(userRole!=="guru")return canManage;
  if(!currentUser?.teacher_id||record.teacher_id!==currentUser.teacher_id)return false;
  return (record.category==="Pengumuman"&&record.class_id===null)
   ||teacherAssignments.some(assignment=>assignment.class_id===record.class_id
    &&assignment.subject.toLocaleLowerCase()===String(record.subject??"").toLocaleLowerCase());
 };
 const stats=[{label:isStudent?"Agenda belajar":"Total agenda",value:visibleRows.length,icon:CalendarDays,color:"violet"},{label:"Perangkat & administrasi",value:visibleRows.filter(r=>["Perangkat Ajar","Administrasi Guru"].includes(r.category)).length,icon:FileText,color:"blue"},{label:"Tugas belum selesai",value:visibleRows.filter(r=>["Tugas Kelas","Administrasi Guru","Perangkat Ajar"].includes(r.category)&&r.status!=="Selesai").length,icon:ClipboardCheck,color:"orange"},{label:"Melewati tenggat",value:overdue,icon:BellRing,color:"pink"}];
 const availableCategories=isStudent?studentCategories:categories;
 return <div className={`akademik-page${canManage?"":" ak-read-only"}${canDelete?"":" ak-no-delete"}${isStudent?" ak-student":""}`}>
 <div className="ak-hero"><div className="ak-orb ak-orb-one"/><div className="ak-orb ak-orb-two"/><div className="ak-hero-copy"><span className="ak-eyebrow"><GraduationCap size={15}/> PUSAT KEGIATAN AKADEMIK</span><h1>Akademik <span>SMAN 7 Maros</span></h1><p>{isStudent?"Lihat agenda belajar, tugas kelas, pengumuman, dan tautan pembelajaran sekolah.":"Kelola jadwal, perangkat ajar, kegiatan kelas, dan tenggat administrasi dalam satu ruang kerja."}</p><div className="ak-hero-actions"><button onClick={()=>{setShowForm(v=>!v);setError("")}}><Plus size={17}/> Tambah data</button><button className="ak-ghost" onClick={()=>void load()}><RefreshCw size={16}/> Segarkan</button></div></div><div className="ak-hero-art"><div className="ak-book-stack"><BookOpen size={68}/><span>ACADEMIC HUB</span></div></div></div>
  <div className="ak-stats">{stats.map((s,i)=><div className={`ak-stat ${s.color}`} key={s.label} style={{animationDelay:`${i*80}ms`}}><div className="ak-stat-icon"><s.icon size={21}/></div><div><small>{s.label}</small><strong>{s.value}</strong></div></div>)}</div>
  {overdue>0&&<div className="ak-alert"><BellRing size={19}/><div><strong>{overdue} data melewati tenggat</strong><p>Periksa daftar administrasi dan agenda yang belum selesai.</p></div></div>}
  {error&&<div className="ak-message error">Gagal memproses data: {error}. Pastikan tabel akademik tersedia dan izin akses sesuai.</div>}{notice&&<div className="ak-message success"><CheckCircle2 size={17}/>{notice}</div>}
  {showForm&&canManage&&<form className="ak-form" onSubmit={add}>
   <div className="ak-form-head"><div><span className="ak-eyebrow">FORMULIR BARU</span><h2>Tambah agenda akademik</h2></div><button type="button" className="ak-close" onClick={()=>setShowForm(false)}>Tutup</button></div>
   <div className="ak-form-grid">
    <label>Jenis data<select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select></label>
    <label>Judul / nama kegiatan<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="Contoh: Modul ajar Bahasa Indonesia"/></label>
    <label>Guru / penanggung jawab<input value={userRole==="guru"?currentUser?.full_name??"":form.owner} readOnly={userRole==="guru"} onChange={e=>setForm({...form,owner:e.target.value})} placeholder="Nama guru atau penanggung jawab"/></label>
    <label>Kelas<select value={form.class_id} onChange={e=>setForm({...form,class_id:e.target.value,subject:""})}>
     <option value="">{userRole==="guru"?"Pengumuman umum":"Semua kelas / umum"}</option>
     {classOptions.map(option=><option key={option.id} value={option.id}>{option.name}</option>)}
    </select></label>
    {userRole==="guru"?<label>Mata pelajaran<select value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})}>
     <option value="">Pilih mata pelajaran</option>
     {[...new Set(teacherAssignments.filter(item=>item.class_id===form.class_id).map(item=>item.subject))].map(subject=><option key={subject}>{subject}</option>)}
    </select></label>:<label>Mata pelajaran<input value={form.subject} onChange={e=>setForm({...form,subject:e.target.value})} placeholder="Opsional"/></label>}
    <label>Tenggat / tanggal<input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label>
    <label>Status<select value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option>Belum selesai</option><option>Dalam proses</option><option>Selesai</option></select></label>
    <label>Tautan LMS / e-learning<input type="url" value={form.link_url} onChange={e=>setForm({...form,link_url:e.target.value})} placeholder="https://..."/></label>
    <label className="wide">Keterangan<textarea rows={3} value={form.detail} onChange={e=>setForm({...form,detail:e.target.value})} placeholder="Kelas, mata pelajaran, instruksi atau catatan"/></label>
   </div>
   <button className="ak-submit" disabled={saving}>{saving?"Menyimpan…":"Simpan data akademik"}</button>
  </form>}
  <section className="ak-content"><div className="ak-section-head"><div><span className="ak-eyebrow">RUANG KERJA SEKOLAH</span><h2>{isStudent?"Informasi Pembelajaran":"Agenda dan administrasi"}</h2></div><div className="ak-search"><Search size={17}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari judul, guru, atau keterangan…"/></div></div>
  <div className="ak-tabs">{["Semua",...availableCategories].map(c=><button key={c} className={tab===c?"active":""} onClick={()=>setTab(c)}>{c}</button>)}</div>
  <div className="ak-list-tools"><span>{filtered.length} data ditampilkan</span><select value={filter} onChange={e=>setFilter(e.target.value)}><option>Semua</option><option>Belum selesai</option><option>Dalam proses</option><option>Selesai</option></select></div>
  {loading?<div className="ak-empty">Memuat data akademik…</div>:filtered.length===0?<div className="ak-empty"><div className="ak-empty-icon"><BookOpen size={30}/></div><h3>Belum ada data yang cocok</h3><p>{isStudent?"Belum ada agenda pembelajaran untuk ditampilkan.":"Tambahkan jadwal, perangkat ajar, administrasi, tugas, atau tautan LMS."}</p>{canManage&&<button onClick={()=>setShowForm(true)}>Tambah data pertama</button>}</div>:<div className="ak-records">{filtered.map((r,i)=><article className="ak-record" key={r.id} style={{animationDelay:`${Math.min(i,10)*35}ms`}}><div className="ak-record-icon"><FileText size={21}/></div><div className="ak-record-main"><div className="ak-record-tags"><span>{r.category}</span><span className={`ak-status ${r.status==="Selesai"?"done":r.status==="Dalam proses"?"progress":"pending"}`}>{r.status}</span></div><h3>{r.title}</h3>{r.detail&&<p>{r.detail}</p>}<div className="ak-meta">{r.owner&&<span>Penanggung jawab: {r.owner}</span>}{r.due_date&&<span><CalendarDays size={13}/> Tenggat: {fmt(r.due_date)}</span>}</div></div><div className="ak-record-actions">{r.link_url&&<a href={r.link_url} target="_blank" rel="noreferrer" title="Buka tautan"><ExternalLink size={17}/></a>}{canUpdateRecord(r)&&<button onClick={()=>void updateStatus(r)} title="Ubah status"><CheckCircle2 size={17}/></button>}{canDelete&&<button onClick={()=>void remove(r)} title="Hapus"><Trash2 size={17}/></button>}</div></article>)}</div>}
  </section><footer className="ak-footer"><Megaphone size={16}/> Gunakan tautan LMS resmi sekolah dan pastikan data siswa/guru hanya dapat diakses oleh pengguna berwenang.</footer>
 </div>
}
