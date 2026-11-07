// server.ts
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var SYNC_DATA_DIR = path.join(__dirname, ".sync_data");
if (!fs.existsSync(SYNC_DATA_DIR)) {
  try {
    fs.mkdirSync(SYNC_DATA_DIR, { recursive: true });
  } catch {
  }
}
var app = express();
var API_LOGS_FILE = path.join(SYNC_DATA_DIR, "api_requests_log.json");
var apiRequestLogs = [];
try {
  if (fs.existsSync(API_LOGS_FILE)) {
    const data = JSON.parse(fs.readFileSync(API_LOGS_FILE, "utf8"));
    if (Array.isArray(data)) apiRequestLogs = data.slice(-1e3);
  }
} catch {
}
function saveApiLogs() {
  try {
    fs.writeFileSync(API_LOGS_FILE, JSON.stringify(apiRequestLogs.slice(-1e3), null, 2), "utf8");
  } catch {
  }
}
app.use((req, res, next) => {
  if (!req.path.startsWith("/api/")) {
    return next();
  }
  const startTime = Date.now();
  const reqId = Math.random().toString(36).substring(2, 9);
  const reqBody = req.body;
  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const logEntry = {
      id: reqId,
      timestamp: startTime,
      iso: new Date(startTime).toISOString(),
      method: req.method,
      path: req.path,
      query: req.query,
      headers: {
        host: req.headers["host"],
        "user-agent": req.headers["user-agent"],
        "content-type": req.headers["content-type"],
        "authorization": req.headers["authorization"] ? "Bearer [HIDDEN]" : void 0,
        "x-requested-with": req.headers["x-requested-with"],
        "origin": req.headers["origin"],
        "referer": req.headers["referer"]
      },
      body: reqBody,
      statusCode: res.statusCode,
      durationMs: duration
    };
    apiRequestLogs.push(logEntry);
    if (apiRequestLogs.length > 1e3) apiRequestLogs.shift();
    saveApiLogs();
  });
  next();
});
app.get("/api/logs/requests", (req, res) => {
  const filterMethod = req.query.method ? String(req.query.method).toUpperCase() : "";
  const filterStatus = req.query.status ? parseInt(String(req.query.status), 10) : NaN;
  const filterSearch = req.query.search ? String(req.query.search).toLowerCase() : "";
  let filtered = [...apiRequestLogs];
  if (filterMethod) filtered = filtered.filter((l) => l.method === filterMethod);
  if (!isNaN(filterStatus)) filtered = filtered.filter((l) => l.statusCode === filterStatus);
  if (filterSearch) {
    filtered = filtered.filter(
      (l) => l.path.toLowerCase().includes(filterSearch) || JSON.stringify(l.headers).toLowerCase().includes(filterSearch) || JSON.stringify(l.body || "").toLowerCase().includes(filterSearch)
    );
  }
  res.json({
    success: true,
    totalCaptured: apiRequestLogs.length,
    filteredCount: filtered.length,
    serverTime: Date.now(),
    logs: filtered.reverse()
  });
});
app.delete("/api/logs/requests", (_req, res) => {
  apiRequestLogs = [];
  saveApiLogs();
  res.json({ success: true, message: "API request logs cleared" });
});
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) {
    console.log(`[EXPRESS API TRACE] Method: ${req.method} | Path: ${req.path}`);
  }
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.post("/api/fetch-live-sheet", async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "Missing url parameter" });
    }
    let fetchUrl = url.trim();
    if (fetchUrl.includes("docs.google.com/spreadsheets")) {
      if (!fetchUrl.includes("export?format=csv") && !fetchUrl.includes("/pub?output=csv")) {
        fetchUrl = fetchUrl.replace(/\/edit.*$/, "/export?format=csv");
      }
    }
    if (fetchUrl.includes("1drv.ms") || fetchUrl.includes("onedrive.live.com")) {
      if (!fetchUrl.includes("download=1")) {
        fetchUrl += (fetchUrl.includes("?") ? "&" : "?") + "download=1";
      }
    }
    const response = await fetch(fetchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
      },
      redirect: "follow"
    });
    if (!response.ok) {
      return res.json({
        success: false,
        message: `\u062A\u0639\u0630\u0631 \u0627\u0644\u0648\u0635\u0648\u0644 \u0627\u0644\u0645\u0628\u0627\u0634\u0631 \u0644\u0644\u0645\u0644\u0641 (\u0631\u0645\u0632 \u0627\u0644\u0627\u0633\u062A\u062C\u0627\u0628\u0629: ${response.status}). \u064A\u0645\u0643\u0646\u0643 \u0641\u062A\u062D \u0627\u0644\u0631\u0627\u0628\u0637 \u0648\u062A\u0646\u0632\u064A\u0644 \u0627\u0644\u0645\u0644\u0641 \u062B\u0645 \u0631\u0641\u0639\u0647 \u0645\u0628\u0627\u0634\u0631\u0629 \u0639\u0628\u0631 \u0632\u0631 [\u0631\u0641\u0639 \u0645\u0644\u0641 Excel].`
      });
    }
    const arrayBuffer = await response.arrayBuffer();
    const bufferNode = Buffer.from(arrayBuffer);
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const sampleText = bufferNode.subarray(0, 400).toString("utf-8").toLowerCase();
    if (contentType.includes("text/html") || sampleText.includes("<!doctype html") || sampleText.includes("<html") || sampleText.includes("login.live.com")) {
      return res.json({
        success: false,
        isProtectedOneDrive: true,
        message: "\u0631\u0627\u0628\u0637 OneDrive \u0647\u0630\u0627 \u0645\u062D\u0645\u064A \u0628\u062D\u0633\u0627\u0628 \u0645\u0627\u064A\u0643\u0631\u0648\u0633\u0648\u0641\u062A \u0627\u0644\u0634\u062E\u0635\u064A. \u064A\u0645\u0643\u0646\u0643 \u0641\u062A\u062D \u0627\u0644\u0631\u0627\u0628\u0637 \u0628\u0636\u063A\u0637\u0629 \u0632\u0631 \u0648\u062A\u0646\u0632\u064A\u0644 \u0627\u0644\u0645\u0644\u0641\u060C \u062B\u0645 \u0631\u0641\u0639\u0647 \u0645\u0628\u0627\u0634\u0631\u0629 \u0639\u0628\u0631 \u0632\u0631 [\u0631\u0641\u0639 \u0645\u0644\u0641 Excel] \u0623\u0648 \u0646\u0633\u062E\u0647 \u0648\u0644\u0635\u0642\u0647."
      });
    }
    const base64 = bufferNode.toString("base64");
    res.json({
      success: true,
      contentType,
      dataBase64: base64,
      byteLength: arrayBuffer.byteLength
    });
  } catch (err) {
    res.json({
      success: false,
      message: "\u062A\u0639\u0630\u0631 \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u0633\u062D\u0627\u0628\u064A \u062D\u0627\u0644\u064A\u0627\u064B. \u064A\u0631\u062C\u0649 \u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0632\u0631 [\u0631\u0641\u0639 \u0645\u0644\u0641 Excel] \u0623\u0648 \u0644\u0635\u0642 \u0645\u062D\u062A\u0648\u0649 \u0627\u0644\u062C\u062F\u0648\u0644 \u0645\u0628\u0627\u0634\u0631\u0629."
    });
  }
});
var PORT = process.env.PORT ? Number(process.env.PORT) : 3e3;
app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});
var ALL_SYNC_ENTITIES = [
  "invoices",
  "parties",
  "inventory",
  "vouchers",
  "printOrders",
  "purchases",
  "purchaseReturns",
  "salesReturns",
  "accounts",
  "treasuries",
  "employees",
  "employeeAdvances",
  "employeeDeductions",
  "employeeIncentives",
  "payrollSheets",
  "stockMovements",
  "companies",
  "branches",
  "warehouses",
  "warehouseOperations",
  "roles",
  "users",
  "debtClearings",
  "expenses",
  "journalEntries",
  "settings",
  "dailyEntrySheets"
];
var syncCache = {};
var syncTimestamps = {};
function isTestSyncProbeItem(item) {
  if (!item) return false;
  const id = String(item.id || "");
  const code = String(item.code || "");
  const name = String(item.name || "");
  return id === "inv-probe-sync-1" || id === "inv-test-full-1" || code === "ITEM-9999" || name === "\u0635\u0646\u0641 \u062A\u062C\u0631\u0628\u0629 \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629" || name === "\u0635\u0646\u0641 \u0641\u062D\u0635 \u0627\u0644\u0645\u0632\u0627\u0645\u0646\u0629 \u0627\u0644\u0634\u0627\u0645\u0644\u0629";
}
function sanitizeEntityName(entity) {
  if (!entity || typeof entity !== "string") return "";
  const cleaned = entity.replace(/[^a-zA-Z0-9_-]/g, "");
  if (ALL_SYNC_ENTITIES.includes(cleaned)) {
    return cleaned;
  }
  return "";
}
function loadEntityData(rawEntity) {
  const entity = sanitizeEntityName(rawEntity);
  if (!entity) return [];
  const filePath = path.join(SYNC_DATA_DIR, `${entity}.json`);
  let existingData = [];
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (Array.isArray(data)) existingData = data;
    } catch (err) {
      console.warn(`Error reading ${filePath}:`, err);
    }
  }
  existingData = existingData.filter((it) => !isTestSyncProbeItem(it));
  syncCache[entity] = existingData;
  syncTimestamps[entity] = fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : Date.now();
  return existingData;
}
function saveEntityData(rawEntity, data) {
  const entity = sanitizeEntityName(rawEntity);
  if (!entity) return;
  const cleanData = (data || []).filter((it) => !isTestSyncProbeItem(it));
  syncCache[entity] = cleanData;
  syncTimestamps[entity] = Date.now();
  const filePath = path.join(SYNC_DATA_DIR, `${entity}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(cleanData), "utf8");
  } catch (err) {
    console.error(`Failed to save sync entity ${entity}:`, err);
  }
}
var DELTAS_FILE = path.join(SYNC_DATA_DIR, "deltas.json");
function loadDeltas() {
  if (fs.existsSync(DELTAS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DELTAS_FILE, "utf8"));
      if (data && typeof data === "object" && Array.isArray(data.deltas)) {
        return { currentSeq: data.currentSeq || 0, deltas: data.deltas };
      }
    } catch {
    }
  }
  return { currentSeq: 0, deltas: [] };
}
function recordDelta(delta) {
  const { currentSeq, deltas } = loadDeltas();
  const nextSeq = currentSeq + 1;
  const newDelta = { ...delta, seq: nextSeq, timestamp: Date.now() };
  const updatedDeltas = [...deltas, newDelta].slice(-5e3);
  try {
    fs.writeFileSync(DELTAS_FILE, JSON.stringify({ currentSeq: nextSeq, deltas: updatedDeltas }), "utf8");
  } catch {
  }
  const current = loadEntityData(delta.entity);
  const map = /* @__PURE__ */ new Map();
  for (const it of current) if (it && it.id) map.set(String(it.id), it);
  if (delta.op === "delete") {
    if (delta.item && delta.item.id) map.delete(String(delta.item.id));
    if (Array.isArray(delta.items)) {
      for (const it of delta.items) if (it && it.id) map.delete(String(it.id));
    }
  } else {
    if (delta.item && delta.item.id) map.set(String(delta.item.id), delta.item);
    if (Array.isArray(delta.items)) {
      for (const it of delta.items) if (it && it.id) map.set(String(it.id), it);
    }
  }
  saveEntityData(delta.entity, Array.from(map.values()));
  return { seq: nextSeq, currentSeq: nextSeq };
}
app.get("/api/app-version", (_req, res) => {
  res.json({ version: "1791656836620", time: Date.now() });
});
app.get("/api/sync/deltas-since", (req, res) => {
  const sinceSeq = parseInt(String(req.query.sinceSeq || "0"), 10) || 0;
  const { currentSeq, deltas } = loadDeltas();
  const newDeltas = deltas.filter((d) => d && typeof d.seq === "number" && d.seq > sinceSeq);
  res.json({
    success: true,
    currentSeq,
    deltas: newDeltas,
    count: newDeltas.length,
    serverTime: Date.now()
  });
});
app.all("/api/sync/delta", (req, res) => {
  if (req.method === "OPTIONS") return res.sendStatus(204);
  if (req.method === "GET") {
    const { currentSeq, deltas } = loadDeltas();
    return res.json({ success: true, currentSeq, count: deltas.length });
  }
  try {
    const { entity, op = "upsert", item, items, clientId } = req.body || {};
    if (!entity) {
      return res.json({ success: true, message: "No entity provided" });
    }
    const { seq, currentSeq } = recordDelta({ entity, op, item, items, clientId });
    res.json({
      success: true,
      seq,
      currentSeq,
      serverTime: Date.now()
    });
  } catch (err) {
    res.status(500).json({ error: err?.message || "Delta push failed" });
  }
});
app.get("/api/sync/master-snapshot", (_req, res) => {
  const fullSnapshot = {};
  for (const ent of ALL_SYNC_ENTITIES) {
    fullSnapshot[ent] = loadEntityData(ent);
  }
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  res.json(fullSnapshot);
});
app.get("/api/sync/status", (_req, res) => {
  const summary = {};
  for (const ent of ALL_SYNC_ENTITIES) {
    const items = loadEntityData(ent);
    summary[ent] = {
      count: items.length,
      lastModified: syncTimestamps[ent] || Date.now()
    };
  }
  res.json({
    success: true,
    serverTime: Date.now(),
    serverTimeString: (/* @__PURE__ */ new Date()).toLocaleTimeString("ar-EG"),
    tunnelUrl: "",
    entities: summary
  });
});
app.get("/api/sync/state", (req, res) => {
  const requestedEntities = req.query.entities ? String(req.query.entities).split(",") : ALL_SYNC_ENTITIES;
  const result = {};
  for (const ent of requestedEntities) {
    const safeEnt = ent.trim();
    if (!safeEnt) continue;
    result[safeEnt] = {
      items: loadEntityData(safeEnt),
      version: syncTimestamps[safeEnt] || Date.now()
    };
  }
  res.json({ success: true, data: result, serverTime: Date.now() });
});
app.post("/api/sync/push", (req, res) => {
  try {
    const { entity, item, items, op, deletedIds } = req.body;
    if (!entity || typeof entity !== "string") {
      return res.status(400).json({ error: "Missing entity" });
    }
    const current = loadEntityData(entity);
    const map = /* @__PURE__ */ new Map();
    for (const it of current) {
      if (it && it.id) map.set(String(it.id), it);
    }
    if (Array.isArray(deletedIds)) {
      for (const dId of deletedIds) {
        if (dId) map.delete(String(dId));
      }
    }
    if (item && item.id) {
      if (item._deleted || op === "delete") {
        map.delete(String(item.id));
      } else {
        map.set(String(item.id), item);
      }
    }
    if (Array.isArray(items)) {
      for (const it of items) {
        if (it && it.id) {
          if (it._deleted) {
            map.delete(String(it.id));
          } else {
            map.set(String(it.id), it);
          }
        }
      }
    }
    const updatedList = Array.from(map.values());
    saveEntityData(entity, updatedList);
    res.json({
      success: true,
      count: updatedList.length,
      version: syncTimestamps[entity],
      items: updatedList
    });
  } catch (err) {
    console.error("Sync push error:", err);
    res.status(500).json({ error: err.message });
  }
});
app.post("/api/sync/replace-database", (req, res) => {
  try {
    const rawData = req.body?.data || req.body;
    if (!rawData || typeof rawData !== "object") {
      return res.status(400).json({ error: "Invalid database snapshot" });
    }
    for (const ent of ALL_SYNC_ENTITIES) {
      const items = Array.isArray(rawData[ent]) ? rawData[ent] : [];
      saveEntityData(ent, items);
    }
    if (rawData.dailyEntrySheets && typeof rawData.dailyEntrySheets === "object") {
      const dailyPath = path.join(SYNC_DATA_DIR, "dailyEntrySheets.json");
      try {
        fs.writeFileSync(dailyPath, JSON.stringify(rawData.dailyEntrySheets), "utf8");
      } catch {
      }
    }
    const newSeq = 1;
    const initialDelta = { entity: "all", op: "replace_database", seq: newSeq, timestamp: Date.now() };
    try {
      fs.writeFileSync(DELTAS_FILE, JSON.stringify({ currentSeq: newSeq, deltas: [initialDelta] }), "utf8");
    } catch {
    }
    try {
      const snapshotPath = path.join(__dirname, "public", "master_drive_database_snapshot.json");
      fs.writeFileSync(snapshotPath, JSON.stringify(rawData, null, 2), "utf8");
    } catch {
    }
    res.json({
      success: true,
      message: "\u062A\u0645 \u0627\u0633\u062A\u0628\u062F\u0627\u0644 \u0642\u0627\u0639\u062F\u0629 \u0627\u0644\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u0645\u0631\u0643\u0632\u064A\u0629 \u0628\u0627\u0644\u0643\u0627\u0645\u0644 \u0639\u0644\u0649 \u0627\u0644\u0633\u064A\u0631\u0641\u0631 \u0628\u0646\u062C\u0627\u062D",
      currentSeq: newSeq
    });
  } catch (err) {
    console.error("Failed to replace server database:", err);
    res.status(500).json({ error: err?.message || "Server database replacement failed" });
  }
});
app.all("/api/sync/full-sync", (req, res) => {
  if (req.method === "OPTIONS") return res.sendStatus(204);
  try {
    const isGet = req.method === "GET";
    const { entities, deletedDocs } = isGet ? { entities: {}, deletedDocs: [] } : req.body || {};
    const delSet = /* @__PURE__ */ new Set();
    if (Array.isArray(deletedDocs)) {
      deletedDocs.forEach((d) => {
        if (d && d.col && d.id) delSet.add(`${d.col}_${d.id}`);
      });
    }
    const resultMap = {};
    const countsSummary = {};
    const incomingEntities = entities && typeof entities === "object" ? entities : {};
    for (const entityName of ALL_SYNC_ENTITIES) {
      const incomingItems = incomingEntities[entityName] || [];
      const serverItems = loadEntityData(entityName);
      const mergedMap = /* @__PURE__ */ new Map();
      for (const sIt of serverItems) {
        if (sIt && sIt.id && !delSet.has(`${entityName}_${sIt.id}`) && !sIt._deleted) {
          mergedMap.set(String(sIt.id), sIt);
        }
      }
      if (Array.isArray(incomingItems)) {
        const existingInvoiceNumbers = /* @__PURE__ */ new Set();
        if (entityName === "invoices") {
          for (const sIt of serverItems) {
            if (sIt && sIt.invoiceNumber) existingInvoiceNumbers.add(String(sIt.invoiceNumber));
          }
        }
        for (const cIt of incomingItems) {
          if (!cIt || !cIt.id) continue;
          const key = String(cIt.id);
          let finalItem = cIt;
          if (entityName === "invoices" && finalItem.invoiceNumber && !mergedMap.has(key) && existingInvoiceNumbers.has(String(finalItem.invoiceNumber))) {
            const numericPart = parseInt(String(finalItem.invoiceNumber).replace(/\D/g, ""), 10) || 0;
            let newNumber = numericPart;
            while (existingInvoiceNumbers.has(String(newNumber))) {
              newNumber++;
            }
            finalItem = { ...finalItem, invoiceNumber: String(newNumber) };
          }
          if (delSet.has(`${entityName}_${key}`) || finalItem._deleted) {
            mergedMap.delete(key);
            continue;
          }
          if (!mergedMap.has(key)) {
            mergedMap.set(key, finalItem);
            if (entityName === "invoices" && finalItem.invoiceNumber) existingInvoiceNumbers.add(String(finalItem.invoiceNumber));
          } else {
            const existing = mergedMap.get(key);
            mergedMap.set(key, { ...existing, ...finalItem });
          }
        }
      }
      const mergedList = Array.from(mergedMap.values());
      if (!isGet) saveEntityData(entityName, mergedList);
      resultMap[entityName] = {
        items: mergedList,
        count: mergedList.length,
        version: syncTimestamps[entityName] || Date.now()
      };
      countsSummary[entityName] = mergedList.length;
    }
    res.json({
      success: true,
      serverTime: Date.now(),
      serverTimeString: (/* @__PURE__ */ new Date()).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
      data: resultMap,
      counts: countsSummary
    });
  } catch (err) {
    console.error("Master full-sync fallback:", err);
    const resultMap = {};
    const countsSummary = {};
    for (const entityName of ALL_SYNC_ENTITIES) {
      const serverItems = loadEntityData(entityName);
      resultMap[entityName] = { items: serverItems, count: serverItems.length, version: syncTimestamps[entityName] || Date.now() };
      countsSummary[entityName] = serverItems.length;
    }
    res.json({
      success: true,
      serverTime: Date.now(),
      serverTimeString: (/* @__PURE__ */ new Date()).toLocaleTimeString("ar-EG"),
      data: resultMap,
      counts: countsSummary
    });
  }
});
var distPath = path.join(__dirname, "dist");
app.use(express.static(distPath, {
  maxAge: "1d",
  setHeaders: (res, filePath) => {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate, max-age=0");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
}));
var server = app.listen(PORT, "0.0.0.0", () => {
  console.log(`Application server running on http://0.0.0.0:${PORT}`);
});
process.on("SIGTERM", () => {
  console.log("SIGTERM signal received: closing HTTP server");
  server.close(() => {
    console.log("HTTP server closed");
  });
});
