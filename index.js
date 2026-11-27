// Konfigurasi Endpoint Backend Google Apps Script
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyjKKp4maxqy3T4unEJ7plI4vvW09h_z0sqRSy6iIbCbVTJgDZkiX8Zy42Ry1M7g3-L/exec";
const SCANNER_ID = "PANITIA-01";

// Inisialisasi Pemindai & Elemen DOM
const html5QrCode = new Html5Qrcode("reader");
const sessionInput = document.getElementById("sessionInput");
const cameraSelect = document.getElementById("cameraSelect");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const statusBox = document.getElementById("statusBox");
const scanHistory = document.getElementById("scanHistory");
const sessionScanCount = document.getElementById("sessionScanCount");
const cameraBadge = document.getElementById("cameraBadge");
const cameraBadgeText = document.getElementById("cameraBadgeText");

let isScanning = false;
let isSending = false;
let lastQuickToken = "";
let lastQuickTime = 0;
let okScanCount = 0;
let cachedHistoryRows = [];
let cachedRekapRows = [];
const QUICK_BOUNCE_MS = 3000;

// Preset Sesi Cepat (Chips)
document.querySelectorAll(".chip-btn").forEach((chip) => {
  chip.addEventListener("click", () => {
    document.querySelectorAll(".chip-btn").forEach((c) => c.classList.remove("active"));
    chip.classList.add("active");
    sessionInput.value = chip.getAttribute("data-session") || "";
  });
});

sessionInput.addEventListener("input", () => {
  const val = sessionInput.value.trim().toLowerCase();
  document.querySelectorAll(".chip-btn").forEach((c) => {
    const preset = (c.getAttribute("data-session") || "").toLowerCase();
    c.classList.toggle("active", preset === val);
  });
});

// Navigasi Tab Panel
document.querySelectorAll(".nav-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));

    btn.classList.add("active");
    const targetId = btn.getAttribute("data-target");
    document.getElementById(targetId).classList.add("active");

    if (targetId === "panel-history") {
      loadRiwayatAbsensi();
    } else if (targetId === "panel-rekap") {
      loadRekapKehadiran();
    }
  });
});

// Helper Pembaruan Kotak Status
function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = "status-box" + (type ? ` status-${type}` : "");
}

// Sanitasi HTML untuk Mencegah XSS
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Tambah Log Pemindaian Sementara ke Daftar Sesi Ini
function addHistoryItem(token, label, ok) {
  const placeholder = scanHistory.querySelector(".empty-placeholder");
  if (placeholder) placeholder.remove();

  if (ok) {
    okScanCount += 1;
    sessionScanCount.textContent = `${okScanCount} Masuk`;
  }

  const li = document.createElement("li");
  const timeStr = new Date().toLocaleTimeString("id-ID", { hour12: false });
  li.innerHTML = `<span><strong>${escapeHtml(token)}</strong> — ${escapeHtml(label)}</span><span class="meta-muted">${timeStr}</span>`;
  li.style.color = ok ? "#047857" : "#b91c1c";
  scanHistory.prepend(li);
}

// Muat Daftar Perangkat Kamera
async function loadCameras() {
  try {
    const devices = await Html5Qrcode.getCameras();
    cameraSelect.innerHTML = "";
    if (!devices || devices.length === 0) {
      setStatus("Kamera tidak ditemukan.", "err");
      btnStart.disabled = true;
      return;
    }
    devices.forEach((device, idx) => {
      const opt = document.createElement("option");
      opt.value = device.id;
      opt.text = device.label || `Kamera ${idx + 1}`;
      if (/back|rear|belakang|environment/i.test(opt.text)) opt.selected = true;
      cameraSelect.appendChild(opt);
    });
  } catch (err) {
    setStatus("Izinkan akses kamera pada browser untuk memindai QR.", "err");
  }
}

// Callback Saat QR Berhasil Terbaca
async function onQrDecoded(decodedText) {
  const token = decodedText.trim();
  const sessionName = (sessionInput.value || "Sesi Umum").trim();
  const now = Date.now();

  if (!token || isSending) return;
  if (token === lastQuickToken && (now - lastQuickTime) < QUICK_BOUNCE_MS) return;

  isSending = true;
  lastQuickToken = token;
  lastQuickTime = now;
  setStatus(`Mengirim ${token} untuk sesi "${sessionName}"...`, "wait");

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        qr_token: token,
        session_id: sessionName,
        scanner_id: SCANNER_ID
      })
    });

    const result = await res.json();
    if (result.ok) {
      setStatus(result.message, "ok");
      const posLabel = result.position ? ` [${result.position}]` : "";
      addHistoryItem(token, `${result.player_name || "Hadir"}${posLabel} (${sessionName})`, true);
    } else {
      setStatus(result.message || "Gagal mencatat absensi", "err");
      addHistoryItem(token, result.message || "Ditolak", false);
    }
  } catch (err) {
    setStatus("Error koneksi: " + err.message, "err");
    addHistoryItem(token, "Error jaringan", false);
  } finally {
    isSending = false;
  }
}

// Kontrol Tombol Mulai & Hentikan Kamera
btnStart.addEventListener("click", async () => {
  const cameraId = cameraSelect.value;
  if (!cameraId || isScanning) return;
  try {
    await html5QrCode.start(
      cameraId,
      { fps: 10, qrbox: { width: 220, height: 220 } },
      onQrDecoded,
      () => {}
    );
    isScanning = true;
    btnStart.disabled = true;
    btnStop.disabled = false;
    cameraBadge.classList.add("is-live");
    cameraBadgeText.textContent = "Kamera Aktif";
    setStatus("Kamera aktif. Arahkan ke QR pemain...");
  } catch (err) {
    setStatus("Gagal membuka kamera: " + err, "err");
  }
});

btnStop.addEventListener("click", async () => {
  if (!isScanning) return;
  await html5QrCode.stop();
  isScanning = false;
  btnStart.disabled = false;
  btnStop.disabled = true;
  cameraBadge.classList.remove("is-live");
  cameraBadgeText.textContent = "Kamera Siaga";
  setStatus("Pemindaian dihentikan.");
});

// Render Tabel Riwayat Absensi (Mendukung Pencarian Cepat)
function renderHistoryTable() {
  const historyStatus = document.getElementById("historyStatus");
  const tbody = document.getElementById("historyTableBody");
  const keyword = (document.getElementById("searchHistoryInput").value || "").trim().toLowerCase();

  const filtered = cachedHistoryRows.filter((r) => {
    if (!keyword) return true;
    return [r.player_name, r.position, r.qr_token, r.sesi]
      .some((field) => String(field || "").toLowerCase().includes(keyword));
  });

  historyStatus.textContent = `Menampilkan ${filtered.length} dari ${cachedHistoryRows.length} catatan.`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">Tidak ada data yang cocok dengan filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((r) => `
    <tr>
      <td>${escapeHtml(r.tanggal)}</td>
      <td>${escapeHtml(r.jam)}</td>
      <td>${escapeHtml(r.sesi)}</td>
      <td><strong>${escapeHtml(r.player_name)}</strong></td>
      <td>${r.position ? `<span class="pos-pill">${escapeHtml(r.position)}</span>` : "-"}</td>
      <td class="meta-muted">${escapeHtml(r.qr_token)}</td>
    </tr>
  `).join("");
}

// Ambil Data Riwayat Absensi dari Spreadsheet
async function loadRiwayatAbsensi() {
  const historyStatus = document.getElementById("historyStatus");
  const tbody = document.getElementById("historyTableBody");
  const filterDate = document.getElementById("filterDate").value.trim();
  const filterSession = document.getElementById("filterSession").value.trim();

  historyStatus.textContent = "Memuat riwayat absensi...";
  tbody.innerHTML = "";

  try {
    const params = new URLSearchParams({ action: "history" });
    if (filterDate) params.set("date", filterDate);
    if (filterSession) params.set("session", filterSession);

    const res = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`);
    const result = await res.json();
    if (!result.ok) throw new Error(result.message || "Gagal memuat riwayat absensi");

    cachedHistoryRows = result.data || [];
    renderHistoryTable();
  } catch (err) {
    historyStatus.textContent = "Error: " + err.message;
  }
}

// Render Tabel Ringkasan Kehadiran (Mendukung Pencarian Cepat)
function renderRekapTable() {
  const tbody = document.getElementById("rekapTableBody");
  const keyword = (document.getElementById("searchRekapInput").value || "").trim().toLowerCase();

  const filtered = cachedRekapRows.filter((r) => {
    if (!keyword) return true;
    return [r.player_name, r.position, r.qr_token, r.status]
      .some((field) => String(field || "").toLowerCase().includes(keyword));
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6">Data skuad tidak ditemukan.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((r) => {
    const pct = Math.min(100, Math.max(0, Number(r.persentase) || 0));
    return `
      <tr>
        <td class="meta-muted">${escapeHtml(r.qr_token)}</td>
        <td><strong>${escapeHtml(r.player_name)}</strong></td>
        <td>${r.position ? `<span class="pos-pill">${escapeHtml(r.position)}</span>` : "-"}</td>
        <td>${escapeHtml(r.status)}</td>
        <td><strong>${r.hadir}</strong> / ${r.total_sesi}</td>
        <td>
          <div class="ratio-wrap">
            <div class="ratio-bar"><div class="ratio-fill" style="width:${pct}%"></div></div>
            <span>${pct}%</span>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

// Ambil Data Ringkasan / Rekap Kehadiran
async function loadRekapKehadiran() {
  const summaryEl = document.getElementById("rekapSummary");
  const tbody = document.getElementById("rekapTableBody");

  summaryEl.textContent = "Memuat...";
  tbody.innerHTML = "";

  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=rekap`);
    const result = await res.json();
    if (!result.ok) throw new Error(result.message || "Gagal memuat ringkasan");

    cachedRekapRows = result.data || [];
    summaryEl.textContent = `Total sesi: ${result.total_sessions || 0}`;
    renderRekapTable();
  } catch (err) {
    summaryEl.textContent = "Error: " + err.message;
  }
}

document.getElementById("btnLoadHistory").addEventListener("click", loadRiwayatAbsensi);
document.getElementById("btnLoadRekap").addEventListener("click", loadRekapKehadiran);
document.getElementById("searchHistoryInput").addEventListener("input", renderHistoryTable);
document.getElementById("searchRekapInput").addEventListener("input", renderRekapTable);

// Jalankan Inisialisasi Kamera saat Halaman Dimuat
loadCameras();