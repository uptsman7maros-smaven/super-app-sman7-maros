import { adminRpc } from './admin-api.js';
import { loadBranding } from './branding.js';
const form=document.getElementById('loginForm'), message=document.getElementById('message'), btn=document.getElementById('loginBtn');
let settings=null;
(async()=>{try{settings=await loadBranding();if(!settings.pemilihan_aktif){document.getElementById('closedNotice').textContent='Pemilihan sedang ditutup oleh admin. Login pemilih tidak tersedia.';document.getElementById('closedNotice').classList.remove('hidden');btn.disabled=true;}}catch(e){message.textContent=`Tidak dapat memuat status pemilihan: ${e.message||e}`;}})();
form.addEventListener('submit',async e=>{
  e.preventDefault();
  if(settings&&!settings.pemilihan_aktif)return;
  message.textContent='Memeriksa data...'; btn.disabled=true;
  try {
    const {data,error}=await adminRpc('eosis_current_student');
    if(error){message.textContent=error.message||'Akun siswa tidak dapat diverifikasi.';btn.disabled=false;return;}
    const student=Array.isArray(data)?data[0]:data;
    if(!student||!student.nisn){message.textContent='Data pemilih tidak valid. Silakan coba kembali.';btn.disabled=false;return;}
    sessionStorage.setItem('eosis_student',JSON.stringify(student));
    window.location.href='voting.html';
  } catch(error) {
    message.textContent=error instanceof Error?error.message:String(error);
    btn.disabled=false;
  }
});
