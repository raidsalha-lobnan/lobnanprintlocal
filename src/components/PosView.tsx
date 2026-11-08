import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'; // Trigger Sync
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { MobilePosView } from './pos/MobilePosView';
import { InventoryItem, PaymentMethod, Invoice, InvoiceItem, Party } from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import { CalculatorModal } from './pos/CalculatorModal';
import { QuickAddItemModal } from './pos/QuickAddItemModal';
import { PriceEditModal } from './pos/PriceEditModal';
import { CustomerLedgerModal } from './pos/CustomerLedgerModal';
import { RequisitionModal } from './pos/RequisitionModal';
import { FavoriteItemsDrawer } from './pos/FavoriteItemsDrawer';
import { InvoicesReviewModal } from './pos/InvoicesReviewModal';
import { HeldInvoicesModal, HeldInvoiceData } from './pos/HeldInvoicesModal';
import { DraftInvoicesQueueModal } from './pos/DraftInvoicesQueueModal';
import { SheetInvoiceRow } from '../services/liveSheetService';
import { onlineInvoicePostingService } from '../services/onlineInvoicePostingService';
import { ItemSearchModal } from './pos/ItemSearchModal';
import { ItemAutocompleteInput } from './pos/ItemAutocompleteInput';
import { PosCustomerSearchInput } from './pos/PosCustomerSearchInput';
import { AutocompleteCombobox, ComboboxOption } from './common/AutocompleteCombobox';
import { QuickAddPartyModal } from './pos/QuickAddPartyModal';
import { PosFavoritesSidebar } from './pos/PosFavoritesSidebar';
import { posSound } from '../utils/audio';
import { useHardwareBarcodeScanner } from '../utils/useBarcodeScanner';
import { matchItemByBarcode } from '../utils/barcodeGenerator';
import { findPartyByCodeOrNumber, isCashCustomerParty } from '../utils/partyUtils';
import { getAvailableUnitsOfMeasure, isSquareMeterUnit } from '../utils/unitsOfMeasure';
import { isDimensionalInvoiceItem } from '../utils/invoiceDimensions';
import { matchKeyboardShortcut } from '../utils/keyboardShortcuts';
import { calculatePartyTrueBalance, calculateEmployeeTrueBalance } from '../utils/statementGenerator';
import {
  Search,
  Barcode,
  Trash2,
  Plus,
  Edit2,
  Printer,
  Save,
  RotateCcw,
  SkipBack,
  ChevronRight,
  ChevronLeft,
  SkipForward,
  PauseCircle,
  CreditCard,
  Banknote,
  Percent,
  X,
  Check,
  User,
  Users,
  Building,
  Package,
  Calendar,
  Layers,
  FileText,
  DollarSign,
  HelpCircle,
  Info,
  Tag,
  Star,
  ShoppingBag,
  GitBranch,
  Calculator,
  Truck,
  ArrowRight,
  Camera,
  AlertCircle,
  Coins,
  Sliders,
  Layout,
  Eye,
  EyeOff,
  Palette,
  Columns,
  Maximize2,
  Lock,
  Scan,
  Zap,
  Sparkles,
  Clock,
  CheckCircle2,
  Ruler,
  Paperclip,
  RefreshCw,
  FileSpreadsheet
} from 'lucide-react';
import { PosCustomButton, loadPosCustomButtons, savePosCustomButtons, DEFAULT_POS_BUTTONS } from '../types/posCustomizer';
import {
  PosLayoutConfig,
  DEFAULT_POS_LAYOUT_CONFIG,
  loadPosLayoutConfig,
  savePosLayoutConfig,
  PosColumnKey,
  DEFAULT_POS_COLUMN_WIDTHS,
  MIN_POS_COLUMN_WIDTHS,
  loadPosColumnWidths,
  savePosColumnWidths,
  resetPosColumnWidthsToDefault
} from '../types/posLayoutCustomizer';
import { PosCustomButtonRenderer } from './pos/PosCustomButtonRenderer';
import { DayInvoicesNavigator } from './pos/DayInvoicesNavigator';
import { PosButtonCustomizerModal } from './pos/PosButtonCustomizerModal';
import { PosLayoutDesignerDrawer } from './pos/PosLayoutDesignerDrawer';
import { PosBottomPaymentConsole } from './pos/PosBottomPaymentConsole';
import { SubCustomerField } from './pos/SubCustomerField';
import { PosInlineBarcodeScanner } from './pos/PosInlineBarcodeScanner';
import { CustomerSpecialPricesModal } from './pos/CustomerSpecialPricesModal';
import { PosDailyInvoicesSidebar } from './pos/PosDailyInvoicesSidebar';
import { LineAttachmentsModal } from './pos/LineAttachmentsModal';
import { InvoiceAuditLogModal } from './pos/InvoiceAuditLogModal';
import { DeletedInvoicesModal } from './pos/DeletedInvoicesModal';
import { PosInvoiceWorkflowStatus, LineAttachment } from '../types';
import {
  WORKFLOW_STATUS_OPTIONS,
  getInvoiceWorkflowStatusMeta,
  computeInvoicePaymentStatus,
  getInvoicePaymentStatusMeta,
  isInvoiceAccountingEligible
} from '../utils/invoiceStatusUtils';

export interface PosTableLine {
  id: string;
  itemCode?: string;       // رقم الصنف / كود الصنف المخزني
  barcode: string;
  itemName: string;        // الصنف
  description: string;     // الوصف
  notes: string;           // الملاحظات
  hasDimensions: boolean;  // هل الصنف يحتاج أبعاداً (طول × عرض × عدد)
  length: number;          // الطول
  width: number;           // العرض
  count: number;           // العدد
  quantity: number;        // الكمية
  unit: string;            // الوحدة
  unitPrice: number;       // السعر
  discount: number;        // الخصم
  tax: number;             // الضريبة
  taxRate?: number;        // نسبة الضريبة
  total: number;           // الإجمالي
  attachments: LineAttachment[]; // المرفقات
  inventoryItemId?: string;
  imageThumbnail?: string; // الصورة المصغرة للبند
}

const generateUniqueLineId = () => `line-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

// Helper to compute strictly sequential and gap-filling invoice numbers starting from 1
const getNextSequentialInvoiceNumber = (allInvoices: Invoice[]): string => {
  const usedNumbers = new Set<number>();
  for (const inv of allInvoices || []) {
    if (inv && inv.invoiceNumber) {
      const match = inv.invoiceNumber.match(/\d+/g);
      if (match && match.length > 0) {
        for (const m of match) {
          const num = parseInt(m, 10);
          if (!isNaN(num) && num > 0 && num < 100000) {
            usedNumbers.add(num);
          }
        }
      }
    }
  }

  let candidateNum = 1;
  while (usedNumbers.has(candidateNum)) {
    candidateNum++;
  }
  return String(candidateNum);
};

const DraggableDigitalDisplay = ({ amount }: { amount: number }) => {
  const [position] = useState(() => {
    const saved = localStorage.getItem('pos_digital_display_state');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch(e) {}
    }
    return { x: 8, y: 8, w: 226, h: 113 };
  });

  const displayRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });

  useEffect(() => {
    if (displayRef.current) {
      displayRef.current.style.left = `${position.x}px`;
      displayRef.current.style.top = `${position.y}px`;
      displayRef.current.style.width = `${position.w}px`;
      displayRef.current.style.height = `${position.h}px`;
    }
  }, []);

  const saveState = () => {
    if (!displayRef.current) return;
    const newState = {
      x: displayRef.current.offsetLeft,
      y: displayRef.current.offsetTop,
      w: displayRef.current.offsetWidth,
      h: displayRef.current.offsetHeight,
    };
    localStorage.setItem('pos_digital_display_state', JSON.stringify(newState));
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const isResizeZone = e.clientY > rect.bottom - 20 && (e.clientX < rect.left + 20 || e.clientX > rect.right - 20);
    
    if (isResizeZone) {
       const handleResizeEnd = () => {
          saveState();
          window.removeEventListener('mouseup', handleResizeEnd);
       };
       window.addEventListener('mouseup', handleResizeEnd);
       return;
    }

    isDragging.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      initialX: displayRef.current?.offsetLeft || 0,
      initialY: displayRef.current?.offsetTop || 0
    };
    
    if (displayRef.current) {
      displayRef.current.style.cursor = 'grabbing';
      displayRef.current.style.opacity = '0.9';
    }

    const handleMouseMove = (ev: MouseEvent) => {
      if (!isDragging.current || !displayRef.current) return;
      ev.preventDefault();
      const dx = ev.clientX - dragStart.current.x;
      const dy = ev.clientY - dragStart.current.y;
      
      const newX = Math.max(0, dragStart.current.initialX + dx);
      const newY = Math.max(0, dragStart.current.initialY + dy);
      
      displayRef.current.style.left = `${newX}px`;
      displayRef.current.style.top = `${newY}px`;
    };

    const handleMouseUp = () => {
      isDragging.current = false;
      if (displayRef.current) {
        displayRef.current.style.cursor = 'grab';
        displayRef.current.style.opacity = '1';
      }
      saveState();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  return (
    <div 
      ref={displayRef}
      onMouseDown={handleMouseDown}
      className="absolute bg-black border-2 border-slate-700 rounded-lg flex items-center justify-center shadow-[0_0_15px_rgba(239,68,68,0.4)] z-[60] px-2 cursor-grab select-none"
      style={{ 
        resize: 'both',
        overflow: 'hidden',
        minWidth: '100px',
        minHeight: '50px'
      }}
    >
      <div className="w-full h-full flex items-center justify-center pointer-events-none">
        <svg viewBox="0 0 100 40" className="w-full h-full drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]">
          <text 
            x="50" 
            y="28" 
            textAnchor="middle" 
            className="fill-red-500 font-black font-mono tabular-nums tracking-tighter"
            style={{ fontSize: (Number(amount) || 0).toFixed(2).length > 7 ? '22px' : '28px' }}
          >
            {(Number(amount) || 0).toFixed(2)}
          </text>
        </svg>
      </div>
      
      {/* Icon to indicate dragging capability */}
      <div className="absolute top-1 left-1 opacity-40 pointer-events-none text-slate-500">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M9 19l3 3 3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>
      </div>
    </div>
  );
};

const compressToThumbnail = (file: File): Promise<string> => {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 120;
        const MAX_HEIGHT = 120;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.7));
        } else {
          resolve(e.target?.result as string);
        }
      };
      img.onerror = () => resolve('');
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve('');
    reader.readAsDataURL(file);
  });
};

const parseThumbnails = (val?: string): string[] => {
  if (!val) return [];
  const trimmed = val.trim();
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [val];
};

export const PosView: React.FC = () => {
  const {
    inventory,
    parties,
    addParty,
    updateParty,
    invoices,
    updateInvoice,
    settings,
    createPosSale,
    postPosSaleOnline,
    deleteInvoice,
    deletedInvoices,
    setSelectedInvoiceForPrint,
    setDirectPrintOptions,
    setSelectedInvoiceForLifecycle,
    setSelectedPartyForStatement,
    setActiveTab,
    employees,
    addEmployee,
    setSelectedEmployeeForStatement,
    treasuries,
    currencies,
    branches,
    activeBranchId,
    currentUser,
    warehouses,
    activeWarehouseId,
    updateSettings,
    hasPermission,
    getItemPriceForCustomer,
    getCurrentUserPricePolicy,
    editingPosInvoiceId,
    setEditingPosInvoiceId,
    vouchers = [],
    purchases = [],
    purchaseReturns = [],
    salesReturns = [],
    printOrders = [],
    journalEntries = [],
    debtClearings = [],
    employeeAdvances = [],
    employeeDeductions = [],
    employeeIncentives = [],
    payrollSheets = []
  } = useAccounting();

  // Single-Entry automation notification state
  const [lastSavedInvoiceNotice, setLastSavedInvoiceNotice] = useState<Invoice | null>(null);

  // Multi-Currency State (العملة الأساسية: الشيكل الفلسطيني ₪)
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string>(settings.baseCurrencyCode || 'ILS');
  const activeCurrency = useMemo(() => {
    return currencies.find(c => c.code === selectedCurrencyCode) || currencies.find(c => c.isBase) || {
      code: 'ILS',
      name: 'شيكل',
      symbol: '₪',
      rateAgainstBase: 1.0,
      isBase: true,
      isActive: true
    };
  }, [currencies, selectedCurrencyCode]);

  const [customExchangeRate, setCustomExchangeRate] = useState<number>(activeCurrency.rateAgainstBase || 1.0);

  // Synchronize exchange rate when currency changes
  useEffect(() => {
    setCustomExchangeRate(activeCurrency.rateAgainstBase || 1.0);
  }, [activeCurrency.rateAgainstBase, selectedCurrencyCode]);

const POS_FULL_DRAFT_KEY = 'pos_active_full_draft';

interface PosFullDraftData {
  tableLines?: PosTableLine[];
  posTargetType?: 'customer' | 'supplier' | 'employee';
  selectedCustomerId?: string;
  customerCode?: string;
  customerName?: string;
  pricingTier?: 'retail' | 'wholesale' | 'special';
  transactionType?: 'cash' | 'credit';
  customCustomerText?: string;
  subCustomerId?: string;
  subCustomerName?: string;
  subCustomerPhone?: string;
  branch?: string;
  warehouse?: string;
  invoiceDate?: string;
  representative?: string;
  taxRate?: number;
  taxEnabled?: boolean;
  additionalCharges?: number;
  overallDiscount?: number;
  discountType?: 'amount' | 'percent';
  invoiceNotes?: string;
  paymentNotes?: string;
  shippingDetails?: { carrier: string; tracking: string; address: string };
  cashAmountInput?: string;
  bankAmountInput?: string;
  activeRowId?: string | null;
  focusedInputId?: string | null;
  timestamp?: number;
}

const getInitialPosDraft = (): PosFullDraftData => {
  // عند فتح شاشة الكاشير دائماً تكون كأنها فاتورة جديدة نظيفة دون استرجاع مسودات قديمة
  return {};
};

  // Active top tab in POS window
  const [activeWindowTab, setActiveWindowTab] = useState<'pos' | 'items' | 'parties' | 'ledger' | 'home'>('pos');

  // Real-time online posting status & screen freeze guard: "وأثناء عدم الاتصال تضل الشاشات مجمدة محتفظة بمدخلاتها ولكن لا تحفظ إلا وقت الاتصال"
  const [isPostingCloudInvoice, setIsPostingCloudInvoice] = useState<boolean>(false);
  const [isNetworkOffline, setIsNetworkOffline] = useState<boolean>(() => typeof navigator !== 'undefined' ? !navigator.onLine : false);
  const [isOfflineFrozen, setIsOfflineFrozen] = useState<boolean>(false);
  const [offlinePendingPrintMode, setOfflinePendingPrintMode] = useState<'none' | 'prompt' | 'thermal-direct' | 'a4-direct' | 'a4-custom-direct'>('none');
  const handleSaveInvoiceRef = useRef<any>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsNetworkOffline(false);
      if (isOfflineFrozen && handleSaveInvoiceRef.current) {
        console.log('Online restored: auto-resuming frozen invoice posting...');
        handleSaveInvoiceRef.current(offlinePendingPrintMode || 'none');
      }
    };
    const handleOffline = () => setIsNetworkOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [isOfflineFrozen, offlinePendingPrintMode]);



  // Load persistent draft on initialization (لضمان بقاء كافة الإدخالات والبيانات عند التحديث F5)
  const savedPosDraft = useMemo(() => getInitialPosDraft(), []);

  // Customer & Invoice Header State (Strictly main customers, sub-customers are completely separate)
  const customers = useMemo(() => parties.filter(p => (p.type === 'customer' || p.type === 'both') && !p.isSubCustomer), [parties]);
  const suppliers = useMemo(() => parties.filter(p => p.type === 'supplier' || p.type === 'both'), [parties]);
  const defaultCustomer = customers.find(c => c.name.includes('وقف فلسطين') || c.name.includes('أبو يوسف')) || customers[0];

  // الطرف المستهدف في الكاشير: عميل أو مورد أو موظف
  const [posTargetType, setPosTargetType] = useState<'customer' | 'supplier' | 'employee'>(() => {
    return savedPosDraft.posTargetType || 'customer';
  });

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() => {
    return savedPosDraft.selectedCustomerId || '';
  });
  const [customerCode, setCustomerCode] = useState<string>(() => {
    return savedPosDraft.customerCode || '';
  });
  const [customerName, setCustomerName] = useState<string>(() => {
    return savedPosDraft.customerName !== undefined ? savedPosDraft.customerName : 'عميل كاشير نقدي';
  });
  const [pricingTier, setPricingTier] = useState<'retail' | 'wholesale' | 'special'>(() => {
    return savedPosDraft.pricingTier || 'retail';
  });

  // تعيين العميل الافتراضي (CUST-0001) كزبون كاشير رئيسي فقط إذا لم تكن هناك مسودة سابقة محفوظة
  useEffect(() => {
    if (savedPosDraft.customerName && savedPosDraft.customerName !== 'عميل كاشير نقدي') return;
    if (savedPosDraft.selectedCustomerId) return;
    if (!selectedCustomerId && !customerCode && !editingPosInvoiceId && posTargetType === 'customer' && customerName === 'عميل كاشير نقدي') {
      const defaultCashCust = customers.find(c => c.code === 'CUST-0001' || c.code === '1');
      if (defaultCashCust) {
        setSelectedCustomerId(defaultCashCust.id);
        setCustomerName(defaultCashCust.name);
        setCustomerCode(defaultCashCust.code);
      }
    }
  }, [customers, posTargetType, savedPosDraft]);


  // خيارات البحث والمطابقة الذكية حسب نوع الطرف المختار (عميل - مورد - موظف)
  const targetComboboxOptions: ComboboxOption[] = useMemo(() => {
    if (posTargetType === 'customer') {
      return customers.map(c => ({
        id: c.id,
        name: c.name,
        code: c.code,
        subText: c.phone ? `هاتف: ${c.phone}` : (c.address || undefined),
        badge: (Number(c.balance) || 0) !== 0 ? `${(Number(c.balance) || 0).toFixed(2)} ₪` : undefined,
        extraSearchCorpus: `${c.phone || ''} ${c.address || ''}`,
        raw: c
      }));
    } else if (posTargetType === 'supplier') {
      return suppliers.map(s => ({
        id: s.id,
        name: s.name,
        code: s.code,
        subText: s.phone ? `هاتف: ${s.phone}` : 'مورد معتمد',
        badge: (Number(s.balance) || 0) !== 0 ? `${Math.abs(Number(s.balance) || 0).toFixed(2)} ₪` : undefined,
        extraSearchCorpus: `${s.phone || ''}`,
        raw: s
      }));
    } else {
      return employees.map(emp => {
        const empBal = calculateEmployeeTrueBalance(
          emp,
          vouchers,
          employeeAdvances,
          employeeDeductions,
          employeeIncentives,
          invoices,
          purchases,
          purchaseReturns,
          salesReturns,
          payrollSheets,
          journalEntries,
          debtClearings
        );
        const hasBal = Math.abs(empBal) >= 0.01;
        const badge = hasBal 
          ? `${Math.abs(empBal).toFixed(2)} ₪ ${empBal > 0 ? '(له)' : '(عليه)'}` 
          : (emp.phone || undefined);
        return {
          id: emp.id,
          name: emp.name,
          code: emp.code || emp.id,
          subText: `${emp.jobTitle || 'موظف'} - ${emp.department || 'عام'}`,
          badge,
          extraSearchCorpus: `${emp.phone || ''} ${emp.jobTitle || ''}`,
          raw: emp
        };
      });
    }
  }, [
    posTargetType,
    customers,
    suppliers,
    employees,
    vouchers,
    employeeAdvances,
    employeeDeductions,
    employeeIncentives,
    invoices,
    purchases,
    purchaseReturns,
    salesReturns,
    payrollSheets,
    journalEntries,
    debtClearings
  ]);

  // Pricing policies based on current user permissions & role
  const userPricePolicy = useMemo(() => {
    return getCurrentUserPricePolicy(currentUser);
  }, [getCurrentUserPricePolicy, currentUser]);

  const canUserEditPrices = userPricePolicy.canEditPrice;

  // Enforce allowed price tier if user is restricted
  useEffect(() => {
    if (userPricePolicy.allowedTier === 'price1' && pricingTier !== 'retail') {
      setPricingTier('retail');
    } else if (userPricePolicy.allowedTier === 'price2' && pricingTier !== 'wholesale') {
      setPricingTier('wholesale');
    } else if (userPricePolicy.allowedTier === 'price3' && pricingTier !== 'special') {
      setPricingTier('special');
    }
  }, [userPricePolicy.allowedTier, pricingTier]);
  const [transactionType, setTransactionType] = useState<'cash' | 'credit'>(() => {
    return savedPosDraft.transactionType || 'cash';
  });
  const [customCustomerText, setCustomCustomerText] = useState<string>(() => {
    return savedPosDraft.customCustomerText || '';
  });
  const [subCustomerId, setSubCustomerId] = useState<string>(() => {
    return savedPosDraft.subCustomerId || '';
  });
  const [subCustomerName, setSubCustomerName] = useState<string>(() => {
    return savedPosDraft.subCustomerName || '';
  });
  const [subCustomerPhone, setSubCustomerPhone] = useState<string>(() => {
    return savedPosDraft.subCustomerPhone || '';
  });

  // Checkboxes from screenshot
  const [aggregateDuplicateItems, setAggregateDuplicateItems] = useState<boolean>(true);
  const [useLastCustomerPrice, setUseLastCustomerPrice] = useState<boolean>(false);

  // اعتماد كافة وحدات الأصناف المدخلة في البرنامج لجدول الكاشير
  const programUnits = useMemo(() => {
    return getAvailableUnitsOfMeasure(inventory, settings.unitsOfMeasure);
  }, [inventory, settings.unitsOfMeasure]);

  // Left header metadata
  const [branch, setBranch] = useState<string>(() => {
    if (savedPosDraft.branch) return savedPosDraft.branch;
    if (branches && branches.length > 0) {
      const b = branches.find(br => br.id === activeBranchId) || branches[0];
      return b.name;
    }
    return 'الفرع الرئيسي';
  });
  const [warehouse, setWarehouse] = useState<string>(() => {
    if (savedPosDraft.warehouse) return savedPosDraft.warehouse;
    if (warehouses && warehouses.length > 0) {
      const w = warehouses.find(wh => wh.id === activeWarehouseId) || warehouses[0];
      return w.name;
    }
    return 'المخزن الرئيسي';
  });
  const [invoiceSeqNumber, setInvoiceSeqNumber] = useState<string>('');
  const [invoiceDate, setInvoiceDate] = useState<string>(() => {
    return savedPosDraft.invoiceDate || new Date().toISOString().split('T')[0];
  });

  // Header Sub-tools State & Modals
  const [representative, setRepresentative] = useState<string>(() => {
    return savedPosDraft.representative || 'مندوب المبيعات الرئيسي';
  });
  const [taxRate, setTaxRate] = useState<number>(() => {
    return typeof savedPosDraft.taxRate === 'number' ? savedPosDraft.taxRate : (settings.vatRate || 0);
  });
  const [taxEnabled, setTaxEnabled] = useState<boolean>(() => {
    return typeof savedPosDraft.taxEnabled === 'boolean' ? savedPosDraft.taxEnabled : true;
  });
  const [additionalCharges, setAdditionalCharges] = useState<number>(() => {
    return typeof savedPosDraft.additionalCharges === 'number' ? savedPosDraft.additionalCharges : 0;
  });
  const [overallDiscount, setOverallDiscount] = useState<number>(() => {
    return typeof savedPosDraft.overallDiscount === 'number' ? savedPosDraft.overallDiscount : 0;
  });
  const [discountType, setDiscountType] = useState<'amount' | 'percent'>(() => {
    return savedPosDraft.discountType || 'amount';
  });
  const [invoiceNotes, setInvoiceNotes] = useState<string>(() => {
    return savedPosDraft.invoiceNotes || '';
  });
  const [paymentNotes, setPaymentNotes] = useState<string>(() => {
    return savedPosDraft.paymentNotes || '';
  });
  const [isAuditLogModalOpen, setIsAuditLogModalOpen] = useState(false);
  const [isDeletedInvoicesOpen, setIsDeletedInvoicesOpen] = useState(false);
  const [shippingDetails, setShippingDetails] = useState<{ carrier: string; tracking: string; address: string }>(() => {
    return savedPosDraft.shippingDetails || {
      carrier: 'توصيل محلي',
      tracking: '',
      address: ''
    };
  });

  // Modals for Header Sub-tools
  const [activeHeaderSubModal, setActiveHeaderSubModal] = useState<
    'representative' | 'tax' | 'additional' | 'discount' | 'notes' | 'shipping' | 'details' | 'currency' | null
  >(null);

  // Table Lines State - تبدأ دائماً كفاتورة جديدة فارغة عند فتح شاشة الكاشير
  const [tableLines, setTableLines] = useState<PosTableLine[]>(() => {
    return [
      {
        id: generateUniqueLineId(),
        itemCode: '',
        barcode: '',
        itemName: '',
        description: '',
        notes: '',
        hasDimensions: false,
        length: 0,
        width: 0,
        count: 1,
        quantity: 1,
        unit: 'حبة',
        unitPrice: 0,
        discount: 0,
        tax: 0,
        total: 0,
        attachments: []
      }
    ];
  });

  // Confirmation dialog & auto-clear/hold when leaving POS screen or navigating away
  useEffect(() => {
    return () => {
      // Check if there are active lines or selected items in the cart when leaving
      const hasActiveLines = tableLines.some(l => (l.itemName && l.itemName.trim() !== '') || l.unitPrice > 0 || l.total > 0);
      if (hasActiveLines) {
        // Automatically hold or reset uncommitted cart when unmounting so new sessions always start clean!
        try {
          localStorage.removeItem(POS_FULL_DRAFT_KEY);
          localStorage.removeItem('pos_active_draft_lines');
        } catch {}
      }
    };
  }, [tableLines]);


  const [activeRowId, setActiveRowId] = useState<string | null>(() => {
    return savedPosDraft.activeRowId || null;
  });
  const [activeLineForAttachments, setActiveLineForAttachments] = useState<PosTableLine | null>(null);

  // 1. Cash Payment State (المبلغ، العملة، سعر الصرف، الصندوق)
  const [cashAmountInput, setCashAmountInput] = useState<string>(() => {
    return savedPosDraft.cashAmountInput || '0';
  });

  // 2. Bank Payment State (المبلغ، عملة الدفع، سعر الصرف، الصندوق)
  const [bankAmountInput, setBankAmountInput] = useState<string>(() => {
    return savedPosDraft.bankAmountInput || '0';
  });

  // حفظ مسودة الكاشير الكاملة تلقائياً عند أي تعديل (لضمان عدم ضياع أي إدخال أو حقل عند التحديث F5)
  useEffect(() => {
    try {
      const draft: PosFullDraftData = {
        tableLines,
        posTargetType,
        selectedCustomerId,
        customerCode,
        customerName,
        pricingTier,
        transactionType,
        customCustomerText,
        subCustomerId,
        subCustomerName,
        subCustomerPhone,
        branch,
        warehouse,
        invoiceDate,
        representative,
        taxRate,
        taxEnabled,
        additionalCharges,
        overallDiscount,
        discountType,
        invoiceNotes,
        paymentNotes,
        shippingDetails,
        cashAmountInput,
        bankAmountInput,
        activeRowId,
        timestamp: Date.now()
      };
      localStorage.setItem(POS_FULL_DRAFT_KEY, JSON.stringify(draft));
      localStorage.setItem('pos_active_draft_lines', JSON.stringify(tableLines));
    } catch (e) {
      console.warn('Failed to auto-save POS draft', e);
    }
  }, [
    tableLines,
    posTargetType,
    selectedCustomerId,
    customerCode,
    customerName,
    pricingTier,
    transactionType,
    customCustomerText,
    subCustomerId,
    subCustomerName,
    subCustomerPhone,
    branch,
    warehouse,
    invoiceDate,
    representative,
    taxRate,
    taxEnabled,
    additionalCharges,
    overallDiscount,
    discountType,
    invoiceNotes,
    paymentNotes,
    shippingDetails,
    cashAmountInput,
    bankAmountInput,
    activeRowId
  ]);

  // حفظ عند إغلاق أو رفرش الصفحة فوراً
  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        const activeEl = document.activeElement as HTMLElement | null;
        const focusedId = activeEl?.id || '';
        const draft: PosFullDraftData = {
          tableLines,
          posTargetType,
          selectedCustomerId,
          customerCode,
          customerName,
          pricingTier,
          transactionType,
          customCustomerText,
          subCustomerId,
          subCustomerName,
          subCustomerPhone,
          branch,
          warehouse,
          invoiceDate,
          representative,
          taxRate,
          taxEnabled,
          additionalCharges,
          overallDiscount,
          discountType,
          invoiceNotes,
          shippingDetails,
          cashAmountInput,
          bankAmountInput,
          activeRowId,
          focusedInputId: focusedId,
          timestamp: Date.now()
        };
        localStorage.setItem(POS_FULL_DRAFT_KEY, JSON.stringify(draft));
        localStorage.setItem('pos_active_draft_lines', JSON.stringify(tableLines));
        if (focusedId) {
          localStorage.setItem('alnoor_last_focused_element', JSON.stringify({
            id: focusedId,
            timestamp: Date.now()
          }));
        }
      } catch {}
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [
    tableLines,
    posTargetType,
    selectedCustomerId,
    customerCode,
    customerName,
    pricingTier,
    transactionType,
    customCustomerText,
    subCustomerId,
    subCustomerName,
    subCustomerPhone,
    branch,
    warehouse,
    invoiceDate,
    representative,
    taxRate,
    taxEnabled,
    additionalCharges,
    overallDiscount,
    discountType,
    invoiceNotes,
    shippingDetails,
    cashAmountInput,
    bankAmountInput,
    activeRowId
  ]);

  // Add delivery service item automatically to table (يحدد له ملاحظات وسعر فقط)
  const handleAddDeliveryServiceLine = useCallback(() => {
    posSound.beep();
    const deliveryLine: PosTableLine = {
      id: generateUniqueLineId(),
      itemCode: 'DELIVERY',
      barcode: 'DELIVERY',
      itemName: 'خدمة توصيل',
      description: '',
      notes: 'خدمة توصيل مباشر',
      hasDimensions: false,
      length: 0,
      width: 0,
      count: 1,
      quantity: 1,
      unit: 'خدمة',
      unitPrice: 15,
      discount: 0,
      tax: 0,
      total: 15,
      attachments: [],
      inventoryItemId: 'srv-delivery'
    };

    setTableLines(prev => {
      if (prev.length === 1 && !(prev[0].itemName || '').trim() && prev[0].unitPrice === 0) {
        return [{ ...deliveryLine, id: prev[0].id }];
      }
      return [...prev, deliveryLine];
    });
    setActiveRowId(deliveryLine.id);
  }, []);

  // Bottom Payment State (الدفع النقدي، الدفع البنكي، العملات، والصناديق)
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [selectedTreasuryCode, setSelectedTreasuryCode] = useState<string>('1101');

  // 1. Cash Payment State (العملة، سعر الصرف، الصندوق)
  const currentEditingInvoiceIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    currentEditingInvoiceIdRef.current = editingPosInvoiceId;
  }, [editingPosInvoiceId]);
  const [cashCurrencyCode, setCashCurrencyCode] = useState<string>('ILS');
  const [cashExchangeRate, setCashExchangeRate] = useState<number>(1.0);
  const [cashTreasuryCode, setCashTreasuryCode] = useState<string>(() => {
    const def = treasuries?.find(t => t.type === 'cash_box' || t.isDefault);
    return def?.accountCode || '1101';
  });

  // 2. Bank Payment State (عملة الدفع، سعر الصرف، الصندوق)
  const [bankCurrencyCode, setBankCurrencyCode] = useState<string>('ILS');
  const [bankExchangeRate, setBankExchangeRate] = useState<number>(1.0);
  const [bankTreasuryCode, setBankTreasuryCode] = useState<string>(() => {
    const def = treasuries?.find(t => t.type === 'bank_account' || t.type === 'bank_app' || t.type === 'pos_terminal' || t.accountCode === '1102');
    return def?.accountCode || '1102';
  });

  // Synchronize selected treasuries when treasuries list is loaded or updated
  useEffect(() => {
    if (treasuries && treasuries.length > 0) {
      if (!cashTreasuryCode || !treasuries.some(t => t.accountCode === cashTreasuryCode)) {
        const defaultCash = treasuries.find(t => t.type === 'cash_box' || t.isDefault) || treasuries[0];
        if (defaultCash) setCashTreasuryCode(defaultCash.accountCode);
      }
      if (!bankTreasuryCode || !treasuries.some(t => t.accountCode === bankTreasuryCode)) {
        const defaultBank = treasuries.find(t => t.type === 'bank_account' || t.type === 'bank_app' || t.type === 'pos_terminal' || t.accountCode === '1102') || treasuries.find(t => t.accountCode !== cashTreasuryCode) || treasuries[0];
        if (defaultBank) setBankTreasuryCode(defaultBank.accountCode);
      }
    }
  }, [treasuries]);

  // Handle invoice exchange rate updates
  const handleExchangeRateChange = (newRate: number) => {
    const validRate = newRate > 0 ? newRate : 1.0;
    setCustomExchangeRate(validRate);
  };

  // Modals from Left Action Panel
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddInitialName, setQuickAddInitialName] = useState<string>('');
  const [isPriceEditOpen, setIsPriceEditOpen] = useState(false);
  const [isCustomerLedgerOpen, setIsCustomerLedgerOpen] = useState(false);
  const [isRequisitionOpen, setIsRequisitionOpen] = useState(false);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isInvoicesReviewOpen, setIsInvoicesReviewOpen] = useState(false);
  const [isHeldInvoicesOpen, setIsHeldInvoicesOpen] = useState(false);
  const [isDraftQueueOpen, setIsDraftQueueOpen] = useState(false);
  const [isItemSearchOpen, setIsItemSearchOpen] = useState(false);
  const [isCameraScannerOpen, setIsCameraScannerOpen] = useState(false);

  // Barcode Hand Mode (تفعيل يد الباركود والكاميرا الذكية)
  const [isBarcodeHandMode, setIsBarcodeHandMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('pos_barcode_hand_mode') === 'true';
    } catch {
      return false;
    }
  });

  const [quickBarcodeVal, setQuickBarcodeVal] = useState<string>('');
  const [isInlineCameraOpen, setIsInlineCameraOpen] = useState<boolean>(false);
  const [barcodeNotFoundAlert, setBarcodeNotFoundAlert] = useState<string | null>(null);

  useEffect(() => {
    if (barcodeNotFoundAlert) {
      const timer = setTimeout(() => {
        setBarcodeNotFoundAlert(null);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [barcodeNotFoundAlert]);

  // Invoice Workflow Status (حالة فاتورة الكاشير: جديدة، قيد التصميم، قيد التنفيذ، جاهزة للتسليم، مسلمة)
  const [invoiceWorkflowStatus, setInvoiceWorkflowStatus] = useState<PosInvoiceWorkflowStatus>('new');

  // Customer Special Prices Modal
  const [isSpecialPricesModalOpen, setIsSpecialPricesModalOpen] = useState(false);

  // Quick Add Party Modal (شاشة إضافة عميل / مورد / موظف جديد)
  const [isAddPartyModalOpen, setIsAddPartyModalOpen] = useState(false);
  const [partyToEditInPos, setPartyToEditInPos] = useState<Party | null>(null);

  // Daily Invoices & Statuses Sidebar
  const [isDailyInvoicesOpen, setIsDailyInvoicesOpen] = useState(false);
  const [isDailyInvoicesExpanded, setIsDailyInvoicesExpanded] = useState(false);

  // Refs for auto-focusing inputs and 5-second inactivity timer
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const quantityInputRef = useRef<HTMLInputElement | null>(null);
  const customerInputRef = useRef<HTMLInputElement | null>(null);
  const inactivityTimerRef = useRef<NodeJS.Timeout | null>(null);

  // POS Buttons & UI Customization State (خاصة بكل مستخدم، مع التوريث من إعدادات مدير النظام كمرجعية أولى)
  const adminDefaultButtons = settings?.defaultPosButtons;
  const adminDefaultLayout = settings?.defaultPosLayout;
  const adminDefaultWidths = settings?.defaultPosColumnWidths;

  const [posButtons, setPosButtons] = useState<PosCustomButton[]>(() =>
    loadPosCustomButtons(currentUser?.id, adminDefaultButtons)
  );
  const [isLiveCustomizing, setIsLiveCustomizing] = useState<boolean>(false);
  const [isButtonCustomizerOpen, setIsButtonCustomizerOpen] = useState<boolean>(false);

  // POS Screen Layout & Designer State (خاصة بكل مستخدم مع التوريث من شاشة مدير النظام)
  const [posLayoutConfig, setPosLayoutConfig] = useState<PosLayoutConfig>(() => {
    return loadPosLayoutConfig(currentUser?.id, adminDefaultLayout);
  });

  // Excel-like Column Widths State (التحكم بعرض الأعمدة يدوياً بالماوس كشيت إكسل)
  const [columnWidths, setColumnWidths] = useState<Record<PosColumnKey, number>>(() =>
    loadPosColumnWidths(currentUser?.id, adminDefaultWidths)
  );
  const [activeResizingCol, setActiveResizingCol] = useState<PosColumnKey | null>(null);
  const [resizingGuideX, setResizingGuideX] = useState<number | null>(null);

  // Re-sync layout, buttons, and column widths if user switches or admin updates global baseline
  useEffect(() => {
    if (currentUser?.id) {
      const userButtons = loadPosCustomButtons(currentUser.id, settings?.defaultPosButtons);
      setPosButtons(userButtons);
      const userConfig = loadPosLayoutConfig(currentUser.id, settings?.defaultPosLayout);
      setPosLayoutConfig(userConfig);
      const userWidths = loadPosColumnWidths(currentUser.id, settings?.defaultPosColumnWidths);
      setColumnWidths(userWidths);
      if (userConfig.isDateLocked && userConfig.lockedDate) {
        setInvoiceDate(userConfig.lockedDate);
      }
    }
  }, [currentUser?.id, settings?.defaultPosLayout, settings?.defaultPosButtons, settings?.defaultPosColumnWidths]);

  // Excel-like Column Resizing Drag Handler (RTL aware)
  const handleResizeMouseDown = (colKey: PosColumnKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || DEFAULT_POS_COLUMN_WIDTHS[colKey];
    const minWidth = MIN_POS_COLUMN_WIDTHS[colKey] || 32;

    setActiveResizingCol(colKey);
    setResizingGuideX(e.clientX);

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let currentWidth = startWidth;

    const onMouseMove = (moveEvent: MouseEvent) => {
      // In RTL table, moving mouse to the left (decreasing clientX) expands column width.
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.max(minWidth, Math.round(startWidth + deltaX));
      currentWidth = newWidth;
      setResizingGuideX(moveEvent.clientX);

      setColumnWidths(prev => ({
        ...prev,
        [colKey]: newWidth
      }));
    };

    const onMouseUp = () => {
      setActiveResizingCol(null);
      setResizingGuideX(null);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);

      setColumnWidths(prev => {
        const updated = { ...prev, [colKey]: currentWidth };
        savePosColumnWidths(updated, currentUser?.id);
        return updated;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleResetSingleColumn = (colKey: PosColumnKey, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setColumnWidths(prev => {
      const updated = { ...prev, [colKey]: DEFAULT_POS_COLUMN_WIDTHS[colKey] };
      savePosColumnWidths(updated, currentUser?.id);
      return updated;
    });
  };

  const handleResetAllColumns = () => {
    const defaultWidths = resetPosColumnWidthsToDefault(currentUser?.id);
    setColumnWidths(defaultWidths);
  };

  // Calculate total visible table columns width
  const totalVisibleColsWidth = (
    (posLayoutConfig.tableColumns.showIndex ? (columnWidths.index || DEFAULT_POS_COLUMN_WIDTHS.index) : 0) +
    (posLayoutConfig.tableColumns.showItemCode ? (columnWidths.itemCode || DEFAULT_POS_COLUMN_WIDTHS.itemCode) : 0) +
    (columnWidths.itemName || DEFAULT_POS_COLUMN_WIDTHS.itemName) +
    (posLayoutConfig.tableColumns.showNotes ? (columnWidths.notes || DEFAULT_POS_COLUMN_WIDTHS.notes) : 0) +
    (posLayoutConfig.tableColumns.showDimensions ? ((columnWidths.length || DEFAULT_POS_COLUMN_WIDTHS.length) + (columnWidths.width || DEFAULT_POS_COLUMN_WIDTHS.width)) : 0) +
    (posLayoutConfig.tableColumns.showCount ? (columnWidths.count || DEFAULT_POS_COLUMN_WIDTHS.count) : 0) +
    (posLayoutConfig.tableColumns.showQuantity ? (columnWidths.quantity || DEFAULT_POS_COLUMN_WIDTHS.quantity) : 0) +
    (posLayoutConfig.tableColumns.showUnit ? (columnWidths.unit || DEFAULT_POS_COLUMN_WIDTHS.unit) : 0) +
    (posLayoutConfig.tableColumns.showUnitPrice ? (columnWidths.unitPrice || DEFAULT_POS_COLUMN_WIDTHS.unitPrice) : 0) +
    (posLayoutConfig.tableColumns.showDiscount ? (columnWidths.discount || DEFAULT_POS_COLUMN_WIDTHS.discount) : 0) +
    (posLayoutConfig.tableColumns.showTax ? (columnWidths.tax || DEFAULT_POS_COLUMN_WIDTHS.tax) : 0) +
    (columnWidths.total || DEFAULT_POS_COLUMN_WIDTHS.total) +
    (posLayoutConfig.tableColumns.showAttachments ? (columnWidths.attachments || DEFAULT_POS_COLUMN_WIDTHS.attachments) : 0) +
    (posLayoutConfig.tableColumns.showImageThumbnail ? (columnWidths.imageThumbnail || DEFAULT_POS_COLUMN_WIDTHS.imageThumbnail) : 0) +
    (posLayoutConfig.tableColumns.showDeleteButton ? (columnWidths.delete || DEFAULT_POS_COLUMN_WIDTHS.delete) : 0)
  );

  const renderResizeHandle = (colKey: PosColumnKey) => (
    <div
      onMouseDown={(e) => handleResizeMouseDown(colKey, e)}
      onDoubleClick={(e) => handleResetSingleColumn(colKey, e)}
      className={`pos-table-col-resizer transition-colors group/resizer ${
        activeResizingCol === colKey ? 'bg-blue-600/40' : 'hover:bg-blue-500/25'
      }`}
      title="اسحب بالماوس لتكبير أو تصغير العمود كالإكسل (نقر مزدوج للاستعادة)"
    >
      <div
        className={`w-[2px] h-full transition-all ${
          activeResizingCol === colKey
            ? 'bg-blue-700'
            : 'bg-transparent group-hover/resizer:bg-blue-600'
        }`}
      />
    </div>
  );

  const [isLayoutDesignerOpen, setIsLayoutDesignerOpen] = useState<boolean>(false);

  const isCurrentUserAdmin = Boolean(
    currentUser?.roleId === 'role-admin' ||
    currentUser?.id === 'usr-1' ||
    currentUser?.email === 'admin@example.invalid' ||
    currentUser?.email === 'press@example.invalid'
  );

  const handleSavePosLayoutConfig = (newConfig: PosLayoutConfig) => {
    const safeConfig = newConfig && typeof newConfig === 'object' ? newConfig : DEFAULT_POS_LAYOUT_CONFIG;
    setPosLayoutConfig(safeConfig);
    savePosLayoutConfig(safeConfig, currentUser?.id);

    // If current user is system administrator, update system default baseline
    if (isCurrentUserAdmin) {
      updateSettings({
        ...settings,
        defaultPosLayout: safeConfig,
        userScreenConfigs: {
          ...(settings.userScreenConfigs || {}),
          [currentUser?.id || 'usr-1']: {
            ...(settings.userScreenConfigs?.[currentUser?.id || 'usr-1'] || {}),
            posLayout: safeConfig
          }
        }
      });
    } else if (currentUser?.id) {
      updateSettings({
        ...settings,
        userScreenConfigs: {
          ...(settings.userScreenConfigs || {}),
          [currentUser.id]: {
            ...(settings.userScreenConfigs?.[currentUser.id] || {}),
            posLayout: safeConfig
          }
        }
      });
    }
  };

  const handleApplyAsSystemDefault = (layoutToApply: PosLayoutConfig) => {
    const safeConfig = layoutToApply && typeof layoutToApply === 'object' ? layoutToApply : DEFAULT_POS_LAYOUT_CONFIG;
    setPosLayoutConfig(safeConfig);
    savePosLayoutConfig(safeConfig, currentUser?.id);
    
    updateSettings({
      ...settings,
      defaultPosLayout: safeConfig,
      defaultPosButtons: posButtons,
      defaultPosColumnWidths: columnWidths,
      userScreenConfigs: {
        ...(settings.userScreenConfigs || {}),
        [currentUser?.id || 'usr-1']: {
          ...(settings.userScreenConfigs?.[currentUser?.id || 'usr-1'] || {}),
          posLayout: safeConfig,
          posButtons: posButtons,
          posColumnWidths: columnWidths
        }
      }
    });
  };

  const handleResetToAdminDefaults = () => {
    const adminLayout = settings?.defaultPosLayout || DEFAULT_POS_LAYOUT_CONFIG;
    const adminButtons = settings?.defaultPosButtons || DEFAULT_POS_BUTTONS;
    const adminWidths = settings?.defaultPosColumnWidths || DEFAULT_POS_COLUMN_WIDTHS;

    setPosLayoutConfig(adminLayout);
    setPosButtons(adminButtons);
    setColumnWidths(adminWidths);

    savePosLayoutConfig(adminLayout, currentUser?.id);
    savePosCustomButtons(adminButtons, currentUser?.id);
    savePosColumnWidths(adminWidths, currentUser?.id);

    if (currentUser?.id) {
      updateSettings({
        ...settings,
        userScreenConfigs: {
          ...(settings.userScreenConfigs || {}),
          [currentUser.id]: {
            ...(settings.userScreenConfigs?.[currentUser.id] || {}),
            posLayout: adminLayout,
            posButtons: adminButtons,
            posColumnWidths: adminWidths
          }
        }
      });
    }
  };

  const handleToggleLayoutSection = (key: keyof PosLayoutConfig) => {
    setPosLayoutConfig(prev => {
      const base = prev || DEFAULT_POS_LAYOUT_CONFIG;
      const updated = {
        ...base,
        [key]: !base[key]
      };
      savePosLayoutConfig(updated, currentUser?.id);
      return updated;
    });
  };

  const handleSavePosButtons = (newButtons: PosCustomButton[]) => {
    setPosButtons(newButtons);
    savePosCustomButtons(newButtons, currentUser?.id);
    if (isCurrentUserAdmin) {
      updateSettings({
        ...settings,
        defaultPosButtons: newButtons,
        userScreenConfigs: {
          ...(settings.userScreenConfigs || {}),
          [currentUser?.id || 'usr-1']: {
            ...(settings.userScreenConfigs?.[currentUser?.id || 'usr-1'] || {}),
            posButtons: newButtons
          }
        }
      });
    } else if (currentUser?.id) {
      updateSettings({
        ...settings,
        userScreenConfigs: {
          ...(settings.userScreenConfigs || {}),
          [currentUser.id]: {
            ...(settings.userScreenConfigs?.[currentUser.id] || {}),
            posButtons: newButtons
          }
        }
      });
    }
  };

  // Live in-place button reordering (swap with adjacent button)
  const handleMoveButtonInLive = (buttonId: string, direction: 'left' | 'right') => {
    setPosButtons(prev => {
      const targetBtn = prev.find(b => b.id === buttonId);
      if (!targetBtn) return prev;

      const sectionButtons = prev
        .filter(b => b.location === targetBtn.location)
        .sort((a, b) => a.order - b.order);

      const currentIndex = sectionButtons.findIndex(b => b.id === buttonId);
      if (currentIndex === -1) return prev;

      // In RTL display: 'right' means towards beginning (previous in list), 'left' means towards end (next in list)
      const targetIndex = direction === 'right' ? currentIndex - 1 : currentIndex + 1;
      if (targetIndex < 0 || targetIndex >= sectionButtons.length) return prev;

      const reordered = [...sectionButtons];
      const temp = reordered[currentIndex];
      reordered[currentIndex] = reordered[targetIndex];
      reordered[targetIndex] = temp;

      const updatedSection = reordered.map((btn, idx) => ({ ...btn, order: idx + 1 }));
      const others = prev.filter(b => b.location !== targetBtn.location);
      const combined = [...others, ...updatedSection];
      savePosCustomButtons(combined, currentUser?.id);
      return combined;
    });
  };

  const handleDeleteButtonInLive = (buttonId: string) => {
    if (confirm('هل ترغب في إخفاء أو حذف هذا الزر من الواجهة؟')) {
      setPosButtons(prev => {
        const filtered = prev.filter(b => b.id !== buttonId);
        savePosCustomButtons(filtered, currentUser?.id);
        return filtered;
      });
    }
  };

  // Dynamic Button Action Dispatcher
  const handleExecuteButtonAction = (button: PosCustomButton) => {
    switch (button.actionType) {
      case 'save_invoice':
        handleSaveInvoice('none', true);
        break;
      case 'save_and_print':
        handleSaveInvoice('prompt', true);
        break;
      case 'save_and_print_a4_custom':
        handleSaveInvoice('a4-custom-direct', true);
        break;
      case 'quick_pay_cash':
        handleQuickPayCash('none');
        break;
      case 'pay_cash_and_print':
        handleQuickPayCash('thermal-direct');
        break;
      case 'pay_cash_and_print_a4_custom':
        handleQuickPayCash('a4-custom-direct');
        break;
      case 'quick_pay_card':
        handleQuickPayCard('prompt');
        break;
      case 'hold_invoice':
        handleHoldInvoice();
        break;
      case 'held_invoices_list':
        setIsHeldInvoicesOpen(true);
        break;
      case 'new_invoice':
        handleStartNewInvoice();
        break;
      case 'clear_invoice':
        handleClearInvoice();
        break;
      case 'nav_first':
        handleNavFirst();
        break;
      case 'nav_prev':
        handleNavPrev();
        break;
      case 'nav_next':
        handleNavNext();
        break;
      case 'nav_last':
        handleNavLast();
        break;
      case 'delete_invoice':
        if (editingPosInvoiceId) {
          const invToDelete = invoices.find(inv => inv.id === editingPosInvoiceId);
          const nameToDisplay = invToDelete ? invToDelete.invoiceNumber : `INV-${invoiceSeqNumber.padStart(4, '0')}`;
          if (confirm(`هل ترغب في حذف الفاتورة المفتوحة حالياً (${nameToDisplay}) نهائياً؟`)) {
            deleteInvoice(editingPosInvoiceId);
            handleClearInvoiceDirect(true);
            posSound.beep();
          }
        } else {
          if (invoices.length > 0) {
            const lastInv = invoices[0];
            if (confirm(`هل ترغب في حذف آخر فاتورة مسجلة في النظام (${lastInv.invoiceNumber})؟`)) {
              deleteInvoice(lastInv.id);
              posSound.beep();
            }
          } else {
            alert('لا توجد فواتير مسجلة لحذفها.');
          }
        }
        break;
      case 'refresh_data':
        window.location.reload();
        break;
      case 'search_invoices':
        setIsInvoicesReviewOpen(true);
        break;
      case 'open_deleted_invoices':
        setIsDeletedInvoicesOpen(true);
        break;
      case 'open_customer_ledger':
        setIsCustomerLedgerOpen(true);
        break;
      case 'open_favorite_drawer':
        setIsFavoritesOpen(true);
        break;
      case 'open_item_search':
        setIsItemSearchOpen(true);
        break;
      case 'open_calculator':
        setIsCalculatorOpen(true);
        break;
      case 'open_camera_scanner':
        setIsInlineCameraOpen(prev => !prev);
        break;
      case 'open_cash_drawer':
        posSound.playCashBeep();
        alert('تم فتح درج النقدية بنجاح ⛁');
        break;
      case 'quick_discount_percent': {
        const pct = Number(button.actionPayload) || 5;
        setDiscountType('percent');
        setOverallDiscount(pct);
        posSound.beep();
        break;
      }
      case 'quick_discount_amount': {
        const amt = Number(button.actionPayload) || 10;
        setDiscountType('amount');
        setOverallDiscount(amt);
        posSound.beep();
        break;
      }
      case 'insert_item': {
        const it = inventory.find(i => i.id === button.actionPayload);
        if (it) {
          posSound.playCashBeep();
          handleAddItemToTable(it);
        }
        break;
      }
      case 'sound_test':
        posSound.playCashBeep();
        break;
      case 'open_invoice_details':
        handleOpenInvoiceDetailsPreview();
        break;
      case 'open_daily_invoices':
        setIsDailyInvoicesOpen(true);
        break;
      case 'add_delivery_service':
        handleAddDeliveryServiceLine();
        break;
      default:
        console.log('Action type not mapped:', button.actionType);
    }
  };

  // Held invoices with localStorage persistence
  const [heldInvoices, setHeldInvoices] = useState<HeldInvoiceData[]>(() => {
    try {
      const raw = localStorage.getItem('pos_held_invoices');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('pos_held_invoices', JSON.stringify(heldInvoices));
    } catch (e) {
      console.error(e);
    }
  }, [heldInvoices]);

  // Selected customer object
  const currentCustomer = parties.find(p => p.id === selectedCustomerId);

  // Sync customer code and balance when customer selection changes
  useEffect(() => {
    if (currentCustomer) {
      setCustomerCode(currentCustomer.code || '');
      if (!customerName || customerName === 'عميل كاشير نقدي' || customerName === 'زبون نقدي') {
        setCustomerName(currentCustomer.name);
      }
    }
  }, [selectedCustomerId, currentCustomer]);

  // الرصيد الفعلي التراكمي المحسوب 100% للعميل أو المورد أو الموظف المحدد مباشرة من دفتر العمليات وكشف الحساب
  const activeTargetBalanceInfo = useMemo(() => {
    if (!selectedCustomerId) {
      return {
        balance: 0,
        formattedBalance: '0.00',
        label: subCustomerId ? 'رصيد الفرعي:' : 'الرصيد:',
        statusText: '',
        isDebit: false,
        isCredit: false,
        isZero: true,
        hasTarget: false
      };
    }

    if (posTargetType === 'employee') {
      const emp = employees.find(e => e.id === selectedCustomerId);
      if (!emp) {
        return {
          balance: 0,
          formattedBalance: '0.00',
          label: 'رصيد الموظف:',
          statusText: '',
          isDebit: false,
          isCredit: false,
          isZero: true,
          hasTarget: false
        };
      }
      const trueBal = calculateEmployeeTrueBalance(
        emp,
        vouchers,
        employeeAdvances,
        employeeDeductions,
        employeeIncentives,
        invoices,
        purchases,
        purchaseReturns,
        salesReturns,
        payrollSheets,
        journalEntries,
        debtClearings
      );
      // في كشف الموظف: موجب = مستحق له، سالب = سلف ومسحوبات عليه
      const isDueToEmp = trueBal > 0.005;
      const isOwedByEmp = trueBal < -0.005;
      const absBal = Math.abs(trueBal);
      return {
        balance: trueBal,
        formattedBalance: absBal.toFixed(2),
        label: 'رصيد الموظف:',
        statusText: isDueToEmp ? '(له مستحق)' : isOwedByEmp ? '(عليه سلفة)' : '(خالص)',
        isDebit: isOwedByEmp,
        isCredit: isDueToEmp,
        isZero: Math.abs(trueBal) < 0.01,
        hasTarget: true,
        targetName: emp.name
      };
    }

    if (posTargetType === 'supplier') {
      const supp = parties.find(p => p.id === selectedCustomerId);
      if (!supp) {
        return {
          balance: 0,
          formattedBalance: '0.00',
          label: 'رصيد المورد:',
          statusText: '',
          isDebit: false,
          isCredit: false,
          isZero: true,
          hasTarget: false
        };
      }
      const trueBal = calculatePartyTrueBalance(
        supp,
        invoices,
        vouchers,
        purchases,
        purchaseReturns,
        salesReturns,
        printOrders,
        journalEntries,
        debtClearings
      );
      // في كشف المورد: سالب = دائن له علينا، موجب = مدين لنا عليه
      const isOwedToSupplier = trueBal < -0.005;
      const isDueFromSupplier = trueBal > 0.005;
      const absBal = Math.abs(trueBal);
      return {
        balance: trueBal,
        formattedBalance: absBal.toFixed(2),
        label: 'رصيد المورد:',
        statusText: isOwedToSupplier ? '(له علينا)' : isDueFromSupplier ? '(لنا عليه)' : '(خالص)',
        isDebit: isDueFromSupplier,
        isCredit: isOwedToSupplier,
        isZero: Math.abs(trueBal) < 0.01,
        hasTarget: true,
        targetName: supp.name
      };
    }

    // posTargetType === 'customer'
    if (subCustomerId) {
      const subParty = parties.find(p => p.id === subCustomerId);
      const parentParty = parties.find(p => p.id === selectedCustomerId);
      const targetParty = subParty || parentParty;
      if (targetParty) {
        const trueBal = calculatePartyTrueBalance(
          targetParty,
          invoices,
          vouchers,
          purchases,
          purchaseReturns,
          salesReturns,
          printOrders,
          journalEntries,
          debtClearings,
          subCustomerId,
          parties.filter(p => p.isSubCustomer)
        );
        const isCustomerDebit = trueBal > 0.005;
        const isCustomerCredit = trueBal < -0.005;
        const absBal = Math.abs(trueBal);
        return {
          balance: trueBal,
          formattedBalance: absBal.toFixed(2),
          label: 'رصيد الفرعي:',
          statusText: isCustomerDebit ? '(عليه دين)' : isCustomerCredit ? '(له رصيد)' : '(خالص)',
          isDebit: isCustomerDebit,
          isCredit: isCustomerCredit,
          isZero: Math.abs(trueBal) < 0.01,
          hasTarget: true,
          targetName: subParty?.name || ''
        };
      }
    }

    // عميل رئيسي
    const cust = parties.find(p => p.id === selectedCustomerId);
    if (!cust) {
      return {
        balance: 0,
        formattedBalance: '0.00',
        label: 'الرصيد:',
        statusText: '',
        isDebit: false,
        isCredit: false,
        isZero: true,
        hasTarget: false
      };
    }

    const trueBal = calculatePartyTrueBalance(
      cust,
      invoices,
      vouchers,
      purchases,
      purchaseReturns,
      salesReturns,
      printOrders,
      journalEntries,
      debtClearings
    );
    const isCustomerDebit = trueBal > 0.005;
    const isCustomerCredit = trueBal < -0.005;
    const absBal = Math.abs(trueBal);
    return {
      balance: trueBal,
      formattedBalance: absBal.toFixed(2),
      label: 'الرصيد:',
      statusText: isCustomerDebit ? '(عليه دين)' : isCustomerCredit ? '(له رصيد)' : '(خالص)',
      isDebit: isCustomerDebit,
      isCredit: isCustomerCredit,
      isZero: Math.abs(trueBal) < 0.01,
      hasTarget: true,
      targetName: cust.name
    };
  }, [
    selectedCustomerId,
    subCustomerId,
    posTargetType,
    parties,
    employees,
    invoices,
    vouchers,
    purchases,
    purchaseReturns,
    salesReturns,
    printOrders,
    journalEntries,
    debtClearings,
    employeeAdvances,
    employeeDeductions,
    employeeIncentives,
    payrollSheets
  ]);

  // Financial Calculations
  const calculatedSubtotal = useMemo(() => {
    return tableLines.reduce((sum, line) => sum + line.total, 0);
  }, [tableLines]);

  const activeTableLines = useMemo(() => {
    return tableLines.filter(l => ((l.itemName || '').trim() !== '') || l.unitPrice > 0 || l.total > 0);
  }, [tableLines]);

  const activeItemsCount = activeTableLines.length;

  const totalPiecesCount = useMemo(() => {
    return activeTableLines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);
  }, [activeTableLines]);

  const calculatedDiscountTotal = useMemo(() => {
    if (discountType === 'percent') {
      return (calculatedSubtotal * overallDiscount) / 100;
    }
    return overallDiscount;
  }, [calculatedSubtotal, overallDiscount, discountType]);

  const effectiveTaxRate = taxEnabled ? taxRate : 0;
  const netBeforeTax = Math.max(0, calculatedSubtotal - calculatedDiscountTotal);
  
  const calculatedTaxAmount = useMemo(() => {
    if (effectiveTaxRate > 0) {
      return Number(((netBeforeTax * effectiveTaxRate) / 100).toFixed(2));
    }
    // إذا لم تكن هناك ضريبة عامة، يتم حساب مجموع ضرائب البنود
    return tableLines.reduce((acc, line) => acc + (Number(line.tax) || 0), 0);
  }, [effectiveTaxRate, netBeforeTax, tableLines]);

  const calculatedTotalAmount = Number((netBeforeTax + calculatedTaxAmount + additionalCharges).toFixed(2));

  // Calculate Cash and Bank Payments in Base Currency (₪)
  const numCashAmount = parseFloat(cashAmountInput) || 0;
  const numCashRate = cashExchangeRate > 0 ? cashExchangeRate : 1.0;
  const cashPaidBase = Number((numCashAmount * numCashRate).toFixed(2));

  const numBankAmount = parseFloat(bankAmountInput) || 0;
  const numBankRate = bankExchangeRate > 0 ? bankExchangeRate : 1.0;
  const bankPaidBase = Number((numBankAmount * numBankRate).toFixed(2));

  const parsedPaidAmount = Number((cashPaidBase + bankPaidBase).toFixed(2));
  const calculatedRemaining = Math.max(0, Number((calculatedTotalAmount - parsedPaidAmount).toFixed(2)));

  const currentPaymentStatus = computeInvoicePaymentStatus({
    totalAmount: calculatedTotalAmount,
    paidAmount: parsedPaidAmount,
    remainingAmount: calculatedRemaining,
    cashPaidAmount: cashPaidBase,
    bankPaidAmount: bankPaidBase,
    paymentMethod: parsedPaidAmount <= 0 ? 'credit' : (bankPaidBase > 0 ? 'card' : 'cash'),
  });
  const currentPaymentStatusMeta = getInvoicePaymentStatusMeta(currentPaymentStatus);

  // Quick Action Helpers - زر كامل يضع قيمة المتبقي مع الاحتفاظ بأي قيمة دفع أخرى موجودة
  const handleQuickFullCash = () => {
    // 1. حساب المبلغ المدفوع بالبنك حالياً بالعملة الأساسية (الشيكل)
    const currentBankAmount = parseFloat(bankAmountInput) || 0;
    const bRate = bankExchangeRate > 0 ? bankExchangeRate : 1.0;
    const currentBankPaidBase = Number((currentBankAmount * bRate).toFixed(2));

    // 2. حساب المبلغ المتبقي بعد خصم أي مدفوعات بنكية سابقة
    const remainingBase = Math.max(0, Number((calculatedTotalAmount - currentBankPaidBase).toFixed(2)));

    // 3. تحويل المبلغ المتبقي لعملة الدفع النقدي المختارة
    const cRate = cashExchangeRate > 0 ? cashExchangeRate : 1.0;
    const reqCash = Number((remainingBase / cRate).toFixed(2));

    // 4. تعيين المتبقي في خانة الدفع النقدي مع الاحتفاظ بالدفع البنكي كما هو دون تصفيره
    setCashAmountInput(String(reqCash));

    // 5. تحديد طريقة الدفع المناسبة
    if (currentBankAmount > 0 && reqCash > 0) {
      setPaymentMethod('split');
    } else if (reqCash > 0) {
      setPaymentMethod('cash');
    } else if (currentBankAmount > 0) {
      setPaymentMethod('card');
    } else {
      setPaymentMethod('cash');
    }
  };

  const handleQuickFullBank = () => {
    // 1. حساب المبلغ المدفوع نقداً حالياً بالعملة الأساسية (الشيكل)
    const currentCashAmount = parseFloat(cashAmountInput) || 0;
    const cRate = cashExchangeRate > 0 ? cashExchangeRate : 1.0;
    const currentCashPaidBase = Number((currentCashAmount * cRate).toFixed(2));

    // 2. حساب المبلغ المتبقي بعد خصم أي مدفوعات نقدية سابقة
    const remainingBase = Math.max(0, Number((calculatedTotalAmount - currentCashPaidBase).toFixed(2)));

    // 3. تحويل المبلغ المتبقي لعملة الدفع البنكي المختارة
    const bRate = bankExchangeRate > 0 ? bankExchangeRate : 1.0;
    const reqBank = Number((remainingBase / bRate).toFixed(2));

    // 4. تعيين المتبقي في خانة الدفع البنكي مع الاحتفاظ بالدفع النقدي كما هو دون تصفيره
    setBankAmountInput(String(reqBank));

    // 5. تحديد طريقة الدفع المناسبة
    if (currentCashAmount > 0 && reqBank > 0) {
      setPaymentMethod('split');
    } else if (reqBank > 0) {
      setPaymentMethod('card');
    } else if (currentCashAmount > 0) {
      setPaymentMethod('cash');
    } else {
      setPaymentMethod('card');
    }
  };

  const handleQuickCredit = () => {
    setCashAmountInput('0');
    setBankAmountInput('0');
    setPaymentMethod('credit');
  };

  // Quantity and Area Totals for table footer (synced with active lines)
  const totalItemsCount = activeItemsCount;

  // Formula to calculate row values based on user specifications:
  // حساب الأبعاد
  // إذا كان الصنف يحتاج أبعاداً:
  // الكمية = الطول × العرض × العدد
  // مثال: 2 متر × 3 متر × 2 = 12 متر مربع. إذا كان السعر 25: 12 × 25 = 300.
  // أما الصنف العادي فيستخدم كمية مباشرة.
  const calculateLineValues = useCallback((
    hasDimensions: boolean,
    length: number,
    width: number,
    count: number,
    rawQuantity: number,
    unitPrice: number,
    discount: number = 0,
    lineTax?: number
  ) => {
    let effectiveQuantity = Number(rawQuantity) || 1;
    if (hasDimensions) {
      const l = Number(length) || 0;
      const w = Number(width) || 0;
      const c = Number(count) || 1;
      effectiveQuantity = Number((l * w * c).toFixed(3));
    }

    const price = Number(unitPrice) || 0;
    const subtotal = effectiveQuantity * price;
    const lineDiscount = Number(discount) || 0;
    const net = Math.max(0, subtotal - lineDiscount);
    const lineTaxRate = taxEnabled ? taxRate : 0;
    const calculatedTax = lineTax !== undefined ? lineTax : Number(((net * lineTaxRate) / 100).toFixed(2));
    const total = Number((net + calculatedTax).toFixed(2));

    return {
      quantity: effectiveQuantity,
      subtotal: Number(subtotal.toFixed(2)),
      tax: calculatedTax,
      total
    };
  }, [taxEnabled, taxRate]);

  const calculateLineTotal = (
    length: number,
    width: number,
    qty: number,
    price: number,
    count: number = 1,
    hasDimensions: boolean = false,
    discount: number = 0,
    tax: number = 0
  ) => {
    return calculateLineValues(hasDimensions, length, width, count, qty, price, discount, tax).total;
  };

  // Add new empty row
  const handleAddNewRow = () => {
    const newLine: PosTableLine = {
      id: generateUniqueLineId(),
      itemCode: '',
      barcode: '',
      itemName: '',
      description: '',
      notes: '',
      hasDimensions: false,
      length: 0,
      width: 0,
      count: 1,
      quantity: 1,
      unit: 'حبة',
      unitPrice: 0,
      discount: 0,
      tax: 0,
      total: 0,
      attachments: []
    };
    setTableLines(prev => [...prev, newLine]);
    setActiveRowId(newLine.id);
    return newLine.id;
  };

  // Current customer object for lookup
  const selectedCustomerObj = useMemo(() => {
    return parties.find(p => p.id === selectedCustomerId) || null;
  }, [parties, selectedCustomerId]);

  const isCashCustomer = useMemo(() => {
    return isCashCustomerParty(selectedCustomerObj || selectedCustomerId, customerCode, customerName);
  }, [selectedCustomerObj, selectedCustomerId, customerCode, customerName]);

  const effectivePricingCustomerId = useMemo(() => {
    if (posTargetType !== 'customer') return undefined;
    if (isCashCustomer) return undefined;
    if (subCustomerId) return subCustomerId;
    return selectedCustomerId || undefined;
  }, [posTargetType, isCashCustomer, subCustomerId, selectedCustomerId]);

  const effectivePricingCustomerObj = useMemo(() => {
    if (isCashCustomer) return null;
    const custId = effectivePricingCustomerId || selectedCustomerId;
    if (!custId && !customerName) return null;
    return parties.find(p => 
      (custId && p.id === custId) ||
      (custId && p.code && p.code.toLowerCase() === custId.toLowerCase()) ||
      (customerName && p.name && p.name.trim().toLowerCase() === customerName.trim().toLowerCase())
    ) || null;
  }, [isCashCustomer, parties, effectivePricingCustomerId, selectedCustomerId, customerName]);

  // Helper to look up the last sale price for a registered customer for an item strictly from previous sales invoices
  const getLastSalePriceForCustomer = useCallback((itemId: string, custIdentifier?: string): number | undefined => {
    if (!custIdentifier || isCashCustomer) return undefined;
    const targetParty = parties.find(p =>
      p.id === custIdentifier ||
      (p.code && p.code.toLowerCase() === custIdentifier.toLowerCase()) ||
      (p.name && p.name.trim().toLowerCase() === custIdentifier.trim().toLowerCase())
    );
    if (!targetParty || isCashCustomerParty(targetParty)) return undefined;
    const targetId = targetParty.id;
    const targetName = targetParty.name.trim().toLowerCase();

    for (let i = 0; i < invoices.length; i++) {
      const inv = invoices[i];
      if (inv.status === 'deleted' || inv.status === 'cancelled') continue;
      const isTargetCust = (inv.customerId && inv.customerId === targetId) || (inv.customerName && inv.customerName.trim().toLowerCase() === targetName);
      if (!isTargetCust) continue;
      const matchLine = inv.items?.find(it => it.itemId === itemId || it.inventoryItemId === itemId || (it.barcode && matchItemByBarcode({ barcode: it.barcode } as any, it.barcode)));
      if (matchLine && typeof matchLine.unitPrice === 'number' && matchLine.unitPrice > 0) {
        return matchLine.unitPrice;
      }
    }
    return undefined;
  }, [invoices, parties, isCashCustomer]);

  // Compute item effective price honoring customer special prices & pricing tier
  const getItemEffectivePrice = useCallback((item: InventoryItem, tier: string = pricingTier): number => {
    if (isCashCustomer) {
      const res = getItemPriceForCustomer(item, undefined, tier as any);
      return res.price;
    }
    const targetCustomerIdentifier = effectivePricingCustomerId || selectedCustomerId || customerName;
    const res = getItemPriceForCustomer(item, targetCustomerIdentifier, tier as any);

    // If the customer does NOT have an explicit special price, and "استخدام آخر سعر" checkbox is checked:
    if (!res.isSpecialPrice && useLastCustomerPrice) {
      const lastPrice = getLastSalePriceForCustomer(item.id, targetCustomerIdentifier);
      if (lastPrice !== undefined && lastPrice > 0) {
        return lastPrice;
      }
    }

    return res.price;
  }, [isCashCustomer, getItemPriceForCustomer, effectivePricingCustomerId, selectedCustomerId, customerName, pricingTier, useLastCustomerPrice, getLastSalePriceForCustomer]);

  // Apply customer specific pricing to all lines currently in the table
  const applyCustomerPricingToLines = useCallback((
    customer: Party | null | undefined,
    currentLines: PosTableLine[],
    tierOverride?: 'retail' | 'wholesale' | 'special',
    forceUseLastPrice?: boolean
  ): PosTableLine[] => {
    const activeTier = tierOverride || pricingTier;
    const isCustomerCash = isCashCustomerParty(customer || selectedCustomerId, customerCode, customerName);
    const targetCustId = isCustomerCash ? undefined : (customer?.id || customer?.name || effectivePricingCustomerId || selectedCustomerId);
    const shouldCheckLastPrice = !isCustomerCash && (forceUseLastPrice !== undefined ? forceUseLastPrice : useLastCustomerPrice);

    return currentLines.map(line => {
      const item = inventory.find(i => 
        (line.inventoryItemId && i.id === line.inventoryItemId) || 
        (line.barcode && matchItemByBarcode(i, line.barcode)) || 
        i.name === line.itemName
      );
      if (!item) return line;

      let effectivePrice = item.sellingPrice;
      if (isCustomerCash) {
        const res = getItemPriceForCustomer(item, undefined, activeTier);
        effectivePrice = res.price;
      } else {
        const res = getItemPriceForCustomer(item, targetCustId, activeTier);
        effectivePrice = res.price;
        if (!res.isSpecialPrice && shouldCheckLastPrice) {
          const lastPrice = getLastSalePriceForCustomer(item.id, targetCustId);
          if (lastPrice !== undefined && lastPrice > 0) {
            effectivePrice = lastPrice;
          }
        }
      }

      const calc = calculateLineValues(
        line.hasDimensions,
        Number(line.length) || 0,
        Number(line.width) || 0,
        Number(line.count) || 1,
        Number(line.quantity) || 1,
        effectivePrice,
        Number(line.discount) || 0,
        (taxEnabled && taxRate > 0) ? undefined : line.tax
      );

      return {
        ...line,
        inventoryItemId: item.id,
        unitPrice: effectivePrice,
        quantity: calc.quantity,
        tax: calc.tax,
        total: calc.total
      };
    });
  }, [inventory, pricingTier, calculateLineValues, getItemPriceForCustomer, effectivePricingCustomerId, selectedCustomerId, taxEnabled, taxRate, customerCode, customerName, useLastCustomerPrice, getLastSalePriceForCustomer]);

  // Re-evaluate line prices automatically whenever customer changes across POS (only during new sales when customer is manually switched, never when editing/loading an existing invoice)
  const isInvoiceLoadingRef = useRef<boolean>(false);
  const prevPricingCustIdRef = useRef(effectivePricingCustomerId);
  useEffect(() => {
    if (isInvoiceLoadingRef.current || editingPosInvoiceId || currentEditingInvoiceIdRef.current) {
      prevPricingCustIdRef.current = effectivePricingCustomerId;
      return;
    }
    if (prevPricingCustIdRef.current !== effectivePricingCustomerId) {
      prevPricingCustIdRef.current = effectivePricingCustomerId;
      if (tableLines.length > 0) {
        setTableLines(prev => applyCustomerPricingToLines(effectivePricingCustomerObj, prev));
      }
    }
  }, [effectivePricingCustomerId, effectivePricingCustomerObj, applyCustomerPricingToLines, tableLines.length, editingPosInvoiceId]);

  // 10-second Inactivity timer: automatically returns focus to barcode input when in Barcode Hand Mode
  const resetInactivityTimer = useCallback(() => {
    if (!isBarcodeHandMode) return;
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current);
    }
    inactivityTimerRef.current = setTimeout(() => {
      if (barcodeInputRef.current) {
        barcodeInputRef.current.focus();
        barcodeInputRef.current.select();
      }
    }, 10000); // 10 seconds of no mouse or keyboard movement
  }, [isBarcodeHandMode]);

  // Track mouse and keyboard activity when Barcode Hand Mode is active
  useEffect(() => {
    if (!isBarcodeHandMode) {
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
      return;
    }

    const handleUserActivity = () => {
      resetInactivityTimer();
    };

    window.addEventListener('mousemove', handleUserActivity, { passive: true });
    window.addEventListener('keydown', handleUserActivity, { passive: true });
    window.addEventListener('pointerdown', handleUserActivity, { passive: true });

    return () => {
      window.removeEventListener('mousemove', handleUserActivity);
      window.removeEventListener('keydown', handleUserActivity);
      window.removeEventListener('pointerdown', handleUserActivity);
      if (inactivityTimerRef.current) {
        clearTimeout(inactivityTimerRef.current);
      }
    };
  }, [isBarcodeHandMode, resetInactivityTimer]);

  // Toggle Barcode Hand Mode
  const toggleBarcodeHandMode = (val: boolean) => {
    setIsBarcodeHandMode(val);
    try {
      localStorage.setItem('pos_barcode_hand_mode', String(val));
    } catch {}
    if (val) {
      posSound.beep();
      setTimeout(() => {
        if (barcodeInputRef.current) {
          barcodeInputRef.current.focus();
          barcodeInputRef.current.select();
        }
      }, 100);
    }
  };

  // Update line field with full dimension and calculation support
  const handleUpdateLine = (id: string, field: keyof PosTableLine, value: any) => {
    resetInactivityTimer();
    setTableLines(prev =>
      prev.map(line => {
        if (line.id !== id) return line;

        const isSqCurrently = isSquareMeterUnit(line.unit);

        // إذا كانت وحدة الصنف ليست متر مربع فتغلق الطول والعرض والعدد
        if (!(isSqCurrently && line.hasDimensions) && (field === 'length' || field === 'width' || field === 'count')) {
          return line;
        }

        const updated = { ...line, [field]: value };

        // عند تعديل الوحدة: إذا كانت ليست متر مربع فتلقائياً تلغى وتغلق الأبعاد
        if (field === 'unit') {
          const isSqNew = isSquareMeterUnit(String(value || ''));
          if (!isSqNew) {
            updated.hasDimensions = false;
            updated.length = 0;
            updated.width = 0;
            updated.count = 1;
          } else {
            updated.hasDimensions = true;
            if (!updated.length || updated.length <= 0) updated.length = 1;
            if (!updated.width || updated.width <= 0) updated.width = 1;
            if (!updated.count || updated.count <= 0) updated.count = 1;
          }
        }

        // عند التبديل اليدوي لحساب الأبعاد
        if (field === 'hasDimensions') {
          if (value === true) {
            updated.hasDimensions = true;
            updated.unit = 'م²';
            if (!updated.length || updated.length <= 0) updated.length = 1;
            if (!updated.width || updated.width <= 0) updated.width = 1;
            if (!updated.count || updated.count <= 0) updated.count = 1;
          } else {
            updated.hasDimensions = false;
            updated.length = 0;
            updated.width = 0;
            updated.count = 1;
            if (isSquareMeterUnit(updated.unit)) {
              updated.unit = 'حبة';
            }
          }
        }

        // If user enters length or width and unit is square meter, auto-enable hasDimensions
        if ((field === 'length' || field === 'width') && Number(value) > 0 && isSquareMeterUnit(updated.unit) && !updated.hasDimensions) {
          updated.hasDimensions = true;
        }

        // Recalculate line totals and dimensional quantities
        if (['length', 'width', 'count', 'quantity', 'unitPrice', 'discount', 'tax', 'hasDimensions', 'unit'].includes(field)) {
          const isSq = isSquareMeterUnit(updated.unit);
          const effectiveHasDims = isSq && updated.hasDimensions;
          updated.hasDimensions = effectiveHasDims;
          if (!effectiveHasDims) {
            updated.length = 0;
            updated.width = 0;
            updated.count = 1;
          }

          const isQtyDirectEdit = field === 'quantity' || !effectiveHasDims;
          const rawQty = isQtyDirectEdit ? (Number(updated.quantity) || 1) : updated.quantity;

          const calc = calculateLineValues(
            effectiveHasDims,
            Number(updated.length) || 0,
            Number(updated.width) || 0,
            Number(updated.count) || 1,
            rawQty,
            Number(updated.unitPrice) || 0,
            Number(updated.discount) || 0,
            field === 'tax' ? Number(value) : ((taxEnabled && taxRate > 0) ? undefined : updated.tax)
          );

          updated.quantity = calc.quantity;
          if (field !== 'tax') {
            updated.tax = calc.tax;
          }
          updated.total = calc.total;
        }

        return updated;
      })
    );
  };

  // Delete line
  const handleDeleteLine = (id: string) => {
    posSound.error();
    setTableLines(prev => prev.filter(l => l.id !== id));
  };

  // Add item from search or favorites into table
  const handleAddItemToTable = useCallback((item: InventoryItem) => {
    posSound.beep();
    const price = getItemEffectivePrice(item);

    const isDimensionItem = isSquareMeterUnit(item.unit, item.unitCalculationType);

    if (aggregateDuplicateItems) {
      const existingLine = tableLines.find(
        l => l.inventoryItemId === item.id || (l.barcode && matchItemByBarcode(item, l.barcode)) || l.itemName === item.name
      );

      if (existingLine) {
        if (existingLine.hasDimensions) {
          const newCount = (existingLine.count || 1) + 1;
          const calc = calculateLineValues(
            true,
            existingLine.length,
            existingLine.width,
            newCount,
            existingLine.quantity,
            existingLine.unitPrice,
            existingLine.discount,
            (taxEnabled && taxRate > 0) ? undefined : existingLine.tax
          );
          setTableLines(prev =>
            prev.map(l => (l.id === existingLine.id ? { ...l, count: newCount, quantity: calc.quantity, total: calc.total } : l))
          );
        } else {
          const newQty = existingLine.quantity + 1;
          const calc = calculateLineValues(
            false,
            existingLine.length,
            existingLine.width,
            existingLine.count,
            newQty,
            existingLine.unitPrice,
            existingLine.discount,
            (taxEnabled && taxRate > 0) ? undefined : existingLine.tax
          );
          setTableLines(prev =>
            prev.map(l => (l.id === existingLine.id ? { ...l, quantity: calc.quantity, total: calc.total } : l))
          );
        }
        setActiveRowId(existingLine.id);
        return;
      }
    }

    const defaultLength = isDimensionItem ? 1 : 0;
    const defaultWidth = isDimensionItem ? 1 : 0;
    const defaultCount = 1;
    const initialQty = isDimensionItem ? (defaultLength * defaultWidth * defaultCount) : 1;
    const initialTotal = Number((initialQty * price).toFixed(2));

    const newLine: PosTableLine = {
      id: generateUniqueLineId(),
      itemCode: item.code || '',
      barcode: item.barcode || '',
      itemName: item.name,
      description: item.category === 'shields_gifts' ? 'شكر وعرفان وتكريم' : '',
      notes: '',
      hasDimensions: isDimensionItem,
      length: defaultLength,
      width: defaultWidth,
      count: defaultCount,
      quantity: initialQty,
      unit: item.unit || (isDimensionItem ? 'م²' : 'حبة'),
      unitPrice: price,
      discount: 0,
      tax: 0,
      total: initialTotal,
      attachments: [],
      inventoryItemId: item.id
    };

    // If table currently has only one empty line, replace it with the chosen item
    if (tableLines.length === 1 && !(tableLines[0].itemName || '').trim() && tableLines[0].unitPrice === 0) {
      setTableLines([{ ...newLine, id: tableLines[0].id }]);
      setActiveRowId(tableLines[0].id);
      return;
    }

    setTableLines(prev => [...prev, newLine]);
    setActiveRowId(newLine.id);
  }, [aggregateDuplicateItems, getItemEffectivePrice, tableLines, calculateLineValues]);

  // Unified barcode scanned handler (from hardware USB gun or camera)
  const handleBarcodeScanned = useCallback((scannedCode: string) => {
    const cleanCode = scannedCode.trim();
    if (!cleanCode) return;
    const item = inventory.find(i => matchItemByBarcode(i, cleanCode));
    if (item) {
      setBarcodeNotFoundAlert(null);
      handleAddItemToTable(item);
      // Auto transition cursor to Quantity field ONLY when Barcode Hand Mode is active
      if (isBarcodeHandMode) {
        setTimeout(() => {
          if (quantityInputRef.current) {
            quantityInputRef.current.focus();
            quantityInputRef.current.select();
          }
          resetInactivityTimer();
        }, 80);
      }
    } else {
      posSound.error();
      setBarcodeNotFoundAlert(cleanCode);
      alert(`الصنف غير موجود\nالباركود: [${cleanCode}]`);
    }
  }, [inventory, handleAddItemToTable, isBarcodeHandMode, resetInactivityTimer]);

  // Reusable selector to bind a registered inventory item to a specific line
  const handleSelectItemForLine = useCallback((lineId: string, item: InventoryItem) => {
    posSound.beep();
    const price = getItemEffectivePrice(item);

    const isDimensionItem = isSquareMeterUnit(item.unit, item.unitCalculationType);

    setTableLines(prev =>
      prev.map(row => {
        if (row.id !== lineId) return row;
        const hasDims = isDimensionItem;
        const l = hasDims ? (row.length > 0 ? row.length : 1) : 0;
        const w = hasDims ? (row.width > 0 ? row.width : 1) : 0;
        const c = 1;
        const calc = calculateLineValues(
          hasDims,
          l,
          w,
          c,
          row.quantity || 1,
          price,
          row.discount,
          (taxEnabled && taxRate > 0) ? undefined : row.tax
        );

        return {
          ...row,
          itemCode: item.code || '',
          inventoryItemId: item.id,
          itemName: item.name,
          barcode: item.barcode || '',
          unitPrice: price,
          hasDimensions: hasDims,
          length: l,
          width: w,
          count: c,
          quantity: calc.quantity,
          tax: calc.tax,
          total: calc.total,
          unit: item.unit || (hasDims ? 'م²' : 'حبة'),
          description: item.category === 'shields_gifts' ? 'شكر وعرفان وتكريم' : (row.description || ''),
          imageThumbnail: item.imageUrl || row.imageThumbnail || ''
        };
      })
    );
  }, [getItemEffectivePrice, calculateLineValues, taxEnabled, taxRate]);

  // Handle direct item code input in row (بحث وتعيين الصنف عبر رقمه/كوده مباشرة)
  const handleItemCodeChangeInRow = (id: string, codeInput: string) => {
    handleUpdateLine(id, 'itemCode', codeInput);
    const trimmed = codeInput.trim();
    if (!trimmed) return;
    const item = inventory.find(i => 
      (i.code && i.code.toLowerCase() === trimmed.toLowerCase()) ||
      (i.id && i.id.toLowerCase() === trimmed.toLowerCase()) ||
      (i.barcode && i.barcode.toLowerCase() === trimmed.toLowerCase())
    );
    if (item) {
      handleSelectItemForLine(id, item);
    }
  };

  // Barcode Lookup in row (supports primary & multi-barcodes)
  const handleBarcodeChangeInRow = (id: string, code: string) => {
    handleUpdateLine(id, 'barcode', code);

    if (!code) return;
    const item = inventory.find(i => matchItemByBarcode(i, code));
    if (item) {
      posSound.beep();
      const price = getItemEffectivePrice(item);
      setTableLines(prev =>
        prev.map(line => {
          if (line.id !== id) return line;
          const isDimensionItem = isSquareMeterUnit(item.unit, item.unitCalculationType);
          const hasDims = isDimensionItem;
          const length = hasDims ? (line.length > 0 ? line.length : 1) : 0;
          const width = hasDims ? (line.width > 0 ? line.width : 1) : 0;
          const count = 1;
          const calc = calculateLineValues(
            hasDims,
            length,
            width,
            count,
            line.quantity || 1,
            price,
            line.discount,
            (taxEnabled && taxRate > 0) ? undefined : line.tax
          );
          return {
            ...line,
            itemCode: item.code || '',
            itemName: item.name,
            unitPrice: price,
            inventoryItemId: item.id,
            hasDimensions: hasDims,
            length,
            width,
            count,
            quantity: calc.quantity,
            tax: calc.tax,
            total: calc.total,
            unit: item.unit || (hasDims ? 'م²' : 'حبة')
          };
        })
      );
      // If Hand Mode is active, transition cursor to quantity field
      if (isBarcodeHandMode) {
        setTimeout(() => {
          if (quantityInputRef.current) {
            quantityInputRef.current.focus();
            quantityInputRef.current.select();
          }
          resetInactivityTimer();
        }, 70);
      }
    } else {
      posSound.error();
      setBarcodeNotFoundAlert(code);
      alert(`الصنف غير موجود\nالباركود: [${code}]`);
    }
  };

  // Hardware Scanner Integration for POS Cashier (USB / Bluetooth)
  useHardwareBarcodeScanner({
    enabled: !isCameraScannerOpen && !isItemSearchOpen,
    minChars: 3,
    playSound: false,
    onScan: (scannedCode) => {
      handleBarcodeScanned(scannedCode);
    }
  });

  // Save Invoice Action (Strict Online Synchronous Posting)
  const handleSaveInvoice = async (
    printMode: 'none' | 'prompt' | 'thermal-direct' | 'a4-direct' | 'a4-custom-direct' = 'none',
    isExplicitSave: boolean = false,
    forcedPayment?: {
      method: PaymentMethod;
      cashAmount?: number;
      bankAmount?: number;
      treasuryCode?: string;
    }
  ) => {
    // 0. Active non-empty lines filter
    const activeLines = tableLines.filter(l => (l.itemName && l.itemName.trim() !== '') || l.unitPrice > 0 || l.quantity > 0);
    if (activeLines.length === 0 || calculatedTotalAmount <= 0) {
      alert('الرجاء إدراج أصناف في الفاتورة قبل الحفظ.');
      return;
    }

    // 1. التحقق الصارم: لا يعتمد إدخال أي بند لا يندرج تحت رقم صنف معتمد
    const invalidLine = activeLines.find(line => {
      const isDelivery = line.inventoryItemId === 'srv-delivery' || line.barcode === 'DELIVERY' || line.itemName === 'خدمة توصيل' || line.itemName?.trim().startsWith('توصيل');
      if (isDelivery) return false;
      const matched = inventory.find(i => 
        (line.inventoryItemId && i.id === line.inventoryItemId) || 
        (line.itemCode && i.code && i.code.toLowerCase() === line.itemCode.trim().toLowerCase()) ||
        (line.barcode && i.barcode === line.barcode)
      );
      return !matched;
    });

    if (invalidLine) {
      posSound.error();
      setActiveRowId(invalidLine.id);
      alert(
        `تنبيه نظامي صارم:\nالبند [${invalidLine.itemName || 'غير محدد'}] لا يندرج تحت رقم صنف معتمد في النظام!\n\nلا يعتبر هذا الإدخال صحيحاً؛ يجب اختيار الصنف من قائمة الأصناف لاعتماد رقمه المخزني أولاً، وبعدها يمكنك تعديل مسمى الصنف في الشاشة بحرية دون التأثير على قائمة الأصناف الأصلية.`
      );
      return;
    }

    // 2. Validation for cash customers without sub-customer name when invoice is unpaid (آجل):
    const hasSubCustomerName = !!(subCustomerName?.trim() || customCustomerText?.trim());

    if (isCashCustomer && !hasSubCustomerName && calculatedRemaining > 0.05) {
      posSound.error();
      alert(
        'تنبيه نظامي: الزبون نقدي عام ولا يوجد اسم زبون فرعي.\nلا يمكن حفظ الفاتورة كـ (آجل) غير مدفوعة بالكامل.\nيرجى تسديد كامل المبلغ (نقداً أو بنكياً) أو تحديد اسم زبون فرعي / اختيار عميل مسجل في النظام.'
      );
      return;
    }

    // Offline-first: do not freeze checkout when offline.
    // postPosSaleOnline must confirm IndexedDB persistence before success.
    // Cloud approval and official numbering happen after reconnection.

    // 4. قفل التتابع السريع: منع الضغط المزدوج أثناء إنشاء الفاتورة
    if (isPostingCloudInvoice) {
      return;
    }

    const itemsForContext = activeLines.map(line => {
      const isDelivery = line.inventoryItemId === 'srv-delivery' || line.barcode === 'DELIVERY' || line.itemName === 'خدمة توصيل' || line.itemName?.trim().startsWith('توصيل');
      const matchedInv: InventoryItem = inventory.find(i => 
        (line.inventoryItemId && i.id === line.inventoryItemId) || 
        (line.itemCode && i.code && i.code.toLowerCase() === line.itemCode.trim().toLowerCase()) ||
        (line.barcode && i.barcode === line.barcode)
      ) || {
        id: line.inventoryItemId || (isDelivery ? 'srv-delivery' : 'custom-' + Date.now()),
        code: line.itemCode || (isDelivery ? 'DELIVERY' : ('ITM-' + line.id)),
        name: line.itemName,
        category: isDelivery ? 'services' : 'stationery',
        unit: line.unit || (isDelivery ? 'خدمة' : 'قطعة'),
        purchasePrice: isDelivery ? 0 : (line.unitPrice * 0.7),
        sellingPrice: line.unitPrice,
        stockQuantity: 0,
        minAlertQuantity: 0,
        barcode: line.barcode
      };

      if (isDelivery) {
        matchedInv.purchasePrice = 0;
        matchedInv.sellingPrice = line.unitPrice;
        matchedInv.stockQuantity = 0;
      }

      return {
        item: matchedInv,
        itemName: line.itemName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        description: line.description,
        notes: line.notes,
        hasDimensions: line.hasDimensions,
        length: line.length,
        width: line.width,
        count: line.count,
        unit: line.unit,
        discount: line.discount,
        tax: line.tax,
        taxRate: line.taxRate,
        attachments: line.attachments,
        imageThumbnail: line.imageThumbnail
      };
    });

    const cashVal = forcedPayment && forcedPayment.cashAmount !== undefined
      ? forcedPayment.cashAmount
      : (parseFloat(cashAmountInput) || 0);
    const bankVal = forcedPayment && forcedPayment.bankAmount !== undefined
      ? forcedPayment.bankAmount
      : (parseFloat(bankAmountInput) || 0);
    const cBase = cashVal * (cashExchangeRate || 1.0);
    const bBase = bankVal * (bankExchangeRate || 1.0);
    const tPaidBase = cBase + bBase;

    let effectiveMethod: PaymentMethod = forcedPayment ? forcedPayment.method : 'credit';
    if (!forcedPayment) {
      if (cBase > 0 && bBase === 0) effectiveMethod = 'cash';
      else if (bBase > 0 && cBase === 0) effectiveMethod = 'card';
      else if (cBase > 0 && bBase > 0) effectiveMethod = 'cash';
      else effectiveMethod = 'credit';
    }

    const effectiveTreasuryCode = forcedPayment?.treasuryCode || (bBase > cBase ? bankTreasuryCode : cashTreasuryCode);

    setIsPostingCloudInvoice(true);
    onlineInvoicePostingService.stageInvoiceDraft({
      lines: tableLines,
      customerName: customerName || customCustomerText || 'عميل كاشير نقدي',
      selectedCustomerId,
      notes: invoiceNotes,
      timestamp: Date.now()
    });

    // الترحيل المتزامن المباشر للسيرفر مع حماية عدم فقدان البيانات
    let postRes: Awaited<ReturnType<typeof postPosSaleOnline>>;
    try {
      postRes = await postPosSaleOnline(
      itemsForContext,
      customerName || customCustomerText || 'عميل كاشير نقدي',
      effectiveMethod,
      selectedCustomerId || undefined,
      invoiceNotes,
      {
        invoiceNumber: (currentEditingInvoiceIdRef.current || editingPosInvoiceId)
          ? invoices.find(i => i.id === (currentEditingInvoiceIdRef.current || editingPosInvoiceId))?.invoiceNumber
          : undefined,
        date: invoiceDate,
        additionalCharges,
        overallDiscount: calculatedDiscountTotal,
        taxRate: effectiveTaxRate,
        paidAmount: customExchangeRate > 0 ? Number((tPaidBase / customExchangeRate).toFixed(2)) : tPaidBase,
        representative,
        branch,
        branchId: branches.find(b => b.name === branch)?.id || activeBranchId,
        warehouse,
        userId: currentUser?.id,
        userName: currentUser?.fullName || currentUser?.username,
        editingInvoiceId: currentEditingInvoiceIdRef.current || editingPosInvoiceId || undefined,
        customCustomerText,
        subCustomerId: subCustomerId || undefined,
        subCustomerName: subCustomerName || undefined,
        subCustomerPhone: subCustomerPhone || undefined,
        treasuryAccountCode: effectiveTreasuryCode,
        currency: activeCurrency.code,
        currencySymbol: activeCurrency.symbol,
        exchangeRate: customExchangeRate > 0 ? customExchangeRate : 1.0,
        cashPaidAmount: cashVal,
        cashCurrency: cashCurrencyCode,
        cashExchangeRate: cashExchangeRate,
        cashTreasuryCode: (forcedPayment && forcedPayment.method === 'cash' ? forcedPayment.treasuryCode : cashTreasuryCode) || '1101',
        bankPaidAmount: bankVal,
        bankCurrency: bankCurrencyCode,
        bankExchangeRate: bankExchangeRate,
        bankTreasuryCode: (forcedPayment && (forcedPayment.method === 'card' || forcedPayment.method === 'bank_transfer') ? forcedPayment.treasuryCode : bankTreasuryCode) || '1102',
        paymentNotes: paymentNotes || undefined,
        workflowStatus: invoiceWorkflowStatus
      }
    );
    } catch (error) {
      setIsPostingCloudInvoice(false);
      posSound.error();
      alert(`تعذر حفظ الفاتورة: ${String(error)}\nمدخلاتك ما زالت موجودة على الشاشة، ولم نؤكد حفظها مركزيًا.`);
      return;
    }

    setIsPostingCloudInvoice(false);

    if (!postRes.success || !postRes.invoice) {
      if (postRes.isOffline) {
        setIsOfflineFrozen(true);
        setOfflinePendingPrintMode(printMode);
      } else {
        posSound.error();
        alert(`لم يُعتمد تعديل الفاتورة:\n${postRes.error || 'خطأ غير معروف'}\nمدخلات الفاتورة ما زالت على الشاشة. لا تعتبر العملية محفوظة في PostgreSQL.`);
      }
      return;
    }

    const savedInvoice = postRes.invoice;
    setIsOfflineFrozen(false);
    onlineInvoicePostingService.clearStagedInvoiceDraft();

    posSound.success();

    // POS Sale is a direct sales invoice - no duplicate print orders or deposits are created
    if (printMode !== 'none') {
      if (printMode === 'thermal-direct') {
        setDirectPrintOptions({ format: 'thermal', autoPrint: true });
      } else if (printMode === 'a4-direct') {
        setDirectPrintOptions({ format: 'a4', autoPrint: true });
      } else if (printMode === 'a4-custom-direct') {
        setDirectPrintOptions({ format: 'a4-custom', autoPrint: true });
      } else {
        setDirectPrintOptions(null);
      }
      setSelectedInvoiceForPrint(savedInvoice);
    }

    // Set notification for single-entry automated cycle review
    if (savedInvoice) {
      setLastSavedInvoiceNotice(savedInvoice);
    }

    // Reset to a fresh blank invoice
    setInvoiceSeqNumber('');

    setTableLines([
      {
        id: generateUniqueLineId(),
        barcode: '',
        itemName: '',
        description: '',
        notes: '',
        hasDimensions: false,
        length: 1,
        width: 1,
        count: 1,
        quantity: 1,
        unit: 'حبة',
        unitPrice: 0,
        discount: 0,
        tax: 0,
        total: 0,
        attachments: []
      }
    ]);
    setAdditionalCharges(0);
    setOverallDiscount(0);
    setInvoiceNotes('');
    setPaymentNotes('');
    setCashAmountInput('0');
    setBankAmountInput('0');
    setInvoiceWorkflowStatus('new');

    try {
      localStorage.removeItem(POS_FULL_DRAFT_KEY);
      localStorage.removeItem('pos_active_draft_lines');
    } catch {}

    // Reset customer and sub-customer strictly to default cash customer ("زبون نقدي") for the next sale
    setSubCustomerId('');
    setSubCustomerName('');
    setSubCustomerPhone('');
    setCustomCustomerText('');
    setPosTargetType('customer');

    const defaultCashCust = customers.find(c => c.code === 'CUST-0001' || c.code === '1');
    if (defaultCashCust) {
      setSelectedCustomerId(defaultCashCust.id);
      setCustomerName(defaultCashCust.name);
      setCustomerCode(defaultCashCust.code);
    } else {
      setSelectedCustomerId('');
      setCustomerName('زبون نقدي');
      setCustomerCode('');
    }

    if (currentEditingInvoiceIdRef.current || editingPosInvoiceId) {
      setEditingPosInvoiceId(null);
      currentEditingInvoiceIdRef.current = null;
      lastLoadedInvoiceIdRef.current = null;
      // setActiveTab('invoices'); // Removed so the screen stays as is
    }
  };
  handleSaveInvoiceRef.current = handleSaveInvoice;

  // Direct Pay Cash (زر دفع وسداد الفاتورة نقداً بصندوق النقدية وحفظها)
  const handleQuickPayCash = (printMode: 'none' | 'prompt' | 'thermal-direct' | 'a4-direct' | 'a4-custom-direct' = 'none') => {
    const validLines = tableLines.filter(
      l => (l.itemName && l.itemName.trim() !== '') || l.unitPrice > 0 || l.total > 0
    );
    if (validLines.length === 0 || calculatedTotalAmount <= 0) {
      alert('الرجاء إدراج أصناف في الفاتورة قبل الدفع.');
      return;
    }

    // 1. Force Base Currency: Palestinian Shekel (ILS ₪) with rate 1.0
    setSelectedCurrencyCode('ILS');
    setCustomExchangeRate(1.0);
    setCashCurrencyCode('ILS');
    setCashExchangeRate(1.0);

    // 2. Main Cash Treasury (الصندوق المختار أو الصندوق الرئيسي 1101)
    const mainCashTreasury = cashTreasuryCode || treasuries?.find(t => t.type === 'cash_box' || t.isDefault)?.accountCode || '1101';
    setCashTreasuryCode(mainCashTreasury);
    setSelectedTreasuryCode(mainCashTreasury);

    // 3. Mark invoice state as fully paid
    setPaymentMethod('cash');
    setCashAmountInput(String(calculatedTotalAmount));
    setBankAmountInput('0');

    posSound.playCashBeep();

    // 4. Save invoice immediately with direct full cash payment in cash treasury
    handleSaveInvoice(printMode, true, {
      method: 'cash',
      cashAmount: calculatedTotalAmount,
      bankAmount: 0,
      treasuryCode: mainCashTreasury
    });
  };

  // Direct Pay Visa / Card
  const handleQuickPayCard = (printMode: 'none' | 'prompt' | 'thermal-direct' | 'a4-direct' | 'a4-custom-direct' = 'prompt') => {
    setPaymentMethod('card');
    const rate = bankExchangeRate > 0 ? bankExchangeRate : 1.0;
    const req = Number((calculatedTotalAmount / rate).toFixed(2));
    setBankAmountInput(String(req));
    setCashAmountInput('0');
    const bTreasury = bankTreasuryCode || treasuries?.find(t => t.type === 'bank_account' || t.type === 'pos_terminal' || t.type === 'bank_app')?.accountCode || '1102';
    handleSaveInvoice(printMode, true, {
      method: 'card',
      cashAmount: 0,
      bankAmount: req,
      treasuryCode: bTreasury
    });
  };

  // معاينة وطباعة تفاصيل الفاتورة ومراجعة بنودها مع العميل قبل الحفظ أو السداد
  const handleOpenInvoiceDetailsPreview = () => {
    const linesToUse = activeTableLines.length > 0 ? activeTableLines : tableLines;
    if (linesToUse.length === 0 || (linesToUse.length === 1 && !linesToUse[0].itemName && linesToUse[0].unitPrice === 0)) {
      posSound.beep();
    }

    const itemsForInvoice: InvoiceItem[] = linesToUse.map((line, idx) => {
      const hasDims = isDimensionalInvoiceItem(line);
      return {
        id: line.id || `line-${idx}`,
        itemId: line.inventoryItemId || `item-${idx}`,
        itemName: line.itemName || 'صنف',
        quantity: Number(line.quantity) || 1,
        unitPrice: Number(line.unitPrice) || 0,
        total: Number(line.total) || 0,
        length: line.length,
        width: line.width,
        count: line.count || 1,
        unit: line.unit || (hasDims ? 'م²' : 'حبة'),
        discount: Number(line.discount) || 0,
        tax: Number(line.tax) || 0,
        taxRate: Number(line.taxRate) || 0,
        description: line.notes || line.description,
        hasDimensions: hasDims,
        attachments: line.attachments
      };
    });

    const cashVal = parseFloat(cashAmountInput) || 0;
    const bankVal = parseFloat(bankAmountInput) || 0;
    const cBase = cashVal * (cashExchangeRate || 1.0);
    const bBase = bankVal * (bankExchangeRate || 1.0);
    const tPaidBase = cBase + bBase;
    const effectivePaid = customExchangeRate > 0 ? Number((tPaidBase / customExchangeRate).toFixed(2)) : tPaidBase;

    let effectiveMethod: PaymentMethod = 'credit';
    if (cBase > 0 && bBase === 0) effectiveMethod = 'cash';
    else if (bBase > 0 && cBase === 0) effectiveMethod = 'card';
    else if (cBase > 0 && bBase > 0) effectiveMethod = 'cash';
    else effectiveMethod = 'credit';

    const selectedCust = parties.find(p => p.id === selectedCustomerId);

    const draftInvoice: Invoice = {
      id: currentEditingInvoiceIdRef.current || editingPosInvoiceId || 'draft-pos-preview',
      invoiceNumber: (currentEditingInvoiceIdRef.current || editingPosInvoiceId)
        ? (invoices.find(i => i.id === (currentEditingInvoiceIdRef.current || editingPosInvoiceId))?.invoiceNumber || '')
        : '',
      date: invoiceDate || new Date().toISOString().split('T')[0],
      customerId: selectedCustomerId || undefined,
      customerName: customerName || customCustomerText || 'عميل كاشير نقدي',
      customerPhone: subCustomerPhone || selectedCust?.phone || '',
      customerTaxNumber: selectedCust?.taxNumber || '',
      type: 'pos',
      items: itemsForInvoice,
      subtotal: calculatedSubtotal,
      discountTotal: calculatedDiscountTotal,
      taxRate: effectiveTaxRate,
      taxAmount: calculatedTaxAmount,
      totalAmount: calculatedTotalAmount,
      paidAmount: effectivePaid,
      remainingAmount: calculatedRemaining,
      paymentMethod: effectiveMethod,
      notes: invoiceNotes,
      status: effectivePaid >= calculatedTotalAmount ? 'paid' : (effectivePaid > 0 ? 'partial' : 'unpaid'),
      customCustomerText: customCustomerText,
      subCustomerId: subCustomerId || undefined,
      subCustomerName: subCustomerName || undefined,
      subCustomerPhone: subCustomerPhone || undefined,
      representative: representative,
      employeeId: posTargetType === 'employee' ? selectedCustomerId : undefined,
      branch: branch,
      branchId: branches.find(b => b.name === branch)?.id || activeBranchId,
      warehouse: warehouse,
      userId: currentUser?.id,
      userName: currentUser?.fullName || currentUser?.username,
      currency: activeCurrency.code,
      currencySymbol: activeCurrency.symbol,
      exchangeRate: customExchangeRate > 0 ? customExchangeRate : 1.0,
      baseTotalAmount: (customExchangeRate > 0 ? calculatedTotalAmount * customExchangeRate : calculatedTotalAmount),
      basePaidAmount: tPaidBase,
      cashPaidAmount: cashVal,
      bankPaidAmount: bankVal,
      cashTreasuryCode: cashTreasuryCode,
      bankTreasuryCode: bankTreasuryCode,
      workflowStatus: invoiceWorkflowStatus
    };

    setDirectPrintOptions(null);
    setSelectedInvoiceForPrint(draftInvoice);
  };

  // Hold Invoice (F9)
  const handleHoldInvoice = () => {
    if (tableLines.length === 0) return;
    
    if (heldInvoices.length >= 50) {
      posSound.error();
      alert('تم الوصول للحد الأقصى للفواتير المعلقة (50 فاتورة). يرجى استئناف أو حذف بعض الفواتير المعلقة.');
      return;
    }

    const newHeld: HeldInvoiceData = {
      id: 'held-' + Date.now(),
      heldAt: new Date().toLocaleTimeString('ar-SA'),
      customerName,
      customerId: selectedCustomerId,
      customCustomerText,
      lines: [...tableLines],
      totalAmount: calculatedTotalAmount,
      notes: invoiceNotes
    };

    setHeldInvoices(prev => [newHeld, ...prev]);
    posSound.beep();

    // Reset to clean invoice
    setTableLines([
      {
        id: generateUniqueLineId(),
        barcode: '',
        itemName: '',
        description: '',
        notes: '',
        hasDimensions: false,
        length: 1,
        width: 1,
        count: 1,
        quantity: 1,
        unit: 'حبة',
        unitPrice: 0,
        discount: 0,
        tax: 0,
        total: 0,
        attachments: []
      }
    ]);
  };

  // Resume Held Invoice
  const handleResumeHeldInvoice = (held: HeldInvoiceData) => {
    setTableLines(held.lines);
    setCustomerName(held.customerName);
    if (held.customerId) setSelectedCustomerId(held.customerId);
    if (held.customCustomerText) setCustomCustomerText(held.customCustomerText);
    if (held.notes) setInvoiceNotes(held.notes);
    setHeldInvoices(prev => prev.filter(h => h.id !== held.id));
    posSound.success();
  };

  // Load Draft Row to POS Screen
  const handleLoadDraftToPos = (draft: SheetInvoiceRow) => {
    // 1. Customer matching
    const draftCustName = (draft.customerName || '').trim().toLowerCase();
    const matchedParty = parties.find(
      p => (p.name || '').trim().toLowerCase() === draftCustName
    );
    if (matchedParty) {
      setSelectedCustomerId(matchedParty.id);
      setCustomerName(matchedParty.name);
      setCustomCustomerText('');
    } else {
      setSelectedCustomerId('');
      setCustomerName(draft.customerName || 'عميل كاشير نقدي');
      setCustomCustomerText(draft.customerName || '');
    }

    // 2. Inventory matching
    const draftItemName = (draft.itemName || '').trim().toLowerCase();
    const matchedItem = inventory.find(
      i => (i.name || '').trim().toLowerCase() === draftItemName ||
           (i.code || '').trim().toLowerCase() === draftItemName
    );

    const hasDims = (draft.length && draft.length > 0) || (draft.width && draft.width > 0);
    const draftLine: PosTableLine = {
      id: generateUniqueLineId(),
      barcode: matchedItem?.code || '',
      itemCode: matchedItem?.code,
      itemName: draft.itemName,
      description: draft.itemName,
      notes: draft.notes || '',
      hasDimensions: !!hasDims,
      length: draft.length || 1,
      width: draft.width || 1,
      count: draft.count || 1,
      quantity: draft.quantity > 0 ? draft.quantity : 1,
      unit: matchedItem?.unit || 'متر',
      unitPrice: draft.unitPrice >= 0 ? draft.unitPrice : 0,
      discount: 0,
      tax: 0,
      total: draft.totalAmount >= 0 ? draft.totalAmount : Number(((draft.quantity || 1) * (draft.unitPrice || 0)).toFixed(2)),
      attachments: (draft as any).attachments || [],
      imageThumbnail: (draft as any).imageThumbnail || matchedItem?.imageUrl || '',
      inventoryItemId: matchedItem?.id
    };

    setTableLines([draftLine]);
    if (draft.notes) setInvoiceNotes(draft.notes);
    if (draft.date) setInvoiceDate(draft.date);

    if (draft.paymentMethod === 'credit') {
      setPaymentMethod('credit');
    } else if (draft.paymentMethod === 'bank_transfer') {
      setPaymentMethod('bank_transfer');
    } else {
      setPaymentMethod('cash');
    }

    setIsDraftQueueOpen(false);
    posSound.success();
  };
  const [currentNavInvoiceIndex, setCurrentNavInvoiceIndex] = useState<number>(-1);

  const lastLoadedInvoiceIdRef = useRef<string | null>(null);

  const loadInvoiceToScreen = (inv: Invoice) => {
    if (!inv) return;
    isInvoiceLoadingRef.current = true;
    currentEditingInvoiceIdRef.current = inv.id;
    lastLoadedInvoiceIdRef.current = inv.id;

    const invCustId = inv.customerId || '';
    setSelectedCustomerId(invCustId);
    if (invCustId) {
      const matchedParty = parties.find(p => p.id === invCustId);
      setCustomerCode(matchedParty?.code || (inv as any).customerCode || '');
    } else {
      setCustomerCode((inv as any).customerCode || '');
    }
    setCustomerName(inv.customerName || 'زبون نقدي');
    setCustomCustomerText(inv.customCustomerText || '');
    setSubCustomerId(inv.subCustomerId || '');
    setSubCustomerName(inv.subCustomerName || '');
    setSubCustomerPhone(inv.subCustomerPhone || '');
    setInvoiceNotes(inv.notes || '');
    setPaymentNotes(inv.paymentNotes || '');
    if (inv.workflowStatus) setInvoiceWorkflowStatus(inv.workflowStatus);

    try {
      localStorage.removeItem('alnoor_last_focused_element');
    } catch {}
    
    setInvoiceSeqNumber((inv.invoiceNumber || '').replace(/\D/g, '') || '1');
    if (inv.date) setInvoiceDate(inv.date);
    setAdditionalCharges(Number(inv.additionalCharges) || 0);
    setOverallDiscount(Number(inv.discountTotal) || 0);
    if (inv.paymentMethod) setPaymentMethod(inv.paymentMethod);

    if (inv.cashTreasuryCode) {
      setCashTreasuryCode(inv.cashTreasuryCode);
    } else if (inv.treasuryAccountCode && inv.paymentMethod === 'cash') {
      setCashTreasuryCode(inv.treasuryAccountCode);
    }

    if (inv.bankTreasuryCode) {
      setBankTreasuryCode(inv.bankTreasuryCode);
    } else if (inv.treasuryAccountCode && (inv.paymentMethod === 'card' || inv.paymentMethod === 'bank_transfer')) {
      setBankTreasuryCode(inv.treasuryAccountCode);
    }

    if (inv.cashPaidAmount !== undefined || inv.bankPaidAmount !== undefined) {
      setCashAmountInput(String(Number(inv.cashPaidAmount) || 0));
      setBankAmountInput(String(Number(inv.bankPaidAmount) || 0));
    } else {
      if (inv.paymentMethod === 'card' || inv.paymentMethod === 'bank_transfer') {
        setBankAmountInput(String(Number(inv.paidAmount) || 0));
        setCashAmountInput('0');
      } else if (inv.paymentMethod === 'cash') {
        setCashAmountInput(String(Number(inv.paidAmount) || 0));
        setBankAmountInput('0');
      } else {
        setCashAmountInput('0');
        setBankAmountInput('0');
      }
    }
    if (inv.currency) {
      setSelectedCurrencyCode(inv.currency);
    }
    if (inv.exchangeRate) {
      setCustomExchangeRate(inv.exchangeRate);
    }

    const effectiveTaxAmount = Number(inv.taxAmount !== undefined ? inv.taxAmount : inv.taxTotal) || 0;
    if (typeof inv.taxRate === 'number') {
      setTaxRate(inv.taxRate);
      setTaxEnabled(inv.taxRate > 0 || effectiveTaxAmount > 0);
    } else if (effectiveTaxAmount === 0) {
      setTaxEnabled(false);
    } else {
      setTaxEnabled(true);
    }

    const rawItems = Array.isArray(inv.items) ? inv.items : [];
    if (rawItems.length === 0) {
      setTableLines([
        {
          id: generateUniqueLineId(),
          barcode: '',
          itemName: '',
          description: '',
          notes: '',
          hasDimensions: false,
          length: 1,
          width: 1,
          count: 1,
          quantity: 1,
          unit: 'حبة',
          unitPrice: 0,
          discount: 0,
          tax: 0,
          total: 0,
          attachments: []
        }
      ]);
      setEditingPosInvoiceId(inv.id);
      setTimeout(() => {
        isInvoiceLoadingRef.current = false;
      }, 100);
      return;
    }

    const loadedLines: PosTableLine[] = rawItems.map((it: any, idx) => {
      const invItem = inventory.find(i => (it.itemId && i.id === it.itemId) || (it.itemCode && i.code === it.itemCode));
      const hasDims = isDimensionalInvoiceItem(it);
      const lengthVal = Number(it.length) || (hasDims ? 1 : 0);
      const widthVal = Number(it.width) || (hasDims ? 1 : 0);
      const countVal = Number(it.count) || 1;
      const qtyVal = Number(it.quantity !== undefined ? it.quantity : it.qty) || 1;
      const unitPriceVal = Number(it.unitPrice !== undefined ? it.unitPrice : it.price) || 0;
      const discountVal = Number(it.discount) || 0;
      const taxVal = Number(it.tax) || 0;
      const calculatedLineTotal = it.total !== undefined 
        ? Number(it.total) 
        : (it.totalPrice !== undefined 
            ? Number(it.totalPrice) 
            : Math.max(0, (qtyVal * unitPriceVal) - discountVal + taxVal));

      return {
        id: 'loaded-' + (it.id || idx),
        itemCode: it.itemCode || invItem?.code || '',
        barcode: it.barcode || invItem?.barcode || '',
        itemName: it.itemName || invItem?.name || '',
        description: it.description || '',
        notes: it.notes || '',
        hasDimensions: hasDims,
        length: lengthVal,
        width: widthVal,
        count: countVal,
        quantity: qtyVal,
        unit: it.unit || (hasDims ? 'م²' : (invItem?.unit || 'حبة')),
        unitPrice: unitPriceVal,
        discount: discountVal,
        tax: taxVal,
        taxRate: it.taxRate !== undefined ? Number(it.taxRate) : undefined,
        total: Number(calculatedLineTotal) || 0,
        attachments: it.attachments || [],
        imageThumbnail: it.imageThumbnail || invItem?.imageUrl || '',
        inventoryItemId: it.itemId || invItem?.id
      };
    });

    setTableLines(loadedLines);
    if (loadedLines.length > 0) {
      setActiveRowId(loadedLines[0].id);
    }
    setEditingPosInvoiceId(inv.id);
    setTimeout(() => {
      isInvoiceLoadingRef.current = false;
    }, 100);
  };

  // Handle Edit Mode from InvoicesView
  useEffect(() => {
    if (editingPosInvoiceId) {
      if (lastLoadedInvoiceIdRef.current !== editingPosInvoiceId) {
        const invToEdit = invoices.find(inv => inv.id === editingPosInvoiceId);
        if (invToEdit) {
          loadInvoiceToScreen(invToEdit);
        }
      }
    } else {
      lastLoadedInvoiceIdRef.current = null;
    }
  }, [editingPosInvoiceId, invoices]);

  const invoicesForDate = useMemo(() => {
    return (invoices || [])
      .filter(inv => inv.date === invoiceDate || (inv.createdAt && inv.createdAt.split('T')[0] === invoiceDate))
      .sort((a, b) => {
        const numA = parseInt((a.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt((b.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
        if (numA !== numB) return numA - numB;
        return (a.createdAt || '').localeCompare(b.createdAt || '');
      });
  }, [invoices, invoiceDate]);

  const currentInvoiceIndexForDate = useMemo(() => {
    if (!editingPosInvoiceId) return -1;
    return invoicesForDate.findIndex(inv => inv.id === editingPosInvoiceId);
  }, [invoicesForDate, editingPosInvoiceId]);

  const handleNavFirst = () => {
    if (invoicesForDate.length === 0) return;
    loadInvoiceToScreen(invoicesForDate[0]);
    posSound.beep();
  };

  const handleNavPrev = () => {
    if (invoicesForDate.length === 0) return;
    if (currentInvoiceIndexForDate === -1) {
      // إذا كان المستخدم في وضع إدخال فاتورة جديدة، الانتقال للسابق يفتح آخر فاتورة لليوم
      loadInvoiceToScreen(invoicesForDate[invoicesForDate.length - 1]);
    } else {
      const idx = Math.max(0, currentInvoiceIndexForDate - 1);
      loadInvoiceToScreen(invoicesForDate[idx]);
    }
    posSound.beep();
  };

  const handleNavNext = () => {
    if (invoicesForDate.length === 0) return;
    if (currentInvoiceIndexForDate === -1) return;
    if (currentInvoiceIndexForDate < invoicesForDate.length - 1) {
      loadInvoiceToScreen(invoicesForDate[currentInvoiceIndexForDate + 1]);
    } else {
      // عند الوصول لآخر فاتورة اليوم، التالي ينقل المستخدم لإدخال فاتورة جديدة
      handleClearInvoiceDirect(true);
    }
    posSound.beep();
  };

  const handleNavLast = () => {
    if (invoicesForDate.length === 0) return;
    loadInvoiceToScreen(invoicesForDate[invoicesForDate.length - 1]);
    posSound.beep();
  };

  const handleJumpToInvoiceIndex = (index1Based: number) => {
    if (invoicesForDate.length === 0) return;
    const targetIdx = index1Based - 1;
    if (targetIdx >= 0 && targetIdx < invoicesForDate.length) {
      loadInvoiceToScreen(invoicesForDate[targetIdx]);
      posSound.beep();
    } else if (targetIdx >= invoicesForDate.length) {
      handleClearInvoiceDirect(true);
      posSound.beep();
    }
  };

  const handleClearInvoiceDirect = (silent = false) => {
    setEditingPosInvoiceId(null);
    currentEditingInvoiceIdRef.current = null;
    lastLoadedInvoiceIdRef.current = null;
    setTableLines([
      {
        id: generateUniqueLineId(),
        barcode: '',
        itemName: '',
        description: '',
        length: 1,
        width: 1,
        quantity: 1,
        unitPrice: 0,
        total: 0
      }
    ]);
    setAdditionalCharges(0);
    setOverallDiscount(0);
    setInvoiceNotes('');
    setCashAmountInput('0');
    setBankAmountInput('0');

    setInvoiceSeqNumber('');
    try {
      localStorage.removeItem(POS_FULL_DRAFT_KEY);
      localStorage.removeItem('pos_active_draft_lines');
    } catch {}

    setSubCustomerId('');
    setSubCustomerName('');
    setSubCustomerPhone('');
    setCustomCustomerText('');
    setPosTargetType('customer');

    const defaultCashCust = customers.find(c => c.code === 'CUST-0001' || c.code === '1');
    if (defaultCashCust) {
      setSelectedCustomerId(defaultCashCust.id);
      setCustomerName(defaultCashCust.name);
      setCustomerCode(defaultCashCust.code);
    } else {
      setSelectedCustomerId('');
      setCustomerName('زبون نقدي');
      setCustomerCode('');
    }
  };

  // عند فتح شاشة الكاشير دائماً تكون كأنها فاتورة جديدة
  useEffect(() => {
    try {
      localStorage.removeItem(POS_FULL_DRAFT_KEY);
      localStorage.removeItem('pos_active_draft_lines');
    } catch {}

    if (!editingPosInvoiceId && !currentEditingInvoiceIdRef.current) {
      handleClearInvoiceDirect(true);
    }
  }, []);

  // البدء بفاتورة جديدة فوراً وتفريغ الشاشة (جديد Ctrl+N)
  const handleStartNewInvoice = () => {
    handleClearInvoiceDirect(true);
    posSound.beep();
    try {
      localStorage.removeItem(POS_FULL_DRAFT_KEY);
      localStorage.removeItem('pos_active_draft_lines');
      localStorage.removeItem('alnoor_last_focused_element');
    } catch {}
  };



  // Clear / Void Invoice (إلغاء)
  const handleClearInvoice = () => {
    if (confirm(editingPosInvoiceId ? 'هل ترغب في إلغاء التعديل والعودة إلى الكشف؟' : 'هل ترغب في تفريغ بيانات الفاتورة والبدء بفاتورة جديدة؟')) {
      if (editingPosInvoiceId) {
        setEditingPosInvoiceId(null);
      }
      handleClearInvoiceDirect();
      
      try {
        localStorage.removeItem(POS_FULL_DRAFT_KEY);
        localStorage.removeItem('pos_active_draft_lines');
      } catch {}

      const defaultCashCust = customers.find(c => c.code === 'CUST-0001' || c.code === '1');
      if (defaultCashCust && posTargetType === 'customer') {
        setSelectedCustomerId(defaultCashCust.id);
        setCustomerName(defaultCashCust.name);
        setCustomerCode(defaultCashCust.code);
      } else {
        setSelectedCustomerId('');
        setCustomerName('عميل كاشير نقدي');
        setCustomerCode('');
      }

      setSubCustomerId('');
      setSubCustomerName('');
      setSubCustomerPhone('');
      setCustomCustomerText('');
      posSound.beep();
    }
  };

  // Keyboard Shortcuts (Ctrl+S, Alt+C, F2, F9, F10 and custom button shortcuts)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow F5 to refresh page naturally, do not block or hijack it
      if (e.key === 'F5' || e.code === 'F5') {
        return;
      }

      // 1. Dynamic button shortcut check
      const matchingBtn = posButtons.find(
        b => b.isVisible && b.shortcut && matchKeyboardShortcut(e, b.shortcut)
      );
      if (matchingBtn) {
        e.preventDefault();
        e.stopPropagation();
        handleExecuteButtonAction(matchingBtn);
        return;
      }

      // 2. Fallback standard shortcuts
      if ((e.ctrlKey || e.metaKey) && (e.key === 'n' || e.key === 'N' || e.code === 'KeyN' || matchKeyboardShortcut(e, 'Ctrl+N'))) {
        e.preventDefault();
        e.stopPropagation();
        handleStartNewInvoice();
        return;
      } else if (matchKeyboardShortcut(e, 'Ctrl+S')) {
        e.preventDefault();
        e.stopPropagation();
        handleSaveInvoice('none', true);
      } else if (matchKeyboardShortcut(e, 'Alt+C')) {
        e.preventDefault();
        e.stopPropagation();
        const thermalBtn = posButtons.find(b => b.actionType === 'save_and_print' || b.label === 'حراري');
        if (thermalBtn) {
          handleExecuteButtonAction(thermalBtn);
        } else {
          handleSaveInvoice('prompt', true);
        }
      } else if (matchKeyboardShortcut(e, 'Ctrl+Enter')) {
        e.preventDefault();
        e.stopPropagation();
        handleQuickPayCash('thermal-direct');
      } else if (matchKeyboardShortcut(e, 'F2')) {
        e.preventDefault();
        e.stopPropagation();
        handleAddNewRow();
      } else if (matchKeyboardShortcut(e, 'F9')) {
        e.preventDefault();
        e.stopPropagation();
        handleHoldInvoice();
      } else if (matchKeyboardShortcut(e, 'F10')) {
        e.preventDefault();
        e.stopPropagation();
        const thermalBtn = posButtons.find(b => b.actionType === 'save_and_print' || b.label === 'حراري');
        if (thermalBtn) {
          handleExecuteButtonAction(thermalBtn);
        } else {
          handleSaveInvoice('prompt', true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [posButtons, handleSaveInvoice, handleHoldInvoice, handleExecuteButtonAction, handleAddNewRow, handleQuickPayCash, customerName, selectedCustomerId]);

  const isPhone = useIsMobile(768);
  const [forceDesktopMode, setForceDesktopMode] = useState<boolean>(() => {
    return typeof sessionStorage !== 'undefined' && sessionStorage.getItem('pos_force_desktop') === 'true';
  });

  if (isPhone && !forceDesktopMode) {
    return (
      <MobilePosView
        onSwitchToDesktop={() => {
          setForceDesktopMode(true);
          sessionStorage.setItem('pos_force_desktop', 'true');
        }}
      />
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-[#dbe4ef] text-slate-800 text-xs font-sans select-none relative overflow-hidden" dir="rtl">
      {/* Mobile Switch Back Bar */}
      {isPhone && forceDesktopMode && (
        <div className="bg-amber-500 text-slate-950 px-2 py-0.5 text-xs font-bold flex items-center justify-between z-50">
          <span>أنت الآن في وضع سطح المكتب الكامل</span>
          <button
            onClick={() => {
              setForceDesktopMode(false);
              sessionStorage.setItem('pos_force_desktop', 'false');
            }}
            className="bg-slate-900 text-white text-[10px] px-2 py-0.5 rounded-md font-bold"
          >
            📱 العودة لكاشير الهاتف السريع
          </button>
        </div>
      )}
      {/* كاميرا الباركود العائمة (PiP) */}
      <PosInlineBarcodeScanner
        isActive={isInlineCameraOpen}
        inventory={inventory}
        onScan={(code) => {
          handleBarcodeScanned(code);
        }}
        onClose={() => setIsInlineCameraOpen(false)}
        onOpenFullModal={() => {
          setIsInlineCameraOpen(false);
          setIsCameraScannerOpen(true);
        }}
      />
      
      {/* شاشة رقمية للإجمالي */}
      <DraggableDigitalDisplay amount={calculatedTotalAmount} />

      {/* تنبيه: الصنف غير موجود */}
      {barcodeNotFoundAlert && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[200] bg-rose-600 text-white px-5 py-2.5 rounded-xl shadow-2xl flex items-center gap-3 border-2 border-rose-300 animate-bounce">
          <AlertCircle className="w-6 h-6 text-white shrink-0" />
          <div className="text-right">
            <div className="font-black text-sm">الصنف غير موجود</div>
            <div className="text-xs text-rose-100 font-mono font-bold">الباركود: [{barcodeNotFoundAlert}]</div>
          </div>
          <button
            type="button"
            onClick={() => setBarcodeNotFoundAlert(null)}
            className="mr-2 bg-white/20 hover:bg-white/30 text-white text-xs px-1.5 py-0.5 rounded cursor-pointer font-bold"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* ❄️ شريط تجميد الشاشة وحفظ المدخلات عند انقطاع الاتصال (Zero Data Loss Offline Freeze) */}
      {isOfflineFrozen && (
        <div className="bg-gradient-to-r from-amber-600 via-amber-700 to-amber-800 text-white px-4 py-2.5 shadow-xl flex items-center justify-between z-50 border-b-2 border-amber-300">
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-pulse">❄️</span>
            <div>
              <div className="font-black text-sm text-amber-100 flex items-center gap-2">
                <span>الشاشة مجمدة ومحتفظة بكافة المدخلات والأصناف بأمان (وضع عدم الاتصال)</span>
                <span className="bg-amber-950/70 text-amber-200 text-[10px] px-2 py-0.5 rounded-full font-bold">حماية البيانات 100%</span>
              </div>
              <div className="text-[11px] text-amber-200/90 mt-0.5">
                تم إلغاء المزامنة الأوفلاين منعاً لأي فقدان في البيانات. كافة البنود والأسعار والزبون محفوظة على الشاشة ولن يتم تفريغها، وسيتم الحفظ والترحيل تلقائياً فور استعادة الاتصال بالسيرفر.
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleSaveInvoice(offlinePendingPrintMode || 'none')}
              className="bg-white text-amber-900 hover:bg-amber-100 font-black text-xs px-3.5 py-1.5 rounded-lg shadow-md flex items-center gap-1.5 cursor-pointer transition-all active:scale-95"
            >
              <span>🔄</span>
              <span>إعادة محاولة الترحيل الآن</span>
            </button>
          </div>
        </div>
      )}



      {/* ========================================================= */}
      {/* 1. TOP TOOLBAR (شريط الأدوات العلوي) */}
      {/* ========================================================= */}
      <div className="bg-[#1f4a7c] text-white flex flex-col border-b border-[#143254]">
        {/* Navigation & Action Icon Toolbar */}
        {posLayoutConfig.showTopToolbar && (
          <div className="bg-[#eef4fb] text-slate-800 px-2.5 py-1.5 flex items-center justify-between border-b border-slate-300 shadow-2xs flex-nowrap overflow-x-auto gap-1.5 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <div className="flex items-center gap-1.5 flex-nowrap">
              {/* مجموعة أزرار شريط الأدوات العلوي مع أداة التنقل والتعداد التسلسلي المصغرة لفواتير اليوم المحدد */}
              {(() => {
                let toolbarButtons = posButtons
                  .filter(b => b.location === 'top_toolbar' && b.isVisible)
                  .sort((a, b) => a.order - b.order);

                // Ensure 'جديد' (Ctrl+N) is always present directly before 'إلغاء'
                if (!toolbarButtons.some(b => b.actionType === 'new_invoice' || b.id === 'btn_top_new')) {
                  const newBtn: PosCustomButton = {
                    id: 'btn_top_new',
                    label: 'جديد',
                    subLabel: 'فاتورة جديدة',
                    shortcut: 'Ctrl+N',
                    iconName: 'Plus',
                    actionType: 'new_invoice',
                    colorScheme: 'emerald',
                    location: 'top_toolbar',
                    order: 0,
                    isVisible: true
                  };
                  const cancelIdx = toolbarButtons.findIndex(b => b.actionType === 'clear_invoice' || b.id === 'btn_top_cancel');
                  if (cancelIdx >= 0) {
                    toolbarButtons = [
                      ...toolbarButtons.slice(0, cancelIdx),
                      newBtn,
                      ...toolbarButtons.slice(cancelIdx)
                    ];
                  } else {
                    toolbarButtons = [newBtn, ...toolbarButtons];
                  }
                }
                
                const hasNavFirst = toolbarButtons.some(b => b.actionType === 'nav_first');

                return (
                  <>
                    {toolbarButtons.map((btn, idx, arr) => {
                      if (btn.actionType === 'nav_first') {
                        return (
                          <DayInvoicesNavigator
                            key="day-invoices-nav"
                            invoiceDate={invoiceDate}
                            invoicesForDate={invoicesForDate}
                            currentInvoiceIndex={currentInvoiceIndexForDate}
                            onNavFirst={handleNavFirst}
                            onNavPrev={handleNavPrev}
                            onNavNext={handleNavNext}
                            onNavLast={handleNavLast}
                            onJumpToIndex={handleJumpToInvoiceIndex}
                            onNewInvoice={handleStartNewInvoice}
                          />
                        );
                      }
                      // تخطي أزرار التنقل الفردية الأخرى لأنها مدمجة بالكامل في المكون الموحد المصغر
                      if (btn.actionType === 'nav_prev' || btn.actionType === 'nav_next' || btn.actionType === 'nav_last') {
                        return null;
                      }

                      return (
                        <PosCustomButtonRenderer
                          key={btn.id}
                          button={btn}
                          isEditMode={isLiveCustomizing}
                          onExecuteAction={handleExecuteButtonAction}
                          onMoveRight={() => handleMoveButtonInLive(btn.id, 'right')}
                          onMoveLeft={() => handleMoveButtonInLive(btn.id, 'left')}
                          onEdit={() => setIsButtonCustomizerOpen(true)}
                          onDelete={() => handleDeleteButtonInLive(btn.id)}
                          canMoveRight={idx > 0}
                          canMoveLeft={idx < arr.length - 1}
                        />
                      );
                    })}

                    {!hasNavFirst && (
                      <DayInvoicesNavigator
                        key="day-invoices-nav-fallback"
                        invoiceDate={invoiceDate}
                        invoicesForDate={invoicesForDate}
                        currentInvoiceIndex={currentInvoiceIndexForDate}
                        onNavFirst={handleNavFirst}
                        onNavPrev={handleNavPrev}
                        onNavNext={handleNavNext}
                        onNavLast={handleNavLast}
                        onJumpToIndex={handleJumpToInvoiceIndex}
                        onNewInvoice={handleStartNewInvoice}
                      />
                    )}
                  </>
                );
              })()}

              {/* فاصل رأسي خفيف */}
              <span className="w-px h-6 bg-slate-300 mx-1" />

              {/* زر تفاصيل الفاتورة (مرفوع لشريط الأزرار العلوي) */}
              <button
                type="button"
                onClick={handleOpenInvoiceDetailsPreview}
                className="h-8 px-2.5 py-1 bg-white hover:bg-blue-50 border border-blue-300 hover:border-blue-400 text-blue-800 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all whitespace-nowrap active:scale-95"
                title="معاينة وطباعة مسودة الفاتورة لمراجعة البنود والأسعار مع الزبون قبل الحفظ"
              >
                <Printer className="w-3.5 h-3.5 text-blue-600" />
                <span>تفاصيل الفاتورة</span>
              </button>

              {/* زر مسودات فواتير OneDrive / Excel - يفتح الشاشة المخصصة الكاملة */}
              <button
                type="button"
                onClick={() => setActiveTab('excel_drafts')}
                className="h-8 px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white border border-emerald-600 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all whitespace-nowrap active:scale-95"
                title="فتح الشاشة المخصصة لإدارة واستيراد مسودات الفواتير من Excel و OneDrive وتعديلها واعتمادها بالتتابع"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-200" />
                <span>مسودات Excel / OneDrive</span>
              </button>

              {/* زر سجل فواتير اليوم (مرفوع لشريط الأزرار العلوي) */}
              <button
                type="button"
                onClick={() => setIsDailyInvoicesOpen(true)}
                className="h-8 px-2.5 py-1 bg-[#1f4a7c] hover:bg-[#183a62] text-white rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all whitespace-nowrap active:scale-95"
                title="سجل فواتير اليوم وحالاتها (جديدة، قيد التصميم، تنفيذ، جاهزة، مسلمة)"
              >
                <FileText className="w-3.5 h-3.5 text-blue-200" />
                <span>سجل فواتير اليوم</span>
              </button>

              {/* زر مراجعة وسجل فواتير المبيعات */}
              <button
                type="button"
                onClick={() => setIsInvoicesReviewOpen(true)}
                className="h-8 px-2.5 py-1 bg-indigo-700 hover:bg-indigo-800 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all whitespace-nowrap active:scale-95"
                title="مراجعة وسجل كافة فواتير المبيعات السابقة والبحث والطباعة"
              >
                <Search className="w-3.5 h-3.5 text-indigo-200" />
                <span>سجل المبيعات</span>
              </button>

              {/* زر سلة الفواتير المحذوفة */}
              <button
                type="button"
                onClick={() => setIsDeletedInvoicesOpen(true)}
                className="h-8 px-2.5 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all whitespace-nowrap active:scale-95"
                title="سلة فواتير المبيعات المحذوفة - استعراض وتعديل واسترجاع الفواتير المحذوفة فوراً"
              >
                <Trash2 className="w-3.5 h-3.5 text-amber-200" />
                <span>الفواتير المحذوفة</span>
                {(deletedInvoices?.length || 0) > 0 && (
                  <span className="bg-amber-300 text-slate-950 text-[10px] font-black px-1.5 py-0.2 rounded-full font-mono">
                    {deletedInvoices.length}
                  </span>
                )}
              </button>

              {/* زر تخصيص الشاشة ومصمم الواجهة */}
              <button
                type="button"
                onClick={() => setIsLayoutDesignerOpen(true)}
                className="pos-layout-customizer-btn pos-advanced-config h-8 px-2.5 py-1 bg-white hover:bg-indigo-50 border border-indigo-300 hover:border-indigo-400 text-indigo-900 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs transition-all whitespace-nowrap active:scale-95"
                title="تخصيص وإخفاء أو إظهار أقسام وأعمدة شاشة الكاشير"
              >
                <Layout className="w-3.5 h-3.5 text-indigo-600" />
                <span>تخصيص الشاشة 🎨</span>
              </button>

              {isLiveCustomizing && (
                <button
                  type="button"
                  onClick={() => setIsButtonCustomizerOpen(true)}
                  className="h-8 px-2.5 py-1 bg-amber-200 hover:bg-amber-300 text-amber-900 font-bold rounded-lg text-xs border border-dashed border-amber-500 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ زر بالشريط العلوي</span>
                </button>
              )}
            </div>

            {isLiveCustomizing && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleToggleLayoutSection('showTopToolbar')}
                  className="text-[10px] bg-rose-500/80 hover:bg-rose-600 text-white px-1.5 py-0.5 rounded cursor-pointer"
                  title="إخفاء شريط الأدوات العلوي"
                >
                  ✕ إخفاء
                </button>
              </div>
            )}
          </div>
        )}

        {/* Live In-place Customization Mode Alert Banner */}
        {isLiveCustomizing && (
          <div className="bg-amber-100 border-b border-amber-300 px-3 py-2 text-amber-950 text-xs font-bold flex items-center justify-between flex-wrap gap-2 animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="flex h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
              <span>
                وضع تخصيص الشاشة التفاعلي مُفعّل: يمكنك نقل الأزرار بالأسهم، أو النقر على [مصمم الواجهة 🎨] لحذف أو إظهار أي قسم وأعمدة الجدول والدفع.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsLayoutDesignerOpen(true)}
                className="px-2 py-0.5 bg-amber-400 hover:bg-amber-500 text-amber-950 font-black rounded-lg text-xs flex items-center gap-1 cursor-pointer shadow-xs"
              >
                <Layout className="w-3.5 h-3.5" />
                <span>مصمم الشاشة 🎨</span>
              </button>
              <button
                type="button"
                onClick={() => setIsButtonCustomizerOpen(true)}
                className="px-2 py-0.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ إضافة زر مخصص</span>
              </button>
              <button
                type="button"
                onClick={() => setIsLiveCustomizing(false)}
                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs flex items-center gap-1 cursor-pointer shadow-xs"
              >
                <Check className="w-3.5 h-3.5" />
                <span>حفظ وإنهاء التخصيص</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Single-Entry Automated Lifecycle Notification Bar */}
      {lastSavedInvoiceNotice && (
        <div className="mx-2 my-1 bg-slate-900 text-white p-3 px-4 rounded-xl shadow-md border border-slate-700 flex flex-wrap items-center justify-between gap-3 animate-in fade-in duration-200">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold shrink-0">
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold">تم تسجيل وترحيل الفاتورة بنجاح: #{lastSavedInvoiceNotice.invoiceNumber}</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded font-mono font-bold">
                  {lastSavedInvoiceNotice.totalAmount.toLocaleString('ar-SA')} {settings.currency}
                </span>
                <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded">
                  العميل: {lastSavedInvoiceNotice.customerName}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                اكتملت دورة الإدخال الواحد: الفاتورة ← المخزون ← العميل ← الخزينة ← تكلفة المبيعات ← الحسابات ← التقارير
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedInvoiceForLifecycle(lastSavedInvoiceNotice)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <GitBranch className="w-3.5 h-3.5" />
              <span>معاينة مسار الحركة الآلية (7 مراحل)</span>
            </button>
            <button
              onClick={() => setSelectedInvoiceForPrint(lastSavedInvoiceNotice)}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة الفاتورة</span>
            </button>
            <button
              onClick={() => setLastSavedInvoiceNotice(null)}
              className="p-1 hover:bg-slate-800 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
              title="إغلاق التنبيه"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 2. MAIN POS WORKSPACE: FAVORITES SIDEBAR (RIGHT) & INVOICE WORKSPACE (LEFT) */}
      {/* مفضلة الكاشير تمتد لأعلى مقابل رقم الفاتورة */}
      {/* ========================================================= */}
      <div className="flex flex-col flex-1 min-h-0 gap-2 p-2 w-full lg:overflow-hidden overflow-y-auto">
        <div className="flex flex-col lg:flex-row gap-2.5 items-stretch w-full lg:h-full min-h-0">
          
          {isDailyInvoicesOpen && (
            <div className={`shrink-0 w-full ${isDailyInvoicesExpanded ? 'lg:w-[48%] xl:w-[42%] lg:min-w-[560px]' : 'lg:w-[32%] xl:w-[28%] lg:min-w-[400px]'} min-w-[320px] overflow-hidden order-first flex flex-col lg:h-full min-h-[500px] lg:min-h-0 border border-slate-300 rounded-xl shadow-2xs z-10 bg-white transition-all duration-200`}>
              <PosDailyInvoicesSidebar
                isOpen={isDailyInvoicesOpen}
                onClose={() => setIsDailyInvoicesOpen(false)}
                isExpanded={isDailyInvoicesExpanded}
                onToggleExpand={() => setIsDailyInvoicesExpanded(!isDailyInvoicesExpanded)}
                currentCustomerId={selectedCustomerId}
                currentCustomerName={customerName || customCustomerText || ''}
                onSelectInvoiceToLoad={(inv) => {
                  loadInvoiceToScreen(inv);
                }}
                onPrintInvoice={(inv) => {
                  setSelectedInvoiceForPrint(inv);
                }}
                className="w-full h-full"
              />
            </div>
          )}

          {/* المفضلة في الكاشير: قائمة تظهر بالجانب الأيمن وتمتد لأعلى مقابل رقم الفاتورة وعلى كامل الارتفاع */}
          {(posLayoutConfig.showFavoritesSidebar !== false || isLiveCustomizing) && (
            <div className="relative shrink-0 w-full lg:w-80 xl:w-92 order-first flex flex-col lg:h-full min-h-[300px] lg:min-h-0">
              {isLiveCustomizing && (
                <div className="flex items-center justify-between bg-amber-200/95 px-1.5 py-0.5 rounded-lg mb-1 text-[11px] text-amber-950 font-bold border border-amber-300 shadow-2xs">
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-amber-700 fill-amber-700" />
                    <span>مفضلة الكاشير (الممتدة لأعلى)</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => handleToggleLayoutSection('showFavoritesSidebar')}
                    className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-1.5 py-0.5 rounded text-[10px] cursor-pointer"
                    title={posLayoutConfig.showFavoritesSidebar !== false ? 'إخفاء شريط المفضلة' : 'إظهار شريط المفضلة'}
                  >
                    {posLayoutConfig.showFavoritesSidebar !== false ? '✕ إخفاء' : '✓ إظهار'}
                  </button>
                </div>
              )}
              {posLayoutConfig.showFavoritesSidebar !== false ? (
                <PosFavoritesSidebar
                  onSelectItem={handleAddItemToTable}
                  className="w-full flex-1 h-full min-h-0"
                />
              ) : (
                <div className="border-2 border-dashed border-amber-400 bg-amber-50/70 p-4 rounded-xl text-center text-amber-900 text-xs font-bold">
                  (مفضلة الكاشير مخفية حالياً - يمكنك إظهارها من مصمم الشاشة)
                </div>
              )}
            </div>
          )}

          {/* مساحة الفاتورة الرئيسية (يسار المفضلة في واجهة RTL): رأس الفاتورة في الأعلى وجدول الأصناف في الأسفل */}
          <div className="flex-1 min-w-0 flex flex-col gap-1 lg:h-full lg:min-h-0">
            {/* 2A. INVOICE HEADER SECTION (رأس الفاتورة - تفاصيل العميل والفرع ورقم الفاتورة) */}
            {posLayoutConfig.showCustomerHeader && (
              <div className="bg-[#d3dfed] p-1 border border-slate-300 rounded-xl shadow-2xs w-fit">
          {isLiveCustomizing && (
            <div className="flex items-center justify-between bg-amber-200/90 px-2 py-0.5 rounded mb-2 text-xs text-amber-950 font-bold border border-amber-300">
              <span className="flex items-center gap-1.5">
                <Layout className="w-3.5 h-3.5 text-amber-800" />
                <span>قسم رأس الفاتورة والعميل (يمكنك إخفاؤه لزيادة مساحة جدول الكاشير)</span>
              </span>
              <button
                type="button"
                onClick={() => handleToggleLayoutSection('showCustomerHeader')}
                className="bg-rose-600 hover:bg-rose-700 text-white font-bold px-2 py-0.5 rounded text-[11px] cursor-pointer"
                title="إخفاء قسم رأس الفاتورة"
              >
                ✕ إخفاء هذا القسم
              </button>
            </div>
          )}
          {/* Main Top Header System Strip (أعلى شاشة الكاشير): الفرع | المستخدم | رقم الفاتورة | التاريخ | حالة الفاتورة */}
          <div className="bg-white/90 border border-slate-300 rounded-lg p-1 mb-1 shadow-2xs w-fit overflow-hidden">
            <div className="flex flex-nowrap items-center justify-between gap-2.5 text-sm w-fit overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
              
              {/* 1. رقم الفاتورة (تسلسلي موحد غير مكرر لكل حالات الفاتورة يصدر بعد إتمام الحفظ) */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 shrink-0">
                <span className="font-bold text-slate-700 text-[14px] shrink-0">رقم الفاتورة:</span>
                <div
                  className={`bg-blue-600 text-white font-mono font-black text-[14px] px-2.5 py-0.5 rounded shadow-2xs flex items-center gap-1`}
                  title="يتم توليد وإصدار رقم الفاتورة تلقائياً بعد إتمام عملية البيع والحفظ لضمان عدم تكرار الأرقام بين الأجهزة"
                >
                  <Lock className={`w-3.5 h-3.5 text-blue-200`} />
                  <span>
                    {(editingPosInvoiceId && invoices.some(i => i.id === editingPosInvoiceId))
                      ? `#${(invoices.find(i => i.id === editingPosInvoiceId)?.invoiceNumber)}`
                      : 'تلقائي عند الحفظ'}
                  </span>
                </div>
              </div>

              {/* 4. التاريخ (تلقائياً وقت الجهاز المعتمد مع إمكانية تثبيت التاريخ) */}
              <div className={`flex items-center gap-1.5 border rounded-lg px-2 py-0.5 shrink-0 ml-[245px] transition-colors ${
                posLayoutConfig.isDateLocked ? 'bg-amber-50/90 border-amber-400 ring-1 ring-amber-300' : 'bg-slate-50 border-slate-300'
              }`}>
                <Calendar className={`w-4 h-4 shrink-0 ${posLayoutConfig.isDateLocked ? 'text-amber-700' : 'text-emerald-700'}`} />
                <span className="font-bold text-slate-700 text-[14px] shrink-0">التاريخ:</span>
                <DateInput
                  value={invoiceDate}
                  onChange={e => {
                    const newDate = e.target.value;
                    setInvoiceDate(newDate);
                    if (posLayoutConfig.isDateLocked) {
                      const updated = { ...posLayoutConfig, lockedDate: newDate };
                      setPosLayoutConfig(updated);
                      savePosLayoutConfig(updated, currentUser?.id);
                    }
                  }}
                  className="bg-transparent border-none font-mono text-[14px] font-bold text-slate-800 focus:outline-none cursor-pointer w-[102px]"
                  title={
                    posLayoutConfig.isDateLocked
                      ? 'التاريخ مثبت على هذا اليوم لجميع العمليات الجديدة حتى إلغاء التثبيت'
                      : 'تلقائياً يتم استخدام وقت الكمبيوتر أو الهاتف أو التابلت المعتمد'
                  }
                />

                {/* زر التثبيت (أيقونة تك صغيرة لتثبيت التاريخ في كل العمليات أو إلغاء التثبيت) */}
                <button
                  type="button"
                  onClick={() => {
                    const nextLocked = !posLayoutConfig.isDateLocked;
                    const dateToLock = nextLocked ? (invoiceDate || new Date().toISOString().split('T')[0]) : '';
                    if (!nextLocked) {
                      // عند إلغاء التثبيت نعود لتاريخ اليوم الفعلي للجهاز
                      setInvoiceDate(new Date().toISOString().split('T')[0]);
                    }
                    const updated = {
                      ...posLayoutConfig,
                      isDateLocked: nextLocked,
                      lockedDate: dateToLock
                    };
                    setPosLayoutConfig(updated);
                    savePosLayoutConfig(updated, currentUser?.id);
                    posSound.click();
                  }}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-bold cursor-pointer transition-all border ${
                    posLayoutConfig.isDateLocked
                      ? 'bg-amber-600 hover:bg-amber-700 text-white border-amber-700 shadow-2xs'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-600 border-slate-300'
                  }`}
                  title={
                    posLayoutConfig.isDateLocked
                      ? 'التاريخ مثبت حالياً لكل العمليات - انقر لإلغاء التثبيت والعودة لتاريخ الجهاز'
                      : 'انقر لتثبيت هذا التاريخ في كافة الفواتير والعمليات القادمة'
                  }
                >
                  <Check className={`w-3 h-3 ${posLayoutConfig.isDateLocked ? 'text-white stroke-[3]' : 'text-slate-400 stroke-[2]'}`} />
                  <span className="text-[10px] whitespace-nowrap">
                    {posLayoutConfig.isDateLocked ? 'تاريخ مثبت' : 'تثبيت'}
                  </span>
                </button>
              </div>

              {/* 5. حالة الفاتورة (قائمة منسدلة معتمدة وموحدة) */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 shrink-0 ml-0 -mr-[250px]">
                <span className="font-bold text-slate-700 text-[14px] shrink-0">حالة الفاتورة:</span>
                <select
                  value={invoiceWorkflowStatus}
                  onChange={e => {
                    setInvoiceWorkflowStatus(e.target.value as PosInvoiceWorkflowStatus);
                    posSound.click();
                  }}
                  className={`text-[14px] font-black px-2.5 py-0.5 rounded border cursor-pointer focus:outline-none w-[122px] ${
                    getInvoiceWorkflowStatusMeta(invoiceWorkflowStatus).bgColor
                  } ${getInvoiceWorkflowStatusMeta(invoiceWorkflowStatus).color} ${getInvoiceWorkflowStatusMeta(invoiceWorkflowStatus).borderColor}`}
                  title={getInvoiceWorkflowStatusMeta(invoiceWorkflowStatus).description}
                >
                  {WORKFLOW_STATUS_OPTIONS.map(opt => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label} {opt.isAccounting ? '●' : '○'}
                    </option>
                  ))}
                </select>
                {invoiceWorkflowStatus === 'quotation' && (
                  <span className="text-xs bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded border border-amber-300">
                    عرض سعر (غير محاسبي)
                  </span>
                )}
              </div>

              {/* 6. المخزن */}
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2 py-0.5 shrink-0">
                <Package className="w-4 h-4 text-amber-700 shrink-0" />
                <span className="font-bold text-slate-700 text-[14px] shrink-0">المخزن:</span>
                <select
                  value={warehouse}
                  onChange={e => setWarehouse(e.target.value)}
                  className="bg-transparent border-none text-[14px] font-bold text-slate-800 focus:outline-none cursor-pointer"
                  title="اختر المستودع"
                >
                  {warehouses && warehouses.length > 0 ? (
                    warehouses.map(w => (
                      <option key={w.id} value={w.name}>
                        {w.name} ({w.code})
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="المخزن الرئيسي">المخزن الرئيسي</option>
                      <option value="مستودع الخامات">مستودع الخامات</option>
                    </>
                  )}
                </select>
              </div>

              {/* 7. سعر البيع */}
              <div className={`flex items-center gap-1.5 border rounded-lg px-2 py-0.5 shrink-0 -mr-2 ml-[250px] ${
                userPricePolicy.allowedTier !== 'all' 
                  ? 'bg-amber-50/60 border-amber-300' 
                  : 'bg-slate-50 border-slate-300'
              }`}>
                <Tag className="w-4 h-4 text-emerald-700 shrink-0" />
                <span className="font-bold text-slate-700 text-[14px] shrink-0">سعر البيع:</span>
                <select
                  value={pricingTier}
                  disabled={userPricePolicy.allowedTier !== 'all'}
                  onChange={e => {
                    const newTier = e.target.value as 'retail' | 'wholesale' | 'special';
                    setPricingTier(newTier);
                    setTableLines(prev => applyCustomerPricingToLines(effectivePricingCustomerObj, prev, newTier));
                  }}
                  className="bg-transparent border-none text-[14px] font-bold text-emerald-900 focus:outline-none cursor-pointer disabled:opacity-85 disabled:cursor-not-allowed w-[70px]"
                  title={userPricePolicy.allowedTier !== 'all' ? `محدد ومقيد لصلاحية المستخدم (${userPricePolicy.allowedTier})` : 'فئة سعر البيع المعتمدة بالفاتورة'}
                >
                  {(userPricePolicy.allowedTier === 'all' || userPricePolicy.allowedTier === 'price1') && (
                    <option value="retail">سعر بيع</option>
                  )}
                  {(userPricePolicy.allowedTier === 'all' || userPricePolicy.allowedTier === 'price2') && (
                    <option value="wholesale">سعر بيع 1</option>
                  )}
                  {(userPricePolicy.allowedTier === 'all' || userPricePolicy.allowedTier === 'price3') && (
                    <option value="special">سعر بيع 2</option>
                  )}
                </select>
                {userPricePolicy.allowedTier !== 'all' && (
                  <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" title="تم قفل فئة السعر وفق صلاحيات المستخدم" />
                )}
              </div>

            </div>
          </div>

        {/* Customer, Sub-Customer, Balance & Order Options - ALL IN ONE SINGLE ROW */}
        <div className="bg-white/80 px-2 py-0.5 mb-1 rounded-xl border border-slate-300 flex items-center gap-4 flex-wrap text-sm shadow-sm w-[1382px] max-w-full">
          {/* 1. زر تبديل دائري لاختيار الطرف (عميل - مورد - موظف) */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="font-bold text-slate-700 text-[14px] shrink-0">الطرف:</span>
            <button
              type="button"
              onClick={() => {
                const types: ('customer' | 'supplier' | 'employee')[] = ['customer', 'supplier', 'employee'];
                const currentIndex = types.indexOf(posTargetType);
                const newType = types[(currentIndex + 1) % types.length];
                setPosTargetType(newType);
                setSelectedCustomerId('');
                setCustomerCode('');
                setCustomerName(newType === 'customer' ? 'عميل كاشير نقدي' : '');
              }}
              className="bg-blue-50/80 hover:bg-blue-100 border border-blue-300 text-blue-900 rounded-lg px-1.5 py-0.5.5 text-[14px] font-bold focus:ring-2 focus:ring-blue-500 cursor-pointer shadow-xs transition-colors outline-none flex items-center gap-1 select-none min-w-[70px] justify-center"
              title="اضغط للتبديل بين عميل / مورد / موظف"
            >
              <RefreshCw className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>{posTargetType === 'customer' ? 'عميل' : posTargetType === 'supplier' ? 'مورد' : 'موظف'}</span>
            </button>
          </div>

          {/* 2. خانة إدخال وبحث ومطابقة أحرف وإمكانية الإضافة السريعة */}
          <div className="flex items-center gap-2 min-w-[280px] max-w-[400px] flex-1">
            <div className="flex-1 min-w-0 relative group">
              <AutocompleteCombobox
                items={targetComboboxOptions}
                selectedId={selectedCustomerId}
                value={customerName}
                entityType={posTargetType}
                showCode={false}
                clearOnFocus={false}
                inputRef={customerInputRef}
                inputClassName="text-[14px] font-bold h-9 w-[324.631px]"
                placeholder={
                  posTargetType === 'customer'
                    ? 'اكتب اسم العميل للبحث...'
                    : posTargetType === 'supplier'
                    ? 'اكتب اسم المورد للبحث...'
                    : 'اكتب اسم الموظف للبحث...'
                }
                onSelect={opt => {
                  if (!opt.id) {
                    setSelectedCustomerId('');
                    setCustomerName('');
                    setCustomerCode('');
                    setCustomCustomerText('');
                    return;
                  }
                  setSelectedCustomerId(opt.id);
                  setCustomerName(opt.name);
                  setCustomerCode(opt.code || opt.id);
                  const foundParty = opt.raw || parties.find(p => p.id === opt.id);
                  if (posTargetType === 'customer') {
                    setTableLines(prev => applyCustomerPricingToLines(foundParty, prev));
                  }
                  // Reset sub-customer
                  setSubCustomerId('');
                  setSubCustomerName('');
                  setSubCustomerPhone('');
                  setCustomCustomerText('');
                }}
                onChangeText={name => {
                  setCustomerName(name);
                  if (!name.trim()) {
                    setSelectedCustomerId('');
                    setCustomerCode('');
                  }
                }}
                onQuickAdd={async name => {
                  // No-op if they try to add from combobox directly, we use the + button now.
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setIsAddPartyModalOpen(true)}
              className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm shrink-0 cursor-pointer transition-colors"
              title={
                posTargetType === 'customer'
                  ? 'فتح شاشة إضافة عميل جديد'
                  : posTargetType === 'supplier'
                  ? 'فتح شاشة إضافة مورد جديد'
                  : 'فتح شاشة إضافة موظف جديد'
              }
            >
              <Plus className="w-[14.5px] h-[17.5px] ml-[1px] pr-[-5px] -mr-[9px] -ml-[2px] pl-[-1px] pt-[-7px]" />
            </button>
            {selectedCustomerId && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    if (posTargetType === 'employee') {
                      const emp = employees.find(e => e.id === selectedCustomerId);
                      if (emp) setSelectedEmployeeForStatement(emp);
                    } else {
                      const p = parties.find(pt => pt.id === selectedCustomerId);
                      if (p) setSelectedPartyForStatement(p);
                    }
                  }}
                  title="كشف حساب"
                  className="p-1.5 bg-slate-100 hover:bg-slate-200 border border-slate-300 text-blue-700 rounded-lg cursor-pointer shrink-0 transition-colors"
                >
                  <Search className="w-[16.2437px] h-[19.2437px] pl-[3px] ml-[6px]" />
                </button>
                {currentCustomer && (
                  <button
                    type="button"
                    onClick={() => {
                      setPartyToEditInPos(currentCustomer);
                      setIsAddPartyModalOpen(true);
                    }}
                    title="تعديل بيانات العميل الحالي"
                    className="p-1.5 bg-blue-50 hover:bg-blue-100 border border-blue-300 text-blue-700 rounded-lg cursor-pointer shrink-0 transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </>
            )}
          </div>

          {/* 3. العميل الفرعي */}
          <div className="flex items-center gap-2 min-w-[240px] max-w-[350px] flex-1">
            <span className="font-bold text-slate-700 text-[14px] shrink-0">الفرعي:</span>
            <div className="flex-1 min-w-0 flex items-center gap-2">
              <SubCustomerField
                compact={false}
                parentCustomerId={selectedCustomerId}
                parentCustomerName={customerName}
                parties={parties}
                customCustomerText={customCustomerText}
                onChangeCustomText={setCustomCustomerText}
                subCustomerId={subCustomerId}
                onSelectSubCustomer={sub => {
                  if (sub) {
                    setSubCustomerId(sub.id);
                    setSubCustomerName(sub.name);
                    setSubCustomerPhone(sub.phone || '');
                    setTableLines(prev => applyCustomerPricingToLines(sub, prev));
                  } else {
                    setSubCustomerId('');
                    // Revert to main customer pricing
                    const mainCust = parties.find(p => p.id === selectedCustomerId);
                    setTableLines(prev => applyCustomerPricingToLines(mainCust, prev));
                  }
                }}
                subCustomerName={subCustomerName}
                onChangeSubCustomerName={setSubCustomerName}
                subCustomerPhone={subCustomerPhone}
                onChangeSubCustomerPhone={setSubCustomerPhone}
                onOpenSubCustomerStatement={sub => {
                  setSelectedPartyForStatement(sub);
                }}
                onSelectMainCustomer={cust => {
                  setSelectedCustomerId(cust.id);
                  setCustomerName(cust.name);
                  setCustomerCode(cust.code || cust.id);
                  setTableLines(prev => applyCustomerPricingToLines(cust, prev));
                  setCustomCustomerText('');
                  setSubCustomerId('');
                  setSubCustomerName('');
                  setSubCustomerPhone('');
                }}
                onQuickAddSub={(name, phone) => {
                    if (!selectedCustomerId) {
                        return; // Needs a parent
                    }
                    const createdSub = addParty({
                        name: name,
                        type: 'customer',
                        phone: phone || '',
                        isSubCustomer: true,
                        parentCustomerId: selectedCustomerId,
                        parentCustomerName: customerName,
                        initialBalance: 0
                    });
                    setSubCustomerId(createdSub.id);
                    setSubCustomerName(createdSub.name);
                    setSubCustomerPhone(createdSub.phone || '');
                    setTableLines(prev => applyCustomerPricingToLines(createdSub, prev));
                }}
              />
              <button
                type="button"
                onClick={() => {
                  setIsAddPartyModalOpen(true);
                }}
                className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-sm shrink-0 cursor-pointer transition-colors"
                title="فتح شاشة إضافة عميل جديد"
              >
                <Plus className="w-[14.5px] h-[17.5px] ml-[1px] pr-[-5px] -mr-[9px] -ml-[2px] pl-[-1px] pt-[-7px]" />
              </button>
            </div>
          </div>

          {/* 4. الرصيد الفعلي المطابق 100% لكشف الحساب */}
          <div 
            className={`flex items-center gap-2 px-2.5 py-1 rounded-lg shrink-0 shadow-2xs border transition-colors whitespace-nowrap w-auto min-w-[280px] ${
              activeTargetBalanceInfo.isCredit 
                ? 'bg-emerald-50 border-emerald-200' 
                : 'bg-red-50 border-red-200'
            }`}
            title={`الرصيد الفعلي المطابق لكشف الحساب: ${activeTargetBalanceInfo.balance.toFixed(2)} ₪ ${activeTargetBalanceInfo.statusText}`}
          >
            <span className={`text-[14px] font-bold shrink-0 whitespace-nowrap ${
              activeTargetBalanceInfo.isCredit ? 'text-emerald-700' : 'text-red-600'
            }`}>
              {activeTargetBalanceInfo.label}
            </span>
            <span className={`font-mono font-black text-[14px] sm:text-base shrink-0 whitespace-nowrap text-center px-1 ${
              activeTargetBalanceInfo.isCredit ? 'text-emerald-700' : 'text-red-600'
            }`}>
              {activeTargetBalanceInfo.formattedBalance} ₪
            </span>
            {activeTargetBalanceInfo.hasTarget && activeTargetBalanceInfo.statusText && (
              <span className={`text-[11px] font-bold px-2 py-0.5 pt-[1.75px] pb-[2.75px] ml-[2px] mr-[52px] rounded shrink-0 whitespace-nowrap text-center ${
                activeTargetBalanceInfo.isCredit 
                  ? 'bg-emerald-100 text-emerald-800' 
                  : 'bg-red-100/90 text-red-700'
              }`}>
                {activeTargetBalanceInfo.statusText}
              </span>
            )}
            {subCustomerId && (
              <button
                type="button"
                onClick={() => {
                  const sub = parties.find(p => p.id === subCustomerId);
                  if (sub) setSelectedPartyForStatement(sub);
                }}
                className="text-xs bg-red-600 hover:bg-red-700 text-white px-2 py-0.5 rounded font-bold cursor-pointer transition-colors shrink-0 whitespace-nowrap"
                title="كشف حساب الزبون الفرعي"
              >
                كشف
              </button>
            )}
          </div>
        </div>

        {/* Sub-tools Toolbar Row: ملاحظات الفاتورة | خدمة التوصيل | يد الباركود | سطر الباركود | كاميرا الباركود | تجميع الكميات | آخر سعر | الأسعار الخاصة */}
        {posLayoutConfig.showExtraHeaderOptions && (
          <div className="mt-0.5 pt-0.5 border-t border-slate-300/80 flex flex-nowrap overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] items-center justify-between gap-2 text-sm w-fit">
            <div className="flex items-center gap-2 flex-nowrap flex-1 min-w-0 w-[1379.97px]">
              {/* خانة ملاحظات الفاتورة ككل (تظهر في كشف حساب العميل) */}
              <div
                className="flex items-center gap-2 bg-white border border-slate-300 hover:border-blue-400 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-400 rounded-xl px-3 py-1.5 transition-all shadow-sm w-[620.987px] max-w-full"
                title="ملاحظة عامة خاصة بالفاتورة ككل وتظهر في كشف حساب العميل"
              >
                <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                <input
                  type="text"
                  value={invoiceNotes}
                  onChange={e => setInvoiceNotes(e.target.value)}
                  placeholder="ملاحظات الفاتورة (تظهر في كشف الحساب)..."
                  className="w-[620.987px] max-w-full text-[14px] text-slate-800 placeholder:text-slate-400 focus:outline-hidden bg-transparent font-medium h-7"
                />
                {invoiceNotes && (
                  <button
                    type="button"
                    onClick={() => setInvoiceNotes('')}
                    className="text-slate-400 hover:text-rose-600 text-[14px] font-bold px-1.5 cursor-pointer shrink-0 transition-colors"
                    title="مسح الملاحظة"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* زر خدمة توصيل (تنزل تلقائي كصنف يحدد له ملاحظات وسعر فقط) */}
              <button
                type="button"
                onClick={handleAddDeliveryServiceLine}
                className="px-1.5 py-0.5.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-[14px] cursor-pointer shadow-xs flex items-center gap-1.5 transition-colors shrink-0"
                title="إضافة خدمة توصيل تلقائياً كصنف في الفاتورة لتحديد الملاحظات والسعر"
              >
                <Truck className="w-4 h-4 text-emerald-100" />
                <span>+ خدمة توصيل</span>
              </button>

              <span className="w-px h-5 bg-slate-300 mx-0.5 shrink-0 hidden sm:block" />

              {/* سطر الباركود - خانة الباركود (تم تكبيرها بالعرض) */}
              <div className="relative w-[551px] shrink-0">
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={quickBarcodeVal}
                  onChange={e => {
                    setQuickBarcodeVal(e.target.value);
                    resetInactivityTimer();
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && quickBarcodeVal.trim()) {
                      e.preventDefault();
                      handleBarcodeScanned(quickBarcodeVal);
                      setQuickBarcodeVal('');
                    }
                  }}
                  placeholder="باركود..."
                  className="w-full pl-8 pr-2.5 py-1 text-[14px] bg-white border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono shadow-inner text-center font-bold h-[35px]"
                  title="اكتب أو امسح الباركود ثم اضغط Enter"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (barcodeInputRef.current) {
                      barcodeInputRef.current.focus();
                      barcodeInputRef.current.select();
                    }
                  }}
                  className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-blue-600 p-0.5 cursor-pointer"
                  title="رمز الباركود - انقر للتركيز"
                >
                  <Barcode className="w-4 h-4" />
                </button>
              </div>

              {/* كاميرا الباركود (فقط لوقو كاميرا) */}
              <button
                type="button"
                onClick={() => setIsInlineCameraOpen(prev => !prev)}
                className={`p-2 rounded-lg border flex items-center justify-center cursor-pointer transition-all shrink-0 ${
                  isInlineCameraOpen
                    ? 'bg-blue-600 text-white border-blue-700 shadow-inner ring-2 ring-blue-300'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100 hover:border-blue-400 shadow-2xs'
                }`}
                title={isInlineCameraOpen ? 'إيقاف كاميرا الباركود' : 'تشغيل كاميرا الباركود'}
              >
                <Camera className={`w-5 h-5 ${isInlineCameraOpen ? 'text-emerald-300 animate-pulse' : 'text-blue-600'}`} />
                {isInlineCameraOpen && <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping mr-1" />}
              </button>

              {/* تجميع الكميات */}
              <label className="pos-advanced-config flex items-center gap-1.5 cursor-pointer shrink-0 text-[14px] text-slate-700 font-bold bg-white hover:bg-slate-50 px-1.5 py-0.5 rounded-lg border border-slate-300 select-none shadow-2xs transition-colors ml-2">
                <input
                  type="checkbox"
                  checked={aggregateDuplicateItems}
                  onChange={e => setAggregateDuplicateItems(e.target.checked)}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                />
                <span>تجميع الكميات</span>
              </label>

              {/* استخدام آخر سعر */}
              <label
                className={`pos-advanced-config flex items-center gap-1.5 shrink-0 text-[14px] font-bold px-1.5 py-0.5 rounded-lg border select-none shadow-2xs transition-colors ${
                  isCashCustomer
                    ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-300 cursor-pointer'
                }`}
                title={isCashCustomer ? 'الزبون النقدي يندرج تحته عدة زبائن ولا يُطبق عليه آخر سعر أو أسعار خاصة' : 'استخدام آخر سعر بيع مسجل لهذا العميل إن وُجد'}
              >
                <input
                  type="checkbox"
                  disabled={isCashCustomer}
                  checked={!isCashCustomer && useLastCustomerPrice}
                  onChange={e => {
                    if (!isCashCustomer) {
                      const willUse = e.target.checked;
                      setUseLastCustomerPrice(willUse);
                      if (effectivePricingCustomerObj) {
                        setTableLines(prev => applyCustomerPricingToLines(effectivePricingCustomerObj, prev, undefined, willUse));
                      }
                    }
                  }}
                  className="rounded text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer disabled:cursor-not-allowed"
                />
                <span>استخدام آخر سعر</span>
              </label>

              {/* Special Prices Button for current customer (never for cash customer) */}
              {effectivePricingCustomerId && !isCashCustomer && (
                <button
                  type="button"
                  onClick={() => setIsSpecialPricesModalOpen(true)}
                  className="pos-advanced-config px-1.5 py-0.5 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 rounded-lg font-bold text-[14px] cursor-pointer shadow-2xs flex items-center gap-1 shrink-0"
                  title="تحديد أو تعديل الأسعار الخاصة لهذا العميل"
                >
                  <DollarSign className="w-4 h-4 text-amber-700" />
                  <span>الأسعار الخاصة</span>
                </button>
              )}
            </div>

            {isLiveCustomizing && (
              <button
                type="button"
                onClick={() => handleToggleLayoutSection('showExtraHeaderOptions')}
                className="text-[10px] bg-rose-500 hover:bg-rose-600 text-white px-1.5 py-0.5 rounded cursor-pointer"
                title="إخفاء شريط خيارات الرأس الإضافية"
              >
                ✕ إخفاء الشريط
              </button>
            )}
          </div>
        )}
      </div>
      )}

            {/* ========================================================= */}
            {/* 3. MAIN WORKSPACE: LEFT ACTION PANEL + CENTER ITEMS TABLE */}
            {/* ========================================================= */}
            <div className="flex-1 flex flex-col md:flex-row gap-2 overflow-hidden items-stretch">
              {/* ========================================================= */}
              {/* 3B. CENTER ITEMS TABLE (جدول أصناف الفاتورة بالمطابع) */}
              {/* ========================================================= */}
              <div className="flex-1 min-h-0 flex flex-col bg-white overflow-hidden border border-slate-400 rounded-none shadow-none pos-table-container">
          {/* The Data Table */}
          <div className="flex-1 overflow-x-auto overflow-y-auto min-h-0 w-full relative">
            <table
              className="w-full text-right border-collapse text-xs pos-table-grid"
              style={{
                tableLayout: 'fixed',
                minWidth: `${totalVisibleColsWidth}px`
              }}
            >
              {/* Colgroup defining each column's exact width for Excel-like resizing */}
              <colgroup>
                {posLayoutConfig.tableColumns.showIndex && (
                  <col style={{ width: `${columnWidths.index || DEFAULT_POS_COLUMN_WIDTHS.index}px` }} />
                )}
                {posLayoutConfig.tableColumns.showItemCode && (
                  <col style={{ width: `${columnWidths.itemCode || DEFAULT_POS_COLUMN_WIDTHS.itemCode}px` }} />
                )}
                <col style={{ width: `${columnWidths.itemName || DEFAULT_POS_COLUMN_WIDTHS.itemName}px` }} />
                {posLayoutConfig.tableColumns.showImageThumbnail && (
                  <col style={{ width: `${columnWidths.imageThumbnail || DEFAULT_POS_COLUMN_WIDTHS.imageThumbnail}px` }} />
                )}
                {posLayoutConfig.tableColumns.showNotes && (
                  <col style={{ width: `${columnWidths.notes || DEFAULT_POS_COLUMN_WIDTHS.notes}px` }} />
                )}
                {posLayoutConfig.tableColumns.showDimensions && (
                  <>
                    <col style={{ width: `${columnWidths.length || DEFAULT_POS_COLUMN_WIDTHS.length}px` }} />
                    <col style={{ width: `${columnWidths.width || DEFAULT_POS_COLUMN_WIDTHS.width}px` }} />
                  </>
                )}
                {posLayoutConfig.tableColumns.showCount && (
                  <col style={{ width: `${columnWidths.count || DEFAULT_POS_COLUMN_WIDTHS.count}px` }} />
                )}
                {posLayoutConfig.tableColumns.showQuantity && (
                  <col style={{ width: `${columnWidths.quantity || DEFAULT_POS_COLUMN_WIDTHS.quantity}px` }} />
                )}
                {posLayoutConfig.tableColumns.showUnit && (
                  <col style={{ width: `${columnWidths.unit || DEFAULT_POS_COLUMN_WIDTHS.unit}px` }} />
                )}
                {posLayoutConfig.tableColumns.showUnitPrice && (
                  <col style={{ width: `${columnWidths.unitPrice || DEFAULT_POS_COLUMN_WIDTHS.unitPrice}px` }} />
                )}
                {posLayoutConfig.tableColumns.showDiscount && (
                  <col style={{ width: `${columnWidths.discount || DEFAULT_POS_COLUMN_WIDTHS.discount}px` }} />
                )}
                {posLayoutConfig.tableColumns.showTax && (
                  <col style={{ width: `${columnWidths.tax || DEFAULT_POS_COLUMN_WIDTHS.tax}px` }} />
                )}
                <col style={{ width: `${columnWidths.total || DEFAULT_POS_COLUMN_WIDTHS.total}px` }} />
                {posLayoutConfig.tableColumns.showAttachments && (
                  <col style={{ width: `${columnWidths.attachments || DEFAULT_POS_COLUMN_WIDTHS.attachments}px` }} />
                )}
                {posLayoutConfig.tableColumns.showDeleteButton && (
                  <col style={{ width: `${columnWidths.delete || DEFAULT_POS_COLUMN_WIDTHS.delete}px` }} />
                )}
                {/* Trailing flexible filler col for wide displays */}
                <col />
              </colgroup>

              {/* Table Header matching user specifications with Excel-like mouse drag column resize handles */}
              <thead className="bg-[#b3cbe3] text-slate-900 font-bold border-b border-slate-400 sticky top-0 z-10 select-none">
                <tr>
                  {posLayoutConfig.tableColumns.showIndex !== false && (
                    <th
                      style={{ width: `${columnWidths.index || DEFAULT_POS_COLUMN_WIDTHS.index}px` }}
                      className="relative py-1.5 px-1 text-center border-l border-b border-slate-400 group/th"
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        <span className="font-bold text-slate-900">م</span>
                        <button
                          type="button"
                          onClick={handleResetAllColumns}
                          className="opacity-0 group-hover/th:opacity-100 hover:text-blue-700 transition-opacity p-0.5 rounded cursor-pointer"
                          title="استعادة عرض كافة الأعمدة للافتراضي"
                        >
                          <RotateCcw className="w-2.5 h-2.5 text-slate-500 hover:text-blue-600" />
                        </button>
                      </div>
                      {renderResizeHandle('index')}
                    </th>
                  )}
                  {/* رقم الصنف */}
                  {posLayoutConfig.tableColumns.showItemCode && (
                    <th
                      style={{ width: `${columnWidths.itemCode || DEFAULT_POS_COLUMN_WIDTHS.itemCode}px` }}
                      className="relative py-1.5 px-2 text-center border-l border-b border-slate-400 group/th"
                    >
                      <div className="truncate">رقم الصنف</div>
                      {renderResizeHandle('itemCode')}
                    </th>
                  )}
                  {/* 1. الصنف */}
                  <th
                    style={{ width: `${columnWidths.itemName || DEFAULT_POS_COLUMN_WIDTHS.itemName}px` }}
                    className="relative py-1.5 px-2 text-right border-l border-b border-slate-400 group/th"
                  >
                    <div className="truncate">الصنف</div>
                    {renderResizeHandle('itemName')}
                  </th>
                  {/* صورة البند */}
                  {posLayoutConfig.tableColumns.showImageThumbnail && (
                    <th
                      style={{ width: `${columnWidths.imageThumbnail || DEFAULT_POS_COLUMN_WIDTHS.imageThumbnail}px` }}
                      className="relative py-1.5 px-1 text-center border-l border-b border-slate-400 group/th"
                    >
                      <div className="truncate">صورة</div>
                      {renderResizeHandle('imageThumbnail')}
                    </th>
                  )}
                  {/* 3. البيان / الملاحظات */}
                  {posLayoutConfig.tableColumns.showNotes && (
                    <th
                      style={{ width: `${columnWidths.notes || DEFAULT_POS_COLUMN_WIDTHS.notes}px` }}
                      className="relative py-1.5 px-2 text-right border-l border-b border-slate-400 group/th"
                    >
                      <div className="truncate">البيان / الملاحظات</div>
                      {renderResizeHandle('notes')}
                    </th>
                  )}
                  {/* 4 & 5. الطول والعرض */}
                  {posLayoutConfig.tableColumns.showDimensions && (
                    <>
                      <th
                        style={{ width: `${columnWidths.length || DEFAULT_POS_COLUMN_WIDTHS.length}px` }}
                        className="relative py-1.5 px-1 text-center border-l border-b border-slate-400 group/th"
                      >
                        <div className="truncate">الطول</div>
                        {renderResizeHandle('length')}
                      </th>
                      <th
                        style={{ width: `${columnWidths.width || DEFAULT_POS_COLUMN_WIDTHS.width}px` }}
                        className="relative py-1.5 px-1 text-center border-l border-b border-slate-400 group/th"
                      >
                        <div className="truncate">العرض</div>
                        {renderResizeHandle('width')}
                      </th>
                    </>
                  )}
                  {/* 6. العدد */}
                  {posLayoutConfig.tableColumns.showCount && (
                    <th
                      style={{ width: `${columnWidths.count || DEFAULT_POS_COLUMN_WIDTHS.count}px` }}
                      className="relative py-1.5 px-1 text-center border-l border-b border-slate-400 group/th"
                    >
                      <div className="truncate">العدد</div>
                      {renderResizeHandle('count')}
                    </th>
                  )}
                  {/* 7. الكمية */}
                  {posLayoutConfig.tableColumns.showQuantity && (
                    <th
                      style={{ width: `${columnWidths.quantity || DEFAULT_POS_COLUMN_WIDTHS.quantity}px` }}
                      className="relative py-1.5 px-1 text-center border-l border-b border-slate-400 group/th"
                    >
                      <div className="truncate">الكمية</div>
                      {renderResizeHandle('quantity')}
                    </th>
                  )}
                  {/* 8. الوحدة */}
                  {posLayoutConfig.tableColumns.showUnit && (
                    <th
                      style={{ width: `${columnWidths.unit || DEFAULT_POS_COLUMN_WIDTHS.unit}px` }}
                      className="relative py-1.5 px-1 text-center border-l border-b border-slate-400 group/th"
                    >
                      <div className="truncate">الوحدة</div>
                      {renderResizeHandle('unit')}
                    </th>
                  )}
                  {/* 9. السعر */}
                  {posLayoutConfig.tableColumns.showUnitPrice && (
                    <th
                      style={{ width: `${columnWidths.unitPrice || DEFAULT_POS_COLUMN_WIDTHS.unitPrice}px` }}
                      className="relative py-1.5 px-2 text-left border-l border-b border-slate-400 group/th"
                    >
                      <div className="truncate">السعر</div>
                      {renderResizeHandle('unitPrice')}
                    </th>
                  )}
                  {/* 10. الخصم */}
                  {posLayoutConfig.tableColumns.showDiscount && (
                    <th
                      style={{ width: `${columnWidths.discount || DEFAULT_POS_COLUMN_WIDTHS.discount}px` }}
                      className="relative py-1.5 px-1.5 text-left border-l border-b border-slate-400 group/th"
                    >
                      <div className="truncate">الخصم</div>
                      {renderResizeHandle('discount')}
                    </th>
                  )}
                  {/* 11. الضريبة */}
                  {posLayoutConfig.tableColumns.showTax && (
                    <th
                      style={{ width: `${columnWidths.tax || DEFAULT_POS_COLUMN_WIDTHS.tax}px` }}
                      className="relative py-1.5 px-1.5 text-left border-l border-b border-slate-400 group/th"
                    >
                      <div className="truncate">الضريبة</div>
                      {renderResizeHandle('tax')}
                    </th>
                  )}
                  {/* 12. الإجمالي */}
                  <th
                    style={{ width: `${columnWidths.total || DEFAULT_POS_COLUMN_WIDTHS.total}px` }}
                    className="relative py-1.5 px-2 text-left border-l border-b border-slate-400 group/th"
                  >
                    <div className="truncate">الإجمالي</div>
                    {renderResizeHandle('total')}
                  </th>
                  {/* 13. المرفقات */}
                  {posLayoutConfig.tableColumns.showAttachments && (
                    <th
                      style={{ width: `${columnWidths.attachments || DEFAULT_POS_COLUMN_WIDTHS.attachments}px` }}
                      className="relative py-1.5 px-1 text-center border-l border-b border-slate-400 group/th"
                    >
                      <div className="flex items-center justify-center gap-1 truncate">
                        <Paperclip className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>مرفق</span>
                      </div>
                      {renderResizeHandle('attachments')}
                    </th>
                  )}
                  {/* 14. حذف */}
                  {posLayoutConfig.tableColumns.showDeleteButton && (
                    <th
                      style={{ width: `${columnWidths.delete || DEFAULT_POS_COLUMN_WIDTHS.delete}px` }}
                      className="relative py-1.5 px-1 text-center border-l border-b border-slate-400 group/th"
                    >
                      <div className="truncate">حذف</div>
                      {renderResizeHandle('delete')}
                    </th>
                  )}
                  {/* Filler column header to cleanly expand on wide displays */}
                  <th className="p-0 border-b border-slate-400 bg-linear-to-b from-[#edf3f9] to-[#cbdceb]" />
                </tr>
              </thead>

              <tbody 
                className="divide-y divide-slate-200 font-sans"
                onKeyDown={(e) => {
                  if (e.key === 'Tab' && !e.shiftKey) {
                    const target = e.target as HTMLElement;
                    const rows = Array.from(e.currentTarget.querySelectorAll('tr'));
                    const firstRow = rows[0] as HTMLTableRowElement | undefined;
                    
                    if (firstRow && firstRow.contains(target)) {
                      const focusableElements = Array.from(firstRow.querySelectorAll('button:not([disabled]), [href], input:not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')) as HTMLElement[];
                      const lastFocusable = focusableElements[focusableElements.length - 1];
                      
                      if (target === lastFocusable || target.closest('td:last-child')) {
                        e.preventDefault();
                        const newRowId = handleAddNewRow();
                        setTimeout(() => {
                          if (isBarcodeHandMode) {
                            const barcodeInput = document.getElementById(`barcode-input-${newRowId}`);
                            if (barcodeInput) barcodeInput.focus();
                          } else {
                            const itemInput = document.getElementById(`item-input-${newRowId}`);
                            if (itemInput) itemInput.focus();
                          }
                        }, 100);
                      }
                    }
                  }
                }}
              >
                {[...tableLines].reverse().map((line, idx) => {
                  const isActive = activeRowId === line.id;
                  const isLineSqMeter = isSquareMeterUnit(line.unit);
                  const entryIndex = tableLines.findIndex(l => l.id === line.id);
                  const serialIndex = entryIndex !== -1 ? entryIndex + 1 : (tableLines.length - idx);

                  return (
                    <tr
                      key={`pos-line-${line.id || idx}-${idx}`}
                      onClick={() => setActiveRowId(line.id)}
                      className={`transition-colors ${
                        isActive ? 'bg-[#ebf4ff] font-semibold active-row' : 'hover:bg-slate-50'
                      }`}
                    >
                      {/* Row Index - الترقيم المسلسل بناءً على الترتيب الأصلي لإدخال الفاتورة على الكاشير */}
                      {posLayoutConfig.tableColumns.showIndex !== false && (
                        <td
                          className="p-1 text-center font-mono text-slate-800 border-l border-b border-slate-300 bg-slate-100/80 font-black select-none"
                          title={`البند رقم ${serialIndex} حسب ترتيب الإدخال`}
                        >
                          {serialIndex}
                        </td>
                      )}

                      {/* رقم الصنف - Item Code */}
                      {posLayoutConfig.tableColumns.showItemCode && (
                        <td className="p-0 border-l border-b border-slate-300">
                          {line.inventoryItemId === 'srv-delivery' || line.itemName === 'خدمة توصيل' ? (
                            <div className="px-1 text-center font-mono text-[11px] font-bold text-emerald-700 bg-emerald-50/50 py-1 select-none">
                              DLV
                            </div>
                          ) : line.inventoryItemId ? (
                            // صنف معتمد ومختار: عرض رقم الصنف مغلقاً تماماً كعنصر ثابت غير قابل للفوكس أو حركة المؤشر إليه
                            <div
                              tabIndex={-1}
                              className="relative flex items-center justify-center h-full px-1 py-1 font-mono text-xs font-black text-blue-950 bg-slate-100/90 border border-slate-300/80 rounded select-none cursor-default mx-0.5 pointer-events-none"
                              title={`رقم الصنف المعتمد: ${line.itemCode || ''} (مغلق للتعديل - يعتمد تلقائياً عند اختيار الصنف ولا يتغير إلا باختيار صنف آخر من عمود الصنف)`}
                            >
                              <Lock className="w-3 h-3 text-slate-400 absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                              <span className="truncate pl-3">{line.itemCode || '—'}</span>
                            </div>
                          ) : (
                            // صنف لم يتم اختياره بعد: حقل إدخال للبحث برقم الصنف
                            <div className="relative flex items-center h-full px-1">
                              <input
                                id={`item-code-input-${line.id}`}
                                type="text"
                                value={line.itemCode || ''}
                                onChange={e => {
                                  handleUpdateLine(line.id, 'itemCode', e.target.value);
                                }}
                                onBlur={e => {
                                  handleItemCodeChangeInRow(line.id, e.target.value);
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    handleItemCodeChangeInRow(line.id, (e.target as HTMLInputElement).value);
                                    const nextInput = document.getElementById(`item-input-${line.id}`) || document.getElementById(`notes-input-${line.id}`);
                                    if (nextInput) nextInput.focus();
                                  }
                                }}
                                placeholder="رقم الصنف"
                                className={`w-full text-center font-mono text-xs font-bold py-1 px-1 rounded transition-colors focus:outline-hidden ${
                                  line.itemCode
                                    ? 'text-blue-700 bg-blue-50/40 font-black focus:ring-1 focus:ring-blue-500'
                                    : line.itemName?.trim()
                                    ? 'text-rose-600 bg-rose-50 border border-rose-300 placeholder-rose-400 font-semibold focus:ring-1 focus:ring-rose-500'
                                    : 'text-slate-700 bg-transparent placeholder-slate-400 hover:bg-slate-100/60 focus:ring-1 focus:ring-blue-500'
                                }`}
                                title={
                                  line.itemName?.trim()
                                    ? '⚠️ تحذير: هذا البند غير معتمد مخزنياً لأنه لا يندرج تحت رقم صنف! اختر الصنف من القائمة.'
                                    : 'أدخل رقم الصنف أو اختر الصنف من عمود الصنف'
                                }
                              />
                              {line.itemName?.trim() && !line.itemCode && (
                                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-rose-500 animate-pulse pointer-events-none" title="غير معتمد - يلزم رقم صنف" />
                              )}
                            </div>
                          )}
                        </td>
                      )}

                      {/* 1. الصنف - Item Name with autocomplete + dimension toggle badge */}
                      <td className="p-0 border-l border-b border-slate-300">
                        {line.inventoryItemId === 'srv-delivery' || line.itemName === 'خدمة توصيل' ? (
                          <div className="flex items-center gap-1.5 px-2 py-1 bg-emerald-50 text-emerald-900 font-bold text-xs">
                            <Truck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>خدمة توصيل</span>
                            <span className="text-[10px] text-emerald-700 bg-emerald-100 px-1 py-0.5 rounded font-normal mr-auto">
                              (خدمة بلا مخزن - بالتكلفة الأصلية)
                            </span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 px-1">
                            <div className="flex-1">
                              <ItemAutocompleteInput
                                value={line.itemName}
                                lineId={line.id}
                                inventoryItemId={line.inventoryItemId}
                                barcode={line.barcode}
                                inventory={inventory}
                                pricingTier={pricingTier}
                                currency={settings.currency}
                                isActiveRow={isActive}
                                onChangeText={text => handleUpdateLine(line.id, 'itemName', text)}
                                onSelectItem={item => {
                                  handleSelectItemForLine(line.id, item);
                                  setTimeout(() => {
                                    const notesInput = document.getElementById(`notes-input-${line.id}`) as HTMLInputElement | null;
                                    const lengthInput = document.getElementById(`length-input-${line.id}`) as HTMLInputElement | null;
                                    const widthInput = document.getElementById(`width-input-${line.id}`) as HTMLInputElement | null;
                                    const countInput = document.getElementById(`count-input-${line.id}`) as HTMLInputElement | null;
                                    const qtyInput = (document.getElementById(`quantity-input-${line.id}`) || document.getElementById(`dim-quantity-input-${line.id}`)) as HTMLInputElement | null;
                                    const priceInput = document.getElementById(`price-input-${line.id}`) as HTMLInputElement | null;

                                    const targetInput = notesInput || lengthInput || widthInput || countInput || qtyInput || priceInput;
                                    if (targetInput) {
                                      targetInput.focus();
                                      if (typeof targetInput.select === 'function') {
                                        targetInput.select();
                                      }
                                    }
                                  }, 80);
                                }}
                                onQuickAdd={nameQuery => {
                                  setQuickAddInitialName(nameQuery);
                                  setIsQuickAddOpen(true);
                                }}
                                onOpenSearchModal={() => setIsItemSearchOpen(true)}
                              />
                            </div>

                            {/* Dimension Mode Toggle Icon */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (!isLineSqMeter) {
                                  handleUpdateLine(line.id, 'unit', 'م²');
                                } else {
                                  handleUpdateLine(line.id, 'unit', 'حبة');
                                }
                              }}
                              className={`shrink-0 p-1 rounded transition-colors cursor-pointer ${
                                isLineSqMeter
                                  ? 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                                  : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'
                              }`}
                              title={isLineSqMeter ? 'وحدة متر مربع (م²): طول×عرض×عدد مفعل (انقر للتحويل إلى كمية مباشرة)' : 'انقر للتحويل إلى وحدة متر مربع (م²) وفتح الطول والعرض والعدد'}
                            >
                              {isLineSqMeter ? <Ruler className="w-3.5 h-3.5" /> : <Package className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        )}
                      </td>

                      {/* صورة البند - Image Thumbnail */}
                      {posLayoutConfig.tableColumns.showImageThumbnail && (
                        <td className="p-0 border-l border-b border-slate-300 text-center bg-slate-50/50">
                          <div className="flex items-center justify-center h-full min-h-[36px] relative group/imgcell py-1 gap-1">
                            {line.imageThumbnail ? (
                              <div className="flex items-center gap-1 px-1">
                                {/* Green Checkmark representing successful upload */}
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" title="تم رفع وإرفاق الصور بنجاح" />
                                
                                {/* Thumbnails Gallery */}
                                <div className="flex -space-x-1.5 rtl:space-x-reverse overflow-hidden">
                                  {parseThumbnails(line.imageThumbnail).slice(0, 3).map((imgStr, imgIdx) => (
                                    <div key={imgIdx} className="relative w-6 h-6 rounded-full overflow-hidden border border-white ring-1 ring-slate-200">
                                      <img src={imgStr} alt="" className="w-full h-full object-cover" />
                                    </div>
                                  ))}
                                  {parseThumbnails(line.imageThumbnail).length > 3 && (
                                    <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-800 text-[8px] font-bold flex items-center justify-center border border-white ring-1 ring-slate-200">
                                      +{parseThumbnails(line.imageThumbnail).length - 3}
                                    </div>
                                  )}
                                </div>

                                {/* Delete Action */}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleUpdateLine(line.id, 'imageThumbnail', '');
                                  }}
                                  className="text-slate-400 hover:text-rose-600 p-0.5 rounded hover:bg-rose-50 cursor-pointer"
                                  title="حذف كافة الصور المرفقة للبند"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <label
                                className="w-8 h-8 rounded-md border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50 flex items-center justify-center cursor-pointer transition-all text-slate-400 hover:text-blue-600"
                                title="رفع صورة أو عدة صور للبند"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <input
                                  type="file"
                                  accept="image/*"
                                  multiple
                                  className="hidden"
                                  onChange={async (e) => {
                                    const files = e.target.files;
                                    if (files && files.length > 0) {
                                      const promises = Array.from(files).map((file: File) => compressToThumbnail(file));
                                      const compressedImages = await Promise.all(promises);
                                      const validImages = compressedImages.filter(img => img !== '');
                                      if (validImages.length > 0) {
                                        handleUpdateLine(line.id, 'imageThumbnail', JSON.stringify(validImages));
                                      }
                                    }
                                  }}
                                />
                              </label>
                            )}
                          </div>
                        </td>
                      )}

                      {/* 3. الملاحظات */}
                      {posLayoutConfig.tableColumns.showNotes && (
                        <td className="p-0 border-l border-b border-slate-300">
                          <input
                            id={`notes-input-${line.id}`}
                            type="text"
                            value={line.notes}
                            onChange={e => handleUpdateLine(line.id, 'notes', e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const lengthInput = document.getElementById(`length-input-${line.id}`) as HTMLInputElement | null;
                                const countInput = document.getElementById(`count-input-${line.id}`) as HTMLInputElement | null;
                                const qtyInput = (document.getElementById(`quantity-input-${line.id}`) || document.getElementById(`dim-quantity-input-${line.id}`)) as HTMLInputElement | null;
                                const target = (isLineSqMeter && lengthInput) ? lengthInput : (qtyInput || countInput);
                                if (target) {
                                  target.focus();
                                  if (typeof target.select === 'function') target.select();
                                }
                              }
                            }}
                            placeholder="البيان أو ملاحظات البند..."
                            className="w-full px-2 py-1.5 bg-transparent border-0 rounded-none focus:outline-none text-xs text-slate-800"
                          />
                        </td>
                      )}

                      {/* 4 & 5. الطول والعرض */}
                      {posLayoutConfig.tableColumns.showDimensions && (
                        <>
                          <td className="p-0 border-l border-b border-slate-300 text-center">
                            {line.inventoryItemId === 'srv-delivery' || line.itemName === 'خدمة توصيل' || !isLineSqMeter ? (
                              <div
                                className="w-full h-8 flex items-center justify-center bg-slate-100/75 text-slate-400 font-mono text-xs select-none cursor-not-allowed"
                                title="مغلق: يتطلب وحدة متر مربع (م²)"
                              >
                                —
                              </div>
                            ) : (
                              <input
                                id={`length-input-${line.id}`}
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.length}
                                onChange={e => handleUpdateLine(line.id, 'length', parseFloat(e.target.value) || 0)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const widthInput = document.getElementById(`width-input-${line.id}`) as HTMLInputElement | null;
                                    if (widthInput) {
                                      widthInput.focus();
                                      if (typeof widthInput.select === 'function') widthInput.select();
                                    }
                                  }
                                }}
                                className="w-full px-1 py-1.5 text-center bg-transparent border-0 rounded-none focus:outline-none font-mono text-xs font-bold text-slate-800"
                                placeholder="الطول"
                              />
                            )}
                          </td>
                          <td className="p-0 border-l border-b border-slate-300 text-center">
                            {line.inventoryItemId === 'srv-delivery' || line.itemName === 'خدمة توصيل' || !isLineSqMeter ? (
                              <div
                                className="w-full h-8 flex items-center justify-center bg-slate-100/75 text-slate-400 font-mono text-xs select-none cursor-not-allowed"
                                title="مغلق: يتطلب وحدة متر مربع (م²)"
                              >
                                —
                              </div>
                            ) : (
                              <input
                                id={`width-input-${line.id}`}
                                type="number"
                                step="0.01"
                                min="0"
                                value={line.width}
                                onChange={e => handleUpdateLine(line.id, 'width', parseFloat(e.target.value) || 0)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const countInput = document.getElementById(`count-input-${line.id}`) as HTMLInputElement | null;
                                    const dimQtyInput = document.getElementById(`dim-quantity-input-${line.id}`) as HTMLInputElement | null;
                                    const target = countInput || dimQtyInput;
                                    if (target) {
                                      target.focus();
                                      if (typeof target.select === 'function') target.select();
                                    }
                                  }
                                }}
                                className="w-full px-1 py-1.5 text-center bg-transparent border-0 rounded-none focus:outline-none font-mono text-xs font-bold text-slate-800"
                                placeholder="العرض"
                              />
                            )}
                          </td>
                        </>
                      )}

                      {/* 6. العدد */}
                      {posLayoutConfig.tableColumns.showCount && (
                        <td className="p-0 border-l border-b border-slate-300 text-center">
                          {!isLineSqMeter ? (
                            <div
                              className="w-full h-8 flex items-center justify-center bg-slate-100/75 text-slate-400 font-mono text-xs select-none cursor-not-allowed"
                              title="مغلق: يتطلب وحدة متر مربع (م²)"
                            >
                              —
                            </div>
                          ) : (
                            <input
                              id={`count-input-${line.id}`}
                              type="number"
                              min="1"
                              step="1"
                              value={line.count || 1}
                              onChange={e => handleUpdateLine(line.id, 'count', parseInt(e.target.value, 10) || 1)}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const qtyInput = (document.getElementById(`quantity-input-${line.id}`) || document.getElementById(`dim-quantity-input-${line.id}`)) as HTMLInputElement | null;
                                  const priceInput = document.getElementById(`price-input-${line.id}`) as HTMLInputElement | null;
                                  const target = qtyInput || priceInput;
                                  if (target) {
                                    target.focus();
                                    target.select?.();
                                  }
                                }
                              }}
                              className="w-full px-1 py-1.5 text-center bg-transparent border-0 rounded-none focus:outline-none font-mono text-xs font-bold text-slate-800"
                              placeholder="العدد"
                            />
                          )}
                        </td>
                      )}

                      {/* 7. الكمية */}
                      {posLayoutConfig.tableColumns.showQuantity && (
                        <td className="p-0 border-l border-b border-slate-300 text-center">
                          {isLineSqMeter && line.hasDimensions ? (
                            <div className="relative flex flex-col items-center">
                              <input
                                id={`dim-quantity-input-${line.id}`}
                                ref={isActive ? quantityInputRef : undefined}
                                type="number"
                                step="0.001"
                                min="0"
                                value={line.quantity}
                                onChange={e => {
                                  handleUpdateLine(line.id, 'quantity', parseFloat(e.target.value) || 0);
                                  resetInactivityTimer();
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    const priceInput = document.getElementById(`price-input-${line.id}`) as HTMLInputElement | null;
                                    if (priceInput && canUserEditPrices) {
                                      priceInput.focus();
                                      priceInput.select?.();
                                    } else if (barcodeInputRef.current) {
                                      barcodeInputRef.current.focus();
                                      barcodeInputRef.current.select();
                                    }
                                  }
                                }}
                                className="w-full px-1 py-1.5 text-center bg-transparent border-0 rounded-none focus:outline-none font-mono text-xs font-black text-blue-900"
                                title={`حساب الأبعاد: ${line.length} × ${line.width} × ${line.count || 1} = ${line.quantity} م²`}
                              />
                              <span className="text-[9px] text-blue-700 font-mono font-bold scale-90 whitespace-nowrap -mt-1 mb-0.5">
                                {line.length}×{line.width}×{line.count || 1}
                              </span>
                            </div>
                          ) : (
                            <input
                              id={`quantity-input-${line.id}`}
                              ref={isActive ? quantityInputRef : undefined}
                              type="number"
                              min="0.01"
                              step="any"
                              value={line.quantity}
                              onChange={e => {
                                handleUpdateLine(line.id, 'quantity', parseFloat(e.target.value) || 0);
                                resetInactivityTimer();
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  const priceInput = document.getElementById(`price-input-${line.id}`) as HTMLInputElement | null;
                                  if (priceInput && canUserEditPrices) {
                                    priceInput.focus();
                                    priceInput.select?.();
                                  } else if (barcodeInputRef.current) {
                                    barcodeInputRef.current.focus();
                                    barcodeInputRef.current.select();
                                  }
                                }
                              }}
                              className="w-full px-1 py-1.5 text-center bg-transparent border-0 rounded-none focus:outline-none font-mono text-xs font-bold text-slate-800"
                              placeholder="الكمية"
                            />
                          )}
                        </td>
                      )}

                      {/* 8. الوحدة */}
                      {posLayoutConfig.tableColumns.showUnit && (
                        <td className="p-0 border-l border-b border-slate-300 text-center">
                          <input
                            list="pos-units-datalist"
                            type="text"
                            value={line.unit || (isLineSqMeter ? 'م²' : 'حبة')}
                            onChange={e => handleUpdateLine(line.id, 'unit', e.target.value)}
                            className="w-full px-1 py-1.5 text-center bg-transparent border-0 rounded-none focus:outline-none text-xs text-slate-800 font-medium"
                            placeholder="الوحدة"
                            title="اختيار أو كتابة الوحدة المناسبة"
                          />
                        </td>
                      )}

                      {/* 9. السعر */}
                      {posLayoutConfig.tableColumns.showUnitPrice && (() => {
                        const matchedItem = inventory.find(i => 
                          (line.inventoryItemId && i.id === line.inventoryItemId) || 
                          (line.barcode && matchItemByBarcode(i, line.barcode)) || 
                          i.name === line.itemName
                        );
                        const priceInfo = (matchedItem && !isCashCustomer)
                          ? getItemPriceForCustomer(matchedItem, effectivePricingCustomerId, pricingTier as any)
                          : { isSpecialPrice: false, price: line.unitPrice, specialPriceLabel: undefined };
                        const isSpecialPrice = !isCashCustomer && Boolean(priceInfo.isSpecialPrice || pricingTier === 'special');
                        const specialTooltip = isCashCustomer ? "سعر الصنف" : (priceInfo.specialPriceLabel || (isSpecialPrice ? "سعر خاص معتمد لهذا العميل" : "سعر الصنف"));

                        return (
                          <td className={`p-0 border-l border-b border-slate-300 ${isSpecialPrice ? 'bg-amber-100/70 font-bold' : ''}`} title={specialTooltip}>
                            <div className="flex items-center gap-1 px-1">
                              {isSpecialPrice && (
                                <span className="text-[10px] text-amber-700 select-none shrink-0 font-bold" title={specialTooltip}>★</span>
                              )}
                              <input
                                id={`price-input-${line.id}`}
                                type="number"
                                step="0.01"
                                min="0"
                                readOnly={!canUserEditPrices}
                                disabled={!canUserEditPrices}
                                value={line.unitPrice}
                                onChange={e => {
                                  if (canUserEditPrices) {
                                    handleUpdateLine(line.id, 'unitPrice', parseFloat(e.target.value) || 0);
                                  }
                                }}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    if (barcodeInputRef.current) {
                                      barcodeInputRef.current.focus();
                                      barcodeInputRef.current.select();
                                    }
                                  }
                                }}
                                className={`w-full px-1.5 py-1.5 text-left border-0 rounded-none focus:outline-none font-mono text-xs font-bold transition-colors ${
                                  isSpecialPrice
                                    ? "bg-amber-100 text-amber-950 font-black"
                                    : !canUserEditPrices
                                    ? "bg-slate-100 text-slate-500 cursor-not-allowed"
                                    : line.inventoryItemId === 'srv-delivery' || line.itemName === 'خدمة توصيل'
                                    ? "bg-emerald-50 text-emerald-900 font-black text-sm"
                                    : "bg-transparent text-slate-800"
                                }`}
                                title={
                                  isSpecialPrice
                                    ? specialTooltip
                                    : !canUserEditPrices
                                    ? "تعديل السعر مقفل وغير مسموح به لصلاحية هذا المستخدم"
                                    : "سعر الوحدة"
                                }
                              />
                              {!canUserEditPrices && (
                                <Lock className="w-3 h-3 text-slate-400 shrink-0" title="تعديل السعر مقفل للمستخدم" />
                              )}
                            </div>
                          </td>
                        );
                      })()}

                      {/* 10. الخصم */}
                      {posLayoutConfig.tableColumns.showDiscount && (
                        <td className="p-0 border-l border-b border-slate-300">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.discount || 0}
                            onChange={e => handleUpdateLine(line.id, 'discount', parseFloat(e.target.value) || 0)}
                            className="w-full px-1.5 py-1.5 text-left bg-transparent border-0 rounded-none focus:outline-none font-mono text-xs font-medium text-rose-600"
                            placeholder="0.00"
                          />
                        </td>
                      )}

                      {/* 11. الضريبة */}
                      {posLayoutConfig.tableColumns.showTax && (
                        <td className="p-0 border-l border-b border-slate-300">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={line.tax || 0}
                            onChange={e => handleUpdateLine(line.id, 'tax', parseFloat(e.target.value) || 0)}
                            className="w-full px-1.5 py-1.5 text-left bg-transparent border-0 rounded-none focus:outline-none font-mono text-xs font-medium text-indigo-700"
                            placeholder="0.00"
                          />
                        </td>
                      )}

                      {/* 12. الإجمالي */}
                      <td className="px-2 py-1.5 text-left font-mono font-black text-sm text-[#1f4a7c] border-l border-b border-slate-300 bg-slate-50/70 select-none">
                        {(Number(line.total) || 0).toFixed(2)}
                      </td>

                      {/* 13. المرفقات */}
                      {posLayoutConfig.tableColumns.showAttachments && (
                        <td className="p-1 text-center border-l border-b border-slate-300">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveLineForAttachments(line);
                            }}
                            className={`px-1.5 py-0.5 rounded border text-xs font-bold flex items-center justify-center gap-1 mx-auto cursor-pointer transition-all ${
                              line.attachments && line.attachments.length > 0
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-700'
                                : 'bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border-slate-300 hover:border-blue-400'
                            }`}
                            title={`مرفقات البند (${line.attachments?.length || 0})`}
                          >
                            <Paperclip className="w-3.5 h-3.5 shrink-0" />
                            <span className="whitespace-nowrap">مرفق</span>
                            {line.attachments && line.attachments.length > 0 && (
                              <span className="text-[10px] font-mono font-black bg-white text-emerald-800 rounded-full px-1.5 py-0.2 leading-tight">
                                {line.attachments.length}
                              </span>
                            )}
                          </button>
                        </td>
                      )}

                      {/* 14. حذف */}
                      {posLayoutConfig.tableColumns.showDeleteButton && (
                        <td className="p-1 text-center border-b border-slate-300">
                          <button
                            type="button"
                            onClick={() => handleDeleteLine(line.id)}
                            className="p-1 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                            title="حذف هذا البند"
                          >
                            <X className="w-3.5 h-3.5 mx-auto" />
                          </button>
                        </td>
                      )}

                      {/* Filler cell matching header filler col */}
                      <td className="p-0 border-b border-slate-300 bg-white" />
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Excel-like Floating Vertical Guideline while dragging column boundary */}
            {activeResizingCol && resizingGuideX !== null && (
              <div
                className="fixed top-0 bottom-0 pointer-events-none z-[99999] border-r-2 border-dashed border-blue-600 shadow-[0_0_10px_rgba(37,99,235,0.7)]"
                style={{ left: `${resizingGuideX}px` }}
              >
                <div className="absolute top-4 -translate-x-1/2 bg-blue-700 text-white font-mono text-xs px-2 py-0.5 rounded shadow-lg whitespace-nowrap flex items-center gap-1 font-bold">
                  <span>عرض العمود:</span>
                  <span>{columnWidths[activeResizingCol]}px</span>
                </div>
              </div>
            )}

            {/* Datalist for Units based on all adopted program units */}
            <datalist id="pos-units-datalist">
              {programUnits.map(u => (
                <option key={u} value={u} />
              ))}
            </datalist>

            {/* Click to add new line row as shown in screenshot ("اضغط هنا لإضافة صنف جديد") */}
            <div
              onClick={handleAddNewRow}
              className="p-2.5 bg-slate-50 hover:bg-blue-50/70 border-b border-dashed border-slate-300 text-center text-slate-500 hover:text-blue-700 font-bold text-xs cursor-pointer transition-colors flex items-center justify-center gap-1.5"
            >
              <Plus className="w-4 h-4 text-blue-600" />
              <span>اضغط هنا لإضافة صنف جديد إلى جدول الفاتورة</span>
            </div>
          </div>

          {/* Table Summary Footer: عدد الأصناف - إجمالي القطع - الإجمالي - الخصم - الإضافي - الضريبة - المدفوع - المتبقي - سطر جديد */}
          {posLayoutConfig.showTableStatsFooter && (
            <div className="bg-[#b7cde3] p-0.5 border-t-2 border-slate-400 flex flex-wrap items-center justify-between gap-2 select-none shadow-xs">
              {/* Totals Breakdown Badges (عدد الأصناف | إجمالي القطع | الإجمالي | الخصم | الإضافي | الضريبة | المدفوع | المتبقي | سطر جديد) */}
              <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                {/* 1. عدد الأصناف */}
                <div
                  className="bg-white text-slate-700 px-1.5 py-0.5 rounded-lg border border-slate-300 shadow-2xs flex items-center gap-1"
                  title="عدد الأصناف المسجلة في الفاتورة"
                >
                  <span className="text-[9px] text-slate-400 font-light font-sans font-bold">عدد الأصناف:</span>
                  <span className="font-bold text-xs text-blue-700">{activeItemsCount}</span>
                </div>

                {/* 2. إجمالي القطع */}
                <div
                  className="bg-white text-slate-700 px-1.5 py-0.5 rounded-lg border border-slate-300 shadow-2xs flex items-center gap-1"
                  title="إجمالي عدد القطع والكميات"
                >
                  <span className="text-[9px] text-slate-400 font-light font-sans font-bold">إجمالي القطع:</span>
                  <span className="font-bold text-xs text-emerald-700">{totalPiecesCount}</span>
                </div>

                {/* 3. الإجمالي */}
                <div
                  className="bg-[#122b49] text-white px-1.5 py-0.5 rounded-lg border border-blue-900/60 shadow-2xs flex items-center gap-1.5"
                  title="مجموع بنود الفاتورة قبل الخصم والإضافات"
                >
                  <span className="text-[10px] text-blue-200 font-sans font-bold">الإجمالي:</span>
                  <span className="font-black text-xs sm:text-sm text-white">{(Number(calculatedSubtotal) || 0).toFixed(2)}</span>
                  <span className="text-[10px] text-blue-200 font-sans">₪</span>
                  {selectedCurrencyCode !== 'ILS' && (
                    <span className="text-[9px] text-amber-300 font-sans border-r border-blue-700 pr-1">
                      ≈ {((Number(calculatedSubtotal) || 0) / (customExchangeRate || 1)).toFixed(2)} {activeCurrency.symbol}
                    </span>
                  )}
                </div>

                {/* 4. الخصم */}
                <div
                  className="bg-white text-rose-700 px-1.5 py-0.5 rounded-lg border border-rose-300 shadow-2xs flex items-center gap-1"
                  title="إجمالي الخصم الممنوح"
                >
                  <span className="text-[10px] text-rose-500 font-sans font-bold">الخصم:</span>
                  <span className="font-bold text-xs">{(Number(calculatedDiscountTotal) || 0).toFixed(2)}</span>
                </div>

                {/* 5. الإضافي */}
                <div
                  className="bg-white text-amber-800 px-1.5 py-0.5 rounded-lg border border-amber-300 shadow-2xs flex items-center gap-1"
                  title="المصاريف أو الرسوم الإضافية"
                >
                  <span className="text-[10px] text-amber-600 font-sans font-bold">الإضافي:</span>
                  <span className="font-bold text-xs">{(Number(additionalCharges) || 0).toFixed(2)}</span>
                </div>

                {/* 6. الضريبة */}
                <div
                  className="bg-white text-blue-800 px-1.5 py-0.5 rounded-lg border border-blue-300 shadow-2xs flex items-center gap-1"
                  title="مبلغ ضريبة القيمة المضافة"
                >
                  <span className="text-[10px] text-blue-500 font-sans font-bold">الضريبة:</span>
                  <span className="font-bold text-xs">{(Number(calculatedTaxAmount) || 0).toFixed(2)}</span>
                </div>

                {/* 7. المدفوع */}
                <div
                  className="bg-white text-emerald-800 px-1.5 py-0.5 rounded-lg border border-emerald-400 shadow-2xs flex items-center gap-1.5"
                  title="المبلغ المدفوع فعلياً نقداً وبنكياً"
                >
                  <span className="text-[10px] text-emerald-600 font-sans font-bold">المدفوع:</span>
                  <span className="font-black text-xs text-emerald-700">{(Number(parsedPaidAmount) || 0).toFixed(2)}</span>
                </div>

                {/* 8. المتبقي (بارز جداً لسرعة التحصيل) */}
                <div
                  className={`px-2 py-0.5 rounded-lg border shadow-xs flex items-center gap-1.5 transition-all ${
                    calculatedRemaining > 0
                      ? 'bg-rose-600 text-white border-rose-700 ring-2 ring-rose-400/50'
                      : 'bg-emerald-600 text-white border-emerald-700'
                  }`}
                  title="المبلغ المتبقي المطلوب سداده أو تسجليه ذمم آجل"
                >
                  <span className="text-[10px] text-rose-100 font-sans font-bold">المتبقي:</span>
                  <span className="font-black text-xs sm:text-sm tracking-wider">{(Number(calculatedRemaining) || 0).toFixed(2)}</span>
                  <span className="text-[10px] text-white font-sans">₪</span>
                  {selectedCurrencyCode !== 'ILS' && (
                    <span className="text-[9px] text-amber-200 font-sans border-r border-rose-400/50 pr-1">
                      ≈ {((Number(calculatedRemaining) || 0) / (customExchangeRate || 1)).toFixed(2)} {activeCurrency.symbol}
                    </span>
                  )}
                </div>

                {/* 9. حالة الدفع (تم رفعها للسطر الأعلى بجانب المتبقي) */}
                <div
                  className="bg-white/95 text-slate-800 px-1.5 py-0.5 rounded-lg border border-slate-300 shadow-2xs flex items-center gap-1.5 shrink-0"
                  title="حالة دفع الفاتورة الحالية"
                >
                  <span className="text-[10px] text-slate-600 font-sans font-bold">حالة الدفع:</span>
                  <div className={`px-2 py-0.5 rounded-lg text-[11px] font-bold border flex items-center gap-1 ${currentPaymentStatusMeta.badgeBg} ${currentPaymentStatusMeta.badgeText} ${currentPaymentStatusMeta.badgeBorder}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                    <span>{currentPaymentStatusMeta.label}</span>
                  </div>
                </div>
              </div>

              {/* Right: Reset Columns & Customization Buttons */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleResetAllColumns}
                  className="bg-white/90 hover:bg-white text-slate-700 hover:text-blue-800 px-1.5 py-0.5 rounded border border-slate-300 shadow-2xs flex items-center gap-1 cursor-pointer text-[10px] font-sans font-bold transition-colors"
                  title="إعادة ضبط عرض كافة أعمدة الجدول إلى الوضع الافتراضي"
                >
                  <RotateCcw className="w-2.5 h-2.5 text-blue-600" />
                  <span>ضبط عرض الأعمدة</span>
                </button>

                {isLiveCustomizing && (
                  <button
                    type="button"
                    onClick={() => handleToggleLayoutSection('showTableStatsFooter')}
                    className="text-[10px] bg-rose-500 hover:bg-rose-600 text-white px-1.5 py-0.5 rounded-md cursor-pointer font-sans font-bold"
                    title="إخفاء شريط إحصائيات الجدول"
                  >
                    ✕ إخفاء الشريط
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>


      {/* ========================================================= */}
      {/* 4. BOTTOM PAYMENT, TREASURY & TOTALS CONSOLE */}
      {/* (شريط الحسابات، الصندوق، ألية وعملة الدفع، والإجمالي) */}
      {/* ========================================================= */}
      <div className="bg-[#193a61] text-white p-1 border-t-2 border-[#143254] shadow-lg flex flex-col gap-1">
        {/* 4A. Integrated Payment, Treasury & Currency Console (عملة الفاتورة وسعر الصرف، الدفع النقدي، الدفع البنكي، الصناديق، سطر الملاحظات) */}
        {posLayoutConfig.showPaymentConsole && (
          <PosBottomPaymentConsole
            currencies={currencies}
            overallDiscount={overallDiscount}
            onChangeOverallDiscount={setOverallDiscount}
            discountType={discountType}
            onChangeDiscountType={setDiscountType}
            invoiceCurrencyCode={selectedCurrencyCode}
            onSelectInvoiceCurrency={code => {
              setSelectedCurrencyCode(code);
              const found = currencies.find(c => c.code === code);
              if (found) {
                handleExchangeRateChange(code === 'ILS' ? 1.0 : (found.rateAgainstBase || 1.0));
              }
            }}
            invoiceExchangeRate={customExchangeRate}
            onChangeInvoiceExchangeRate={handleExchangeRateChange}
            activeInvoiceCurrency={activeCurrency}
            cashAmount={cashAmountInput}
            onChangeCashAmount={setCashAmountInput}
            cashCurrencyCode={cashCurrencyCode}
            onChangeCashCurrency={setCashCurrencyCode}
            cashExchangeRate={cashExchangeRate}
            onChangeCashExchangeRate={setCashExchangeRate}
            cashTreasuryCode={cashTreasuryCode}
            onChangeCashTreasury={setCashTreasuryCode}
            bankAmount={bankAmountInput}
            onChangeBankAmount={setBankAmountInput}
            bankCurrencyCode={bankCurrencyCode}
            onChangeBankCurrency={setBankCurrencyCode}
            bankExchangeRate={bankExchangeRate}
            onChangeBankExchangeRate={setBankExchangeRate}
            bankTreasuryCode={bankTreasuryCode}
            onChangeBankTreasury={setBankTreasuryCode}
            treasuries={treasuries}
            paymentNotes={paymentNotes}
            onChangePaymentNotes={setPaymentNotes}
            invoiceNotes={invoiceNotes}
            onChangeInvoiceNotes={setInvoiceNotes}
            calculatedTotalAmount={calculatedTotalAmount}
            onQuickFullCash={handleQuickFullCash}
            onQuickFullBank={handleQuickFullBank}
            onQuickCredit={handleQuickCredit}
            baseCurrencySymbol="₪"
            isEditMode={isLiveCustomizing}
            onToggleVisibility={() => handleToggleLayoutSection('showPaymentConsole')}
          />
        )}

        {/* 4B. Action Buttons - Full width across bottom row (إعطاء اتساع كامل للشاشة وإخفاء زر تخصيص الأسفل) */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-[#1f4a7c] w-full">
          {/* Big Colorful Action Buttons (Customizable) */}
          <div className="flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 w-full">
            {isLiveCustomizing && (
              <button
                type="button"
                onClick={() => setIsButtonCustomizerOpen(true)}
                className="px-1.5 py-0.5.5 bg-amber-400 hover:bg-amber-500 text-amber-950 font-bold rounded-xl text-xs border border-dashed border-amber-600 flex items-center gap-1 cursor-pointer shadow-xs ml-auto"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ زر أسفل الشاشة</span>
              </button>
            )}
            {posButtons
              .filter(b => b.location === 'bottom_bar' && b.isVisible)
              .sort((a, b) => a.order - b.order)
              .map((btn, idx, arr) => (
                <PosCustomButtonRenderer
                  key={btn.id}
                  button={btn}
                  isEditMode={isLiveCustomizing}
                  onExecuteAction={handleExecuteButtonAction}
                  onMoveRight={() => handleMoveButtonInLive(btn.id, 'right')}
                  onMoveLeft={() => handleMoveButtonInLive(btn.id, 'left')}
                  onEdit={() => setIsButtonCustomizerOpen(true)}
                  onDelete={() => handleDeleteButtonInLive(btn.id)}
                  canMoveRight={idx > 0}
                  canMoveLeft={idx < arr.length - 1}
                />
              ))}
          </div>
        </div>
      </div>
      </div>

      {/* ========================================================= */}
      {/* 5. MODALS & SUB-POPOVERS (مترابطة مع كل أزرار الشاشة) */}
      {/* ========================================================= */}

      {/* Header Sub-tools Modals */}
      {activeHeaderSubModal === 'currency' && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-md w-full text-slate-800 space-y-4">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Coins className="w-5 h-5 text-emerald-600" />
              <span>تعديل عملة الفاتورة وسعر الصرف</span>
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 mb-1 text-[11px] font-semibold">
                  اختيار عملة الفاتورة:
                </label>
                <select
                  value={selectedCurrencyCode}
                  onChange={e => {
                    const code = e.target.value;
                    setSelectedCurrencyCode(code);
                    const found = currencies.find(c => c.code === code);
                    if (found) {
                      handleExchangeRateChange(found.rateAgainstBase || 1.0);
                    }
                  }}
                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold bg-white text-slate-800 cursor-pointer"
                >
                  {currencies.map(curr => (
                    <option key={curr.code} value={curr.code}>
                      {curr.symbol} {curr.name} ({curr.code}) {curr.isBase ? '- العملة الأساسية' : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 text-[11px] font-semibold">
                  سعر الصرف المباشر (1 {activeCurrency.symbol} مقابل الشيكل ₪):
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.001"
                    min="0.001"
                    disabled={selectedCurrencyCode === 'ILS'}
                    value={selectedCurrencyCode === 'ILS' ? 1.0 : customExchangeRate}
                    onChange={e => handleExchangeRateChange(parseFloat(e.target.value) || 1.0)}
                    className={`flex-1 border rounded-xl px-3 py-2 text-xs font-mono font-bold ${
                      selectedCurrencyCode === 'ILS'
                        ? 'bg-slate-100 border-slate-200 text-slate-500 cursor-not-allowed'
                        : 'bg-white border-amber-400 text-slate-900 focus:ring-2 focus:ring-amber-300'
                    }`}
                  />
                  <span className="text-sm font-bold text-slate-700">₪ شيكل</span>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  {selectedCurrencyCode === 'ILS'
                    ? 'الشيكل الفلسطيني هو العملة الأساسية لكافة العمليات المحاسبية وسعر صرفه دائماً 1.0.'
                    : `سعر صرف ${activeCurrency.name} حر وقابل للتعديل المباشر على مستوى الفاتورة.`}
                </p>
              </div>

              {/* أزرار أسعار صرف شائعة سريعة */}
              {selectedCurrencyCode !== 'ILS' && (
                <div>
                  <span className="block text-[10px] text-slate-400 font-light mb-1 font-semibold">أسعار صرف مقترحة سريعة:</span>
                  <div className="flex gap-2 flex-wrap">
                    {(selectedCurrencyCode === 'USD' ? [3.65, 3.68, 3.70, 3.72, 3.75] :
                      selectedCurrencyCode === 'JOD' ? [5.15, 5.18, 5.20, 5.22, 5.25] :
                      selectedCurrencyCode === 'EUR' ? [3.95, 4.00, 4.05, 4.10] : [activeCurrency?.rateAgainstBase || 1]).map(r => (
                      <button
                        key={r ?? '1'}
                        type="button"
                        onClick={() => handleExchangeRateChange(r || 1)}
                        className={`px-1.5 py-0.5 text-xs font-mono font-bold rounded-lg border cursor-pointer transition-colors ${
                          customExchangeRate === r ? 'bg-amber-100 border-amber-500 text-amber-900' : 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-700'
                        }`}
                      >
                        {(Number(r) || 1).toFixed(2)} ₪
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ملخص التحويل المباشر */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-600">إجمالي الفاتورة الأساسي بالشيكل:</span>
                  <span className="font-bold font-mono text-slate-900">{calculatedTotalAmount.toFixed(2)} ₪</span>
                </div>
                {selectedCurrencyCode !== 'ILS' && (
                  <div className="flex justify-between text-emerald-700 font-bold">
                    <span>ما يعادل بالعملة المختارة ({activeCurrency.name}):</span>
                    <span className="font-mono">
                      {(calculatedTotalAmount / (customExchangeRate || 1)).toFixed(2)} {activeCurrency.symbol}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setActiveHeaderSubModal(null)}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl cursor-pointer shadow-xs text-xs"
              >
                تأكيد واعتماد
              </button>
            </div>
          </div>
        </div>
      )}

      {activeHeaderSubModal === 'representative' && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full text-slate-800 space-y-4">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <span>اختيار مندوب المبيعات</span>
            </h3>
            <div className="space-y-2 max-h-72 overflow-y-auto">
              {employees.length > 0 && (
                <>
                  <div className="text-[11px] font-bold text-slate-500 mb-1">الموظفون وكادر العمل:</div>
                  {employees.map(emp => (
                    <div
                      key={emp.id}
                      onClick={() => {
                        setRepresentative(emp.name);
                        setActiveHeaderSubModal(null);
                      }}
                      className={`p-2 rounded-xl border cursor-pointer font-semibold text-xs transition-colors flex items-center justify-between ${
                        representative === emp.name ? 'bg-blue-50 border-blue-500 text-blue-800' : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <span>{emp.name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">[{emp.code || emp.id.slice(-4)}]</span>
                    </div>
                  ))}
                  <div className="text-[11px] font-bold text-slate-500 mt-2 mb-1">الأدوار الافتراضية:</div>
                </>
              )}
              {['مندوب المبيعات الرئيسي', 'كاشير الصالة', 'مندوب التوصيل', 'مسؤول التعاقدات الخارجية'].map(rep => (
                <div
                  key={rep}
                  onClick={() => {
                    setRepresentative(rep);
                    setActiveHeaderSubModal(null);
                  }}
                  className={`p-2 rounded-xl border cursor-pointer font-semibold text-xs transition-colors ${
                    representative === rep ? 'bg-blue-50 border-blue-500 text-blue-800' : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {rep}
                </div>
              ))}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setActiveHeaderSubModal(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {activeHeaderSubModal === 'tax' && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full text-slate-800 space-y-4">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Percent className="w-4 h-4 text-indigo-600" />
              <span>إعدادات ضريبة القيمة المضافة (VAT)</span>
            </h3>
            <div className="space-y-3">
              <label className="flex items-center gap-2 font-bold cursor-pointer">
                <input
                  type="checkbox"
                  checked={taxEnabled}
                  onChange={e => setTaxEnabled(e.target.checked)}
                  className="rounded text-indigo-600 w-4 h-4 cursor-pointer"
                />
                <span>تطبيق الضريبة على هذه الفاتورة</span>
              </label>

              {taxEnabled && (
                <div>
                  <label className="block text-slate-600 mb-1 text-[11px] font-semibold">نسبة الضريبة (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={taxRate}
                    onChange={e => setTaxRate(parseFloat(e.target.value) || 0)}
                    className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setActiveHeaderSubModal(null)}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl cursor-pointer"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {activeHeaderSubModal === 'additional' && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full text-slate-800 space-y-4">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-amber-600" />
              <span>المبالغ والمصاريف الإضافية</span>
            </h3>
            <div>
              <label className="block text-slate-600 mb-1 text-[11px] font-semibold">
                قيمة المصاريف الإضافية (توصيل، تركيب، تغليف):
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={additionalCharges}
                onChange={e => setAdditionalCharges(parseFloat(e.target.value) || 0)}
                className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setActiveHeaderSubModal(null)}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl cursor-pointer"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {activeHeaderSubModal === 'discount' && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full text-slate-800 space-y-4">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Tag className="w-4 h-4 text-rose-600" />
              <span>تطبيق خصم عام على الفاتورة</span>
            </h3>
            <div className="space-y-3">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDiscountType('amount')}
                  className={`flex-1 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${
                    discountType === 'amount' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  خصم بمبلغ ثابت
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType('percent')}
                  className={`flex-1 py-1.5 rounded-xl font-bold text-xs cursor-pointer ${
                    discountType === 'percent' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  خصم بنسبة مئوية (%)
                </button>
              </div>

              <div>
                <label className="block text-slate-600 mb-1 text-[11px] font-semibold">
                  قيمة الخصم ({discountType === 'percent' ? '%' : settings.currency}):
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={overallDiscount}
                  onChange={e => setOverallDiscount(parseFloat(e.target.value) || 0)}
                  className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono font-bold"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setActiveHeaderSubModal(null)}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl cursor-pointer"
              >
                تطبيق الخصم
              </button>
            </div>
          </div>
        </div>
      )}

      {activeHeaderSubModal === 'shipping' && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full text-slate-800 space-y-4">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <Truck className="w-4 h-4 text-blue-600" />
              <span>بيانات الشحن والتوصيل</span>
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-slate-600 mb-1 text-[11px] font-semibold">شركة / مندوب الشحن:</label>
                <input
                  type="text"
                  value={shippingDetails.carrier}
                  onChange={e => setShippingDetails(prev => ({ ...prev, carrier: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 text-[11px] font-semibold">عنوان التوصيل:</label>
                <input
                  type="text"
                  value={shippingDetails.address}
                  onChange={e => setShippingDetails(prev => ({ ...prev, address: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs"
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-1 text-[11px] font-semibold">رقم التتبع / البوليصة:</label>
                <input
                  type="text"
                  value={shippingDetails.tracking}
                  onChange={e => setShippingDetails(prev => ({ ...prev, tracking: e.target.value }))}
                  className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                onClick={() => setActiveHeaderSubModal(null)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl cursor-pointer"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {activeHeaderSubModal === 'notes' && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-sm w-full text-slate-800 space-y-4">
            <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>ملاحظات الفاتورة</span>
            </h3>
            <textarea
              rows={4}
              value={invoiceNotes}
              onChange={e => setInvoiceNotes(e.target.value)}
              placeholder="اكتب أي شروط أو ملاحظات خاصة بالفاتورة..."
              className="w-full border border-slate-300 rounded-xl p-3 text-xs bg-slate-50"
            />
            <div className="flex justify-end">
              <button
                onClick={() => setActiveHeaderSubModal(null)}
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl cursor-pointer"
              >
                حفظ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Action Panels Modals */}
      <CalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        onApplyResult={val => {
          if (activeRowId) {
            handleUpdateLine(activeRowId, 'unitPrice', val);
          }
        }}
      />

      <QuickAddItemModal
        isOpen={isQuickAddOpen}
        onClose={() => {
          setIsQuickAddOpen(false);
          setQuickAddInitialName('');
        }}
        initialName={quickAddInitialName}
        onItemCreatedAndAdd={item => {
          if (activeRowId) {
            const line = tableLines.find(l => l.id === activeRowId);
            if (line && (!line.itemName || line.itemName === quickAddInitialName)) {
              const price = getItemEffectivePrice(item);
              setTableLines(prev =>
                prev.map(l =>
                  l.id === activeRowId
                    ? {
                        ...l,
                        itemCode: item.code || '',
                        itemName: item.name,
                        barcode: item.barcode || '',
                        inventoryItemId: item.id,
                        unitPrice: price,
                        total: calculateLineTotal(l.length, l.width, l.quantity, price)
                      }
                    : l
                )
              );
              posSound.beep();
              return;
            }
          }
          handleAddItemToTable(item);
        }}
      />

      <PriceEditModal
        isOpen={isPriceEditOpen}
        onClose={() => setIsPriceEditOpen(false)}
        onPriceUpdated={(itemId, newPrice) => {
          setTableLines(prev =>
            prev.map(line => {
              if (line.inventoryItemId === itemId) {
                return {
                  ...line,
                  unitPrice: newPrice,
                  total: calculateLineTotal(line.length, line.width, line.quantity, newPrice)
                };
              }
              return line;
            })
          );
        }}
      />

      <CustomerLedgerModal
        isOpen={isCustomerLedgerOpen}
        onClose={() => setIsCustomerLedgerOpen(false)}
        currentCustomer={currentCustomer}
      />

      <RequisitionModal
        isOpen={isRequisitionOpen}
        onClose={() => setIsRequisitionOpen(false)}
      />

      <FavoriteItemsDrawer
        isOpen={isFavoritesOpen}
        onClose={() => setIsFavoritesOpen(false)}
        onSelectItem={item => handleAddItemToTable(item)}
      />

      <InvoicesReviewModal
        isOpen={isInvoicesReviewOpen}
        onClose={() => setIsInvoicesReviewOpen(false)}
        onLoadInvoiceToScreen={inv => loadInvoiceToScreen(inv)}
      />

      <HeldInvoicesModal
        isOpen={isHeldInvoicesOpen}
        onClose={() => setIsHeldInvoicesOpen(false)}
        heldInvoices={heldInvoices}
        onResumeInvoice={held => handleResumeHeldInvoice(held)}
        onDeleteHeldInvoice={id => setHeldInvoices(prev => prev.filter(h => h.id !== id))}
      />

      <DraftInvoicesQueueModal
        isOpen={isDraftQueueOpen}
        onClose={() => setIsDraftQueueOpen(false)}
        onOpenInPos={draft => handleLoadDraftToPos(draft)}
      />

      <ItemSearchModal
        isOpen={isItemSearchOpen}
        onClose={() => setIsItemSearchOpen(false)}
        onSelectItem={item => handleAddItemToTable(item)}
      />

      <BarcodeScannerModal
        isOpen={isCameraScannerOpen}
        onClose={() => setIsCameraScannerOpen(false)}
        inventory={inventory}
        onScanItem={item => {
          handleAddItemToTable(item);
        }}
        onScanBarcode={barcode => {
          const item = (inventory || []).find(i => matchItemByBarcode(i, barcode));
          if (item) {
            setBarcodeNotFoundAlert(null);
            handleAddItemToTable(item);
          } else {
            posSound.error();
            setBarcodeNotFoundAlert(barcode);
            alert(`الصنف غير موجود\nالباركود: [${barcode}]`);
          }
        }}
      />

      {/* POS Buttons & Interface Layout Customizer Modal */}
      <PosButtonCustomizerModal
        isOpen={isButtonCustomizerOpen}
        onClose={() => setIsButtonCustomizerOpen(false)}
        buttons={posButtons}
        onSaveButtons={handleSavePosButtons}
        onToggleLiveEdit={() => setIsLiveCustomizing(prev => !prev)}
        isLiveEditActive={isLiveCustomizing}
        inventory={inventory}
        onResetToAdminDefaults={handleResetToAdminDefaults}
      />

      {/* POS Full Layout Designer Drawer */}
      <PosLayoutDesignerDrawer
        isOpen={isLayoutDesignerOpen}
        onClose={() => setIsLayoutDesignerOpen(false)}
        config={posLayoutConfig}
        layoutConfig={posLayoutConfig}
        onSaveConfig={handleSavePosLayoutConfig}
        onUpdateLayoutConfig={handleSavePosLayoutConfig}
        onOpenButtonCustomizer={() => {
          setIsLayoutDesignerOpen(false);
          setIsButtonCustomizerOpen(true);
        }}
        isLiveEditActive={isLiveCustomizing}
        isLiveCustomizing={isLiveCustomizing}
        onToggleLiveEdit={() => setIsLiveCustomizing(prev => !prev)}
        onToggleLiveCustomizing={() => setIsLiveCustomizing(prev => !prev)}
        onResetColumnWidths={handleResetAllColumns}
        userName={currentUser?.fullName || currentUser?.username}
        isAdmin={isCurrentUserAdmin}
        onApplyAsSystemDefault={handleApplyAsSystemDefault}
        onResetToAdminDefaults={handleResetToAdminDefaults}
      />

      {/* Customer Special Prices Modal */}
      <CustomerSpecialPricesModal
        party={effectivePricingCustomerObj}
        isOpen={isSpecialPricesModalOpen}
        onClose={() => setIsSpecialPricesModalOpen(false)}
        onSavePrices={(prices) => {
          if (effectivePricingCustomerObj) {
            updateParty(effectivePricingCustomerObj.id, {
              specialPrices: prices
            });
            setTableLines(prev => applyCustomerPricingToLines({ ...effectivePricingCustomerObj, specialPrices: prices }, prev));
          }
        }}
      />

      {/* Quick Add / Edit Party Modal (شاشة إضافة أو تعديل عميل / مورد / موظف) */}
      <QuickAddPartyModal
        isOpen={isAddPartyModalOpen}
        onClose={() => {
          setIsAddPartyModalOpen(false);
          setPartyToEditInPos(null);
        }}
        initialType={posTargetType}
        partyToEdit={partyToEditInPos}
        onSuccess={(created) => {
          setSelectedCustomerId(created.id);
          setCustomerName(created.name);
          setCustomerCode(created.code);
          if (posTargetType === 'customer') {
            setTableLines(prev => applyCustomerPricingToLines(created, prev));
          }
          // Reset sub-customer
          setSubCustomerId('');
          setSubCustomerName('');
          setSubCustomerPhone('');
          setCustomCustomerText('');
          posSound.playSuccessBeep();
        }}
      />



      {/* Item Line Attachments Modal */}
      {activeLineForAttachments && (
        <LineAttachmentsModal
          isOpen={Boolean(activeLineForAttachments)}
          onClose={() => setActiveLineForAttachments(null)}
          itemName={activeLineForAttachments.itemName || 'بند الفاتورة'}
          attachments={activeLineForAttachments.attachments || []}
          onSaveAttachments={(newAttachments) => {
            handleUpdateLine(activeLineForAttachments.id, 'attachments', newAttachments);
            setActiveLineForAttachments(null);
          }}
        />
      )}

      {/* Delete Audit Log Modal */}
      <InvoiceAuditLogModal
        isOpen={isAuditLogModalOpen}
        onClose={() => setIsAuditLogModalOpen(false)}
        initialInvoiceId="29"
      />

      {/* Deleted Invoices Modal (Recycle Bin / Restore & Edit) */}
      <DeletedInvoicesModal
        isOpen={isDeletedInvoicesOpen}
        onClose={() => setIsDeletedInvoicesOpen(false)}
        onLoadInvoiceToScreen={inv => loadInvoiceToScreen(inv)}
      />
    
    </div>
  </div></div>
  );
};
