window.NARRATIVE_DATA = {
  meta: {
    title: "Narrative Text",
    subtitle: "Kisah, Makna, dan Struktur Cerita dalam Bahasa Inggris",
    school: "SMAN 7 Maros",
    grade: "Kelas XII",
    phase: "Fase F",
    subject: "Bahasa Inggris"
  },
  facts: [
    "Cerita naratif paling kuat mengajak pembaca merasakan perubahan tokoh, bukan sekadar mengetahui peristiwa.",
    "Dalam Narrative Text, 'showing' sering lebih efektif daripada sekadar 'telling'.",
    "Tenses dominan pada narasi adalah past tense.",
    "Resolution tidak selalu bahagia; yang penting ada penyelesaian konflik."
  ],
  menu: [
    ["beranda","Beranda"],["materi","Materi"],["eksplorasi","Eksplorasi"],
    ["simulasi","Simulasi"],["aktivitas","Aktivitas"],["permainan","Permainan"],
    ["kuis","Kuis"],["glosarium","Glosarium"],["guru","Panduan Guru"]
  ],
  objectives: [
    "Mengidentifikasi struktur generik Narrative Text.",
    "Menentukan unsur kebahasaan dan makna tersirat sebuah cerita.",
    "Menulis kembali cerita dengan urutan dan sudut pandang yang tepat.",
    "Menganalisis karakter serta pesan moral teks secara kritis."
  ],
  materials: [
    {title:"Pengertian & Tujuan", lead:"Narrative Text is a story text written to entertain and/or teach moral lessons.", points:[
      "Menghibur pembaca.","Mengembangkan alur yang mengandung konflik.","Biasanya menyampaikan moral message atau lesson."
    ], example:"The Rabbit and the Turtle was written to entertain readers and remind them that persistence matters.", check:"Mengapa pesan moral penting dalam Narrative Text?", answer:"Pesan moral memberi makna tambahan pada konflik dan membantu pembaca mengambil pelajaran dari pengalaman tokoh."},
    {title:"Struktur Generik", lead:"Teks naratif yang utuh umumnya memiliki lima tahap.", points:["Orientation: siapa, kapan, dan di mana.","Complication: masalah mulai muncul.","Conflict development: usaha menghadapi masalah.","Resolution: masalah diselesaikan.","Coda/Reorientation: optional message or reflection."], table:[["Tahap","Pertanyaan pemandu"],["Orientation","Siapa tokohnya dan kapan serta di mana cerita terjadi?"],["Complication","Masalah apa yang memicu cerita?"],["Resolution","Bagaimana masalah itu selesai?"]], check:"Apakah semua Narrative Text harus punya reorientation?", answer:"Tidak selalu. Reorientation bersifat opsional; sebagian teks berakhir pada resolution."},
    {title:"Kebahasaan", lead:"Unsur bahasa membangun alur, suasana, dan sudut pandang.", points:["Past tense sebagai bentuk utama.","Action verbs untuk gerakan.","Time conjunctions: first, then, when, finally.","Adjectives dan adverbs untuk mendeskripsikan.","Direct speech untuk menyajikan dialog."], equation:"Pertempuran utama: Past Tense + Action Verb + Time Connector", check:"Mengapa past tense digunakan dominan?", answer:"Peristiwa dalam narasi umumnya dipandang sebagai kejadian yang telah terjadi."},
    {title:"Jenis Narrative Text", lead:"Narasi dapat berbentuk cerita rakyat, dongeng, legenda, fabel, misteri, atau pengalaman pribadi.", table:[["Jenis","Ciri utama","Contoh"],["Fable","Tokoh hewan, pesan moral","The Ant and the Grasshopper"],["Legend","Asal-usul suatu tempat/benda","Malin Kundang"],["Fairy tale","Unsur fantasi dan dilema","Cinderella"],["Mystery","Ketegangan dan pemecahan rahasia","The missing key"]], check:"Apa pembeda utama fabel?", answer:"Tokoh utamanya sering berupa hewan yang berperilaku seperti manusia dan cerita mengandung pesan moral."},
    {title:"Character & Conflict", lead:"Karakter bergerak karena tujuan, hambatan, dan keputusan.", points:["Protagonist: tokoh utama.","Antagonist: kekuatan yang menghambat.","Internal conflict: konflik dalam diri.","External conflict: konflik dengan tokoh, alam, atau aturan.","Characterization melalui action, speech, thought, appearance, dan reaction."], check:"Mengapa tokoh antagonis tidak selalu manusia?", answer:"Antagonis dapat berupa alam, keadaan, aturan, atau konflik batin yang menghalangi tujuan tokoh."},
    {title:"Menulis & Merevisi", lead:"Susun alur lebih dulu, lalu perkuat detail dan konsistensi sudut pandang.", points:["Buat orientasi ringkas tetapi jelas.","Rakit complication dengan sebab-akibat.","Gunakan dialog yang relevan.","Pilih ending yang logis dan bermakna.","Revisi untuk menghindari repetition dan tense yang tidak konsisten."], callout:"Formula penyuntingan: lengkapkah alurnya + konsistenkah bahasa + bermaknakah ending?", check:"Apa langkah pertama saat merevisi ending?", answer:"Pastikan ending menyelesaikan konflik utama secara masuk akal dan terhubung dengan tindakan sebelumnya."}
  ],
  exploration: {
    title:"Alur Kisah Interaktif",
    intro:"Klik tiap bagian untuk melihat fungsinya dalam Narrative Text.",
    nodes:[
      {label:"1. Orientation", title:"Siapa, kapan, dan di mana?", text:"Perkenalkan tokoh, latar waktu, dan latar tempat secara ringkas agar pembaca memahami situasi awal."},
      {label:"2. Complication", title:"Apa masalahnya?", text:"Sajikan kejadian yang mengganggu situasi normal. Permasalahannya harus cukup kuat untuk memicu konflik."},
      {label:"3. Rising Action", title:"Bagaimana konflik berkembang?", text:"Bangkitkan ketegangan melalui hambatan, pilihan sulit, reaksi tokoh, atau perubahan situasi."},
      {label:"4. Climax", title:"Kapan keputusan terpenting terjadi?", text:"Tunjukkan titik paling menegangkan ketika tokoh harus bertindak atau menghadapi konsekuensi."},
      {label:"5. Resolution", title:"Bagaimana masalah berakhir?", text:"Berikan penyelesaian yang logis. Ending dapat bahagia, sedih, terbuka, atau memberikan pelajaran."}
    ]
  },
  simulations:[
    {id:"tension",name:"Simulator Ketegangan Cerita",type:"range",min:1,max:10,value:5,unit:"/10",labels:["Tenang","Kritis"]},
    {id:"speed",name:"Kecepatan Alur",type:"range",min:1,max:5,value:3,unit:" langkah",labels:["Pelan","Cepat"]}
  ],
  glossary:[
    ["adjective","kata sifat yang menggambarkan tokoh, tempat, atau suasana"],
    ["antagonist","tokoh atau kekuatan yang menjadi hambatan bagi tokoh utama"],
    ["climax","titik paling menegangkan dalam konflik cerita"],
    ["complication","bagian yang memunculkan masalah atau konflik"],
    ["conflict","pertentangan atau masalah yang dihadapi tokoh"],
    ["coda","bagian penutup opsional yang berisi penekanan pesan atau refleksi"],
    ["direct speech","kalimat langsung yang diucapkan tokoh"],
    ["fable","cerita dengan tokoh hewan dan pesan moral"],
    ["fairy tale","cerita fantasi, biasanya mengandung unsur ajaib"],
    ["falling action","rangkaian peristiwa setelah klimaks menuju penyelesaian"],
    ["figurative language","bahasa kias yang memberi makna atau efek tambahan"],
    ["flashback","adegan yang membawa pembaca ke peristiwa masa lalu"],
    ["folklore","tradisi cerita turun-temurun dalam masyarakat"],
    ["imagery","penggunaan bahasa indrawi untuk membangun gambaran"],
    ["legend","cerita rakyat yang menjelaskan asal-usul atau tokoh tertentu"],
    ["moral value","nilai atau pelajaran yang dapat dipetik pembaca"],
    ["narrative text","teks yang menceritakan rangkaian kejadian untuk menghibur"],
    ["orientation","bagian pembuka yang mengenalkan tokoh, waktu, dan tempat"],
    ["past tense","bentuk kata kerja untuk menyatakan kejadian lampau"],
    ["resolution","bagian penyelesaian konflik"],
    ["reorientation","penutup opsional berisi komentar atau refleksi penulis"],
    ["rising action","perkembangan konflik sebelum klimaks"],
    ["setting","latar waktu dan tempat terjadinya cerita"],
    ["theme","ide utama atau gagasan pokok cerita"],
    ["time conjunction","kata penghubung waktu yang mengurutkan kejadian"],
    ["protagonist","tokoh utama yang menjadi pusat cerita"],
    ["plot","rangkaian peristiwa dalam sebuah cerita"],
    ["point of view","posisi narator dalam menceritakan cerita"]
  ],
  quiz:[
    {q:"What is the main social function of a narrative text?",options:["To report factual events","To entertain and teach a lesson","To describe a place","To argue about an issue","To give instructions"],answer:1,why:"Narrative texts commonly entertain readers and may convey a moral lesson."},
    {q:"Which part introduces characters, time, and place?",options:["Resolution","Coda","Orientation","Complication","Reorientation"],answer:2,why:"Orientation sets the initial situation, including characters and setting."},
    {q:"The problem that starts the main conflict appears in ...",options:["Orientation","Complication","Resolution","Reorientation","Title"],answer:1,why:"Complication introduces the problem that drives the plot."},
    {q:"Which verb tense is usually dominant in narrative text?",options:["Simple present","Present continuous","Simple past","Future perfect","Present perfect continuous"],answer:2,why:"Narrative events are generally told in simple past."},
    {q:"What is the function of a resolution?",options:["Opening the story","Introducing characters","Solving the conflict","Listing sources","Giving a definition"],answer:2,why:"Resolution presents the solution or outcome of the conflict."},
    {q:"An optional ending that reflects on the story is called ...",options:["Orientation","Complication","Climax","Reorientation","Setting"],answer:3,why:"Reorientation is an optional reflective closing."},
    {q:"The most intense point of conflict is the ...",options:["Climax","Exposition","Theme","Caption","Glossary"],answer:0,why:"The climax is the highest point of tension and decision."},
    {q:"Which word sequence is a time conjunction?",options:["because, although, unless","then, when, finally","beautiful, tall, young","above, under, between","fast, slow, careful"],answer:1,why:"These words organize events chronologically."},
    {q:"A story featuring animal characters and a moral lesson is usually a ...",options:["Report","Procedure","Fable","Review","Advertisement"],answer:2,why:"Fables commonly use animal characters to teach moral values."},
    {q:"What can be protagonist?",options:["The reader only","The main character","A dictionary","A title","A setting label"],answer:1,why:"Protagonist refers to the central/main character."},
    {q:"Which sentence uses the correct simple past tense?",options:["She goes yesterday.","She went into the forest.","She is going tomorrow.","She has go there.","She will went there."],answer:1,why:"Went is the correct past form of go."},
    {q:"Direct speech in narrative text is shown through ...",options:["A table only","Characters' exact spoken words","A graph","A bibliography","A formula"],answer:1,why:"Direct speech records what a character says in quotation marks."},
    {q:"Which detail most strongly develops setting?",options:["Character names only","Time, place, and atmosphere","Number of pages","Author's nationality","Book price"],answer:1,why:"Setting is created through time, place, and atmosphere."},
    {q:"Conflict with a storm is an example of ...",options:["Internal conflict","External conflict with nature","Resolution","Reorientation","Coda only"],answer:1,why:"A struggle against nature is external conflict."},
    {q:"A character doubting whether to betray a friend has ...",options:["External conflict","Internal conflict","No conflict","A report","A procedure"],answer:1,why:"Doubts and moral choices within the character indicate internal conflict."},
    {q:"Good rising action ...",options:["Repeats the orientation","Develops tension and obstacles","Ends every problem immediately","Removes all characters","Makes the title shorter"],answer:1,why:"Rising action increases tension and presents obstacles before the climax."},
    {q:"What makes an ending satisfying?",options:["It must always be happy","It must be unrelated","It resolves major conflict logically","It has many new characters","It repeats every sentence"],answer:2,why:"A logical resolution of the central conflict makes an ending coherent."},
    {q:"Which phrase can introduce a flashback?",options:["Three years earlier, ...","Tomorrow morning, ...","The formula is, ...","According to the table, ...","The title reads, ..."],answer:0,why:"Three years earlier signals a movement to a past time."},
    {q:"Which part should be revised if the story jumps from morning to night without a connector?",options:["Orientation only","Chronological transitions","Question words","The moral only","Footnotes"],answer:1,why:"Time transitions need clear connectors to keep chronology understandable."},
    {q:"The central idea that connects character choices and events is called ...",options:["Resolution","Theme","Caption","Procedure","Direct speech"],answer:1,why:"Theme is the underlying central idea explored in the story."},
    {q:"Which action verb best fits a chase scene?",options:["Run","Think","Agree","Believe","Remember"],answer:0,why:"Run describes physical action appropriate to a chase."},
    {q:"A fairy tale usually contains ...",options:["Experimental results","Fantastical elements","Data analysis steps","News facts","Legal regulations"],answer:1,why:"Fairy tales characteristically include magic or fantastic events."},
    {q:"In 'Suddenly, the bridge collapsed,' the adverb highlights ...",options:["Unexpected timing","A mathematical result","A source","A procedure title","A comparison"],answer:0,why:"Suddenly emphasizes that the collapse happened unexpectedly."},
    {q:"Which item belongs to language feature revision?",options:["Keeping tense consistent","Removing every verb","Changing setting daily","Deleting dialogue always","Adding random statistics"],answer:0,why:"Consistent tense and viewpoint help readers follow a narrative."},
    {q:"Characterization is shown through ...",options:["Words, actions, thoughts, and others' reactions","Page colour only","Font size only","Publication date only","Answer options only"],answer:0,why:"These elements reveal personality and motivation."}
  ],
  activities:[
    {id:"a1",text:"Many years ago, a young sailor lived in a quiet coastal village.",type:"Orientation"},
    {id:"a2",text:"During a storm, he lost his compass and became trapped by high waves.",type:"Complication"},
    {id:"a3",text:"He remembered the stars he had learned to observe with his grandfather.",type:"Rising Action"},
    {id:"a4",text:"The sailor chose the north star and guided his boat between the rocks.",type:"Climax"},
    {id:"a5",text:"He finally reached the harbor safely and thanked the village elders.",type:"Resolution"}
  ],
  teacher:{
    identity:["Mata pelajaran: Bahasa Inggris","Fase / Kelas: F / XII","Alokasi waktu: 3 x 45 menit","Model: Discovery Learning dan Project-based Learning"],
    flow:[["Pendahuluan","Orientasi, apersepsi, tujuan","Beranda & Tahukah kamu?","10 menit"],["Eksplorasi","Mengidentifikasi struktur cerita","Materi & Eksplorasi","20 menit"],["Penjelasan","Diskusi unsur kebahasaan","Materi dan simulasi","20 menit"],["Praktik","Menyusun alur dan cerita","Aktivitas & Permainan","25 menit"],["Presentasi","Kelompok mempresentasikan hasil","Aktivitas","10 menit"],["Evaluasi","Kuis formatif dan refleksi","Kuis & Glosarium","20 menit"]],
    printQuiz:true
  }
};
