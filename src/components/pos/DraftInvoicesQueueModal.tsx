import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
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
  Eye,
  FileText,
  HelpCircle,
  Table,
  CheckSquare,
  Paperclip,
  Maximize2,
  Minimize2,
  Lock,
  Truck
} from 'lucide-react';
import { useAccounting } from '../../context/AccountingContext';
import { PaymentMethod, Party, InventoryItem, Currency, TreasuryAccount, LineAttachment } from '../../types';
import { isSquareMeterUnit } from '../../utils/unitsOfMeasure';
import {
  SheetInvoiceRow,
  MultiItemDraftInvoice,
  DraftInvoiceItem,
  DEFAULT_ONEDRIVE_SHEET_URL,
  parseExcelBuffer,
  parseClipboardText,
  convertSingleRowsToMultiDrafts,
  autoMatchDraftEntities,
  normalizeArabicText
} from '../../services/liveSheetService';
import { LineAttachmentsModal } from './LineAttachmentsModal';
import { posSound } from '../../utils/audio';

interface DraftInvoicesQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenInPos?: (draft: SheetInvoiceRow) => void;
}

const STORAGE_KEY_DRAFTS = 'accounting_pending_draft_invoices_v4';
const STORAGE_KEY_URL = 'accounting_live_sheet_url';

const ItemNameCellInputModal: React.FC<{
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
                  key={`draft-item-${inv.id || idx}-${idx}`}
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

export const DraftInvoicesQueueModal: React.FC<DraftInvoicesQueueModalProps> = ({
  isOpen,
  onClose,
  onOpenInPos
}) => {
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
    getItemPriceForCustomer: getContextItemPrice
  } = useAccounting();

  // Full Screen State (بعرض الشاشة بالكامل)
  const [isFullscreen, setIsFullscreen] = useState<boolean>(true);

  // Active view mode: 'table' (Overview list) or 'dedicated_invoice' (Full invoice review & edit screen)
  const [viewMode, setViewMode] = useState<'table' | 'dedicated_invoice'>('table');
  const [activeDraftIndex, setActiveDraftIndex] = useState<number>(0);

  // Line Attachments Modal State
  const [activeItemForAttachments, setActiveItemForAttachments] = useState<{
    draftId: string;
    itemId: string;
    itemName: string;
    attachments: LineAttachment[];
  } | null>(null);

  // Source Selector
  const [activeSourceTab, setActiveSourceTab] = useState<'url' | 'upload' | 'paste'>('url');
  const [sheetUrl, setSheetUrl] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY_URL) || DEFAULT_ONEDRIVE_SHEET_URL;
  });
  const [pasteText, setPasteText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [searchFilter, setSearchFilter] = useState<string>('');
  const getItemPriceForCustomer = useCallback(
    (invItem: InventoryItem, custId?: string): { price: number; isSpecialPrice: boolean } => {
      return getContextItemPrice(invItem, custId);
    },
    [getContextItemPrice]
  );
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState<boolean>(false);
  const [activeItemAutocompleteIdx, setActiveItemAutocompleteIdx] = useState<number | null>(null);
  const [collapsedDraftIds, setCollapsedDraftIds] = useState<Record<string, boolean>>({});

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

  // Draft Invoices State
  const [draftInvoices, setDraftInvoices] = useState<MultiItemDraftInvoice[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_DRAFTS);
      if (saved) {
        return JSON.parse(saved);
      }
      const legacy3 = localStorage.getItem('accounting_pending_draft_invoices_v3');
      if (legacy3) {
        return JSON.parse(legacy3);
      }
      const legacy2 = localStorage.getItem('accounting_pending_draft_invoices_v2');
      if (legacy2) {
        return JSON.parse(legacy2);
      }
      return [];
    } catch {
      return [];
    }
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Synchronize drafts with local storage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_DRAFTS, JSON.stringify(draftInvoices));
      window.dispatchEvent(new CustomEvent('accounting_drafts_updated'));
    } catch {}
  }, [draftInvoices]);

  // Current active draft when in 'dedicated_invoice' mode
  const currentDraft: MultiItemDraftInvoice | undefined = draftInvoices[activeDraftIndex];

  // Save sheet URL
  const handleSaveUrl = (url: string) => {
    setSheetUrl(url);
    localStorage.setItem(STORAGE_KEY_URL, url);
  };

  if (!isOpen) return null;

  // Stats calculation
  const totalDraftsAmount = draftInvoices.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0);
  const selectedDrafts = draftInvoices.filter(d => d.selected);
  const selectedDraftsAmount = selectedDrafts.reduce((sum, d) => sum + (Number(d.totalAmount) || 0), 0);

  // Filtered drafts for search
  const displayedDrafts = draftInvoices.filter(d => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      d.customerName.toLowerCase().includes(q) ||
      (d.subCustomerName && d.subCustomerName.toLowerCase().includes(q)) ||
      (d.notes && d.notes.toLowerCase().includes(q)) ||
      d.date.includes(q) ||
      d.items.some(it => it.itemName.toLowerCase().includes(q) || (it.itemCode && it.itemCode.toLowerCase().includes(q)))
    );
  });

  // Calculate Next Sequential Invoice Number
  const getNextInvoiceNumber = (offset = 0): string => {
    let maxNum = 0;
    invoices.forEach(inv => {
      const match = (inv.invoiceNumber || '').match(/(\d+)$/);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    });
    return `INV-${String(maxNum + 1 + offset).padStart(4, '0')}`;
  };

  // 1. Fetch from Live Sheet URL (OneDrive / Google Sheets / Server API)
  const handleFetchFromLiveUrl = async () => {
    if (!sheetUrl.trim()) {
      setStatusMessage({ type: 'error', text: 'يرجى إدخال رابط الجدول السحابي أولاً' });
      return;
    }

    setIsLoading(true);
    setStatusMessage({ type: 'info', text: 'جاري الاتصال وسحب البيانات من الرابط السحابي...' });

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

  // Grouping toggle
  const handleToggleGrouping = () => {
    const flattened: SheetInvoiceRow[] = [];
    draftInvoices.forEach(d => {
      d.items.forEach(it => {
        flattened.push({
          id: `draft-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: d.date,
          customerName: d.customerName,
          itemName: it.itemName,
          itemCode: it.itemCode,
          length: it.length,
          width: it.width,
          count: it.count,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          totalAmount: it.totalAmount,
          paymentMethod: d.paymentMethod,
          notes: it.notes,
          paymentNotes: d.notes,
          imageThumbnail: it.imageThumbnail || '',
          isApproved: false,
          selected: true,
          rawHeaders: d.rawHeaders,
          rawCells: it.rawCells
        });
      });
    });

    const regrouped = convertSingleRowsToMultiDrafts(flattened, true, parties, inventory, treasuries);
    setDraftInvoices(regrouped);
    setStatusMessage({
      type: 'info',
      text: `تم تجميع بنود نفس الزبون والتاريخ في ${regrouped.length} فاتورة متكاملة!`
    });
  };

  // Add brand new empty draft invoice
  const handleAddNewDraftInvoice = () => {
    const todayStr = new Date().toISOString().split('T')[0];
    const newDraft: MultiItemDraftInvoice = {
      id: `mdraft-new-${Date.now()}`,
      date: todayStr,
      customerName: 'عميل كاشير نقدي',
      paymentMethod: 'cash',
      items: [
        {
          id: `item-${Date.now()}`,
          itemName: 'بند جديد',
          itemCode: 'ITM-001',
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

  // Update specific draft in the list
  const handleUpdateDraft = (draftId: string, updates: Partial<MultiItemDraftInvoice>) => {
    setDraftInvoices(prev =>
      prev.map(d => {
        if (d.id !== draftId) return d;
        const updated = { ...d, ...updates };

        // Re-evaluate item prices if customerId changed
        if (updates.customerId && updates.customerId !== d.customerId) {
          updated.items = (updated.items || []).map(it => {
            const invItem = inventory.find(
              i =>
                (it.matchedInventoryId && i.id === it.matchedInventoryId) ||
                (it.itemCode && i.code?.toLowerCase() === it.itemCode.toLowerCase()) ||
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

  // Add Delivery Service Item to a specific draft
  const handleAddDeliveryServiceToDraft = (draftId: string) => {
    const deliveryService = inventory.find(
      i => i.id === 'srv-delivery' || i.name.includes('خدمة توصيل') || i.name.includes('توصيل')
    );
    const defaultDeliveryPrice = deliveryService ? deliveryService.sellingPrice : 20;

    const newItem: DraftInvoiceItem = {
      id: `draft-item-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      itemName: deliveryService ? deliveryService.name : 'خدمة توصيل',
      itemCode: deliveryService ? deliveryService.code : 'DELV-01',
      matchedInventoryId: deliveryService?.id || 'srv-delivery',
      matchedInventoryName: deliveryService ? deliveryService.name : 'خدمة توصيل',
      unit: 'خدمة',
      length: 1,
      width: 1,
      count: 1,
      quantity: 1,
      unitPrice: defaultDeliveryPrice,
      totalAmount: defaultDeliveryPrice,
      notes: 'خدمة توصيل طلبات'
    };

    setDraftInvoices(prev =>
      prev.map(d => {
        if (d.id !== draftId) return d;
        const updatedItems = [...d.items, newItem];
        const subtotal = updatedItems.reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0);
        let discountVal = 0;
        if (d.discount && d.discount > 0) {
          if (d.discountType === 'percent') {
            discountVal = (subtotal * d.discount) / 100;
          } else {
            discountVal = Math.min(subtotal, d.discount);
          }
        }
        return {
          ...d,
          items: updatedItems,
          totalAmount: Math.max(0, Number((subtotal - discountVal).toFixed(2)))
        };
      })
    );
    posSound.playSuccessBeep();
  };

  // Add Item to a specific draft
  const handleAddItemToDraft = (draftId: string) => {
    setDraftInvoices(prev =>
      prev.map(d => {
        if (d.id !== draftId) return d;
        const newItem: DraftInvoiceItem = {
          id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          itemName: 'بند إضافي',
          itemCode: 'ITM-001',
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

  // Update specific item inside draft
  const handleUpdateItem = (
    draftId: string,
    itemId: string,
    updates: Partial<DraftInvoiceItem>
  ) => {
    setDraftInvoices(prev =>
      prev.map(d => {
        if (d.id !== draftId) return d;
        const updatedItems = d.items.map(it => {
          if (it.id !== itemId) return it;
          const updated = { ...it, ...updates };

          const matchedInv = inventory.find(
            i => (updated.itemCode && i.code?.toLowerCase() === updated.itemCode.toLowerCase()) ||
                 (updated.matchedInventoryId && i.id === updated.matchedInventoryId) ||
                 i.name.trim().toLowerCase() === updated.itemName.trim().toLowerCase()
          );

          const isDim = matchedInv
            ? isSquareMeterUnit(matchedInv.unit, matchedInv.unitCalculationType)
            : (updated.unit ? isSquareMeterUnit(updated.unit) : false);

          if (!isDim) {
            // Any item whose unit does not require length/width:
            // Lock length to 1, width to 1, and count equals quantity
            updated.length = 1;
            updated.width = 1;
            if (updates.quantity !== undefined) {
              updated.count = Number(updates.quantity) || 1;
            } else {
              updated.count = Number(updated.quantity) || 1;
            }
          } else {
            // Recalculate dimensions & quantity for square meter items
            if (updates.length !== undefined || updates.width !== undefined || updates.count !== undefined) {
              const l = Number(updated.length) || 0;
              const w = Number(updated.width) || 0;
              const c = Number(updated.count) || 1;
              if (l > 0 && w > 0) {
                updated.quantity = Number((l * w * c).toFixed(3));
              } else {
                updated.quantity = c > 0 ? c : 1;
              }
            }
          }

          // Recalculate totalAmount for this item
          if (
            updates.quantity !== undefined ||
            updates.unitPrice !== undefined ||
            updates.length !== undefined ||
            updates.width !== undefined ||
            updates.count !== undefined ||
            updates.itemCode !== undefined ||
            updates.itemName !== undefined
          ) {
            const q = Number(updated.quantity) || 1;
            const p = Number(updated.unitPrice) || 0;
            updated.totalAmount = Number((q * p).toFixed(2));
          }

          return updated;
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
        const finalTotal = Math.max(0, Number((subtotal - discountVal).toFixed(2)));

        return {
          ...d,
          items: updatedItems,
          totalAmount: finalTotal
        };
      })
    );
  };

  // Select item from inventory autocomplete
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
      matchedInventoryId: invItem.id,
      matchedInventoryName: invItem.name,
      unitPrice: price
    });
    setActiveItemAutocompleteIdx(null);
  };

  // Commit Single Multi-Item Draft into Real Accounting Invoice
  const handleApproveDraft = (draft: MultiItemDraftInvoice, autoAdvance = true) => {
    if (!draft.items || draft.items.length === 0) {
      alert('لا يمكن اعتماد فاتورة بدون بنود.');
      return;
    }

    const nextInvNumber = getNextInvoiceNumber();

    // Prepare Items for createPosSale
    const itemsForContext = draft.items.map((it, idx) => {
      const matchedInv: InventoryItem = inventory.find(
        i =>
          (it.itemCode && i.code && i.code.toLowerCase() === it.itemCode.trim().toLowerCase()) ||
          (it.itemName && i.name && i.name.trim().toLowerCase() === it.itemName.trim().toLowerCase())
      ) || {
        id: it.matchedInventoryId || `custom-inv-item-${Date.now()}-${idx}`,
        code: it.itemCode || `ITM-${idx + 1}`,
        name: it.itemName.trim() || it.matchedInventoryName || it.notes || 'خدمة ومطبوعات عامة',
        category: 'services',
        unit: 'قطعة',
        purchasePrice: 0,
        sellingPrice: it.unitPrice || 0,
        stockQuantity: 1000,
        minAlertQuantity: 0
      };

      const isSq = isSquareMeterUnit(it.unit);
      const hasDims = isSq && Boolean(it.hasDimensions || (it.length && it.width && (it.length !== 1 || it.width !== 1 || (it.count && it.count > 1))));
      return {
        item: matchedInv,
        itemName: it.itemName,
        quantity: it.quantity > 0 ? it.quantity : 1,
        unitPrice: it.unitPrice >= 0 ? it.unitPrice : 0,
        length: hasDims ? it.length : 1,
        width: hasDims ? it.width : 1,
        count: hasDims ? (it.count || 1) : (it.quantity || 1),
        hasDimensions: hasDims,
        notes: it.notes,
        attachments: it.attachments,
        discount: 0,
        imageThumbnail: it.imageThumbnail || ''
      };
    });

    // Match customer party
    const matchedParty = parties.find(
      p =>
        (draft.customerId && p.id === draft.customerId) ||
        (p.name && p.name.trim().toLowerCase() === draft.customerName.trim().toLowerCase())
    );

    // Calculate Payments
    const subtotal = draft.items.reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0);
    let discountVal = 0;
    if (draft.discount && draft.discount > 0) {
      if (draft.discountType === 'percent') {
        discountVal = Number(((subtotal * draft.discount) / 100).toFixed(2));
      } else {
        discountVal = Number(Math.min(subtotal, draft.discount).toFixed(2));
      }
    }
    const netTotal = Math.max(0, Number((subtotal - discountVal).toFixed(2)));

    const cRate = draft.cashExchangeRate && draft.cashExchangeRate > 0 ? draft.cashExchangeRate : 1.0;
    const bRate = draft.bankExchangeRate && draft.bankExchangeRate > 0 ? draft.bankExchangeRate : 1.0;
    const rawCashNum = parseFloat(draft.cashAmount || '') || 0;
    const rawBankNum = parseFloat(draft.bankAmount || '') || 0;

    let cBase = rawCashNum * cRate;
    let bBase = rawBankNum * bRate;
    // توجيه سداد كامل الفاتورة في حال اختيار طريقة دفع نقدي كامل أو بنكي كامل
    if (draft.paymentMethod === 'cash') {
      cBase = netTotal;
      bBase = 0;
    } else if (draft.paymentMethod === 'bank_transfer' || draft.paymentMethod === 'card') {
      bBase = netTotal;
      cBase = 0;
    } else if (draft.paymentMethod === 'credit') {
      cBase = 0;
      bBase = 0;
    }

    const tPaidBase = cBase + bBase;
    const isCredit = draft.paymentMethod === 'credit' || (tPaidBase < netTotal && tPaidBase === 0);

    let effectiveMethod: PaymentMethod = draft.paymentMethod || 'cash';
    if (draft.paymentMethod === 'credit') {
      effectiveMethod = 'credit';
    } else if (draft.paymentMethod === 'bank_transfer') {
      effectiveMethod = 'bank_transfer';
    } else if (draft.paymentMethod === 'card') {
      effectiveMethod = 'card';
    } else if (draft.paymentMethod === 'cash') {
      effectiveMethod = 'cash';
    } else if (bBase > 0 && cBase === 0) {
      effectiveMethod = 'bank_transfer';
    } else if (cBase > 0 && bBase === 0) {
      effectiveMethod = 'cash';
    } else if (cBase > 0 && bBase > 0) {
      effectiveMethod = 'cash';
    } else if (isCredit) {
      effectiveMethod = 'credit';
    }

    // Execute createPosSale
    const savedInvoice = createPosSale(
      itemsForContext,
      draft.customerName || 'عميل كاشير نقدي',
      effectiveMethod,
      matchedParty?.id || draft.customerId,
      draft.notes,
      {
        invoiceNumber: undefined,
        date: draft.date || new Date().toISOString().split('T')[0],
        overallDiscount: discountVal,
        taxRate: 0,
        paidAmount: effectiveMethod === 'credit' ? 0 : (tPaidBase > 0 ? tPaidBase : netTotal),
        userId: currentUser?.id,
        userName: currentUser?.fullName || currentUser?.username || 'مدير النظام',
        subCustomerId: draft.subCustomerId,
        subCustomerName: draft.subCustomerName,
        subCustomerPhone: draft.subCustomerPhone,
        currency: draft.currency || 'ILS',
        currencySymbol: draft.currencySymbol || '₪',
        exchangeRate: draft.exchangeRate || 1.0,
        cashPaidAmount: effectiveMethod === 'cash' ? (rawCashNum > 0 ? rawCashNum : cBase) : 0,
        cashCurrency: draft.cashCurrency || 'ILS',
        cashExchangeRate: cRate,
        cashTreasuryCode: draft.cashTreasuryCode || '1101',
        bankPaidAmount: (effectiveMethod === 'bank_transfer' || effectiveMethod === 'card') ? (rawBankNum > 0 ? rawBankNum : bBase) : 0,
        bankCurrency: draft.bankCurrency || 'ILS',
        bankExchangeRate: bRate,
        bankTreasuryCode: draft.bankTreasuryCode || '1102',
        branchId: activeBranchId || (branches[0] && branches[0].id)
      }
    );

    // Remove approved draft from state
    setDraftInvoices(prev => prev.filter(d => d.id !== draft.id));
    posSound.playCashDrawer();

    setStatusMessage({
      type: 'success',
      text: `تم اعتماد وحفظ الفاتورة رقم (${savedInvoice.invoiceNumber || nextInvNumber}) للعميل (${draft.customerName}) بنجاح!`
    });

    if (autoAdvance) {
      if (draftInvoices.length <= 1) {
        setViewMode('table');
        setActiveDraftIndex(0);
      } else {
        if (activeDraftIndex >= draftInvoices.length - 1) {
          setActiveDraftIndex(Math.max(0, draftInvoices.length - 2));
        }
      }
    }
  };

  // Batch Approval for Selected Drafts
  const handleApproveSelected = () => {
    if (selectedDrafts.length === 0) {
      setStatusMessage({ type: 'error', text: 'يرجى تحديد مسودة واحدة على الأقل للاعتماد.' });
      return;
    }

    if (
      !window.confirm(
        `هل أنت متأكد من رغبتك في اعتماد ${selectedDrafts.length} مسودة فاتورة دفعة واحدة وترحيلها للحسابات والمخزون؟`
      )
    ) {
      return;
    }

    selectedDrafts.forEach(draft => {
      handleApproveDraft(draft, false);
    });

    setStatusMessage({
      type: 'success',
      text: `تهانينا! تم اعتماد وحفظ ${selectedDrafts.length} فاتورة بنجاح وترحيلها للحسابات!`
    });
  };

  // Quick select customer inside dedicated editor
  const handleSelectCustomer = (party: Party) => {
    if (!currentDraft) return;
    handleUpdateDraft(currentDraft.id, {
      customerId: party.id,
      customerName: party.name,
      customerPhone: party.phone || ''
    });
    setIsCustomerDropdownOpen(false);
  };

  // Linked sub-customers for the currently selected customer
  const linkedSubCustomers = useMemo(() => {
    if (!currentDraft) return [];
    const matchedParty = parties.find(
      p =>
        (currentDraft.customerId && p.id === currentDraft.customerId) ||
        (p.name && p.name.trim().toLowerCase() === currentDraft.customerName.trim().toLowerCase())
    );
    if (!matchedParty) return parties.filter(p => p.isSubCustomer);
    return parties.filter(p => p.isSubCustomer && p.parentPartyId === matchedParty.id);
  }, [parties, currentDraft]);

  // Main customer candidates for dropdown
  const mainCustomerCandidates = useMemo(() => {
    return parties.filter(p => !p.isSubCustomer && (p.type === 'customer' || p.type === 'both'));
  }, [parties]);

  return (
    <div className={`fixed inset-0 z-[120] bg-slate-950/90 backdrop-blur-xs flex items-center justify-center ${isFullscreen ? 'p-0' : 'p-2 sm:p-3'} text-slate-800`}>
      <div className={`bg-[#f0f4f8] ${isFullscreen ? 'rounded-none w-full h-full' : 'rounded-2xl w-[99vw] max-w-[1700px] h-[98vh]'} shadow-2xl border border-slate-300 flex flex-col overflow-hidden transition-all duration-200`}>
        {/* Main Modal Header */}
        <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-600/30 text-emerald-400 border border-emerald-500/40 rounded-xl shadow-2xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1">
              <h3 className="font-black text-sm text-white flex items-center gap-2">
                <span>شاشة مسودات فواتير الإكسل و OneDrive (مراجعة واعتماد تفصيلي)</span>
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold">
                  شاشة عريضة متكاملة
                </span>
              </h3>
              <span className="text-[11.5px] text-slate-300 font-light">
                • مطابقة ذكية للعميل والصنف والبنك، ومعاينة حية لسطر الإكسل الأصلي للتدقيق الفوري
              </span>
            </div>
          </div>

          {/* Mode Switcher, Fullscreen & Close */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setIsFullscreen(prev => !prev)}
              className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-bold border border-slate-700 flex items-center gap-1 transition cursor-pointer"
              title={isFullscreen ? 'تصغير الحجم قليلاً' : 'ملء الشاشة بالكامل'}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              <span>{isFullscreen ? 'نافذة عريضة' : 'ملء الشاشة'}</span>
            </button>

            {viewMode === 'dedicated_invoice' ? (
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>عرض جدول المسودات ({draftInvoices.length})</span>
              </button>
            ) : (
              draftInvoices.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveDraftIndex(0);
                    setViewMode('dedicated_invoice');
                  }}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition shadow-xs cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>فتح شاشة الفاتورة الكاملة</span>
                </button>
              )
            )}

            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Feedback Banner */}
        {statusMessage && (
          <div
            className={`px-4 py-2 text-xs flex items-center justify-between shrink-0 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-600 text-white'
                : statusMessage.type === 'error'
                ? 'bg-rose-600 text-white'
                : 'bg-blue-600 text-white'
            }`}
          >
            <div className="flex items-center gap-2 font-medium">
              {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0" />}
              {statusMessage.type === 'info' && <RefreshCw className="w-4 h-4 animate-spin shrink-0" />}
              <span>{statusMessage.text}</span>
            </div>
            <button onClick={() => setStatusMessage(null)} className="text-white/80 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ------------------------------------------------------------- */}
        {/* VIEW MODE 1: DEDICATED FULL INVOICE REVIEW SCREEN (الأعمدة الـ 12) */}
        {/* ------------------------------------------------------------- */}
        {viewMode === 'dedicated_invoice' && currentDraft ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-[#eef3f8]">
            {/* Top Draft Step Navigator Bar */}
            <div className="px-5 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-500">مسودة فاتورة:</span>
                <span className="px-3 py-1 bg-blue-100 text-blue-800 border border-blue-200 rounded-xl text-xs font-black font-mono">
                  {activeDraftIndex + 1} من {draftInvoices.length}
                </span>

                <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    disabled={activeDraftIndex <= 0}
                    onClick={() => setActiveDraftIndex(prev => Math.max(0, prev - 1))}
                    className="px-2.5 py-1 text-slate-700 disabled:opacity-30 hover:bg-white rounded-md text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    title="الفاتورة السابقة"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                    <span>السابق</span>
                  </button>
                  <button
                    type="button"
                    disabled={activeDraftIndex >= draftInvoices.length - 1}
                    onClick={() => setActiveDraftIndex(prev => Math.min(draftInvoices.length - 1, prev + 1))}
                    className="px-2.5 py-1 text-slate-700 disabled:opacity-30 hover:bg-white rounded-md text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    title="الفاتورة التالية"
                  >
                    <span>التالي</span>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Auto Match Status Badges */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {currentDraft.customerId && (
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-300 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      <span>عميل مطابق: {currentDraft.customerName}</span>
                    </span>
                  )}
                  {currentDraft.subCustomerName && (
                    <span className="text-[10px] bg-purple-50 text-purple-700 border border-purple-300 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                      <Building2 className="w-3 h-3 text-purple-600" />
                      <span>الفرعي: {currentDraft.subCustomerName}</span>
                    </span>
                  )}
                  {currentDraft.paymentMethod === 'bank_transfer' && (
                    <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-300 px-2 py-0.5 rounded-md font-bold flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-blue-600" />
                      <span>تحويل بنكي مطابق</span>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleAddItemToDraft(currentDraft.id)}
                  className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ إضافة بند آخر لنفس الزبون</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('هل تريد حذف هذه المسودة من الطابور؟')) {
                      setDraftInvoices(prev => prev.filter(d => d.id !== currentDraft.id));
                      if (activeDraftIndex >= draftInvoices.length - 1) {
                        setActiveDraftIndex(Math.max(0, draftInvoices.length - 2));
                      }
                      if (draftInvoices.length <= 1) {
                        setViewMode('table');
                      }
                    }
                  }}
                  className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>حذف المسودة</span>
                </button>
              </div>
            </div>

            {/* Scrollable Main Invoice Content */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3.5">
              {/* CARD 1: Header / Date / Main Customer / Sub-Customer (تعديل التاريخ والعميل والعميل الفرعي) */}
              <div className="bg-white rounded-xl p-3.5 border border-slate-200 shadow-2xs space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  {/* Date Input */}
                  <div>
                    <label className="block text-slate-600 font-bold mb-1 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      <span>تاريخ الفاتورة:</span>
                    </label>
                    <input
                      type="date"
                      value={currentDraft.date}
                      onChange={e => handleUpdateDraft(currentDraft.id, { date: e.target.value })}
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-500"
                    />
                  </div>

                  {/* Main Customer Input & Dropdown Selector */}
                  <div className="relative">
                    <label className="block text-slate-600 font-bold mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <User className="w-3.5 h-3.5 text-blue-600" />
                        <span>العميل / الزبون الرئيسي:</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setIsCustomerDropdownOpen(prev => !prev)}
                        className="text-blue-600 hover:text-blue-800 text-[10px] font-bold cursor-pointer"
                      >
                        {isCustomerDropdownOpen ? 'إخفاء القائمة' : 'اختيار من المسجلين'}
                      </button>
                    </label>
                    <input
                      type="text"
                      value={currentDraft.customerName}
                      onChange={e =>
                        handleUpdateDraft(currentDraft.id, { customerName: e.target.value, customerId: undefined })
                      }
                      placeholder="اسم العميل..."
                      className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 outline-none focus:bg-white focus:border-blue-500"
                    />

                    {/* Dropdown for registered customers */}
                    {isCustomerDropdownOpen && (
                      <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-xl shadow-xl max-h-48 overflow-y-auto p-1 divide-y divide-slate-100">
                        {mainCustomerCandidates.map(c => (
                          <div
                            key={c.id}
                            onClick={() => handleSelectCustomer(c)}
                            className="p-2 hover:bg-blue-50 cursor-pointer rounded-lg flex items-center justify-between text-xs"
                          >
                            <div>
                              <strong className="text-slate-800 block">{c.name}</strong>
                              <span className="text-[10px] text-slate-400">{c.code} {c.phone ? `| ${c.phone}` : ''}</span>
                            </div>
                            <span className="text-[10px] font-mono text-slate-500 font-bold">
                              رصيد: {c.balance || 0} {settings.currency}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Sub-Customer (العميل الفرعي) */}
                  <div>
                    <label className="block text-slate-600 font-bold mb-1 flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Building2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>العميل الفرعي (الاسم المسجل بالإكسل):</span>
                      </span>
                      {linkedSubCustomers.length > 0 && (
                        <span className="text-[10px] text-emerald-700 font-semibold">
                          ({linkedSubCustomers.length} فرعي متاح)
                        </span>
                      )}
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={currentDraft.subCustomerName || ''}
                        onChange={e => handleUpdateDraft(currentDraft.id, { subCustomerName: e.target.value })}
                        placeholder="اسم العميل الفرعي..."
                        className="flex-1 p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 outline-none focus:bg-white focus:border-blue-500"
                        list={`sub-cust-list-${currentDraft.id}`}
                      />
                      <datalist id={`sub-cust-list-${currentDraft.id}`}>
                        {linkedSubCustomers.map(sc => (
                          <option key={sc.id} value={sc.name}>
                            {sc.phone ? `${sc.name} (${sc.phone})` : sc.name}
                          </option>
                        ))}
                      </datalist>

                      <input
                        type="text"
                        value={currentDraft.subCustomerPhone || ''}
                        onChange={e => handleUpdateDraft(currentDraft.id, { subCustomerPhone: e.target.value })}
                        placeholder="هاتف الفرعي"
                        className="w-28 p-2 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs text-slate-700 outline-none focus:bg-white focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* CARD 2: EXACT 12 COLUMNS CASHIER TABLE AS REQUESTED */}
              {/* 1. الرقم | 2. رقم الصنف | 3. اسم الصنف | 4. البيان والملاحظات | 5. طول | 6. عرض | 7. عدد | 8. كمية | 9. السعر | 10. الإجمالي | 11. مرفق | 12. حذف */}
              <div className="bg-white rounded-xl p-3.5 border border-slate-300 shadow-2xs space-y-2.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2 text-xs font-black text-slate-900">
                    <Table className="w-4 h-4 text-blue-700" />
                    <span>جدول بنود الفاتورة (الـ 12 عمود لجدول الكاشير) - {currentDraft.items.length} بنود</span>
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

                {/* POS Cashier Table Container */}
                <div className="border border-[#94b8db] rounded-lg overflow-x-auto shadow-xs bg-white">
                  <table className="w-full text-right border-collapse text-xs min-w-[980px]">
                    <thead>
                      <tr className="bg-gradient-to-b from-[#dbe9f6] to-[#b8d3ec] text-[#0f2744] font-black border-b border-[#94b8db] select-none text-[12px]">
                        {/* 1. الرقم (الترقيم المسلسل م) */}
                        <th className="py-2 px-1 text-center w-10 border-l border-[#94b8db] font-bold text-slate-900">م</th>
                        {/* 2. اسم الصنف */}
                        <th className="py-2 px-2 border-l border-[#94b8db] w-56 sm:w-72 min-w-[220px]">اسم الصنف</th>
                        {/* صورة البند */}
                        <th className="py-2 px-1 text-center w-12 border-l border-[#94b8db]">صورة</th>
                        {/* 3. البيان والملاحظات */}
                        <th className="py-2 px-2 border-l border-[#94b8db] min-w-[160px]">البيان والملاحظات</th>
                        {/* 4. طول */}
                        <th className="py-2 px-1 w-16 text-center border-l border-[#94b8db]">طول</th>
                        {/* 5. عرض */}
                        <th className="py-2 px-1 w-16 text-center border-l border-[#94b8db]">عرض</th>
                        {/* 6. عدد */}
                        <th className="py-2 px-1 w-16 text-center border-l border-[#94b8db]">عدد</th>
                        {/* 7. كمية */}
                        <th className="py-2 px-1 w-20 text-center border-l border-[#94b8db]">كمية</th>
                        {/* 8. السعر */}
                        <th className="py-2 px-1 w-20 text-center border-l border-[#94b8db]">السعر</th>
                        {/* 9. الإجمالي */}
                        <th className="py-2 px-2 w-28 text-center border-l border-[#94b8db] bg-[#a9c9e8]">الإجمالي</th>
                        {/* 10. مرفق */}
                        <th className="py-2 px-1 w-14 text-center border-l border-[#94b8db]">مرفق</th>
                        {/* 11. حذف */}
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
                        <tr key={`draft-it-${item.id || itIdx}-${itIdx}`} className="hover:bg-blue-50/50 transition-colors">
                          {/* 1. الرقم (الترقيم المسلسل م) */}
                          <td className="p-1 text-center text-slate-800 font-mono font-black border-l border-[#d4e4f4]">
                            {itIdx + 1}
                          </td>

                          {/* 3. اسم الصنف */}
                          <td className="p-1 border-l border-[#d4e4f4]">
                            <ItemNameCellInputModal
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

                          {/* صورة البند */}
                          <td className="p-1 border-l border-[#d4e4f4] text-center">
                            <div className="flex items-center justify-center h-full min-h-[28px] relative group/imgcell gap-1">
                              {item.imageThumbnail ? (
                                <div className="flex items-center gap-1 px-1">
                                  {/* Green Checkmark representing successful upload */}
                                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" title="تم رفع وإرفاق الصور بنجاح" />
                                  
                                  {/* Thumbnails Gallery */}
                                  <div className="flex -space-x-1.5 rtl:space-x-reverse overflow-hidden">
                                    {parseThumbnails(item.imageThumbnail).slice(0, 3).map((imgStr, imgIdx) => (
                                      <div key={imgIdx} className="relative w-5.5 h-5.5 rounded-full overflow-hidden border border-white ring-1 ring-slate-200">
                                        <img src={imgStr} alt="" className="w-full h-full object-cover" />
                                      </div>
                                    ))}
                                    {parseThumbnails(item.imageThumbnail).length > 3 && (
                                      <div className="w-5.5 h-5.5 rounded-full bg-slate-200 text-slate-800 text-[8px] font-bold flex items-center justify-center border border-white ring-1 ring-slate-200">
                                        +{parseThumbnails(item.imageThumbnail).length - 3}
                                      </div>
                                    )}
                                  </div>

                                  {/* Delete Action */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleUpdateItem(currentDraft.id, item.id, { imageThumbnail: '' });
                                    }}
                                    className="text-slate-400 hover:text-rose-600 p-0.5 rounded hover:bg-rose-50 cursor-pointer"
                                    title="حذف كافة الصور المرفقة للبند"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              ) : (
                                <label
                                  className="w-7 h-7 rounded-md border border-dashed border-slate-300 hover:border-blue-500 hover:bg-blue-50 flex items-center justify-center cursor-pointer transition-all text-slate-400 hover:text-blue-600"
                                  title="رفع صورة أو عدة صور للبند"
                                >
                                  <Plus className="w-3 h-3" />
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
                                          handleUpdateItem(currentDraft.id, item.id, { imageThumbnail: JSON.stringify(validImages) });
                                        }
                                      }
                                    }}
                                  />
                                </label>
                              )}
                            </div>
                          </td>

                          {/* 4. البيان والملاحظات */}
                          <td className="p-1 border-l border-[#d4e4f4]">
                            <input
                              type="text"
                              value={item.notes || ''}
                              onChange={e =>
                                handleUpdateItem(currentDraft.id, item.id, { notes: e.target.value })
                              }
                              placeholder="البيان / ملاحظات الإكسل..."
                              className="w-full p-1 bg-white border border-[#b8d3ec] hover:border-blue-400 focus:border-blue-600 rounded text-[11px] text-slate-700 outline-none"
                            />
                          </td>

                          {/* 5. طول */}
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
                                  handleUpdateItem(currentDraft.id, item.id, { length: parseFloat(e.target.value) || 0 })
                                }
                                placeholder="-"
                                className="w-full p-1 bg-white border border-[#b8d3ec] hover:border-blue-400 focus:border-blue-600 rounded font-mono text-xs text-center outline-none"
                              />
                            )}
                          </td>

                          {/* 6. عرض */}
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
                                  handleUpdateItem(currentDraft.id, item.id, { width: parseFloat(e.target.value) || 0 })
                                }
                                placeholder="-"
                                className="w-full p-1 bg-white border border-[#b8d3ec] hover:border-blue-400 focus:border-blue-600 rounded font-mono text-xs text-center outline-none"
                              />
                            )}
                          </td>

                          {/* 7. عدد */}
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
                                  handleUpdateItem(currentDraft.id, item.id, { count: parseInt(e.target.value, 10) || 1 })
                                }
                                className="w-full p-1 bg-white border border-[#b8d3ec] hover:border-blue-400 focus:border-blue-600 rounded font-mono text-xs text-center outline-none"
                              />
                            )}
                          </td>

                          {/* 8. كمية */}
                          <td className="p-1 border-l border-[#d4e4f4]">
                            <input
                              type="number"
                              step="0.01"
                              value={item.quantity}
                              onChange={e =>
                                handleUpdateItem(currentDraft.id, item.id, { quantity: parseFloat(e.target.value) || 0 })
                              }
                              className="w-full p-1 bg-white border border-[#b8d3ec] hover:border-blue-400 focus:border-blue-600 rounded font-mono text-xs font-bold text-center text-blue-700 outline-none"
                            />
                          </td>

                          {/* 9. السعر */}
                          <td className="p-1 border-l border-[#d4e4f4]">
                            <input
                              type="number"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={e =>
                                handleUpdateItem(currentDraft.id, item.id, { unitPrice: parseFloat(e.target.value) || 0 })
                              }
                              className="w-full p-1 bg-white border border-[#b8d3ec] hover:border-blue-400 focus:border-blue-600 rounded font-mono text-xs font-bold text-center text-slate-800 outline-none"
                            />
                          </td>

                          {/* 10. الإجمالي */}
                          <td className="p-1 text-center font-mono font-black text-slate-900 bg-white border-l border-[#d4e4f4] whitespace-nowrap">
                            ₪ {item.totalAmount.toFixed(2)}
                          </td>

                          {/* 11. مرفق (Line Attachments) */}
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

                          {/* 12. حذف وإضافة بند جديد */}
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

              {/* CARD 3: FULL PAYMENT CONSOLE (لوحة الدفع الشاملة مطابقة لشاشة الكاشير) */}
              <div className="bg-white rounded-xl p-3.5 border border-blue-200 shadow-2xs space-y-3.5">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-2.5">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-blue-600" />
                    <h4 className="font-bold text-xs text-slate-800">
                      لوحة الدفع الشاملة وخيارات التسديد (نقد / بنك / ذمم آجل / عملات)
                    </h4>
                  </div>

                  {/* Quick Full Pay Action Buttons */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateDraft(currentDraft.id, {
                          paymentMethod: 'cash',
                          cashAmount: currentDraft.totalAmount.toString(),
                          bankAmount: '0'
                        });
                      }}
                      className="px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Banknote className="w-3.5 h-3.5" />
                      <span>دفع نقدي كامل (كاش)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateDraft(currentDraft.id, {
                          paymentMethod: 'bank_transfer',
                          bankAmount: currentDraft.totalAmount.toString(),
                          cashAmount: '0'
                        });
                      }}
                      className="px-3 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-300 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>دفع بنكي كامل (تحويل/فيزا)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateDraft(currentDraft.id, {
                          paymentMethod: 'credit',
                          cashAmount: '0',
                          bankAmount: '0'
                        });
                      }}
                      className="px-3 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    >
                      <Coins className="w-3.5 h-3.5" />
                      <span>ذمم / آجل بالكامل</span>
                    </button>
                  </div>
                </div>

                {/* 1. Invoice Currency & Discount & Notes */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs bg-slate-50/70 p-3 rounded-xl border border-slate-200">
                  {/* Currency & Exchange Rate */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="block text-slate-500 font-bold mb-1 text-[11px]">عملة الفاتورة:</label>
                      <select
                        value={currentDraft.currency || 'ILS'}
                        onChange={e => {
                          const code = e.target.value;
                          const found = currencies.find(c => c.code === code);
                          handleUpdateDraft(currentDraft.id, {
                            currency: code,
                            currencySymbol: found?.symbol || '₪',
                            exchangeRate: found?.rateAgainstBase || 1.0
                          });
                        }}
                        className="w-full p-1.5 bg-white border border-slate-300 rounded-lg font-bold text-xs outline-none cursor-pointer"
                      >
                        {currencies.length > 0 ? (
                          currencies.map(c => (
                            <option key={c.code} value={c.code}>
                              {c.name} ({c.symbol})
                            </option>
                          ))
                        ) : (
                          <>
                            <option value="ILS">شيكل إسرائيلي (₪)</option>
                            <option value="USD">دولار أمريكي ($)</option>
                            <option value="JOD">دينار أردني (د.أ)</option>
                          </>
                        )}
                      </select>
                    </div>

                    <div className="w-24">
                      <label className="block text-slate-500 font-bold mb-1 text-[11px]">سعر الصرف:</label>
                      <input
                        type="number"
                        step="0.001"
                        value={currentDraft.exchangeRate || 1.0}
                        onChange={e =>
                          handleUpdateDraft(currentDraft.id, { exchangeRate: parseFloat(e.target.value) || 1.0 })
                        }
                        className="w-full p-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs text-center outline-none"
                      />
                    </div>
                  </div>

                  {/* Overall Discount */}
                  <div>
                    <label className="block text-slate-500 font-bold mb-1 text-[11px] flex items-center justify-between">
                      <span>الخصم الإجمالي:</span>
                      <span className="text-[10px] text-blue-600">
                        {currentDraft.discountType === 'percent' ? 'نسبة مئوية (%)' : 'مبلغ ثابت (₪)'}
                      </span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        value={currentDraft.discount || ''}
                        onChange={e =>
                          handleUpdateDraft(currentDraft.id, { discount: parseFloat(e.target.value) || 0 })
                        }
                        placeholder="0.00"
                        className="flex-1 p-1.5 bg-white border border-slate-300 rounded-lg font-mono text-xs font-bold outline-none"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateDraft(currentDraft.id, {
                            discountType: currentDraft.discountType === 'percent' ? 'amount' : 'percent'
                          })
                        }
                        className="px-2 py-1.5 bg-slate-200 hover:bg-slate-300 rounded-lg text-xs font-bold cursor-pointer"
                      >
                        {currentDraft.discountType === 'percent' ? '%' : '₪'}
                      </button>
                    </div>
                  </div>

                  {/* Notes Line */}
                  <div>
                    <label className="block text-slate-500 font-bold mb-1 text-[11px]">ملاحظات الفاتورة العامة:</label>
                    <input
                      type="text"
                      value={currentDraft.notes || ''}
                      onChange={e => handleUpdateDraft(currentDraft.id, { notes: e.target.value })}
                      placeholder="سطر ملاحظات عامة..."
                      className="w-full p-1.5 bg-white border border-slate-300 rounded-lg text-xs outline-none"
                    />
                  </div>
                </div>

                {/* 2. Split Payments: Cash & Bank Sections */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  {/* Cash Payment Box */}
                  <div className="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 space-y-2">
                    <div className="flex items-center justify-between font-bold text-emerald-900 border-b border-emerald-200/70 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <Banknote className="w-4 h-4 text-emerald-700" />
                        <span>الدفع النقدي (الكاش)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateDraft(currentDraft.id, { cashAmount: currentDraft.totalAmount.toString() })
                        }
                        className="text-[10px] text-emerald-700 hover:underline font-bold cursor-pointer"
                      >
                        سداد كامل المبلغ كاش
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="block text-[10px] text-emerald-800 font-bold mb-0.5">المبلغ:</label>
                        <input
                          type="number"
                          step="0.01"
                          value={currentDraft.cashAmount || ''}
                          onChange={e => handleUpdateDraft(currentDraft.id, { cashAmount: e.target.value })}
                          placeholder="0.00"
                          className="w-full p-1.5 bg-white border border-emerald-300 rounded-lg font-mono font-bold text-xs text-emerald-900 outline-none"
                        />
                      </div>

                      <div className="col-span-1">
                        <label className="block text-[10px] text-emerald-800 font-bold mb-0.5">العملة:</label>
                        <select
                          value={currentDraft.cashCurrency || 'ILS'}
                          onChange={e => {
                            const code = e.target.value;
                            const found = currencies.find(c => c.code === code);
                            handleUpdateDraft(currentDraft.id, {
                              cashCurrency: code,
                              cashExchangeRate: found?.rateAgainstBase || 1.0
                            });
                          }}
                          className="w-full p-1.5 bg-white border border-emerald-300 rounded-lg text-xs font-bold outline-none cursor-pointer"
                        >
                          <option value="ILS">ILS ₪</option>
                          <option value="USD">USD $</option>
                          <option value="JOD">JOD د.أ</option>
                        </select>
                      </div>

                      <div className="col-span-1">
                        <label className="block text-[10px] text-emerald-800 font-bold mb-0.5">الصندوق / الخزينة:</label>
                        <select
                          value={currentDraft.cashTreasuryCode || '1101'}
                          onChange={e => handleUpdateDraft(currentDraft.id, { cashTreasuryCode: e.target.value })}
                          className="w-full p-1.5 bg-white border border-emerald-300 rounded-lg text-xs outline-none cursor-pointer"
                        >
                          {treasuries.length > 0 ? (
                            treasuries
                              .filter(t => t.type === 'cash_box' || t.accountCode === '1101')
                              .map(t => (
                                <option key={t.id} value={t.accountCode || t.id}>
                                  {t.name}
                                </option>
                              ))
                          ) : (
                            <option value="1101">صندوق الكاشير الرئيسي</option>
                          )}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Bank Payment Box */}
                  <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-200 space-y-2">
                    <div className="flex items-center justify-between font-bold text-blue-900 border-b border-blue-200/70 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="w-4 h-4 text-blue-700" />
                        <span>الدفع البنكي / التحويل / البطاقات</span>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          handleUpdateDraft(currentDraft.id, { bankAmount: currentDraft.totalAmount.toString() })
                        }
                        className="text-[10px] text-blue-700 hover:underline font-bold cursor-pointer"
                      >
                        سداد كامل المبلغ بنك
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-1">
                        <label className="block text-[10px] text-blue-800 font-bold mb-0.5">المبلغ:</label>
                        <input
                          type="number"
                          step="0.01"
                          value={currentDraft.bankAmount || ''}
                          onChange={e => handleUpdateDraft(currentDraft.id, { bankAmount: e.target.value })}
                          placeholder="0.00"
                          className="w-full p-1.5 bg-white border border-blue-300 rounded-lg font-mono font-bold text-xs text-blue-900 outline-none"
                        />
                      </div>

                      <div className="col-span-1">
                        <label className="block text-[10px] text-blue-800 font-bold mb-0.5">العملة:</label>
                        <select
                          value={currentDraft.bankCurrency || 'ILS'}
                          onChange={e => {
                            const code = e.target.value;
                            const found = currencies.find(c => c.code === code);
                            handleUpdateDraft(currentDraft.id, {
                              bankCurrency: code,
                              bankExchangeRate: found?.rateAgainstBase || 1.0
                            });
                          }}
                          className="w-full p-1.5 bg-white border border-blue-300 rounded-lg text-xs font-bold outline-none cursor-pointer"
                        >
                          <option value="ILS">ILS ₪</option>
                          <option value="USD">USD $</option>
                          <option value="JOD">JOD د.أ</option>
                        </select>
                      </div>

                      <div className="col-span-1">
                        <label className="block text-[10px] text-blue-800 font-bold mb-0.5">الحساب البنكي:</label>
                        <select
                          value={currentDraft.bankTreasuryCode || '1102'}
                          onChange={e => handleUpdateDraft(currentDraft.id, { bankTreasuryCode: e.target.value })}
                          className="w-full p-1.5 bg-white border border-blue-300 rounded-lg text-xs outline-none cursor-pointer"
                        >
                          {treasuries.length > 0 ? (
                            treasuries
                              .filter(t => t.type !== 'cash_box')
                              .map(t => (
                                <option key={t.id} value={t.accountCode || t.id}>
                                  {t.name}
                                </option>
                              ))
                          ) : (
                            <option value="1102">حساب بنك فلسطين / التحويلات</option>
                          )}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                {/* 3. Financial Summary Bar */}
                {(() => {
                  const subtotal = currentDraft.items.reduce((sum, it) => sum + (Number(it.totalAmount) || 0), 0);
                  let discountVal = 0;
                  if (currentDraft.discount && currentDraft.discount > 0) {
                    if (currentDraft.discountType === 'percent') {
                      discountVal = Number(((subtotal * currentDraft.discount) / 100).toFixed(2));
                    } else {
                      discountVal = Number(Math.min(subtotal, currentDraft.discount).toFixed(2));
                    }
                  }
                  const netTotal = Math.max(0, Number((subtotal - discountVal).toFixed(2)));

                  const cRate = currentDraft.cashExchangeRate || 1.0;
                  const bRate = currentDraft.bankExchangeRate || 1.0;
                  const cVal = (parseFloat(currentDraft.cashAmount || '') || 0) * cRate;
                  const bVal = (parseFloat(currentDraft.bankAmount || '') || 0) * bRate;
                  const totalPaid = cVal + bVal;
                  const remaining = Math.max(0, Number((netTotal - totalPaid).toFixed(2)));

                  return (
                    <div className="bg-slate-900 text-white p-3.5 rounded-xl flex flex-wrap items-center justify-between gap-3 text-xs shadow-inner">
                      <div className="flex items-center gap-4">
                        <div>
                          <span className="text-slate-400 block text-[10px]">المجموع الفرعي:</span>
                          <strong className="font-mono text-sm">{subtotal.toFixed(2)} {settings.currency}</strong>
                        </div>
                        {discountVal > 0 && (
                          <div>
                            <span className="text-rose-400 block text-[10px]">الخصم:</span>
                            <strong className="font-mono text-sm text-rose-300">-{discountVal.toFixed(2)}</strong>
                          </div>
                        )}
                        <div>
                          <span className="text-emerald-400 block text-[10px]">الصافي المطلوب:</span>
                          <strong className="font-mono text-base font-black text-emerald-400">{netTotal.toFixed(2)} {settings.currency}</strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 border-r border-slate-700 pr-4">
                        <div>
                          <span className="text-slate-400 block text-[10px]">المدفوع نقداً:</span>
                          <strong className="font-mono text-xs text-emerald-300">{cVal.toFixed(2)}</strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">المدفوع بنكاً:</span>
                          <strong className="font-mono text-xs text-blue-300">{bVal.toFixed(2)}</strong>
                        </div>
                        <div className="bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                          <span className="text-amber-400 block text-[10px]">المتبقي (آجل / ذمة):</span>
                          <strong className="font-mono text-sm font-black text-amber-300">
                            {remaining.toFixed(2)} {settings.currency}
                          </strong>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Sticky Action Bar (اعتماد الفاتورة والانتقال التلقائي للسطر التالي) */}
            <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-lg">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <ArrowRight className="w-4 h-4" />
                  <span>العودة لجدول المسودات</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setStatusMessage({
                      type: 'success',
                      text: 'تم حفظ التعديلات في المسودة الحالية بنجاح!'
                    });
                  }}
                  className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>حفظ التعديلات في المسودة فقط</span>
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleApproveDraft(currentDraft, true)}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-black flex items-center gap-2 shadow-md transition cursor-pointer"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  <span>✔ اعتماد وحفظ الفاتورة والانتقال للتالية (Enter)</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* ------------------------------------------------------------- */
          /* VIEW MODE 2: OVERVIEW TABLE (جدول كافة المسودات) */
          /* ------------------------------------------------------------- */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Source Selector & Sync Control Bar */}
            <div className="p-3 sm:p-4 bg-white border-b border-slate-200 shrink-0 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Source Tabs */}
                <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
                  <button
                    type="button"
                    onClick={() => setActiveSourceTab('url')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      activeSourceTab === 'url'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                    }`}
                  >
                    <CloudDownload className="w-3.5 h-3.5" />
                    <span>الرابط السحابي التلقائي (OneDrive / Sheets)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSourceTab('upload')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      activeSourceTab === 'upload'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                    }`}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>رفع ملف Excel (.xlsx / .csv)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSourceTab('paste')}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                      activeSourceTab === 'paste'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-white'
                    }`}
                  >
                    <ClipboardPaste className="w-3.5 h-3.5" />
                    <span>نسخ ولصق من الإكسل مباشرة</span>
                  </button>
                </div>

                {/* Quick Action & Stats */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleAddNewDraftInvoice}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>+ إضافة مسودة جديدة يدوياً</span>
                  </button>

                  <div className="bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200 text-xs flex items-center gap-2">
                    <span className="text-slate-500">إجمالي المسودات:</span>
                    <strong className="text-slate-900 font-mono font-bold">{draftInvoices.length}</strong>
                  </div>
                  <div className="bg-emerald-50 px-3 py-1.5 rounded-xl border border-emerald-200 text-xs flex items-center gap-2 text-emerald-800">
                    <span className="text-emerald-700">المبلغ الإجمالي:</span>
                    <strong className="font-mono font-black">
                      {totalDraftsAmount.toLocaleString('en-US')} {settings.currency}
                    </strong>
                  </div>
                </div>
              </div>

              {/* Active Tab Content Area */}
              {activeSourceTab === 'url' && (
                <div className="bg-slate-50 p-2.5 rounded-xl border border-blue-100 flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="flex-1 flex items-center gap-2 border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white focus-within:border-blue-500">
                    <ExternalLink className="w-4 h-4 text-blue-600 shrink-0" />
                    <input
                      type="text"
                      value={sheetUrl}
                      onChange={e => handleSaveUrl(e.target.value)}
                      placeholder="ضع رابط ملف OneDrive أو Google Sheets هنا..."
                      className="w-full bg-transparent text-xs font-mono text-slate-800 outline-none placeholder:text-slate-400"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleFetchFromLiveUrl}
                    disabled={isLoading}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-xs transition cursor-pointer whitespace-nowrap"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>جاري السحب والمطابقة...</span>
                      </>
                    ) : (
                      <>
                        <CloudDownload className="w-3.5 h-3.5" />
                        <span>سحب وتحديث المسودات تلقائياً</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {activeSourceTab === 'upload' && (
                <div className="bg-slate-50 p-2.5 rounded-xl border border-blue-100 flex items-center justify-between gap-4">
                  <div className="text-xs text-slate-600 flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>حدد ملف الإكسل بصيغة <strong className="font-mono text-slate-900">.xlsx</strong> أو <strong className="font-mono text-slate-900">.csv</strong> ليتم تحويل ومطابقة كل سطر فوراً</span>
                  </div>
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      onChange={handleFileUpload}
                      className="hidden"
                      id="excel-file-upload-input-main"
                    />
                    <label
                      htmlFor="excel-file-upload-input-main"
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>تحديد ورفع ملف Excel</span>
                    </label>
                  </div>
                </div>
              )}

              {activeSourceTab === 'paste' && (
                <div className="bg-slate-50 p-2.5 rounded-xl border border-blue-100 space-y-2">
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder="قم بتحديد الصفوف من برنامج الإكسل وانسخها (Ctrl+C)، ثم الصقها هنا مباشرة (Ctrl+V)..."
                    rows={2}
                    className="w-full p-2 text-xs font-mono border border-slate-300 rounded-lg outline-none focus:border-blue-500 bg-white"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={handleParsePaste}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>معالجة ومطابقة الأسطر لمسودات</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Filter & Batch Actions Toolbar */}
            {draftInvoices.length > 0 && (
              <div className="px-5 py-2.5 bg-slate-200/80 border-b border-slate-300 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const allSelected = displayedDrafts.every(d => d.selected);
                      const dispIds = new Set(displayedDrafts.map(d => d.id));
                      setDraftInvoices(prev =>
                        prev.map(d => (dispIds.has(d.id) ? { ...d, selected: !allSelected } : d))
                      );
                    }}
                    className="text-xs text-slate-700 font-bold hover:text-blue-600 cursor-pointer flex items-center gap-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={displayedDrafts.length > 0 && displayedDrafts.every(d => d.selected)}
                      readOnly
                      className="rounded text-blue-600 cursor-pointer"
                    />
                    <span>تحديد الكل ({displayedDrafts.length})</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleToggleGrouping}
                    className="px-3 py-1 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    <span>تجميع بنود نفس العميل والتاريخ</span>
                  </button>

                  {selectedDrafts.length > 0 && (
                    <span className="text-xs text-blue-800 font-bold bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded-md">
                      تم تحديد {selectedDrafts.length} مسودة بمبلغ: {selectedDraftsAmount.toLocaleString('en-US')} {settings.currency}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute right-2.5 top-2 text-slate-400" />
                    <input
                      type="text"
                      value={searchFilter}
                      onChange={e => setSearchFilter(e.target.value)}
                      placeholder="بحث بالعميل أو الصنف..."
                      className="bg-white border border-slate-300 rounded-lg pr-8 pl-3 py-1 text-xs w-48 focus:w-60 transition-all outline-none"
                    />
                  </div>

                  {selectedDrafts.length > 0 && (
                    <button
                      type="button"
                      onClick={handleApproveSelected}
                      className="px-3.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>اعتماد وحفظ المحدد ({selectedDrafts.length})</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm('هل أنت متأكد من رغبتك في تفريغ كافة المسودات؟')) {
                        setDraftInvoices([]);
                        setStatusMessage({ type: 'info', text: 'تم تفريغ طابور المسودات بالكامل.' });
                      }
                    }}
                    className="px-2.5 py-1 text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>تفريغ</span>
                  </button>
                </div>
              </div>
            )}

            {/* Overview Table Content */}
            <div className="flex-1 overflow-auto p-4 bg-slate-50/50">
              {draftInvoices.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center p-6 border-2 border-dashed border-slate-300 rounded-2xl bg-white">
                  <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                    <FileSpreadsheet className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-sm text-slate-800 mb-1">لا توجد مسودات فواتير بانتظار الاعتماد</h4>
                  <p className="text-xs text-slate-400 max-w-md mb-4 font-light">
                    اضغط على زر "سحب وتحديث المسودات تلقائياً" أو ارفع ملف إكسل لإدخال الفواتير ومراجعتها واعتمادها سطر بسطر
                  </p>
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
              ) : (
                <div className="border border-slate-300 rounded-xl overflow-hidden shadow-2xs bg-white">
                  <table className="w-full text-right border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-800 text-white font-bold border-b border-slate-900">
                        <th className="p-2.5 text-center w-8">
                          <input
                            type="checkbox"
                            checked={displayedDrafts.length > 0 && displayedDrafts.every(d => d.selected)}
                            onChange={() => {
                              const allSelected = displayedDrafts.every(d => d.selected);
                              const dispIds = new Set(displayedDrafts.map(d => d.id));
                              setDraftInvoices(prev =>
                                prev.map(d => (dispIds.has(d.id) ? { ...d, selected: !allSelected } : d))
                              );
                            }}
                            className="rounded cursor-pointer"
                          />
                        </th>
                        <th className="p-2.5 w-8 text-center">م</th>
                        <th className="p-2.5 w-24 text-center">التاريخ</th>
                        <th className="p-2.5 w-44">اسم العميل الرئيسي</th>
                        <th className="p-2.5 w-36">العميل الفرعي</th>
                        <th className="p-2.5">البنود / تفاصيل الأصناف</th>
                        <th className="p-2.5 w-16 text-center">العدد</th>
                        <th className="p-2.5 w-28 text-center bg-slate-700">المبلغ الإجمالي</th>
                        <th className="p-2.5 w-24 text-center">نوع الدفع</th>
                        <th className="p-2.5 w-48 text-center">إجراءات الفاتورة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {displayedDrafts.map((draft, idx) => (
                        <tr
                          key={`draft-queue-${draft.id || idx}-${idx}`}
                          className={`hover:bg-blue-50/40 transition-colors ${
                            draft.selected ? 'bg-blue-50/20' : idx % 2 === 1 ? 'bg-slate-50/50' : 'bg-white'
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="p-2 text-center align-middle">
                            <input
                              type="checkbox"
                              checked={draft.selected}
                              onChange={e => handleUpdateDraft(draft.id, { selected: e.target.checked })}
                              className="rounded text-blue-600 cursor-pointer"
                            />
                          </td>

                          {/* Index */}
                          <td className="p-2 text-center text-slate-400 font-mono align-middle font-bold">
                            {idx + 1}
                          </td>

                          {/* Date */}
                          <td className="p-1.5 align-middle text-center font-mono text-[11px]">
                            {draft.date}
                          </td>

                          {/* Customer Name */}
                          <td className="p-1.5 align-middle font-bold text-slate-800">
                            <div className="flex items-center gap-1.5">
                              <span>{draft.customerName}</span>
                              {draft.customerId && (
                                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="عميل مطابق مسجل" />
                              )}
                            </div>
                          </td>

                          {/* Sub-Customer */}
                          <td className="p-1.5 align-middle text-slate-600 font-medium">
                            {draft.subCustomerName || '-'}
                          </td>

                          {/* Items summary */}
                          <td className="p-1.5 align-middle">
                            <div className="space-y-0.5">
                              {draft.items.slice(0, 2).map((it, iIdx) => (
                                <div key={it.id || iIdx} className="flex items-center gap-1.5 text-[11px] text-slate-700">
                                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block"></span>
                                  <strong className="text-slate-800">{it.itemName}</strong>
                                  <span className="text-slate-500 font-mono">({it.quantity} × {it.unitPrice})</span>
                                </div>
                              ))}
                              {draft.items.length > 2 && (
                                <span className="text-[10px] text-blue-600 font-bold block">
                                  + {draft.items.length - 2} أصناف أخرى...
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Items count */}
                          <td className="p-1.5 align-middle text-center font-mono font-bold text-slate-600">
                            {draft.items.length}
                          </td>

                          {/* Total Amount */}
                          <td className="p-1.5 align-middle text-center bg-slate-50 font-mono font-black text-slate-900">
                            ₪ {draft.totalAmount.toFixed(2)}
                          </td>

                          {/* Payment Method */}
                          <td className="p-1.5 align-middle text-center">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                draft.paymentMethod === 'credit'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : draft.paymentMethod === 'bank_transfer'
                                  ? 'bg-blue-100 text-blue-800 border border-blue-200'
                                  : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                              }`}
                            >
                              {draft.paymentMethod === 'credit'
                                ? 'آجل'
                                : draft.paymentMethod === 'bank_transfer'
                                ? 'بنكي'
                                : 'نقدي'}
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="p-1.5 align-middle text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* Accordion Expand / Collapse Toggle Button */}
                              <button
                                type="button"
                                onClick={() => toggleDraftCollapse(draft.id)}
                                className={`p-1.5 rounded-md shadow-2xs transition cursor-pointer select-none flex items-center justify-center ${
                                  collapsedDraftIds[draft.id]
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200'
                                    : 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200'
                                }`}
                                title={collapsedDraftIds[draft.id] ? 'توسيع التفاصيل والأصناف' : 'ضب المسودة'}
                              >
                                {collapsedDraftIds[draft.id] ? (
                                  <ChevronDown className="w-4 h-4 text-amber-800 font-bold" />
                                ) : (
                                  <ChevronUp className="w-4 h-4 text-slate-700 font-bold" />
                                )}
                              </button>

                              {/* Open Dedicated Full Invoice Screen Button */}
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveDraftIndex(idx);
                                  setViewMode('dedicated_invoice');
                                }}
                                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-[11px] font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
                                title="فتح الشاشة المخصصة وتعديل التاريخ والعميل والدفع واعتماد الفاتورة"
                              >
                                <Eye className="w-3 h-3" />
                                <span>مراجعة وتعديل</span>
                              </button>

                              {/* Quick Add Item Button */}
                              <button
                                type="button"
                                onClick={() => handleAddItemToDraft(draft.id)}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 border border-emerald-200 rounded-md transition cursor-pointer"
                                title="إضافة بند آخر لنفس العميل مباشرة"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>

                              {/* Quick Approve Button */}
                              <button
                                type="button"
                                onClick={() => handleApproveDraft(draft, false)}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[11px] font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer"
                                title="اعتماد وحفظ مباشر"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>اعتماد</span>
                              </button>

                              {/* Delete Draft Button */}
                              <button
                                type="button"
                                onClick={() => setDraftInvoices(prev => prev.filter(d => d.id !== draft.id))}
                                className="p-1 text-rose-500 hover:bg-rose-50 hover:text-rose-700 rounded-md transition cursor-pointer"
                                title="حذف المسودة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Overview Table Footer */}
            <div className="px-5 py-3 bg-white border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
              <div className="text-xs text-slate-500 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span>
                <span>
                  اضغط على زر <strong>[مراجعة وتعديل]</strong> لفتح جدول الكاشير والمقارنة الفورية مع سطر الإكسل الأصلي واعتماد الفاتورة
                </span>
              </div>

              <div className="flex items-center gap-2">
                {selectedDrafts.length > 0 && (
                  <button
                    type="button"
                    onClick={handleApproveSelected}
                    className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>اعتماد وحفظ {selectedDrafts.length} فاتورة محددة</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Line Item Attachments Modal */}
        {activeItemForAttachments && (
          <LineAttachmentsModal
            isOpen={Boolean(activeItemForAttachments)}
            onClose={() => setActiveItemForAttachments(null)}
            itemName={activeItemForAttachments.itemName || 'بند الفاتورة'}
            attachments={activeItemForAttachments.attachments || []}
            onSaveAttachments={(newAttachments) => {
              handleUpdateItem(activeItemForAttachments.draftId, activeItemForAttachments.itemId, {
                attachments: newAttachments
              });
              setActiveItemForAttachments(null);
            }}
          />
        )}
      </div>
    </div>
  );
};
