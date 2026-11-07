import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  FileSpreadsheet,
  CloudDownload,
  Upload,
  ClipboardPaste,
  CheckCircle2,
  Trash2,
  Edit3,
  Sparkles,
  AlertCircle,
  X,
  Plus,
  RefreshCw,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  Layers,
  Search,
  User,
  Calendar,
  CreditCard,
  Banknote,
  Coins,
  Percent,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ChevronUp,
  Check,
  Building2,
  Tag,
  Table,
  Paperclip,
  Maximize2,
  Minimize2,
  Landmark,
  Save,
  Printer,
  DollarSign,
  Lock,
  Truck,
  CalendarCheck
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import {
  convertDailyEntryRowsToDrafts,
  calculateDailyEntryTotals,
  markDailyEntryRowsApprovedInStorage
} from '../services/dailyEntryService';
import {
  PaymentMethod,
  Party,
  InventoryItem,
  Currency,
  TreasuryAccount,
  LineAttachment,
  Invoice
} from '../types';
import {
  SheetInvoiceRow,
  MultiItemDraftInvoice,
  DraftInvoiceItem,
  DEFAULT_ONEDRIVE_SHEET_URL,
  parseExcelBuffer,
  parseClipboardText,
  convertSingleRowsToMultiDrafts,
  autoMatchDraftEntities,
  normalizeArabicText,
  parseAnyDate
} from '../services/liveSheetService';
import { isSquareMeterUnit } from '../utils/unitsOfMeasure';
import { LineAttachmentsModal } from './pos/LineAttachmentsModal';
import { PosCustomerSearchInput } from './pos/PosCustomerSearchInput';
import { PosBottomPaymentConsole } from './pos/PosBottomPaymentConsole';
import { CustomerSpecialPricesModal } from './pos/CustomerSpecialPricesModal';
import { posSound } from '../utils/audio';

const STORAGE_KEY_MULTI_DRAFTS = 'accounting_pending_multi_draft_invoices_v5';
const STORAGE_KEY_URL = 'accounting_live_sheet_url';

// Palette of 6 Distinct Color Themes for Draft Invoice Cards & Borders
const DRAFT_THEMES = [
  {
    cardBorder: 'border-2 border-indigo-500 border-r-8 border-r-indigo-600 shadow-md bg-indigo-50/10',
    headerBg: 'bg-gradient-to-r from-[#182352] via-[#22316e] to-[#283878] text-white border border-indigo-900',
    badgeBg: 'bg-indigo-600 text-white',
  },
  {
    cardBorder: 'border-2 border-emerald-500 border-r-8 border-r-emerald-600 shadow-md bg-emerald-50/10',
    headerBg: 'bg-gradient-to-r from-[#0c382b] via-[#124535] to-[#17523f] text-white border border-emerald-900',
    badgeBg: 'bg-emerald-600 text-white',
  },
  {
    cardBorder: 'border-2 border-amber-500 border-r-8 border-r-amber-600 shadow-md bg-amber-50/10',
    headerBg: 'bg-gradient-to-r from-[#422c06] via-[#523708] to-[#5c3e08] text-white border border-amber-900',
    badgeBg: 'bg-amber-600 text-white',
  },
  {
    cardBorder: 'border-2 border-purple-500 border-r-8 border-r-purple-600 shadow-md bg-purple-50/10',
    headerBg: 'bg-gradient-to-r from-[#32134a] via-[#3f185d] to-[#491c6d] text-white border border-purple-900',
    badgeBg: 'bg-purple-600 text-white',
  },
  {
    cardBorder: 'border-2 border-rose-500 border-r-8 border-r-rose-600 shadow-md bg-rose-50/10',
    headerBg: 'bg-gradient-to-r from-[#470f20] via-[#591328] to-[#691831] text-white border border-rose-900',
    badgeBg: 'bg-rose-600 text-white',
  },
  {
    cardBorder: 'border-2 border-teal-500 border-r-8 border-r-teal-600 shadow-md bg-teal-50/10',
    headerBg: 'bg-gradient-to-r from-[#083b3b] via-[#0d4a4a] to-[#105757] text-white border border-teal-900',
    badgeBg: 'bg-teal-600 text-white',
  }
];

// Portal-based Live Autocomplete Input for Item Name in Table Rows (Unclipped Floating List)
const ItemNameCellInput: React.FC<{
  draftId: string;
  itemId: string;
  itemName: string;
  customerId?: string;
  inventory: InventoryItem[];
  getItemPriceForCustomer: (item: InventoryItem, custId?: string) => { price: number; isSpecialPrice: boolean };
  onUpdateItem: (draftId: string, itemId: string, updates: Partial<DraftInvoiceItem>) => void;
  onSelectItem: (draftId: string, itemId: string, inv: InventoryItem) => void;
}> = ({
  draftId,
  itemId,
  itemName,
  customerId,
  inventory,
  getItemPriceForCustomer,
  onUpdateItem,
  onSelectItem
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateCoords = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom,
        left: rect.left,
        width: Math.max(rect.width, 320)
      });
    }
  };

  const filteredItems = useMemo(() => {
    const q = normalizeArabicText(itemName);
    if (!q) return inventory.slice(0, 20);
    return inventory
      .filter(i => {
        const nameNorm = normalizeArabicText(i.name);
        const codeNorm = normalizeArabicText(i.code);
        const barcodeNorm = normalizeArabicText(i.barcode || '');
        return nameNorm.includes(q) || codeNorm.includes(q) || barcodeNorm.includes(q) || q.includes(nameNorm);
      })
      .slice(0, 20);
  }, [inventory, itemName]);

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        value={itemName}
        onFocus={() => {
          updateCoords();
          setIsOpen(true);
        }}
        onBlur={() => {
          setTimeout(() => setIsOpen(false), 220);
        }}
        onChange={e => {
          const val = e.target.value;
          onUpdateItem(draftId, itemId, { itemName: val });
          updateCoords();
          setIsOpen(true);
        }}
        placeholder="ابحث او اكتب اسم الصنف..."
        className="w-full p-1 bg-white border border-[#b8d3ec] hover:border-blue-400 focus:border-blue-600 rounded text-xs font-bold text-slate-900 outline-none placeholder:text-slate-400"
      />

      {isOpen && coords && createPortal(
        <div
          style={{
            position: 'fixed',
            top: `${coords.top + 2}px`,
            left: `${coords.left}px`,
            width: `${coords.width}px`,
            zIndex: 999999
          }}
          className="bg-white border-2 border-blue-500 rounded-xl shadow-2xl max-h-64 overflow-y-auto p-1 font-sans text-right animate-in fade-in zoom-in-95 duration-100"
          onMouseDown={e => e.preventDefault()}
        >
          <div className="text-[10px] font-bold text-slate-600 px-2 py-1 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-lg">
            <span>اختر صنفاً من الأصناف المخزنة ({filteredItems.length}):</span>
            <span className="text-blue-600 font-mono text-[9px]">مطابقة حية</span>
          </div>
          {filteredItems.length === 0 ? (
            <div className="p-3 text-center text-xs text-slate-400 font-medium">
              لا توجد أصناف مطابقة للبحث
            </div>
          ) : (
            filteredItems.map((inv, idx) => {
              const { price, isSpecialPrice } = getItemPriceForCustomer(inv, customerId);
              return (
                <button
                  key={`onedrive-inv-${inv.id || idx}-${idx}`}
                  type="button"
                  onClick={() => {
                    onSelectItem(draftId, itemId, inv);
                    setIsOpen(false);
                  }}
                  className="w-full text-right p-2 hover:bg-blue-50 rounded-lg flex items-center justify-between text-xs border-b border-slate-100 last:border-0 cursor-pointer transition-colors group"
                >
                  <div className="min-w-0 flex-1 pl-2">
                    <span className="font-bold block text-slate-900 group-hover:text-blue-700 truncate">{inv.name}</span>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono mt-0.5">
                      <span className="bg-slate-100 px-1 rounded text-slate-700 font-bold">{inv.code}</span>
                      <span>•</span>
                      <span>الوحدة: {inv.unit || 'قطعة'}</span>
                      <span>•</span>
                      <span className="text-blue-600 font-bold">المتوفر: {inv.quantity}</span>
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <span className="font-mono font-black text-emerald-700 text-sm block">
                      {price} ₪
                    </span>
                    {isSpecialPrice && (
                      <span className="text-[9px] bg-amber-100 text-amber-900 border border-amber-300 px-1 py-0.2 rounded font-bold block mt-0.5">
                        ⭐ سعر خاص
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export const ExcelOneDriveDraftsView: React.FC = () => {
  const {
    invoices,
    createPosSale,
    parties = [],
    inventory = [],
    currencies = [],
    treasuries = [],
    settings,
    currentUser,
    branches = [],
    activeBranchId,
    setActiveTab,
    setEditingPosInvoiceId,
    setSelectedInvoiceForPrint,
    getItemPriceForCustomer,
    getDailyEntrySheet,
    getAllDailyEntryDates,
    markDailyEntryRowsApproved
  } = useAccounting();

  // Full Screen & View Modes
  // 'table' (كافة المسودات في قائمة عريضة) | 'dedicated_invoice' (شاشة الفاتورة الكاملة للمراجعة والاعتماد المتتابع)
  const [viewMode, setViewMode] = useState<'table' | 'dedicated_invoice'>('table');
  const [activeDraftIndex, setActiveDraftIndex] = useState<number>(0);

  // Target Party Type Filter: 'customer' | 'supplier' | 'employee'
  const [posTargetType, setPosTargetType] = useState<'customer' | 'supplier' | 'employee'>('customer');

  // Customer Special Prices Modal
  const [isSpecialPricesModalOpen, setIsSpecialPricesModalOpen] = useState(false);

  // Active Item Autocomplete Index for table
  const [activeItemAutocompleteIdx, setActiveItemAutocompleteIdx] = useState<number | null>(null);

  // Line Attachments Modal State
  const [activeItemForAttachments, setActiveItemForAttachments] = useState<{
    draftId: string;
    itemId: string;
    itemName: string;
    attachments: LineAttachment[];
  } | null>(null);

  // Source Selector
  const [activeSourceTab, setActiveSourceTab] = useState<'url' | 'upload' | 'paste' | 'daily_entry'>('url');
  const [dailyImportDate, setDailyImportDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [sheetUrl, setSheetUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_ONEDRIVE_SHEET_URL;
  });
  const [pasteText, setPasteText] = useState<string>('');
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
    action?: {
      label: string;
      onClick: () => void;
    };
  } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [collapsedDraftIds, setCollapsedDraftIds] = useState<Record<string, boolean>>({});

  // Helper functions for draft accordion collapse & expand
  const toggleDraftCollapse = (draftId: string) => {
    setCollapsedDraftIds(prev => ({
      ...prev,
      [draftId]: !prev[draftId]
    }));
  };

  const toggleAllDraftsCollapse = () => {
    const allCollapsed = draftInvoices.length > 0 && draftInvoices.every(d => collapsedDraftIds[d.id]);
    if (allCollapsed) {
      setCollapsedDraftIds({});
    } else {
      const map: Record<string, boolean> = {};
      draftInvoices.forEach(d => {
        map[d.id] = true;
      });
      setCollapsedDraftIds(map);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Draft Invoices State (Stored in localStorage with auto-date extraction from imported raw cells)
  const [draftInvoices, setDraftInvoices] = useState<MultiItemDraftInvoice[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MULTI_DRAFTS);
      if (saved) {
        const parsed: MultiItemDraftInvoice[] = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed.map(draft => {
            let extractedDate = draft.date;
            // استخراج وتصحيح التاريخ تلقائياً من الصف الخام للإكسل إن وجد
            if (draft.rawHeaders && draft.rawRowCells && draft.rawRowCells.length > 0) {
              const dateIdx = draft.rawHeaders.findIndex(h => {
                const c = String(h || '').trim().toLowerCase();
                return c.includes('تاريخ') || c.includes('date');
              });
              if (dateIdx !== -1) {
                const rawDateCell = draft.rawRowCells[0][dateIdx];
                if (rawDateCell !== undefined && rawDateCell !== null && rawDateCell !== '') {
                  extractedDate = parseAnyDate(rawDateCell);
                }
              }
            } else if (draft.items && draft.items[0]?.rawCells) {
              const dateIdx = draft.rawHeaders?.findIndex(h => {
                const c = String(h || '').trim().toLowerCase();
                return c.includes('تاريخ') || c.includes('date');
              });
              if (dateIdx !== undefined && dateIdx !== -1) {
                const rawDateCell = draft.items[0].rawCells[dateIdx];
                if (rawDateCell !== undefined && rawDateCell !== null && rawDateCell !== '') {
                  extractedDate = parseAnyDate(rawDateCell);
                }
              }
            }
            return {
              ...draft,
              date: parseAnyDate(extractedDate)
            };
          });
        }
      }
    } catch {
      // ignore
    }
    return [];
  });

  // Save drafts to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_MULTI_DRAFTS, JSON.stringify(draftInvoices));
      window.dispatchEvent(new CustomEvent('accounting_drafts_updated'));
    } catch {
      // ignore
    }
  }, [draftInvoices]);

  // Save sheet URL
  useEffect(() => {
    if (sheetUrl) {
      localStorage.setItem(STORAGE_KEY_URL, sheetUrl);
    }
  }, [sheetUrl]);

  // Check if opened from Daily Entry Sheet to directly enter dedicated_invoice mode
  useEffect(() => {
    try {
      const shouldOpenDedicated = localStorage.getItem('accounting_drafts_open_dedicated');
      if (shouldOpenDedicated === 'true') {
        localStorage.removeItem('accounting_drafts_open_dedicated');
        const targetIdx = parseInt(localStorage.getItem('accounting_drafts_active_index') || '0', 10);
        localStorage.removeItem('accounting_drafts_active_index');
        
        // Reload latest drafts from storage to ensure we have the freshly transferred daily entry drafts
        const saved = localStorage.getItem(STORAGE_KEY_MULTI_DRAFTS);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setDraftInvoices(parsed);
          }
        }
        setViewMode('dedicated_invoice');
        setActiveDraftIndex(isNaN(targetIdx) ? 0 : targetIdx);
      }
    } catch (err) {
      console.warn('Dedicated mode check error:', err);
    }
  }, []);

  // Current draft in dedicated invoice view
  const currentDraft = useMemo(() => {
    if (draftInvoices.length === 0) return null;
    const idx = Math.min(Math.max(0, activeDraftIndex), draftInvoices.length - 1);
    return draftInvoices[idx];
  }, [draftInvoices, activeDraftIndex]);

  // Filtered parties based on current target type (عميل / مورد / موظف)
  const filteredTargetParties = useMemo(() => {
    if (posTargetType === 'customer') {
      return parties.filter(p => (p.type === 'customer' || p.type === 'both') && !p.isSubCustomer);
    }
    if (posTargetType === 'supplier') {
      return parties.filter(p => (p.type === 'supplier' || p.type === 'both') && !p.isSubCustomer);
    }
    return parties.filter(p => p.type === 'employee' && !p.isSubCustomer);
  }, [parties, posTargetType]);

  // Currently selected party object for the active draft
  const currentSelectedParty = useMemo(() => {
    if (!currentDraft) return null;
    return parties.find(
      p =>
        (currentDraft.customerId && p.id === currentDraft.customerId) ||
        (p.name && p.name.trim().toLowerCase() === currentDraft.customerName.trim().toLowerCase())
    ) || null;
  }, [parties, currentDraft]);

  // Filtered drafts for list view
  const displayedDrafts = useMemo(() => {
    if (!searchFilter.trim()) return draftInvoices;
    const q = searchFilter.toLowerCase().trim();
    return draftInvoices.filter(
      d =>
        d.customerName.toLowerCase().includes(q) ||
        (d.subCustomerName && d.subCustomerName.toLowerCase().includes(q)) ||
        d.date.includes(q) ||
        d.items.some(
          it =>
            it.itemName.toLowerCase().includes(q) ||
            (it.itemCode && it.itemCode.toLowerCase().includes(q)) ||
            (it.notes && it.notes.toLowerCase().includes(q))
        )
    );
  }, [draftInvoices, searchFilter]);

  // Financial Stats
  const selectedDrafts = useMemo(() => draftInvoices.filter(d => d.selected), [draftInvoices]);
  const totalDraftsAmount = useMemo(
    () => draftInvoices.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0),
    [draftInvoices]
  );
  const selectedDraftsAmount = useMemo(
    () => selectedDrafts.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0),
    [selectedDrafts]
  );

  // =========================================================================
  // ACTIONS & HANDLERS
  // =========================================================================

  // 1. Fetch from live OneDrive URL
  const handleFetchFromLiveUrl = async () => {
    if (!sheetUrl.trim()) {
      setStatusMessage({ type: 'error', text: 'يرجى إدخال رابط مشاركة الإكسل أولاً.' });
      return;
    }

    setIsLoading(true);
    setStatusMessage({ type: 'info', text: 'جاري الاتصال وسحب البيانات من OneDrive...' });

    try {
      const res = await fetch('/api/fetch-live-sheet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sheetUrl.trim() })
      });

      if (!res.ok) {
        throw new Error(`تعذر جلب الملف من الرابط (رمز الخطأ: ${res.status}). يمكنك تجربة رفع الملف مباشرة.`);
      }

      const data = await res.json();
      if (!data.success || !data.dataBase64) {
        setStatusMessage({
          type: data.isProtectedOneDrive ? 'info' : 'error',
          text: data.message || 'تعذر استخراج بيانات الإكسل من الرابط. يمكنك تنزيل الملف ورفعه عبر زر [رفع ملف Excel] أو نسخ الجدول ولصقه.'
        });
        setIsLoading(false);
        return;
      }

      const binaryString = window.atob(data.dataBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const parsedRows = parseExcelBuffer(bytes.buffer);
      if (parsedRows.length === 0) {
        setStatusMessage({ type: 'error', text: 'لم يتم العثور على أسطر صالحة أو عناوين مطابقة داخل الملف.' });
        setIsLoading(false);
        return;
      }

      const newMultiDrafts = convertSingleRowsToMultiDrafts(parsedRows, false, parties, inventory, treasuries);
      setDraftInvoices(prev => [...newMultiDrafts, ...prev]);
      setStatusMessage({
        type: 'success',
        text: `تم استيراد ومطابقة ${newMultiDrafts.length} مسودة فاتورة بنجاح مع قاعدة البيانات!`
      });
      posSound.playSuccessBeep();
    } catch (err: any) {
      console.warn('Sheet fetch notice:', err?.message || err);
      setStatusMessage({
        type: 'info',
        text: 'رابط الملف السحابي محمي ويتطلب تنزيل الملف. يمكنك فتحه وتنزيله ثم رفعه عبر زر [رفع ملف Excel] أو نسخ البيانات ولصقها.'
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 2. Handle Upload Local File (.xlsx / .xls / .csv)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setStatusMessage({ type: 'info', text: 'جاري معالجة ومطابقة ملف الإكسل...' });

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result as ArrayBuffer;
        const parsedRows = parseExcelBuffer(buffer);

        if (parsedRows.length === 0) {
          setStatusMessage({ type: 'error', text: 'لم يتم العثور على أسطر صالحة أو مطابقة في الملف.' });
          setIsLoading(false);
          return;
        }

        const newMultiDrafts = convertSingleRowsToMultiDrafts(parsedRows, false, parties, inventory, treasuries);
        setDraftInvoices(prev => [...newMultiDrafts, ...prev]);
        setStatusMessage({
          type: 'success',
          text: `تم استيراد ${newMultiDrafts.length} مسودة فاتورة ومطابقة الأصناف والعملاء بنجاح!`
        });
        posSound.playSuccessBeep();
      } catch (err: any) {
        setStatusMessage({ type: 'error', text: 'حدث خطأ أثناء قراءة ملف الإكسل.' });
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 3. Handle Parse Paste Text
  const handleParsePaste = () => {
    if (!pasteText.trim()) {
      setStatusMessage({ type: 'error', text: 'يرجى لصق بيانات الجدول أولاً' });
      return;
    }

    try {
      const parsedRows = parseClipboardText(pasteText);
      if (parsedRows.length === 0) {
        setStatusMessage({ type: 'error', text: 'لم نتمكن من قراءة أسطر الجدول. تأكد من نسخ صف العناوين والبيانات معاً.' });
        return;
      }

      const newMultiDrafts = convertSingleRowsToMultiDrafts(parsedRows, false, parties, inventory, treasuries);
      setDraftInvoices(prev => [...newMultiDrafts, ...prev]);
      setPasteText('');
      setStatusMessage({
        type: 'success',
        text: `تم استيراد ${newMultiDrafts.length} مسودة فاتورة ومطابقة البيانات بنجاح!`
      });
      posSound.playSuccessBeep();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: 'حدث خطأ أثناء معالجة النص المنسوخ.' });
    }
  };

  // 4. Handle Import from Daily Entry Sheet (كشف الإدخال اليومي)
  const dailyEntryForDate = useMemo(() => {
    return getDailyEntrySheet(dailyImportDate);
  }, [dailyImportDate, getDailyEntrySheet]);

  const dailyEntryTotals = useMemo(() => {
    if (!dailyEntryForDate || !dailyEntryForDate.rows) return { totalRequired: 0, totalPaid: 0, validRowsCount: 0 };
    return calculateDailyEntryTotals(dailyEntryForDate.rows);
  }, [dailyEntryForDate]);

  const allDailyDates = useMemo(() => {
    return getAllDailyEntryDates();
  }, [getAllDailyEntryDates, activeSourceTab]);

  const handleImportFromDailyEntry = () => {
    const sheet = getDailyEntrySheet(dailyImportDate);
    if (!sheet || !sheet.rows || sheet.rows.length === 0) {
      setStatusMessage({
        type: 'error',
        text: `لا توجد حركات مسجلة في كشف الإدخال اليومي لتاريخ ${dailyImportDate}.`
      });
      return;
    }

    const newMultiDrafts = convertDailyEntryRowsToDrafts(
      dailyImportDate,
      sheet.rows,
      parties,
      inventory,
      treasuries
    );

    if (newMultiDrafts.length === 0) {
      setStatusMessage({
        type: 'error',
        text: `لم يتم العثور على أسطر صالحة للترحيل في كشف يوم ${dailyImportDate}. يرجى التأكد من إدخال اسم الزبون أو الصنف والمبلغ المطلوب.`
      });
      return;
    }

    setDraftInvoices(prev => {
      const combined = [...newMultiDrafts, ...prev.filter(d => !newMultiDrafts.some(n => n.id === d.id))];
      try {
        localStorage.setItem(STORAGE_KEY_MULTI_DRAFTS, JSON.stringify(combined));
      } catch (err) {
        console.error('Failed to save drafts:', err);
      }
      return combined;
    });

    posSound.cash();
    setStatusMessage({
      type: 'success',
      text: `تم استيراد ${newMultiDrafts.length} مسودة فاتورة بنجاح من كشف الإدخال اليومي ليوم ${dailyImportDate}! يمكنك مراجعتها واعتمادها أدناه.`
    });
  };

  // Add brand new empty draft invoice
  const handleAddNewDraftInvoice = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultCashCust = parties.find(p => p.code === 'CUST-0001' || p.name.includes('كاشير') || p.name.includes('نقدي')) || parties[0];
    const newDraft: MultiItemDraftInvoice = {
      id: `mdraft-new-${Date.now()}`,
      date: todayStr,
      customerId: defaultCashCust?.id,
      customerName: defaultCashCust?.name || 'عميل كاشير نقدي',
      paymentMethod: 'cash',
      items: [
        {
          id: `item-${Date.now()}`,
          itemName: '',
          itemCode: '',
          count: 1,
          quantity: 1,
          unitPrice: 0,
          totalAmount: 0
        }
      ],
      totalAmount: 0,
      selected: true,
      isApproved: false,
      currency: 'ILS',
      currencySymbol: '₪',
      exchangeRate: 1.0,
      cashCurrency: 'ILS',
      cashExchangeRate: 1.0,
      cashTreasuryCode: '1101',
      bankCurrency: 'ILS',
      bankExchangeRate: 1.0,
      bankTreasuryCode: '1102'
    };

    setDraftInvoices(prev => [newDraft, ...prev]);
    setActiveDraftIndex(0);
    setViewMode('dedicated_invoice');
  };

  // Update specific draft in state
  const handleUpdateDraft = (draftId: string, updates: Partial<MultiItemDraftInvoice>) => {
    setDraftInvoices(prev =>
      prev.map(d => {
        if (d.id !== draftId) return d;
        const updated = { ...d, ...updates };

        // Re-evaluate item prices if customerId changed
        if (updates.customerId && updates.customerId !== d.customerId) {
          updated.items = updated.items.map(it => {
            const invItem = inventory.find(
              i =>
                (it.itemCode && i.code?.toLowerCase() === it.itemCode.toLowerCase()) ||
                (it.matchedInventoryId && i.id === it.matchedInventoryId) ||
                i.name.trim().toLowerCase() === it.itemName.trim().toLowerCase()
            );
            if (invItem) {
              const { price } = getItemPriceForCustomer(invItem, updates.customerId);
              const qty = it.quantity || 1;
              return {
                ...it,
                unitPrice: price,
                totalAmount: Number((qty * price).toFixed(2))
              };
            }
            return it;
          });
        }

        const subtotal = (updated.items || []).reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0);
        let discountVal = 0;
        if (updated.discount && updated.discount > 0) {
          if (updated.discountType === 'percent') {
            discountVal = (subtotal * updated.discount) / 100;
          } else {
            discountVal = Math.min(subtotal, updated.discount);
          }
        }
        updated.totalAmount = Math.max(0, Number((subtotal - discountVal).toFixed(2)));

        return updated;
      })
    );
  };

  // Add Item to a specific draft
  const handleAddItemToDraft = (draftId: string) => {
    setDraftInvoices(prev =>
      prev.map(d => {
        if (d.id !== draftId) return d;
        const newItem: DraftInvoiceItem = {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          itemName: '',
          itemCode: '',
          length: 1,
          width: 1,
          count: 1,
          quantity: 1,
          unitPrice: 0,
          totalAmount: 0
        };
        const updatedItems = [...d.items, newItem];
        const subtotal = updatedItems.reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0);
        return {
          ...d,
          items: updatedItems,
          totalAmount: subtotal
        };
      })
    );
    posSound.playSuccessBeep();
  };

  // Add Delivery Service to draft (+ خدمة توصيل)
  const handleAddDeliveryServiceToDraft = (draftId: string) => {
    setDraftInvoices(prev =>
      prev.map(d => {
        if (d.id !== draftId) return d;
        const deliveryItem: DraftInvoiceItem = {
          id: `item-dlv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          itemName: 'خدمة توصيل',
          itemCode: 'DELIVERY',
          unit: 'خدمة',
          length: 1,
          width: 1,
          count: 1,
          quantity: 1,
          unitPrice: 15,
          totalAmount: 15,
          notes: 'خدمة توصيل مباشر',
          matchedInventoryId: 'srv-delivery'
        };
        const updatedItems = [...d.items, deliveryItem];
        const subtotal = updatedItems.reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0);
        return {
          ...d,
          items: updatedItems,
          totalAmount: subtotal
        };
      })
    );
    posSound.playSuccessBeep();
  };

  // Remove Item from a draft
  const handleRemoveItemFromDraft = (draftId: string, itemId: string) => {
    setDraftInvoices(prev =>
      prev.map(d => {
        if (d.id !== draftId) return d;
        if (d.items.length <= 1) {
          alert('يجب أن تحتوي الفاتورة على بند واحد على الأقل.');
          return d;
        }
        const updatedItems = d.items.filter(it => it.id !== itemId);
        const subtotal = updatedItems.reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0);
        return {
          ...d,
          items: updatedItems,
          totalAmount: subtotal
        };
      })
    );
  };

  // Update specific item inside draft (with Live Inventory Matching on Typing)
  const handleUpdateItem = (
    draftId: string,
    itemId: string,
    itemUpdates: Partial<DraftInvoiceItem>
  ) => {
    const targetDraft = draftInvoices.find(d => d.id === draftId);

    setDraftInvoices(prev =>
      prev.map(d => {
        if (d.id !== draftId) return d;
        const updatedItems = d.items.map(it => {
          if (it.id !== itemId) return it;
          const merged = { ...it, ...itemUpdates };

          // Live Inventory Match on typing itemName
          if (itemUpdates.itemName !== undefined && itemUpdates.itemName.trim()) {
            const normNew = normalizeArabicText(itemUpdates.itemName);
            const matchedInv = inventory.find(i => {
              const normI = normalizeArabicText(i.name);
              const codeI = i.code.toLowerCase().trim();
              return normNew && (normI === normNew || normI.includes(normNew) || codeI === itemUpdates.itemName?.trim().toLowerCase());
            });

            if (matchedInv) {
              const { price } = getItemPriceForCustomer(matchedInv, targetDraft?.customerId);
              merged.itemCode = matchedInv.code;
              merged.matchedInventoryId = matchedInv.id;
              merged.matchedInventoryName = matchedInv.name;
              merged.unit = matchedInv.unit;
              if (!merged.unitPrice || merged.unitPrice === 0) {
                merged.unitPrice = price;
              }
            }
          }

          // Check if item requires length and width
          const invItem = inventory.find(
            i =>
              (merged.itemCode && i.code?.toLowerCase() === merged.itemCode.toLowerCase()) ||
              (merged.matchedInventoryId && i.id === merged.matchedInventoryId) ||
              i.name.trim().toLowerCase() === merged.itemName.trim().toLowerCase()
          );
          const isDim = invItem
            ? isSquareMeterUnit(invItem.unit, invItem.unitCalculationType)
            : (merged.unit ? isSquareMeterUnit(merged.unit) : false);

          if (!isDim) {
            // صنف لا يتطلب طول وعرض: يقفل الطول والعرض والعدد، والطول والعرض 1، والعدد مطابق للكمية دائماً
            merged.length = 1;
            merged.width = 1;
            if (itemUpdates.quantity !== undefined) {
              const q = parseFloat(String(itemUpdates.quantity)) || 0;
              merged.quantity = q;
              merged.count = q;
            } else {
              merged.count = merged.quantity || 1;
            }
          } else {
            // صنف يتطلب أبعاداً (متر مربع): الكمية = الطول × العرض × العدد
            if (
              itemUpdates.length !== undefined ||
              itemUpdates.width !== undefined ||
              itemUpdates.count !== undefined
            ) {
              const l = merged.length || 0;
              const w = merged.width || 0;
              const c = merged.count || 1;
              if (l > 0 && w > 0) {
                merged.quantity = Number((l * w * c).toFixed(3));
              } else if (c > 0 && itemUpdates.quantity === undefined) {
                merged.quantity = c;
              }
            }
          }

          // Recalculate totalAmount
          const qty = merged.quantity || 1;
          const prc = merged.unitPrice || 0;
          merged.totalAmount = Number((qty * prc).toFixed(2));

          return merged;
        });

        const subtotal = updatedItems.reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0);
        let discountVal = 0;
        if (d.discount && d.discount > 0) {
          if (d.discountType === 'percent') {
            discountVal = (subtotal * d.discount) / 100;
          } else {
            discountVal = Math.min(subtotal, d.discount);
          }
        }
        const totalAmount = Math.max(0, Number((subtotal - discountVal).toFixed(2)));

        return {
          ...d,
          items: updatedItems,
          totalAmount
        };
      })
    );
  };

  // Select Item from Inventory Autocomplete (Applies Special Price if Customer has one)
  const handleSelectItemFromInventory = (
    draftId: string,
    itemId: string,
    invItem: InventoryItem
  ) => {
    const targetDraft = draftInvoices.find(d => d.id === draftId);
    const { price } = getItemPriceForCustomer(invItem, targetDraft?.customerId);

    handleUpdateItem(draftId, itemId, {
      itemCode: invItem.code,
      itemName: invItem.name,
      unitPrice: price,
      matchedInventoryId: invItem.id,
      matchedInventoryName: invItem.name
    });
    setActiveItemAutocompleteIdx(null);
  };

  // Save attachments for an item
  const handleSaveItemAttachments = (attachments: LineAttachment[]) => {
    if (!activeItemForAttachments) return;
    handleUpdateItem(activeItemForAttachments.draftId, activeItemForAttachments.itemId, {
      attachments
    });
    setActiveItemForAttachments(null);
  };

  // Approve single draft invoice as real POS Sale (updates inventory, treasuries, journal, party balance, next invoice sequence, removes from drafts)
  const handleApproveDraft = (draft: MultiItemDraftInvoice, moveToNext = true, openInPos = false) => {
    if (!draft) {
      setStatusMessage({ type: 'error', text: 'خطأ: لم يتم العثور على بيانات المسودة.' });
      return null;
    }

    try {
      const safeItems = Array.isArray(draft.items) ? draft.items : [];
      if (safeItems.length === 0) {
        setStatusMessage({ type: 'error', text: 'لا يمكن اعتماد فاتورة فارغة لا تحتوي على أي بنود أو أصناف.' });
        return null;
      }

      const subtotal = safeItems.reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0);
      let discountVal = 0;
      if (draft.discount && draft.discount > 0) {
        if (draft.discountType === 'percent') {
          discountVal = Number(((subtotal * draft.discount) / 100).toFixed(2));
        } else {
          discountVal = Number(Math.min(subtotal, draft.discount).toFixed(2));
        }
      }
      const netTotal = Math.max(0, Number((subtotal - discountVal).toFixed(2)));

      // Payment calculations
      const cRate = draft.cashExchangeRate && draft.cashExchangeRate > 0 ? draft.cashExchangeRate : 1.0;
      const bRate = draft.bankExchangeRate && draft.bankExchangeRate > 0 ? draft.bankExchangeRate : 1.0;
      const rawCash = parseFloat(draft.cashAmount || '') || 0;
      const rawBank = parseFloat(draft.bankAmount || '') || 0;
      const cashPaidBase = Number((rawCash * cRate).toFixed(2));
      const bankPaidBase = Number((rawBank * bRate).toFixed(2));
      const totalPaid = Number((cashPaidBase + bankPaidBase).toFixed(2));

      // في حال لم يدخل مبلغ في النقدي أو البنكي تحفظ الفاتورة كأجل (دين على الزبون)
      const isZeroPayment = rawCash <= 0 && rawBank <= 0;
      const effectivePaymentMethod: PaymentMethod = isZeroPayment
        ? 'credit'
        : (draft.paymentMethod && draft.paymentMethod !== 'cash'
            ? draft.paymentMethod
            : (rawCash > 0 ? 'cash' : 'bank_transfer'));

      // Build PosSaleItems
      const posItems = safeItems.map((it, idx) => {
        const finalName = (it.itemName || '').trim() || it.matchedInventoryName || (it.notes || '').trim() || `بند مطبوعات #${idx + 1}`;
        const finalCode = (it.itemCode || '').trim() || `PRI-${String(idx + 1).padStart(4, '0')}`;

        let invItem = inventory.find(
          i =>
            (it.itemCode && (i.code || '').toLowerCase() === it.itemCode.toLowerCase()) ||
            (it.matchedInventoryId && i.id === it.matchedInventoryId) ||
            ((i.name || '').trim().toLowerCase() === finalName.toLowerCase())
        );

        if (!invItem) {
          invItem = {
            id: `inv-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
            name: finalName,
            code: finalCode,
            barcode: finalCode,
            category: 'مطبوعات',
            unit: 'قطعة',
            purchasePrice: 0,
            costPrice: 0,
            sellingPrice: it.unitPrice || 0,
            stockQuantity: 1000,
            quantity: 1000,
            minQuantity: 0,
            minAlertQuantity: 0,
            allowFractional: true
          };
        }

        return {
          item: invItem,
          count: it.count || 1,
          length: it.length,
          width: it.width,
          quantity: it.quantity || 1,
          unitPrice: it.unitPrice || 0,
          discount: 0,
          total: it.totalAmount || 0,
          notes: it.notes || '',
          attachments: it.attachments || []
        };
      });

      const draftCustName = (draft.customerName || '').trim() || 'عميل كاشير نقدي';
      let customerParty = parties.find(
        p =>
          (draft.customerId && p.id === draft.customerId) ||
          ((p.name || '').trim().toLowerCase() === draftCustName.toLowerCase())
      );

      if (!customerParty) {
        customerParty = {
          id: draft.customerId || `party-cust-${Date.now()}`,
          name: draftCustName,
          type: 'customer',
          balance: 0
        };
      }

      // Local/offline drafts must use temporary numbers until confirmed and allocated by central cloud transaction
      const generatedInvoiceNumber = (draft.invoiceNumber && draft.invoiceNumber.startsWith('TEMP-'))
        ? draft.invoiceNumber
        : `TEMP-DRAFT-${draft.id || crypto.randomUUID().slice(0, 8)}`;

      // Date resolution: strictly take and parse invoice date from imported file
      const finalInvoiceDate = parseAnyDate(draft.date);

      // Call accounting createPosSale
      const savedInvoice = createPosSale(
        posItems,
        customerParty.name,
        effectivePaymentMethod,
        customerParty.id,
        draft.notes || '',
        {
          invoiceNumber: generatedInvoiceNumber,
          date: finalInvoiceDate,
          overallDiscount: discountVal,
          paidAmount: isZeroPayment ? 0 : totalPaid,
          subCustomerId: draft.subCustomerId,
          subCustomerName: (draft.subCustomerName || '').trim() || undefined,
          subCustomerPhone: draft.subCustomerPhone,
          currency: draft.currency || 'ILS',
          currencySymbol: draft.currencySymbol || '₪',
          exchangeRate: draft.exchangeRate || 1.0,
          cashPaidAmount: isZeroPayment ? 0 : (rawCash > 0 ? rawCash : cashPaidBase),
          cashCurrency: draft.cashCurrency || 'ILS',
          cashExchangeRate: cRate,
          cashTreasuryCode: draft.cashTreasuryCode || '1101',
          bankPaidAmount: isZeroPayment ? 0 : (rawBank > 0 ? rawBank : bankPaidBase),
          bankCurrency: draft.bankCurrency || 'ILS',
          bankExchangeRate: bRate,
          bankTreasuryCode: draft.bankTreasuryCode || '1102',
          paymentNotes: draft.paymentNotes,
          userId: currentUser?.id,
          userName: currentUser?.name || currentUser?.fullName || 'مدير النظام',
          workflowStatus: 'new'
        }
      );

      // (Sequence storage removed to prevent numbering jumps)

      // تعليم وتظليل أسطر كشف الإدخال اليومي المعتمدة فوراً وتوثيق رقم الفاتورة
      if (draft.sourceDailyDate && draft.sourceDailyRowIds && draft.sourceDailyRowIds.length > 0) {
        markDailyEntryRowsApprovedInStorage(
          draft.sourceDailyDate,
          draft.sourceDailyRowIds,
          savedInvoice.id,
          generatedInvoiceNumber
        );
        if (markDailyEntryRowsApproved) {
          markDailyEntryRowsApproved(
            draft.sourceDailyDate,
            draft.sourceDailyRowIds,
            savedInvoice.id,
            generatedInvoiceNumber
          );
        }
      }

      // 1. مسح الفاتورة من المسودات وتحديث التخزين المحلي فوراً لأنها أصبحت فاتورة كاشير فعلية
      setDraftInvoices(prev => {
        const next = prev.filter(d => d.id !== draft.id);
        try {
          localStorage.setItem(STORAGE_KEY_MULTI_DRAFTS, JSON.stringify(next));
        } catch (e) {
          console.error('Failed to save updated drafts to localStorage:', e);
        }
        return next;
      });

      try {
        posSound.playCashDrawer();
      } catch (e) {
        console.error(e);
      }

      // 3. في حال طلب الانتقال الفوري للتعديل في شاشة الكاشير
      if (openInPos && savedInvoice) {
        setEditingPosInvoiceId(savedInvoice.id);
        setActiveTab('pos');
        setStatusMessage({
          type: 'success',
          text: `تم اعتماد الفاتورة (${generatedInvoiceNumber}) وحذفها من المسودات، وجاري فتحها في شاشة الكاشير للتعديل!`,
          action: {
            label: 'الانتقال للكاشير ➔',
            onClick: () => {
              setEditingPosInvoiceId(savedInvoice.id);
              setActiveTab('pos');
            }
          }
        });
        return savedInvoice;
      }

      setStatusMessage({
        type: 'success',
        text: `تم اعتماد وحفظ الفاتورة (${generatedInvoiceNumber} - ${customerParty.name}) كفاتورة كاشير فعلية وحذفها من المسودات!`,
        action: savedInvoice ? {
          label: '✏️ تعديل الفاتورة في شاشة الكاشير',
          onClick: () => {
            setEditingPosInvoiceId(savedInvoice.id);
            setActiveTab('pos');
          }
        } : undefined
      });

      if (moveToNext) {
        if (draftInvoices.length <= 1) {
          setViewMode('table');
          setActiveDraftIndex(0);
          setStatusMessage({
            type: 'success',
            text: 'تهانينا! تم اعتماد وحفظ كافة المسودات في الطابور بالكامل كفواتير كاشير رسمية!',
            action: savedInvoice ? {
              label: 'تعديل الفاتورة في شاشة الكاشير ➔',
              onClick: () => {
                setEditingPosInvoiceId(savedInvoice.id);
                setActiveTab('pos');
              }
            } : undefined
          });
        } else {
          setActiveDraftIndex(prevIdx => {
            const remainingCount = draftInvoices.length - 1;
            if (prevIdx >= remainingCount) {
              return Math.max(0, remainingCount - 1);
            }
            return prevIdx;
          });
        }
      }

      return savedInvoice;
    } catch (err: any) {
      console.error("Error creating POS Sale from draft approval:", err);
      setStatusMessage({
        type: 'error',
        text: `خطأ أثناء اعتماد الفاتورة: ${err?.message || err || 'يرجى التحقق من المدخلات'}`
      });
      return null;
    }
  };

  // Approve all selected drafts
  const handleApproveSelected = () => {
    if (selectedDrafts.length === 0) {
      setStatusMessage({ type: 'error', text: 'يرجى تحديد مسودة واحدة على الأقل للاعتماد.' });
      return;
    }

    const count = selectedDrafts.length;
    let lastSavedInv: any = null;
    selectedDrafts.forEach(draft => {
      const res = handleApproveDraft(draft, false, false);
      if (res) lastSavedInv = res;
    });

    setStatusMessage({
      type: 'success',
      text: `تهانينا! تم اعتماد وحفظ ${count} فاتورة بنجاح كفواتير كاشير رسمية وحذفها نهائياً من المسودات!`,
      action: lastSavedInv ? {
        label: 'تعديل آخر فاتورة في الكاشير ➔',
        onClick: () => {
          setEditingPosInvoiceId(lastSavedInv.id);
          setActiveTab('pos');
        }
      } : {
        label: 'عرض فواتير المبيعات ➔',
        onClick: () => setActiveTab('invoices')
      }
    });
  };

  // Keyboard shortcut listener for Ctrl+Enter
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (viewMode === 'dedicated_invoice' && currentDraft) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          handleApproveDraft(currentDraft, true);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewMode, currentDraft, draftInvoices]);

  // Helper to render Top Blue Header Bar for Draft Invoices (Dark Blue Header & Collapsible Accordion)
  const renderDraftTopHeaderBar = (
    draft: MultiItemDraftInvoice,
    indexDisplay: number,
    isCollapsed?: boolean,
    onToggleCollapse?: () => void,
    customHeaderBg?: string,
    customBadgeBg?: string
  ) => {
    const isFromExcel = Boolean(draft.rawHeaders || draft.rawRowCells || draft.items[0]?.rawCells);
    const headerBgClass = customHeaderBg || 'bg-[#183457] text-white border border-[#0f2845]';
    const badgeBgClass = customBadgeBg || 'bg-blue-600 text-white';

    return (
      <div className={`${headerBgClass} p-3 rounded-2xl flex flex-wrap items-center justify-between gap-3 sm:gap-4 shadow-md transition-all`}>
        {/* Left Side: Target Type Toggle Button + Customer Autocomplete + SubCustomer + Date */}
        <div className="flex flex-wrap items-center gap-2.5 sm:gap-3 text-xs flex-1 min-w-0">
          {/* Draft Queue Badge */}
          <div className="flex items-center gap-1.5 bg-[#0e2138]/90 px-3 py-1.5 rounded-xl border border-white/20 shrink-0">
            <span className={`w-6 h-6 rounded-full ${badgeBgClass} text-xs font-black flex items-center justify-center font-mono shadow-2xs`}>
              {indexDisplay}
            </span>
            <span className="font-bold text-xs text-slate-100">مسودة فاتورة</span>
          </div>

          {/* Excel Source Badge (الاكتفاء بأيقونة إكسل الخضراء المميزة فقط دون كتابة) */}
          {isFromExcel && (
            <span 
              className="p-1.5 bg-emerald-500/20 border border-emerald-400/60 text-emerald-300 rounded-xl flex items-center justify-center shrink-0 shadow-2xs"
              title="مستورد من ملف Excel / OneDrive"
            >
              <FileSpreadsheet className="w-4.5 h-4.5 text-emerald-400" />
            </span>
          )}

          {/* Compact Summary Badges when Collapsed (عند ضب المسودة) */}
          {isCollapsed && (
            <div className="flex items-center gap-2 bg-black/40 border border-white/20 px-3 py-1.5 rounded-xl shrink-0 shadow-inner">
              <span className="font-bold text-amber-300 text-xs flex items-center gap-1">
                📦 <strong className="font-mono text-white text-xs">{draft.items.length}</strong> أصناف
              </span>
              <span className="text-white/30">|</span>
              <span className="font-mono font-black text-emerald-300 text-xs">
                ₪ {draft.totalAmount.toFixed(2)}
              </span>
            </div>
          )}

          {/* 1. Target Type Toggle Button (حذف كلمة الطرف والإبقاء على أيقونة التبديل فقط) */}
          <div className="flex items-center bg-[#0e2138]/90 p-1.5 rounded-xl border border-white/20 shrink-0">
            <button
              type="button"
              onClick={() => {
                const types: ('customer' | 'supplier' | 'employee')[] = ['customer', 'supplier', 'employee'];
                const nextType = types[(types.indexOf(posTargetType) + 1) % types.length];
                setPosTargetType(nextType);
              }}
              className="bg-blue-600 hover:bg-blue-500 text-white rounded-xl p-1.5 transition flex items-center justify-center cursor-pointer shadow-2xs select-none active:scale-95"
              title={`تبديل نوع الحساب (نوع الحساب الحالي: ${posTargetType === 'customer' ? 'عميل' : posTargetType === 'supplier' ? 'مورد' : 'موظف'})`}
            >
              <RefreshCw className="w-3.5 h-3.5 text-white" />
            </button>
          </div>

          {/* 2. Main Customer Autocomplete Search Input (تكبير اسم الزبون الرئيسي) */}
          <div className="w-48 sm:w-60 min-w-[190px] shrink-0">
            <PosCustomerSearchInput
              customers={filteredTargetParties}
              selectedCustomerId={draft.customerId || ''}
              customerName={draft.customerName || ''}
              onSelectCustomer={party => {
                handleUpdateDraft(draft.id, {
                  customerId: party.id,
                  customerName: party.name,
                  customerPhone: party.phone || draft.customerPhone
                });
              }}
              onChangeCustomerName={name => handleUpdateDraft(draft.id, { customerName: name })}
              placeholder={
                posTargetType === 'customer'
                  ? "ابحث باسم الزبون الرئيسي..."
                  : posTargetType === 'supplier'
                  ? "ابحث باسم المورد الرئيسي..."
                  : "ابحث باسم الموظف الرئيسي..."
              }
              clearOnFocus={false}
            />
          </div>

          {/* 3. Sub-Customer Name Input (تكبير اسم الزبون الفرعي) */}
          <div className="flex items-center gap-1.5 bg-amber-50/95 border border-amber-400 px-3 py-1.5 rounded-xl text-xs w-48 sm:w-60 min-w-[190px] shrink-0 shadow-2xs">
            <Building2 className="w-4 h-4 text-amber-800 shrink-0" />
            <input
              type="text"
              value={draft.subCustomerName || ''}
              onChange={e => handleUpdateDraft(draft.id, { subCustomerName: e.target.value })}
              placeholder="اسم الزبون الفرعي..."
              className="w-full bg-transparent text-xs sm:text-sm font-black text-slate-900 outline-none placeholder:text-amber-800/60"
            />
          </div>

          {/* 4. Date Input (مساحة واسعة ومنفصلة للتاريخ) */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 px-3 py-1.5 rounded-xl text-xs w-40 sm:w-44 min-w-[150px] shrink-0 shadow-2xs">
            <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
            <input
              type="date"
              value={parseAnyDate(draft.date)}
              onChange={e => handleUpdateDraft(draft.id, { date: parseAnyDate(e.target.value) })}
              className="w-full bg-transparent text-xs font-mono font-black text-slate-900 outline-none cursor-pointer"
            />
          </div>

          {/* 5. Special Prices Button */}
          {currentSelectedParty && (
            <button
              type="button"
              onClick={() => setIsSpecialPricesModalOpen(true)}
              className="px-3 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/60 text-amber-300 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shrink-0 shadow-2xs"
              title="تحديد أو عرض الأسعار الخاصة بهذا العميل"
            >
              <DollarSign className="w-4 h-4 text-amber-400" />
              <span>الأسعار الخاصة</span>
            </button>
          )}
        </div>

        {/* Right Side: Direct Action Buttons + Collapsible Toggle */}
        <div className="flex items-center gap-2 shrink-0">
          {viewMode === 'dedicated_invoice' ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleApproveDraft(draft, true, true)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-black flex items-center gap-1 shadow-md transition cursor-pointer active:scale-95"
                title="اعتماد الفاتورة تلقائياً كفاتورة كاشير وحذفها من المسودات وفتحها مباشرة للتعديل في شاشة الكاشير"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>اعتماد وتعديل بالكاشير ➔</span>
              </button>

              <button
                type="button"
                onClick={() => handleApproveDraft(draft, true, false)}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-black flex items-center gap-1.5 shadow-md transition cursor-pointer active:scale-95"
                title="اعتماد الفاتورة تلقائياً كفاتورة كاشير فعلية وحذفها من المسودات والانتقال للتالية"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>✔ اعتماد كاشير والتالية</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  const realIdx = draftInvoices.findIndex(d => d.id === draft.id);
                  setActiveDraftIndex(realIdx !== -1 ? realIdx : indexDisplay - 1);
                  setViewMode('dedicated_invoice');
                }}
                className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                title="مراجعة الفاتورة في الشاشة الكاملة"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>مراجعة</span>
              </button>

              <button
                type="button"
                onClick={() => handleApproveDraft(draft, false, true)}
                className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-xs"
                title="اعتماد الفاتورة تلقائياً كفاتورة كاشير وحذفها من المسودات وفتحها فوراً للتعديل في شاشة الكاشير"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>اعتماد وتعديل بالكاشير ➔</span>
              </button>

              <button
                type="button"
                onClick={() => handleApproveDraft(draft, false, false)}
                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer shadow-xs"
                title="اعتماد الفاتورة تلقائياً كفاتورة كاشير فعلية وحذفها نهائياً من المسودات"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>اعتماد وحفظ</span>
              </button>
            </div>
          )}

          {/* Delete Button */}
          <button
            type="button"
            onClick={() => {
              if (window.confirm('هل تريد حذف هذه المسودة من الطابور؟')) {
                setDraftInvoices(prev => prev.filter(d => d.id !== draft.id));
              }
            }}
            className="p-1.5 text-slate-300 hover:text-rose-400 hover:bg-black/30 rounded-lg transition cursor-pointer"
            title="حذف المسودة"
          >
            <Trash2 className="w-4 h-4" />
          </button>

          {/* Collapsible Accordion Toggle Button (زر ضب وتوسيع المسودة - الاكتفاء بالسهم فقط) */}
          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              className={`p-1.5 rounded-xl transition cursor-pointer shadow-2xs select-none active:scale-95 flex items-center justify-center ${
                isCollapsed
                  ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold border border-amber-300 animate-pulse'
                  : 'bg-white/15 hover:bg-white/25 text-white border border-white/20'
              }`}
              title={isCollapsed ? 'توسيع عرض تفاصيل وأصناف الفاتورة' : 'ضب الفاتورة لتصغير الحجم'}
            >
              {isCollapsed ? (
                <ChevronDown className="w-5 h-5 text-slate-950 font-black" />
              ) : (
                <ChevronUp className="w-5 h-5 text-white animate-bounce-slow" />
              )}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="w-full px-2 sm:px-4 py-2 sm:py-3 space-y-3 font-sans text-slate-800" dir="rtl">
      {/* 1. Header Banner & Action Bar */}
      <div className="bg-white p-3.5 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-emerald-700 text-white flex items-center justify-center font-bold shadow-md shadow-emerald-700/20 shrink-0">
            <FileSpreadsheet className="w-6 h-6 text-emerald-100" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                إدارة واستيراد مسودات فواتير Excel و OneDrive
              </h2>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-300 font-bold px-2 py-0.5 rounded-full">
                كاشير سريع متكامل
              </span>
            </div>
          </div>
        </div>

        {/* Stats & Quick Navigation (العنوان وجنبه التفاصيل سطر واحد) */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="bg-slate-50 px-3.5 py-1.5 rounded-xl border border-slate-200 text-xs flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-bold">المسودات:</span>
              <strong className="text-slate-800 font-mono font-bold">{draftInvoices.length} مسودة</strong>
            </div>
            <div className="h-5 w-px bg-slate-300" />
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-bold">المبلغ الإجمالي:</span>
              <strong className="text-emerald-700 font-mono font-black text-sm">
                {totalDraftsAmount.toLocaleString('en-US')} {settings.currency}
              </strong>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAddNewDraftInvoice}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>+ فاتورة مسودة جديدة</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('pos')}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>شاشة الكاشير</span>
          </button>
        </div>
      </div>

      {/* 2. Feedback Message (Inline & Floating Banner) */}
      {statusMessage && (
        <>
          {/* Floating Toast Notification across Viewport */}
          <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[9999] max-w-xl w-[92%] animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto">
            <div
              className={`p-3.5 rounded-2xl text-xs sm:text-sm font-bold flex items-center justify-between shadow-2xl border ${
                statusMessage.type === 'success'
                  ? 'bg-emerald-700 border-emerald-500 text-white shadow-emerald-900/30'
                  : statusMessage.type === 'error'
                  ? 'bg-rose-700 border-rose-500 text-white shadow-rose-900/30'
                  : 'bg-blue-700 border-blue-500 text-white shadow-blue-900/30'
              }`}
            >
              <div className="flex items-center gap-2.5 font-bold flex-wrap">
                {statusMessage.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-200 shrink-0" />}
                {statusMessage.type === 'error' && <AlertCircle className="w-5 h-5 text-rose-200 shrink-0" />}
                {statusMessage.type === 'info' && <RefreshCw className="w-5 h-5 animate-spin text-blue-200 shrink-0" />}
                <span>{statusMessage.text}</span>

                {statusMessage.action && (
                  <button
                    type="button"
                    onClick={() => {
                      statusMessage.action?.onClick();
                      setStatusMessage(null);
                    }}
                    className="mr-2 px-3 py-1 bg-white text-emerald-900 hover:bg-emerald-50 rounded-xl text-xs font-black shadow-md transition cursor-pointer flex items-center gap-1 active:scale-95"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                    <span>{statusMessage.action.label}</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setStatusMessage(null)}
                className="text-white/80 hover:text-white p-1 hover:bg-black/20 rounded-lg transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Inline Feedback Banner */}
          <div
            className={`p-3 rounded-xl text-xs flex items-center justify-between shadow-2xs ${
              statusMessage.type === 'success'
                ? 'bg-emerald-600 text-white'
                : statusMessage.type === 'error'
                ? 'bg-rose-600 text-white'
                : 'bg-blue-600 text-white'
            }`}
          >
            <div className="flex items-center gap-2 font-medium flex-wrap">
              {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
              {statusMessage.type === 'info' && <RefreshCw className="w-4 h-4 animate-spin shrink-0" />}
              <span>{statusMessage.text}</span>

              {statusMessage.action && (
                <button
                  type="button"
                  onClick={() => {
                    statusMessage.action?.onClick();
                    setStatusMessage(null);
                  }}
                  className="mr-2 px-3 py-0.5 bg-white text-emerald-900 hover:bg-emerald-50 rounded-lg text-xs font-black shadow-xs transition cursor-pointer flex items-center gap-1 active:scale-95"
                >
                  <Edit3 className="w-3.5 h-3.5 text-emerald-700" />
                  <span>{statusMessage.action.label}</span>
                </button>
              )}
            </div>
            <button onClick={() => setStatusMessage(null)} className="text-white/80 hover:text-white cursor-pointer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </>
      )}

      {/* ========================================================================= */}
      {/* VIEW MODE 1: DEDICATED FULL INVOICE SCREEN (المراجعة الفردية العريضة) */}
      {/* ========================================================================= */}
      {viewMode === 'dedicated_invoice' && currentDraft ? (
        <div className="bg-white rounded-2xl border border-slate-300 shadow-md overflow-hidden flex flex-col space-y-3.5 p-3 sm:p-4">
          {/* Step Navigation Bar */}
          <div className="bg-slate-900 text-white p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-300">مسودة الفاتورة:</span>
              <span className="px-3 py-1 bg-blue-600 text-white rounded-lg text-xs font-black font-mono shadow-xs">
                {activeDraftIndex + 1} من {draftInvoices.length}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveDraftIndex(prev => Math.max(0, prev - 1))}
                disabled={activeDraftIndex === 0}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer border border-slate-700"
              >
                <ChevronRight className="w-4 h-4" />
                <span>الفاتورة السابقة</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveDraftIndex(prev => Math.min(draftInvoices.length - 1, prev + 1))}
                disabled={activeDraftIndex >= draftInvoices.length - 1}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer border border-slate-700"
              >
                <span>الفاتورة التالية</span>
                <ChevronLeft className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('daily_entry_sheet')}
                className="px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition border border-blue-600 cursor-pointer shadow-xs"
                title="الرجوع إلى كشف الإدخال اليومي لمشاهدة الأسطر المعتمدة والمظللة"
              >
                <CalendarCheck className="w-3.5 h-3.5" />
                <span>العودة للكشف اليومي 📅</span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('table')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>عرض قائمة المسودات ({draftInvoices.length})</span>
              </button>
            </div>
          </div>

          {/* CARD 1: Top Blue Header Bar with Party Toggle & Search */}
          {renderDraftTopHeaderBar(currentDraft, activeDraftIndex + 1)}

          {/* CARD 2: EXACT 12 COLUMNS CASHIER TABLE */}
          <div className="bg-white rounded-xl p-3 border border-slate-300 shadow-2xs space-y-2">
            <div className="flex items-center justify-between text-xs font-black text-slate-900 border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Table className="w-4 h-4 text-blue-700" />
                <span>جدول بنود الفاتورة (الكاشير السريع) - {currentDraft.items.length} بنود</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddDeliveryServiceToDraft(currentDraft.id)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-2xs transition-colors cursor-pointer"
                  title="إضافة خدمة توصيل تلقائياً كبند في الفاتورة (تحديد الملاحظات والسعر فقط)"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>+ خدمة توصيل</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleAddItemToDraft(currentDraft.id)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer"
                  title="إضافة بند جديد (+)"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ بند جديد</span>
                </button>
              </div>
            </div>

            <div className="border border-[#94b8db] rounded-lg overflow-x-auto shadow-xs bg-white">
              <table className="w-full text-right border-collapse text-xs min-w-[980px]">
                <thead>
                  <tr className="bg-gradient-to-b from-[#dbe9f6] to-[#b8d3ec] text-[#0f2744] font-black border-b border-[#94b8db] select-none text-[12px]">
                    <th className="py-2 px-1 text-center w-10 border-l border-[#94b8db] font-bold text-slate-900">م</th>
                    <th className="py-2 px-2 border-l border-[#94b8db] w-56 sm:w-72 min-w-[220px]">اسم الصنف</th>
                    <th className="py-2 px-2 border-l border-[#94b8db] min-w-[160px]">البيان والملاحظات</th>
                    <th className="py-2 px-1 w-16 text-center border-l border-[#94b8db]">طول</th>
                    <th className="py-2 px-1 w-16 text-center border-l border-[#94b8db]">عرض</th>
                    <th className="py-2 px-1 w-16 text-center border-l border-[#94b8db]">عدد</th>
                    <th className="py-2 px-1 w-20 text-center border-l border-[#94b8db]">كمية</th>
                    <th className="py-2 px-1 w-20 text-center border-l border-[#94b8db]">السعر</th>
                    <th className="py-2 px-2 w-28 text-center border-l border-[#94b8db] bg-[#a9c9e8]">الإجمالي</th>
                    <th className="py-2 px-1 w-14 text-center border-l border-[#94b8db]">مرفق</th>
                    <th className="py-2 px-1 w-12 text-center">حذف</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#d4e4f4]">
                  {currentDraft.items.map((item, itIdx) => {
                    const invItem = inventory.find(
                      i => (item.itemCode && i.code?.toLowerCase() === item.itemCode.toLowerCase()) ||
                           (item.matchedInventoryId && i.id === item.matchedInventoryId) ||
                           i.name.trim().toLowerCase() === item.itemName.trim().toLowerCase()
                    );
                    const isDim = invItem
                      ? isSquareMeterUnit(invItem.unit, invItem.unitCalculationType)
                      : (item.unit ? isSquareMeterUnit(item.unit) : ((item.length && item.width && (item.length > 1 || item.width > 1)) ? true : false));

                    return (
                    <tr key={`excel-it-${item.id || itIdx}-${itIdx}`} className="hover:bg-blue-50/50 transition-colors">
                      <td className="p-1 text-center text-slate-800 font-mono font-black border-l border-[#d4e4f4]">
                        {itIdx + 1}
                      </td>

                      {/* Item Name Autocomplete */}
                      <td className="p-1 border-l border-[#d4e4f4]">
                        <ItemNameCellInput
                          draftId={currentDraft.id}
                          itemId={item.id}
                          itemName={item.itemName}
                          customerId={currentDraft.customerId}
                          inventory={inventory}
                          getItemPriceForCustomer={getItemPriceForCustomer}
                          onUpdateItem={handleUpdateItem}
                          onSelectItem={handleSelectItemFromInventory}
                        />
                      </td>

                      {/* Notes */}
                      <td className="p-1 border-l border-[#d4e4f4]">
                        <input
                          type="text"
                          value={item.notes || ''}
                          onChange={e =>
                            handleUpdateItem(currentDraft.id, item.id, { notes: e.target.value })
                          }
                          placeholder="البيان والملاحظات..."
                          className="w-full p-1 bg-white border border-[#b8d3ec] hover:border-blue-400 focus:border-blue-600 rounded text-xs text-slate-700 outline-none"
                        />
                      </td>

                      {/* Length */}
                      <td className="p-1 border-l border-[#d4e4f4]">
                        {!isDim ? (
                          <div
                            className="w-full p-1 bg-slate-100 text-slate-500 rounded font-mono text-xs text-center font-bold select-none cursor-not-allowed flex items-center justify-center gap-0.5"
                            title="مغلق تلقائياً: الصنف لا يتطلب طولاً وعرضاً (الطول = 1)"
                          >
                            <Lock className="w-2.5 h-2.5 text-slate-400" />
                            <span>1</span>
                          </div>
                        ) : (
                          <input
                            type="number"
                            step="0.01"
                            value={item.length || ''}
                            onChange={e =>
                              handleUpdateItem(currentDraft.id, item.id, {
                                length: parseFloat(e.target.value) || 0
                              })
                            }
                            placeholder="-"
                            className="w-full p-1 bg-white border border-[#b8d3ec] rounded font-mono text-xs text-center outline-none"
                          />
                        )}
                      </td>

                      {/* Width */}
                      <td className="p-1 border-l border-[#d4e4f4]">
                        {!isDim ? (
                          <div
                            className="w-full p-1 bg-slate-100 text-slate-500 rounded font-mono text-xs text-center font-bold select-none cursor-not-allowed flex items-center justify-center gap-0.5"
                            title="مغلق تلقائياً: الصنف لا يتطلب طولاً وعرضاً (العرض = 1)"
                          >
                            <Lock className="w-2.5 h-2.5 text-slate-400" />
                            <span>1</span>
                          </div>
                        ) : (
                          <input
                            type="number"
                            step="0.01"
                            value={item.width || ''}
                            onChange={e =>
                              handleUpdateItem(currentDraft.id, item.id, {
                                width: parseFloat(e.target.value) || 0
                              })
                            }
                            placeholder="-"
                            className="w-full p-1 bg-white border border-[#b8d3ec] rounded font-mono text-xs text-center outline-none"
                          />
                        )}
                      </td>

                      {/* Count */}
                      <td className="p-1 border-l border-[#d4e4f4]">
                        {!isDim ? (
                          <div
                            className="w-full p-1 bg-slate-100 text-slate-700 rounded font-mono text-xs text-center font-bold select-none cursor-not-allowed flex items-center justify-center gap-0.5"
                            title="مغلق تلقائياً: العدد مطابق للكمية دائماً"
                          >
                            <Lock className="w-2.5 h-2.5 text-slate-400" />
                            <span>{item.quantity}</span>
                          </div>
                        ) : (
                          <input
                            type="number"
                            value={item.count || 1}
                            onChange={e =>
                              handleUpdateItem(currentDraft.id, item.id, {
                                count: parseInt(e.target.value, 10) || 1
                              })
                            }
                            className="w-full p-1 bg-white border border-[#b8d3ec] rounded font-mono text-xs text-center outline-none"
                          />
                        )}
                      </td>

                      {/* Quantity */}
                      <td className="p-1 border-l border-[#d4e4f4]">
                        <input
                          type="number"
                          step="0.01"
                          value={item.quantity}
                          onChange={e =>
                            handleUpdateItem(currentDraft.id, item.id, {
                              quantity: parseFloat(e.target.value) || 0
                            })
                          }
                          className="w-full p-1 bg-white border border-[#b8d3ec] rounded font-mono text-xs font-bold text-center text-blue-700 outline-none"
                        />
                      </td>

                      {/* Unit Price */}
                      <td className="p-1 border-l border-[#d4e4f4]">
                        <input
                          type="number"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={e =>
                            handleUpdateItem(currentDraft.id, item.id, {
                              unitPrice: parseFloat(e.target.value) || 0
                            })
                          }
                          className="w-full p-1 bg-white border border-[#b8d3ec] rounded font-mono text-xs font-bold text-center text-slate-800 outline-none"
                        />
                      </td>

                      {/* Total */}
                      <td className="p-1 text-center font-mono font-black text-slate-900 bg-[#e3eef8] border-l border-[#d4e4f4] whitespace-nowrap">
                        ₪ {item.totalAmount.toFixed(2)}
                      </td>

                      {/* Attachments */}
                      <td className="p-1 text-center border-l border-[#d4e4f4]">
                        <button
                          type="button"
                          onClick={() =>
                            setActiveItemForAttachments({
                              draftId: currentDraft.id,
                              itemId: item.id,
                              itemName: item.itemName,
                              attachments: item.attachments || []
                            })
                          }
                          className={`p-1 rounded-md border flex items-center justify-center gap-0.5 mx-auto transition cursor-pointer ${
                            item.attachments && item.attachments.length > 0
                              ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold'
                              : 'bg-white text-slate-400 border-slate-200 hover:text-blue-600 hover:border-blue-300'
                          }`}
                          title="المرفقات والملفات الخاصة بهذا البند"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          {item.attachments && item.attachments.length > 0 && (
                            <span className="text-[10px] font-mono font-black">{item.attachments.length}</span>
                          )}
                        </button>
                      </td>

                      {/* Delete & Add New Item Action Cell */}
                      <td className="p-1 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleRemoveItemFromDraft(currentDraft.id, item.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                            title="حذف هذا البند"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>

                          {/* زر (+) الصغير والأنيق في طرف أخر بند لإضافة بند جديد */}
                          {itIdx === currentDraft.items.length - 1 && (
                            <button
                              type="button"
                              onClick={() => handleAddItemToDraft(currentDraft.id)}
                              className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-2xs transition cursor-pointer flex items-center justify-center active:scale-95"
                              title="إضافة بند جديد للفاتورة (+)"
                            >
                              <Plus className="w-3.5 h-3.5 font-bold" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          </div>

          {/* CARD 2.5: LIVE EXCEL PREVIEW CARD UNDER INVOICE (صورة الجدول المستورد داخل ستروك ذهبي غامق وسميك بدون كتابة) */}
          {(currentDraft.rawHeaders || currentDraft.rawRowCells || currentDraft.items[0]?.rawCells) && (
            <div className="bg-amber-50/90 border-4 border-amber-600 rounded-xl p-2 shadow-md ring-2 ring-amber-700/20">
              <div className="overflow-x-auto bg-white rounded-lg border-2 border-amber-500 shadow-xs">
                <table className="w-full text-right border-collapse text-[11px]">
                  {currentDraft.rawHeaders && (
                    <thead>
                      <tr className="bg-amber-100/90 text-amber-950 font-black border-b-2 border-amber-500 font-mono">
                        {currentDraft.rawHeaders.map((h, hIdx) => (
                          <th key={hIdx} className="p-1.5 border-l border-amber-300 text-center whitespace-nowrap">
                            {h || `عمود ${hIdx + 1}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {(currentDraft.rawRowCells || (currentDraft.items[0]?.rawCells ? [currentDraft.items[0].rawCells] : [])).map((cells, cIdx) => (
                      <tr key={cIdx} className="hover:bg-amber-50/60">
                        {cells.map((cell, cellIdx) => (
                          <td key={cellIdx} className="p-1.5 border-l border-amber-200 text-slate-900 font-bold whitespace-nowrap">
                            {String(cell || '-')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* CARD 3: POS Payment Console at Bottom */}
          <div className="pt-2">
            <PosBottomPaymentConsole
              currencies={currencies}
              invoiceCurrencyCode={currentDraft.currency || 'ILS'}
              onSelectInvoiceCurrency={code => {
                const found = currencies.find(c => c.code === code);
                handleUpdateDraft(currentDraft.id, {
                  currency: code,
                  currencySymbol: found?.symbol || '₪',
                  exchangeRate: found?.rateAgainstBase || 1.0
                });
              }}
              invoiceExchangeRate={currentDraft.exchangeRate || 1.0}
              onChangeInvoiceExchangeRate={rate => handleUpdateDraft(currentDraft.id, { exchangeRate: rate })}
              cashAmount={currentDraft.cashAmount || ''}
              onChangeCashAmount={val => handleUpdateDraft(currentDraft.id, { cashAmount: val })}
              cashCurrencyCode={currentDraft.cashCurrency || 'ILS'}
              onChangeCashCurrency={code => handleUpdateDraft(currentDraft.id, { cashCurrency: code })}
              cashExchangeRate={currentDraft.cashExchangeRate || 1.0}
              onChangeCashExchangeRate={rate => handleUpdateDraft(currentDraft.id, { cashExchangeRate: rate })}
              cashTreasuryCode={currentDraft.cashTreasuryCode || '1101'}
              onChangeCashTreasury={code => handleUpdateDraft(currentDraft.id, { cashTreasuryCode: code })}
              bankAmount={currentDraft.bankAmount || ''}
              onChangeBankAmount={val => handleUpdateDraft(currentDraft.id, { bankAmount: val })}
              bankCurrencyCode={currentDraft.bankCurrency || 'ILS'}
              onChangeBankCurrency={code => handleUpdateDraft(currentDraft.id, { bankCurrency: code })}
              bankExchangeRate={currentDraft.bankExchangeRate || 1.0}
              onChangeBankExchangeRate={rate => handleUpdateDraft(currentDraft.id, { bankExchangeRate: rate })}
              bankTreasuryCode={currentDraft.bankTreasuryCode || '1102'}
              onChangeBankTreasury={code => handleUpdateDraft(currentDraft.id, { bankTreasuryCode: code })}
              treasuries={treasuries}
              invoiceNotes={currentDraft.notes || ''}
              onChangeInvoiceNotes={notes => handleUpdateDraft(currentDraft.id, { notes })}
              overallDiscount={currentDraft.discount || 0}
              onChangeOverallDiscount={val => handleUpdateDraft(currentDraft.id, { discount: val })}
              discountType={currentDraft.discountType || 'amount'}
              onChangeDiscountType={type => handleUpdateDraft(currentDraft.id, { discountType: type })}
              calculatedTotalAmount={currentDraft.totalAmount}
              onQuickFullCash={() =>
                handleUpdateDraft(currentDraft.id, {
                  paymentMethod: 'cash',
                  cashAmount: currentDraft.totalAmount.toString(),
                  bankAmount: '0'
                })
              }
              onQuickFullBank={() =>
                handleUpdateDraft(currentDraft.id, {
                  paymentMethod: 'bank_transfer',
                  bankAmount: currentDraft.totalAmount.toString(),
                  cashAmount: '0'
                })
              }
              onQuickCredit={() =>
                handleUpdateDraft(currentDraft.id, {
                  paymentMethod: 'credit',
                  cashAmount: '0',
                  bankAmount: '0'
                })
              }
            />
          </div>

          {/* Bottom Approval Footer Bar */}
          <div className="bg-slate-900 text-white p-3 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-md">
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-300">طريقة الاعتماد:</span>
              <span className="px-2.5 py-1 bg-blue-600 text-white rounded font-bold">
                عملية بيع كاشير رسمية وحفظ فوري مع حذف المسودة
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleApproveDraft(currentDraft, true, true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-lg transition cursor-pointer active:scale-95"
                title="اعتماد وحفظ الفاتورة وحذفها من المسودات وفتحها فوراً للتعديل في شاشة الكاشير"
              >
                <Edit3 className="w-4 h-4" />
                <span>اعتماد وتعديل في الكاشير ➔</span>
              </button>

              <button
                type="button"
                onClick={() => handleApproveDraft(currentDraft, true, false)}
                className="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black flex items-center gap-2 shadow-lg transition cursor-pointer active:scale-95"
                title="اعتماد الفاتورة تلقائياً كفاتورة كاشير فعلية وحذفها من المسودات والانتقال للتالية"
              >
                <CheckCircle2 className="w-5 h-5" />
                <span>[ ✔ اعتماد وحفظ الفاتورة (Ctrl+Enter) ]</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================================= */
        /* VIEW MODE 2: FULL WIDTH TABLE LIST OF DRAFTS (قائمة كافة المسودات) */
        /* ========================================================================= */
        <div className="space-y-3">
          {/* Data Import Toolbar */}
          <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
            <div className="flex border-b border-slate-200 text-xs font-bold gap-4">
              <button
                type="button"
                onClick={() => setActiveSourceTab('url')}
                className={`pb-2 flex items-center gap-1.5 transition border-b-2 cursor-pointer ${
                  activeSourceTab === 'url'
                    ? 'border-blue-600 text-blue-600 font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <CloudDownload className="w-4 h-4" />
                <span>سحب من رابط OneDrive المباشر</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSourceTab('upload')}
                className={`pb-2 flex items-center gap-1.5 transition border-b-2 cursor-pointer ${
                  activeSourceTab === 'upload'
                    ? 'border-blue-600 text-blue-600 font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>رفع ملف Excel أو CSV</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSourceTab('paste')}
                className={`pb-2 flex items-center gap-1.5 transition border-b-2 cursor-pointer ${
                  activeSourceTab === 'paste'
                    ? 'border-blue-600 text-blue-600 font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <ClipboardPaste className="w-4 h-4" />
                <span>نسخ ولصق جدول الإكسل</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveSourceTab('daily_entry')}
                className={`pb-2 flex items-center gap-1.5 transition border-b-2 cursor-pointer ${
                  activeSourceTab === 'daily_entry'
                    ? 'border-blue-600 text-blue-600 font-black'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <CalendarCheck className="w-4 h-4 text-emerald-600" />
                <span>استيراد مسودات الإدخال اليومي</span>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.2 rounded-full">
                  جديد
                </span>
              </button>
            </div>

            {/* TAB 1: Live OneDrive URL */}
            {activeSourceTab === 'url' && (
              <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                <div className="relative flex-1 w-full">
                  <FileSpreadsheet className="w-4 h-4 absolute right-3 top-3 text-emerald-600" />
                  <input
                    type="text"
                    value={sheetUrl}
                    onChange={e => setSheetUrl(e.target.value)}
                    placeholder="ضع رابط مشاركة ملف الإكسل السحابي من OneDrive أو SharePoint..."
                    className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleFetchFromLiveUrl}
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer w-full sm:w-auto justify-center"
                >
                  {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4" />}
                  <span>سحب ومطابقة المسودات الآن</span>
                </button>
              </div>
            )}

            {/* TAB 2: Upload File */}
            {activeSourceTab === 'upload' && (
              <div className="flex items-center gap-3 pt-1">
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".xlsx, .xls, .csv"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isLoading}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>اختر ملف Excel من جهازك (.xlsx / .xls)</span>
                </button>
                <span className="text-xs text-slate-400 font-light">
                  يتم استخراج المسودات ومطابقة العناوين التلقائية فور الرفع
                </span>
              </div>
            )}

            {/* TAB 3: Paste Text */}
            {activeSourceTab === 'paste' && (
              <div className="space-y-2 pt-1">
                <textarea
                  value={pasteText}
                  onChange={e => setPasteText(e.target.value)}
                  placeholder="قم بتحديد الصفوف من برنامج الإكسل وانسخها (Ctrl+C)، ثم الصقها هنا مباشرة (Ctrl+V)..."
                  rows={3}
                  className="w-full p-2.5 text-xs font-mono border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white"
                />
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleParsePaste}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>معالجة ومطابقة الأسطر</span>
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: Import from Daily Entry Sheet (كشف الإدخال اليومي) */}
            {activeSourceTab === 'daily_entry' && (
              <div className="space-y-3 pt-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 border border-slate-200 p-2.5 rounded-xl">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-blue-600" />
                      <span>حدد اليوم المراد استيراده:</span>
                    </span>
                    <input
                      type="date"
                      value={dailyImportDate}
                      onChange={e => setDailyImportDate(e.target.value)}
                      className="bg-white border border-slate-300 rounded-lg px-2.5 py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => setDailyImportDate(new Date().toISOString().split('T')[0])}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 transition cursor-pointer"
                    >
                      اليوم الحالي
                    </button>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setActiveTab('daily_entry_sheet')}
                      className="px-3 py-1.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <span>فتح شاشة كشف الإدخال اليومي</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>

                    <button
                      type="button"
                      onClick={handleImportFromDailyEntry}
                      disabled={!dailyEntryForDate || !dailyEntryForDate.rows || dailyEntryForDate.rows.length === 0}
                      className="px-4 py-1.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-lg text-xs font-black flex items-center gap-1.5 shadow-sm transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>استيراد وترحيل مسودات يوم ({dailyImportDate}) 🚀</span>
                    </button>
                  </div>
                </div>

                {/* Available dates pills */}
                {allDailyDates.length > 0 && (
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                    <span className="text-[11px] text-slate-500 font-bold shrink-0">
                      أيام مسجلة متوفرة:
                    </span>
                    {allDailyDates.map(d => {
                      const sheet = getDailyEntrySheet(d);
                      const validCount = sheet?.rows?.filter(r => (r.customerName && r.customerName.trim()) || (r.itemName && r.itemName.trim()) || Number(r.requiredAmount) > 0).length || 0;
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDailyImportDate(d)}
                          className={`px-2.5 py-0.5 rounded-lg text-[11px] font-mono font-bold transition shrink-0 cursor-pointer flex items-center gap-1 ${
                            dailyImportDate === d
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
                          }`}
                        >
                          <span>{d}</span>
                          <span className={`text-[9.5px] px-1 rounded-full font-bold ${dailyImportDate === d ? 'bg-blue-700 text-white' : 'bg-slate-200 text-slate-600'}`}>
                            {validCount}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Preview Table of Daily Entries */}
                {dailyEntryForDate && dailyEntryForDate.rows && dailyEntryForDate.rows.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white shadow-2xs">
                    <div className="bg-slate-100 px-3 py-1.5 flex items-center justify-between text-xs font-bold text-slate-700 border-b border-slate-200">
                      <span>معاينة حركات كشف اليوم المراد استيراده ({dailyImportDate}):</span>
                      <div className="flex items-center gap-3">
                        <span>العدد: <strong className="font-mono text-slate-900">{dailyEntryTotals.validRowsCount}</strong></span>
                        <span>إجمالي المطلوب: <strong className="font-mono text-slate-900">{dailyEntryTotals.totalRequired.toFixed(2)} ₪</strong></span>
                        <span>إجمالي المدفوع: <strong className="font-mono text-emerald-700">{dailyEntryTotals.totalPaid.toFixed(2)} ₪</strong></span>
                      </div>
                    </div>
                    <div className="max-h-52 overflow-y-auto">
                      <table className="w-full text-right text-xs">
                        <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200 text-[10.5px]">
                          <tr>
                            <th className="p-1.5 text-center w-8 border-l border-slate-200">#</th>
                            <th className="p-1.5 border-l border-slate-200">الزبون الرئيسي</th>
                            <th className="p-1.5 border-l border-slate-200">الزبون الفرعي</th>
                            <th className="p-1.5 border-l border-slate-200">الصنف</th>
                            <th className="p-1.5 border-l border-slate-200">ملاحظات</th>
                            <th className="p-1.5 text-center border-l border-slate-200">المطلوب</th>
                            <th className="p-1.5 text-center border-l border-slate-200">المدفوع</th>
                            <th className="p-1.5">الصندوق</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {dailyEntryForDate.rows.filter(r => (r.customerName && r.customerName.trim()) || (r.itemName && r.itemName.trim()) || Number(r.requiredAmount) > 0).map((r, i) => (
                            <tr key={r.id || i} className="hover:bg-slate-50 text-[11px]">
                              <td className="p-1.5 text-center font-mono text-slate-400 border-l border-slate-200">{i + 1}</td>
                              <td className="p-1.5 font-bold text-slate-900 border-l border-slate-200">{r.customerName || '-'}</td>
                              <td className="p-1.5 text-slate-600 border-l border-slate-200">{r.subCustomerName || '-'}</td>
                              <td className="p-1.5 font-medium text-slate-800 border-l border-slate-200">{r.itemName || '-'}</td>
                              <td className="p-1.5 text-slate-500 border-l border-slate-200">{r.notes || '-'}</td>
                              <td className="p-1.5 text-center font-mono font-bold text-slate-900 border-l border-slate-200">{Number(r.requiredAmount || 0).toFixed(2)} ₪</td>
                              <td className="p-1.5 text-center font-mono font-bold text-emerald-700 border-l border-slate-200">{Number(r.paidAmount || 0).toFixed(2)} ₪</td>
                              <td className="p-1.5 text-slate-700">{r.treasuryName || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="p-6 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                    <CalendarCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-700">
                      لا توجد حركات مسجلة في كشف الإدخال اليومي لتاريخ ({dailyImportDate})
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      يمكنك الانتقال إلى شاشة كشف الإدخال اليومي لتسجيل حركات هذا اليوم أو اختيار تاريخ آخر أعلاه.
                    </p>
                    <button
                      type="button"
                      onClick={() => setActiveTab('daily_entry_sheet')}
                      className="mt-3 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>تسجيل حركات في كشف الإدخال اليومي الآن</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Action Toolbar */}
          {draftInvoices.length > 0 && (
            <div className="bg-white px-4 py-2.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const allSelected = displayedDrafts.every(d => d.selected);
                    const displayedIds = new Set(displayedDrafts.map(d => d.id));
                    setDraftInvoices(prev =>
                      prev.map(d =>
                        displayedIds.has(d.id)
                          ? { ...d, selected: !allSelected }
                          : d
                      )
                    );
                  }}
                  className="text-xs text-slate-700 font-bold hover:text-blue-600 cursor-pointer flex items-center gap-1.5"
                >
                  <input
                    type="checkbox"
                    checked={displayedDrafts.length > 0 && displayedDrafts.every(d => d.selected)}
                    onChange={() => {}}
                    className="rounded text-blue-600 cursor-pointer"
                  />
                  <span>تحديد الكل ({displayedDrafts.length})</span>
                </button>

                {selectedDrafts.length > 0 && (
                  <span className="text-xs text-blue-700 font-bold bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
                    تم تحديد {selectedDrafts.length} مسودة بمبلغ: {selectedDraftsAmount.toLocaleString('en-US')} {settings.currency}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchFilter}
                    onChange={e => setSearchFilter(e.target.value)}
                    placeholder="بحث في المسودات..."
                    className="bg-slate-50 border border-slate-300 rounded-lg pr-8 pl-3 py-1.5 text-xs w-44 focus:w-60 transition-all outline-none"
                  />
                </div>

                {/* Global Expand / Collapse All Button (زر ضب وتوسيع الكل) */}
                <button
                  type="button"
                  onClick={toggleAllDraftsCollapse}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-100 border border-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  title="ضب أو توسيع كافة المسودات المعروضة بضغطة واحدة"
                >
                  {displayedDrafts.length > 0 && displayedDrafts.every(d => collapsedDraftIds[d.id]) ? (
                    <>
                      <ChevronDown className="w-3.5 h-3.5 text-amber-400 font-bold" />
                      <span>توسيع الكل 🔽</span>
                    </>
                  ) : (
                    <>
                      <ChevronUp className="w-3.5 h-3.5 text-amber-400 font-bold" />
                      <span>ضب الكل (تصغير) 🔼</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveDraftIndex(0);
                    setViewMode('dedicated_invoice');
                  }}
                  className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  title="فتح أول فاتورة ومراجعتها واعتمادها بالتتابع سطر بسطر"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>بدء المراجعة والاعتماد المتتابع ➔</span>
                </button>

                {selectedDrafts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleApproveSelected}
                    className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>اعتماد وحفظ المحدد ({selectedDrafts.length})</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('هل تريد تفريغ كافة المسودات في الطابور؟')) {
                      setDraftInvoices([]);
                      setStatusMessage({ type: 'info', text: 'تم تفريغ طابور المسودات بالكامل.' });
                    }
                  }}
                  className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  title="تفريغ كافة المسودات"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>تفريغ</span>
                </button>
              </div>
            </div>
          )}

          {/* List of Draft Invoices */}
          {draftInvoices.length === 0 ? (
            <div className="h-72 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-200 rounded-2xl bg-white">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                <FileSpreadsheet className="w-7 h-7" />
              </div>
              <h4 className="font-bold text-base text-slate-800 mb-1">لا توجد مسودات فواتير بانتظار الاعتماد حالياً</h4>
              <p className="text-xs text-slate-400 max-w-md mb-4 font-light">
                اضغط على زر "سحب ومطابقة المسودات الآن" لجلب الفواتير من رابط OneDrive، أو ارفع ملف Excel لإدخال الفواتير ومراجعتها كاشير سريعا
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFetchFromLiveUrl}
                  disabled={isLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
                >
                  <CloudDownload className="w-4 h-4" />
                  <span>سحب البيانات الآن من OneDrive</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {displayedDrafts.map((draft, dIdx) => {
                const theme = DRAFT_THEMES[dIdx % DRAFT_THEMES.length];
                const isCollapsed = Boolean(collapsedDraftIds[draft.id]);

                return (
                  <div
                    key={`excel-draft-${draft.id || dIdx}-${dIdx}`}
                    className={`bg-white rounded-2xl border transition-all overflow-hidden ${theme.cardBorder} ${
                      draft.selected ? 'ring-2 ring-blue-500' : ''
                    }`}
                  >
                    {/* Header of each invoice card with distinct theme background & accordion toggle button */}
                    {renderDraftTopHeaderBar(
                      draft,
                      dIdx + 1,
                      isCollapsed,
                      () => toggleDraftCollapse(draft.id),
                      theme.headerBg,
                      theme.badgeBg
                    )}

                    {/* Body of Draft Invoice (Shown only when NOT collapsed) */}
                    {!isCollapsed && (
                      <>
                        {/* Items 12-Column Table */}
                        <div className="p-3 bg-white space-y-2">
                          <div className="border border-[#94b8db] rounded-lg overflow-x-auto shadow-2xs bg-white">
                            <table className="w-full text-right border-collapse text-xs min-w-[900px]">
                              <thead>
                                <tr className="bg-gradient-to-b from-[#dbe9f6] to-[#b8d3ec] text-[#0f2744] font-black border-b border-[#94b8db] select-none text-[11px]">
                                  <th className="py-2 px-1 text-center w-10 border-l border-[#94b8db] font-bold text-slate-900">م</th>
                                  <th className="py-2 px-2 border-l border-[#94b8db] w-56 sm:w-72 min-w-[220px]">اسم الصنف</th>
                                  <th className="py-2 px-2 border-l border-[#94b8db] min-w-[140px]">البيان والملاحظات</th>
                                  <th className="py-2 px-1 w-16 text-center border-l border-[#94b8db]">طول</th>
                                  <th className="py-2 px-1 w-16 text-center border-l border-[#94b8db]">عرض</th>
                                  <th className="py-2 px-1 w-16 text-center border-l border-[#94b8db]">عدد</th>
                                  <th className="py-2 px-1 w-20 text-center border-l border-[#94b8db]">كمية</th>
                                  <th className="py-2 px-1 w-20 text-center border-l border-[#94b8db]">السعر</th>
                                  <th className="py-2 px-2 w-28 text-center border-l border-[#94b8db] bg-[#a9c9e8]">الإجمالي</th>
                                  <th className="py-2 px-1 w-14 text-center border-l border-[#94b8db]">مرفق</th>
                                  <th className="py-2 px-1 w-12 text-center">حذف</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-[#d4e4f4]">
                                {draft.items.map((item, itIdx) => (
                                  <React.Fragment key={`excel-item-${item.id || itIdx}-${itIdx}`}>
                                    <tr className="hover:bg-blue-50/50">
                                      <td className="p-1 text-center text-slate-800 font-mono font-black border-l border-[#d4e4f4]">
                                        {itIdx + 1}
                                      </td>
                                      <td className="p-1 border-l border-[#d4e4f4]">
                                        <ItemNameCellInput
                                          draftId={draft.id}
                                          itemId={item.id}
                                          itemName={item.itemName}
                                          customerId={draft.customerId}
                                          inventory={inventory}
                                          getItemPriceForCustomer={getItemPriceForCustomer}
                                          onUpdateItem={handleUpdateItem}
                                          onSelectItem={handleSelectItemFromInventory}
                                        />
                                      </td>
                                      <td className="p-1 border-l border-[#d4e4f4]">
                                        <input
                                          type="text"
                                          value={item.notes || ''}
                                          onChange={e => handleUpdateItem(draft.id, item.id, { notes: e.target.value })}
                                          placeholder="البيان..."
                                          className="w-full p-1 bg-white border border-[#b8d3ec] rounded text-[11px] text-slate-700 outline-none"
                                        />
                                      </td>
                                      {/* 5, 6, 7. الطول والعرض والعدد */}
                                      {(() => {
                                        const invItem = inventory.find(
                                          i => (item.itemCode && i.code?.toLowerCase() === item.itemCode.toLowerCase()) ||
                                               (item.matchedInventoryId && i.id === item.matchedInventoryId) ||
                                               i.name.trim().toLowerCase() === item.itemName.trim().toLowerCase()
                                        );
                                        const isDim = invItem
                                          ? isSquareMeterUnit(invItem.unit, invItem.unitCalculationType)
                                          : (item.unit ? isSquareMeterUnit(item.unit) : ((item.length && item.width && (item.length > 1 || item.width > 1)) ? true : false));

                                        if (!isDim) {
                                          return (
                                            <>
                                              <td className="p-1 border-l border-[#d4e4f4]">
                                                <div
                                                  className="w-full p-1 bg-slate-100 text-slate-500 rounded font-mono text-xs text-center font-bold select-none cursor-not-allowed flex items-center justify-center gap-0.5"
                                                  title="مغلق تلقائياً: الصنف لا يتطلب طولاً وعرضاً (الطول = 1)"
                                                >
                                                  <Lock className="w-2.5 h-2.5 text-slate-400" />
                                                  <span>1</span>
                                                </div>
                                              </td>
                                              <td className="p-1 border-l border-[#d4e4f4]">
                                                <div
                                                  className="w-full p-1 bg-slate-100 text-slate-500 rounded font-mono text-xs text-center font-bold select-none cursor-not-allowed flex items-center justify-center gap-0.5"
                                                  title="مغلق تلقائياً: الصنف لا يتطلب طولاً وعرضاً (العرض = 1)"
                                                >
                                                  <Lock className="w-2.5 h-2.5 text-slate-400" />
                                                  <span>1</span>
                                                </div>
                                              </td>
                                              <td className="p-1 border-l border-[#d4e4f4]">
                                                <div
                                                  className="w-full p-1 bg-slate-100 text-slate-700 rounded font-mono text-xs text-center font-bold select-none cursor-not-allowed flex items-center justify-center gap-0.5"
                                                  title="مغلق تلقائياً: العدد مطابق للكمية دائماً"
                                                >
                                                  <Lock className="w-2.5 h-2.5 text-slate-400" />
                                                  <span>{item.quantity}</span>
                                                </div>
                                              </td>
                                            </>
                                          );
                                        }

                                        return (
                                          <>
                                            <td className="p-1 border-l border-[#d4e4f4]">
                                              <input
                                                type="number"
                                                step="0.01"
                                                value={item.length || ''}
                                                onChange={e => handleUpdateItem(draft.id, item.id, { length: parseFloat(e.target.value) || 0 })}
                                                placeholder="-"
                                                className="w-full p-1 bg-white border border-[#b8d3ec] rounded font-mono text-xs text-center outline-none"
                                              />
                                            </td>
                                            <td className="p-1 border-l border-[#d4e4f4]">
                                              <input
                                                type="number"
                                                step="0.01"
                                                value={item.width || ''}
                                                onChange={e => handleUpdateItem(draft.id, item.id, { width: parseFloat(e.target.value) || 0 })}
                                                placeholder="-"
                                                className="w-full p-1 bg-white border border-[#b8d3ec] rounded font-mono text-xs text-center outline-none"
                                              />
                                            </td>
                                            <td className="p-1 border-l border-[#d4e4f4]">
                                              <input
                                                type="number"
                                                value={item.count || 1}
                                                onChange={e => handleUpdateItem(draft.id, item.id, { count: parseInt(e.target.value, 10) || 1 })}
                                                className="w-full p-1 bg-white border border-[#b8d3ec] rounded font-mono text-xs text-center outline-none"
                                              />
                                            </td>
                                          </>
                                        );
                                      })()}
                                      <td className="p-1 border-l border-[#d4e4f4]">
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={item.quantity}
                                          onChange={e => handleUpdateItem(draft.id, item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                          className="w-full p-1 bg-white border border-[#b8d3ec] rounded font-mono text-xs font-bold text-center text-blue-700 outline-none"
                                        />
                                      </td>
                                      <td className="p-1 border-l border-[#d4e4f4]">
                                        <input
                                          type="number"
                                          step="0.01"
                                          value={item.unitPrice}
                                          onChange={e => handleUpdateItem(draft.id, item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                                          className="w-full p-1 bg-white border border-[#b8d3ec] rounded font-mono text-xs font-bold text-center text-slate-800 outline-none"
                                        />
                                      </td>
                                      <td className="p-1 text-center font-mono font-black text-slate-900 bg-white border-l border-[#d4e4f4] whitespace-nowrap">
                                        ₪ {item.totalAmount.toFixed(2)}
                                      </td>
                                      <td className="p-1 text-center border-l border-[#d4e4f4]">
                                        <button
                                          type="button"
                                          onClick={() =>
                                            setActiveItemForAttachments({
                                              draftId: draft.id,
                                              itemId: item.id,
                                              itemName: item.itemName,
                                              attachments: item.attachments || []
                                            })
                                          }
                                          className={`p-1 rounded-md border flex items-center justify-center gap-0.5 mx-auto transition cursor-pointer ${
                                            item.attachments && item.attachments.length > 0
                                              ? 'bg-blue-50 text-blue-700 border-blue-300 font-bold'
                                              : 'bg-white text-slate-400 border-slate-200 hover:text-blue-600 hover:border-blue-300'
                                          }`}
                                          title="المرفقات والملفات الخاصة بهذا البند"
                                        >
                                          <Paperclip className="w-3.5 h-3.5" />
                                          {item.attachments && item.attachments.length > 0 && (
                                            <span className="text-[10px] font-mono font-black">{item.attachments.length}</span>
                                          )}
                                        </button>
                                      </td>
                                      {/* Delete & Add New Item Action Cell */}
                                      <td className="p-1 text-center">
                                        <div className="flex items-center justify-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handleRemoveItemFromDraft(draft.id, item.id)}
                                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                                            title="حذف هذا البند"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>

                                          {/* زر (+) الصغير والأنيق في طرف أخر بند لإضافة بند جديد */}
                                          {itIdx === draft.items.length - 1 && (
                                            <button
                                              type="button"
                                              onClick={() => handleAddItemToDraft(draft.id)}
                                              className="p-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md shadow-2xs transition cursor-pointer flex items-center justify-center active:scale-95"
                                              title="إضافة بند جديد للفاتورة (+)"
                                            >
                                              <Plus className="w-3.5 h-3.5 font-bold" />
                                            </button>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  </React.Fragment>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {/* CARD 2.5: LIVE EXCEL PREVIEW CARD UNDER INVOICE (صورة الجدول المستورد داخل ستروك ذهبي غامق وسميك بدون كتابة) */}
                          {(draft.rawHeaders || draft.rawRowCells || draft.items[0]?.rawCells) && (
                            <div className="bg-amber-50/90 border-4 border-amber-600 rounded-xl p-2 shadow-md ring-2 ring-amber-700/20 mt-2">
                              <div className="overflow-x-auto bg-white rounded-lg border-2 border-amber-500 shadow-xs">
                                <table className="w-full text-right border-collapse text-[11px]">
                                  {draft.rawHeaders && (
                                    <thead>
                                      <tr className="bg-amber-100/90 text-amber-950 font-black border-b-2 border-amber-500 font-mono">
                                        {draft.rawHeaders.map((h, hIdx) => (
                                          <th key={hIdx} className="p-1.5 border-l border-amber-300 text-center whitespace-nowrap">
                                            {h || `عمود ${hIdx + 1}`}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                  )}
                                  <tbody>
                                    {(draft.rawRowCells || (draft.items[0]?.rawCells ? [draft.items[0].rawCells] : [])).map((cells, cIdx) => (
                                      <tr key={cIdx} className="hover:bg-amber-50/60">
                                        {cells.map((cell, cellIdx) => (
                                          <td key={cellIdx} className="p-1.5 border-l border-amber-200 text-slate-900 font-bold whitespace-nowrap">
                                            {String(cell || '-')}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Full POS Payment Console inside every draft card */}
                        <div className="p-3 bg-slate-100/80 border-t border-slate-200">
                          <PosBottomPaymentConsole
                            currencies={currencies}
                            invoiceCurrencyCode={draft.currency || 'ILS'}
                            onSelectInvoiceCurrency={code => {
                              const found = currencies.find(c => c.code === code);
                              handleUpdateDraft(draft.id, {
                                currency: code,
                                currencySymbol: found?.symbol || '₪',
                                exchangeRate: found?.rateAgainstBase || 1.0
                              });
                            }}
                            invoiceExchangeRate={draft.exchangeRate || 1.0}
                            onChangeInvoiceExchangeRate={rate => handleUpdateDraft(draft.id, { exchangeRate: rate })}
                            cashAmount={draft.cashAmount || ''}
                            onChangeCashAmount={val => handleUpdateDraft(draft.id, { cashAmount: val })}
                            cashCurrencyCode={draft.cashCurrency || 'ILS'}
                            onChangeCashCurrency={code => handleUpdateDraft(draft.id, { cashCurrency: code })}
                            cashExchangeRate={draft.cashExchangeRate || 1.0}
                            onChangeCashExchangeRate={rate => handleUpdateDraft(draft.id, { cashExchangeRate: rate })}
                            cashTreasuryCode={draft.cashTreasuryCode || '1101'}
                            onChangeCashTreasury={code => handleUpdateDraft(draft.id, { cashTreasuryCode: code })}
                            bankAmount={draft.bankAmount || ''}
                            onChangeBankAmount={val => handleUpdateDraft(draft.id, { bankAmount: val })}
                            bankCurrencyCode={draft.bankCurrency || 'ILS'}
                            onChangeBankCurrency={code => handleUpdateDraft(draft.id, { bankCurrency: code })}
                            bankExchangeRate={draft.bankExchangeRate || 1.0}
                            onChangeBankExchangeRate={rate => handleUpdateDraft(draft.id, { bankExchangeRate: rate })}
                            bankTreasuryCode={draft.bankTreasuryCode || '1102'}
                            onChangeBankTreasury={code => handleUpdateDraft(draft.id, { bankTreasuryCode: code })}
                            treasuries={treasuries}
                            invoiceNotes={draft.notes || ''}
                            onChangeInvoiceNotes={notes => handleUpdateDraft(draft.id, { notes })}
                            overallDiscount={draft.discount || 0}
                            onChangeOverallDiscount={val => handleUpdateDraft(draft.id, { discount: val })}
                            discountType={draft.discountType || 'amount'}
                            onChangeDiscountType={type => handleUpdateDraft(draft.id, { discountType: type })}
                            calculatedTotalAmount={draft.totalAmount}
                            onQuickFullCash={() =>
                              handleUpdateDraft(draft.id, {
                                paymentMethod: 'cash',
                                cashAmount: draft.totalAmount.toString(),
                                bankAmount: '0'
                              })
                            }
                            onQuickFullBank={() =>
                              handleUpdateDraft(draft.id, {
                                paymentMethod: 'bank_transfer',
                                bankAmount: draft.totalAmount.toString(),
                                cashAmount: '0'
                              })
                            }
                            onQuickCredit={() =>
                              handleUpdateDraft(draft.id, {
                                paymentMethod: 'credit',
                                cashAmount: '0',
                                bankAmount: '0'
                              })
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 3. Line Attachments Modal */}
      {activeItemForAttachments && (
        <LineAttachmentsModal
          isOpen={Boolean(activeItemForAttachments)}
          onClose={() => setActiveItemForAttachments(null)}
          itemName={activeItemForAttachments.itemName}
          attachments={activeItemForAttachments.attachments}
          onSaveAttachments={handleSaveItemAttachments}
        />
      )}

      {/* 4. Customer Special Prices Modal */}
      {isSpecialPricesModalOpen && currentSelectedParty && (
        <CustomerSpecialPricesModal
          party={currentSelectedParty}
          isOpen={isSpecialPricesModalOpen}
          onClose={() => setIsSpecialPricesModalOpen(false)}
        />
      )}
    </div>
  );
};
