// Konfigurasi Endpoint Backend Google Apps Script
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyjKKp4maxqy3T4unEJ7plI4vvW09h_z0sqRSy6iIbCbVTJgDZkiX8Zy42Ry1M7g3-L/exec";

// Referensi Elemen DOM
const rawInput = document.getElementById("rawInput");
const qrGrid = document.getElementById("qrGrid");
const infoCount = document.getElementById("infoCount");
const btnFetchDb = document.getElementById("btnFetchDb");
const btnGenerate = document.getElementById("btnGenerate");
const btnClearInput = document.getElementById("btnClearInput");
const btnDownloadZip = document.getElementById("btnDownloadZip");
const onlyActiveCheck = document.getElementById("onlyActiveCheck");
const cardCounterBadge = document.getElementById("cardCounterBadge");
const searchCardInput = document.getElementById("searchCardInput");

let dbPlayers = [];
let generatedItems = [];

// Parsing Teks Input Per Baris menjadi Objek Pemain
function parseLines(text) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, idx) => {
      const parts = line.split(/\t|\||,/).map((p) => p.trim());
      return {
        no: idx + 1,
        token: parts[0] || "",
        name: parts[1] || parts[0] || "",
        position: parts[2] || ""
      };
    })
    .filter((item) => item.token);
}

// Pembersihan Nama File Unduhan
function sanitizeFilename(str) {
  return String(str || "qr")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "qr";
}

// Ambil Gambar QR dari API QRServer
function loadQrImage(tokenText) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal memuat gambar QR"));
    img.src = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=6&data=" + encodeURIComponent(tokenText);
  });
}

// Render Gambar PNG Bersih (Hanya QR Code dengan Margin Putih)
async function renderExportCanvas(item) {
  const canvas = document.createElement("canvas");
  canvas.width = 340;
  canvas.height = 340;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  try {
    const qrImg = await loadQrImage(item.token);
    ctx.drawImage(qrImg, 20, 20, 300, 300);
  } catch (e) {
    ctx.fillStyle = "#fef2f2";
    ctx.fillRect(20, 20, 300, 300);
    ctx.fillStyle = "#b91c1c";
    ctx.font = "15px system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("QR gagal dimuat", 170, 175);
  }

  return canvas;
}

// Helper Unduh File dari Data URL
function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Bangun Kartu Preview di Grid
async function buildCardsFromItems(items) {
  qrGrid.innerHTML = "";
  generatedItems = [];
  btnDownloadZip.disabled = true;
  cardCounterBadge.textContent = "0 Kartu";

  if (!items || items.length === 0) {
    infoCount.textContent = "0 kartu";
    qrGrid.innerHTML = `<div class="empty-grid-state">Tidak ada data baris yang valid untuk dibuatkan kartu QR.</div>`;
    return;
  }

  infoCount.textContent = `Membuat ${items.length} preview...`;

  for (const item of items) {
    const card = document.createElement("div");
    card.className = "qr-card";
    card.dataset.search = `${item.token} ${item.name} ${item.position}`.toLowerCase();

    const canvas = await renderExportCanvas(item);
    const filename = `${String(item.no).padStart(2, "0")}_${sanitizeFilename(item.name)}.png`;
    generatedItems.push({ ...item, canvas, filename });

    const noEl = document.createElement("div");
    noEl.className = "player-no";
    noEl.textContent = `No. ${item.no}`;

    const nameEl = document.createElement("div");
    nameEl.className = "player-name";
    nameEl.textContent = item.name;

    const btnSingle = document.createElement("button");
    btnSingle.type = "button";
    btnSingle.className = "btn btn-ghost";
    btnSingle.textContent = "Unduh";
    btnSingle.addEventListener("click", () => {
      downloadDataUrl(canvas.toDataURL("image/png"), filename);
    });

    card.appendChild(canvas);
    card.appendChild(noEl);
    card.appendChild(nameEl);

    if (item.position) {
      const posEl = document.createElement("div");
      posEl.className = "player-pos";
      posEl.textContent = item.position;
      card.appendChild(posEl);
    }

    card.appendChild(btnSingle);
    qrGrid.appendChild(card);
  }

  infoCount.textContent = `${generatedItems.length} kartu siap diunduh`;
  cardCounterBadge.textContent = `${generatedItems.length} Kartu`;
  btnDownloadZip.disabled = generatedItems.length === 0;
  filterPreviewCards();
}

// Filter Instan Kartu Preview Berdasarkan Pencarian
function filterPreviewCards() {
  const keyword = (searchCardInput.value || "").trim().toLowerCase();
  document.querySelectorAll(".qr-card").forEach((card) => {
    const match = !keyword || (card.dataset.search || "").includes(keyword);
    card.classList.toggle("is-hidden", !match);
  });
}

// Filter Data Pemain dari Database (Aktif / Semua)
function filterDbPlayers() {
  const filterActive = onlyActiveCheck.checked;
  return dbPlayers
    .filter((p) => p.qr_token)
    .filter((p) => !filterActive || String(p.status || "").trim().toLowerCase() === "active")
    .map((p, idx) => ({
      no: idx + 1,
      token: String(p.qr_token || "").trim(),
      name: String(p.player_name || "").trim(),
      position: String(p.position || "").trim()
    }));
}

// Ambil Daftar Pemain dari Google Sheets
async function fetchPlayersFromDb() {
  btnFetchDb.disabled = true;
  infoCount.textContent = "Mengambil data dari database...";
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=players`);
    const result = await res.json();
    if (!result.ok) throw new Error(result.message || "Gagal mengambil data pemain");

    dbPlayers = Array.isArray(result.data) ? result.data : [];
    const filtered = filterDbPlayers();
    rawInput.value = filtered
      .map((x) => `${x.token} | ${x.name} | ${x.position}`)
      .join("\n");
    infoCount.textContent = `${filtered.length} data dimuat — klik "Tampilkan Preview".`;
  } catch (err) {
    infoCount.textContent = "Gagal ambil DB: " + err.message;
  } finally {
    btnFetchDb.disabled = false;
  }
}

// Kompresi dan Unduh Semua Kartu QR ke Format ZIP
async function exportAllAsZip() {
  if (generatedItems.length === 0) return;

  if (typeof JSZip === "undefined") {
    infoCount.textContent = "Pustaka JSZip gagal dimuat. Coba refresh halaman.";
    return;
  }

  const zip = new JSZip();
  for (const entry of generatedItems) {
    const base64 = entry.canvas.toDataURL("image/png").split(",")[1];
    zip.file(entry.filename, base64, { base64: true });
  }

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, "qr_pemain_futsal_itda.zip");
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Event Listener Tombol Utama
btnFetchDb.addEventListener("click", fetchPlayersFromDb);
btnGenerate.addEventListener("click", () => buildCardsFromItems(parseLines(rawInput.value)));
btnClearInput.addEventListener("click", () => {
  rawInput.value = "";
  qrGrid.innerHTML = `<div class="empty-grid-state">Input dibersihkan. Klik <strong>Ambil dari Database</strong> atau tempel daftar baru.</div>`;
  generatedItems = [];
  btnDownloadZip.disabled = true;
  cardCounterBadge.textContent = "0 Kartu";
  infoCount.textContent = "Input dikosongkan.";
});
btnDownloadZip.addEventListener("click", exportAllAsZip);
searchCardInput.addEventListener("input", filterPreviewCards);