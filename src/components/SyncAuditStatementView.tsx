import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAccounting } from '../context/AccountingContext';
import {LegacyInvoiceAuditPanel} from './LegacyInvoiceAuditPanel';
import {OperationalHealthPanel} from './OperationalHealthPanel';
import { syncAuditService, SyncAuditItem, SyncConnectionIssue, ENTITY_ARABIC_NAMES } from '../services/syncAuditService';

// Inlined self-contained reconciliation helpers to eliminate external module resolution issues in remote CI/CD builds
export type ComparisonStatus = 'NOT_CHECKED' | 'MATCH' | 'DIFFERENT';
export interface ReconciliationDifference {
  status: ComparisonStatus;
  missingOnCloud: string[];
  missingOnDevice: string[];
  differentContent: string[];
  duplicateDeviceIds: string[];
  duplicateCloudIds: string[];
}

function canonicalRecordJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonicalRecordJson).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map(k =>
      JSON.stringify(k) + ':' + canonicalRecordJson((v as Record<string, unknown>)[k])
    ).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function compareRecordCollections(
  local: Array<{ id?: string }> | undefined,
  cloud: Array<{ id?: string }> | undefined
): ReconciliationDifference {
  const empty = {
    missingOnCloud: [] as string[], missingOnDevice: [] as string[],
    differentContent: [] as string[], duplicateDeviceIds: [] as string[],
    duplicateCloudIds: [] as string[]
  };
  if (!local || !cloud) return { status: 'NOT_CHECKED', ...empty };
  const index = (list: Array<{ id?: string }>, duplicates: string[]) => {
    const map = new Map<string, string>();
    for (const item of list) {
      if (!item?.id) continue;
      if (map.has(item.id)) duplicates.push(item.id);
      map.set(item.id, canonicalRecordJson(item));
    }
    return map;
  };
  const device = index(local, empty.duplicateDeviceIds);
  const server = index(cloud, empty.duplicateCloudIds);
  for (const [id, localJson] of device) {
    if (!server.has(id)) empty.missingOnCloud.push(id);
    else if (server.get(id) !== localJson) empty.differentContent.push(id);
  }
  for (const id of server.keys()) {
    if (!device.has(id)) empty.missingOnDevice.push(id);
  }
  const status = Object.values(empty).some(items => items.length > 0) ? 'DIFFERENT' : 'MATCH';
  return { status, ...empty };
}

async function prepareMultiSourceDiagnostic(repository: any) {
  const local = await repository.getAllVisibleGrouped();
  const outbox = await repository.getLocalDb().pending();
  const cloud = await repository.getCloudSnapshot();
  const legacy: Record<string, unknown> = {};
  const suffixes = ['invoices','parties','treasuries','vouchers','journals','inventory',
    'accounts','purchases','stockMovements','expenses'];
  for (const suffix of suffixes) {
    try {
      const key = `alnoor_press_accounting_v1_${suffix}`;
      const value = localStorage.getItem(key);
      if (value) legacy[key] = JSON.parse(value);
    } catch {}
  }
  const comparisons: Record<string, ReturnType<typeof compareRecordCollections>> = {};
  const names = new Set([...Object.keys(local), ...Object.keys(cloud)]);
  for (const name of names) {
    comparisons[name] = compareRecordCollections(local[name] ?? [], cloud[name] ?? []);
  }
  const invoiceRows: any[] = [];
  for (const [source, records] of [['local',local.invoices], ['cloud',cloud.invoices]] as const) {
    for (const record of records || []) {
      invoiceRows.push({
        source, id: String(record.id || ''), invoiceNumber: String(record.invoiceNumber || ''),
        customerName: String(record.customerName || ''), totalAmount: Number(record.totalAmount || 0),
        date: String(record.date || '')
      });
    }
  }
  const report = {
    format: 'lobnan-reconciliation-export-v1',
    generatedAt: new Date().toISOString(),
    workspaceId: 'lobnan_main',
    deviceId: localStorage.getItem('lobnan_device_id') || 'not-assigned',
    local, cloud, legacy, outbox, comparisons,
    invoiceRows
  };
  const json = JSON.stringify(report, null, 2);
  const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
  return { url: URL.createObjectURL(blob), name: `lobnan-reconciliation-${Date.now()}.json` };
}
import { getProgramDriveStatus } from '../services/googleDriveService';
import { SyncConflictModal } from './SyncConflictModal';
import {
  RefreshCw,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ArrowUpRight,
  ArrowDownLeft,
  Database,
  Printer,
  Activity,
  Search,
  AlertOctagon,
  ArrowRight,
  Eye,
  Download,
  X
} from 'lucide-react';

interface ServerEntityStatus {
  count: number;
  lastModified: number;
}

interface ServerStatusResponse {
  success: boolean;
  serverTime: number;
  serverTimeString: string;
  tunnelUrl?: string;
  entities: Record<string, ServerEntityStatus>;
}

export const SyncAuditStatementView: React.FC = () => {
  const {
    lastSyncTime,
    pendingSyncCount,
    forceSyncNow,
    isServerSyncing,
    setActiveTab,
    invoices,
    parties,
    inventory,
    vouchers,
    printOrders,
    purchases,
    purchaseReturns,
    salesReturns,
    accounts,
    treasuries,
    employees,
    journalEntries,
    expenses,
    stockMovements,
    warehouseOperations,
    dailyEntrySheets,
    unifiedRepository
  } = useAccounting();

  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'pushed' | 'pulled' | 'issues'>('all');
  const [showAdvancedTools, setShowAdvancedTools] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [serverStatus, setServerStatus] = useState<ServerStatusResponse | null>(null);
  const [isLoadingServerStatus, setIsLoadingServerStatus] = useState(false);
  const [serverPingMs, setServerPingMs] = useState<number | null>(null);
  const [connectionState, setConnectionState] = useState<'connected' | 'disconnected' | 'checking'>('checking');
  const [auditLogs, setAuditLogs] = useState<SyncAuditItem[]>([]);
  const [connectionIssues, setConnectionIssues] = useState<SyncConnectionIssue[]>([]);
  const [actionFeedback, setActionFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [hasDriveToken, setHasDriveToken] = useState<boolean>(false);
  const [isConnectingDrive, setIsConnectingDrive] = useState(false);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [cloudCounts, setCloudCounts] = useState<Record<string, number> | null>(null);
  const [auditedCloudRecords, setAuditedCloudRecords] = useState<Record<string, any[]> | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');
  const [exportFile, setExportFile] = useState<{ url: string; name: string } | null>(null);
  const exportLink = React.useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!exportFile) return;
    exportLink.current?.click();
    return () => URL.revokeObjectURL(exportFile.url);
  }, [exportFile]);
  const [isLoadingCloudCounts, setIsLoadingCloudCounts] = useState(false);

  // Database Preview Modal State
  const [showDatabasePreviewModal, setShowDatabasePreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<Record<string, any[]> | null>(null);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [previewActiveEntity, setPreviewActiveEntity] = useState<string>('invoices');

  // Load authoritative cloud counts directly from PostgreSQL workspace records
  const loadCloudCounts = useCallback(async () => {
    setIsLoadingCloudCounts(true);
    try {
      if (!unifiedRepository) throw new Error('المستودع الموحد غير جاهز');
      const fsData = await unifiedRepository.getCloudSnapshot();
      if (fsData) {
        setAuditedCloudRecords(fsData);
        const counts: Record<string, number> = {};
        for (const [k, v] of Object.entries(fsData)) {
          counts[k] = Array.isArray(v) ? v.length : 0;
        }
        setCloudCounts(counts);
      }
    } catch (e) {
      console.warn('Error loading authoritative cloud counts:', e);
    } finally {
      setIsLoadingCloudCounts(false);
    }
  }, [unifiedRepository]);

  // Explicit-only cloud audit; never scan all records automatically on opening this screen.

  // Check Drive token status
  useEffect(() => {
    void getProgramDriveStatus().then(status=>setHasDriveToken(status.configured)).catch(()=>setHasDriveToken(false));
  }, []);

  // Private Drive integration is owned by the main PostgreSQL server.
  const handleConnectDrive=async()=>{
    setIsConnectingDrive(true);
    try{
      const state=await getProgramDriveStatus();
      setHasDriveToken(state.configured);
      setActionFeedback(state.configured
        ? {success:true,message:'Drive الخاص بالبرنامج متصل بالخادم، وجميع الملفات تتطلب جلسة مستخدم مصرح له.'}
        : {success:false,message:'خدمة Drive لم تحصل بعد على صلاحية Google بالخادم. النسخ المحلية مستمرة.'});
    }catch(error){
      setActionFeedback({success:false,message:'تعذر فحص اتصال Drive الخاص بالخادم.'});
    }finally{
      setIsConnectingDrive(false);
      setTimeout(()=>setActionFeedback(null),6000);
    }
  };

  // Load audit logs and errors from local and الخادم الرئيسي
  const loadLocalLogs = useCallback(() => {
    setAuditLogs(syncAuditService.getAuditLogs());
    setConnectionIssues(syncAuditService.getConnectionIssues());
  }, []);

  // The canonical PostgreSQL coordinator records acknowledgements locally.
  // Refresh the audit view without opening a second cloud subscription.
  useEffect(() => {
    loadLocalLogs();
    const refresh = setInterval(loadLocalLogs, 5000);
    return () => clearInterval(refresh);
  }, [loadLocalLogs]);

  // Fetch live server status and latency
  const checkServerHealth = useCallback(async () => {
    setIsLoadingServerStatus(true);
    setConnectionState('checking');
    const start = performance.now();
    const isVercel = typeof window !== 'undefined' && window.location.hostname.includes('vercel.app');
    if (isVercel) {
      setServerPingMs(null);
      setConnectionState('checking');
      setServerStatus(null); // Vercel hostname is NOT proof of a healthy PostgreSQL connection.
      setIsLoadingServerStatus(false);
      loadLocalLogs();
      return;
    }
    try {
      const res = await fetch('/api/sync/status', { cache: 'no-store' });
      const ping = Math.round(performance.now() - start);
      setServerPingMs(ping);

      if (res.ok) {
        const text = await res.text();
        if (text && text.trim().startsWith('{')) {
          const json = JSON.parse(text);
          setServerStatus(json);
          setConnectionState('connected');
        } else {
          setConnectionState('checking');
        }
      } else {
        setConnectionState('disconnected');
      }
    } catch {
      setConnectionState('disconnected');
      setServerPingMs(null);
    } finally {
      setIsLoadingServerStatus(false);
      loadLocalLogs();
    }
  }, [loadLocalLogs]);

  useEffect(() => {
    checkServerHealth();
    const interval = setInterval(checkServerHealth, 120000);
    return () => clearInterval(interval);
  }, [checkServerHealth]);

  // Trigger Manual Full Sync
  const handleTriggerFullSync = async () => {
    const res = await forceSyncNow();
    setActionFeedback(res);
    checkServerHealth();
    setTimeout(() => setActionFeedback(null), 6000);
  };

  // Preview Database Snapshot from Authoritative Cloud Records
  const handlePreviewDatabase = async () => {
    setIsLoadingPreview(true);
    setShowDatabasePreviewModal(true);
    try {
      if (!unifiedRepository) throw new Error('المستودع الموحد غير جاهز');
      const fsData = await unifiedRepository.getCloudSnapshot();
      if (fsData && Object.keys(fsData).length > 0 && Object.values(fsData).some((arr: any) => Array.isArray(arr) && arr.length > 0)) {
        setPreviewData(fsData);
      } else {
        throw new Error('المصدر السحابي فارغ أو تعذرت قراءته؛ لن نستبدله ببيانات الشاشة المحلية.');
      }
    } catch (error) {
      setPreviewData(null);
      setActionFeedback({ success: false, message: `تعذّرت معاينة بيانات الخادم: ${String(error)}` });
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Download DB Snapshot as JSON
  const handleDownloadSnapshotJSON = () => {
    if (!previewData) {
      setActionFeedback({ success: false, message: 'لم تُقرأ بيانات الخادم. لا يمكن تنزيل ملف بوصفه نسخة من PostgreSQL.' });
      return;
    }
    const blob = new Blob([JSON.stringify(previewData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Postgres_Readonly_Snapshot_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Local entities counts map
  const localEntitiesCounts: Record<string, number> = useMemo(() => ({
    invoices: invoices.length,
    parties: parties.length,
    inventory: inventory.length,
    vouchers: vouchers.length,
    printOrders: printOrders.length,
    purchases: purchases.length,
    purchaseReturns: purchaseReturns.length,
    salesReturns: salesReturns.length,
    accounts: accounts.length,
    treasuries: treasuries.length,
    employees: employees.length,
    journalEntries: journalEntries.length,
    expenses: expenses.length,
    stockMovements: stockMovements.length,
    warehouseOperations: warehouseOperations.length,
    dailyEntrySheets: (dailyEntrySheets || []).length
  }), [
    invoices.length, parties.length, inventory.length, vouchers.length,
    printOrders.length, purchases.length, purchaseReturns.length,
    salesReturns.length, accounts.length, treasuries.length,
    employees.length, journalEntries.length, expenses.length,
    stockMovements.length, warehouseOperations.length, dailyEntrySheets
  ]);

  const localRecordCollections: Record<string, any[]> = {
    invoices, parties, inventory, vouchers, printOrders, purchases,
    purchaseReturns, salesReturns, accounts, treasuries, employees,
    journalEntries, expenses, stockMovements, warehouseOperations,
    dailyEntrySheets: dailyEntrySheets || []
  };

  // Combined reconciliation table data against authoritative cloud records
  const reconciliationData = useMemo(() => {
    const entitiesList = [
      'invoices', 'parties', 'inventory', 'vouchers', 'printOrders',
      'purchases', 'salesReturns', 'purchaseReturns', 'accounts',
      'treasuries', 'employees', 'journalEntries', 'expenses',
      'stockMovements', 'warehouseOperations', 'dailyEntrySheets'
    ];

    return entitiesList.map(entityKey => {
      const localCount = localEntitiesCounts[entityKey] || 0;
      const serverCount = cloudCounts !== null && cloudCounts[entityKey] !== undefined
        ? cloudCounts[entityKey]
        : -1;
      const diff = serverCount < 0 ? 0 : localCount - serverCount;
      const lastMod = serverStatus?.entities?.[entityKey]?.lastModified ? new Date(serverStatus.entities[entityKey].lastModified) : null;
      const lastModStr = serverStatus && lastMod
        ? lastMod.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })
        : 'حي ومتزامن';

      const comparison = compareRecordCollections(
        localRecordCollections[entityKey], auditedCloudRecords?.[entityKey] ?? (auditedCloudRecords ? [] : undefined)
      );
      const isSynced = comparison.status === 'MATCH';

      return {
        key: entityKey,
        name: ENTITY_ARABIC_NAMES[entityKey] || entityKey,
        localCount,
        serverCount,
        diff,
        isSynced,
        comparison,
        lastModified: lastModStr
      };
    });
  }, [localEntitiesCounts, cloudCounts, serverStatus, auditedCloudRecords, invoices,
      parties, inventory, vouchers, printOrders, purchases, purchaseReturns, salesReturns,
      accounts, treasuries, employees, journalEntries, expenses, stockMovements,
      warehouseOperations, dailyEntrySheets]);

  // Filtered audit logs
  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (activeFilterTab === 'pushed' && log.direction !== 'push') return false;
      if (activeFilterTab === 'pulled' && log.direction !== 'pull') return false;
      if (activeFilterTab === 'issues') return false;

      if (searchTerm.trim()) {
        const term = searchTerm.toLowerCase();
        return (
          log.entityLabel?.toLowerCase().includes(term) ||
          log.details?.toLowerCase().includes(term) ||
          log.documentNumber?.toLowerCase().includes(term) ||
          log.directionLabel?.toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [auditLogs, activeFilterTab, searchTerm]);

  // Startup source is recorded by boot.ts before it contacts PostgreSQL.
  const bootSource = (() => {
    try {
      const raw=sessionStorage.getItem('lobnan_accounting_boot_source_v1');
      return raw ? String(JSON.parse(raw)?.source || '') : '';
    } catch { return ''; }
  })();
  const statementVoucherNumber = useMemo(() => {
    const d = new Date();
    return `SYNC-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  }, []);

  return (
    <div className="space-y-1.5 p-0.5 sm:p-1 text-slate-800" dir="rtl">

      {/* Condensed statement header and single-line indicators. */}
      <div className="bg-white rounded-lg border border-slate-300 shadow-xs px-2 py-1.5 print:border-none print:shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Activity className="w-4 h-4 text-indigo-700 shrink-0" />
            <h1 className="text-sm font-black text-slate-900 whitespace-nowrap">سند المزامنة والتدقيق</h1>
            <span className="text-[10px] font-mono text-slate-600 bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 whitespace-nowrap">{statementVoucherNumber}</span>
          </div>
          <div className="flex items-center flex-wrap gap-1 print:hidden">
            <button type="button" onClick={handleTriggerFullSync} disabled={isServerSyncing}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-emerald-700 text-white hover:bg-emerald-800 text-[11px] font-bold disabled:opacity-50 whitespace-nowrap"
              title="مزامنة التغييرات المعلقة دون إعادة تنزيل قاعدة البيانات كاملة">
              <RefreshCw className={isServerSyncing ? 'w-3 h-3 animate-spin' : 'w-3 h-3'} />
              {isServerSyncing ? 'جارِ المزامنة' : 'مزامنة الآن'}
            </button>
            <button type="button" onClick={() => setIsConflictModalOpen(true)}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold hover:bg-amber-100 whitespace-nowrap"
              title="فتح تفاصيل العمليات المعلقة والتعارضات">
              <Clock className="w-3 h-3" /> المعلقات ({pendingSyncCount})
            </button>
            <button type="button" onClick={() => setShowAdvancedTools(v => !v)}
              aria-expanded={showAdvancedTools}
              className="px-2 py-1.5 rounded-md border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100 text-[11px] font-bold whitespace-nowrap">
              {showAdvancedTools ? 'إخفاء الفحص' : 'أدوات الفحص'}
            </button>
            <button type="button" onClick={() => window.print()}
              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-[11px] font-medium">
              <Printer className="w-3 h-3" /> طباعة
            </button>
            <button type="button" onClick={() => setActiveTab('audit_log')}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-slate-600 hover:text-slate-900 text-[11px] font-medium">
              <ArrowRight className="w-3 h-3" /> رجوع
            </button>
          </div>
        </div>
        {actionFeedback && (
          <div role="status" className={'mt-1 px-2 py-1 rounded border text-[11px] flex items-center justify-between gap-2 ' + (actionFeedback.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-rose-50 border-rose-200 text-rose-900')}>
            <span>{actionFeedback.message}</span>
            <button type="button" onClick={() => setActionFeedback(null)} className="underline shrink-0">إغلاق</button>
          </div>
        )}
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-200 pt-1.5 text-[11px] leading-tight">
          <span className="inline-flex items-center gap-1 whitespace-nowrap" title="حالة فحص الاتصال، وليست إثباتًا لاكتمال المزامنة">
            <span className="text-slate-500">الخادم:</span>
            <strong className={connectionState === 'connected' ? 'text-emerald-700' : connectionState === 'disconnected' ? 'text-rose-700' : 'text-slate-600'}>
              {connectionState === 'connected' ? 'متصل ' + (serverPingMs === null ? '' : '(' + serverPingMs + 'ms)') : connectionState === 'disconnected' ? 'غير متصل' : 'غير مؤكّد'}
            </strong>
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap" title="وقت آخر مزامنة مسجلة">
            <span className="text-slate-500">آخر مزامنة:</span><strong className="text-slate-800">{lastSyncTime || 'لم تُسجل'}</strong>
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap" title="مطابقة المحتوى تتطلب تشغيل الفحص الشامل يدويًا">
            <span className="text-slate-500">المطابقة:</span><strong className="text-slate-800">{auditedCloudRecords ? 'فُحصت عند الطلب' : 'لم تُفحص'}</strong>
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap" title="عدد حركات الإرسال الناجحة في سجل هذا المتصفح">
            <span className="text-slate-500">إرسال:</span><strong className="text-emerald-700">{auditLogs.filter(l => l.direction === 'push' && l.status === 'success').length}</strong>
          </span>
          <span className="inline-flex items-center gap-1 whitespace-nowrap" title="عدد حركات الاستقبال الناجحة في سجل هذا المتصفح">
            <span className="text-slate-500">استقبال:</span><strong className="text-blue-700">{auditLogs.filter(l => l.direction === 'pull' && l.status === 'success').length}</strong>
          </span>
          <button type="button" onClick={() => setActiveFilterTab('issues')}
            className="inline-flex items-center gap-1 whitespace-nowrap hover:underline" title="فتح أخطاء الاتصال المسجلة في هذا المتصفح">
            <span className="text-slate-500">أخطاء الاتصال:</span><strong className="text-rose-700">{connectionIssues.length}</strong>
          </button>
        </div>
      </div>

      {/* 3. Entity-by-Entity Master Database Reconciliation Table */}

      <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
        <div className="px-2 py-1.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs sm:text-sm font-bold text-slate-900">
              مطابقة السجلات مع PostgreSQL
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                if (!window.confirm('سيُقرأ محتوى السجلات من PostgreSQL للمقارنة دون إرسال أو تعديل أي عملية. هل تريد المتابعة؟')) return;
                void loadCloudCounts();
              }}
              disabled={isLoadingCloudCounts}
              className="px-2 py-1 text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-md font-bold inline-flex items-center gap-1 transition cursor-pointer disabled:opacity-50 whitespace-nowrap"
              title="إعادة فحص وتحديث أعداد السجلات السحابية فوراً"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCloudCounts ? 'animate-spin' : ''}`} />
              <span>فحص المطابقة</span>
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[11px] leading-tight text-right border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 font-bold text-[11px]">
                <th className="px-2 py-1">اسم السجل / الكيان المحاسبي</th>
                <th className="px-2 py-1 text-center">العدد بقاعدة بيانات الخادم</th>
                <th className="px-2 py-1 text-center">العدد بالجهاز الحالي</th>
                <th className="px-2 py-1 text-center">حالة النقل والتطابق</th>
                <th className="px-2 py-1 text-center">الفارق</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reconciliationData.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/80 transition">
                  <td className="px-2 py-1 font-bold text-slate-800 whitespace-nowrap">
                    <span>{row.name}</span>
                  </td>
                  <td className="px-2 py-1 text-center font-mono font-bold text-slate-800">
                    {row.serverCount < 0 ? 'لم تُفحص' : row.serverCount.toLocaleString('ar-EG')}
                  </td>
                  <td className="px-2 py-1 text-center font-mono font-bold text-blue-700">
                    {row.localCount.toLocaleString('ar-EG')}
                  </td>
                  <td className="px-2 py-1 text-center">
                    {row.comparison.status === 'NOT_CHECKED' ? (
                      <span className="text-slate-500 text-[10px] whitespace-nowrap">لم يُفحص محتوى الخادم</span>
                    ) : row.isSynced ? (
                      <span className="font-bold text-emerald-700 text-[10px] whitespace-nowrap">مطابق في وقت الفحص</span>
                    ) : (
                      <span className="font-bold text-rose-700 text-[10px]">
                        غير مطابق: {row.comparison.missingOnCloud.length} لدى الجهاز فقط،
                        {' '}{row.comparison.missingOnDevice.length} لدى الخادم فقط،
                        {' '}{row.comparison.differentContent.length} مختلف المحتوى
                      </span>
                    )}
                    {row.comparison.status === 'DIFFERENT' && (
                      <details className="mt-1 text-right text-[10px] text-slate-700">
                        <summary className="cursor-pointer text-blue-700 underline">عرض معرّفات الاختلاف</summary>
                        <div className="mt-1 p-2 rounded bg-slate-50 border border-slate-200 space-y-1 break-all" dir="ltr">
                          <div>Device only: {row.comparison.missingOnCloud.join(', ') || '—'}</div>
                          <div>Server only: {row.comparison.missingOnDevice.join(', ') || '—'}</div>
                          <div>Different content: {row.comparison.differentContent.join(', ') || '—'}</div>
                          {row.comparison.duplicateDeviceIds.length > 0 && <div>Duplicate device IDs: {row.comparison.duplicateDeviceIds.join(', ')}</div>}
                          {row.comparison.duplicateCloudIds.length > 0 && <div>Duplicate server IDs: {row.comparison.duplicateCloudIds.join(', ')}</div>}
                        </div>
                      </details>
                    )}
                  </td>
                  <td className="px-2 py-1 text-center font-mono text-[11px]">
                    <span className={row.diff === 0 ? 'text-slate-600 font-bold' : 'text-amber-700 font-bold'}>
                      {row.serverCount < 0 ? '—' : `${row.diff > 0 ? '+' : ''}${row.diff}`}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>


      {showAdvancedTools && (
        <section className="bg-slate-50 border border-slate-300 rounded-lg p-2 space-y-2 print:hidden" aria-label="أدوات الفحص المتقدم">
          <div>
            <h2 className="font-bold text-sm text-slate-900">أدوات الفحص المتقدم</h2>
            <p className="text-xs text-slate-600 mt-1">هذه الأدوات اختيارية. معاينة القاعدة أو تصدير المطابقة يتطلب قراءة صريحة وقد يتضمن بيانات مالية حساسة؛ لا يرحّل قيودًا ولا يحذف المعلقات.</p>
            <p className="text-[11px] text-slate-700 mt-1" role="status" title="مصدر التهيئة عند آخر فتح للبرنامج، وليس نتيجة فحص كامل لبيانات الخادم">
              مصدر التهيئة: <strong>{bootSource === 'indexeddb-cache' ? 'النسخة المحلية الدائمة IndexedDB (دون تنزيل شامل)' : bootSource === 'postgres-initial' ? 'تهيئة أولى من PostgreSQL؛ تحقق من احتفاظ المتصفح بالتخزين عند تكرارها' : bootSource === 'indexeddb-review' ? 'بيانات محلية تحتاج مراجعة علامة التهيئة' : 'لم تتوفر بيانات التشخيص بعد'}</strong>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={checkServerHealth} disabled={isLoadingServerStatus}
              className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50">
              {isLoadingServerStatus ? 'جارِ الفحص...' : 'فحص الاتصال'}
            </button>
            <button type="button" onClick={handlePreviewDatabase} disabled={isLoadingPreview}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-blue-300 bg-blue-50 text-blue-800 hover:bg-blue-100 disabled:opacity-50">
              <Eye className="w-3.5 h-3.5" /> معاينة PostgreSQL (قراءة فقط)
            </button>
            <button type="button" onClick={handleConnectDrive} disabled={isConnectingDrive}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50"
              title="فحص حالة خدمة Google Drive على الخادم؛ لا ينشئ تفويضًا جديدًا">
              <Cloud className="w-3.5 h-3.5" /> {hasDriveToken ? 'Drive متصل' : 'فحص حالة Drive'}
            </button>
            <button type="button" disabled={!unifiedRepository || exportBusy || isLoadingCloudCounts}
              onClick={async () => {
                if (!unifiedRepository) return;
                if (!window.confirm('سيُقرأ محتوى هذا الجهاز والخادم وتُصدّر بيانات مالية كاملة في ملف محلي للمراجعة فقط. هل تريد الاستمرار؟')) return;
                setExportBusy(true);
                setExportError('');
                setExportFile(null);
                try {
                  setExportFile(await prepareMultiSourceDiagnostic(unifiedRepository));
                } catch (error) {
                  setExportError(`تعذّر تجهيز ملف المطابقة: ${String(error)}`);
                } finally {
                  setExportBusy(false);
                }
              }}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 disabled:opacity-50">
              <Download className="w-3.5 h-3.5" /> {exportBusy ? 'جارِ إعداد الملف...' : 'تصدير مطابقة الجهاز والخادم'}
            </button>
          </div>
          {exportError && <p role="alert" className="text-xs text-rose-700">{exportError}</p>}
          {exportFile && (
            <p role="status" className="text-xs text-slate-700">
              ملف المطابقة جاهز. إن لم يبدأ التنزيل،{' '}
              <a ref={exportLink} href={exportFile.url} download={exportFile.name}
                className="font-bold text-blue-700 underline">اضغط هنا للتنزيل</a>
            </p>
          )}
          <OperationalHealthPanel />
          <LegacyInvoiceAuditPanel />
        </section>
      )}

      {/* 4. Detailed Live Sync Activity Log & Connection Issues */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
        {/* Filter Tabs */}
        <div className="p-2 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveFilterTab('all')}
              className={`px-2 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                activeFilterTab === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              حركات هذا الجهاز المسجلة ({auditLogs.length})
            </button>

            <button
              onClick={() => setActiveFilterTab('pushed')}
              className={`px-2 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                activeFilterTab === 'pushed'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              ما تم إرساله ({auditLogs.filter(l => l.direction === 'push').length})
            </button>

            <button
              onClick={() => setActiveFilterTab('pulled')}
              className={`px-2 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                activeFilterTab === 'pulled'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              ما تم استيعابه ({auditLogs.filter(l => l.direction === 'pull').length})
            </button>


            <button
              onClick={() => setActiveFilterTab('issues')}
              className={`px-2 py-1 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                activeFilterTab === 'issues'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-300'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>أخطاء الاتصال المسجلة محليًا ({connectionIssues.length})</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2.5" />
              <input
                type="text"
                placeholder="بحث في الحركات المسجلة..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-3 pr-8 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
              />
            </div>

          </div>
        </div>

        {/* Issues List */}
        {activeFilterTab === 'issues' ? (
          <div className="p-3 space-y-2">
            {connectionIssues.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-800">لا توجد أي أخطاء أو مشاكل اتصال مسجلة</h3>
                <p className="text-xs text-slate-500 mt-1">
                  عدم وجود أخطاء مسجلة هنا لا يُثبت اكتمال المزامنة؛ راجع الطابور عند الحاجة.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {connectionIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="p-3 bg-rose-50/60 rounded-xl border border-rose-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-200 text-rose-900 border border-rose-300">
                          {issue.errorTypeLabel}
                        </span>
                        <span className="text-xs font-bold text-slate-900 font-mono" dir="ltr">
                          {issue.endpoint}
                        </span>
                      </div>
                      <p className="text-xs text-rose-800 font-medium">
                        {issue.message}
                      </p>
                    </div>
                    <div className="text-left shrink-0 text-[11px] text-slate-500 font-mono">
                      <span>{issue.date}</span> - <span>{issue.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Activity Stream Table */
          <div className="overflow-x-auto">
            {filteredLogs.length === 0 ? (
              <div className="text-center py-10 bg-slate-50">
                <Activity className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <h3 className="text-sm font-bold text-slate-700">لا توجد حركات مسجلة تطابق التصفية</h3>
                <p className="text-xs text-slate-400 mt-1">
                  يعرض هذا الجدول الأحداث المسجلة محليًا في المتصفح؛ سجل الخادم هو المرجع للتأكيد النهائي.
                </p>
              </div>
            ) : (
              <table className="w-full text-xs text-right border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 font-bold text-[11px]">
                    <th className="p-2.5">التسلسل والوقت</th>
                    <th className="p-2.5">الاتجاه</th>
                    <th className="p-2.5">الكيان المحاسبي</th>
                    <th className="p-2.5">نوع العملية</th>
                    <th className="p-2.5">رقم المستند / المعرف</th>
                    <th className="p-2.5">الحالة</th>
                    <th className="p-2.5">تفاصيل النقل الحية</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLogs.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition">
                      <td className="p-2.5 text-slate-500 font-mono text-[11px]">
                        {item.seq ? `#${item.seq} - ` : ''}{item.time}
                      </td>
                      <td className="p-2.5">
                        {item.direction === 'push' ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10px]">
                            <ArrowUpRight className="w-3 h-3" />
                            <span>إرسال للخادم</span>
                          </span>
                        ) : item.direction === 'pull' ? (
                          <span className="inline-flex items-center gap-1 text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[10px]">
                            <ArrowDownLeft className="w-3 h-3" />
                            <span>استقبال من الخادم</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-[10px]">
                            <RefreshCw className="w-3 h-3" />
                            <span>فحص / مزامنة</span>
                          </span>
                        )}
                      </td>
                      <td className="p-2.5 font-bold text-slate-800">
                        {item.entityLabel}
                      </td>
                      <td className="p-2.5">
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                          {item.opLabel}
                        </span>
                      </td>
                      <td className="p-2.5 font-mono text-slate-700">
                        {item.documentNumber || item.documentId || '—'}
                      </td>
                      <td className="p-2.5">
                        {item.status === 'success' ? (
                          <span className="font-bold text-emerald-700 text-[10px]">ناجح بحسب السجل المحلي</span>
                        ) : item.status === 'pending' ? (
                          <span className="font-bold text-amber-700 text-[10px]">بانتظار التأكيد</span>
                        ) : (
                          <span className="font-bold text-rose-700 text-[10px]">فشل / يحتاج مراجعة</span>
                        )}
                      </td>
                      <td className="p-2.5 text-slate-600 text-[11px]">
                        {item.details}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {/* Database Live Preview Modal */}
      {showDatabasePreviewModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in" dir="rtl">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Database className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-black">
                  معاينة قاعدة بيانات خادم PostgreSQL السحابية الحية
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadSnapshotJSON}
                  disabled={!previewData || isLoadingPreview}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير نتيجة القراءة (JSON)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowDatabasePreviewModal(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {isLoadingPreview ? (
                <div className="text-center py-16 space-y-3">
                  <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mx-auto" />
                  <p className="text-sm font-bold text-slate-700">جارِ جلب ومعاينة قاعدة البيانات من سحابة خادم PostgreSQL...</p>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 flex items-center justify-between">
                    <span className="font-bold">
                      حالة البيانات: تأكد من سجلات الخادم قبل اعتماد المطابقة
                    </span>
                    <span className="font-mono text-[11px] text-emerald-800">
                      إجمالي الكيانات: {Object.keys(previewData || {}).length} كيان
                    </span>
                  </div>

                  {/* Entity selector tabs */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200">
                    {Object.keys(previewData || {}).map((entKey) => {
                      const count = (previewData?.[entKey] || []).length;
                      return (
                        <button
                          key={entKey}
                          type="button"
                          onClick={() => setPreviewActiveEntity(entKey)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition cursor-pointer ${
                            previewActiveEntity === entKey
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                          }`}
                        >
                          {ENTITY_ARABIC_NAMES[entKey] || entKey} ({count})
                        </button>
                      );
                    })}
                  </div>

                  {/* Active Entity JSON Content */}
                  <div className="bg-slate-950 text-emerald-400 font-mono text-xs p-4 rounded-xl max-h-96 overflow-y-auto dir-ltr">
                    <pre>
                      {JSON.stringify(previewData?.[previewActiveEntity] || [], null, 2)}
                    </pre>
                  </div>
                </>
              )}
            </div>

            <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowDatabasePreviewModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-lg transition"
              >
                إغلاق المعاينة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sync Conflict and Outbox Disclosure Modal */}
      <SyncConflictModal
        isOpen={isConflictModalOpen}
        onClose={() => setIsConflictModalOpen(false)}
      />
    </div>
  );
};
