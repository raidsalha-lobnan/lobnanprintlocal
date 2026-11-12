import {LocalServerSetup} from './components/LocalServerSetup';
import {secureLoginEnabled} from './services/secureAuth';
import { ManualInvoiceView } from './components/ManualInvoiceView';
import React, { useEffect } from 'react';
import { OfflineIndicator } from './components/OfflineIndicator';
import { TelegramBotIntegration } from './components/TelegramBotIntegration';
import { AccountingProvider, useAccounting } from './context/AccountingContext';
import { Navbar } from './components/Navbar';
import {explainSyncFailure} from './sync-next/syncFailureGuide';
import {shouldUpgradeClientBuild} from './utils/buildUpgrade';
import { DesktopStatusBar } from './components/DesktopStatusBar';
import { HomeScreenView } from './components/HomeScreenView';
import { DashboardView } from './components/DashboardView';
import { PosView } from './components/PosView';
import { PrintOrdersView } from './components/PrintOrdersView';
import { NewPrintOrderView } from './components/NewPrintOrderView';
import { InvoicesView } from './components/InvoicesView';
import { ExcelOneDriveDraftsView } from './components/ExcelOneDriveDraftsView';
import { DailyEntrySheetView } from './components/DailyEntrySheetView';
import { SpecialInvoiceView } from './components/SpecialInvoiceView';
import { InventoryView } from './components/InventoryView';
import { PurchasesView } from './components/PurchasesView';
import { AccountingView } from './components/AccountingView';
import { ReportsView } from './components/ReportsView';
import { PartiesView } from './components/PartiesView';
import { EmployeesView } from './components/EmployeesView';
import { TreasuriesView } from './components/TreasuriesView';
import { SettingsView } from './components/SettingsView';
import { BranchesManagementView } from './components/BranchesManagementView';
import { UsersPermissionsView } from './components/UsersPermissionsView';
import { WarehouseOperationsView } from './components/WarehouseOperationsView';
import { SalesReturnsView } from './components/SalesReturnsView';
import { ReceiptVouchersView } from './components/ReceiptVouchersView';
import { PaymentVouchersView } from './components/PaymentVouchersView';
import { ExpensesView } from './components/ExpensesView';
import { DebtClearingView } from './components/DebtClearingView';
import { AuditLogView } from './components/AuditLogView';
import { SyncAuditStatementView } from './components/SyncAuditStatementView';
import { InvoicePrintModal } from './components/InvoicePrintModal';
import { JobTicketModal } from './components/JobTicketModal';
import { PayrollPrintModal } from './components/PayrollPrintModal';
import { AccountStatementModal } from './components/AccountStatementModal';
import { PurchasePrintModal } from './components/PurchasePrintModal';
import { VoucherPrintModal } from './components/VoucherPrintModal';
import { TransactionLifecycleModal } from './components/TransactionLifecycleModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LoginView } from './components/LoginView';

const MainLayout: React.FC = () => {
  const {
    activeTab,
    hasUnsyncedChanges,
    settings,
    setActiveTab,
    hasPermission,
    currentUser,
    selectedInvoiceForPrint,
    selectedInvoiceForLifecycle,
    selectedJobForPrint,
    selectedVoucherForPrint,
    selectedPayrollSheetForPrint,
    selectedPartyForStatement,
    selectedEmployeeForStatement,
    selectedPurchaseForPrint,
    selectedReturnForPrint,
    selectedSalesReturnForPrint,
  } = useAccounting();

  const [localSaveFailure,setLocalSaveFailure]=React.useState<{
    entity:string;raw:string;title:string;explanation:string;nextStep:string
  }|null>(null);
  React.useEffect(()=>{
    const onFailure=(event:Event)=>{
      const detail=(event as CustomEvent<{entity?:string;error?:string}>).detail;
      const raw=String(detail?.error||'UNKNOWN_LOCAL_WRITE_FAILURE');
      const entity=String(detail?.entity||'');
      const guide=explainSyncFailure(raw,entity);
      setLocalSaveFailure({entity,raw,title:guide.title,
        explanation:guide.explanation,nextStep:guide.nextStep});
    };
    window.addEventListener('accounting_save_error',onFailure);
    return()=>window.removeEventListener('accounting_save_error',onFailure);
  },[]);

  const isPrintModalActive = Boolean(
    selectedInvoiceForPrint ||
    selectedInvoiceForLifecycle ||
    selectedJobForPrint ||
    selectedVoucherForPrint ||
    selectedPayrollSheetForPrint ||
    selectedPartyForStatement ||
    selectedEmployeeForStatement ||
    selectedPurchaseForPrint ||
    selectedReturnForPrint ||
    selectedSalesReturnForPrint
  );

  // Sync document title with configured appTitle
  React.useEffect(() => {
    const title = settings?.appTitle || 'برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان - م.رائد صالحة';
    document.title = title;
  }, [settings?.appTitle]);


  // Code updates require loading the new JS bundle; data changes are already live.
  // Auto-reload only at a safe navigation point, never over an unsaved POS form.
  const safeAutoUpgradeRef = React.useRef({activeTab, hasUnsyncedChanges, isPrintModalActive});
  safeAutoUpgradeRef.current = {activeTab, hasUnsyncedChanges, isPrintModalActive};
  React.useEffect(() => {
    const loadedBuildSha = String(import.meta.env.VITE_CLIENT_BUILD_SHA || '').trim();
    let currentServerVersion: string | null = null;
    let pendingVersion: string | null = null;
    let checking = false;
    const checkVersion = async () => {
      if (checking) return;
      checking = true;
      try {
        const res = await fetch('/api/app-version', {cache: 'no-store'});
        if (!res.ok || !res.headers.get('content-type')?.includes('application/json')) return;
        const data = await res.json();
        const next = typeof data.version === 'string' ? data.version.trim() : '';
        if (!next) return;
        pendingVersion = shouldUpgradeClientBuild(loadedBuildSha,currentServerVersion,next) ? next : null;
        currentServerVersion = next;
        if (pendingVersion) {
          const s = safeAutoUpgradeRef.current;
          const el = document.activeElement as HTMLElement | null;
          const editing = !!el?.matches('input,textarea,select,[contenteditable="true"]');
          const safeTab = s.activeTab === 'home' || s.activeTab === 'dashboard';
          // Outbox data is already durable in IndexedDB, including rejected
          // commands. Blocking code upgrades whenever a conflict exists would
          // leave those devices permanently trapped on an obsolete JS build.
          if (!s.isPrintModalActive && !editing && safeTab) {
            window.location.reload();
          }
        }
      } catch (e) {
        // An unavailable version endpoint never interrupts offline work.
      } finally { checking = false; }
    };
    const onVisibility = () => { if (document.visibilityState === 'visible') void checkVersion(); };
    void checkVersion();
    const timer = setInterval(() => { void checkVersion(); }, 15000);
    document.addEventListener('visibilitychange', onVisibility);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  // Enforce screen permissions
  React.useEffect(() => {
    const isAllowed = () => {
      switch(activeTab) {
        case 'home':
        case 'dashboard':
          return hasPermission('view_dashboard');
        case 'pos':
          return hasPermission('view_pos');
        case 'print_orders':
        case 'new_print_order':
          return hasPermission('view_print_orders');
        case 'manual_invoices':
        case 'invoices':
        case 'excel_drafts':
        case 'daily_entry_sheet':
        case 'special_invoice':
        case 'sales_returns':
          return hasPermission('view_invoices');
        case 'inventory':
        case 'warehouses':
        case 'purchases':
        case 'purchases_invoices':
        case 'purchases_suppliers':
        case 'purchases_returns':
          return hasPermission('view_inventory');
        case 'accounting':
        case 'expenses':
        case 'debt_clearing':
        case 'treasuries':
          return hasPermission('view_accounting');
        case 'receipt_vouchers':
          return hasPermission('view_accounting') && hasPermission('create_receipt');
        case 'payment_vouchers':
          return hasPermission('view_accounting') && hasPermission('create_payment');
        case 'reports':
        case 'report_customer_statement':
        case 'report_supplier_statement':
        case 'report_employee_statement':
        case 'report_customer_items':
        case 'report_supplier_items':
        case 'report_receipt_vouchers':
        case 'report_payment_vouchers':
        case 'report_payroll_sheets':
        case 'report_treasuries_movement':
          return hasPermission('view_reports');
        case 'settings':
        case 'settings_general':
        case 'settings_sql':
        case 'settings_backup':
        case 'employees':
        case 'employees_adjustments':
        case 'employees_payroll':
          return hasPermission('view_settings');
        case 'users_permissions':
        case 'branches':
          return currentUser?.roleId === 'role-admin' || currentUser?.id === 'usr-1' || currentUser?.roleName === 'مدير النظام';
        case 'parties':
          return hasPermission('view_settings') || hasPermission('view') || hasPermission('view_invoices') || hasPermission('view_pos');
        default:
          return true;
      }
    };

    if (!isAllowed()) {
      if (hasPermission('view_pos')) setActiveTab('pos');
      else if (hasPermission('view_print_orders')) setActiveTab('print_orders');
      else if (hasPermission('view_dashboard')) setActiveTab('dashboard');
      else setActiveTab('settings');
    }
  }, [activeTab, hasPermission, setActiveTab]);


  // Global auto-select, full field highlight & active cell/field memory across page reloads (F5 / Refresh)
  // عند وضع المؤشر في أي خانة يتم تحديد وتعليم محتواها وخانتها بالكامل، وحفظها لتبقى في نفس الخانة عند التحديث
  useEffect(() => {
    let activeMouseDownTarget: HTMLElement | null = null;

    const saveActiveField = (target: HTMLElement | null) => {
      if (!target) return;
      if (
        (target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'file', 'image', 'reset'].includes(target.type)) ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        try {
          const id = target.id || '';
          const name = target.getAttribute('name') || '';
          const placeholder = target.getAttribute('placeholder') || '';
          const dataPosField = target.getAttribute('data-pos-field') || '';
          const dataRowId = target.getAttribute('data-row-id') || '';
          const ariaLabel = target.getAttribute('aria-label') || '';
          const title = target.getAttribute('title') || '';
          
          let inputIndex = -1;
          try {
            const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select'));
            inputIndex = allInputs.indexOf(target);
          } catch {}

          let selectionStart: number | null = null;
          let selectionEnd: number | null = null;
          try {
            if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
              selectionStart = target.selectionStart;
              selectionEnd = target.selectionEnd;
            }
          } catch {}
          
          localStorage.setItem('alnoor_last_focused_element', JSON.stringify({
            id,
            name,
            placeholder,
            dataPosField,
            dataRowId,
            ariaLabel,
            title,
            inputIndex,
            selectionStart,
            selectionEnd,
            activeTab,
            timestamp: Date.now()
          }));
        } catch {}
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        (target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'file', 'image', 'reset'].includes(target.type)) ||
        target instanceof HTMLTextAreaElement
      ) {
        if (document.activeElement !== target) {
          activeMouseDownTarget = target;
        }
      }
    };

    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      saveActiveField(target);

      if (
        (target instanceof HTMLInputElement && !['checkbox', 'radio', 'button', 'submit', 'file', 'image', 'reset'].includes(target.type)) ||
        target instanceof HTMLTextAreaElement
      ) {
        // Automatically select the entire contents of the field
        setTimeout(() => {
          try {
            (target as HTMLInputElement | HTMLTextAreaElement).select();
          } catch {
            // Ignore elements that do not support select()
          }
        }, 15);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (activeMouseDownTarget && e.target === activeMouseDownTarget) {
        const input = activeMouseDownTarget as HTMLInputElement | HTMLTextAreaElement;
        setTimeout(() => {
          try {
            input.select();
          } catch {}
        }, 15);
        activeMouseDownTarget = null;
      }
    };

    const handleBeforeUnload = () => {
      saveActiveField(document.activeElement as HTMLElement | null);
    };

    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('focusin', handleFocusIn, true);
    document.addEventListener('mouseup', handleMouseUp, true);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.removeEventListener('focusin', handleFocusIn, true);
      document.removeEventListener('mouseup', handleMouseUp, true);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [activeTab]);

  // استرجاع التركيز التلقائي إلى نفس الخانة / الحقل بالضبط عند عمل رفرش أو ريلود (F5) مع محاولات متتابعة تضمن التموضع
  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 15;
    let timer: any = null;

    const tryRestoreFocus = (): boolean => {
      attempts++;
      try {
        const raw = localStorage.getItem('alnoor_last_focused_element');
        if (!raw) return true;
        const info = JSON.parse(raw);
        if (!info || Date.now() - (info.timestamp || 0) > 300000) return true; // ignore if older than 5 minutes
        if (info.placeholder && info.placeholder.includes('العميل')) return true; // do not auto-focus customer combobox
        if (info.activeTab && info.activeTab !== activeTab) return true; // do not restore across different tabs

        let target: HTMLElement | null = null;
        if (info.id) {
          target = document.getElementById(info.id);
        }
        if (!target && info.dataRowId && info.dataPosField) {
          target = document.querySelector(`[data-row-id="${info.dataRowId}"][data-pos-field="${info.dataPosField}"]`);
        }
        if (!target && info.dataPosField) {
          target = document.querySelector(`[data-pos-field="${info.dataPosField}"]`);
        }
        if (!target && info.name) {
          target = document.querySelector(`input[name="${info.name}"], textarea[name="${info.name}"]`);
        }
        if (!target && info.placeholder) {
          target = document.querySelector(`input[placeholder="${info.placeholder}"], textarea[placeholder="${info.placeholder}"]`);
        }
        if (!target && info.title) {
          target = document.querySelector(`input[title="${info.title}"], textarea[title="${info.title}"]`);
        }
        if (!target && info.ariaLabel) {
          target = document.querySelector(`[aria-label="${info.ariaLabel}"]`);
        }
        if (!target && typeof info.inputIndex === 'number' && info.inputIndex >= 0) {
          const allInputs = Array.from(document.querySelectorAll('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]), textarea, select'));
          if (allInputs[info.inputIndex]) {
            target = allInputs[info.inputIndex] as HTMLElement;
          }
        }

        if (target && typeof target.focus === 'function' && document.contains(target)) {
          target.focus();
          if (
            info.selectionStart !== null &&
            info.selectionEnd !== null &&
            typeof (target as any).setSelectionRange === 'function' &&
            info.selectionStart !== info.selectionEnd
          ) {
            try {
              (target as any).setSelectionRange(info.selectionStart, info.selectionEnd);
            } catch {}
          } else if (typeof (target as any).select === 'function') {
            try {
              (target as any).select();
            } catch {}
          }
          return true; // Successfully restored focus
        }
      } catch {}

      return false;
    };

    const runRestore = () => {
      const done = tryRestoreFocus();
      if (!done && attempts < maxAttempts) {
        timer = setTimeout(runRestore, attempts < 4 ? 80 : 200);
      }
    };

    timer = setTimeout(runRestore, 60);

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [activeTab]);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return <HomeScreenView />;
      case 'dashboard':
        return <DashboardView />;
      case 'pos':
        return <PosView />;
      case 'print_orders':
        return <PrintOrdersView />;
      case 'new_print_order':
        return <NewPrintOrderView onBack={() => setActiveTab('print_orders')} />;
      case 'invoices':
        return <InvoicesView />;
      case 'excel_drafts':
        return <ExcelOneDriveDraftsView />;
      case 'daily_entry_sheet':
        return <DailyEntrySheetView />;
      case 'special_invoice':
        return <SpecialInvoiceView />;
      case 'sales_returns':
        return <SalesReturnsView />;
      case 'receipt_vouchers':
        return <ReceiptVouchersView />;
      case 'inventory':
        return <InventoryView />;
      case 'warehouses':
        return <WarehouseOperationsView />;
      case 'purchases':
      case 'purchases_suppliers':
        return <PurchasesView initialTab="suppliers" />;
      case 'purchases_invoices':
        return <PurchasesView initialTab="invoices" />;
      case 'purchases_returns':
        return <PurchasesView initialTab="returns" />;
      case 'payment_vouchers':
        return <PaymentVouchersView />;
      case 'expenses':
        return <ExpensesView />;
      case 'debt_clearing':
        return <DebtClearingView />;
      case 'audit_log':
        return <AuditLogView />;
      case 'sync_statement':
      case 'sync_audit':
        return <SyncAuditStatementView />;
      case 'accounting':
        return <AccountingView />;
      case 'reports':
        return <ReportsView />;
      case 'report_customer_statement':
        return <ReportsView initialReport="customer_statement" />;
      case 'report_customer_items':
        return <ReportsView initialReport="customer_items" />;
      case 'report_supplier_statement':
        return <ReportsView initialReport="supplier_statement" />;
      case 'report_supplier_items':
        return <ReportsView initialReport="supplier_items" />;
      case 'report_receipt_vouchers':
        return <ReportsView initialReport="receipt_vouchers" />;
      case 'report_payment_vouchers':
        return <ReportsView initialReport="payment_vouchers" />;
      case 'report_employee_statement':
        return <ReportsView initialReport="employee_statement" />;
      case 'report_payroll_sheets':
        return <ReportsView initialReport="payroll_sheets" />;
      case 'report_treasuries_movement':
        return <ReportsView initialReport="treasuries_movement" />;
      case 'parties':
        return <PartiesView />;
      case 'employees':
        return <EmployeesView initialSubTab="employees" />;
      case 'employees_adjustments':
        return <EmployeesView initialSubTab="adjustments" />;
      case 'employees_payroll':
        return <EmployeesView initialSubTab="payroll_sheets" />;
      case 'treasuries':
        return <TreasuriesView />;
      case 'branches':
        return <BranchesManagementView />;
      case 'users_permissions':
        return <UsersPermissionsView />;
      case 'settings':
      case 'settings_general':
        return <SettingsView initialTab="general" />;
      case 'settings_sql':
        return <SettingsView initialTab="sql" />;
      case 'settings_backup':
        return <SettingsView initialTab="backup" />;
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className={`flex flex-col h-screen max-h-screen w-full overflow-hidden bg-[#eef2f6] text-[#0f172a] font-sans selection:bg-blue-600 selection:text-white print:h-auto print:bg-white print:overflow-visible ${isPrintModalActive ? 'print-modal-is-active' : ''}`} dir="rtl">
      {/* Top Header & Horizontal Menu Bar - ALWAYS hidden during print */}
      <div className="shrink-0 print:hidden z-30">
        <Navbar />
      </div>

      {localSaveFailure && !isPrintModalActive && (
        <div role="alert" className="shrink-0 print:hidden z-40 border-b border-amber-300 bg-amber-50 px-3 py-2 text-xs text-slate-900">
          <div className="flex gap-3 items-start justify-between">
            <div>
              <div className="font-bold">تعذر حفظ تغيير محليًا — {localSaveFailure.title}</div>
              <div className="mt-1">{localSaveFailure.explanation}</div>
              <div className="mt-1 font-semibold">{localSaveFailure.nextStep}</div>
              <details className="mt-1 text-slate-600">
                <summary className="cursor-pointer">تفاصيل تقنية للتشخيص</summary>
                <code className="break-all">{localSaveFailure.entity}: {localSaveFailure.raw}</code>
              </details>
            </div>
            <button type="button" className="rounded bg-slate-200 px-2 py-1 font-bold"
              onClick={()=>setLocalSaveFailure(null)} aria-label="إغلاق التنبيه">إغلاق</button>
          </div>
        </div>
      )}
      {/* Main Content Area - Only this container scrolls internally when content is long */}
      <main className={`flex-1 min-h-0 w-full flex flex-col ${(activeTab === 'pos' || activeTab === 'new_print_order' || activeTab === 'manual_invoices' || activeTab === 'special_invoice' || activeTab === 'daily_entry' || activeTab === 'parties' || activeTab === 'purchases_suppliers' || activeTab === 'employees') ? "p-1 sm:p-2 overflow-hidden" : "p-2.5 sm:p-3.5 overflow-y-auto"} ${isPrintModalActive ? "print:hidden" : "print:p-0 print:m-0 print:overflow-visible print:h-auto print:max-h-none"}`}>
        <ErrorBoundary fallbackTitle="حدث تنبيه في عرض هذه الشاشة">
          {renderContent()}
        </ErrorBoundary>
      </main>

      {/* Classic Visual Basic / Windows Desktop Status Bar - ALWAYS pinned and visible at bottom across ALL screens */}
      <div className="shrink-0 print:hidden z-40 w-full">
        <DesktopStatusBar />
      </div>

      {/* Print Overlays & Modals */}
      <InvoicePrintModal />
      <JobTicketModal />
      <PayrollPrintModal />
      <AccountStatementModal />
      <PurchasePrintModal />
      <VoucherPrintModal />
      <TransactionLifecycleModal />
      <OfflineIndicator />
      <TelegramBotIntegration />
      {/* Legacy cloud backup worker is disabled in PostgreSQL-only edition. */}
    </div>
  );
};

export default function App() {
  // Local PostgreSQL is the primary target in this edition. Each device must be paired once.
  // Local Cloudflare preview: the private API gateway is at this HTTPS origin.
  // No shared device token or manual server URL is shown to the browser.
  if (!secureLoginEnabled() && import.meta.env.VITE_SYNC_GATEWAY_MODE !== 'true' &&
      !localStorage.getItem('lobnan_local_sync_server_url')) return <LocalServerSetup />;
  // A persisted browser user ID is not proof of authentication. Require
  // re-verification against PostgreSQL after each fresh application load.
  const [localUserId, setLocalUserId] = React.useState<string | null>(null);

  const isAuth = !!localUserId;

  if (!isAuth) {
    return <LoginView onLocalLogin={(id) => setLocalUserId(id)} />;
  }

  return (
    <AccountingProvider>
      <MainLayout />
    </AccountingProvider>
  );
}
