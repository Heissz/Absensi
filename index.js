// Konfigurasi Endpoint Backend Google Apps Script
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbyjKKp4maxqy3T4unEJ7plI4vvW09h_z0sqRSy6iIbCbVTJgDZkiX8Zy42Ry1M7g3-L/exec";

// Elemen DOM Utama
const html5QrCode = new Html5Qrcode("reader");
const sessionInput = document.getElementById("sessionInput");
const scannerIdInput = document.getElementById("scannerIdInput");
const pinInput = document.getElementById("pinInput");
const cameraSelect = document.getElementById("cameraSelect");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const statusBox = document.getElementById("statusBox");
const scanHistory = document.getElementById("scanHistory");
const sessionScanCount = document.getElementById("sessionScanCount");
const cameraBadge = document.getElementById("cameraBadge");
const cameraBadgeText = document.getElementById("cameraBadgeText");
const btnToggleSound = document.getElementById("btnToggleSound");
const soundBadgeText = document.getElementById("soundBadgeText");
const btnSyncOffline = document.getElementById("btnSyncOffline");
const offlineBadgeText = document.getElementById("offlineBadgeText");
const btnUndoLast = document.getElementById("btnUndoLast");

// Elemen Overlay Kartu Konfirmasi Besar
const scanResultOverlay = document.getElementById("scanResultOverlay");
const scanResultCard = document.getElementById("scanResultCard");
const scanResultIcon = document.getElementById("scanResultIcon");
const scanResultTitle = document.getElementById("scanResultTitle");
const scanResultName = document.getElementById("scanResultName");
const scanResultMeta = document.getElementById("scanResultMeta");
const scanResultSub = document.getElementById("scanResultSub");

// Elemen DOM Absensi Manual
const manualPlayerSearch = document.getElementById("manualPlayerSearch");
const manualSelectedToken = document.getElementById("manualSelectedToken");
const manualSuggestionList = document.getElementById("manualSuggestionList");
const manualStatusSelect = document.getElementById("manualStatusSelect");
const manualNoteInput = document.getElementById("manualNoteInput");
const btnManualSubmit = document.getElementById("btnManualSubmit");
const btnRefreshPlayers = document.getElementById("btnRefreshPlayers");

// Elemen DOM Kelola Skuad & Ganti PIN
const newPlayerToken = document.getElementById("newPlayerToken");
const newPlayerName = document.getElementById("newPlayerName");
const newPlayerPos = document.getElementById("newPlayerPos");
const newPlayerStatus = document.getElementById("newPlayerStatus");
const btnAutoToken = document.getElementById("btnAutoToken");
const btnAddPlayer = document.getElementById("btnAddPlayer");
const addPlayerFeedback = document.getElementById("addPlayerFeedback");
const oldPinChangeInput = document.getElementById("oldPinChangeInput");
const newPinChangeInput = document.getElementById("newPinChangeInput");
const btnChangePin = document.getElementById("btnChangePin");
const pinChangeFeedback = document.getElementById("pinChangeFeedback");
const searchSkuadInput = document.getElementById("searchSkuadInput");
const btnReloadSkuadTable = document.getElementById("btnReloadSkuadTable");
const skuadTableBody = document.getElementById("skuadTableBody");
const skuadCountBadge = document.getElementById("skuadCountBadge");

let isScanning = false;
let isSending = false;
let soundEnabled = true;
let lastQuickToken = "";
let lastQuickTime = 0;
let okScanCount = 0;
let overlayTimer = null;
let allPlayersList = [];
let activePlayersList = [];
let cachedHistoryRows = [];
let cachedRekapRows = [];
let lastRecordedEntry = null;
const QUICK_BOUNCE_MS = 3000;
const OFFLINE_QUEUE_KEY = "futsal_offline_attendance_queue";

// Simpan & Muat Identitas Panitia + PIN (Default: 1234)
scannerIdInput.value = localStorage.getItem("futsal_scanner_id") || "PANITIA-01";
const savedPin = localStorage.getItem("futsal_scanner_pin");
pinInput.value = savedPin !== null ? savedPin : "1234";

scannerIdInput.addEventListener("input", () => {
  localStorage.setItem("futsal_scanner_id", scannerIdInput.value.trim() || "PANITIA-01");
});
pinInput.addEventListener("input", () => {
  localStorage.setItem("futsal_scanner_pin", pinInput.value.trim());
});

// Kartu Konfirmasi Besar Saat Scan / Absensi
function showScanPopup({ isOk, title, name, meta, sub }) {
  if (!scanResultOverlay) return;
  if (overlayTimer) clearTimeout(overlayTimer);

  scanResultCard.className = "scan-result-card " + (isOk ? "is-ok" : "is-err");
  scanResultIcon.textContent = isOk ? "✓" : "!";
  scanResultTitle.textContent = title || (isOk ? "Tercatat Hadir" : "Gagal");
  scanResultName.textContent = name || "-";

  if (meta) {
    scanResultMeta.textContent = meta;
    scanResultMeta.classList.remove("is-hidden");
  } else {
    scanResultMeta.classList.add("is-hidden");
  }

  scanResultSub.textContent = sub || "";
  scanResultOverlay.classList.remove("is-hidden");

  overlayTimer = setTimeout(() => {
    scanResultOverlay.classList.add("is-hidden");
  }, 2400);
}

scanResultOverlay.addEventListener("click", () => {
  if (overlayTimer) clearTimeout(overlayTimer);
  scanResultOverlay.classList.add("is-hidden");
});

// Toggle Audio & Getar Haptic
btnToggleSound.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  btnToggleSound.classList.toggle("is-on", soundEnabled);
  soundBadgeText.textContent = soundEnabled ? "Audio Aktif" : "Audio Bisu";
});

function playFeedback(isSuccess) {
  if (navigator.vibrate) {
    navigator.vibrate(isSuccess ? [80] : [120, 60, 120]);
  }
  if (!soundEnabled) return;

  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (isSuccess) {
      osc.type = "sine";
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(1174, ctx.currentTime + 0.12);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.start();
      osc.stop(ctx.currentTime + 0.22);
    } else {
      osc.type = "triangle";
      osc.frequency.setValueAtTime(240, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(170, ctx.currentTime + 0.26);
      gain.gain.setValueAtTime(0.22, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start();
      osc.stop(ctx.currentTime + 0.3);
    }
  } catch (e) {
    // Abaikan jika browser memblokir audio otomatis
  }
}

// Preset Sesi Cepat
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

// Navigasi Panel Sidebar
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
    } else if (targetId === "panel-skuad") {
      loadAllPlayersData(true);
    }
  });
});

function setStatus(message, type = "") {
  statusBox.textContent = message;
  statusBox.className = "status-box" + (type ? ` status-${type}` : "");
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

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
  li.style.color = ok ? "#15803d" : "#b91c1c";
  scanHistory.prepend(li);
}

// Manajemen Antrean Offline (localStorage)
function getOfflineQueue() {
  try {
    return JSON.parse(localStorage.getItem(OFFLINE_QUEUE_KEY) || "[]");
  } catch (e) {
    return [];
  }
}

function saveOfflineQueue(queue) {
  localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
  updateOfflineBadge();
}

function updateOfflineBadge() {
  const queue = getOfflineQueue();
  if (queue.length > 0) {
    btnSyncOffline.classList.remove("is-hidden");
    offlineBadgeText.textContent = `${queue.length} Antrean Offline`;
  } else {
    btnSyncOffline.classList.add("is-hidden");
  }
}

async function syncOfflineQueue() {
  const queue = getOfflineQueue();
  if (queue.length === 0 || !navigator.onLine) return;

  btnSyncOffline.disabled = true;
  offlineBadgeText.textContent = "Menyinkronkan...";
  const remaining = [];

  for (const item of queue) {
    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(item)
      });
      const result = await res.json();
      if (result.ok) {
        addHistoryItem(item.qr_token, `${result.player_name || item.qr_token} [Sinkron Offline]`, true);
      }
    } catch (err) {
      remaining.push(item);
    }
  }

  saveOfflineQueue(remaining);
  btnSyncOffline.disabled = false;
  if (remaining.length === 0) {
    setStatus("Seluruh antrean offline berhasil disinkronkan ke database.", "ok");
  }
}

btnSyncOffline.addEventListener("click", syncOfflineQueue);
window.addEventListener("online", syncOfflineQueue);

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

// Fungsi Inti Pengiriman Kehadiran (Scan QR & Absensi Manual)
async function submitAttendance({ token, attendanceStatus = "Hadir", note = "", sourceMode = "QR" }) {
  const cleanToken = String(token || "").trim();
  const sessionName = (sessionInput.value || "Sesi Umum").trim();
  const scannerName = (scannerIdInput.value || "PANITIA-01").trim();
  const pinCode = (pinInput.value || "").trim();

  if (!cleanToken || isSending) return;

  const payload = {
    action: "record",
    qr_token: cleanToken,
    session_id: sessionName,
    scanner_id: sourceMode === "MANUAL" ? `${scannerName} (Manual)` : scannerName,
    status_kehadiran: attendanceStatus,
    keterangan: note || (sourceMode === "MANUAL" ? `Manual (${attendanceStatus})` : "Scan QR"),
    pin: pinCode
  };

  isSending = true;
  btnManualSubmit.disabled = true;
  setStatus(`Mencatat ${cleanToken} (${attendanceStatus}) untuk "${sessionName}"...`, "wait");

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.ok) {
      playFeedback(true);
      setStatus(result.message, "ok");
      const statusTag = attendanceStatus !== "Hadir" ? ` [${attendanceStatus}]` : "";
      addHistoryItem(cleanToken, `${result.player_name || cleanToken}${statusTag} (${sessionName})`, true);

      const metaLabel = result.position ? `${cleanToken} • ${result.position}` : cleanToken;
      showScanPopup({
        isOk: true,
        title: `Tercatat ${attendanceStatus}`,
        name: result.player_name || cleanToken,
        meta: metaLabel,
        sub: sessionName
      });

      lastRecordedEntry = {
        qr_token: cleanToken,
        session_id: sessionName,
        tanggal: result.tanggal || "",
        player_name: result.player_name || cleanToken
      };
      btnUndoLast.disabled = false;
    } else {
      playFeedback(false);
      setStatus(result.message || "Gagal mencatat absensi", "err");
      addHistoryItem(cleanToken, result.message || "Ditolak", false);

      showScanPopup({
        isOk: false,
        title: "Absensi Ditolak",
        name: result.player_name || cleanToken,
        meta: cleanToken,
        sub: result.message || "Gagal mencatat absensi"
      });
    }
  } catch (err) {
    // Simpan ke Antrean Offline jika gagal koneksi jaringan
    const queue = getOfflineQueue();
    queue.push(payload);
    saveOfflineQueue(queue);

    playFeedback(true);
    setStatus(`Offline: ${cleanToken} (${attendanceStatus}) disimpan di antrean perangkat.`, "wait");
    addHistoryItem(cleanToken, `Antrean Offline [${attendanceStatus}] (${sessionName})`, true);

    showScanPopup({
      isOk: true,
      title: `Antrean Offline (${attendanceStatus})`,
      name: cleanToken,
      meta: "Tersimpan di perangkat",
      sub: sessionName
    });
  } finally {
    isSending = false;
    btnManualSubmit.disabled = false;
  }
}

// Batalkan Scan Terakhir (Undo)
btnUndoLast.addEventListener("click", async () => {
  if (!lastRecordedEntry || isSending) return;

  isSending = true;
  btnUndoLast.disabled = true;
  setStatus(`Membatalkan catatan terakhir untuk ${lastRecordedEntry.player_name}...`, "wait");

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "undo",
        qr_token: lastRecordedEntry.qr_token,
        session_id: lastRecordedEntry.session_id,
        tanggal: lastRecordedEntry.tanggal,
        pin: (pinInput.value || "").trim()
      })
    });

    const result = await res.json();
    if (result.ok) {
      setStatus(result.message, "ok");
      addHistoryItem(lastRecordedEntry.qr_token, `DIBATALKAN (${lastRecordedEntry.player_name})`, false);
      lastRecordedEntry = null;
    } else {
      setStatus(result.message || "Gagal membatalkan catatan terakhir", "err");
      btnUndoLast.disabled = false;
    }
  } catch (err) {
    setStatus("Error koneksi saat membatalkan: " + err.message, "err");
    btnUndoLast.disabled = false;
  } finally {
    isSending = false;
  }
});

// Callback Pemindai QR
async function onQrDecoded(decodedText) {
  const token = decodedText.trim();
  const now = Date.now();

  if (!token || isSending) return;
  if (token === lastQuickToken && (now - lastQuickTime) < QUICK_BOUNCE_MS) return;

  lastQuickToken = token;
  lastQuickTime = now;
  await submitAttendance({
    token,
    attendanceStatus: "Hadir",
    note: "Scan QR",
    sourceMode: "QR"
  });
}

// Muat Seluruh Data Skuad (untuk Absensi Manual & Panel Kelola Skuad)
async function loadAllPlayersData(renderSkuadPanel = false) {
  manualPlayerSearch.placeholder = "Memuat daftar skuad...";
  try {
    const res = await fetch(`${APPS_SCRIPT_URL}?action=players`);
    const result = await res.json();
    if (!result.ok) throw new Error(result.message || "Gagal memuat pemain");

    allPlayersList = Array.isArray(result.data) ? result.data : [];
    activePlayersList = allPlayersList.filter(
      (p) => p.qr_token && String(p.status || "").trim().toLowerCase() === "active"
    );
    manualPlayerSearch.placeholder = `Ketik nama pemain (${activePlayersList.length} skuad aktif)...`;

    if (renderSkuadPanel) {
      renderSkuadTable();
      suggestNextToken();
    }
  } catch (err) {
    manualPlayerSearch.placeholder = "Gagal memuat skuad — ketik token langsung";
  }
}

// Pencarian Ketik Nama Pemain untuk Absensi Manual
function renderPlayerSuggestions(queryText) {
  const q = String(queryText || "").trim().toLowerCase();
  if (!q) {
    manualSuggestionList.classList.add("is-hidden");
    return;
  }

  const matches = activePlayersList.filter((p) => {
    const name = String(p.player_name || "").toLowerCase();
    const token = String(p.qr_token || "").toLowerCase();
    const pos = String(p.position || "").toLowerCase();
    return name.includes(q) || token.includes(q) || pos.includes(q);
  });

  if (matches.length === 0) {
    manualSuggestionList.innerHTML = `<li class="meta-muted">Pemain tidak ditemukan.</li>`;
    manualSuggestionList.classList.remove("is-hidden");
    return;
  }

  manualSuggestionList.innerHTML = matches
    .slice(0, 10)
    .map((p) => `
      <li data-token="${escapeHtml(p.qr_token)}" data-name="${escapeHtml(p.player_name)}">
        <span><strong>${escapeHtml(p.player_name)}</strong> <span class="meta-muted">(${escapeHtml(p.qr_token)})</span></span>
        ${p.position ? `<span class="pos-pill">${escapeHtml(p.position)}</span>` : ""}
      </li>
    `)
    .join("");

  manualSuggestionList.classList.remove("is-hidden");
}

manualPlayerSearch.addEventListener("input", () => {
  manualSelectedToken.value = "";
  renderPlayerSuggestions(manualPlayerSearch.value);
});

manualPlayerSearch.addEventListener("focus", () => {
  if (manualPlayerSearch.value.trim()) {
    renderPlayerSuggestions(manualPlayerSearch.value);
  }
});

manualSuggestionList.addEventListener("click", (e) => {
  const item = e.target.closest("li[data-token]");
  if (!item) return;
  manualSelectedToken.value = item.getAttribute("data-token");
  manualPlayerSearch.value = `${item.getAttribute("data-name")} (${manualSelectedToken.value})`;
  manualSuggestionList.classList.add("is-hidden");
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".autocomplete-wrap")) {
    manualSuggestionList.classList.add("is-hidden");
  }
});

btnManualSubmit.addEventListener("click", async () => {
  let targetToken = manualSelectedToken.value.trim();

  if (!targetToken) {
    const rawTyped = manualPlayerSearch.value.trim();
    const exactMatch = activePlayersList.find(
      (p) =>
        String(p.qr_token || "").toLowerCase() === rawTyped.toLowerCase() ||
        String(p.player_name || "").toLowerCase() === rawTyped.toLowerCase()
    );
    targetToken = exactMatch ? String(exactMatch.qr_token).trim() : rawTyped;
  }

  if (!targetToken) {
    setStatus("Ketik dan pilih nama pemain terlebih dahulu.", "err");
    return;
  }

  const chosenStatus = manualStatusSelect.value || "Hadir";
  const noteText = manualNoteInput.value.trim();

  await submitAttendance({
    token: targetToken,
    attendanceStatus: chosenStatus,
    note: noteText,
    sourceMode: "MANUAL"
  });

  manualPlayerSearch.value = "";
  manualSelectedToken.value = "";
  manualNoteInput.value = "";
  manualStatusSelect.value = "Hadir";
});

btnRefreshPlayers.addEventListener("click", () => loadAllPlayersData(false));

// Panel Kelola Skuad: Auto-Generate Token Berikutnya
function suggestNextToken() {
  let maxNum = 0;
  allPlayersList.forEach((p) => {
    const match = String(p.qr_token || "").match(/(\d+)$/);
    if (match) {
      const n = parseInt(match[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });
  const nextNum = String(maxNum + 1).padStart(3, "0");
  newPlayerToken.value = `PLY-ITDA-${nextNum}`;
}

btnAutoToken.addEventListener("click", suggestNextToken);

// Tambah Pemain Baru ke Spreadsheet
btnAddPlayer.addEventListener("click", async () => {
  const token = newPlayerToken.value.trim();
  const name = newPlayerName.value.trim();
  const position = newPlayerPos.value.trim();
  const status = newPlayerStatus.value.trim();
  const pin = (pinInput.value || "").trim();

  if (!token || !name) {
    addPlayerFeedback.textContent = "Token QR dan Nama Pemain wajib diisi.";
    addPlayerFeedback.style.color = "#b91c1c";
    return;
  }

  btnAddPlayer.disabled = true;
  addPlayerFeedback.textContent = "Menyimpan pemain baru...";
  addPlayerFeedback.style.color = "#475569";

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "add_player",
        qr_token: token,
        player_name: name,
        position: position,
        status: status,
        pin: pin
      })
    });
    const result = await res.json();
    if (result.ok) {
      addPlayerFeedback.textContent = result.message;
      addPlayerFeedback.style.color = "#15803d";
      newPlayerName.value = "";
      await loadAllPlayersData(true);
    } else {
      addPlayerFeedback.textContent = result.message || "Gagal menambah pemain.";
      addPlayerFeedback.style.color = "#b91c1c";
    }
  } catch (err) {
    addPlayerFeedback.textContent = "Error jaringan: " + err.message;
    addPlayerFeedback.style.color = "#b91c1c";
  } finally {
    btnAddPlayer.disabled = false;
  }
});

// Ubah PIN Keamanan Panitia di Spreadsheet
btnChangePin.addEventListener("click", async () => {
  const oldPin = oldPinChangeInput.value.trim();
  const newPin = newPinChangeInput.value.trim();

  if (!oldPin || !newPin) {
    pinChangeFeedback.textContent = "PIN lama dan PIN baru wajib diisi.";
    pinChangeFeedback.style.color = "#b91c1c";
    return;
  }

  btnChangePin.disabled = true;
  pinChangeFeedback.textContent = "Memperbarui PIN...";
  pinChangeFeedback.style.color = "#475569";

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "change_pin",
        pin: oldPin,
        new_pin: newPin
      })
    });
    const result = await res.json();
    if (result.ok) {
      pinChangeFeedback.textContent = result.message;
      pinChangeFeedback.style.color = "#15803d";
      pinInput.value = newPin;
      localStorage.setItem("futsal_scanner_pin", newPin);
      oldPinChangeInput.value = "";
      newPinChangeInput.value = "";
    } else {
      pinChangeFeedback.textContent = result.message || "Gagal mengubah PIN.";
      pinChangeFeedback.style.color = "#b91c1c";
    }
  } catch (err) {
    pinChangeFeedback.textContent = "Error jaringan: " + err.message;
    pinChangeFeedback.style.color = "#b91c1c";
  } finally {
    btnChangePin.disabled = false;
  }
});

// Render Tabel Daftar Skuad & Tombol Ubah Status
function renderSkuadTable() {
  const keyword = (searchSkuadInput.value || "").trim().toLowerCase();
  const filtered = allPlayersList.filter((p) => {
    if (!keyword) return true;
    return [p.qr_token, p.player_name, p.position, p.status]
      .some((f) => String(f || "").toLowerCase().includes(keyword));
  });

  skuadCountBadge.textContent = `${allPlayersList.length} Pemain (${activePlayersList.length} Aktif)`;

  if (filtered.length === 0) {
    skuadTableBody.innerHTML = `<tr><td colspan="5">Data pemain tidak ditemukan.</td></tr>`;
    return;
  }

  skuadTableBody.innerHTML = filtered.map((p) => {
    const isActive = String(p.status || "").trim().toLowerCase() === "active";
    const nextStatus = isActive ? "inactive" : "active";
    return `
      <tr>
        <td class="meta-muted"><strong>${escapeHtml(p.qr_token)}</strong></td>
        <td><strong>${escapeHtml(p.player_name)}</strong></td>
        <td>${p.position ? `<span class="pos-pill">${escapeHtml(p.position)}</span>` : "-"}</td>
        <td><span class="att-badge ${isActive ? "att-hadir" : "att-alfa"}">${escapeHtml(p.status || "inactive")}</span></td>
        <td>
          <div style="display:flex; gap:6px; flex-wrap:wrap;">
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-toggle-player"
              data-token="${escapeHtml(p.qr_token)}"
              data-next="${nextStatus}"
            >
              ${isActive ? "Nonaktifkan" : "Aktifkan"}
            </button>
            <button
              type="button"
              class="btn btn-ghost btn-sm btn-delete-player"
              style="color:#b91c1c;"
              data-token="${escapeHtml(p.qr_token)}"
              data-name="${escapeHtml(p.player_name)}"
              data-armed="false"
            >
              Hapus
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");
}

skuadTableBody.addEventListener("click", async (e) => {
  const toggleBtn = e.target.closest(".btn-toggle-player");
  if (toggleBtn) {
    const targetToken = toggleBtn.getAttribute("data-token");
    const nextStatus = toggleBtn.getAttribute("data-next");
    const pin = (pinInput.value || "").trim();

    toggleBtn.disabled = true;
    toggleBtn.textContent = "Menyimpan...";

    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "toggle_player_status",
          qr_token: targetToken,
          new_status: nextStatus,
          pin: pin
        })
      });
      const result = await res.json();
      if (result.ok) {
        await loadAllPlayersData(true);
      } else {
        addPlayerFeedback.textContent = result.message || "Gagal mengubah status pemain.";
        addPlayerFeedback.style.color = "#b91c1c";
        toggleBtn.disabled = false;
        toggleBtn.textContent = nextStatus === "inactive" ? "Nonaktifkan" : "Aktifkan";
      }
    } catch (err) {
      toggleBtn.disabled = false;
    }
    return;
  }

  // Konfirmasi dua klik untuk Hapus Pemain Permanen (tanpa popup alert/confirm)
  const delBtn = e.target.closest(".btn-delete-player");
  if (delBtn) {
    const isArmed = delBtn.getAttribute("data-armed") === "true";
    if (!isArmed) {
      delBtn.setAttribute("data-armed", "true");
      delBtn.textContent = "Yakin Hapus?";
      delBtn.style.background = "#fef2f2";
      setTimeout(() => {
        if (document.body.contains(delBtn)) {
          delBtn.setAttribute("data-armed", "false");
          delBtn.textContent = "Hapus";
          delBtn.style.background = "";
        }
      }, 3500);
      return;
    }

    const targetToken = delBtn.getAttribute("data-token");
    const pin = (pinInput.value || "").trim();
    delBtn.disabled = true;
    delBtn.textContent = "Menghapus...";

    try {
      const res = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          action: "delete_player",
          qr_token: targetToken,
          pin: pin
        })
      });
      const result = await res.json();
      if (result.ok) {
        addPlayerFeedback.textContent = result.message;
        addPlayerFeedback.style.color = "#15803d";
        await loadAllPlayersData(true);
      } else {
        addPlayerFeedback.textContent = result.message || "Gagal menghapus pemain.";
        addPlayerFeedback.style.color = "#b91c1c";
        delBtn.disabled = false;
        delBtn.textContent = "Hapus";
      }
    } catch (err) {
      delBtn.disabled = false;
      delBtn.textContent = "Hapus";
    }
  }
});

searchSkuadInput.addEventListener("input", renderSkuadTable);
btnReloadSkuadTable.addEventListener("click", () => loadAllPlayersData(true));

// Kontrol Kamera
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

// Helper Badge Status Kehadiran
function renderStatusBadge(statusText) {
  const st = String(statusText || "Hadir").trim();
  const key = st.toLowerCase();
  let cls = "att-hadir";
  if (key === "izin") cls = "att-izin";
  else if (key === "sakit") cls = "att-sakit";
  else if (key === "alfa") cls = "att-alfa";
  return `<span class="att-badge ${cls}">${escapeHtml(st)}</span>`;
}

// Render Tabel Riwayat Absensi
function renderHistoryTable() {
  const historyStatus = document.getElementById("historyStatus");
  const tbody = document.getElementById("historyTableBody");
  const keyword = (document.getElementById("searchHistoryInput").value || "").trim().toLowerCase();
  const statusFilter = (document.getElementById("filterAttStatus").value || "").trim().toLowerCase();

  const filtered = cachedHistoryRows.filter((r) => {
    const rowStatus = String(r.status_kehadiran || "Hadir").toLowerCase();
    if (statusFilter && rowStatus !== statusFilter) return false;
    if (!keyword) return true;
    return [r.player_name, r.keterangan, r.qr_token, r.sesi, rowStatus]
      .some((field) => String(field || "").toLowerCase().includes(keyword));
  });

  historyStatus.textContent = `Menampilkan ${filtered.length} dari ${cachedHistoryRows.length} catatan.`;

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">Tidak ada data yang cocok dengan filter.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((r) => {
    const curStatus = r.status_kehadiran || "Hadir";
    return `
      <tr>
        <td>${escapeHtml(r.tanggal)}</td>
        <td>${escapeHtml(r.jam)}</td>
        <td>${escapeHtml(r.sesi)}</td>
        <td><strong>${escapeHtml(r.player_name)}</strong></td>
        <td>${renderStatusBadge(curStatus)}</td>
        <td>${escapeHtml(r.keterangan || "-")}</td>
        <td class="meta-muted">${escapeHtml(r.qr_token)}</td>
        <td>
          <select
            class="history-status-select"
            aria-label="Ubah status ${escapeHtml(r.player_name)}"
            data-token="${escapeHtml(r.qr_token)}"
            data-date="${escapeHtml(r.tanggal)}"
            data-session="${escapeHtml(r.sesi)}"
            data-prev="${escapeHtml(curStatus)}"
          >
            <option value="Hadir" ${curStatus === "Hadir" ? "selected" : ""}>Hadir</option>
            <option value="Izin" ${curStatus === "Izin" ? "selected" : ""}>Izin</option>
            <option value="Sakit" ${curStatus === "Sakit" ? "selected" : ""}>Sakit</option>
            <option value="Alfa" ${curStatus === "Alfa" ? "selected" : ""}>Alfa</option>
          </select>
        </td>
      </tr>
    `;
  }).join("");
}

// Listener Ubah Status Kehadiran Langsung di Tabel Riwayat
document.getElementById("historyTableBody").addEventListener("change", async (e) => {
  const selectEl = e.target.closest(".history-status-select");
  if (!selectEl) return;

  const historyStatus = document.getElementById("historyStatus");
  const targetToken = selectEl.getAttribute("data-token");
  const targetDate = selectEl.getAttribute("data-date");
  const targetSession = selectEl.getAttribute("data-session");
  const prevStatus = selectEl.getAttribute("data-prev");
  const newStatus = selectEl.value;
  const pin = (pinInput.value || "").trim();

  selectEl.disabled = true;
  historyStatus.textContent = `Memperbarui status ${targetToken} menjadi ${newStatus}...`;

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({
        action: "update_log_status",
        qr_token: targetToken,
        tanggal: targetDate,
        session_id: targetSession,
        new_status: newStatus,
        keterangan: `Diubah manual ke ${newStatus}`,
        pin: pin
      })
    });
    const result = await res.json();
    if (result.ok) {
      historyStatus.textContent = result.message;
      await loadRiwayatAbsensi();
    } else {
      historyStatus.textContent = result.message || "Gagal memperbarui status.";
      selectEl.value = prevStatus;
      selectEl.disabled = false;
    }
  } catch (err) {
    historyStatus.textContent = "Error koneksi: " + err.message;
    selectEl.value = prevStatus;
    selectEl.disabled = false;
  }
});

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

// Render Tabel Ringkasan Kehadiran (Hadir, Izin, Sakit, Alfa, Rasio)
function renderRekapTable() {
  const tbody = document.getElementById("rekapTableBody");
  const keyword = (document.getElementById("searchRekapInput").value || "").trim().toLowerCase();

  const filtered = cachedRekapRows.filter((r) => {
    if (!keyword) return true;
    return [r.player_name, r.position, r.qr_token]
      .some((field) => String(field || "").toLowerCase().includes(keyword));
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7">Data skuad tidak ditemukan.</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map((r) => {
    const pct = Math.min(100, Math.max(0, Number(r.persentase) || 0));
    return `
      <tr>
        <td><strong>${escapeHtml(r.player_name)}</strong><div class="meta-muted">${escapeHtml(r.qr_token)}</div></td>
        <td>${r.position ? `<span class="pos-pill">${escapeHtml(r.position)}</span>` : "-"}</td>
        <td><strong style="color:#15803d;">${r.hadir ?? 0}</strong></td>
        <td><strong style="color:#1d4ed8;">${r.izin ?? 0}</strong></td>
        <td><strong style="color:#b45309;">${r.sakit ?? 0}</strong></td>
        <td><strong style="color:#b91c1c;">${r.alfa ?? 0}</strong></td>
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

async function loadRekapKehadiran() {
  const summaryEl = document.getElementById("rekapSummary");
  const tbody = document.getElementById("rekapTableBody");
  const monthVal = document.getElementById("rekapMonthInput").value.trim();

  summaryEl.textContent = "Memuat...";
  tbody.innerHTML = "";

  try {
    const params = new URLSearchParams({ action: "rekap" });
    if (monthVal) params.set("month", monthVal);

    const res = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`);
    const result = await res.json();
    if (!result.ok) throw new Error(result.message || "Gagal memuat ringkasan");

    cachedRekapRows = result.data || [];
    summaryEl.textContent = `Total sesi: ${result.total_sessions || 0}`;
    renderRekapTable();
  } catch (err) {
    summaryEl.textContent = "Error: " + err.message;
  }
}

// Export ke CSV
function downloadCsvFile(filename, headers, rows) {
  const escapeCsv = (val) => `"${String(val ?? "").replace(/"/g, '""')}"`;
  const csvContent = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(","))
  ].join("\r\n");

  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

document.getElementById("btnExportHistoryCsv").addEventListener("click", () => {
  if (!cachedHistoryRows.length) return;
  const rows = cachedHistoryRows.map((r) => [
    r.tanggal, r.jam, r.sesi, r.player_name, r.status_kehadiran || "Hadir", r.keterangan || "-", r.qr_token
  ]);
  downloadCsvFile("riwayat_absensi_futsal_itda.csv", ["Tanggal", "Jam", "Sesi", "Nama", "Status", "Keterangan", "Token"], rows);
});

document.getElementById("btnExportRekapCsv").addEventListener("click", () => {
  if (!cachedRekapRows.length) return;
  const rows = cachedRekapRows.map((r) => [
    r.qr_token, r.player_name, r.position, r.hadir ?? 0, r.izin ?? 0, r.sakit ?? 0, r.alfa ?? 0, `${r.persentase}%`
  ]);
  downloadCsvFile("ringkasan_kehadiran_futsal_itda.csv", ["Token", "Nama", "Posisi", "Hadir", "Izin", "Sakit", "Alfa", "Rasio"], rows);
});

document.getElementById("btnLoadHistory").addEventListener("click", loadRiwayatAbsensi);
document.getElementById("btnLoadRekap").addEventListener("click", loadRekapKehadiran);
document.getElementById("searchHistoryInput").addEventListener("input", renderHistoryTable);
document.getElementById("filterAttStatus").addEventListener("change", renderHistoryTable);
document.getElementById("searchRekapInput").addEventListener("input", renderRekapTable);

// Inisialisasi Awal
updateOfflineBadge();
loadCameras();
loadAllPlayersData(false);