import { adminRpc } from './admin-api.js';
import { loadBranding } from './branding.js';
import { escapeHtml } from './utils.js';
let student=null;
const list=document.getElementById('candidateList'), modal=document.getElementById('confirmModal'), selected=document.getElementById('selectedCandidate'), msg=document.getElementById('voteMessage');
(async()=>{try{const {data:studentData,error:studentError}=await adminRpc('eosis_current_student');if(studentError)throw studentError;student=Array.isArray(studentData)?studentData[0]:studentData;if(!student||!student.nisn)throw new Error('Akun siswa tidak valid.');sessionStorage.setItem('eosis_student',JSON.stringify(student));const s=await loadBranding();if(!s.pemilihan_aktif){list.innerHTML='<div class="notice">Pemilihan telah ditutup oleh admin.</div>';return;}document.getElementById('welcomeName').textContent=`Halo, ${student.nama||'Pemilih'}!`;document.getElementById('studentClass').textContent=student.nama_kelas?`Kelas ${student.nama_kelas}`:'';if(student.status_memilih){document.getElementById('alreadyBox').textContent='Akun ini sudah menggunakan hak suara. Anda tidak dapat memilih lagi.';document.getElementById('alreadyBox').classList.remove('hidden');}await loadCandidates();}catch(e){sessionStorage.removeItem('eosis_student');list.innerHTML=`<p class="message">${escapeHtml(e.message||e)}</p><a class="btn secondary" href="login.html">Kembali ke verifikasi akun</a>`;}})();
document.getElementById('logoutBtn').onclick=()=>{sessionStorage.removeItem('eosis_student');location.href='index.html';};
async function loadCandidates(){
  const {data,error}=await adminRpc('get_candidates');if(error)throw error;
  list.innerHTML='';
  const candidates=Array.isArray(data)?data:[];
  candidates.forEach(c=>{
    const card=document.createElement('article');card.className='candidate';
    const photo=document.createElement('img');
    photo.alt=`Foto kandidat nomor ${c.no_urut}`;
    photo.src=typeof c.foto_url==='string'&&/^https?:\/\//i.test(c.foto_url)?c.foto_url:`https://placehold.co/600x600?text=No.${c.no_urut}`;
    const number=document.createElement('div');number.className='number';number.textContent=`NOMOR URUT ${c.no_urut}`;
    const info=document.createElement('div');
    const title=document.createElement('h3');title.textContent=`${c.nama_ketua||''} & ${c.nama_wakil||''}`;
    const slogan=document.createElement('p');slogan.textContent=c.slogan||'';
    const details=document.createElement('details');const summary=document.createElement('summary');const body=document.createElement('div');
    summary.textContent='Lihat visi & misi';body.className='candidate-detail';
    const vision=document.createElement('b');vision.textContent='Visi';const visionText=document.createElement('p');visionText.textContent=c.visi||'-';
    const mission=document.createElement('b');mission.textContent='Misi';const missionText=document.createElement('p');missionText.textContent=c.misi||'-';
    body.append(vision,visionText,mission,missionText);details.append(summary,body);info.append(title,slogan,details);
    const button=document.createElement('button');button.className='btn primary full';button.textContent='Pilih Kandidat';button.disabled=Boolean(student.status_memilih);
    button.onclick=()=>openConfirm(c);card.append(photo,number,info,button);list.append(card);
  });
  if(!candidates.length)list.innerHTML='<div class="empty">Belum ada kandidat yang terdaftar.</div>';
}
function openConfirm(c){selected.dataset.id=c.id;selected.innerHTML=`Nomor ${c.no_urut}<br>${escapeHtml(c.nama_ketua)} & ${escapeHtml(c.nama_wakil)}`;msg.textContent='';modal.classList.remove('hidden');}
function closeModal(){modal.classList.add('hidden');msg.textContent='';}document.getElementById('closeModal').onclick=closeModal;document.getElementById('cancelVote').onclick=closeModal;
document.getElementById('confirmVote').onclick=async()=>{
  const confirmButton=document.getElementById('confirmVote');
  msg.textContent='Mengirim suara...';confirmButton.disabled=true;
  const candidateId=Number(selected.dataset.id);
  if(!Number.isFinite(candidateId)||candidateId<=0){msg.textContent='Kandidat tidak valid.';confirmButton.disabled=false;return;}
  try {
    const {error}=await adminRpc('eosis_cast_vote',{p_kandidat_id:candidateId});
    if(error){msg.textContent=error.message||'Suara gagal dikirim. Periksa koneksi database.';confirmButton.disabled=false;return;}
    student.status_memilih=true;
    sessionStorage.setItem('eosis_student',JSON.stringify(student));
    location.href='sukses.html';
  } catch(error) {
    msg.textContent=error instanceof Error?error.message:String(error);
    confirmButton.disabled=false;
  }
};
