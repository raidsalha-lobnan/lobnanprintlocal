import React, { useState, useMemo, useEffect } from 'react';
import { 
  X,
  Printer, 
  Plus, 
  Trash2, 
  Search, 
  FileText, 
  Check, 
  Paintbrush, 
  Scissors, 
  Factory, 
  Clock, 
  CheckCircle2, 
  Tag, 
  Settings2, 
  Flame, 
  ChevronDown,
  ArrowRight,
  RotateCcw,
  RefreshCw,
  Paperclip,
  Lock,
  Truck
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { PrintJobOrder, PrintOrderStatus, InvoiceItem, LineAttachment } from '../types';
import { isSquareMeterUnit } from '../utils/unitsOfMeasure';
import { matchKeyboardShortcut } from '../utils/keyboardShortcuts';
import { posSound } from '../utils/audio';
import { LineAttachmentsModal } from './pos/LineAttachmentsModal';
import { QuickAddPartyModal } from './pos/QuickAddPartyModal';

interface NewPrintOrderViewProps {
  onBack?: () => void;
  onOrderCreated?: (orderId: string) => void;
}

export interface PrintOrderLineItem {
  id: string;
  itemId?: string;
  itemName: string;
  notes: string;
  length?: number;
  width?: number;
  count: number;
  unit: string;
  calculatedQuantity: number;
  attachments?: LineAttachment[];
}

export type PrintOrderColumnKey =
  | 'index'
  | 'itemName'
  | 'notes'
  | 'attachments'
  | 'length'
  | 'width'
  | 'count'
  | 'quantity'
  | 'delete';

export const DEFAULT_PRINT_ORDER_COLUMN_WIDTHS: Record<PrintOrderColumnKey, number> = {
  index: 42,
  itemName: 210,
  notes: 220,
  attachments: 85,
  length: 70,
  width: 70,
  count: 65,
  quantity: 105,
  delete: 45,
};

export const MIN_PRINT_ORDER_COLUMN_WIDTHS: Record<PrintOrderColumnKey, number> = {
  index: 30,
  itemName: 110,
  notes: 90,
  attachments: 55,
  length: 45,
  width: 45,
  count: 45,
  quantity: 65,
  delete: 35,
};

const PRINT_ORDER_COLUMN_WIDTHS_STORAGE_KEY = 'print_order_column_widths_v2';

export function getPrintOrderColumnWidthsStorageKey(userId?: string): string {
  return PRINT_ORDER_COLUMN_WIDTHS_STORAGE_KEY;
}

export function loadPrintOrderColumnWidths(userId?: string): Record<PrintOrderColumnKey, number> {
  try {
    const raw = localStorage.getItem(PRINT_ORDER_COLUMN_WIDTHS_STORAGE_KEY) ||
      (userId ? localStorage.getItem(`${PRINT_ORDER_COLUMN_WIDTHS_STORAGE_KEY}_user_${userId.trim()}`) : null) ||
      localStorage.getItem(`${PRINT_ORDER_COLUMN_WIDTHS_STORAGE_KEY}_user_usr-1`) ||
      localStorage.getItem(`${PRINT_ORDER_COLUMN_WIDTHS_STORAGE_KEY}_user_user-1789170883526`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        return {
          ...DEFAULT_PRINT_ORDER_COLUMN_WIDTHS,
          ...parsed,
        };
      }
    }
  } catch (err) {
    console.error('Failed to load print order column widths', err);
  }
  return { ...DEFAULT_PRINT_ORDER_COLUMN_WIDTHS };
}

export function savePrintOrderColumnWidths(widths: Record<PrintOrderColumnKey, number>, userId?: string): void {
  try {
    if (!widths || typeof widths !== 'object') return;
    const jsonStr = JSON.stringify(widths);
    localStorage.setItem(PRINT_ORDER_COLUMN_WIDTHS_STORAGE_KEY, jsonStr);
    localStorage.setItem(`${PRINT_ORDER_COLUMN_WIDTHS_STORAGE_KEY}_user_usr-1`, jsonStr);
    localStorage.setItem(`${PRINT_ORDER_COLUMN_WIDTHS_STORAGE_KEY}_user_user-1789170883526`, jsonStr);
    if (userId && userId.trim() !== '') {
      localStorage.setItem(`${PRINT_ORDER_COLUMN_WIDTHS_STORAGE_KEY}_user_${userId.trim()}`, jsonStr);
    }
  } catch (err) {
    console.error('Failed to save print order column widths', err);
  }
}

export function resetPrintOrderColumnWidthsToDefault(userId?: string): Record<PrintOrderColumnKey, number> {
  const target = { ...DEFAULT_PRINT_ORDER_COLUMN_WIDTHS };
  savePrintOrderColumnWidths(target, userId);
  return target;
}

export const NewPrintOrderView: React.FC<NewPrintOrderViewProps> = ({
  onBack,
  onOrderCreated
}) => {
  const {
    parties,
    employees,
    inventory,
    invoices,
    printOrders,
    createPrintOrder,
    currentUser,
    setActiveTab
  } = useAccounting();

  // Draft persistence for New Print Order (لضمان بقاء البيانات والإدخالات كاملة عند التحديث أو F5)
  const PRINT_ORDER_DRAFT_KEY = 'print_order_active_draft';

  const savedPrintDraft = useMemo(() => {
    try {
      const raw = localStorage.getItem('print_order_active_draft');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return {} as any;
  }, []);

  // Target entity type: زبون / مورد / موظف
  const [targetType, setTargetType] = useState<'customer' | 'supplier' | 'employee'>(() => {
    return savedPrintDraft.targetType || 'customer';
  });

  // Order Details State
  const [customerName, setCustomerName] = useState<string>(() => savedPrintDraft.customerName || '');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() => savedPrintDraft.selectedCustomerId || '');
  const [subCustomerName, setSubCustomerName] = useState<string>(() => savedPrintDraft.subCustomerName || '');
  const [customerPhone, setCustomerPhone] = useState<string>(() => savedPrintDraft.customerPhone || '');
  const [orderNotes, setOrderNotes] = useState<string>(() => savedPrintDraft.orderNotes || '');
  const [orderStatus, setOrderStatus] = useState<PrintOrderStatus>(() => savedPrintDraft.orderStatus || 'design');
  
  // Dates: تاريخ الاستلام وتاريخ التسليم (تلقائياً تاريخ اليوم للاتنين أو من المسودة)
  const [receiptDate, setReceiptDate] = useState(() => savedPrintDraft.receiptDate || new Date().toISOString().split('T')[0]);
  const [deliveryDate, setDeliveryDate] = useState(() => savedPrintDraft.deliveryDate || new Date().toISOString().split('T')[0]);

  // زر تبادلي يتبدل بالضغط: زبون -> مورد -> موظف -> زبون
  const handleToggleTargetType = () => {
    posSound.click();
    setTargetType(prev => {
      if (prev === 'customer') return 'supplier';
      if (prev === 'supplier') return 'employee';
      return 'customer';
    });
    setSelectedCustomerId('');
    setCustomerName('');
    setCustomerPhone('');
  };

  // Table items state
  const [tableLines, setTableLines] = useState<PrintOrderLineItem[]>(() => {
    if (Array.isArray(savedPrintDraft.tableLines) && savedPrintDraft.tableLines.length > 0) {
      return savedPrintDraft.tableLines;
    }
    return [
      {
        id: 'line-1',
        itemName: '',
        notes: '',
        length: undefined,
        width: undefined,
        count: 1,
        unit: 'قطعة',
        calculatedQuantity: 1
      }
    ];
  });

  // حفظ مسودة أمر الطباعة تلقائياً عند أي تعديل
  useEffect(() => {
    try {
      const hasContent =
        customerName.trim() !== '' ||
        customerPhone.trim() !== '' ||
        orderNotes.trim() !== '' ||
        subCustomerName.trim() !== '' ||
        tableLines.some(l => l.itemName.trim() !== '' || (l.notes && l.notes.trim() !== '') || (l.length && l.length > 0) || (l.width && l.width > 0));

      if (hasContent) {
        localStorage.setItem(PRINT_ORDER_DRAFT_KEY, JSON.stringify({
          targetType,
          customerName,
          selectedCustomerId,
          subCustomerName,
          customerPhone,
          orderNotes,
          orderStatus,
          receiptDate,
          deliveryDate,
          tableLines,
          timestamp: Date.now()
        }));
      } else {
        localStorage.removeItem(PRINT_ORDER_DRAFT_KEY);
      }
    } catch {}
  }, [targetType, customerName, selectedCustomerId, subCustomerName, customerPhone, orderNotes, orderStatus, receiptDate, deliveryDate, tableLines]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        localStorage.setItem(PRINT_ORDER_DRAFT_KEY, JSON.stringify({
          targetType,
          customerName,
          selectedCustomerId,
          subCustomerName,
          customerPhone,
          orderNotes,
          orderStatus,
          receiptDate,
          deliveryDate,
          tableLines,
          timestamp: Date.now()
        }));
      } catch {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [targetType, customerName, selectedCustomerId, subCustomerName, customerPhone, orderNotes, orderStatus, receiptDate, deliveryDate, tableLines]);

  // Customer dropdown & search
  const [customerSearch, setCustomerSearch] = useState('');
  const [isCustomerDropdownOpen, setIsCustomerDropdownOpen] = useState(false);

  // Fast Top 10 Customization state
  const [isCustomizingButtons, setIsCustomizingButtons] = useState(false);
  const [pinnedItemIds, setPinnedItemIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('print_order_pinned_items') || '[]');
    } catch {
      return [];
    }
  });

  // Catalog item search
  const [catalogSearch, setCatalogSearch] = useState('');
  const [showPrintTicket, setShowPrintTicket] = useState(false);
  const [savedOrderData, setSavedOrderData] = useState<PrintJobOrder | null>(null);
  const [activeAttachmentLineId, setActiveAttachmentLineId] = useState<string | null>(null);
  const [isAddPartyModalOpen, setIsAddPartyModalOpen] = useState(false);

  // Column Widths State (التحكم بعرض الأعمدة يدوياً بالماوس كشيت إكسل وشاشة الكاشير)
  const [columnWidths, setColumnWidths] = useState<Record<PrintOrderColumnKey, number>>(() =>
    loadPrintOrderColumnWidths(currentUser?.id)
  );
  const [activeResizingCol, setActiveResizingCol] = useState<PrintOrderColumnKey | null>(null);
  const [resizingGuideX, setResizingGuideX] = useState<number | null>(null);

  // Re-sync column widths if user switches
  useEffect(() => {
    if (currentUser?.id) {
      setColumnWidths(loadPrintOrderColumnWidths(currentUser.id));
    }
  }, [currentUser?.id]);

  // Column Resizing Drag Handler (RTL aware - متوافق مع اتجاه الجدول تماماً مثل الكاشير)
  const handleResizeMouseDown = (colKey: PrintOrderColumnKey, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = columnWidths[colKey] || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS[colKey];
    const minWidth = MIN_PRINT_ORDER_COLUMN_WIDTHS[colKey] || 30;

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
        savePrintOrderColumnWidths(updated, currentUser?.id);
        return updated;
      });
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleResetSingleColumn = (colKey: PrintOrderColumnKey, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    setColumnWidths(prev => {
      const updated = { ...prev, [colKey]: DEFAULT_PRINT_ORDER_COLUMN_WIDTHS[colKey] };
      savePrintOrderColumnWidths(updated, currentUser?.id);
      return updated;
    });
  };

  const handleResetAllColumns = () => {
    const defaultWidths = resetPrintOrderColumnWidthsToDefault(currentUser?.id);
    setColumnWidths(defaultWidths);
  };

  const totalVisibleColsWidth = useMemo(() => {
    return (
      (columnWidths.index || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.index) +
      (columnWidths.itemName || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.itemName) +
      (columnWidths.notes || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.notes) +
      (columnWidths.attachments || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.attachments) +
      (columnWidths.length || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.length) +
      (columnWidths.width || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.width) +
      (columnWidths.count || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.count) +
      (columnWidths.quantity || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.quantity) +
      (columnWidths.delete || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.delete)
    );
  }, [columnWidths]);

  const renderResizeHandle = (colKey: PrintOrderColumnKey) => (
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
            ? 'bg-blue-400'
            : 'bg-transparent group-hover/resizer:bg-blue-400'
        }`}
      />
    </div>
  );

  // Suggested next order number
  const nextOrderNumber = useMemo(() => {
    const year = new Date().getFullYear();
    const count = (printOrders?.length || 0) + 1;
    return `JOB-${year}-${String(count).padStart(4, '0')}`;
  }, [printOrders]);

  // Registered Customers List Only (الزبائن)
  const registeredCustomers = useMemo(() => {
    return parties.filter(p => p.type === 'customer' || p.type === 'both');
  }, [parties]);

  // Registered Suppliers List (الموردين)
  const registeredSuppliers = useMemo(() => {
    return parties.filter(p => p.type === 'supplier' || p.type === 'both');
  }, [parties]);

  // Options list based on targetType (زبون - مورد - موظف)
  const targetOptions = useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    if (targetType === 'employee') {
      const emps = employees || [];
      if (!q) return emps.slice(0, 25);
      return emps.filter(e => 
        e.name?.toLowerCase().includes(q) || 
        e.phone?.toLowerCase().includes(q) ||
        e.jobTitle?.toLowerCase().includes(q) ||
        e.department?.toLowerCase().includes(q)
      ).slice(0, 25);
    }
    if (targetType === 'supplier') {
      const supps = registeredSuppliers;
      if (!q) return supps.slice(0, 25);
      return supps.filter(p => 
        p.name?.toLowerCase().includes(q) || 
        p.phone?.toLowerCase().includes(q) ||
        p.code?.toLowerCase().includes(q)
      ).slice(0, 25);
    }
    // 'customer'
    const custs = registeredCustomers;
    if (!q) return custs.slice(0, 25);
    return custs.filter(p => 
      p.name?.toLowerCase().includes(q) || 
      p.phone?.toLowerCase().includes(q) ||
      p.code?.toLowerCase().includes(q)
    ).slice(0, 25);
  }, [targetType, employees, registeredSuppliers, registeredCustomers, customerSearch]);

  // =========================================================================
  // خوارزمية ذكية لاحتساب أكثر 10 أصناف استخداماً من واقع فواتير وأوامر المطبعة
  // =========================================================================
  const top10MostUsedItems = useMemo(() => {
    if (!inventory || inventory.length === 0) return [];

    const usageFrequency = new Map<string, number>();

    (invoices || []).forEach(inv => {
      (inv.items || []).forEach(it => {
        const idKey = it.itemId;
        const nameKey = it.itemName?.trim();
        if (idKey) {
          usageFrequency.set(idKey, (usageFrequency.get(idKey) || 0) + (it.count || it.quantity || 1));
        }
        if (nameKey) {
          usageFrequency.set(nameKey, (usageFrequency.get(nameKey) || 0) + (it.count || it.quantity || 1));
        }
      });
    });

    (printOrders || []).forEach(po => {
      (po.items || []).forEach(it => {
        const idKey = it.itemId;
        const nameKey = it.itemName?.trim();
        if (idKey) {
          usageFrequency.set(idKey, (usageFrequency.get(idKey) || 0) + (it.count || it.quantity || 1));
        }
        if (nameKey) {
          usageFrequency.set(nameKey, (usageFrequency.get(nameKey) || 0) + (it.count || it.quantity || 1));
        }
      });
    });

    const sorted = [...inventory].sort((a, b) => {
      const aPinned = pinnedItemIds.includes(a.id);
      const bPinned = pinnedItemIds.includes(b.id);
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;

      const aScore = (usageFrequency.get(a.id) || 0) + (usageFrequency.get(a.name.trim()) || 0) + (a.isFavorite ? 30 : 0);
      const bScore = (usageFrequency.get(b.id) || 0) + (usageFrequency.get(b.name.trim()) || 0) + (b.isFavorite ? 30 : 0);
      return bScore - aScore;
    });

    return sorted.slice(0, 10);
  }, [inventory, invoices, printOrders, pinnedItemIds]);

  // Toggle pinning an item to top 10
  const togglePinItem = (itemId: string) => {
    setPinnedItemIds(prev => {
      const next = prev.includes(itemId) ? prev.filter(id => id !== itemId) : [...prev, itemId].slice(0, 10);
      localStorage.setItem('print_order_pinned_items', JSON.stringify(next));
      return next;
    });
    posSound.click();
  };

  // Add Item to Table from Top 10 or Catalog
  const handleAddItemToTable = (item: { id: string; name: string; unit?: string; notes?: string; unitCalculationType?: string }) => {
    posSound.click();
    setTableLines(prev => {
      const isArea = isSquareMeterUnit(item.unit, item.unitCalculationType) || item.unit === 'م²' || item.name.includes('بنر') || item.name.includes('فليكس') || item.name.includes('فينيل');
      if (prev.length === 1 && !prev[0].itemName.trim()) {
        return [{
          id: prev[0].id,
          itemId: item.id,
          itemName: item.name,
          notes: item.notes || '',
          length: isArea ? 1 : 1,
          width: isArea ? 1 : 1,
          count: 1,
          unit: item.unit || (isArea ? 'م²' : 'قطعة'),
          calculatedQuantity: 1
        }];
      }

      return [
        ...prev,
        {
          id: 'line-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          itemId: item.id,
          itemName: item.name,
          notes: item.notes || '',
          length: isArea ? 1 : 1,
          width: isArea ? 1 : 1,
          count: 1,
          unit: item.unit || (isArea ? 'م²' : 'قطعة'),
          calculatedQuantity: 1
        }
      ];
    });
  };

  // Add delivery service line
  const handleAddDeliveryServiceLine = () => {
    posSound.click();
    const deliveryService = inventory.find(
      i => i.id === 'srv-delivery' || i.name.includes('خدمة توصيل') || i.name.includes('توصيل')
    );
    setTableLines(prev => {
      const newLine: PrintOrderLineItem = {
        id: 'line-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        itemId: deliveryService?.id || 'srv-delivery',
        itemName: deliveryService ? deliveryService.name : 'خدمة توصيل',
        notes: 'خدمة توصيل طلبات',
        length: 1,
        width: 1,
        count: 1,
        unit: 'خدمة',
        calculatedQuantity: 1
      };
      if (prev.length === 1 && !prev[0].itemName.trim() && !prev[0].notes.trim()) {
        return [newLine];
      }
      return [...prev, newLine];
    });
  };

  // Add blank row
  const handleAddBlankLine = () => {
    posSound.click();
    setTableLines(prev => [
      ...prev,
      {
        id: 'line-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        itemName: '',
        notes: '',
        length: 1,
        width: 1,
        count: 1,
        unit: 'قطعة',
        calculatedQuantity: 1
      }
    ]);
  };

  // Update line field
  const handleUpdateLine = (id: string, field: keyof PrintOrderLineItem, val: any) => {
    setTableLines(prev => prev.map(line => {
      if (line.id !== id) return line;

      const updated = { ...line, [field]: val };
      const isDim = isSquareMeterUnit(updated.unit) || updated.unit === 'م²';

      if (!isDim) {
        updated.length = 1;
        updated.width = 1;
        const c = typeof updated.count === 'number' ? updated.count : parseInt(updated.count as any, 10) || 1;
        updated.count = c;
        updated.calculatedQuantity = c;
      } else {
        const l = typeof updated.length === 'number' ? updated.length : parseFloat(updated.length as any) || 0;
        const w = typeof updated.width === 'number' ? updated.width : parseFloat(updated.width as any) || 0;
        const c = typeof updated.count === 'number' ? updated.count : parseInt(updated.count as any, 10) || 1;

        if (l > 0 && w > 0) {
          const totalArea = Number((l * w * (c || 1)).toFixed(2));
          updated.calculatedQuantity = totalArea;
        } else {
          updated.calculatedQuantity = c || 1;
        }
      }

      return updated;
    }));
  };

  // Remove line
  const handleRemoveLine = (id: string) => {
    posSound.click();
    setTableLines(prev => {
      if (prev.length <= 1) {
        return [{
          id: 'line-' + Date.now(),
          itemName: '',
          notes: '',
          length: undefined,
          width: undefined,
          count: 1,
          unit: 'قطعة',
          calculatedQuantity: 1
        }];
      }
      return prev.filter(l => l.id !== id);
    });
  };

  // Totals calculations
  const totalItemsCount = useMemo(() => {
    return tableLines.filter(l => l.itemName.trim()).length;
  }, [tableLines]);

  const totalPiecesCount = useMemo(() => {
    return tableLines.reduce((acc, l) => acc + (Number(l.count) || 0), 0);
  }, [tableLines]);

  const totalAreaM2 = useMemo(() => {
    return tableLines.reduce((acc, l) => {
      if (l.length && l.width) {
        return acc + (Number(l.length) * Number(l.width) * (Number(l.count) || 1));
      }
      return acc;
    }, 0);
  }, [tableLines]);

  // Navigate back to Print Orders View
  const handleNavigateBack = () => {
    if (onBack) {
      onBack();
    } else {
      setActiveTab('print_orders');
    }
  };

  // Save the Print Order (Without any Cashier / Accounting / Inventory effect!)
  const handleSaveOrder = (andPrint: boolean = false) => {
    const validLines = tableLines.filter(l => l.itemName.trim());
    if (validLines.length === 0) {
      posSound.error();
      alert('يرجى إضافة صنف أو بند واحد على الأقل لأمر الطباعة!');
      return;
    }

    if (!customerName.trim()) {
      posSound.error();
      const entityLabel = targetType === 'employee' ? 'الموظف' : targetType === 'supplier' ? 'المورد' : 'الزبون';
      alert(`يرجى تحديد أو إدخال ${entityLabel}!`);
      return;
    }

    // Map items to InvoiceItem shape with attachments
    const mappedItems: InvoiceItem[] = validLines.map(l => {
      const lVal = Number(l.length) || 0;
      const wVal = Number(l.width) || 0;
      const cVal = Number(l.count) || 1;
      const dimStr = lVal > 0 && wVal > 0 ? `${lVal} × ${wVal} ${l.unit === 'م²' ? 'متر' : 'سم'}` : undefined;

      return {
        itemId: l.itemId || ('item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5)),
        itemName: l.itemName.trim(),
        notes: l.notes.trim() || undefined,
        description: l.notes.trim() || undefined,
        length: lVal > 0 ? lVal : undefined,
        width: wVal > 0 ? wVal : undefined,
        count: cVal,
        quantity: l.calculatedQuantity || cVal,
        unit: l.unit || (dimStr ? 'م²' : 'قطعة'),
        dimensions: dimStr,
        unitPrice: 0,
        discount: 0,
        tax: 0,
        total: 0,
        attachments: l.attachments && l.attachments.length > 0 ? l.attachments : undefined
      };
    });

    // Create the PrintJobOrder with ZERO financial values:
    const createdOrderId = createPrintOrder({
      customerId: selectedCustomerId || (targetType === 'employee' ? 'emp-selected' : targetType === 'supplier' ? 'supp-selected' : 'cust-registered'),
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      subCustomerName: subCustomerName.trim() || undefined,
      title: validLines[0]?.itemName ? `أمر تشغيل: ${validLines[0].itemName}${validLines.length > 1 ? ` (+${validLines.length - 1} بنود)` : ''}` : 'أمر تشغيل ورشة',
      serviceType: 'custom_print',
      paperType: '',
      dimensions: validLines[0]?.length && validLines[0]?.width ? `${validLines[0].length}×${validLines[0].width}` : '',
      quantity: totalPiecesCount || 1,
      colorType: 'ألوان كاملة 4/4',
      finishingOptions: [],
      unitCost: 0,
      totalPrice: 0,       // صفر مالي
      depositPaid: 0,      // صفر عربون
      remainingBalance: 0, // صفر رصيد
      status: orderStatus, // 'design' | 'print_internal' | 'print_external' | 'pending_approval' | 'finishing' | 'ready'
      notes: orderNotes.trim() || undefined,
      deliveryDate: deliveryDate || new Date().toISOString().split('T')[0],
      isExternalPrint: orderStatus === 'print_external',
      items: mappedItems
    });

    try {
      localStorage.removeItem(PRINT_ORDER_DRAFT_KEY);
    } catch {}

    posSound.playSuccessBeep();

    const curYear = new Date().getFullYear();
    const jobPrefix = `JOB-${curYear}-`;
    let maxJobSeq = 0;
    printOrders.forEach(o => {
      if (o.orderNumber && o.orderNumber.startsWith(jobPrefix)) {
        const seq = parseInt(o.orderNumber.substring(jobPrefix.length), 10);
        if (!isNaN(seq) && seq > maxJobSeq) maxJobSeq = seq;
      }
    });
    let nextJobSeq = maxJobSeq + 1;
    let finalOrderNumber = `${jobPrefix}${String(nextJobSeq).padStart(4, '0')}`;
    while (printOrders.some(o => o.orderNumber === finalOrderNumber)) {
      nextJobSeq++;
      finalOrderNumber = `${jobPrefix}${String(nextJobSeq).padStart(4, '0')}`;
    }

    const fullOrderObj: PrintJobOrder = {
      id: createdOrderId,
      orderNumber: finalOrderNumber,
      customerId: selectedCustomerId || 'cust-registered',
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      subCustomerName: subCustomerName.trim() || undefined,
      title: validLines[0]?.itemName || 'أمر تشغيل ورشة',
      serviceType: 'custom_print',
      paperType: '',
      dimensions: '',
      quantity: totalPiecesCount || 1,
      colorType: '',
      finishingOptions: [],
      unitCost: 0,
      totalPrice: 0,
      depositPaid: 0,
      remainingBalance: 0,
      status: orderStatus,
      notes: orderNotes.trim() || undefined,
      createdAt: receiptDate,
      deliveryDate: deliveryDate,
      items: mappedItems
    };

    if (andPrint) {
      setSavedOrderData(fullOrderObj);
      setShowPrintTicket(true);
    } else {
      if (onOrderCreated) {
        onOrderCreated(createdOrderId);
      }
      handleNavigateBack();
    }
  };

  // Keyboard shortcut Ctrl+S and F9 to save
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (matchKeyboardShortcut(e, 'Ctrl+S') || matchKeyboardShortcut(e, 'F9')) {
        e.preventDefault();
        e.stopPropagation();
        handleSaveOrder(false);
      } else if (matchKeyboardShortcut(e, 'Escape') && !showPrintTicket) {
        handleNavigateBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [tableLines, customerName, subCustomerName, orderNotes, orderStatus, showPrintTicket]);

  return (
    <div className="w-full flex-1 flex flex-col min-h-0 h-full bg-slate-100 select-none overflow-hidden" dir="rtl">

      {/* 1. Top Ribbon - Sleek ERP Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 text-white px-3 py-2 flex items-center justify-between gap-3 shrink-0 shadow-sm border-b border-slate-700">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={handleNavigateBack}
            className="flex items-center gap-1 px-2.5 py-1 bg-slate-700/80 hover:bg-slate-600 text-slate-200 hover:text-white rounded-lg text-xs font-bold transition cursor-pointer border border-slate-600"
            title="الرجوع إلى أوامر الطباعة"
          >
            <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
            <span>رجوع</span>
          </button>

          <div className="w-px h-5 bg-slate-700" />

          <div className="flex items-center gap-2">
            <Printer className="w-4 h-4 text-blue-400" />
            <h1 className="text-sm font-black tracking-tight">أمر تشغيل وطباعة جديد</h1>
            <span className="bg-blue-500/20 text-blue-300 border border-blue-400/30 text-[11px] font-mono font-bold px-2 py-0.2 rounded-full">
              تلقائي بعد الحفظ
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleNavigateBack}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-700/60 rounded-lg transition-colors cursor-pointer"
            title="إغلاق والعودة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* 2. Top Controls Ribbon: Row 1 (Party Toggle, Customer/Employee, Sub, Status, Dates, Attachment) + Row 2 (Notes on its own line) */}
      <div className="bg-white border-b border-slate-200 px-3 py-2 shrink-0 shadow-2xs space-y-2">
        {/* Row 1: Party Type Toggle (زبون - مورد - موظف), Target Input, Sub-Customer, Status/Purpose, Dates, Attachment */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          {/* زر تبادلي بالضغط يتبدل: زبون ⇄ مورد ⇄ موظف */}
          <button
            type="button"
            onClick={handleToggleTargetType}
            className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-blue-50 to-indigo-50 hover:from-blue-100 hover:to-indigo-100 border border-blue-400 text-blue-900 rounded-lg text-xs font-black shadow-2xs transition-all cursor-pointer active:scale-95 shrink-0 min-w-[78px] justify-center"
            title="اضغط للتبديل بين: زبون / مورد / موظف"
          >
            <RefreshCw className="w-3.5 h-3.5 text-blue-600 shrink-0" />
            <span>
              {targetType === 'customer' ? 'زبون' : targetType === 'supplier' ? 'مورد' : 'موظف'}
            </span>
          </button>

          {/* Name Picker / Autocomplete (حسب النوع المختار: زبون / مورد / موظف) */}
          <div className="w-52 sm:w-60 shrink-0 relative">
            <input
              type="text"
              value={customerName}
              onChange={e => {
                setCustomerName(e.target.value);
                setCustomerSearch(e.target.value);
                setIsCustomerDropdownOpen(true);
              }}
              onFocus={() => setIsCustomerDropdownOpen(true)}
              placeholder={
                targetType === 'employee'
                  ? 'اختر الموظف...'
                  : targetType === 'supplier'
                  ? 'اختر المورد...'
                  : 'اسم الزبون...'
              }
              className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-500 rounded-lg pr-2.5 pl-7 py-1 text-xs font-bold text-slate-800 transition"
            />
            <button
              type="button"
              onClick={() => setIsCustomerDropdownOpen(prev => !prev)}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 p-0.5 cursor-pointer"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>

            {/* Target Options Dropdown */}
            {isCustomerDropdownOpen && targetOptions.length > 0 && (
              <div className="absolute z-40 top-full mt-1 right-0 left-0 min-w-[260px] bg-white border border-slate-300 rounded-xl shadow-xl max-h-56 overflow-y-auto">
                <div className="p-1.5 border-b border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-semibold bg-slate-50">
                  <span>
                    {targetType === 'employee'
                      ? `قائمة الموظفين (${targetOptions.length}):`
                      : targetType === 'supplier'
                      ? `قائمة الموردين (${targetOptions.length}):`
                      : `قائمة الزبائن (${targetOptions.length}):`}
                  </span>
                  <button 
                    type="button" 
                    onClick={() => setIsCustomerDropdownOpen(false)}
                    className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
                {targetOptions.map((opt: any) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      posSound.click();
                      setSelectedCustomerId(opt.id);
                      setCustomerName(opt.name);
                      setCustomerPhone(opt.phone || '');
                      setIsCustomerDropdownOpen(false);
                    }}
                    className="w-full text-right px-2.5 py-1.5 hover:bg-blue-50 flex items-center justify-between gap-2 border-b border-slate-50 transition cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-xs text-slate-900">{opt.name}</div>
                      <div className="text-[10px] text-slate-400">
                        {targetType === 'employee' 
                          ? `${opt.jobTitle || 'موظف'} ${opt.department ? `• ${opt.department}` : ''}`
                          : (opt.phone || '')}
                      </div>
                    </div>
                    {opt.code && (
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1 py-0.2 rounded font-mono font-bold">
                        {opt.code}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* زر فتح شاشة إضافة عميل / مورد / موظف جديد */}
          <button
            type="button"
            onClick={() => setIsAddPartyModalOpen(true)}
            className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs shrink-0 cursor-pointer transition-colors flex items-center justify-center"
            title={
              targetType === 'customer'
                ? 'فتح شاشة إضافة عميل جديد'
                : targetType === 'supplier'
                ? 'فتح شاشة إضافة مورد جديد'
                : 'فتح شاشة إضافة موظف جديد'
            }
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {/* Sub-Customer (الزبون الفرعي) */}
          <div className="w-36 sm:w-44 shrink-0">
            <input
              type="text"
              value={subCustomerName}
              onChange={e => setSubCustomerName(e.target.value)}
              placeholder="الزبون الفرعي"
              className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-500 rounded-lg px-2.5 py-1 text-xs font-medium text-slate-800 transition"
            />
          </div>

          {/* Purpose/Status (الحالة / المراد من الأمر) */}
          <div className="w-36 shrink-0">
            <select
              value={orderStatus}
              onChange={e => {
                posSound.click();
                setOrderStatus(e.target.value as PrintOrderStatus);
              }}
              className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-500 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 transition cursor-pointer"
            >
              <option value="design">🎨 تصميم</option>
              <option value="print_internal">🖨️ طباعة داخلي</option>
              <option value="print_external">🏭 طباعة خارجي</option>
              <option value="finishing">✂️ تشطيب</option>
              <option value="pending_approval">⏳ بانتظار الاعتماد</option>
              <option value="ready">✅ جاهز للتسليم</option>
            </select>
          </div>

          {/* Receipt Date (الاستلام) - واسع وتلقائي اليوم */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-300 rounded-lg px-2.5 py-1 shrink-0 shadow-2xs">
            <span className="text-xs font-bold text-slate-700 whitespace-nowrap">الاستلام:</span>
            <input
              type="date"
              value={receiptDate}
              onChange={e => setReceiptDate(e.target.value)}
              className="bg-transparent border-0 text-xs font-black text-slate-900 font-mono w-36 sm:w-40 min-w-[135px] focus:outline-hidden cursor-pointer"
            />
          </div>

          {/* Delivery Date (التسليم) - واسع وتلقائي اليوم */}
          <div className="flex items-center gap-1.5 bg-amber-50/70 border border-amber-300 rounded-lg px-2.5 py-1 shrink-0 shadow-2xs">
            <span className="text-xs font-bold text-amber-900 whitespace-nowrap">التسليم:</span>
            <input
              type="date"
              value={deliveryDate}
              onChange={e => setDeliveryDate(e.target.value)}
              className="bg-transparent border-0 text-xs font-black text-amber-950 font-mono w-36 sm:w-40 min-w-[135px] focus:outline-hidden cursor-pointer"
            />
          </div>
        </div>

        {/* Row 2: خانة الملاحظة سطر لحالها */}
        <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 shadow-2xs">
          <FileText className="w-4 h-4 text-blue-600 shrink-0" />
          <span className="text-xs font-bold text-slate-700 shrink-0">الملاحظات:</span>
          <input
            type="text"
            value={orderNotes}
            onChange={e => setOrderNotes(e.target.value)}
            placeholder="اكتب ملاحظات وتوجيهات أمر الطباعة..."
            className="w-full bg-transparent border-0 focus:outline-hidden text-xs sm:text-sm font-medium text-slate-900 placeholder:text-slate-400"
          />
          {orderNotes && (
            <button
              type="button"
              onClick={() => setOrderNotes('')}
              className="text-slate-400 hover:text-rose-600 text-xs font-bold px-1.5 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 3. Main Body - 2 Panes: Table on Left (spacious), Top 10 Favorites on Right (2/3 width) */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row gap-0 overflow-hidden bg-slate-100">
        
        {/* LEFT SECTION: Order Items Table (fills available space) */}
        <div className="flex-1 flex flex-col min-w-0 border-b lg:border-b-0 lg:border-l border-slate-300 overflow-hidden bg-white">
          
          {/* Table Container (حذف سطر بنود الأمر كاملا لبدء الجدول مباشرة) */}
          <div className="flex-1 overflow-y-auto p-3">
            <div className="border border-slate-300 rounded-xl overflow-x-auto shadow-2xs bg-white">
              <table
                className="w-full text-right text-xs border-collapse select-none"
                style={{ minWidth: `${totalVisibleColsWidth}px` }}
              >
                {/* Colgroup defining each column's exact width for Excel-like resizing */}
                <colgroup>
                  <col style={{ width: `${columnWidths.index || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.index}px` }} />
                  <col style={{ width: `${columnWidths.itemName || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.itemName}px` }} />
                  <col style={{ width: `${columnWidths.notes || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.notes}px` }} />
                  <col style={{ width: `${columnWidths.attachments || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.attachments}px` }} />
                  <col style={{ width: `${columnWidths.length || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.length}px` }} />
                  <col style={{ width: `${columnWidths.width || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.width}px` }} />
                  <col style={{ width: `${columnWidths.count || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.count}px` }} />
                  <col style={{ width: `${columnWidths.quantity || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.quantity}px` }} />
                  <col style={{ width: `${columnWidths.delete || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.delete}px` }} />
                  <col />
                </colgroup>
                <thead>
                  <tr className="bg-gradient-to-r from-slate-800 to-slate-900 text-white text-[11px] font-bold sticky top-0 z-10">
                    <th
                      style={{ width: `${columnWidths.index || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.index}px` }}
                      className="relative p-2 text-center border-l border-slate-700 group/th"
                    >
                      <div className="flex items-center justify-center gap-0.5">
                        <span>م</span>
                        <button
                          type="button"
                          onClick={handleResetAllColumns}
                          className="opacity-0 group-hover/th:opacity-100 hover:text-blue-300 transition-opacity p-0.5 rounded cursor-pointer"
                          title="استعادة عرض كافة الأعمدة للافتراضي (نقر مزدوج على أي فاصل لاستعادة عمود مفرد)"
                        >
                          <RotateCcw className="w-2.5 h-2.5 text-slate-300 hover:text-white" />
                        </button>
                      </div>
                      {renderResizeHandle('index')}
                    </th>
                    <th
                      style={{ width: `${columnWidths.itemName || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.itemName}px` }}
                      className="relative p-2 text-right border-l border-slate-700 group/th"
                    >
                      <div className="truncate">الصنف <span className="text-rose-400">*</span></div>
                      {renderResizeHandle('itemName')}
                    </th>
                    <th
                      style={{ width: `${columnWidths.notes || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.notes}px` }}
                      className="relative p-2 text-right border-l border-slate-700 group/th"
                    >
                      <div className="truncate">البيان والمواصفات</div>
                      {renderResizeHandle('notes')}
                    </th>
                    <th
                      style={{ width: `${columnWidths.attachments || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.attachments}px` }}
                      className="relative p-2 text-center border-l border-slate-700 group/th"
                    >
                      <div className="flex items-center justify-center gap-1 truncate" title="مرفقات وتصاميم Google Drive للبند">
                        <Paperclip className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        <span>المرفقات</span>
                      </div>
                      {renderResizeHandle('attachments')}
                    </th>
                    <th
                      style={{ width: `${columnWidths.length || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.length}px` }}
                      className="relative p-2 text-center border-l border-slate-700 group/th"
                    >
                      <div className="truncate">الطول</div>
                      {renderResizeHandle('length')}
                    </th>
                    <th
                      style={{ width: `${columnWidths.width || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.width}px` }}
                      className="relative p-2 text-center border-l border-slate-700 group/th"
                    >
                      <div className="truncate">العرض</div>
                      {renderResizeHandle('width')}
                    </th>
                    <th
                      style={{ width: `${columnWidths.count || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.count}px` }}
                      className="relative p-2 text-center border-l border-slate-700 group/th"
                    >
                      <div className="truncate">العدد</div>
                      {renderResizeHandle('count')}
                    </th>
                    <th
                      style={{ width: `${columnWidths.quantity || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.quantity}px` }}
                      className="relative p-2 text-center border-l border-slate-700 bg-slate-950/80 group/th"
                    >
                      <div className="truncate">الكمية</div>
                      {renderResizeHandle('quantity')}
                    </th>
                    <th
                      style={{ width: `${columnWidths.delete || DEFAULT_PRINT_ORDER_COLUMN_WIDTHS.delete}px` }}
                      className="relative p-2 text-center group/th"
                    >
                      <div className="truncate">حذف</div>
                      {renderResizeHandle('delete')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {tableLines.map((line, idx) => {
                    const hasDim = (Number(line.length) || 0) > 0 && (Number(line.width) || 0) > 0;

                    return (
                      <tr key={line.id} className="hover:bg-blue-50/40 transition-colors">
                        {/* Row Index */}
                        <td className="p-2 text-center font-mono font-bold text-slate-400 text-xs">
                          {idx + 1}
                        </td>

                        {/* Item Name */}
                        <td className="p-2">
                          <input
                            type="text"
                            value={line.itemName}
                            onChange={e => handleUpdateLine(line.id, 'itemName', e.target.value)}
                            placeholder="اسم الصنف أو العمل..."
                            className="w-full font-bold text-slate-900 bg-slate-50 focus:bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-1 text-xs transition"
                          />
                        </td>

                        {/* Item Notes / Specs */}
                        <td className="p-2">
                          <input
                            type="text"
                            value={line.notes}
                            onChange={e => handleUpdateLine(line.id, 'notes', e.target.value)}
                            placeholder="البيان (الخامة، السلوفان، الشاسيه، الحلقات...)"
                            className="w-full text-slate-700 bg-slate-50 focus:bg-white border border-slate-300 focus:border-blue-500 rounded-lg px-2.5 py-1 text-xs transition placeholder:text-slate-400"
                          />
                        </td>

                        {/* Attachments Column */}
                        <td className="p-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => setActiveAttachmentLineId(line.id)}
                            className={`inline-flex items-center justify-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition cursor-pointer active:scale-95 ${
                              (line.attachments && line.attachments.length > 0)
                                ? 'bg-blue-50 text-blue-700 border-blue-300 hover:bg-blue-100 hover:border-blue-400 shadow-2xs'
                                : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100 hover:text-slate-700'
                            }`}
                            title="إرفاق أو إدارة ملفات وتصاميم Google Drive لهذا البند"
                          >
                            <Paperclip className={`w-3.5 h-3.5 ${(line.attachments && line.attachments.length > 0) ? 'text-blue-600' : 'text-slate-400'}`} />
                            {(line.attachments && line.attachments.length > 0) ? (
                              <span className="bg-blue-600 text-white text-[10px] font-mono px-1.5 py-0.2 rounded-full font-black">
                                {line.attachments.length}
                              </span>
                            ) : (
                              <span className="text-[10px]">إرفاق</span>
                            )}
                          </button>
                        </td>

                        {/* Length (الطول) */}
                        <td className="p-2 text-center">
                          {!isSquareMeterUnit(line.unit) && line.unit !== 'م²' ? (
                            <div
                              className="w-full py-1 bg-slate-100 text-slate-500 rounded-lg font-mono text-xs text-center font-bold select-none cursor-not-allowed flex items-center justify-center gap-0.5 border border-slate-200"
                              title="مغلق تلقائياً: الصنف لا يتطلب طولاً وعرضاً (الطول = 1)"
                            >
                              <Lock className="w-3 h-3 text-slate-400" />
                              <span>1</span>
                            </div>
                          ) : (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.length ?? ''}
                              onChange={e => handleUpdateLine(line.id, 'length', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                              placeholder="0"
                              className="w-full text-center font-mono font-bold text-slate-800 bg-slate-50 focus:bg-white border border-slate-300 focus:border-blue-500 rounded-lg py-1 text-xs"
                            />
                          )}
                        </td>

                        {/* Width (العرض) */}
                        <td className="p-2 text-center">
                          {!isSquareMeterUnit(line.unit) && line.unit !== 'م²' ? (
                            <div
                              className="w-full py-1 bg-slate-100 text-slate-500 rounded-lg font-mono text-xs text-center font-bold select-none cursor-not-allowed flex items-center justify-center gap-0.5 border border-slate-200"
                              title="مغلق تلقائياً: الصنف لا يتطلب طولاً وعرضاً (العرض = 1)"
                            >
                              <Lock className="w-3 h-3 text-slate-400" />
                              <span>1</span>
                            </div>
                          ) : (
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={line.width ?? ''}
                              onChange={e => handleUpdateLine(line.id, 'width', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                              placeholder="0"
                              className="w-full text-center font-mono font-bold text-slate-800 bg-slate-50 focus:bg-white border border-slate-300 focus:border-blue-500 rounded-lg py-1 text-xs"
                            />
                          )}
                        </td>

                        {/* Count (العدد) */}
                        <td className="p-2 text-center">
                          <input
                            type="number"
                            step="1"
                            min="1"
                            value={line.count}
                            onChange={e => handleUpdateLine(line.id, 'count', parseInt(e.target.value) || 1)}
                            className="w-full text-center font-mono font-black text-blue-700 bg-blue-50/60 focus:bg-white border border-blue-200 focus:border-blue-500 rounded-lg py-1 text-xs"
                          />
                        </td>

                        {/* Calculated Quantity (الكمية الإجمالية) */}
                        <td className="p-2 text-center bg-slate-50/80">
                          <div className="font-mono font-bold text-slate-900 text-xs">
                            {line.calculatedQuantity}
                            <span className="text-[10px] text-slate-500 mr-1 font-sans">{line.unit}</span>
                          </div>
                          {hasDim && (
                            <div className="text-[9px] text-slate-400 font-mono">
                              ({line.length}×{line.width}×{line.count})
                            </div>
                          )}
                        </td>

                        {/* Remove button */}
                        <td className="p-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveLine(line.id)}
                            className="text-slate-400 hover:text-rose-600 p-1 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                            title="حذف البند"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Quick Add Row button below table */}
            <div className="mt-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleAddDeliveryServiceLine}
                  className="text-xs font-bold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-xl px-3.5 py-1.5 flex items-center gap-1.5 transition cursor-pointer shadow-2xs"
                  title="إضافة خدمة توصيل تلقائياً كبند بأمر العمل"
                >
                  <Truck className="w-4 h-4 text-amber-600" />
                  <span>+ خدمة توصيل</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddBlankLine}
                  className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:bg-blue-50 border border-blue-200 border-dashed rounded-xl px-4 py-1.5 flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة سطر بند جديد</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetAllColumns}
                  className="text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg px-2.5 py-1.5 flex items-center gap-1 transition cursor-pointer"
                  title="استعادة العرض الافتراضي لكافة أعمدة الجدول"
                >
                  <RotateCcw className="w-3 h-3 text-slate-400" />
                  <span>إعادة ضبط عرض الأعمدة</span>
                </button>
              </div>

              <div className="text-xs text-slate-500 font-medium">
                {totalAreaM2 > 0 && (
                  <span className="ml-3">
                    إجمالي المساحات: <strong className="text-slate-900 font-mono font-bold">{totalAreaM2.toFixed(2)} م²</strong>
                  </span>
                )}
                <span>
                  إجمالي القطع: <strong className="text-slate-900 font-mono font-bold">{totalPiecesCount}</strong>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT SECTION: المفضلة فقط أيقونات أصناف صغيرة (مصغر ليكون ثلثي المساحة الحالية: w-56 إلى w-60 فقط) */}
        <div className="w-full lg:w-56 xl:w-60 shrink-0 flex flex-col bg-slate-50 overflow-hidden">
          
          {/* Top 10 Header: Search Input + Customize Button side-by-side (تخصيص الأزرار بجانب خانة البحث) */}
          <div className="p-2.5 bg-white border-b border-slate-200 shrink-0">
            <div className="flex items-center gap-1.5">
              {/* Search Box */}
              <div className="relative flex-1">
                <input
                  type="text"
                  value={catalogSearch}
                  onChange={e => setCatalogSearch(e.target.value)}
                  placeholder="بحث في الأصناف..."
                  className="w-full bg-slate-100 border border-slate-200 focus:bg-white focus:border-blue-500 rounded-lg pr-2.5 pl-6 py-1 text-xs text-slate-800 transition placeholder:text-slate-400"
                />
                {catalogSearch ? (
                  <button
                    type="button"
                    onClick={() => setCatalogSearch('')}
                    className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
                  >
                    ✕
                  </button>
                ) : (
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                )}
              </div>

              {/* زر تخصيص الأزرار بجانب خانة البحث */}
              <button
                type="button"
                onClick={() => setIsCustomizingButtons(prev => !prev)}
                className={`text-[10px] font-bold px-2 py-1 rounded-lg border flex items-center gap-1 transition cursor-pointer shrink-0 ${
                  isCustomizingButtons
                    ? 'bg-amber-100 text-amber-900 border-amber-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
                title="تخصيص وتثبيت الأزرار السريعة من قائمة الأصناف"
              >
                <Settings2 className="w-3.5 h-3.5 text-slate-600" />
                <span>{isCustomizingButtons ? 'تم' : 'تخصيص'}</span>
              </button>
            </div>
          </div>

          {/* Top 10 Buttons Grid (أيقونة أو زر عليه اسم الصنف فقط بشكل مصغر) */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
            {catalogSearch.trim() ? (
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-slate-400">نتائج البحث:</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {inventory
                    .filter(item => item.name.toLowerCase().includes(catalogSearch.toLowerCase()))
                    .slice(0, 16)
                    .map((item, idx) => (
                      <button
                        key={`npo-cat-${item.id || idx}-${idx}`}
                        type="button"
                        onClick={() => handleAddItemToTable(item)}
                        className="p-1.5 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-400 rounded-lg text-right transition-all shadow-2xs flex items-center justify-between gap-1 cursor-pointer active:scale-95 group overflow-hidden"
                        title={item.name}
                      >
                        <span className="font-bold text-[11px] text-slate-800 group-hover:text-blue-700 truncate">
                          {item.name}
                        </span>
                        <Plus className="w-3 h-3 text-blue-500 shrink-0" />
                      </button>
                    ))}
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <div className="grid grid-cols-2 gap-1.5">
                  {top10MostUsedItems.map((item, idx) => {
                    const isPinned = pinnedItemIds.includes(item.id);

                    return (
                      <div key={`npo-top-${item.id || idx}-${idx}`} className="relative group">
                        <button
                          type="button"
                          onClick={() => handleAddItemToTable(item)}
                          className="w-full p-1.5 bg-white hover:bg-blue-50 border border-slate-200 hover:border-blue-400 rounded-lg text-right transition-all shadow-2xs flex items-center gap-1 cursor-pointer active:scale-95 group-hover:ring-1 group-hover:ring-blue-300 overflow-hidden"
                          title={`إضافة ${item.name}`}
                        >
                          <span className="w-4 h-4 rounded bg-slate-100 group-hover:bg-blue-600 group-hover:text-white text-slate-600 font-mono font-bold text-[9px] flex items-center justify-center shrink-0 transition-colors">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-[11px] text-slate-900 group-hover:text-blue-900 truncate leading-tight flex-1">
                            {item.name}
                          </span>
                        </button>

                        {/* Pin Toggle Button in Customizing Mode */}
                        {isCustomizingButtons && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              togglePinItem(item.id);
                            }}
                            className={`absolute top-0.5 left-0.5 p-0.5 rounded text-[9px] font-bold z-10 transition cursor-pointer ${
                              isPinned ? 'bg-amber-500 text-white' : 'bg-slate-200 text-slate-600 hover:bg-amber-200'
                            }`}
                            title={isPinned ? 'إلغاء التثبيت' : 'تثبيت الصنف في القائمة'}
                          >
                            ★
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {top10MostUsedItems.length === 0 && (
                  <div className="text-center py-6 text-slate-400 text-xs">
                    لا توجد أصناف
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4. Bottom Action Footer */}
      <div className="bg-white border-t border-slate-300 px-4 py-2.5 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-lg">
        {/* Summary Badges */}
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div className="bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
            <span className="text-slate-500 ml-1">إجمالي البنود:</span>
            <strong className="text-slate-900 font-mono text-sm">{totalItemsCount}</strong>
          </div>

          <div className="bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-lg">
            <span className="text-blue-700 ml-1">إجمالي القطع:</span>
            <strong className="text-blue-900 font-mono text-sm">{totalPiecesCount}</strong>
          </div>

          {totalAreaM2 > 0 && (
            <div className="bg-purple-50 border border-purple-200 px-2.5 py-1 rounded-lg">
              <span className="text-purple-700 ml-1">إجمالي المساحة:</span>
              <strong className="text-purple-900 font-mono text-sm">{totalAreaM2.toFixed(2)} م²</strong>
            </div>
          )}

          <span className="text-[10px] text-slate-400 hidden xl:inline">
            (اختصار الحفظ السريع: F9)
          </span>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Cancel & Back Button */}
          <button
            type="button"
            onClick={handleNavigateBack}
            className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
          >
            إلغاء وعودة
          </button>

          {/* Clear Form */}
          <button
            type="button"
            onClick={() => {
              if (window.confirm('هل تريد مسح كافة البيانات والبدء بأمر جديد؟')) {
                posSound.click();
                setTableLines([{
                  id: 'line-' + Date.now(),
                  itemName: '',
                  notes: '',
                  count: 1,
                  unit: 'قطعة',
                  calculatedQuantity: 1
                }]);
                setCustomerName('');
                setSelectedCustomerId('');
                setSubCustomerName('');
                setOrderNotes('');
                setReceiptDate(new Date().toISOString().split('T')[0]);
                setDeliveryDate(new Date().toISOString().split('T')[0]);
                setTargetType('customer');
              }
            }}
            className="px-3 py-2 text-xs font-bold text-slate-500 hover:text-rose-600 bg-white border border-slate-200 hover:border-rose-300 rounded-xl transition cursor-pointer"
          >
            مسح النموذج
          </button>

          {/* Save & Print Job Card Button */}
          <button
            type="button"
            onClick={() => handleSaveOrder(true)}
            className="px-4 py-2 text-xs font-bold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded-xl shadow-xs hover:shadow flex items-center gap-1.5 transition cursor-pointer active:scale-95"
            title="حفظ أمر الطباعة وإظهار كارت التشغيل المخصص للورشة للطباعة فورياً"
          >
            <Printer className="w-4 h-4 text-blue-600" />
            <span>حفظ وطباعة كارت الورشة</span>
          </button>

          {/* Primary Save Button (F9) */}
          <button
            type="button"
            onClick={() => handleSaveOrder(false)}
            className="px-5 py-2 text-xs sm:text-sm font-black text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md hover:shadow-lg flex items-center gap-2 transition cursor-pointer active:scale-95"
            title="حفظ وتحويل أمر الطباعة لشاشة أوامر الطباعة والورشة"
          >
            <Check className="w-4 h-4 stroke-[3]" />
            <span>حفظ وتحويل لأوامر الطباعة (F9)</span>
          </button>
        </div>
      </div>

      {/* Line Attachments Modal connected to Google Drive */}
      {activeAttachmentLineId && (
        <LineAttachmentsModal
          isOpen={true}
          onClose={() => setActiveAttachmentLineId(null)}
          itemName={tableLines.find(l => l.id === activeAttachmentLineId)?.itemName || 'بند أمر الطباعة'}
          attachments={tableLines.find(l => l.id === activeAttachmentLineId)?.attachments || []}
          onSaveAttachments={(newAttachments) => {
            setTableLines(prev =>
              prev.map(line =>
                line.id === activeAttachmentLineId
                  ? { ...line, attachments: newAttachments }
                  : line
              )
            );
            setActiveAttachmentLineId(null);
          }}
        />
      )}

      {/* Quick Add Customer / Party Modal */}
      <QuickAddPartyModal
        isOpen={isAddPartyModalOpen}
        onClose={() => setIsAddPartyModalOpen(false)}
        initialType={targetType}
        onSuccess={(created) => {
          setSelectedCustomerId(created.id);
          setCustomerName(created.name);
          setCustomerPhone('');
          setSubCustomerName('');
          posSound.playSuccessBeep();
        }}
      />

      {/* Printable Job Card Preview Modal */}
      {showPrintTicket && savedOrderData && (
        <div className="fixed inset-0 z-60 bg-black/80 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-lg text-slate-900">كارت تشغيل أمر طباعة (ورشة)</h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowPrintTicket(false);
                  handleNavigateBack();
                }}
                className="text-slate-400 hover:text-slate-700 p-1 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {/* Printable Ticket Area */}
            <div id="print-order-ticket" className="p-4 border border-slate-300 rounded-xl bg-slate-50 space-y-3 font-sans">
              <div className="flex items-center justify-between border-b pb-2">
                <div>
                  <h2 className="text-xl font-black text-slate-900">مطبعة النور الحديثة</h2>
                  <p className="text-xs text-slate-500 font-bold">أمر تشغيل وإنتاج ورشة فنية</p>
                </div>
                <div className="text-left font-mono">
                  <div className="text-sm font-black text-blue-700">{savedOrderData.orderNumber}</div>
                  <div className="text-[11px] text-slate-500">{savedOrderData.createdAt}</div>
                </div>
              </div>

              {/* Order & Customer Details */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-white p-2.5 rounded-lg border border-slate-200">
                <div>
                  <span className="text-slate-500 ml-1">اسم العميل:</span>
                  <strong className="text-slate-900">{savedOrderData.customerName}</strong>
                </div>
                <div>
                  <span className="text-slate-500 ml-1">العميل الفرعي:</span>
                  <strong className="text-slate-900">{savedOrderData.subCustomerName || '-'}</strong>
                </div>
                <div>
                  <span className="text-slate-500 ml-1">الغرض / الحالة:</span>
                  <span className="font-bold text-blue-700">
                    {savedOrderData.status === 'design' ? '🎨 تصميم' :
                     savedOrderData.status === 'print_internal' ? '🖨️ طباعة داخلي' :
                     savedOrderData.status === 'print_external' ? '🏭 طباعة خارجي' :
                     savedOrderData.status === 'finishing' ? '✂️ قص وتشطيب' :
                     savedOrderData.status === 'ready' ? '✅ جاهز للتسليم' : savedOrderData.status}
                  </span>
                </div>
                <div className="space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">تاريخ الاستلام:</span>
                    <strong className="text-slate-900 font-mono">{savedOrderData.createdAt}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">تاريخ التسليم:</span>
                    <strong className="text-amber-900 font-mono font-bold">{savedOrderData.deliveryDate}</strong>
                  </div>
                </div>
                {savedOrderData.notes && (
                  <div className="col-span-2 mt-1 pt-1 border-t border-slate-100 text-slate-800">
                    <span className="font-bold text-slate-600 ml-1">ملاحظات الأمر:</span>
                    <span>{savedOrderData.notes}</span>
                  </div>
                )}
              </div>

              {/* Items Table - Clean, no prices */}
              <table className="w-full text-right text-xs border-collapse border border-slate-300 bg-white">
                <thead>
                  <tr className="bg-slate-200 text-slate-800 font-bold">
                    <th className="p-1.5 border border-slate-300 text-center w-8">م</th>
                    <th className="p-1.5 border border-slate-300">الصنف</th>
                    <th className="p-1.5 border border-slate-300">البيان والمواصفات</th>
                    <th className="p-1.5 border border-slate-300 text-center w-14">الطول</th>
                    <th className="p-1.5 border border-slate-300 text-center w-14">العرض</th>
                    <th className="p-1.5 border border-slate-300 text-center w-14">العدد</th>
                    <th className="p-1.5 border border-slate-300 text-center w-20">الكمية</th>
                  </tr>
                </thead>
                <tbody>
                  {(savedOrderData.items || []).map((it, idx) => (
                    <tr key={idx} className="border-b border-slate-200">
                      {/* م - التسلسل */}
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-slate-500 w-8">
                        {idx + 1}
                      </td>

                      {/* الصنف والمرفقات */}
                      <td className="p-1.5 border border-slate-300 font-bold text-slate-900">
                        <div>{it.itemName}</div>
                        {it.attachments && it.attachments.length > 0 && (
                          <div className="text-[10px] text-blue-700 font-bold flex items-center gap-1 mt-0.5">
                            <span>📎 مرفقات ({it.attachments.length} ملف على Google Drive):</span>
                            <span className="text-slate-600 font-normal truncate max-w-xs">
                              {it.attachments.map(a => a.name).join('، ')}
                            </span>
                          </div>
                        )}
                      </td>

                      {/* البيان والمواصفات */}
                      <td className="p-1.5 border border-slate-300 text-slate-700 font-medium">
                        {it.notes || it.description || '-'}
                      </td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono">{it.length || '-'}</td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono">{it.width || '-'}</td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold">{it.count || 1}</td>
                      <td className="p-1.5 border border-slate-300 text-center font-mono font-bold text-blue-700">
                        {it.quantity} {it.unit || ''}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Workshop Signatures */}
              <div className="grid grid-cols-3 gap-3 pt-4 text-center text-xs text-slate-500 border-t border-slate-200">
                <div className="border-t border-dashed border-slate-400 pt-1">
                  توقيع المصمم
                </div>
                <div className="border-t border-dashed border-slate-400 pt-1">
                  فني الطباعة / الورشة
                </div>
                <div className="border-t border-dashed border-slate-400 pt-1">
                  المستلم / التاريخ
                </div>
              </div>
            </div>

            {/* Print & Close Buttons */}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  window.print();
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة الكارت الآن</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPrintTicket(false);
                  handleNavigateBack();
                }}
                className="bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs px-4 py-2 rounded-xl cursor-pointer"
              >
                تم والعودة لقائمة الأوامر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Visual Resizing Guide Line & Tooltip */}
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
    </div>
  );
};
