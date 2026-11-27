// Konfigurasi Endpoint Backend Google Apps Script
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyjKKp4maxqy3T4unEJ7plI4vvW09h_z0sqRSy6iIbCbVTJgDZkiX8Zy42Ry1M7g3-L/exec";

// Elemen DOM
const rawInput = document.getElementById("rawInput");
const qrGrid = document.getElementById("qrGrid");
const infoCount = document.getElementById("infoCount");
const cardCounterBadge = document.getElementById("cardCounterBadge");
const btnFetchDb = document.getElementById("btnFetchDb");
const btnGenerate = document.getElementById("btnGenerate");
const btnClearInput = document.getElementById("btnClearInput");
const btnPrintA4 = document.getElementById("btnPrintA4");
const btnDownloadZip = document.getElementById("btnDownloadZip");
const onlyActiveCheck = document.getElementById("onlyActiveCheck");
const includeLabelCheck = document.getElementById("includeLabelCheck");
const searchCardInput = document.getElementById("searchCardInput");

let dbPlayers = [];
let generatedItems = [];

// Parsing Teks Input Per Baris
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

function sanitizeFilename(str) {
  return String(str || "qr")
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "qr";
}

function loadFallbackQrImage(tokenText) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Gagal memuat QR cadangan"));
    img.src = "https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=6&data=" + encodeURIComponent(tokenText);
  });
}

// Render QR Lokal Secara Instan (dengan Fallback Otomatis)
async function renderExportCanvas(item) {
  const withLabel = includeLabelCheck ? includeLabelCheck.checked : true;
  const canvas = document.createElement("canvas");
  canvas.width = 340;
  canvas.height = withLabel ? 420 : 340;
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (typeof QRious !== "undefined") {
    const qrCanvas = document.createElement("canvas");
    new QRious({
      element: qrCanvas,
      value: item.token,
      size: 290,
      level: "M",
      background: "#ffffff",
      foreground: "#0f172a"
    });
    ctx.drawImage(qrCanvas, 25, 22, 290, 290);
  } else {
    try {
      const fallbackImg = await loadFallbackQrImage(item.token);
      ctx.drawImage(fallbackImg, 25, 22, 290, 290);
    } catch (e) {
      ctx.fillStyle = "#fef2f2";
      ctx.fillRect(25, 22, 290, 290);
      ctx.fillStyle = "#b91c1c";
      ctx.font = "600 14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("QR gagal dimuat", 170, 170);
    }
  }

  if (withLabel) {
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(28, 326);
    ctx.lineTo(312, 326);
    ctx.stroke();

    ctx.fillStyle = "#0f172a";
    ctx.font = "700 18px 'Plus Jakarta Sans', -apple-system, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(item.name.slice(0, 24), 170, 355);

    ctx.fillStyle = "#0f766e";
    ctx.font = "600 13px 'Plus Jakarta Sans', -apple-system, sans-serif";
    const subLabel = item.position ? `${item.token} • ${item.position}` : item.token;
    ctx.fillText(subLabel, 170, 380);

    ctx.fillStyle = "#94a3b8";
    ctx.font = "600 11px 'Plus Jakarta Sans', -apple-system, sans-serif";
    ctx.fillText("FUTSAL ITDA", 170, 402);
  }

  return canvas;
}

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
  if (btnDownloadZip) btnDownloadZip.disabled = true;
  if (btnPrintA4) btnPrintA4.disabled = true;
  if (cardCounterBadge) cardCounterBadge.textContent = "0 Kartu";

  if (!items || items.length === 0) {
    infoCount.textContent = "0 kartu — isi daftar pemain di kotak teks terlebih dahulu.";
    qrGrid.innerHTML = `<div class="empty-grid-state glass-panel">Tidak ada data baris yang valid. Klik <strong>Ambil dari Database</strong> atau ketik manual dengan format <code>TOKEN | NAMA | POSISI</code>.</div>`;
    return;
  }

  infoCount.textContent = `Membuat ${items.length} preview...`;

  for (const item of items) {
    const card = document.createElement("div");
    card.className = "qr-card";
    card.dataset.search = `${item.token} ${item.name} ${item.position}`.toLowerCase();

    const canvas = await renderExportCanvas(item);
    const filename = `${String(item.no).padStart(2, "0")}_${sanitizeFilename(item.token)}_${sanitizeFilename(item.name)}.png`;
    generatedItems.push({ ...item, canvas, filename });

    const noEl = document.createElement("div");
    noEl.className = "player-no";
    noEl.textContent = `No. ${item.no} • ${item.token}`;

    const nameEl = document.createElement("div");
    nameEl.className = "player-name";
    nameEl.textContent = item.name;

    const btnSingle = document.createElement("button");
    btnSingle.type = "button";
    btnSingle.className = "btn btn-ghost";
    btnSingle.textContent = "Unduh PNG";
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
  if (cardCounterBadge) cardCounterBadge.textContent = `${generatedItems.length} Kartu`;
  if (btnDownloadZip) btnDownloadZip.disabled = generatedItems.length === 0;
  if (btnPrintA4) btnPrintA4.disabled = generatedItems.length === 0;
  filterPreviewCards();
}

// Filter Instan Kartu Preview Berdasarkan Pencarian
function filterPreviewCards() {
  if (!searchCardInput) return;
  const keyword = (searchCardInput.value || "").trim().toLowerCase();
  document.querySelectorAll(".qr-card").forEach((card) => {
    const match = !keyword || (card.dataset.search || "").includes(keyword);
    card.classList.toggle("is-hidden", !match);
  });
}

// Filter Data dari Database
function filterDbPlayers() {
  const filterActive = onlyActiveCheck ? onlyActiveCheck.checked : true;
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

function applyDbFilterToTextarea() {
  if (dbPlayers.length === 0) return;
  const filtered = filterDbPlayers();
  rawInput.value = filtered
    .map((x) => `${x.token} | ${x.name} | ${x.position}`)
    .join("\n");
  infoCount.textContent = `${filtered.length} data dimuat — klik "Tampilkan Preview".`;
}

// Ambil Data Pemain dari Google Apps Script
async function fetchPlayersFromDb() {
  btnFetchDb.disabled = true;
  infoCount.textContent = "Mengambil data dari database...";
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=players`);
    const result = await res.json();
    if (!result.ok) throw new Error(result.message || "Gagal mengambil data pemain");

    dbPlayers = Array.isArray(result.data) ? result.data : [];
    applyDbFilterToTextarea();
  } catch (err) {
    infoCount.textContent = "Gagal ambil DB: " + err.message;
  } finally {
    btnFetchDb.disabled = false;
  }
}

// Unduh Semua Kartu QR dalam Satu Arsip .ZIP
async function exportAllAsZip() {
  if (generatedItems.length === 0) return;

  if (typeof JSZip === "undefined") {
    infoCount.textContent = "Pustaka JSZip belum termuat. Silakan muat ulang halaman.";
    return;
  }

  btnDownloadZip.disabled = true;
  const origText = btnDownloadZip.textContent;
  btnDownloadZip.textContent = "Mengompres ZIP...";

  try {
    const zip = new JSZip();
    for (const entry of generatedItems) {
      const base64 = entry.canvas.toDataURL("image/png").split(",")[1];
      zip.file(entry.filename, base64, { base64: true });
    }

    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    downloadDataUrl(url, "qr_pemain_futsal_itda.zip");
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } finally {
    btnDownloadZip.textContent = origText;
    btnDownloadZip.disabled = false;
  }
}

// Event Listeners (dengan pengaman null-safe)
if (btnFetchDb) btnFetchDb.addEventListener("click", fetchPlayersFromDb);
if (btnGenerate) btnGenerate.addEventListener("click", () => buildCardsFromItems(parseLines(rawInput.value)));
if (onlyActiveCheck) onlyActiveCheck.addEventListener("change", applyDbFilterToTextarea);
if (includeLabelCheck) {
  includeLabelCheck.addEventListener("change", () => {
    if (generatedItems.length > 0) {
      buildCardsFromItems(parseLines(rawInput.value));
    }
  });
}
if (btnClearInput) {
  btnClearInput.addEventListener("click", () => {
    rawInput.value = "";
    qrGrid.innerHTML = `<div class="empty-grid-state glass-panel">Input dibersihkan. Klik <strong>Ambil dari Database</strong> atau tempel daftar baru.</div>`;
    generatedItems = [];
    if (btnDownloadZip) btnDownloadZip.disabled = true;
    if (btnPrintA4) btnPrintA4.disabled = true;
    if (cardCounterBadge) cardCounterBadge.textContent = "0 Kartu";
    infoCount.textContent = "Input dikosongkan.";
  });
}
if (btnPrintA4) btnPrintA4.addEventListener("click", () => window.print());
if (btnDownloadZip) btnDownloadZip.addEventListener("click", exportAllAsZip);
if (searchCardInput) searchCardInput.addEventListener("input", filterPreviewCards);