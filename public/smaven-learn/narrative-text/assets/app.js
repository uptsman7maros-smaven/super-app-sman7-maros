(function () {
  "use strict";
  const D = window.NARRATIVE_DATA;
  const $ = (selector, root = document) => root.querySelector(selector);
  const main = $("#main-content");
  let fontSize = 16;
  let factIndex = 0;

  const esc = value => String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[char]));
  const pageFromHash = () => location.hash.replace("#/", "") || "beranda";
  const go = page => { location.hash = "/" + page; };

  function toast(message) {
    const el = $("#toast");
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  function renderNav() {
    $("#top-nav").innerHTML = D.menu.map(([id, label]) =>
      `<button type="button" data-route="${id}" class="${pageFromHash() === id ? "active" : ""}">${esc(label)}</button>`
    ).join("");
  }

  function renderHome() {
    return `<section class="hero">
      <div class="hero-copy">
        <span class="eyebrow">Bahasa Inggris • SMA • Kelas XII</span>
        <h1>${esc(D.meta.title)}: <span>Tell It Meaningfully</span></h1>
        <p>Pelajari cara membangun cerita yang memikat, mengenali konflik, lalu menyusun ending yang bermakna melalui pengalaman interaktif.</p>
        <div class="hero-actions"><button class="button" data-go="materi">Mulai belajar</button><button class="button secondary" data-go="eksplorasi">Jelajahi alur cerita</button></div>
      </div>
      <div class="story-bubble" aria-hidden="true"><div class="book">📖</div></div>
    </section>
    <div class="fact-strip"><strong>Tahukah kamu?</strong><span id="fact">${esc(D.facts[0])}</span></div>
    <div class="section-title"><h2>Tujuan pembelajaran</h2><p>Setelah menyelesaikan modul ini, kamu diharapkan mampu:</p></div>
    <div class="goal-grid">${D.objectives.map(item => `<div class="goal">${esc(item)}</div>`).join("")}</div>
    <div class="section-title"><h2>Jelajahi modul</h2></div>
    <div class="menu-cards">${D.menu.slice(1).map((item, index) => `<button class="menu-card" data-go="${item[0]}"><span class="num">${index + 1}</span><strong>${esc(item[1])}</strong><small>Buka aktivitas pembelajaran</small></button>`).join("")}</div>`;
  }

  function renderMaterials() {
    return `<div class="section-title"><h2>Materi inti</h2><p>Pilih setiap tab untuk mempelajari satu konsep.</p></div>
      <div class="tabs" role="tablist">${D.materials.map((item, i) => `<button class="tab ${i === 0 ? "active" : ""}" data-material="${i}" role="tab">${i + 1}. ${esc(item.title)}</button>`).join("")}</div>
      <section class="panel" id="material-panel"></section>`;
  }

  function showMaterial(index) {
    const m = D.materials[index];
    document.querySelectorAll("[data-material]").forEach((el, i) => el.classList.toggle("active", i === index));
    $("#material-panel").innerHTML = `<h2>${esc(m.title)}</h2><p class="lead">${esc(m.lead)}</p>
      ${m.points ? `<ul class="material-list">${m.points.map(p => `<li>${esc(p)}</li>`).join("")}</ul>` : ""}
      ${m.example ? `<div class="callout"><strong>Contoh:</strong> ${esc(m.example)}</div>` : ""}
      ${m.table ? `<div style="overflow:auto">${table(m.table)}</div>` : ""}
      ${m.equation ? `<div class="formula">${esc(m.equation)}</div>` : ""}
      ${m.callout ? `<div class="callout">${esc(m.callout)}</div>` : ""}
      <details class="check"><summary>Cek pemahaman</summary><p><strong>Pertanyaan:</strong> ${esc(m.check)}<br><br><strong>Jawaban:</strong> ${esc(m.answer)}</p></details>`;
  }

  function table(rows) {
    return `<table>${rows.map((row, i) => `<tr>${row.map(cell => `<${i ? "td" : "th"}>${esc(cell)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</table>`;
  }

  function renderExplore() {
    const e = D.exploration;
    return `<div class="section-title"><h2>${esc(e.title)}</h2><p>${esc(e.intro)}</p></div>
      <div class="walk-controls"><button class="button" id="step-back">◀ Sebelumnya</button><button class="button" id="step-play">▶ Putar Alur</button><button class="button" id="step-next">Berikutnya ▶</button></div>
      <div class="explore-layout"><div class="story-node">${e.nodes.map((node, i) => `<button data-node="${i}" class="${i === 0 ? "active" : ""}">${esc(node.label)}</button>`).join("")}</div>
      <section class="panel explore-detail" id="explore-detail"><div><div style="font-size:4rem">✦</div><h2>${esc(e.nodes[0].title)}</h2><p>${esc(e.nodes[0].text)}</p></div></section></div>`;
  }

  let exploreStep = 0;
  let stepTimer = null;
  function showNode(index) {
    const nodes = D.exploration.nodes;
    exploreStep = Math.max(0, Math.min(nodes.length - 1, index));
    document.querySelectorAll("[data-node]").forEach((el, i) => el.classList.toggle("active", i === exploreStep));
    const node = nodes[exploreStep];
    const detail = $("#explore-detail");
    if (detail) detail.innerHTML = `<div><div style="font-size:4rem">${"✦▣◆○★"[exploreStep]}</div><h2>${esc(node.title)}</h2><p>${esc(node.text)}</p></div>`;
  }

  function renderSimulation() {
    return `<div class="section-title"><h2>Lab Mini Cerita</h2><p>Ubah nilai, amati dampaknya, lalu gunakan hasilnya untuk menulis alur.</p></div>
      <div class="simulation-grid">
      ${D.simulations.map(sim => `<section class="simulation-card" data-simulation="${sim.id}">
        <h3>${esc(sim.name)}</h3><div class="slider-row"><input id="${sim.id}-slider" type="range" min="${sim.min}" max="${sim.max}" value="${sim.value}" aria-label="${esc(sim.name)}"><strong id="${sim.id}-value">${sim.value}${esc(sim.unit)}</strong></div>
        <div style="display:flex;justify-content:space-between;color:var(--muted);font-size:.75rem"><span>${esc(sim.labels[0])}</span><span>${esc(sim.labels[1])}</span></div>
        <div class="meter"><span id="${sim.id}-bar"></span></div><div class="simulation-result" id="${sim.id}-result"></div>
      </section>`).join("")}</div>`;
  }

  function updateSimulation(id) {
    const sim = D.simulations.find(item => item.id === id);
    const value = Number($(`#${id}-slider`).value);
    $(`#${id}-value`).textContent = value + sim.unit;
    $(`#${id}-bar`).style.width = `${(value - sim.min) / (sim.max - sim.min) * 100}%`;
    let text;
    if (id === "tension") {
      text = value < 4 ? "Ketegangan terlalu rendah. Tambahkan hambatan atau tenggat waktu agar konflik terasa penting."
        : value < 8 ? "Ketegangan seimbang. Konflik cukup jelas dan pembaca masih memiliki ruang untuk mengikuti perkembangan."
        : "Ketegangan tinggi dan padat. Pastikan tokoh diberi jeda emosional agar klimaks tidak terasa terburu-buru.";
    } else {
      text = value < 3 ? "Alur pelan. Gunakan detail latar atau pikiran tokoh untuk memperdalam suasana."
        : value < 5 ? "Tempo seimbang. Peristiwa berkembang dengan jelas dan mudah diikuti."
        : "Alur cepat. Perhatikan alasan, konsekuensi, dan transisi antarperistiwa agar tidak terkesan melompat.";
    }
    $(`#${id}-result`).textContent = text;
  }

  function renderActivities() {
    return `<div class="section-title"><h2>Susun Struktur Cerita</h2><p>Bacalah setiap kalimat dan pilih tahap yang paling tepat.</p></div>
      <div class="activity-layout"><section class="panel">${D.activities.map((item, i) => `<div class="activity-sentence"><span>${i + 1}. ${esc(item.text)}</span><select data-answer="${item.type}" aria-label="Tahap kalimat ${i + 1}"><option value="">Pilih tahap</option>${["Orientation","Complication","Rising Action","Climax","Resolution"].map(v => `<option>${v}</option>`).join("")}</select></div>`).join("")}<button class="button" id="check-activity">Periksa jawaban</button></section>
      <aside class="panel"><h3>Catatan analisismu</h3><textarea id="analysis-note" style="width:100%;min-height:150px;padding:10px;border:1px solid var(--line);border-radius:9px" placeholder="Mengapa urutan struktur itu masuk akal?"></textarea></aside></div>`;
  }

  function renderGames() {
    return `<div class="section-title"><h2>Pusat Permainan</h2><p>Pilih satu tantangan untuk menguji pemahamanmu.</p></div>
      <div class="tabs"><button class="tab active" data-game="order">1. Urutkan</button><button class="tab" data-game="match">2. Pasangkan</button><button class="tab" data-game="truefalse">3. Benar-Salah</button></div><section class="game-wrap" id="game-panel"></section>`;
  }

  function showOrder() {
    $("#game-panel").innerHTML = `<h3>Urutkan tahapan Narrative Text</h3><div class="game-grid" id="order-cards">${shuffle(["Resolution","Orientation","Complication","Climax","Coda","Rising Action"]).map((item, i) => `<button class="game-option" data-order="${esc(item)}">${i + 1}. ${esc(item)}</button>`).join("")}</div><p class="simulation-result" id="order-result">Klik kartu menurut urutan yang benar.</p><button class="button" id="reset-order">Mulai ulang</button>`;
    window.orderChoice = [];
  }

  function shuffle(items) {
    return [...items].sort(() => Math.random() - .5);
  }

  function showMatch() {
    const pairs = [["Orientation","Pengenalan tokoh dan latar"],["Climax","Titik konflik paling tegang"],["Resolution","Penyelesaian masalah"],["Fable","Cerita hewan bermoral"],["Reorientation","Penutup reflektif"],["Past tense","Menunjukkan peristiwa lampau"]];
    $("#game-panel").innerHTML = `<h3>Pasangkan istilah dan pengertian</h3><div class="simulation-grid"><div>${pairs.map((p,i)=>`<button class="game-option" style="width:100%;margin-bottom:8px" data-term="${esc(p[0])}" data-pair="${i}">${esc(p[0])}</button>`).join("")}</div><div>${shuffle(pairs.map((p,i)=>[p[1],i])).map(p=>`<button class="game-option" style="width:100%;margin-bottom:8px" data-meaning="${p[1]}">${esc(p[0])}</button>`).join("")}</div></div><p class="simulation-result" id="match-result">Pilih satu istilah lalu pilih artinya.</p>`;
  }

  let tfIndex = 0, tfScore = 0, tfTimer, tfSeconds = 60;
  const tfQuestions = [
    ["Narrative text usually uses past tense.", true],
    ["Resolution always has a happy ending.", false],
    ["Orientation introduces setting.", true],
    ["Complication solves the conflict.", false],
    ["Reorientation is mandatory.", false],
    ["Fables may use animal characters.", true]
  ];
  function showTrueFalse() {
    tfIndex = 0; tfScore = 0; tfSeconds = 60;
    clearInterval(tfTimer);
    $("#game-panel").innerHTML = `<h3>Benar atau Salah</h3><div class="timer">Waktu: <span id="tf-time">60</span>s</div><div id="tf-question"></div>`;
    tfTimer = setInterval(() => { tfSeconds--; $("#tf-time").textContent = tfSeconds; if (tfSeconds <= 0) finishTF(); }, 1000);
    nextTF();
  }
  function nextTF() {
    if (tfIndex >= tfQuestions.length) return finishTF();
    $("#tf-question").innerHTML = `<p style="font-size:1.15rem;font-weight:700">${esc(tfQuestions[tfIndex][0])}</p><button class="button" data-tf="true">Benar</button> <button class="button secondary" style="color:var(--ink);background:#fff;border-color:var(--line)" data-tf="false">Salah</button>`;
  }
  function finishTF() {
    clearInterval(tfTimer);
    $("#tf-question").innerHTML = `<h3>Selesai!</h3><p>Skor kamu: ${tfScore}/${tfQuestions.length}</p>`;
  }

  let quizState = null;
  function renderQuiz() {
    return `<div class="section-title"><h2>Kuis Narrative Text</h2><p>Pilih jumlah soal, kerjakan dengan fokus, lalu telaah pembahasan.</p></div><div class="panel quiz" id="quiz-panel"></div>`;
  }

  function quizStart(count) {
    const questions = shuffle(D.quiz).slice(0, count).map(q => ({...q, options: q.options.map((text, i) => ({text,i})), answered:false}));
    quizState = {questions,index:0,answers:[],started:Date.now()};
    showQuizQuestion();
  }

  function showQuizMenu() {
    $("#quiz-panel").innerHTML = `<div class="quiz-bank"><label>Jumlah soal:</label><select id="quiz-count">${[10,15,20,25].filter(n => n <= D.quiz.length).map(n => `<option>${n}</option>`).join("")}</select><button class="button" id="start-quiz">Mulai Kuis</button></div><p>Soal dan urutan opsi akan diacak. Waktu disimpan pada akhir pengerjaan.</p>`;
  }

  function showQuizQuestion() {
    const q = quizState.questions[quizState.index];
    if (!q) return showQuizResult();
    const options = shuffle(q.options);
    $("#quiz-panel").innerHTML = `<div class="progress"><span style="width:${quizState.index / quizState.questions.length * 100}%"></span></div>
      <strong>Soal ${quizState.index + 1} dari ${quizState.questions.length}</strong><h3>${esc(q.q)}</h3><div class="quiz-options">${options.map((o,i) => `<button class="quiz-option" data-option="${o.i}">${String.fromCharCode(65+i)}. ${esc(o.text)}</button>`).join("")}</div><div id="quiz-feedback"></div>`;
  }

  function answerQuiz(optionIndex) {
    const q = quizState.questions[quizState.index];
    if (q.answered) return;
    q.answered = true;
    const correct = optionIndex === q.answer;
    quizState.answers.push({question:q.q,chosen:optionIndex,correctAnswer:q.answer,why:q.why,correct,options:q.options});
    document.querySelectorAll("[data-option]").forEach(button => {
      const value = Number(button.dataset.option);
      if (value === q.answer) button.classList.add("correct");
      if (value === optionIndex && !correct) button.classList.add("wrong");
      button.disabled = true;
    });
    $("#quiz-feedback").innerHTML = `<div class="quiz-explanation"><strong>${correct ? "Benar!" : "Belum tepat."}</strong> ${esc(q.why)}<br><button class="button" style="margin-top:12px" id="next-question">${quizState.index === quizState.questions.length - 1 ? "Lihat hasil" : "Soal berikutnya"}</button></div>`;
  }

  function showQuizResult() {
    const correct = quizState.answers.filter(a => a.correct).length;
    const elapsed = Math.round((Date.now() - quizState.started) / 1000);
    $("#quiz-panel").innerHTML = `<div style="text-align:center"><div style="font-size:4rem">🏆</div><h2>${correct} dari ${quizState.answers.length} benar</h2><p>Nilai: ${Math.round(correct / quizState.answers.length * 100)} • Waktu: ${elapsed} detik</p><button class="button" id="restart-quiz">Ulangi kuis</button></div><div class="section-title"><h2>Ulasan jawaban</h2></div>${quizState.answers.map((a,i) => {
      const chosen = a.options.find(o => o.i === a.chosen)?.text || "-";
      const right = a.options.find(o => o.i === a.correctAnswer)?.text || "-";
      return `<div class="quiz-review"><strong>${i + 1}. ${esc(a.question)}</strong><p>Jawabanmu: ${esc(chosen)} • ${a.correct ? "Benar" : `Kunci: ${esc(right)}`}</p><p>${esc(a.why)}</p></div>`;
    }).join("")}`;
  }

  function renderGlossary() {
    return `<div class="section-title"><h2>Glosarium</h2><p>Temukan istilah penting Narrative Text.</p></div><input class="search-box" id="glossary-search" placeholder="Cari istilah atau arti..." aria-label="Cari glosarium"><div class="glossary-grid" id="glossary-list"></div>`;
  }
  function showGlossary(query = "") {
    const q = query.toLowerCase();
    const entries = D.glossary.filter(([term, meaning]) => `${term} ${meaning}`.toLowerCase().includes(q));
    $("#glossary-list").innerHTML = entries.length ? entries.map(([term,meaning]) => `<article class="glossary-card"><strong>${esc(term)}</strong><p>${esc(meaning)}</p></article>`).join("") : `<p>Tidak ada istilah yang cocok.</p>`;
  }

  function renderTeacher() {
    const t = D.teacher;
    return `<div class="teacher-grid"><section class="panel"><h2>Identitas pembelajaran</h2><div class="identity-list">${t.identity.map(i => `<div>${esc(i)}</div>`).join("")}</div><p><strong>Catatan CP:</strong> Sesuaikan tujuan pembelajaran dengan dokumen Capaian Pembelajaran resmi yang digunakan satuan pendidikan.</p></section>
      <section class="panel"><h2>LKPD Praktikum Singkat</h2><p><strong>Tujuan:</strong> mengidentifikasi dan menyusun struktur sebuah narrative.</p><p><strong>Alat:</strong> teks cerita, lembar kerja, perangkat interaktif.</p><ol><li>Baca teks secara berkelompok.</li><li>Temukan orientasi, komplikasi, klimaks, dan resolusi.</li><li>Berikan bukti kalimat pada setiap tahap.</li><li>Tulis pesan moral dan jelaskan relevansinya.</li></ol></section></div>
      <section class="panel" style="margin-top:16px"><h2>Alur pembelajaran per pertemuan</h2><div style="overflow:auto">${table([["Tahap","Kegiatan","Fitur media","Waktu"], ...t.flow])}</div></section>
      <section class="panel" style="margin-top:16px"><h2>Bank soal guru</h2><button class="button print-button" id="print-guide">Cetak halaman guru</button><p>Tampilkan kunci ringkas untuk evaluasi kelas atau cetak lembar penilaian.</p><ol>${D.quiz.map(q => `<li>${esc(q.q)} <strong>Kunci: ${String.fromCharCode(65 + q.answer)}</strong></li>`).join("")}</ol></section>`;
  }

  function render() {
    const page = pageFromHash();
    renderNav();
    const renderers = {beranda:renderHome,materi:renderMaterials,eksplorasi:renderExplore,simulasi:renderSimulation,aktivitas:renderActivities,permainan:renderGames,kuis:renderQuiz,glosarium:renderGlossary,guru:renderTeacher};
    main.innerHTML = (renderers[page] || renderers.beranda)();
    if (page === "materi") showMaterial(0);
    if (page === "simulasi") D.simulations.forEach(s => updateSimulation(s.id));
    if (page === "permainan") showOrder();
    if (page === "kuis") showQuizMenu();
    if (page === "glosarium") showGlossary();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  document.addEventListener("click", event => {
    const route = event.target.closest("[data-route],[data-go]");
    if (route) go(route.dataset.route || route.dataset.go);
    const material = event.target.closest("[data-material]");
    if (material) showMaterial(Number(material.dataset.material));
    const node = event.target.closest("[data-node]");
    if (node) showNode(Number(node.dataset.node));

    if (event.target.closest("#step-next")) showNode(exploreStep + 1);
    if (event.target.closest("#step-back")) showNode(exploreStep - 1);
    if (event.target.closest("#step-play")) {
      clearInterval(stepTimer);
      showNode(0);
      stepTimer = setInterval(() => { if (exploreStep >= D.exploration.nodes.length - 1) clearInterval(stepTimer); else showNode(exploreStep + 1); }, 1300);
    }
    if (event.target.closest("#check-activity")) {
      let score = 0;
      document.querySelectorAll("[data-answer]").forEach(select => { if (select.value === select.dataset.answer) { score++; select.style.borderColor = "#27a269"; } else select.style.borderColor = "#dd6259"; });
      toast(`Hasil: ${score} dari ${D.activities.length} jawaban tepat`);
    }
    const game = event.target.closest("[data-game]");
    if (game) { document.querySelectorAll("[data-game]").forEach(b => b.classList.toggle("active", b === game)); if (game.dataset.game === "order") showOrder(); if (game.dataset.game === "match") showMatch(); if (game.dataset.game === "truefalse") showTrueFalse(); }
    const order = event.target.closest("[data-order]");
    if (order && pageFromHash() === "permainan") {
      const correctOrder = ["Orientation","Complication","Rising Action","Climax","Resolution","Coda"];
      if (!window.orderChoice) window.orderChoice = [];
      if (window.orderChoice.includes(order.dataset.order)) return;
      window.orderChoice.push(order.dataset.order);
      order.classList.add("selected");
      if (window.orderChoice.length === correctOrder.length) {
        const ok = window.orderChoice.every((value,i) => value === correctOrder[i]);
        $("#order-result").textContent = ok ? "Sempurna! Urutan struktur ceritamu tepat." : "Belum tepat. Ingat: orientasi, komplikasi, rising action, klimaks, resolusi, lalu coda opsional.";
      }
    }
    if (event.target.closest("#reset-order")) showOrder();
    const term = event.target.closest("[data-term]");
    if (term) { document.querySelectorAll("[data-term]").forEach(el => el.classList.remove("selected")); term.classList.add("selected"); window.selectedTerm = term.dataset.pair; }
    const meaning = event.target.closest("[data-meaning]");
    if (meaning && window.selectedTerm !== undefined) {
      const ok = String(window.selectedTerm) === meaning.dataset.meaning;
      $("#match-result").textContent = ok ? "Pasangan tepat!" : "Belum tepat, coba pasangan lain.";
      meaning.classList.add(ok ? "good" : "bad");
      if (ok) document.querySelector(`[data-pair="${window.selectedTerm}"]`)?.classList.add("good");
      window.selectedTerm = undefined;
    }
    const tf = event.target.closest("[data-tf]");
    if (tf) {
      const answer = tf.dataset.tf === "true";
      if (answer === tfQuestions[tfIndex][1]) tfScore++;
      tfIndex++;
      nextTF();
    }
    if (event.target.closest("#start-quiz")) quizStart(Number($("#quiz-count").value));
    const option = event.target.closest("[data-option]");
    if (option) answerQuiz(Number(option.dataset.option));
    if (event.target.closest("#next-question")) { quizState.index++; showQuizQuestion(); }
    if (event.target.closest("#restart-quiz")) showQuizMenu();
    if (event.target.closest("#print-guide")) window.print();
  });

  document.addEventListener("input", event => {
    if (event.target.matches('input[type="range"]')) updateSimulation(event.target.id.replace("-slider",""));
    if (event.target.id === "glossary-search") showGlossary(event.target.value);
  });
  window.addEventListener("hashchange", render);

  $("#font-up").addEventListener("click", () => { fontSize = Math.min(20, fontSize + 1); document.documentElement.style.fontSize = fontSize + "px"; });
  $("#font-down").addEventListener("click", () => { fontSize = Math.max(13, fontSize - 1); document.documentElement.style.fontSize = fontSize + "px"; });
  $("#fullscreen").addEventListener("click", async () => {
    try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { toast("Layar penuh tidak didukung browser ini."); }
  });
  document.querySelector('[data-route="beranda"]').addEventListener("click", () => go("beranda"));
  setInterval(() => {
    if (pageFromHash() !== "beranda") return;
    factIndex = (factIndex + 1) % D.facts.length;
    const fact = $("#fact"); if (fact) fact.textContent = D.facts[factIndex];
  }, 5000);
  render();
})();
