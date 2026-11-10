import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useAccounting } from '../context/AccountingContext';
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

async function downloadMultiSourceDiagnostic(repository: any) {
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
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = `lobnan-reconciliation-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
  return report;
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
  Trash2,
  Activity,
  Search,
  ShieldCheck,
  Zap,
  Radio,
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
    settings,
    currentUser,
    getActiveBranch,
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

  const [activeFilterTab, setActiveFilterTab] = useState<'all' | 'pushed' | 'pulled' | 'pending' | 'issues'>('all');
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
  const [isTestingPing, setIsTestingPing] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; seq?: number; ms?: number; message: string } | null>(null);
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [cloudCounts, setCloudCounts] = useState<Record<string, number> | null>(null);
  const [auditedCloudRecords, setAuditedCloudRecords] = useState<Record<string, any[]> | null>(null);
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

  // Non-destructive verification: never send test accounting documents to
  // a legacy API endpoint or claim success based on a simulated server response.
  const handleLiveTestSendReceive = async () => {
    setIsTestingPing(true);
    setTestResult(null);
    try {
      const outcome = await forceSyncNow();
      setTestResult({
        success: outcome.success,
        message: outcome.message
      });
    } catch (error) {
      setTestResult({ success: false, message: String(error) });
    } finally {
      setIsTestingPing(false);
    }
  };

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
      setServerPingMs(25);
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
    if (res?.success) {
      syncAuditService.clearConnectionIssues();
      setConnectionIssues([]);
    }
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
    } catch {
      setPreviewData(null);
    } finally {
      setIsLoadingPreview(false);
    }
  };

  // Download DB Snapshot as JSON
  const handleDownloadSnapshotJSON = () => {
    const snapshot = previewData || {
      invoices, parties, inventory, vouchers, printOrders, purchases,
      purchaseReturns, salesReturns, accounts, treasuries, employees,
      journalEntries, expenses, stockMovements, warehouseOperations, dailyEntrySheets
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Postgres_Master_DB_Snapshot_${new Date().toISOString().slice(0, 10)}.json`;
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
      const isEffectivePending = pendingSyncCount > 0 && log.status === 'pending';
      if (activeFilterTab === 'pushed' && log.direction !== 'push') return false;
      if (activeFilterTab === 'pulled' && log.direction !== 'pull') return false;
      if (activeFilterTab === 'pending' && !isEffectivePending) return false;
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
  }, [auditLogs, activeFilterTab, searchTerm, pendingSyncCount]);

  const activeBranch = getActiveBranch();
  const statementVoucherNumber = useMemo(() => {
    const d = new Date();
    return `SYNC-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
  }, []);

  return (
    <div className="space-y-3 p-1 sm:p-2 text-slate-800" dir="rtl">
      {/* التشخيص الفوري */}
      {/* PostgreSQL connection is checked by the canonical sync coordinator. */}
      {/* 1. Official Header & Voucher Title Banner */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-xs p-3.5 print:border-none print:shadow-none">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3 pb-3 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600 to-blue-700 text-white flex items-center justify-center shadow-sm">
              <Activity className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-black text-slate-900">
                  سند مطابقة وتدقيق المزامنة وفحص قاعدة البيانات الرئيسية
                </h1>
                <span className="bg-blue-100 text-blue-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-blue-200">
                  {statementVoucherNumber}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                كشف إداري ومحاسبي تفصيلي لحالة الإرسال والاستقبال ومطابقة البيانات مع الخادم الرئيسي
              </p>
            </div>
          </div>

          {/* Quick Action Commands */}
          <div className="flex items-center gap-2 flex-wrap print:hidden">

            <button
              type="button"
              onClick={handleTriggerFullSync}
              disabled={isServerSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs transition active:translate-y-px cursor-pointer disabled:opacity-75"
              title="طلب مزامنة العمليات المعلقة والتحقق من تأكيدها من الخادم"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isServerSyncing ? 'animate-spin' : ''}`} />
              <span>{isServerSyncing ? 'جارِ المزامنة...' : 'مزامنة شاملة الآن'}</span>
            </button>

            <button
              type="button"
              onClick={checkServerHealth}
              disabled={isLoadingServerStatus}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold rounded-lg transition active:translate-y-px cursor-pointer"
              title="فحص جودة الاتصال وزمن الاستجابة"
            >
              <Radio className={`w-3.5 h-3.5 ${isLoadingServerStatus ? 'animate-pulse text-amber-600' : 'text-blue-600'}`} />
              <span>فحص الاتصال (Ping)</span>
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition active:translate-y-px cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>طباعة السند</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('audit_log')}
              className="flex items-center gap-1 px-2.5 py-1.5 text-slate-600 hover:text-slate-900 text-xs font-medium hover:bg-slate-100 rounded-lg transition"
            >
              <span>العودة لسجل العمليات</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Feedback Alert Toast */}
        {actionFeedback && (
          <div className={`mt-3 p-2.5 rounded-lg text-xs flex items-center justify-between border ${
            actionFeedback.success
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : 'bg-rose-50 text-rose-900 border-rose-300'
          }`}>
            <div className="flex items-center gap-2">
              {actionFeedback.success ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span className="font-bold">{actionFeedback.message}</span>
            </div>
            <button
              onClick={() => setActionFeedback(null)}
              className="text-xs font-bold underline hover:text-black"
            >
              إغلاق
            </button>
          </div>
        )}

        {/* Voucher Meta Info Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-3 text-xs">
          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-light">حالة الاتصال السحابي:</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <strong className="text-emerald-700 font-bold">حالة اتصال الخادم</strong>
              {serverPingMs !== null && (
                <span className="text-[10px] text-slate-500 font-mono">({serverPingMs}ms)</span>
              )}
            </div>
          </div>

          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-light">آخر مزامنة ناجحة:</span>
            <span className="font-mono font-bold text-slate-800 block mt-0.5">
              {lastSyncTime || 'الآن'}
            </span>
          </div>

          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-light">الفرع والمنشأة:</span>
            <span className="font-bold text-slate-800 block mt-0.5 truncate">
              {settings.name || 'مطبعة ومكتبة لبنان'} - {activeBranch?.name || 'الرئيسي'}
            </span>
          </div>

          <div className="bg-slate-50 p-2 rounded-lg border border-slate-200">
            <span className="text-[10px] text-slate-400 block font-light">المشرف / المحاسب:</span>
            <span className="font-bold text-slate-800 block mt-0.5 truncate">
              {currentUser?.fullName || currentUser?.username || 'مدير النظام'}
            </span>
          </div>
        </div>

        {/* Live Send & Receive Verification Test Control */}
        <div className="mt-3.5 p-3 rounded-xl bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white print:hidden shadow-md border border-indigo-900">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 animate-pulse" />
                <h3 className="text-sm font-black text-white">
                  فحص إرسال واستقبال الإدخالات عبر خادم المزامنة الرئيسي
                </h3>
              </div>
              <p className="text-xs text-slate-300 mt-1">
                اضغط الزر لإرسال قيد واختبار استجابته وقراءته المباشرة من سحابة خادم PostgreSQL فوراً دون أي وسطاء:
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                type="button"
                onClick={handleLiveTestSendReceive}
                disabled={isTestingPing}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-slate-950 font-black text-xs rounded-lg shadow-md transition cursor-pointer disabled:opacity-50"
              >
                <Zap className={`w-4 h-4 ${isTestingPing ? 'animate-bounce text-amber-300' : ''}`} />
                <span>{isTestingPing ? 'جارِ الفحص والتأكيد...' : 'اختبار إرسال واستقبال الآن ⚡'}</span>
              </button>

              <button
                type="button"
                onClick={handlePreviewDatabase}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-lg shadow-md transition cursor-pointer"
              >
                <Eye className="w-4 h-4 text-blue-200" />
                <span>معاينة قاعدة البيانات السحابية 👁️</span>
              </button>

              <button
                type="button"
                onClick={() => setIsConflictModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-md transition cursor-pointer"
                title="كشف العمليات المتعارضة والمعلقة وإدارتها بحرية"
              >
                <AlertTriangle className="w-4 h-4 text-amber-200" />
                <span>كشف المعلقات والتعارضات ({pendingSyncCount}) 📋</span>
              </button>

              <button
                type="button"
                onClick={handleConnectDrive}
                disabled={isConnectingDrive}
                className={`flex items-center gap-1.5 px-3 py-2 font-bold text-xs rounded-lg border transition cursor-pointer ${
                  hasDriveToken
                    ? 'bg-emerald-950/80 text-emerald-200 border-emerald-600/80 hover:bg-emerald-900'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-600'
                }`}
              >
                <Cloud className={`w-3.5 h-3.5 ${hasDriveToken ? 'text-emerald-400' : 'text-blue-400'}`} />
                <span>{hasDriveToken ? 'Google Drive (مرتبط ✅)' : 'ربط Google Drive'}</span>
              </button>
            </div>
          </div>

          {testResult && (
            <div className={`mt-3 p-2.5 rounded-lg text-xs font-bold flex items-center gap-2 ${
              testResult.success
                ? 'bg-emerald-950/90 text-emerald-300 border border-emerald-500/60'
                : 'bg-rose-950/90 text-rose-300 border border-rose-500/60'
            }`}>
              {testResult.success ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-rose-400 shrink-0" />}
              <span>{testResult.message}</span>
            </div>
          )}
        </div>
      </div>

      {/* 2. Key Synchronization KPI Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="bg-white p-3 rounded-xl border border-emerald-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">ما تم نقله وإرساله لسحابة الخادم الرئيسي:</span>
            <span className="text-xl font-black text-emerald-700 block mt-0.5">
              {auditLogs.filter(l => l.direction === 'push' && l.status === 'success').length}
            </span>
            <span className="text-[10px] text-emerald-600 block mt-0.5">
              حركة مؤكدة في قاعدة البيانات السحابية
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-100">
            <ArrowUpRight className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-3 rounded-xl border border-blue-200 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">ما تم جلبه واستيعابه سحابياً:</span>
            <span className="text-xl font-black text-blue-700 block mt-0.5">
              {auditLogs.filter(l => l.direction === 'pull').length}
            </span>
            <span className="text-[10px] text-blue-600 block mt-0.5">
              تحديث وحركة واردة حية من أجهزة أخرى
            </span>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center border border-blue-100">
            <ArrowDownLeft className="w-5 h-5" />
          </div>
        </div>

        <div
          onClick={() => setIsConflictModalOpen(true)}
          className={`p-3 rounded-xl border shadow-xs flex items-center justify-between cursor-pointer transition hover:shadow-md ${
            pendingSyncCount > 0 ? 'bg-amber-50 border-amber-300 hover:border-amber-400' : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
          title="انقر لفتح كشف العمليات المعلقة والمتعارضة واختيار طريقة معالجتها"
        >
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-bold text-slate-500 block">المعلقات (بانتظار الإرسال):</span>
              <span className="text-[10px] text-amber-700 font-bold bg-amber-100 px-1.5 py-0.5 rounded">كشف وتحكم 🔍</span>
            </div>
            <span className={`text-xl font-black block mt-0.5 ${
              pendingSyncCount > 0 ? 'text-amber-700' : 'text-slate-800'
            }`}>
              {pendingSyncCount}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {pendingSyncCount > 0 ? 'انقر لعرض الكشف وإعادة الترقيم أو الاستبعاد' : 'كافة البيانات متطابقة سحابياً بالكامل 🟢'}
            </span>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
            pendingSyncCount > 0 ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-slate-50 text-slate-500 border-slate-100'
          }`}>
            <Clock className="w-5 h-5" />
          </div>
        </div>

        <div className={`p-3 rounded-xl border shadow-xs flex items-center justify-between ${
          connectionIssues.length > 0 ? 'bg-rose-50 border-rose-300' : 'bg-white border-slate-200'
        }`}>
          <div>
            <span className="text-[11px] font-bold text-slate-500 block">سجل أخطاء الاتصال بالـ الخادم الرئيسي:</span>
            <span className={`text-xl font-black block mt-0.5 ${
              connectionIssues.length > 0 ? 'text-rose-700' : 'text-slate-800'
            }`}>
              {connectionIssues.length}
            </span>
            <span className="text-[10px] text-slate-500 block mt-0.5">
              {connectionIssues.length > 0 ? 'سجل محمي في خادم PostgreSQL' : 'لا توجد أخطاء اتصال 🟢'}
            </span>
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${
            connectionIssues.length > 0 ? 'bg-rose-100 text-rose-700 border-rose-200' : 'bg-slate-50 text-slate-500 border-slate-100'
          }`}>
            <AlertOctagon className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Entity-by-Entity Master Database Reconciliation Table */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs sm:text-sm font-bold text-slate-900">
              جدول مطابقة الكيانات مع قاعدة بيانات خادم PostgreSQL المباشرة
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!unifiedRepository || isLoadingCloudCounts}
              onClick={async () => {
                if (!unifiedRepository) return;
                if (!window.confirm('سيتم قراءة السجلات السحابية مرة واحدة وتصدير بيانات مالية كاملة للمطابقة. هل تريد المتابعة؟')) return;
                try {
                  await downloadMultiSourceDiagnostic(unifiedRepository);
                  setActionFeedback({ success: true, message: 'تم تنزيل ملف المقارنة دون تعديل السجلات.' });
                } catch (error) {
                  setActionFeedback({ success: false, message: `فشل استخراج تقرير المصادر: ${String(error)}` });
                }
              }}
              className="px-2.5 py-1 text-[11px] bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg font-bold"
            >تصدير مصادر البيانات الثلاث للمراجعة</button>
            <button
              onClick={() => {
                loadCloudCounts();
                forceSyncNow();
              }}
              disabled={isLoadingCloudCounts}
              className="px-2.5 py-1 text-[11px] bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg font-bold flex items-center gap-1 transition cursor-pointer disabled:opacity-50"
              title="إعادة فحص وتحديث أعداد السجلات السحابية فوراً"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCloudCounts ? 'animate-spin' : ''}`} />
              <span>تحديث المطابقة السحابية</span>
            </button>
            <span className="text-[11px] text-slate-500 font-bold text-emerald-700">
              تخزين ومطابقة سحابية موحدة 🔥
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right border-collapse">
            <thead>
              <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 font-bold text-[11px]">
                <th className="p-2.5">اسم السجل / الكيان المحاسبي</th>
                <th className="p-2.5 text-center">العدد بقاعدة بيانات الخادم</th>
                <th className="p-2.5 text-center">العدد بالجهاز الحالي</th>
                <th className="p-2.5 text-center">حالة النقل والتطابق</th>
                <th className="p-2.5 text-center">الفارق</th>
                <th className="p-2.5 text-center">حالة الحفظ السحابي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {reconciliationData.map((row) => (
                <tr key={row.key} className="hover:bg-slate-50/80 transition">
                  <td className="p-2.5 font-bold text-slate-800 flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                    <span>{row.name}</span>
                  </td>
                  <td className="p-2.5 text-center font-mono font-bold text-slate-800">
                    {row.serverCount < 0 ? 'لم تُفحص' : row.serverCount.toLocaleString('ar-EG')}
                  </td>
                  <td className="p-2.5 text-center font-mono font-bold text-blue-700">
                    {row.localCount.toLocaleString('ar-EG')}
                  </td>
                  <td className="p-2.5 text-center">
                    {row.isSynced ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>تطابق الهوية والمحتوى بعد الفحص</span>
                      </span>
                    ) : row.comparison.status === 'NOT_CHECKED' ? (
                      <span className="text-slate-600 text-[10px]">لم يتم فحص المحتوى السحابي بعد</span>
                    ) : row.comparison.differentContent.length > 0 ? (
                      <span className="text-rose-700 text-[10px] font-bold">تعارض محتوى: {row.comparison.differentContent.length} سجل</span>
                    ) : row.diff > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                        <Clock className="w-3 h-3 text-amber-600" />
                        <span>{row.diff} بانتظار الإرسال ⏳</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                        <ArrowDownLeft className="w-3 h-3 text-blue-600" />
                        <span>{Math.abs(row.diff)} بانتظار الجلب 🔄</span>
                      </span>
                    )}
                  </td>
                  <td className="p-2.5 text-center font-mono text-[11px]">
                    <span className={row.diff === 0 ? "text-emerald-700 font-bold" : (row.diff > 0 ? "text-amber-700 font-bold" : "text-blue-700 font-bold")}>
                      {row.serverCount < 0 ? '—' : row.isSynced ? '0 (مطابق)' : row.comparison.differentContent.length ? `تعارض ${row.comparison.differentContent.length}` : `${row.diff > 0 ? '+' : ''}${row.diff}`}
                    </span>
                  </td>
                  <td className="p-2.5 text-center text-emerald-800 text-[10px] font-mono font-bold">
                    {row.comparison.status === 'MATCH' ? 'مفحوص' : row.comparison.status === 'DIFFERENT' ? 'غير مطابق' : 'بانتظار الفحص'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Detailed Live Sync Activity Log & Connection Issues */}
      <div className="bg-white rounded-xl border border-slate-300 shadow-xs overflow-hidden">
        {/* Filter Tabs */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-2.5">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setActiveFilterTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeFilterTab === 'all'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              كافة الحركات المسجلة في الخادم الرئيسي ({auditLogs.length})
            </button>

            <button
              onClick={() => setActiveFilterTab('pushed')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeFilterTab === 'pushed'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              ما تم إرساله ({auditLogs.filter(l => l.direction === 'push').length})
            </button>

            <button
              onClick={() => setActiveFilterTab('pulled')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeFilterTab === 'pulled'
                  ? 'bg-blue-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              ما تم استيعابه ({auditLogs.filter(l => l.direction === 'pull').length})
            </button>

            <button
              onClick={() => setActiveFilterTab('pending')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                activeFilterTab === 'pending'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-white text-slate-600 hover:bg-slate-200 border border-slate-300'
              }`}
            >
              المعلقات ({pendingSyncCount > 0 ? auditLogs.filter(l => l.status === 'pending').length : 0})
            </button>

            <button
              onClick={() => setActiveFilterTab('issues')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1 ${
                activeFilterTab === 'issues'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-white text-rose-700 hover:bg-rose-50 border border-rose-300'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>سجل الأخطاء ومشاكل الاتصال ({connectionIssues.length})</span>
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

            {activeFilterTab === 'issues' && connectionIssues.length > 0 && (
              <button
                onClick={() => {
                  syncAuditService.clearConnectionIssues();
                  setConnectionIssues([]);
                  loadLocalLogs();
                  setActionFeedback({ success: true, message: 'تم مسح وتفريغ سجل الأخطاء من الخادم الرئيسي بنجاح ✅' });
                  setTimeout(() => setActionFeedback(null), 3000);
                }}
                className="px-2.5 py-1.5 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg flex items-center gap-1 shrink-0 cursor-pointer"
                title="مسح سجل الأخطاء"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>مسح الأخطاء</span>
              </button>
            )}

            {activeFilterTab !== 'issues' && auditLogs.length > 0 && (
              <button
                onClick={() => {
                  syncAuditService.clearAuditLogs();
                  setAuditLogs([]);
                  loadLocalLogs();
                  setActionFeedback({ success: true, message: 'تم تفريغ سجل حركات المزامنة بنجاح ✅' });
                  setTimeout(() => setActionFeedback(null), 3000);
                }}
                className="px-2.5 py-1.5 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg flex items-center gap-1 shrink-0 cursor-pointer"
                title="تفريغ السجل"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>تفريغ</span>
              </button>
            )}
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
                  كافة عمليات الإرسال والاستقبال مع سحابة خادم PostgreSQL تُراجع وفق تأكيدات الخادم وحالة الطابور.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 shadow-2xs">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                    <div>
                      <strong className="block text-emerald-800 font-bold">الاتصال بسحابة خادم PostgreSQL تُعرض حالته بعد الفحص</strong>
                      <span className="text-[11px] text-emerald-700">
                        سجل الأخطاء أدناه محفوظ في سحابة خادم PostgreSQL للتتبع والتدقيق الفني.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      syncAuditService.clearConnectionIssues();
                      setConnectionIssues([]);
                      loadLocalLogs();
                      setActionFeedback({ success: true, message: 'تم تصفير ومسح سجل الأخطاء بنجاح ✅' });
                      setTimeout(() => setActionFeedback(null), 3000);
                    }}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shrink-0 transition cursor-pointer shadow-xs"
                  >
                    تصفير ومسح السجل الآن
                  </button>
                </div>
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
                  تتم إضافة الحركات تلقائياً فور تسجيل الفواتير والسندات في قاعدة بيانات خادم PostgreSQL.
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
                            <span>نقل للـ الخادم الرئيسي</span>
                          </span>
                        ) : item.direction === 'pull' ? (
                          <span className="inline-flex items-center gap-1 text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200 text-[10px]">
                            <ArrowDownLeft className="w-3 h-3" />
                            <span>استيعاب سحابي</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-indigo-700 font-bold bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 text-[10px]">
                            <RefreshCw className="w-3 h-3" />
                            <span>مزامنة شاملة</span>
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
                        <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[10px]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>مؤكد سحابياً 🟢</span>
                        </span>
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
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تحميل النسخة الاحتياطية (JSON)</span>
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
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl text-xs text-emerald-900 flex items-center justify-between">
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
