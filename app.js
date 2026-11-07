"use strict";

const DB_NAME = "misure-progressi-db";
const DB_VERSION = 1;
const STORE = "records";
const SETTINGS = "settings";
const METRICS = {
  weight: { label: "Peso", unit: "kg", decimals: 2 },
  abdominalFold: { label: "Plica addominale", unit: "mm", decimals: 1 },
  glutes: { label: "Glutei", unit: "cm", decimals: 1 },
  waistNavel: { label: "Vita ombellico", unit: "cm", decimals: 1 },
  thighUnderGlute: { label: "Coscia sotto gluteo", unit: "cm", decimals: 1 }
};

let db;
let records = [];
let deferredInstallPrompt = null;
let pendingConfirmAction = null;

const $ = (id) => document.getElementById(id);
const fmtDate = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
const fmtShortDate = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" });

function localISODate(date = new Date()) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
}

function parseISODate(value) {
  return new Date(`${value}T12:00:00`);
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function formatValue(value, metricKey, fallback = "—") {
  if (value === null || value === undefined || !Number.isFinite(value)) return fallback;
  const metric = METRICS[metricKey];
  return `${value.toLocaleString("it-IT", { minimumFractionDigits: metric.decimals, maximumFractionDigits: metric.decimals })} ${metric.unit}`;
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE)) database.createObjectStore(STORE, { keyPath: "date" });
      if (!database.objectStoreNames.contains(SETTINGS)) database.createObjectStore(SETTINGS, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function storeRequest(storeName, mode, operation) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const request = operation(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seedInitialData() {
  const seeded = await storeRequest(SETTINGS, "readonly", (store) => store.get("excelSeeded"));
  if (seeded) return;
  const existing = await storeRequest(STORE, "readonly", (store) => store.get("2026-11-06"));
  if (!existing) {
    await storeRequest(STORE, "readwrite", (store) => store.put({
      date: "2026-11-06",
      weight: 76.2,
      abdominalFold: 14.5,
      glutes: null,
      waistNavel: null,
      thighUnderGlute: null,
      notes: "Valori iniziali importati dal calendario Excel",
      updatedAt: new Date().toISOString()
    }));
  }
  await storeRequest(SETTINGS, "readwrite", (store) => store.put({ key: "excelSeeded", value: true }));
}

async function loadRecords() {
  records = await storeRequest(STORE, "readonly", (store) => store.getAll());
  records.sort((a, b) => a.date.localeCompare(b.date));
  refreshAll();
}

function selectedRecord(date) {
  return records.find((record) => record.date === date);
}

function populateForm(date) {
  const record = selectedRecord(date);
  for (const key of Object.keys(METRICS)) $(key).value = record?.[key] ?? "";
  $("notes").value = record?.notes ?? "";
  $("recordState").textContent = record ? "Registrazione esistente" : "Nuova registrazione";
  $("deleteRecordBtn").classList.toggle("hidden", !record);
  $("formMessage").textContent = "";
}

async function saveRecord(event) {
  event.preventDefault();
  const date = $("date").value;
  if (!date) return showFormMessage("Seleziona una data.", true);
  const record = { date, notes: $("notes").value.trim(), updatedAt: new Date().toISOString() };
  let hasMeasurement = false;
  for (const key of Object.keys(METRICS)) {
    const input = $(key);
    record[key] = toNumber(input.value);
    if (input.value.trim() && record[key] === null) {
      return showFormMessage(`Il valore di ${METRICS[key].label.toLowerCase()} non è valido. Usa cifre e, se necessario, la virgola o il punto.`, true);
    }
    if (record[key] !== null) {
      const min = Number(input.dataset.min);
      const max = Number(input.dataset.max);
      if (record[key] < min || record[key] > max) {
        return showFormMessage(`${METRICS[key].label}: inserisci un valore compreso tra ${min} e ${max} ${METRICS[key].unit}.`, true);
      }
      hasMeasurement = true;
    }
  }
  if (!hasMeasurement && !record.notes) return showFormMessage("Inserisci almeno una misura o una nota.", true);
  await storeRequest(STORE, "readwrite", (store) => store.put(record));
  await loadRecords();
  populateForm(date);
  showFormMessage("Registrazione salvata.");
}

function showFormMessage(text, error = false) {
  $("formMessage").textContent = text;
  $("formMessage").classList.toggle("error", error);
}

function clearForm() {
  for (const key of Object.keys(METRICS)) $(key).value = "";
  $("notes").value = "";
  showFormMessage("Campi svuotati; la registrazione salvata non è stata modificata.");
}

function rollingAverage(data, metricKey, index) {
  const end = parseISODate(data[index].date);
  const start = new Date(end);
  start.setDate(start.getDate() - 6);
  const values = data
    .filter((record) => {
      const d = parseISODate(record.date);
      return d >= start && d <= end && Number.isFinite(record[metricKey]);
    })
    .map((record) => record[metricKey]);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function periodRecords() {
  const from = $("fromDate").value;
  const to = $("toDate").value;
  return records.filter((record) => (!from || record.date >= from) && (!to || record.date <= to));
}

function metricStats(data, metricKey) {
  const points = data.filter((r) => Number.isFinite(r[metricKey]));
  if (!points.length) return { avg: null, min: null, max: null, delta: null, count: 0 };
  const values = points.map((r) => r[metricKey]);
  return {
    avg: values.reduce((sum, value) => sum + value, 0) / values.length,
    min: Math.min(...values),
    max: Math.max(...values),
    delta: points.length > 1 ? points.at(-1)[metricKey] - points[0][metricKey] : null,
    count: points.length
  };
}

function refreshSummary(data) {
  const container = $("summaryCards");
  container.innerHTML = "";
  for (const [key, metric] of Object.entries(METRICS)) {
    const stats = metricStats(data, key);
    const card = document.createElement("article");
    card.className = "summary-card";
    const delta = stats.delta === null ? "Variazione —" : `Variazione ${stats.delta > 0 ? "+" : ""}${stats.delta.toLocaleString("it-IT", { maximumFractionDigits: metric.decimals })} ${metric.unit}`;
    card.innerHTML = `<span>${metric.label} · media periodo</span><strong>${formatValue(stats.avg, key)}</strong><small>${delta} · ${stats.count} rilev.</small>`;
    container.appendChild(card);
  }
}

function refreshTable(data) {
  const body = $("historyBody");
  body.innerHTML = "";
  [...data].reverse().forEach((record) => {
    const row = document.createElement("tr");
    row.innerHTML = `<td>${fmtDate.format(parseISODate(record.date))}</td>
      <td>${formatValue(record.weight, "weight")}</td><td>${formatValue(record.abdominalFold, "abdominalFold")}</td>
      <td>${formatValue(record.glutes, "glutes")}</td><td>${formatValue(record.waistNavel, "waistNavel")}</td>
      <td>${formatValue(record.thighUnderGlute, "thighUnderGlute")}</td><td>${escapeHtml(record.notes || "—")}</td>
      <td><button class="table-action" data-edit-date="${record.date}" type="button">Modifica</button></td>`;
    body.appendChild(row);
  });
  if (!data.length) body.innerHTML = `<tr><td colspan="8">Nessuna registrazione nel periodo selezionato.</td></tr>`;
}

function drawChart(data, metricKey) {
  const canvas = $("trendChart");
  const wrap = canvas.parentElement;
  const metric = METRICS[metricKey];
  const points = data.filter((record) => Number.isFinite(record[metricKey]));
  $("chartTitle").textContent = `${metric.label} e media mobile 7 giorni`;
  $("chartEmpty").classList.toggle("hidden", points.length > 0);
  wrap.classList.toggle("hidden", points.length === 0);
  if (!points.length) return;

  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);

  const chartPoints = points.map((point) => ({ ...point, avg: rollingAverage(records, metricKey, records.indexOf(point)) }));
  const allValues = chartPoints.flatMap((p) => [p[metricKey], p.avg]).filter(Number.isFinite);
  let min = Math.min(...allValues), max = Math.max(...allValues);
  const paddingValue = Math.max((max - min) * .15, metric.unit === "kg" ? .5 : 1);
  min -= paddingValue; max += paddingValue;
  const pad = { left: 52, right: 18, top: 18, bottom: 42 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (chartPoints.length === 1 ? plotW / 2 : i * plotW / (chartPoints.length - 1));
  const y = (value) => pad.top + (max - value) * plotH / (max - min || 1);

  ctx.font = "12px system-ui";
  ctx.strokeStyle = "#d8ddd7";
  ctx.fillStyle = "#64736f";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const value = max - (max - min) * i / 4;
    const yy = pad.top + plotH * i / 4;
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width - pad.right, yy); ctx.stroke();
    ctx.fillText(value.toFixed(metric.decimals), 4, yy + 4);
  }
  const labelIndexes = [...new Set([0, Math.floor((chartPoints.length - 1) / 2), chartPoints.length - 1])];
  labelIndexes.forEach((i) => {
    const text = fmtShortDate.format(parseISODate(chartPoints[i].date));
    ctx.fillText(text, Math.max(pad.left, Math.min(x(i) - 20, width - 55)), height - 13);
  });

  drawLine(ctx, chartPoints, (p) => p.avg, x, y, "#1d6257", 3);
  drawLine(ctx, chartPoints, (p) => p[metricKey], x, y, "#d8a84e", 2);
  chartPoints.forEach((p, i) => {
    ctx.fillStyle = "#d8a84e"; ctx.beginPath(); ctx.arc(x(i), y(p[metricKey]), 3.5, 0, Math.PI * 2); ctx.fill();
  });
}

function drawLine(ctx, points, getter, x, y, color, width) {
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.beginPath();
  let started = false;
  points.forEach((point, i) => {
    const value = getter(point);
    if (!Number.isFinite(value)) return;
    if (!started) { ctx.moveTo(x(i), y(value)); started = true; } else ctx.lineTo(x(i), y(value));
  });
  ctx.stroke();
}

function aggregatePeriodRecords() {
  const from = $("aggregateFromDate").value;
  const to = $("aggregateToDate").value;
  return records.filter((record) => (!from || record.date >= from) && (!to || record.date <= to));
}

function periodKey(dateValue, grouping) {
  const date = parseISODate(dateValue);
  if (grouping === "month") return `${dateValue.slice(0, 7)}-01`;
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return localISODate(date);
}

function aggregateByPeriod(data, metricKey, grouping) {
  const groups = new Map();
  data.forEach((record) => {
    if (!Number.isFinite(record[metricKey])) return;
    const key = periodKey(record.date, grouping);
    if (!groups.has(key)) groups.set(key, { key, sum: 0, count: 0 });
    const group = groups.get(key);
    group.sum += record[metricKey];
    group.count += 1;
  });
  return [...groups.values()].sort((a, b) => a.key.localeCompare(b.key)).map((group) => ({
    ...group,
    average: group.sum / group.count
  }));
}

function aggregateLabel(key, grouping, compact = false) {
  const start = parseISODate(key);
  if (grouping === "month") {
    return new Intl.DateTimeFormat("it-IT", { month: compact ? "short" : "long", year: "numeric" }).format(start);
  }
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const formatter = new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "short" });
  return compact ? formatter.format(start) : `${formatter.format(start)} – ${formatter.format(end)}`;
}

function refreshAggregateSummary(groups, metricKey, grouping) {
  const container = $("aggregateSummary");
  if (!groups.length) { container.innerHTML = ""; return; }
  const metric = METRICS[metricKey];
  const delta = groups.length > 1 ? groups.at(-1).average - groups[0].average : null;
  const label = grouping === "week" ? "settimane" : "mesi";
  container.innerHTML = `<span class="aggregate-chip"><strong>${groups.length}</strong> ${label} con dati</span>
    <span class="aggregate-chip">Prima media: <strong>${formatValue(groups[0].average, metricKey)}</strong></span>
    <span class="aggregate-chip">Ultima media: <strong>${formatValue(groups.at(-1).average, metricKey)}</strong></span>
    <span class="aggregate-chip">Variazione: <strong>${delta === null ? "—" : `${delta > 0 ? "+" : ""}${delta.toLocaleString("it-IT", { maximumFractionDigits: metric.decimals })} ${metric.unit}`}</strong></span>`;
}

function drawAggregateChart(groups, metricKey, grouping) {
  const canvas = $("aggregateTrendChart");
  const wrap = canvas.parentElement;
  const metric = METRICS[metricKey];
  const periodName = grouping === "week" ? "settimanale" : "mensile";
  $("aggregateChartTitle").textContent = `Media ${periodName} · ${metric.label}`;
  $("aggregateChartEmpty").classList.toggle("hidden", groups.length > 0);
  wrap.classList.toggle("hidden", groups.length === 0);
  if (!groups.length) return;

  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const width = wrap.clientWidth;
  const height = wrap.clientHeight;
  if (!width || !height) return;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  ctx.clearRect(0, 0, width, height);

  const values = groups.map((group) => group.average);
  let min = Math.min(...values), max = Math.max(...values);
  const paddingValue = Math.max((max - min) * .15, metric.unit === "kg" ? .5 : 1);
  min -= paddingValue; max += paddingValue;
  const pad = { left: 52, right: 18, top: 18, bottom: 46 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const x = (i) => pad.left + (groups.length === 1 ? plotW / 2 : i * plotW / (groups.length - 1));
  const y = (value) => pad.top + (max - value) * plotH / (max - min || 1);

  ctx.font = "12px system-ui";
  ctx.strokeStyle = "#d8ddd7";
  ctx.fillStyle = "#64736f";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const value = max - (max - min) * i / 4;
    const yy = pad.top + plotH * i / 4;
    ctx.beginPath(); ctx.moveTo(pad.left, yy); ctx.lineTo(width - pad.right, yy); ctx.stroke();
    ctx.fillText(value.toFixed(metric.decimals), 4, yy + 4);
  }
  const labelIndexes = [...new Set([0, Math.floor((groups.length - 1) / 2), groups.length - 1])];
  labelIndexes.forEach((i) => {
    const text = aggregateLabel(groups[i].key, grouping, true);
    ctx.fillText(text, Math.max(pad.left, Math.min(x(i) - 26, width - 75)), height - 13);
  });

  drawLine(ctx, groups, (group) => group.average, x, y, "#1d6257", 3);
  groups.forEach((group, i) => {
    ctx.fillStyle = "#d8a84e";
    ctx.beginPath(); ctx.arc(x(i), y(group.average), 4, 0, Math.PI * 2); ctx.fill();
  });
}

function refreshAggregateAnalysis() {
  const metricKey = $("aggregateMetricSelect").value;
  const grouping = $("aggregatePeriodSelect").value;
  const groups = aggregateByPeriod(aggregatePeriodRecords(), metricKey, grouping);
  refreshAggregateSummary(groups, metricKey, grouping);
  drawAggregateChart(groups, metricKey, grouping);
}

function refreshAnalysis() {
  const data = periodRecords();
  refreshSummary(data);
  refreshTable(data);
  drawChart(data, $("metricSelect").value);
}

function refreshOverview() {
  const weights = records.filter((r) => Number.isFinite(r.weight));
  const latest = weights.at(-1);
  $("latestWeight").textContent = latest ? formatValue(latest.weight, "weight") : "—";
  $("latestWeightDate").textContent = latest ? `Registrato il ${fmtDate.format(parseISODate(latest.date))}` : "Nessuna registrazione";
  $("archiveCount").textContent = `${records.length} ${records.length === 1 ? "registrazione" : "registrazioni"}`;
}

function refreshAll() {
  refreshOverview();
  refreshAnalysis();
  refreshAggregateAnalysis();
}

function csvEscape(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[";,\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function buildCsv(data) {
  const headers = ["date", "weight_kg", "abdominal_fold_mm", "glutes_cm", "waist_navel_cm", "thigh_under_glute_cm", "notes"];
  const lines = [headers.join(";")];
  data.forEach((r) => lines.push([r.date, r.weight, r.abdominalFold, r.glutes, r.waistNavel, r.thighUnderGlute, r.notes].map(csvEscape).join(";")));
  return `\ufeff${lines.join("\n")}`;
}

function downloadFile(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJson() {
  const payload = { app: "Misure & Progressi", version: 1, exportedAt: new Date().toISOString(), records };
  downloadFile(`misure-backup-${localISODate()}.json`, JSON.stringify(payload, null, 2), "application/json");
}

function exportCsv(data = records, suffix = "archivio") {
  downloadFile(`misure-${suffix}-${localISODate()}.csv`, buildCsv(data), "text/csv;charset=utf-8");
}

function parseCsv(text) {
  const rows = [];
  let row = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { field += '"'; i++; }
    else if (char === '"') quoted = !quoted;
    else if (char === ";" && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(field); if (row.some((cell) => cell.trim() !== "")) rows.push(row); row = []; field = "";
    } else field += char;
  }
  row.push(field); if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  if (rows.length < 2) return [];
  return rows.slice(1).map((cells) => ({
    date: cells[0]?.replace(/^\ufeff/, "").trim(), weight: toNumber(cells[1]), abdominalFold: toNumber(cells[2]),
    glutes: toNumber(cells[3]), waistNavel: toNumber(cells[4]), thighUnderGlute: toNumber(cells[5]), notes: cells[6] || ""
  }));
}

function normalizeImportedRecord(record) {
  if (!record || !/^\d{4}-\d{2}-\d{2}$/.test(record.date || "")) return null;
  const clean = { date: record.date, notes: String(record.notes || "").slice(0, 500), updatedAt: new Date().toISOString() };
  Object.keys(METRICS).forEach((key) => clean[key] = toNumber(record[key]));
  return clean;
}

async function importFile(file) {
  try {
    const text = await file.text();
    let imported;
    if (file.name.toLowerCase().endsWith(".json")) {
      const parsed = JSON.parse(text);
      imported = Array.isArray(parsed) ? parsed : parsed.records;
    } else imported = parseCsv(text);
    if (!Array.isArray(imported)) throw new Error("Formato non riconosciuto");
    const clean = imported.map(normalizeImportedRecord).filter(Boolean);
    if (!clean.length) throw new Error("Nessuna registrazione valida");
    const transaction = db.transaction(STORE, "readwrite");
    const store = transaction.objectStore(STORE);
    clean.forEach((record) => store.put(record));
    await new Promise((resolve, reject) => { transaction.oncomplete = resolve; transaction.onerror = () => reject(transaction.error); });
    await loadRecords();
    $("importMessage").textContent = `${clean.length} registrazioni importate o aggiornate.`;
    $("importMessage").classList.remove("error");
  } catch (error) {
    $("importMessage").textContent = "Importazione non riuscita: controlla che il file sia un backup JSON o CSV valido.";
    $("importMessage").classList.add("error");
  } finally { $("importFile").value = ""; }
}

function openConfirm({ title, text, requireWord = false, action }) {
  pendingConfirmAction = action;
  $("dialogTitle").textContent = title;
  $("dialogText").textContent = text;
  $("confirmLabel").classList.toggle("hidden", !requireWord);
  $("confirmInput").value = "";
  $("dialogConfirmBtn").disabled = requireWord;
  $("confirmDialog").showModal();
}

async function deleteCurrentRecord() {
  const date = $("date").value;
  await storeRequest(STORE, "readwrite", (store) => store.delete(date));
  await loadRecords(); populateForm(date); showFormMessage("Registrazione eliminata.");
}

async function deleteArchive() {
  await storeRequest(STORE, "readwrite", (store) => store.clear());
  await loadRecords(); populateForm($("date").value); $("importMessage").textContent = "Archivio cancellato.";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function setDefaultDates() {
  const today = localISODate();
  $("date").value = today;
  const yearStart = `${today.slice(0, 4)}-01-01`;
  $("fromDate").value = yearStart;
  $("toDate").value = today;
  $("aggregateFromDate").value = yearStart;
  $("aggregateToDate").value = today;
}

function switchTab(id) {
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === id));
  document.querySelectorAll(".panel").forEach((panel) => panel.classList.toggle("active", panel.id === id));
  if (id === "history") setTimeout(() => { refreshAnalysis(); refreshAggregateAnalysis(); }, 10);
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => tab.addEventListener("click", () => switchTab(tab.dataset.tab)));
  $("date").addEventListener("change", (e) => populateForm(e.target.value));
  $("entryForm").addEventListener("submit", saveRecord);
  $("clearFormBtn").addEventListener("click", clearForm);
  $("filterForm").addEventListener("submit", (e) => { e.preventDefault(); refreshAnalysis(); });
  $("metricSelect").addEventListener("change", refreshAnalysis);
  $("aggregateFilterForm").addEventListener("submit", (e) => { e.preventDefault(); refreshAggregateAnalysis(); });
  $("aggregateMetricSelect").addEventListener("change", refreshAggregateAnalysis);
  $("aggregatePeriodSelect").addEventListener("change", refreshAggregateAnalysis);
  $("historyBody").addEventListener("click", (e) => {
    const date = e.target.dataset.editDate;
    if (!date) return;
    $("date").value = date; populateForm(date); switchTab("entry"); window.scrollTo({ top: 0, behavior: "smooth" });
  });
  $("exportJsonBtn").addEventListener("click", exportJson);
  $("exportCsvBtn").addEventListener("click", () => exportCsv(records));
  $("exportPeriodCsvBtn").addEventListener("click", () => exportCsv(periodRecords(), "periodo"));
  $("importFile").addEventListener("change", (e) => e.target.files[0] && importFile(e.target.files[0]));
  $("deleteRecordBtn").addEventListener("click", () => openConfirm({ title: "Eliminare la registrazione?", text: `La registrazione del ${fmtDate.format(parseISODate($("date").value))} verrà eliminata.`, action: deleteCurrentRecord }));
  $("deleteArchiveBtn").addEventListener("click", () => openConfirm({ title: "Cancellare tutto l’archivio?", text: "L’operazione è definitiva. Esporta prima un backup se vuoi conservare i dati.", requireWord: true, action: deleteArchive }));
  $("confirmInput").addEventListener("input", (e) => $("dialogConfirmBtn").disabled = e.target.value.trim().toUpperCase() !== "CANCELLA");
  $("confirmDialog").addEventListener("close", async () => {
    if ($("confirmDialog").returnValue === "confirm" && pendingConfirmAction) await pendingConfirmAction();
    pendingConfirmAction = null;
  });
  window.addEventListener("resize", () => {
    if ($("history").classList.contains("active")) {
      drawChart(periodRecords(), $("metricSelect").value);
      refreshAggregateAnalysis();
    }
  });
  window.addEventListener("beforeinstallprompt", (event) => { event.preventDefault(); deferredInstallPrompt = event; $("installBtn").classList.remove("hidden"); });
  $("installBtn").addEventListener("click", async () => { if (!deferredInstallPrompt) return; deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt = null; $("installBtn").classList.add("hidden"); });
  window.addEventListener("online", updateConnectionStatus); window.addEventListener("offline", updateConnectionStatus);
}

function updateConnectionStatus() {
  $("offlineStatus").textContent = navigator.onLine ? "Pronta per l’uso offline" : "Modalità offline attiva";
}

async function init() {
  try {
    setDefaultDates(); bindEvents(); updateConnectionStatus();
    db = await openDatabase();
    await seedInitialData();
    await loadRecords();
    populateForm($("date").value);
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  } catch (error) {
    showFormMessage("Impossibile inizializzare l’archivio locale in questo browser.", true);
  }
}

document.addEventListener("DOMContentLoaded", init);
