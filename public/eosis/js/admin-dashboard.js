import { adminApi } from './admin-api.js';
import { escapeHtml } from './utils.js';
let voteChart = null, doughnut = null;
export let latestStats = null, latestResults = [];

export async function loadDashboard() {
  const [stats, results] = await Promise.all([adminApi.stats(), adminApi.results()]);
  latestStats = stats; latestResults = Array.isArray(results) ? results : [];
  document.getElementById('totalSiswa').textContent = stats.total_siswa ?? 0;
  document.getElementById('sudahMemilih').textContent = stats.sudah_memilih ?? 0;
  document.getElementById('belumMemilih').textContent = stats.belum_memilih ?? 0;
  document.getElementById('totalSuara').textContent = stats.total_suara ?? 0;
  renderResults(latestResults, Number(stats.total_suara || 0));
  renderCharts(latestResults);
  return { stats, results: latestResults };
}

function renderResults(results, total) {
  const list = document.getElementById('resultsList');
  if (!results.length) { list.innerHTML = '<div class="empty">Belum ada kandidat.</div>'; return; }
  const max = Math.max(...results.map(x => Number(x.total_suara || 0)), 1);
  list.innerHTML = results.map(item => {
    const suara = Number(item.total_suara || 0);
    const pct = total ? ((suara / total) * 100).toFixed(1) : '0.0';
    return `<div class="result"><div class="result-head"><div><strong>No. ${item.no_urut} — ${escapeHtml(item.nama_ketua)} & ${escapeHtml(item.nama_wakil)}</strong><div class="muted result-meta">${escapeHtml(item.slogan || '')}</div></div><strong>${suara} suara</strong></div><div class="bar-wrap"><div class="bar" style="width:${(suara/max)*100}%"></div></div><small>${pct}% dari total suara</small></div>`;
  }).join('');
}

function renderCharts(results) {
  const labels = results.map(x => `No. ${x.no_urut}`);
  const values = results.map(x => Number(x.total_suara || 0));
  if (typeof window.Chart !== 'function') {
    const chartPanels=document.querySelectorAll('#voteChart,#voteDoughnut');
    chartPanels.forEach(canvas=>{canvas.replaceWith(Object.assign(document.createElement('div'),{className:'notice',textContent:'Grafik tidak dapat dimuat. Data tabel hasil tetap tersedia.'}));});
    return;
  }
  if (voteChart) voteChart.destroy();
  if (doughnut) doughnut.destroy();
  voteChart = new Chart(document.getElementById('voteChart'), { type:'bar', data:{labels, datasets:[{label:'Suara',data:values}]}, options:{responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true, ticks:{precision:0}}}} });
  doughnut = new Chart(document.getElementById('voteDoughnut'), { type:'doughnut', data:{labels:results.map(x=>`${x.nama_ketua} & ${x.nama_wakil}`),datasets:[{data:values}]}, options:{responsive:true, plugins:{legend:{position:'bottom'}}} });
}

export function updateStatusBadge(active) {
  const badge = document.getElementById('statusBadge');
  badge.textContent = active ? 'PEMILIHAN DIBUKA' : 'PEMILIHAN DITUTUP';
  badge.className = `status-pill ${active ? 'open' : 'closed'}`;
  const btn = document.getElementById('toggleVotingBtn');
  btn.textContent = active ? '🔒 Tutup Pemilihan' : '🔓 Buka Pemilihan';
  btn.className = `btn ${active ? 'danger' : 'primary'}`;
}
