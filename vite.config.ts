
import fs from 'fs';

const SYNC_DATA_DIR = path.resolve(__dirname, '.sync_data');
if (!fs.existsSync(SYNC_DATA_DIR)) {
  try { fs.mkdirSync(SYNC_DATA_DIR, { recursive: true }); } catch {}
}

const syncCache: Record<string, any[]> = {};
const syncTimestamps: Record<string, number> = {};

function getEntityData(entity: string): any[] {
  const filePath = path.join(SYNC_DATA_DIR, `${entity}.json`);
  let existingData: any[] = [];
  if (fs.existsSync(filePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (Array.isArray(data)) existingData = data.filter(it => it && typeof it === 'object' && it.id != null);
    } catch {}
  }

  syncCache[entity] = existingData;
  syncTimestamps[entity] = fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : Date.now();
  return existingData;
}

function putEntityData(entity: string, data: any[]) {
  const safeData = Array.isArray(data) ? data.filter(it => it && typeof it === 'object' && it.id != null) : [];
  syncCache[entity] = safeData;
  syncTimestamps[entity] = Date.now();
  const filePath = path.join(SYNC_DATA_DIR, `${entity}.json`);
  try {
    fs.writeFileSync(filePath, JSON.stringify(safeData), 'utf8');
  } catch {}

  // Also sync public/master_drive_database_snapshot.json
  try {
    const snapshotPath = path.join(__dirname, 'public', 'master_drive_database_snapshot.json');
    if (fs.existsSync(snapshotPath)) {
      const snap = JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) || {};
      snap[entity] = safeData;
      fs.writeFileSync(snapshotPath, JSON.stringify(snap, null, 2), 'utf8');
    }
  } catch {}
}

const ALL_SYNC_ENTITIES = [
  'invoices', 'parties', 'inventory', 'vouchers', 'printOrders',
  'purchases', 'purchaseReturns', 'salesReturns', 'accounts', 'treasuries',
  'employees', 'employeeAdvances', 'employeeDeductions', 'employeeIncentives',
  'payrollSheets', 'stockMovements', 'companies', 'branches',
  'warehouses', 'warehouseOperations', 'roles', 'users', 'debtClearings',
  'expenses', 'journalEntries', 'settings', 'dailyEntrySheets'
];

const DELTAS_FILE = path.join(SYNC_DATA_DIR, 'deltas.json');

function loadDeltas(): { currentSeq: number; deltas: any[] } {
  if (fs.existsSync(DELTAS_FILE)) {
    try {
      const data = JSON.parse(fs.readFileSync(DELTAS_FILE, 'utf8'));
      if (data && typeof data === 'object' && Array.isArray(data.deltas)) {
        return { currentSeq: data.currentSeq || 0, deltas: data.deltas };
      }
    } catch {}
  }
  return { currentSeq: 0, deltas: [] };
}

function recordDelta(delta: { entity: string; op: 'upsert' | 'delete'; item?: any; items?: any[]; clientId?: string }): { seq: number; currentSeq: number } {
  const { currentSeq, deltas } = loadDeltas();
  const nextSeq = currentSeq + 1;
  const newDelta = { ...delta, seq: nextSeq, timestamp: Date.now() };

  const updatedDeltas = [...deltas, newDelta].slice(-5000);
  try {
    fs.writeFileSync(DELTAS_FILE, JSON.stringify({ currentSeq: nextSeq, deltas: updatedDeltas }), 'utf8');
  } catch {}

  // Apply delta to entity file
  const current = getEntityData(delta.entity);
  const map = new Map<string, any>();
  for (const it of current) if (it && typeof it === 'object' && it.id != null) map.set(String(it.id), it);

  if (delta.op === 'delete') {
    if (delta.item && typeof delta.item === 'object' && delta.item.id != null) map.delete(String(delta.item.id));
    if (Array.isArray(delta.items)) for (const it of delta.items) if (it && typeof it === 'object' && it.id != null) map.delete(String(it.id));
  } else {
    if (delta.item && typeof delta.item === 'object' && delta.item.id != null) map.set(String(delta.item.id), delta.item);
    if (Array.isArray(delta.items)) for (const it of delta.items) if (it && typeof it === 'object' && it.id != null) map.set(String(it.id), it);
  }

  putEntityData(delta.entity, Array.from(map.values()));
  return { seq: nextSeq, currentSeq: nextSeq };
}

function syncHubPlugin() {
  return {
    name: 'central-sync-hub',
    configureServer(server: any) {
      server.middlewares.use((req: any, res: any, next: any) => {
        const rawUrl = req.url || '';
        let pathname = '';
        try {
          pathname = new URL(rawUrl, 'http://localhost').pathname.replace(/\/+$/, '');
        } catch {
          pathname = rawUrl.split('?')[0].replace(/\/+$/, '');
        }

        // Trace all /api/ requests for debugging 405 Method Not Allowed root cause
        if (pathname.startsWith('/api/')) {
          console.log(`[API TRACE] Method: ${req.method} | Path: ${pathname} | URL: ${req.url}`);
        }

        // Add permissive CORS headers for cross-origin multi-device sync
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');

        if (req.method === 'OPTIONS') {
          res.statusCode = 204;
          return res.end();
        }

        if (pathname === '/api/app-version') {
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          return res.end(JSON.stringify({ version: '1791656836620', time: Date.now() }));
        }

        if (pathname === '/api/sync/deltas-since') {
          const urlObj = new URL(rawUrl, 'http://localhost');
          const sinceSeq = parseInt(urlObj.searchParams.get('sinceSeq') || '0', 10) || 0;
          const { currentSeq, deltas } = loadDeltas();
          const newDeltas = deltas.filter(d => d && typeof d.seq === 'number' && d.seq > sinceSeq);

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            currentSeq,
            deltas: newDeltas,
            count: newDeltas.length,
            serverTime: Date.now()
          }));
        }

        if (pathname === '/api/sync/delta') {
          if (req.method === 'GET') {
            const { currentSeq, deltas } = loadDeltas();
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, currentSeq, count: deltas.length }));
          }

          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('error', (err: any) => {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Stream error' }));
          });
          req.on('end', () => {
            try {
              const { entity, op = 'upsert', item, items, clientId } = JSON.parse(body || '{}');
              if (!entity) {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ success: true, message: 'No entity provided' }));
              }

              const { seq, currentSeq } = recordDelta({ entity, op, item, items, clientId });

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              return res.end(JSON.stringify({
                success: true,
                seq,
                currentSeq,
                serverTime: Date.now()
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err?.message || 'Delta push failed' }));
            }
          });
          return;
        }

        if (pathname === '/api/sync/master-snapshot') {
          const fullSnapshot: Record<string, any> = {};
          for (const ent of ALL_SYNC_ENTITIES) {
            fullSnapshot[ent] = getEntityData(ent);
          }
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.statusCode = 200;
          return res.end(JSON.stringify(fullSnapshot, null, 2));
        }

        if (pathname === '/api/sync/status') {
          const summary: Record<string, { count: number; lastModified: number }> = {};
          for (const ent of ALL_SYNC_ENTITIES) {
            const items = getEntityData(ent);
            summary[ent] = {
              count: items.length,
              lastModified: syncTimestamps[ent] || Date.now()
            };
          }
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          return res.end(JSON.stringify({
            success: true,
            serverTime: Date.now(),
            serverTimeString: new Date().toLocaleTimeString('ar-EG'),
            tunnelUrl: '',
            entities: summary
          }));
        }

        if (pathname === '/api/sync/metadata') {
          const epochPath = path.join(SYNC_DATA_DIR, 'sync_epoch.json');
          const epoch = fs.existsSync(epochPath) ? JSON.parse(fs.readFileSync(epochPath, 'utf8')).epoch : 0;
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          return res.end(JSON.stringify({ epoch }));
        }

        if (pathname === '/api/sync/hard-reset' && req.method === 'POST') {
          try {
            const syncDir = SYNC_DATA_DIR;
            const epochPath = path.join(syncDir, 'sync_epoch.json');
            if (fs.existsSync(syncDir)) {
              const files = fs.readdirSync(syncDir);
              for (const file of files) {
                if (file !== 'sync_epoch.json') fs.unlinkSync(path.join(syncDir, file));
              }
            }
            const currentEpoch = fs.existsSync(epochPath) ? JSON.parse(fs.readFileSync(epochPath, 'utf8')).epoch : 0;
            fs.writeFileSync(epochPath, JSON.stringify({ epoch: currentEpoch + 1 }));
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 200;
            return res.end(JSON.stringify({ success: true, message: 'تم تصفير قاعدة البيانات السحابية بنجاح' }));
          } catch (err: any) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'فشل التصفير' }));
          }
        }

        if (pathname === '/api/sync/replace-database' && req.method === 'POST') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const rawData = parsed?.data || parsed;
              if (!rawData || typeof rawData !== 'object') {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'Invalid database snapshot' }));
              }

              for (const ent of ALL_SYNC_ENTITIES) {
                const items = Array.isArray(rawData[ent]) ? rawData[ent] : [];
                putEntityData(ent, items);
              }

              if (rawData.dailyEntrySheets && typeof rawData.dailyEntrySheets === 'object') {
                const dailyPath = path.join(SYNC_DATA_DIR, 'dailyEntrySheets.json');
                try { fs.writeFileSync(dailyPath, JSON.stringify(rawData.dailyEntrySheets, null, 2), 'utf8'); } catch {}
              }

              // Direct server-side write to Firestore for guaranteed cloud persistence
              try {
                const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
                if (fs.existsSync(configPath)) {
                  const { initializeApp, getApps } = await import('firebase/app');
                  const { getFirestore, writeBatch, doc, setDoc } = await import('firebase/firestore');
                  const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
                  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
                  const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);

                  for (const col of ALL_SYNC_ENTITIES) {
                    const items = Array.isArray(rawData[col]) ? rawData[col] : [];
                    if (items.length === 0) continue;
                    let batch = writeBatch(db);
                    let opCount = 0;
                    for (let idx = 0; idx < items.length; idx++) {
                      const item = items[idx];
                      if (!item) continue;
                      const docId = String(item.id || `${col}_${idx}`).replace(/\//g, '_');
                      const cleanItem = JSON.parse(JSON.stringify(item, (_, v) => (typeof v === 'undefined' ? null : v)));
                      batch.set(doc(db, col, docId), cleanItem, { merge: true });
                      opCount++;
                      if (opCount % 250 === 0) {
                        await batch.commit();
                        batch = writeBatch(db);
                      }
                    }
                    if (opCount % 250 !== 0 && opCount > 0) {
                      await batch.commit();
                    }
                  }

                  if (rawData.settings && typeof rawData.settings === 'object') {
                    const cleanSettings = JSON.parse(JSON.stringify(rawData.settings, (_, v) => (typeof v === 'undefined' ? null : v)));
                    await setDoc(doc(db, 'settings', 'global'), cleanSettings, { merge: true });
                  }

                  if (rawData.dailyEntrySheets && typeof rawData.dailyEntrySheets === 'object') {
                    for (const [dateKey, sheetData] of Object.entries(rawData.dailyEntrySheets)) {
                      if (!sheetData) continue;
                      const cleanSheet = JSON.parse(JSON.stringify(sheetData, (_, v) => (typeof v === 'undefined' ? null : v)));
                      await setDoc(doc(db, 'dailyEntrySheets', String(dateKey).replace(/\//g, '_')), { date: dateKey, ...(cleanSheet as any) }, { merge: true });
                    }
                  }
                }
              } catch (fsErr) {
                console.warn('Server Firestore push warning:', fsErr);
              }

              res.setHeader('Content-Type', 'application/json');
              res.statusCode = 200;
              return res.end(JSON.stringify({ success: true, message: 'Database replaced and synced to Firestore' }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err?.message || 'Server error' }));
            }
          });
          return;
        }

        if (pathname === '/api/sync/state') {

          const urlObj = new URL(rawUrl, 'http://localhost');
          const requestedEntitiesParam = urlObj.searchParams.get('entities');
          const requestedEntities = requestedEntitiesParam
            ? requestedEntitiesParam.split(',')
            : ALL_SYNC_ENTITIES;

          const result: Record<string, any> = {};
          for (const ent of requestedEntities) {
            const safeEnt = ent.trim();
            if (!safeEnt) continue;
            result[safeEnt] = {
              items: getEntityData(safeEnt),
              version: syncTimestamps[safeEnt] || Date.now()
            };
          }
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          return res.end(JSON.stringify({ success: true, data: result, serverTime: Date.now() }));
        }

        if (pathname === '/api/sync/push') {
          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('error', (err: any) => {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Stream error' }));
          });
          req.on('end', () => {
            try {
              const { entity, item, items, op, deletedIds } = JSON.parse(body || '{}');
              if (!entity) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'Missing entity' }));
              }

              const current = getEntityData(entity);
              const map = new Map<string, any>();
              for (const it of current) {
                if (it && it.id) map.set(String(it.id), it);
              }

              if (Array.isArray(deletedIds)) {
                for (const dId of deletedIds) {
                  if (dId) map.delete(String(dId));
                }
              }

              if (item && item.id) {
                if (item._deleted || op === 'delete') {
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
              putEntityData(entity, updatedList);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: true,
                count: updatedList.length,
                version: syncTimestamps[entity],
                items: updatedList
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ error: err.message }));
            }
          });
          return;
        }

        if (pathname === '/api/sync/full-sync') {
          if (req.method === 'GET') {
            const resultMap: Record<string, { items: any[]; count: number; version: number }> = {};
            const countsSummary: Record<string, number> = {};
            for (const ent of ALL_SYNC_ENTITIES) {
              const items = getEntityData(ent);
              resultMap[ent] = { items, count: items.length, version: syncTimestamps[ent] || Date.now() };
              countsSummary[ent] = items.length;
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({
              success: true,
              serverTime: Date.now(),
              serverTimeString: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
              data: resultMap,
              counts: countsSummary
            }));
          }

          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('error', (err: any) => {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Stream error' }));
          });
          req.on('end', () => {
            try {
              const { entities, deletedDocs } = JSON.parse(body || '{}');
              const delSet = new Set<string>();
              if (Array.isArray(deletedDocs)) {
                deletedDocs.forEach((d: any) => {
                  if (d && d.col && d.id) delSet.add(`${d.col}_${d.id}`);
                });
              }

              const resultMap: Record<string, { items: any[]; count: number; version: number }> = {};
              const countsSummary: Record<string, number> = {};

              const incomingEntities = (entities && typeof entities === 'object') ? entities : {};

              for (const ent of ALL_SYNC_ENTITIES) {
                const incomingItems = incomingEntities[ent] || [];
                const serverItems = getEntityData(ent);
                const mergedMap = new Map<string, any>();

                for (const sIt of serverItems) {
                  if (sIt && sIt.id && !delSet.has(`${ent}_${sIt.id}`) && !sIt._deleted) {
                    mergedMap.set(String(sIt.id), sIt);
                  }
                }

                if (Array.isArray(incomingItems)) {
                  for (const cIt of incomingItems) {
                    if (!cIt || !cIt.id) continue;
                    const key = String(cIt.id);
                    if (delSet.has(`${ent}_${key}`) || cIt._deleted) {
                      mergedMap.delete(key);
                      continue;
                    }

                    if (!mergedMap.has(key)) {
                      mergedMap.set(key, cIt);
                    } else {
                      const existing = mergedMap.get(key);
                      mergedMap.set(key, { ...existing, ...cIt });
                    }
                  }
                }

                const mergedList = Array.from(mergedMap.values());
                putEntityData(ent, mergedList);

                resultMap[ent] = {
                  items: mergedList,
                  count: mergedList.length,
                  version: syncTimestamps[ent] || Date.now()
                };
                countsSummary[ent] = mergedList.length;
              }

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: true,
                serverTime: Date.now(),
                serverTimeString: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                data: resultMap,
                counts: countsSummary
              }));
            } catch (err: any) {
              const resultMap: Record<string, { items: any[]; count: number; version: number }> = {};
              const countsSummary: Record<string, number> = {};
              for (const ent of ALL_SYNC_ENTITIES) {
                const items = getEntityData(ent);
                resultMap[ent] = { items, count: items.length, version: syncTimestamps[ent] || Date.now() };
                countsSummary[ent] = items.length;
              }
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({
                success: true,
                serverTime: Date.now(),
                serverTimeString: new Date().toLocaleTimeString('ar-EG'),
                data: resultMap,
                counts: countsSummary
              }));
            }
          });
          return;
        }

        if (pathname === '/api/fetch-live-sheet') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ error: 'Method Not Allowed' }));
          }

          let body = '';
          req.on('data', (chunk: any) => { body += chunk; });
          req.on('error', (err: any) => {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: err?.message || 'Stream error' }));
          });
          req.on('end', async () => {
            try {
              const parsed = JSON.parse(body || '{}');
              const targetUrl = parsed.url;
              if (!targetUrl) {
                res.statusCode = 400;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({ error: 'Missing url parameter' }));
              }

              let fetchUrl = targetUrl.trim();
              if (fetchUrl.includes('docs.google.com/spreadsheets')) {
                if (!fetchUrl.includes('export?format=csv') && !fetchUrl.includes('/pub?output=csv')) {
                  fetchUrl = fetchUrl.replace(/\/edit.*$/, '/export?format=csv');
                }
              }

              if (fetchUrl.includes('1drv.ms') || fetchUrl.includes('onedrive.live.com')) {
                if (!fetchUrl.includes('download=1')) {
                  fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'download=1';
                }
              }

              const fetchRes = await fetch(fetchUrl, {
                headers: {
                  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                redirect: 'follow'
              });

              if (!fetchRes.ok) {
                res.statusCode = fetchRes.status;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  error: `Failed to fetch external sheet (${fetchRes.status}): ${fetchRes.statusText}`
                }));
              }

              const arrayBuffer = await fetchRes.arrayBuffer();
              const bufferNode = Buffer.from(arrayBuffer);
              const contentType = fetchRes.headers.get('content-type') || 'application/octet-stream';
              
              const sampleText = bufferNode.subarray(0, 400).toString('utf-8').toLowerCase();
              if (contentType.includes('text/html') || sampleText.includes('<!doctype html') || sampleText.includes('<html') || sampleText.includes('login.live.com')) {
                res.statusCode = 422;
                res.setHeader('Content-Type', 'application/json');
                return res.end(JSON.stringify({
                  error: 'الرابط السحابي يتطلب تسجيل دخول مايكروسوفت (تم استلام صفحة HTML بدلاً من ملف الإكسل المباشر). يرجى تنزيل الملف ورفعه عبر زر [رفع ملف Excel] أو نسخ الجدول ولصقه.'
                }));
              }

              const base64 = bufferNode.toString('base64');

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({
                success: true,
                contentType,
                dataBase64: base64,
                byteLength: arrayBuffer.byteLength
              }));
            } catch (err: any) {
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err?.message || 'Error fetching sheet' }));
            }
          });
          return;
        }

        // Intercept any unhandled /api/ routes to prevent fallthrough to Vite static asset server (which throws 405 Method Not Allowed)
        if (pathname.startsWith('/api/')) {
          console.log(`[API 404 TRACE] Unhandled API route: ${req.method} ${pathname}`);
          res.statusCode = 404;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: `API route ${pathname} not found` }));
        }

        next();
      });
    }
  };
}

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  const localMode = loadEnv(mode, process.cwd(), '').VITE_SYNC_BACKEND === 'local-postgres';
  return {
    server: {
      hmr: false,
    },
    plugins: [
      react({ jsxRuntime: 'automatic' }), 
      tailwindcss(),
      ...(localMode ? [] : [syncHubPlugin()]), // disable legacy file-store sync endpoints in PG mode
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['apple-touch-icon.png', 'icon.svg', 'pwa-192x192.png', 'pwa-512x512.png'],
        manifest: {
          id: '/',
          name: 'برنامج الأيهم المحاسبي',
          short_name: 'Al-Ayham',
          description: 'برنامج الأيهم المحاسبي الشامل لإدارة المطابع ونقاط البيع والحسابات',
          theme_color: '#1e293b',
          background_color: '#1e293b',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          maximumFileSizeToCacheInBytes: 15 * 1024 * 1024, // 15MB
        },
        devOptions: {
          enabled: false,
        },
      })
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
  };
});
