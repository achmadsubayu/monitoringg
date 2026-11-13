// ===============================================
// 1. URL WEB APP APPS SCRIPT (BERAKHIRAN /exec)
// ===============================================
const SCRIPT_URL_SIMPAN = "https://script.google.com/macros/s/AKfycbzJo9BoqVnoNO9ddaj1nbHHb0Xo6bF80o7k3piGT50laI4_wC7QHv1wTk7iqBW9KNFw/exec";

// ===============================================
// 2. URL CSV MASTER DATA (BERAKHIRAN output=csv)
// ===============================================
const URL_MASTER_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vRXvQwzAcegLkM99evCsAN10ms8GWBMmteCax4aUSVaPoPpHWt8L3UcI6PSb6lbTuAPynVj2QVzy8c-/pub?gid=0&single=true&output=csv";

// ===============================================
// 3. MASTER DATA PIC (MANUAL SESUAI EXCEL JADWAL FITTER)
// ===============================================
const dataPIC = [
    { nama: "Grup A (Teguh dkk)", mesin: ["FC121", "NP 002", "NP 316", "NP 320", "TW 002", "TW 404", "TW 405", "TW 411", "NP 322"] },
    { nama: "Grup B (Okky dkk)", mesin: ["FC118", "NP 313", "NP 314", "NP 315", "NP 321", "TW 408", "TW 409", "FC103", "NP 324"] },
    { nama: "Grup C (Agus dkk)", mesin: ["FC122", "TW 406", "HRT 001", "HRT 002", "HRT 003", "JRT 005", "JRT 006", "TL 204", "NP 323", "HRT 004"] },
    { nama: "Grup D (Slamet dkk)", mesin: ["NP 007", "NP 317", "NP 318", "NP 319", "TW 407", "TW 410", "TW 412", "TW 413", "FC108"] }
];

let semuaJobAbnormal = [];
let semuaRiwayat = [];
let globalJobCounter = 0;

// Variabel untuk menyimpan filter apa yang sedang aktif
let picAktifSekarang = "ALL"; 
let prioritasAktifSekarang = "ALL"; 

// Fungsi untuk menghilangkan spasi dan huruf besar (contoh: "TW 409" jadi "tw409")
const normalisasiTeks = (teks) => (teks || "").replace(/\s+/g, '').toLowerCase();

function previewImage(event) {
    var reader = new FileReader();
    reader.onload = function() {
        var output = document.getElementById('preview');
        output.src = reader.result;
        output.style.display = 'block';
    }
    if (event.target.files[0]) {
        reader.readAsDataURL(event.target.files[0]);
    }
}

// ===============================================
// FUNGSI MENGIRIM DATA PENGERJAAN KE APPS SCRIPT
// ===============================================
async function simpanDataPengerjaan() {
    const teknisi = document.getElementById('inputTeknisi').value.trim();
    const tindakan = document.getElementById('inputTindakan').value.trim();
    const idUnikJob = document.getElementById('hiddenJobName').value.trim(); 
    const line = document.getElementById('hiddenLine').value.trim();
    const idCard = document.getElementById('hiddenIdCard').value;
    const judulJobUI = document.getElementById('judulModalForm').getAttribute('data-namamurni') || document.getElementById('judulModalForm').innerText; 

    if(!teknisi || !tindakan) {
        alert("Mohon isi Nama Teknisi dan Tindakan Perbaikan!");
        return;
    }

    const btnSimpan = document.getElementById('btnSimpan');
    btnSimpan.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Menyimpan...';
    btnSimpan.disabled = true;

    const fotoInput = document.getElementById('fotoBukti');
    let base64String = "";
    if(fotoInput.files.length > 0) {
        base64String = document.getElementById('preview').src; 
    }

    const payload = {
        idUnik: idUnikJob,
        line: line,
        namaJob: judulJobUI, 
        teknisi: teknisi,
        tindakan: tindakan,
        fotoBase64: base64String
    };

    try {
        const response = await fetch(SCRIPT_URL_SIMPAN, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === "sukses") {
            alert("Berhasil! Job selesai dan tersimpan ke Sheet.");
            
            let waktuSekarang = new Date().toLocaleString('id-ID'); 
            semuaRiwayat.push({
                waktu: waktuSekarang,
                line: line,
                namaJob: judulJobUI,
                teknisi: teknisi,
                tindakan: tindakan,
                linkFoto: result.fileUrl || (base64String ? "Tersimpan di Google Drive" : "Tidak ada")
            });
            renderRiwayatUI(); 

            // Hapus Job dari memori
            semuaJobAbnormal = semuaJobAbnormal.filter(j => j.idUnik.trim() !== idUnikJob);
            
            // Refresh Tombol PIC, Filter Line, dan Ranking Mesin
            renderTombolPIC(); 
            terapkanFilterLine(); 
            renderRankingMesin();

            var myModalEl = document.getElementById('modalKerjakan');
            var modal = bootstrap.Modal.getInstance(myModalEl);
            modal.hide();
            
            document.getElementById('formPengerjaan').reset();
            document.getElementById('preview').style.display = 'none';
            document.getElementById('preview').src = '';
        } else {
            alert("Gagal menyimpan: " + result.pesan);
        }
    } catch (error) {
        alert("Terjadi error koneksi ke Google. Pesan: " + error.message);
    } finally {
        btnSimpan.innerHTML = '<i class="fas fa-paper-plane me-1"></i> Simpan Selesai';
        btnSimpan.disabled = false;
    }
}

// ===============================================
// LOAD SEMUA DATA DARI MASTER CSV
// ===============================================
async function loadSemuaData() {
    document.getElementById('loading-indicator').style.display = 'block';
    
    try {
        const response = await fetch(URL_MASTER_CSV + "&t=" + new Date().getTime());
        if (!response.ok) throw new Error("Gagal mengambil data dari Master CSV");
        
        const csvText = await response.text();
        
        Papa.parse(csvText, {
            header: false,
            skipEmptyLines: true,
            complete: function(results) {
                const data = results.data;
                semuaJobAbnormal = [];
                semuaRiwayat = [];
                
                for (let baris = 1; baris < data.length; baris++) {
                    let values = data[baris];
                    if(values.length < 11) continue; 
                    
                    let idUnikMaster = (values[0] || "").trim();
                    if (idUnikMaster === "") continue;

                    let statusJob = (values[10] || "").trim();
                    let namaJobLengkap = values[5] || "-";     
                    let tipeJob = namaJobLengkap.includes("Temuan Lain") ? "Temuan Lain" : "Aktivitas";

                    // DETEKSI KATEGORI PRIORITAS DARI KETERANGAN
                    let ketAwal = values[8] || "-";
                    let ketLower = ketAwal.toLowerCase(); 
                    let kategoriPrioritas = "Belum Dikategorikan";
                    let badgeWarna = "bg-secondary"; 

                    if (ketLower.includes("(p1)")) {
                        kategoriPrioritas = "P1 - Major Urgent";
                        badgeWarna = "bg-danger"; 
                    } else if (ketLower.includes("(p2)")) {
                        kategoriPrioritas = "P2 - Minor Urgent";
                        badgeWarna = "bg-warning text-dark"; 
                    } else if (ketLower.includes("(p3)")) {
                        kategoriPrioritas = "P3 - Major Non Urgent";
                        badgeWarna = "bg-primary"; 
                    } else if (ketLower.includes("(p4)")) {
                        kategoriPrioritas = "P4 - Minor Non Urgent";
                        badgeWarna = "bg-info text-dark"; 
                    }

                    if (statusJob === "Belum Dikerjakan") {
                        semuaJobAbnormal.push({
                            idUnik: idUnikMaster, 
                            tipe: tipeJob,
                            tanggal: values[1] || "-",         
                            shift: values[2] || "-",           
                            line: values[3] || "-",            
                            pelapor: values[4] || "-",         
                            namaJob: namaJobLengkap,
                            cond: values[6] || "-",            
                            rep: values[7] || "-",             
                            ket: ketAwal,             
                            lamp: values[9] || "",
                            prioritas: kategoriPrioritas,
                            warnaPrioritas: badgeWarna
                        });
                    } else if (statusJob === "Selesai") {
                        semuaRiwayat.push({
                            waktu: values[13] || "-",          
                            line: values[3] || "-",            
                            namaJob: namaJobLengkap,
                            teknisi: values[11] || "-",        
                            tindakan: values[12] || "-",       
                            linkFoto: values[14] || ""         
                        });
                    }
                }
                
                document.getElementById('loading-indicator').style.display = 'none';
                
                renderTombolPIC(); 
                inisialisasiFilterLine();
                terapkanFilterLine();
                renderRiwayatUI();
                renderRankingMesin(); // Menjalankan fitur ranking otomatis saat load
            },
            error: function(err) { 
                console.log("Error Parsing:", err);
                document.getElementById('loading-indicator').style.display = 'none';
            }
        });
    } catch (error) {
        console.log("Gagal memuat Master Data:", error);
        document.getElementById('loading-indicator').style.display = 'none';
    }
}

// ===============================================
// FUNGSI RENDER TOMBOL PIC & HITUNG JOB
// ===============================================
function renderTombolPIC() {
    const container = document.getElementById('pic-filter-container');
    if(!container) return;
    container.innerHTML = ""; 

    let btnSemuaAktif = (picAktifSekarang === "ALL") ? "btn-primary active" : "btn-outline-primary";
    container.innerHTML += `
        <button class="btn ${btnSemuaAktif} btn-sm rounded-pill btn-filter-custom btn-pic" onclick="pilihPIC('ALL')">
            Semua Mesin <span class="badge rounded-pill" id="badge-pic-all">${semuaJobAbnormal.length}</span>
        </button>
    `;

    dataPIC.forEach((pic, index) => {
        let listMesinNormal = pic.mesin.map(m => normalisasiTeks(m));
        
        let jumlahJobPIC = semuaJobAbnormal.filter(job => {
            let isUrgent = job.prioritas.includes("P1") || job.prioritas.includes("P2");
            if (isUrgent) return true; 
            return listMesinNormal.includes(normalisasiTeks(job.line));
        }).length;

        let btnKelas = (picAktifSekarang === index) ? "btn-primary active" : "btn-outline-primary";
        container.innerHTML += `
            <button class="btn ${btnKelas} btn-sm rounded-pill btn-filter-custom btn-pic" onclick="pilihPIC(${index})">
                ${pic.nama} <span class="badge rounded-pill">${jumlahJobPIC}</span>
            </button>
        `;
    });
}

function pilihPIC(indexPIC) {
    picAktifSekarang = indexPIC;
    renderTombolPIC(); 
    inisialisasiFilterLine(); 
    terapkanFilterLine(); 
}

// ===============================================
// INISIALISASI LIST DROPDOWN LINE
// ===============================================
function inisialisasiFilterLine() {
    const filterSelect = document.getElementById('filterLine');
    if (!filterSelect) return;
    filterSelect.innerHTML = '<option value="ALL">Tampilkan Semua Line</option>';

    let unikLines = new Set();
    
    semuaJobAbnormal.forEach(job => {
        if (job.line && job.line !== "-" && job.line.trim() !== "") {
            
            if(picAktifSekarang !== "ALL") {
                let listMesinNormal = dataPIC[picAktifSekarang].mesin.map(m => normalisasiTeks(m));
                let isUrgent = job.prioritas.includes("P1") || job.prioritas.includes("P2");
                
                if(listMesinNormal.includes(normalisasiTeks(job.line)) || isUrgent) {
                    unikLines.add(job.line.toUpperCase().trim());
                }
            } else {
                unikLines.add(job.line.toUpperCase().trim());
            }
        }
    });

    let daftarLineUrut = Array.from(unikLines).sort();
    daftarLineUrut.forEach(line => {
        let opt = document.createElement('option');
        opt.value = normalisasiTeks(line); 
        opt.innerHTML = "Line: " + line;
        filterSelect.appendChild(opt);
    });
}

// ===============================================
// LOGIKA UTAMA FILTERING (PIC, LINE, PRIORITAS)
// ===============================================
function terapkanFilterLine() {
    let pilihanLine = document.getElementById('filterLine') ? document.getElementById('filterLine').value : "ALL"; 
    let dataTerfilter = [];

    semuaJobAbnormal.forEach(job => {
        let lineJobNormal = normalisasiTeks(job.line);
        let masukKriteriaPIC = false;
        let masukKriteriaLine = false;
        let masukKriteriaPrioritas = false;

        // 1. FILTER PRIORITAS (Dari tombol P1-P4)
        if (prioritasAktifSekarang === "ALL") {
            masukKriteriaPrioritas = true;
        } else if (prioritasAktifSekarang === "BELUM" && job.prioritas === "Belum Dikategorikan") {
            masukKriteriaPrioritas = true;
        } else if (job.prioritas.includes(prioritasAktifSekarang)) {
            masukKriteriaPrioritas = true;
        }

        // 2. FILTER PIC (RULE: P1 dan P2 masuk ke SEMUA PIC secara otomatis!)
        let isUrgent = job.prioritas.includes("P1") || job.prioritas.includes("P2");
        if (picAktifSekarang === "ALL" || isUrgent) {
            masukKriteriaPIC = true;
        } else {
            let listMesinPICNormal = dataPIC[picAktifSekarang].mesin.map(m => normalisasiTeks(m));
            if (listMesinPICNormal.includes(lineJobNormal)) {
                masukKriteriaPIC = true;
            }
        }

        // 3. FILTER LINE SPESIFIK
        if (pilihanLine === "ALL") {
            masukKriteriaLine = true;
        } else {
            if (lineJobNormal === pilihanLine) {
                masukKriteriaLine = true;
            }
        }

        if (masukKriteriaPIC && masukKriteriaLine && masukKriteriaPrioritas) {
            dataTerfilter.push(job);
        }
    });
    
    renderJobsUI(dataTerfilter);
}

// ===============================================
// INISIALISASI EVENT KLIK UNTUK TOMBOL PRIORITAS
// ===============================================
function inisialisasiTombolPrioritas() {
    const tombolPrioritas = document.querySelectorAll('#prioritas-filter-container .btn');
    if(!tombolPrioritas.length) return;

    tombolPrioritas.forEach(btn => {
        btn.addEventListener('click', function() {
            tombolPrioritas.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            prioritasAktifSekarang = this.getAttribute('data-prioritas');
            terapkanFilterLine();
        });
    });
}

// ===============================================
// RENDER UI UNTUK TAB JOB AKTIF 
// ===============================================
function renderJobsUI(dataJobs) {
    document.getElementById('count-job').innerText = dataJobs.length;
    const container = document.getElementById('job-container');
    container.innerHTML = ""; 

    if (dataJobs.length === 0) {
        container.innerHTML = `<div class="col-12"><div class="alert alert-success text-center"><i class="fas fa-check-circle me-2"></i>Tidak ada job untuk kriteria ini.</div></div>`;
        return;
    }

    dataJobs.forEach(job => {
        globalJobCounter++;
        let cardId = "jobCard-" + globalJobCounter;
        let linkLampiranHtml = job.lamp !== "" && job.lamp !== "-" ? `<a href="${job.lamp}" target="_blank" class="text-primary text-decoration-underline ms-1"><i class="fas fa-external-link-alt"></i> Buka File</a>` : "<span class='text-muted ms-1'>Tidak ada</span>";
        let kondisiHTML = job.tipe === "Temuan Lain" ? `<p class="mb-1 small">Status: <span class="badge bg-warning text-dark">${job.cond}</span></p>` : `<p class="mb-1 small">Kondisi: <span class="text-danger fw-bold">${job.cond}</span> | Replace: <span class="text-danger fw-bold">${job.rep}</span></p>`;
        let namaTampilUI = job.namaJob.replace(/"/g, '&quot;').replace(/\n/g, ' ');
        let safeLine = String(job.line).replace(/"/g, '&quot;').replace(/\n/g, ' ');
        let safeIdUnik = encodeURIComponent(job.idUnik);

        let borderClass = "border-secondary";
        if (job.warnaPrioritas === "bg-danger") borderClass = "border-danger";
        else if (job.warnaPrioritas === "bg-warning text-dark") borderClass = "border-warning";
        else if (job.warnaPrioritas === "bg-primary") borderClass = "border-primary";
        else if (job.warnaPrioritas === "bg-info text-dark") borderClass = "border-info";

        let cardHTML = `
            <div class="col-md-6 col-12" id="${cardId}">
                <div class="card card-job shadow-sm border-start-4 ${borderClass}">
                    <div class="card-body">
                        <div class="d-flex justify-content-between align-items-start mb-2">
                            <h6 class="card-title text-primary fw-bold mb-0">
                                <i class="fas ${job.tipe === 'Temuan Lain' ? 'fa-exclamation-triangle text-warning' : 'fa-wrench'} me-1"></i> 
                                ${namaTampilUI}
                            </h6>
                            <div class="text-end" style="min-width: fit-content;">
                                <span class="badge bg-danger badge-status mb-1">Menunggu</span><br>
                                <span class="badge ${job.warnaPrioritas} badge-status">${job.prioritas}</span>
                            </div>
                        </div>
                        <p class="text-muted mb-2" style="font-size: 0.8rem;">
                            <i class="fas fa-industry me-1"></i> Line: <strong class="text-dark">${job.line}</strong> | 
                            <i class="fas fa-calendar-alt ms-1 me-1"></i> ${job.tanggal} (Shift ${job.shift}) |
                            <i class="fas fa-user ms-1 me-1"></i> By: ${job.pelapor}
                        </p>
                        <div class="detail-box">
                            ${kondisiHTML}
                            <p class="mb-1 small"><strong>Keterangan:</strong> <br><span class="text-dark">${job.ket.replace(/\n/g, '<br>')}</span></p>
                            <p class="mb-0 small"><strong>Lampiran Pelapor:</strong> ${linkLampiranHtml}</p>
                        </div>
                        
                        <button class="btn btn-primary w-100 btn-sm" data-bs-toggle="modal" data-bs-target="#modalKerjakan" data-job="${safeIdUnik}" data-namauntukui="${namaTampilUI}" data-line="${safeLine}" data-cardid="${cardId}" onclick="siapkanForm(this)">
                            <i class="fas fa-tools me-1"></i> Kerjakan
                        </button>
                    </div>
                </div>
            </div>
        `;
        container.innerHTML += cardHTML;
    });
}

function siapkanForm(tombolDipencet) {
    let idUnik = decodeURIComponent(tombolDipencet.getAttribute('data-job')); 
    let namaJobUI = tombolDipencet.getAttribute('data-namauntukui'); 
    let line = tombolDipencet.getAttribute('data-line');
    let idCard = tombolDipencet.getAttribute('data-cardid');

    document.getElementById('hiddenJobName').value = idUnik; 
    document.getElementById('hiddenLine').value = line;
    document.getElementById('hiddenIdCard').value = idCard;
    
    let elJudul = document.getElementById('judulModalForm');
    elJudul.innerText = "Line " + line + " - " + namaJobUI;
    elJudul.setAttribute('data-namamurni', namaJobUI); 
}

// ===============================================
// RENDER UI UNTUK TAB RIWAYAT SELESAI
// ===============================================
function renderRiwayatUI() {
    const container = document.getElementById('pills-done');
    
    if (semuaRiwayat.length === 0) {
        container.innerHTML = `<div class="alert alert-info">Belum ada riwayat pekerjaan yang diselesaikan.</div>`;
        return;
    }

    let html = `<div class="table-responsive"><table class="table table-hover table-bordered mt-2 bg-white">
                    <thead class="table-dark">
                        <tr>
                            <th>Waktu Selesai</th>
                            <th>Line</th>
                            <th>Nama Job</th>
                            <th>Teknisi</th>
                            <th>Tindakan</th>
                            <th>Bukti Foto</th>
                        </tr>
                    </thead>
                    <tbody>`;
    
    let reversedRiwayat = [...semuaRiwayat].reverse();

    reversedRiwayat.forEach(item => {
        let fotoHtml = (item.linkFoto && item.linkFoto.includes("http")) 
            ? `<a href="${item.linkFoto}" target="_blank" class="btn btn-sm btn-info text-white"><i class="fas fa-image"></i> Lihat</a>` 
            : `<span class="text-muted small">${item.linkFoto || "Tidak ada"}</span>`;

        html += `<tr>
                    <td>${item.waktu}</td>
                    <td>${item.line}</td>
                    <td>${item.namaJob}</td>
                    <td>${item.teknisi}</td>
                    <td>${item.tindakan}</td>
                    <td>${fotoHtml}</td>
                 </tr>`;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// ===============================================
// LOGIKA BARU: RANKING / PERINGKAT MESIN (P1, P2, P3, P4)
// ===============================================
function renderRankingMesin() {
    const container = document.getElementById('ranking-container');
    if (!container) return;

    let hitunganLine = {};

    // 1. Looping semua job untuk menghitung P1, P2, P3, P4
    semuaJobAbnormal.forEach(job => {
        let prioritas = job.prioritas;
        let isTarget = prioritas.includes("P1") || prioritas.includes("P2") || prioritas.includes("P3") || prioritas.includes("P4");

        if (isTarget && job.line && job.line !== "-") {
            let namaLine = job.line.toUpperCase().trim();
            
            if (!hitunganLine[namaLine]) {
                // Buat objek awal jika Line belum ada di hash map
                hitunganLine[namaLine] = { total: 0, p1: 0, p2: 0, p3: 0, p4: 0 };
            }
            
            // Tambah hitungan total
            hitunganLine[namaLine].total += 1;
            
            // Tambah hitungan spesifik
            if (prioritas.includes("P1")) hitunganLine[namaLine].p1 += 1;
            if (prioritas.includes("P2")) hitunganLine[namaLine].p2 += 1;
            if (prioritas.includes("P3")) hitunganLine[namaLine].p3 += 1;
            if (prioritas.includes("P4")) hitunganLine[namaLine].p4 += 1;
        }
    });

    // 2. Ubah format objek menjadi array agar bisa di-sort
    let arrayRanking = [];
    for (let line in hitunganLine) {
        arrayRanking.push({
            line: line,
            total: hitunganLine[line].total,
            p1: hitunganLine[line].p1,
            p2: hitunganLine[line].p2,
            p3: hitunganLine[line].p3,
            p4: hitunganLine[line].p4
        });
    }

    // 3. Sorting (urutan) dari total terbesar ke terkecil
    arrayRanking.sort((a, b) => b.total - a.total);

    // 4. Render ke UI
    if (arrayRanking.length === 0) {
        container.innerHTML = `<div class="alert alert-success mt-3 text-center"><i class="fas fa-check-circle me-2"></i>Tidak ada data masalah P1, P2, P3, atau P4 saat ini. Mesin aman!</div>`;
        return;
    }

    let html = `
        <div class="table-responsive mt-3">
            <table class="table table-hover table-bordered bg-white shadow-sm">
                <thead class="table-danger">
                    <tr class="text-center">
                        <th width="10%">Peringkat</th>
                        <th width="30%" class="text-start">Line Mesin</th>
                        <th width="15%">Total Masalah (P1,P2,P3,P4)</th>
                        <th>Detail Breakdown</th>
                    </tr>
                </thead>
                <tbody>
    `;

    arrayRanking.forEach((data, index) => {
        let nomor = index + 1;
        let badgePeringkat = `<span class="fw-bold">${nomor}</span>`;
        let textTebal = "";

        // Highlight top 3 menggunakan icon
        if (nomor === 1) { badgePeringkat = `<i class="fas fa-medal text-warning medal-icon"></i>`; textTebal = "fw-bold text-danger"; }
        if (nomor === 2) { badgePeringkat = `<i class="fas fa-medal text-secondary medal-icon"></i>`; textTebal = "fw-bold text-danger"; }
        if (nomor === 3) { badgePeringkat = `<i class="fas fa-medal medal-icon" style="color: #cd7f32;"></i>`; textTebal = "fw-bold text-danger"; }

        html += `
            <tr class="ranking-row text-center align-middle" onclick="bukaModalRevisiMesin('${data.line}')" title="Klik untuk melihat Rencana Revisi & Salin Template">
                <td>${badgePeringkat}</td>
                <td class="text-start ${textTebal}">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-1">
                        <span>LINE: ${data.line}</span>
                        <button type="button" class="btn btn-sm btn-primary py-0 px-2" style="font-size: 0.75rem;" onclick="event.stopPropagation(); bukaModalRevisiMesin('${data.line}')">
                            <i class="fas fa-clipboard-list me-1"></i>Lihat Job & Revisi
                        </button>
                    </div>
                </td>
                <td><span class="badge bg-danger fs-6">${data.total}</span> Kasus</td>
                <td class="text-start">
                    <span class="badge bg-danger me-1">P1: ${data.p1}</span>
                    <span class="badge bg-warning text-dark me-1">P2: ${data.p2}</span>
                    <span class="badge bg-primary me-1">P3: ${data.p3}</span>
                    <span class="badge bg-info text-dark">P4: ${data.p4}</span>
                </td>
            </tr>
        `;
    });

    html += `</tbody></table></div>`;
    container.innerHTML = html;
}

// =========================================================================
// FITUR TAMBAHAN: MODAL RENCANA REVISI MESIN, SALIN TEMPLATE & CLOSE MASSAL
// =========================================================================

let daftarJobRevisiAktif = [];
let daftarGrupRevisiAktif = [];

// Fungsi untuk mengekstrak nama grup/unit dari Nama Job atau Keterangan
function deteksiGrupUnitMesin(job) {
    let nama = (job.namaJob || "").toUpperCase();
    let ket = (job.ket || "").toUpperCase();

    // 1. Jika ada format [UNIT: NAMA_UNIT | ...] dari form checklist
    let matchUnit = job.namaJob.match(/\[UNIT:\s*([^|\]]+)/i);
    if (matchUnit && matchUnit[1]) {
        let unitBersih = matchUnit[1].trim();
        // Ubah ke huruf kapital di awal kata agar rapi (contoh: "UNWIND" -> "Unwind")
        return unitBersih.charAt(0).toUpperCase() + unitBersih.slice(1).toLowerCase();
    }

    // 2. Deteksi kata kunci bagian mesin populer (Interfold, Logsaw, Packaging, dll)
    if (nama.includes("INTERFOLD") || ket.includes("INTERFOLD")) return "Interfold";
    if (nama.includes("LOGSAW") || nama.includes("LOG SAW") || ket.includes("LOGSAW") || ket.includes("LOG SAW")) return "Logsaw";
    if (nama.includes("PACKAGING") || nama.includes("PC0") || ket.includes("PACKAGING") || ket.includes("PC0")) return "Packaging";
    if (nama.includes("UNWIND") || ket.includes("UNWIND")) return "Unwind";
    if (nama.includes("EMBOSS") || ket.includes("EMBOSS")) return "Emboss";

    return "Umum / Lainnya";
}

// Fungsi membersihkan teks keterangan untuk masuk ke Template WA (hapus tag (p1)-(p4) dan strip awal)
function bersihkanKeteranganUntukTemplate(job) {
    let teks = (job.ket || "").trim();
    if (teks === "" || teks === "-") {
        teks = (job.namaJob || "").replace(" 👉 Condition", "").trim();
    }
    // Hapus tanda bullet/strip di awal dan tag prioritas (p1)/(p2)/(p3)/(p4) di akhir/tengah
    teks = teks.replace(/^[-•*.\s]+/, '').replace(/\s*\([pP][1-4]\)\s*/g, ' ').trim();
    return teks;
}

// Fungsi saat baris mesin di Peringkat Mesin diklik
function bukaModalRevisiMesin(namaLine) {
    const lineTargetNormal = normalisasiTeks(namaLine);
    document.getElementById('hiddenLineRevisiTerpilih').value = namaLine;
    document.getElementById('labelLineRevisi').innerText = namaLine;
    document.getElementById('inputHeaderTemplateRevisi').value = "SUN 1 Revisi " + namaLine;
    document.getElementById('cekSemuaRevisi').checked = true;

    // Ambil semua job aktif untuk mesin/line yang dipilih
    daftarJobRevisiAktif = semuaJobAbnormal.filter(job => normalisasiTeks(job.line) === lineTargetNormal);
    document.getElementById('jumlahJobRevisiMesin').innerText = daftarJobRevisiAktif.length;

    // Kelompokkan berdasarkan Grup Unit
    let mapGrup = {};
    daftarJobRevisiAktif.forEach((job, idx) => {
        let namaGrup = deteksiGrupUnitMesin(job);
        job._grupRevisi = namaGrup;
        job._idxRevisi = idx;
        if (!mapGrup[namaGrup]) mapGrup[namaGrup] = [];
        mapGrup[namaGrup].push(job);
    });

    daftarGrupRevisiAktif = Object.keys(mapGrup);

    // 1. Render Input Nama Grup & Personil
    const containerPersonil = document.getElementById('containerInputPersonilGrup');
    let htmlPersonil = "";
    if (daftarGrupRevisiAktif.length === 0) {
        htmlPersonil = `<div class="col-12 text-muted small">Tidak ada grup aktif.</div>`;
    } else {
        daftarGrupRevisiAktif.forEach((grup, gIdx) => {
            let nomorGrup = gIdx + 1;
            let judulGrupDefault = `Group ${nomorGrup} ${grup}`;
            htmlPersonil += `
                <div class="col-md-6 col-12">
                    <div class="p-2 bg-white border rounded shadow-sm">
                        <label class="form-label small fw-bold text-primary mb-1">Nama Grup ${nomorGrup}:</label>
                        <input type="text" class="form-control form-control-sm mb-1 input-judul-grup-revisi" data-grup="${grup}" value="${judulGrupDefault}" oninput="updateTemplateRevisiText()">
                        <label class="form-label small text-muted mb-1">Personil ${judulGrupDefault}:</label>
                        <input type="text" class="form-control form-control-sm input-personil-grup-revisi" data-grup="${grup}" placeholder="Contoh: Ivan dan Carlos" oninput="updateTemplateRevisiText()">
                    </div>
                </div>
            `;
        });
    }
    containerPersonil.innerHTML = htmlPersonil;

    // 2. Render Daftar Masalah Monitoring beserta Checkbox
    const containerList = document.getElementById('listMasalahRevisiContainer');
    let htmlList = "";

    if (daftarJobRevisiAktif.length === 0) {
        htmlList = `<div class="alert alert-success text-center">Tidak ada job aktif pada mesin ${namaLine}.</div>`;
    } else {
        daftarGrupRevisiAktif.forEach((grup, gIdx) => {
            let nomorGrup = gIdx + 1;
            htmlList += `<div class="group-revisi-header fw-bold text-dark small mb-2 mt-2"><i class="fas fa-layer-group me-1"></i> Group ${nomorGrup}: ${grup} (${mapGrup[grup].length} Job)</div>`;
            
            mapGrup[grup].forEach(job => {
                let ketTampil = bersihkanKeteranganUntukTemplate(job);
                htmlList += `
                    <div class="card revisi-item-card shadow-sm mb-2">
                        <div class="card-body py-2 px-3">
                            <div class="form-check d-flex align-items-start gap-2 mb-0">
                                <input class="form-check-input cek-item-revisi mt-1" type="checkbox" value="${job._idxRevisi}" id="cekRevisi_${job._idxRevisi}" checked onchange="updateTemplateRevisiText()">
                                <label class="form-check-label w-100" for="cekRevisi_${job._idxRevisi}" style="cursor:pointer;">
                                    <div class="d-flex justify-content-between align-items-center flex-wrap">
                                        <span class="fw-bold text-dark small">· ${ketTampil}</span>
                                        <span class="badge ${job.warnaPrioritas}" style="font-size: 0.7rem;">${job.prioritas}</span>
                                    </div>
                                    <div class="text-muted" style="font-size: 0.75rem;">
                                        Sumber: ${job.namaJob} | Tanggal: ${job.tanggal} (Shift ${job.shift}) | Pelapor: ${job.pelapor}
                                    </div>
                                </label>
                            </div>
                        </div>
                    </div>
                `;
            });
        });
    }
    containerList.innerHTML = htmlList;

    // 3. Susun Teks Template Revisi Otomatis
    updateTemplateRevisiText();

    // 4. Tampilkan Modal
    let modalEl = document.getElementById('modalRevisiMesin');
    let modalInstance = bootstrap.Modal.getOrCreateInstance(modalEl);
    modalInstance.show();
}

// Fungsi Pilih Semua / Batal Pilih Semua Checkbox Revisi
function togglePilihSemuaJobRevisi(elMaster) {
    const semuaCek = document.querySelectorAll('.cek-item-revisi');
    semuaCek.forEach(c => c.checked = elMaster.checked);
    updateTemplateRevisiText();
}

// Fungsi Menyusun Teks Template Sesuai Gambar Contoh (SUN 1 Revisi FC 121, Group, Titik ·, Personil)
function updateTemplateRevisiText() {
    let headerRevisi = document.getElementById('inputHeaderTemplateRevisi').value.trim();
    let semuaCek = document.querySelectorAll('.cek-item-revisi:checked');
    
    let indexTerpilih = new Set();
    semuaCek.forEach(c => indexTerpilih.add(parseInt(c.value, 10)));

    // Ambil nilai kustom judul grup dan personil dari input
    let mapJudulGrup = {};
    document.querySelectorAll('.input-judul-grup-revisi').forEach(inp => {
        mapJudulGrup[inp.getAttribute('data-grup')] = inp.value.trim();
    });

    let mapPersonilGrup = {};
    document.querySelectorAll('.input-personil-grup-revisi').forEach(inp => {
        mapPersonilGrup[inp.getAttribute('data-grup')] = inp.value.trim();
    });

    let barisTeks = [];
    if (headerRevisi !== "") {
        barisTeks.push(headerRevisi);
    }

    daftarGrupRevisiAktif.forEach((grup, gIdx) => {
        let jobsDiGrupIni = daftarJobRevisiAktif.filter(j => j._grupRevisi === grup && indexTerpilih.has(j._idxRevisi));
        if (jobsDiGrupIni.length === 0) return;

        let judulGrup = mapJudulGrup[grup] || `Group ${gIdx + 1} ${grup}`;
        barisTeks.push(judulGrup);

        jobsDiGrupIni.forEach(job => {
            let itemTeks = bersihkanKeteranganUntukTemplate(job);
            // Bagi per baris jika di dalam 1 keterangan ada enter
            itemTeks.split(/\r?\n/).forEach(subBaris => {
                let bersih = subBaris.replace(/^[-•*.\s]+/, '').trim();
                if (bersih !== "") {
                    barisTeks.push(`· ${bersih}`);
                }
            });
        });

        let namaPersonil = mapPersonilGrup[grup] || "-";
        barisTeks.push(`Personil : ${namaPersonil}`);
        barisTeks.push(""); // Baris kosong antar grup
    });

    document.getElementById('teksTemplateRevisi').value = barisTeks.join("\n").trim();
}

// Fungsi Tombol Salin Template Revisi
function salinTemplateRevisi() {
    const textarea = document.getElementById('teksTemplateRevisi');
    if (!textarea || !textarea.value.trim()) {
        alert("Tidak ada teks template untuk disalin!");
        return;
    }

    textarea.select();
    textarea.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(textarea.value).then(() => {
        const btn = document.getElementById('btnSalinTemplateRevisi');
        const htmlAsli = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-check me-1"></i> Berhasil Disalin!';
        btn.classList.replace('btn-success', 'btn-dark');
        setTimeout(() => {
            btn.innerHTML = htmlAsli;
            btn.classList.replace('btn-dark', 'btn-success');
        }, 2000);
    }).catch(() => {
        document.execCommand('copy');
        alert("Template berhasil disalin!");
    });
}

// Fungsi Preview Foto Bukti Revisi Massal
function previewImageRevisiMassal(event) {
    var reader = new FileReader();
    reader.onload = function() {
        var output = document.getElementById('previewRevisiMassal');
        output.src = reader.result;
        output.style.display = 'block';
    }
    if (event.target.files[0]) {
        reader.readAsDataURL(event.target.files[0]);
    }
}

// Fungsi Tombol Selesai Revisi (Close Semua Job Terpilih pada Mesin Tersebut)
async function selesaikanSemuaJobRevisi() {
    const semuaCek = document.querySelectorAll('.cek-item-revisi:checked');
    if (semuaCek.length === 0) {
        alert("Pilih minimal 1 job pada daftar untuk diselesaikan!");
        return;
    }

    // Jika Nama Teknisi di form bawah kosong, gabungkan otomatis dari nama Personil grup yang diisi
    let teknisiMassal = document.getElementById('inputTeknisiRevisiMassal').value.trim();
    if (!teknisiMassal) {
        let kumpulanPersonil = [];
        document.querySelectorAll('.input-personil-grup-revisi').forEach(inp => {
            if (inp.value.trim() !== "") kumpulanPersonil.push(inp.value.trim());
        });
        if (kumpulanPersonil.length > 0) {
            teknisiMassal = "Tim Revisi (" + kumpulanPersonil.join(", ") + ")";
            document.getElementById('inputTeknisiRevisiMassal').value = teknisiMassal;
        }
    }

    const tindakanMassal = document.getElementById('inputTindakanRevisiMassal').value.trim();
    if (!teknisiMassal || !tindakanMassal) {
        alert("Mohon isi Nama Teknisi / Tim Revisi dan Catatan Penyelesaian Revisi!");
        return;
    }

    const namaLine = document.getElementById('hiddenLineRevisiTerpilih').value;
    if (!confirm(`Apakah Anda yakin ingin menutup (Close) ${semuaCek.length} job pada mesin ${namaLine} sebagai Selesai Revisi?`)) {
        return;
    }

    const btn = document.getElementById('btnSelesaiRevisiMassal');
    const teksBtnAsli = btn.innerHTML;
    btn.disabled = true;

    const fotoInput = document.getElementById('fotoBuktiRevisiMassal');
    let base64String = "";
    if (fotoInput && fotoInput.files.length > 0) {
        base64String = document.getElementById('previewRevisiMassal').src;
    }

    let daftarJobDiproses = [];
    semuaCek.forEach(c => {
        let idx = parseInt(c.value, 10);
        if (daftarJobRevisiAktif[idx]) {
            daftarJobDiproses.push(daftarJobRevisiAktif[idx]);
        }
    });

    let jumlahSukses = 0;
    let urlFotoTersimpan = "";

    for (let i = 0; i < daftarJobDiproses.length; i++) {
        let job = daftarJobDiproses[i];
        btn.innerHTML = `<i class="fas fa-spinner fa-spin me-1"></i> Menutup Job (${i + 1}/${daftarJobDiproses.length})...`;

        // Upload foto cukup pada pengiriman job pertama agar tidak menggandakan file di Drive
        let fotoUntukJobIni = (i === 0) ? base64String : "";

        const payload = {
            idUnik: job.idUnik,
            line: job.line,
            namaJob: job.namaJob,
            teknisi: teknisiMassal,
            tindakan: tindakanMassal + (urlFotoTersimpan ? " (Bukti: " + urlFotoTersimpan + ")" : ""),
            fotoBase64: fotoUntukJobIni
        };

        try {
            const response = await fetch(SCRIPT_URL_SIMPAN, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(payload)
            });
            const result = await response.json();

            if (result.status === "sukses") {
                jumlahSukses++;
                if (result.fileUrl && !urlFotoTersimpan) {
                    urlFotoTersimpan = result.fileUrl;
                }

                let waktuSekarang = new Date().toLocaleString('id-ID');
                semuaRiwayat.push({
                    waktu: waktuSekarang,
                    line: job.line,
                    namaJob: job.namaJob,
                    teknisi: teknisiMassal,
                    tindakan: tindakanMassal,
                    linkFoto: urlFotoTersimpan || (base64String ? "Tersimpan di Google Drive" : "Tidak ada")
                });

                // Hapus job yang sudah selesai dari daftar aktif
                semuaJobAbnormal = semuaJobAbnormal.filter(j => j.idUnik.trim() !== job.idUnik.trim());
            }
        } catch (err) {
            console.log("Gagal menutup job:", job.idUnik, err);
        }
    }

    // Perbarui seluruh tampilan UI
    renderRiwayatUI();
    renderTombolPIC();
    inisialisasiFilterLine();
    terapkanFilterLine();
    renderRankingMesin();

    btn.innerHTML = teksBtnAsli;
    btn.disabled = false;

    alert(`Selesai! ${jumlahSukses} dari ${daftarJobDiproses.length} job pada mesin ${namaLine} berhasil di-close.`);

    // Reset form revisi & tutup modal
    document.getElementById('inputTeknisiRevisiMassal').value = "";
    if (fotoInput) fotoInput.value = "";
    document.getElementById('previewRevisiMassal').style.display = 'none';
    document.getElementById('previewRevisiMassal').src = "";

    let modalEl = document.getElementById('modalRevisiMesin');
    let modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();
}

// ===============================================
// PERINTAH SAAT WEBSITE PERTAMA KALI DIBUKA
// ===============================================
window.onload = () => { 
    loadSemuaData(); 
    inisialisasiTombolPrioritas(); 
};
