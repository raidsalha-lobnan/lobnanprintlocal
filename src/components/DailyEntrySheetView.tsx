import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CalendarCheck,
  Calendar,
  Plus,
  Trash2,
  Save,
  Send,
  Printer,
  ChevronRight,
  ChevronLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Wallet,
  Building2,
  Coins,
  Search,
  FileSpreadsheet,
  Check,
  Copy,
  Layers,
  HelpCircle,
  RefreshCw,
  X,
  Link2,
  ArrowDownToLine,
  ExternalLink,
  User,
  Users,
  Filter,
  Globe,
  Lock,
  Unlock,
  Edit3,
  SlidersHorizontal,
  Columns,
  RotateCcw,
  Eraser
} from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { DailyEntryRow, DailyEntrySheet, RowLockInfo, Party, InventoryItem, Treasury } from '../types';
import {
  createEmptyDailyEntryRow,
  convertDailyEntryRowsToDrafts,
  calculateDailyEntryTotals
} from '../services/dailyEntryService';
import { normalizeArabicText } from '../services/liveSheetService';
import { posSound } from '../utils/audio';

const STORAGE_KEY_MULTI_DRAFTS = 'accounting_pending_multi_draft_invoices_v5';

// Default column widths for Daily Entry Table (in pixels)
const DEFAULT_COLUMN_WIDTHS: Record<string, number> = {
  serial: 52,
  entryDate: 110,
  customerName: 195,
  subCustomerName: 155,
  itemName: 205,
  notes: 165,
  requiredAmount: 115,
  paidAmount: 135,
  paymentNotes: 155,
  treasury: 185,
  actions: 85
};

const STORAGE_KEY_COL_WIDTHS = 'accounting_daily_sheet_col_widths_v2';

export const DailyEntrySheetView: React.FC = () => {
  const {
    parties = [],
    inventory = [],
    treasuries = [],
    settings,
    currentUser,
    setActiveTab,
    dailyEntrySheets,
    getDailyEntrySheet,
    saveDailyEntrySheet,
    deleteDailyEntrySheet,
    getAllDailyEntryDates,
    acquireDailyEntryRowLock,
    releaseDailyEntryRowLock,
    forceReleaseDailyEntryRowLock
  } = useAccounting();

  // Current selected business date (YYYY-MM-DD)
  // وضع عرض الكشف: متتابع بدون فلترة باليوم (افتراضي) أو يوم محدد فقط
  const [viewMode, setViewMode] = useState<'continuous' | 'single_day'>('single_day');
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Rows state for the selected day
  const [rows, setRows] = useState<DailyEntryRow[]>([]);
  const [sheetNotes, setSheetNotes] = useState<string>('');
  const [isSaved, setIsSaved] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Manual Column Resizing & Widths Control
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_COL_WIDTHS);
      if (saved) {
        return { ...DEFAULT_COLUMN_WIDTHS, ...JSON.parse(saved) };
      }
    } catch (e) {}
    return DEFAULT_COLUMN_WIDTHS;
  });

  const [showColumnControls, setShowColumnControls] = useState<boolean>(false);
  const [showFilterBar, setShowFilterBar] = useState<boolean>(false);

  const saveColumnWidths = (newWidths: Record<string, number>) => {
    setColumnWidths(newWidths);
    try {
      localStorage.setItem(STORAGE_KEY_COL_WIDTHS, JSON.stringify(newWidths));
    } catch (e) {}
  };

  const handleResetColumnWidths = () => {
    setColumnWidths(DEFAULT_COLUMN_WIDTHS);
    try {
      localStorage.removeItem(STORAGE_KEY_COL_WIDTHS);
    } catch (e) {}
  };

  const applyColumnPreset = (preset: 'compact' | 'standard' | 'wide') => {
    let multiplier = 1;
    if (preset === 'compact') multiplier = 0.85;
    if (preset === 'wide') multiplier = 1.25;

    const adjusted: Record<string, number> = {};
    Object.keys(DEFAULT_COLUMN_WIDTHS).forEach(key => {
      adjusted[key] = Math.round(DEFAULT_COLUMN_WIDTHS[key] * multiplier);
    });
    saveColumnWidths(adjusted);
  };

  // Drag-to-resize column width state
  const [resizingCol, setResizingCol] = useState<{
    key: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const handleStartResize = (e: React.MouseEvent, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingCol({
      key: colKey,
      startX: e.clientX,
      startWidth: columnWidths[colKey] || DEFAULT_COLUMN_WIDTHS[colKey] || 120
    });
  };

  useEffect(() => {
    if (!resizingCol) return;

    const handleMouseMove = (e: MouseEvent) => {
      // In RTL, dragging towards the left edge increases column width
      const diff = resizingCol.startX - e.clientX;
      const newWidth = Math.max(45, Math.min(600, resizingCol.startWidth + diff));
      setColumnWidths(prev => {
        const next = { ...prev, [resizingCol.key]: newWidth };
        try {
          localStorage.setItem(STORAGE_KEY_COL_WIDTHS, JSON.stringify(next));
        } catch (err) {}
        return next;
      });
    };

    const handleMouseUp = () => {
      setResizingCol(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingCol]);

  // Collaborative Row/Cell Locks (Excel Online style)
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const localDirtyRowIds = useRef<Set<string>>(new Set());
  const blurTimeoutRef = useRef<any>(null);
  const prevSelectedDateRef = useRef<string>(selectedDate);

  const currentSheet = dailyEntrySheets[selectedDate];
  const activeLocks: Record<string, RowLockInfo> = currentSheet?.activeLocks || {};

  // Active other collaborators on this sheet
  const activeCollaborators = useMemo(() => {
    const list: { userId: string; userName: string; rowId: string }[] = [];
    const now = Date.now();
    Object.values(activeLocks).forEach((lock: RowLockInfo) => {
      if (lock && lock.userId !== currentUser?.id && (now - lock.lockedAt < 120000)) {
        if (!list.some(c => c.userId === lock.userId)) {
          list.push({ userId: lock.userId, userName: lock.userName, rowId: lock.rowId });
        }
      }
    });
    return list;
  }, [activeLocks, currentUser]);

  const handleRowFocus = (rowId: string, fieldName?: string) => {
    if (blurTimeoutRef.current) {
      clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = null;
    }
    setEditingRowId(rowId);
    localDirtyRowIds.current.add(rowId);
    setTimeout(() => {
      acquireDailyEntryRowLock(selectedDate, rowId, fieldName);
    }, 0);
  };

  const handleRowBlur = (rowId: string) => {
    if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    blurTimeoutRef.current = setTimeout(() => {
      const activeEl = document.activeElement;
      const stillInRow = activeEl?.closest(`[data-row-id="${rowId}"]`);
      if (!stillInRow) {
        if (editingRowId === rowId) {
          setEditingRowId(null);
        }
        // إزالة الحفل وإلغاء قفل السطر دون طمس البيانات المحلية المكتوبة
        releaseDailyEntryRowLock(selectedDate, rowId);
        setIsSaved(false);
      }
    }, 150);
  };

  // Default treasury (usually cash)
  const defaultTreasury = useMemo(() => {
    return treasuries.find(t => t.type === 'cash' || t.name?.includes('نقدي')) || treasuries[0];
  }, [treasuries]);

  // Customer & Sub-Customer Live Filtering Across All Entry Days
  const [filterDate, setFilterDate] = useState<string>(''); // تصفية وفلترة مباشرة على عمود التاريخ
  const [filterCustomer, setFilterCustomer] = useState<string>('');
  const [filterSubCustomer, setFilterSubCustomer] = useState<string>('');
  const [filterScope, setFilterScope] = useState<'selected_day' | 'all_days'>('selected_day');
  const [filterStatus, setFilterStatus] = useState<'all' | 'approved' | 'pending'>('all');
  const [showAllDaysDirectly, setShowAllDaysDirectly] = useState<boolean>(false);

  const isFilterActive = useMemo(() => {
    return filterDate.trim().length > 0 || filterCustomer.trim().length > 0 || filterSubCustomer.trim().length > 0 || showAllDaysDirectly || filterStatus !== 'all';
  }, [filterDate, filterCustomer, filterSubCustomer, showAllDaysDirectly, filterStatus]);

  // Load & Reconcile sheet for selected date without mixing days or wiping local edits
  useEffect(() => {
    const isDateChanged = prevSelectedDateRef.current !== selectedDate;
    prevSelectedDateRef.current = selectedDate;

    const sheet = getDailyEntrySheet(selectedDate);

    // If switching dates, immediately and cleanly load the target date's rows!
    if (isDateChanged) {
      if (sheet && sheet.rows && sheet.rows.length > 0) {
        setRows(sheet.rows);
        setSheetNotes(sheet.notes || '');
      } else {
        const initialRows: DailyEntryRow[] = [
          createEmptyDailyEntryRow(1, defaultTreasury?.id, defaultTreasury?.name, '', undefined, '', undefined, undefined, false, selectedDate),
          createEmptyDailyEntryRow(2, defaultTreasury?.id, defaultTreasury?.name, '', undefined, '', undefined, undefined, false, selectedDate),
          createEmptyDailyEntryRow(3, defaultTreasury?.id, defaultTreasury?.name, '', undefined, '', undefined, undefined, false, selectedDate),
          createEmptyDailyEntryRow(4, defaultTreasury?.id, defaultTreasury?.name, '', undefined, '', undefined, undefined, false, selectedDate),
          createEmptyDailyEntryRow(5, defaultTreasury?.id, defaultTreasury?.name, '', undefined, '', undefined, undefined, false, selectedDate)
        ];
        setRows(initialRows);
        setSheetNotes('');
      }
      setIsSaved(true);
      return;
    }

    // Remote sync reconcile on the SAME date while editing
    if (sheet && sheet.rows && sheet.rows.length > 0) {
      setRows(prevRows => {
        if (prevRows.length === 0) {
          return sheet.rows;
        }

        const activeId = editingRowId;
        const dirtySet = localDirtyRowIds.current;
        const remoteMap = new Map<string, DailyEntryRow>(sheet.rows.map(r => [r.id, r]));

        const merged = prevRows.map(localRow => {
          // حماية فائقة للبيانات المحلية: إذا كان السطر غير محفوظ، أو يملك بيانات أدخلها المستخدم، ينبغي عدم طمسه من الحالة البعيدة
          const localHasData = Boolean(
            (localRow.customerName && localRow.customerName.trim()) ||
            (localRow.itemName && localRow.itemName.trim()) ||
            (localRow.notes && localRow.notes.trim()) ||
            Number(localRow.requiredAmount) > 0 ||
            Number(localRow.paidAmount) > 0
          );

          if (localRow.id === activeId || dirtySet.has(localRow.id) || localRow.isSaved === false || localHasData) {
            return localRow;
          }

          const remoteRow = remoteMap.get(localRow.id);
          if (!remoteRow) return localRow;

          return remoteRow;
        });

        return merged;
      });

      if (sheet.notes !== undefined) {
        setSheetNotes(prev => (prev === '' ? (sheet.notes || '') : prev));
      }
    } else if (rows.length === 0) {
      // Create initial 5 blank rows for quick input with selectedDate
      const initialRows: DailyEntryRow[] = [
        createEmptyDailyEntryRow(1, defaultTreasury?.id, defaultTreasury?.name, '', undefined, '', undefined, undefined, false, selectedDate),
        createEmptyDailyEntryRow(2, defaultTreasury?.id, defaultTreasury?.name, '', undefined, '', undefined, undefined, false, selectedDate),
        createEmptyDailyEntryRow(3, defaultTreasury?.id, defaultTreasury?.name, '', undefined, '', undefined, undefined, false, selectedDate),
        createEmptyDailyEntryRow(4, defaultTreasury?.id, defaultTreasury?.name, '', undefined, '', undefined, undefined, false, selectedDate),
        createEmptyDailyEntryRow(5, defaultTreasury?.id, defaultTreasury?.name, '', undefined, '', undefined, undefined, false, selectedDate)
      ];
      setRows(initialRows);
      setSheetNotes('');
    }
    setIsSaved(true);
  }, [selectedDate, dailyEntrySheets]);

  // Available dates that have recorded entries
  const recordedDates = useMemo(() => {
    return getAllDailyEntryDates();
  }, [getAllDailyEntryDates, isSaved]);

  // لا يتم الحفظ والمزامنة السحابية تلقائياً أثناء الكتابة لمنع أي تداخل
  // المزامنة تتم فقط على البنود المحفوظة عند الضغط على أيقونة (+) أو الحفظ الصريح أو بعد الحذف

  // Helper to find the treasury from the preceding row or closest previous row with a treasury
  const getPrecedingTreasury = (beforeIndex: number, currentRows: DailyEntryRow[]) => {
    for (let i = beforeIndex - 1; i >= 0; i--) {
      if (currentRows[i]?.treasuryId) {
        return {
          id: currentRows[i].treasuryId,
          name: currentRows[i].treasuryName || ''
        };
      }
    }
    return {
      id: defaultTreasury?.id || '',
      name: defaultTreasury?.name || ''
    };
  };

  // التاريخ تلقائياً يدخل تبعاً للبند السابق إلى حين تعديله بتاريخ آخر
  const getPrecedingDate = (beforeIndex: number, currentRows: DailyEntryRow[], fallbackDate: string): string => {
    for (let i = beforeIndex - 1; i >= 0; i--) {
      const rowDate = currentRows[i]?.entryDate;
      if (rowDate && rowDate.trim()) {
        return rowDate;
      }
    }
    return fallbackDate;
  };

  // Handle changing cell values with automatic inheritance and cascading
  const handleUpdateRow = (rowId: string, updates: Partial<DailyEntryRow>) => {
    setIsSaved(false);
    localDirtyRowIds.current.add(rowId);
    setRows(prev => {
      const rowIndex = prev.findIndex(r => r.id === rowId);
      if (rowIndex === -1) return prev;

      // إذا تم تعديل التاريخ: يورث تلقائياً للأسطر التالية الفارغة إلى حين تعديله بتاريخ آخر
      if (updates.entryDate) {
        const newDate = updates.entryDate;
        return prev.map((r, i) => {
          if (r.id === rowId) {
            return { ...r, ...updates };
          }
          if (i > rowIndex) {
            const isRowEmpty = (!r.customerName || !r.customerName.trim()) &&
                               (!r.itemName || !r.itemName.trim()) &&
                               (!r.requiredAmount || Number(r.requiredAmount) === 0) &&
                               (!r.paidAmount || Number(r.paidAmount) === 0);
            if (isRowEmpty) {
              return { ...r, entryDate: newDate };
            }
          }
          return r;
        });
      }

      // 1. If treasury was explicitly changed on this row:
      if (updates.treasuryId) {
        return prev.map((r, i) => {
          if (r.id === rowId) {
            return { ...r, ...updates };
          }
          // Automatically propagate to all subsequent rows that are empty / not yet filled
          if (i > rowIndex) {
            const isRowEmpty = (!r.customerName || !r.customerName.trim()) &&
                               (!r.itemName || !r.itemName.trim()) &&
                               (!r.requiredAmount || Number(r.requiredAmount) === 0) &&
                               (!r.paidAmount || Number(r.paidAmount) === 0);
            if (isRowEmpty) {
              return {
                ...r,
                treasuryId: updates.treasuryId!,
                treasuryName: updates.treasuryName || ''
              };
            }
          }
          return r;
        });
      }

      // 2. If entering data into a row (idx > 0) that still has the default/empty treasury,
      // automatically inherit what was selected in the preceding row!
      if (rowIndex > 0 && !updates.treasuryId) {
        const preceding = getPrecedingTreasury(rowIndex, prev);
        const currentRow = prev[rowIndex];
        if (preceding.id && (!currentRow.treasuryId || currentRow.treasuryId === defaultTreasury?.id)) {
          updates.treasuryId = preceding.id;
          updates.treasuryName = preceding.name;
        }
      }

      return prev.map(r => {
        if (r.id !== rowId) return r;
        return { ...r, ...updates };
      });
    });
  };

  // Helper to recalculate serial numbers keeping the exact same serial for all items of the same customer
  const recalculateSerialNumbers = (currentRows: DailyEntryRow[]): DailyEntryRow[] => {
    let seq = 0;
    let prevRow: DailyEntryRow | null = null;

    return currentRows.map((r, idx) => {
      const isContinuation = idx > 0 && Boolean(r.isAdditionalItem);
      if (!isContinuation) {
        seq += 1;
      }
      const assignedSerial = isContinuation && prevRow ? prevRow.serialNumber : seq;
      const updated: DailyEntryRow = {
        ...r,
        serialNumber: assignedSerial
      };
      prevRow = updated;
      return updated;
    });
  };

  // Helper to find customer group info for a specific row index
  const getRowCustomerGroupInfo = (rowIndex: number, currentRows: DailyEntryRow[]) => {
    const currentRow = currentRows[rowIndex];
    if (!currentRow) {
      return {
        isMultiItem: false,
        isFirst: true,
        isLast: true,
        itemIndexInGroup: 0,
        groupCount: 1,
        totalGroupRequired: 0,
        lastItemOfGroup: currentRow
      };
    }

    const targetSerial = currentRow.serialNumber;
    const groupIndices: number[] = [];
    currentRows.forEach((r, idx) => {
      if (r.serialNumber === targetSerial) {
        groupIndices.push(idx);
      }
    });

    const isMultiItem = groupIndices.length > 1;
    const isFirst = groupIndices.length > 0 && groupIndices[0] === rowIndex;
    const isLast = groupIndices.length > 0 && groupIndices[groupIndices.length - 1] === rowIndex;
    const itemIndexInGroup = groupIndices.indexOf(rowIndex);
    const totalGroupRequired = groupIndices.reduce((sum, i) => sum + Number(currentRows[i]?.requiredAmount || 0), 0);
    const lastItemOfGroup = currentRows[groupIndices[groupIndices.length - 1]];

    return {
      isMultiItem,
      isFirst,
      isLast,
      itemIndexInGroup,
      groupCount: groupIndices.length,
      totalGroupRequired,
      lastItemOfGroup
    };
  };

  // Add sub-item for the SAME customer in the same invoice (زر + في الزاوية السفلية لاسم الصنف)
  // وظيفة هذا الزر: إضافة أكثر من صنف لنفس الزبون، تجميع المبالغ، تجميد آلية الدفع واعتمادها لآخر بند فقط، ونفس الرقم المتسلسل
  const handleAddCustomerSubItem = (rowId: string) => {
    setIsSaved(false);
    setRows(prev => {
      const parentIdx = prev.findIndex(r => r.id === rowId);
      if (parentIdx === -1) return prev;
      const parent = prev[parentIdx];

      const targetSerial = parent.serialNumber;
      // Find the last row in this customer group across state
      let lastGroupIdx = parentIdx;
      for (let i = parentIdx; i < prev.length; i++) {
        if (prev[i].serialNumber === targetSerial) {
          lastGroupIdx = i;
        } else {
          break;
        }
      }

      const lastRow = prev[lastGroupIdx];
      // Create new sub-item row for the same customer
      const newSubRow: DailyEntryRow = {
        id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        serialNumber: targetSerial, // نفس الرقم المتسلسل للزبون دون تجديد التسلسل!
        customerId: parent.customerId,
        customerName: parent.customerName || '',
        subCustomerId: parent.subCustomerId,
        subCustomerName: parent.subCustomerName || '',
        itemName: '',
        itemId: undefined,
        notes: '',
        requiredAmount: 0,
        paidAmount: lastRow.paidAmount || 0, // آلية الدفع تنتقل وتعتمد لآخر بند
        paymentNotes: lastRow.paymentNotes || '', // ملاحظة السداد تنتقل لآخر بند
        treasuryId: lastRow.treasuryId || parent.treasuryId,
        treasuryName: lastRow.treasuryName || parent.treasuryName,
        parentRowId: parent.parentRowId || parent.id,
        isAdditionalItem: true,
        entryDate: parent.entryDate || selectedDate,
        isApproved: false
      };

      // تجمد آلية الدفع وملاحظة السداد في الأسطر السابقة لنفس الزبون لتعتمد فقط في آخر بند
      const updatedPrev = prev.map((r) => {
        if (r.serialNumber === targetSerial) {
          return {
            ...r,
            paidAmount: 0,
            paymentNotes: ''
          };
        }
        return r;
      });

      const nextRows = [
        ...updatedPrev.slice(0, lastGroupIdx + 1),
        newSubRow,
        ...updatedPrev.slice(lastGroupIdx + 1)
      ];

      return recalculateSerialNumbers(nextRows);
    });

    posSound.beep(1100, 0.05);

  };

  // Helper to update customer name across the whole customer group
  const handleUpdateCustomerForGroup = (serialNumber: number, customerName: string, customerId?: string) => {
    setIsSaved(false);
    setRows(prev => prev.map(r => {
      if (r.serialNumber === serialNumber) {
        return {
          ...r,
          customerName,
          customerId
        };
      }
      return r;
    }));
  };

  // Helper to update subCustomer name across the whole customer group
  const handleUpdateSubCustomerForGroup = (serialNumber: number, subCustomerName: string, subCustomerId?: string) => {
    setIsSaved(false);
    setRows(prev => prev.map(r => {
      if (r.serialNumber === serialNumber) {
        return {
          ...r,
          subCustomerName,
          subCustomerId
        };
      }
      return r;
    }));
  };

  // Helper to update treasury across the customer group
  const handleUpdateTreasuryForGroup = (serialNumber: number, treasuryId: string, treasuryName: string) => {
    setIsSaved(false);
    setRows(prev => prev.map(r => {
      if (r.serialNumber === serialNumber) {
        return {
          ...r,
          treasuryId,
          treasuryName
        };
      }
      return r;
    }));
  };

  // Add a new row at the end - automatically inherits what was selected in the row before it
  const handleAddRow = () => {
    setIsSaved(false);
    setRows(prev => {
      const nextSerial = prev.length > 0 ? Math.max(...prev.map(r => r.serialNumber || 0)) + 1 : 1;
      const preceding = getPrecedingTreasury(prev.length, prev);
      const precedingDate = getPrecedingDate(prev.length, prev, selectedDate);
      const newRow = createEmptyDailyEntryRow(
        nextSerial,
        preceding.id,
        preceding.name,
        '',
        undefined,
        '',
        undefined,
        undefined,
        false,
        precedingDate
      );
      return recalculateSerialNumbers([...prev, newRow]);
    });
  };

  // Insert a row directly below an existing row - inherits from the row directly above it
  const handleInsertRowBelow = (index: number) => {
    setIsSaved(false);
    setRows(prev => {
      const current = prev[index];
      const preceding = (current?.treasuryId)
        ? { id: current.treasuryId, name: current.treasuryName || '' }
        : getPrecedingTreasury(index + 1, prev);
      const precedingDate = (current?.entryDate)
        ? current.entryDate
        : getPrecedingDate(index + 1, prev, selectedDate);
      const newRow = createEmptyDailyEntryRow(
        index + 2,
        preceding.id,
        preceding.name,
        '',
        undefined,
        '',
        undefined,
        undefined,
        false,
        precedingDate
      );
      const next = [...prev.slice(0, index + 1), newRow, ...prev.slice(index + 1)];
      return recalculateSerialNumbers(next);
    });
  };

  // Apply a row's treasury to all rows below it with confirmation toast
  const handleApplyTreasuryToSubsequent = (fromIndex: number) => {
    const sourceRow = rows[fromIndex];
    if (!sourceRow || !sourceRow.treasuryId) return;

    setIsSaved(false);
    setRows(prev => prev.map((r, i) => {
      if (i >= fromIndex) {
        return {
          ...r,
          treasuryId: sourceRow.treasuryId,
          treasuryName: sourceRow.treasuryName || ''
        };
      }
      return r;
    }));

    setStatusMessage({
      type: 'info',
      text: `تم تعميم "${sourceRow.treasuryName || 'الصندوق المحدد'}" على كافة الأسطر التالية بنجاح.`
    });
    setTimeout(() => setStatusMessage(null), 2500);
  };


  // وظيفة أيقونة (+) في آخر عمود:
  // 1. حفظ وتثبيت البند الحالي
  // 2. تفعيل المزامنة السحابية فوراً على البنود المحفوظة لدى كافة المستخدمين
  // 3. فتح سطر جديد متتابع للإدخال
  const handleSaveRowAndOpenNew = (index: number) => {
    const targetRow = rows[index];
    if (!targetRow) return;

    // تثبيت هذا البند كمحفوظ رسمياً
    const updatedRows = rows.map((r, i) => {
      if (i === index) {
        return {
          ...r,
          isSaved: true
        };
      }
      return r;
    });

    // إنشاء سطر جديد متتابع
    const nextSerial = updatedRows.length > 0
      ? Math.max(...updatedRows.map(r => r.serialNumber || 0)) + 1
      : 1;
    const precedingTreasury = (targetRow.treasuryId)
      ? { id: targetRow.treasuryId, name: targetRow.treasuryName || '' }
      : getPrecedingTreasury(index + 1, updatedRows);
    const rowDate = targetRow.entryDate || getPrecedingDate(index + 1, updatedRows, selectedDate);

    const newRow = createEmptyDailyEntryRow(
      nextSerial,
      precedingTreasury.id,
      precedingTreasury.name,
      '',
      undefined,
      '',
      undefined,
      undefined,
      false,
      rowDate
    );

    // السطر الجديد لزبون جديد يضاف دائماً في آخر الجدول بدلاً من إقحامه بين السطور
    const nextRowsWithNew = [
      ...updatedRows,
      newRow
    ];

    const recalculated = recalculateSerialNumbers(nextRowsWithNew);
    setRows(recalculated);
    setIsSaved(true);

    // المزامنة السحابية الفورية للبنود المحفوظة
    saveDailyEntrySheet(selectedDate, recalculated, sheetNotes);
    posSound.cash();


  };

  // Deletion Confirmation States
  const [rowToDelete, setRowToDelete] = useState<DailyEntryRow | null>(null);
  const [showDeleteDayConfirm, setShowDeleteDayConfirm] = useState<boolean>(false);
  const [dayDateToDelete, setDayDateToDelete] = useState<string | null>(null);

  // Prompt row deletion with confirmation for filled rows, or immediate delete for empty rows
  const promptDeleteRow = (row: DailyEntryRow) => {
    const hasData = Boolean(
      (row.customerName && row.customerName.trim().length > 0) ||
      (row.itemName && row.itemName.trim().length > 0) ||
      Number(row.requiredAmount) > 0 ||
      Number(row.paidAmount) > 0
    );
    if (!hasData) {
      executeDeleteRow(row.id);
    } else {
      setRowToDelete(row);
    }
  };

  // Execute row deletion permanently
  const executeDeleteRow = (rowId: string) => {
    setIsSaved(false);
    setRows(prev => {
      const filtered = prev.filter(r => r.id !== rowId);
      const res = filtered.length === 0
        ? [createEmptyDailyEntryRow(1, defaultTreasury?.id, defaultTreasury?.name, '', undefined, '', undefined, undefined, false, selectedDate)]
        : recalculateSerialNumbers(filtered);
      // مزامنة فورية للسحابة بعد الحذف
      saveDailyEntrySheet(selectedDate, res, sheetNotes);
      return res;
    });
    setIsSaved(true);
    setRowToDelete(null);
    setStatusMessage({
      type: 'info',
      text: 'تم الحذف النهائي للسطر بنجاح.'
    });
    setTimeout(() => setStatusMessage(null), 2500);
  };

  // Delete entire day sheet permanently from Firestore & localStorage
  const executePermanentDeleteDay = (dateToDelete: string) => {
    deleteDailyEntrySheet(dateToDelete);
    setDayDateToDelete(null);
    setShowDeleteDayConfirm(false);

    if (dateToDelete === selectedDate) {
      const remaining = recordedDates.filter(d => d !== dateToDelete);
      const nextDate = remaining[0] || new Date().toISOString().split('T')[0];
      setSelectedDate(nextDate);

      const initialRows: DailyEntryRow[] = [
        createEmptyDailyEntryRow(1, defaultTreasury?.id, defaultTreasury?.name),
        createEmptyDailyEntryRow(2, defaultTreasury?.id, defaultTreasury?.name),
        createEmptyDailyEntryRow(3, defaultTreasury?.id, defaultTreasury?.name),
        createEmptyDailyEntryRow(4, defaultTreasury?.id, defaultTreasury?.name),
        createEmptyDailyEntryRow(5, defaultTreasury?.id, defaultTreasury?.name)
      ];
      setRows(initialRows);
      setSheetNotes('');
    }

    setStatusMessage({
      type: 'success',
      text: `تم الحذف النهائي لكشف يوم ${dateToDelete} بنجاح من السحابة والجهاز.`
    });
    setTimeout(() => setStatusMessage(null), 3000);
  };


  // تفريغ ومسح الكلام والبيانات في السطر مع الحفاظ على السطر فارغاً
  const handleClearRowData = (rowId: string) => {
    setIsSaved(false);
    setRows(prev => {
      const updated = prev.map(r => {
        if (r.id === rowId) {
          return {
            ...r,
            customerName: "",
            customerId: undefined,
            subCustomerName: "",
            itemName: "",
            itemId: undefined,
            notes: "",
            requiredAmount: 0,
            paidAmount: 0,
            isApproved: false,
            approvedInvoiceNumber: undefined,
            approvedAt: undefined
          };
        }
        return r;
      });
      // مزامنة فورية للسحابة بعد تفريغ السطر
      saveDailyEntrySheet(selectedDate, updated, sheetNotes);
      return updated;
    });
    setIsSaved(true);
    setRowToDelete(null);
    setStatusMessage({
      type: "info",
      text: "تم مسح وتفريغ الكلام والبيانات من السطر بنجاح مع بقاء السطر."
    });
    setTimeout(() => setStatusMessage(null), 2500);
  };

  // تفريغ ومسح كافة الكلام والبيانات لكشف اليوم مع الحفاظ على الأسطر فارغة
  const handleClearDayData = () => {
    setIsSaved(false);
    setRows(prev => {
      const emptyCount = Math.max(5, prev.length);
      return Array.from({ length: emptyCount }, (_, idx) =>
        createEmptyDailyEntryRow(idx + 1, defaultTreasury?.id, defaultTreasury?.name)
      );
    });
    setSheetNotes("");
    setShowDeleteDayConfirm(false);
    setStatusMessage({
      type: "info",
      text: "تم مسح وتفريغ كلام وحركات كشف اليوم بالكامل مع بقاء الأسطر جاهزة للإدخال."
    });
    setTimeout(() => setStatusMessage(null), 3000);
  };

  const executeDeleteDaySheet = () => {
    executePermanentDeleteDay(selectedDate);
  };

  // Clear empty rows
  const handleCleanEmptyRows = () => {
    setRows(prev => {
      const filtered = prev.filter(r => 
        (r.customerName && r.customerName.trim().length > 0) || 
        (r.itemName && r.itemName.trim().length > 0) || 
        Number(r.requiredAmount) > 0 || 
        Number(r.paidAmount) > 0
      );
      const res = filtered.length === 0
        ? [createEmptyDailyEntryRow(1, defaultTreasury?.id, defaultTreasury?.name, '', undefined, '', undefined, undefined, false, selectedDate)]
        : recalculateSerialNumbers(filtered);
      saveDailyEntrySheet(selectedDate, res, sheetNotes);
      return res;
    });
    setIsSaved(true);
  };

  // Save explicitly
  const handleSaveExplicit = () => {
    saveDailyEntrySheet(selectedDate, rows, sheetNotes);
    setIsSaved(true);
    setStatusMessage({
      type: 'success',
      text: `تم حفظ كشف الإدخال اليومي ليوم ${selectedDate} بنجاح!`
    });
    posSound.beep(1200, 0.08);
    setTimeout(() => setStatusMessage(null), 3000);
  };

  // Transfer this day's entries directly to Drafts screen in dedicated invoice review mode
  const handleTransferToDrafts = () => {
    // 1. First save current sheet
    saveDailyEntrySheet(selectedDate, rows, sheetNotes);
    setIsSaved(true);

    // 2. Convert to multi drafts (with multi-item customer grouping)
    const newDrafts = convertDailyEntryRowsToDrafts(
      selectedDate,
      rows,
      parties,
      inventory,
      treasuries
    );

    if (newDrafts.length === 0) {
      setStatusMessage({
        type: 'error',
        text: 'لا توجد حركات صالحة للترحيل في كشف اليوم! يرجى إدخال اسم الزبون أو الصنف والمبلغ المطلوب.'
      });
      setTimeout(() => setStatusMessage(null), 4000);
      return;
    }

    // 3. Load existing drafts from localStorage and prepend
    try {
      const saved = localStorage.getItem(STORAGE_KEY_MULTI_DRAFTS);
      const existingDrafts = saved ? JSON.parse(saved) : [];
      // Combine: Put new drafts first so the user starts with the first new invoice
      const combined = [...newDrafts, ...existingDrafts.filter((d: any) => !newDrafts.some(n => n.id === d.id))];
      localStorage.setItem(STORAGE_KEY_MULTI_DRAFTS, JSON.stringify(combined));

      // Set flags to open directly in dedicated_invoice review mode at index 0
      localStorage.setItem('accounting_drafts_open_dedicated', 'true');
      localStorage.setItem('accounting_drafts_active_index', '0');
    } catch (err) {
      console.error('Failed to merge drafts:', err);
    }

    posSound.cash();
    setStatusMessage({
      type: 'success',
      text: `تم ترحيل ${newDrafts.length} فاتورة بنجاح! جاري الانتقال لشاشة مراجعة واعتماد الفواتير الفردية...`
    });

    // 4. Navigate to excel_drafts
    setTimeout(() => {
      setActiveTab('excel_drafts');
    }, 700);
  };

  // Date Navigation
  const changeDateByDays = (delta: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + delta);
    setSelectedDate(d.toISOString().split('T')[0]);
  };

  // القائمة المعروضة في الجدول بناءً على وضع العرض (كشف متتابع لكافة الأيام أو يوم محدد)
  const displayedRows = useMemo(() => {
    if (viewMode === 'single_day') {
      // عند تحديد يوم محدد: يعرض فقط البنود المسجلة بتاريخ اليوم المحدد
      return rows.filter(r => (r.entryDate || selectedDate) === selectedDate);
    }
    // في وضع كشف متتابع: عرض إدخالات كل الأيام بشكل جدول متتابع مرتب ومفروز حسب التاريخ والمتسلسل
    return [...rows].sort((a, b) => {
      const dateA = a.entryDate || selectedDate;
      const dateB = b.entryDate || selectedDate;
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return (a.serialNumber || 0) - (b.serialNumber || 0);
    });
  }, [rows, viewMode, selectedDate]);

  // Calculate totals dynamically from displayed rows
  const totals = useMemo(() => calculateDailyEntryTotals(displayedRows), [displayedRows]);

  // All flattened rows across all recorded days in the database
  const allRecordedRowsWithDate = useMemo(() => {
    const list: Array<DailyEntryRow & { sheetDate: string }> = [];
    const allDates = Object.keys(dailyEntrySheets).sort().reverse();
    if (!allDates.includes(selectedDate)) {
      allDates.unshift(selectedDate);
    }
    
    allDates.forEach(d => {
      const dateRows = (d === selectedDate && rows.length > 0)
        ? rows
        : (dailyEntrySheets[d]?.rows || []);

      dateRows.forEach(r => {
        const hasContent = Boolean(
          (r.customerName && r.customerName.trim().length > 0) ||
          (r.itemName && r.itemName.trim().length > 0) ||
          Number(r.requiredAmount) > 0 ||
          Number(r.paidAmount) > 0
        );
        if (hasContent) {
          list.push({
            ...r,
            sheetDate: d
          });
        }
      });
    });

    return list;
  }, [dailyEntrySheets, selectedDate, rows]);

  const customerSuggestions = useMemo(() => {
    const set = new Set<string>();
    parties.forEach(p => { if (p.name) set.add(p.name); });
    allRecordedRowsWithDate.forEach(r => { if (r.customerName) set.add(r.customerName); });
    return Array.from(set).sort();
  }, [parties, allRecordedRowsWithDate]);

  const subCustomerSuggestions = useMemo(() => {
    const set = new Set<string>();
    parties.forEach(p => {
      (p.subCustomers || []).forEach(s => { if (s.name) set.add(s.name); });
    });
    allRecordedRowsWithDate.forEach(r => { if (r.subCustomerName) set.add(r.subCustomerName); });
    return Array.from(set).sort();
  }, [parties, allRecordedRowsWithDate]);

  const filteredRows = useMemo(() => {
    if (!isFilterActive) return [];

    const sourceRows = filterScope === 'all_days'
      ? allRecordedRowsWithDate
      : rows.map(r => ({ ...r, sheetDate: selectedDate }));

    return sourceRows.filter(r => {
      if (filterDate.trim()) {
        const rowD = r.entryDate || r.sheetDate;
        if (rowD !== filterDate) return false;
      }
      if (filterCustomer.trim()) {
        const qCust = normalizeArabicText(filterCustomer);
        const rCust = normalizeArabicText(r.customerName || '');
        if (!rCust.includes(qCust)) return false;
      }

      if (filterSubCustomer.trim()) {
        const qSub = normalizeArabicText(filterSubCustomer);
        const rSub = normalizeArabicText(r.subCustomerName || '');
        if (!rSub.includes(qSub)) return false;
      }

      if (filterStatus === 'approved' && !r.isApproved) return false;
      if (filterStatus === 'pending' && r.isApproved) return false;

      return true;
    });
  }, [isFilterActive, filterScope, allRecordedRowsWithDate, rows, selectedDate, filterCustomer, filterSubCustomer, filterStatus]);

  const filteredTotals = useMemo(() => {
    let req = 0;
    let paid = 0;
    let approved = 0;
    filteredRows.forEach(r => {
      req += Number(r.requiredAmount || 0);
      paid += Number(r.paidAmount || 0);
      if (r.isApproved) approved += 1;
    });
    return {
      count: filteredRows.length,
      totalRequired: req,
      totalPaid: paid,
      totalRemaining: Math.max(0, req - paid),
      approvedCount: approved,
      pendingCount: filteredRows.length - approved
    };
  }, [filteredRows]);

  return (
    <div className="flex-1 min-h-0 h-full flex flex-col overflow-hidden font-sans gap-1.5 p-0.5 print:h-auto print:overflow-visible print:p-0" dir="rtl">
      {/* 1. UNIFIED COMPACT HEADER BAR (دمج كافة الأسطر بسطر واحد وحذف الكلام الزائد) */}
      <div className="bg-white border border-slate-300 rounded-2xl p-2.5 sm:px-4 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-2">
          
          {/* Right: Title & Date Selector & View Mode */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
                <CalendarCheck className="w-4 h-4" />
              </div>
              <h1 className="text-sm sm:text-base font-black text-slate-900 tracking-tight">
                كشف إدخال يومي
              </h1>
            </div>

            {/* Mode: Continuous vs Single Day */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => {
                  setViewMode('continuous');
                }}
                className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'continuous'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="عرض إدخالات كل الأيام بشكل جدول متتابع مرتب ومفروز حسب اليوم"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>كشف متتابع (كافة الأيام)</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setViewMode('single_day');
                }}
                className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                  viewMode === 'single_day'
                    ? 'bg-white text-slate-900 shadow-2xs font-black'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="عرض فقط البنود المسجلة بتاريخ اليوم المحدد"
              >
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                <span>يوم محدد ({selectedDate})</span>
              </button>
            </div>

            {/* Date Picker & Navigation */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => changeDateByDays(-1)}
                className="p-1 hover:bg-slate-200 rounded text-slate-700 transition cursor-pointer"
                title="اليوم السابق"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>

              <input
                type="date"
                value={selectedDate}
                onChange={e => {
                  const d = e.target.value;
                  setSelectedDate(d);
                  if (filterDate) {
                    setFilterDate(d);
                  }
                }}
                className="bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-blue-500"
              />

              <button
                type="button"
                onClick={() => changeDateByDays(1)}
                className="p-1 hover:bg-slate-200 rounded text-slate-700 transition cursor-pointer"
                title="اليوم التالي"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>

              <button
                type="button"
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className="px-2 py-0.5 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded text-[11px] font-bold transition cursor-pointer"
              >
                اليوم
              </button>
            </div>

            {/* Live Filter Toggle Button */}
            <button
              type="button"
              onClick={() => setShowFilterBar(prev => !prev)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer border ${
                showFilterBar || isFilterActive
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
              }`}
              title="تصفية واستعلام الحركات"
            >
              <Filter className="w-3.5 h-3.5 text-blue-600" />
              <span>بحث وتصفية</span>
              {isFilterActive && (
                <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse"></span>
              )}
            </button>
          </div>

          {/* Left: Quick Actions & Status */}
          <div className="flex items-center gap-1.5">
            {isSaved ? (
              <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 font-bold">
                <Check className="w-3 h-3 text-emerald-600" />
                <span>محفوظ</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1 font-bold animate-pulse">
                <Clock className="w-3 h-3" />
                <span>غير محفوظ</span>
              </span>
            )}

            <button
              type="button"
              onClick={handleSaveExplicit}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="حفظ بيانات الكشف الآن"
            >
              <Save className="w-3.5 h-3.5" />
              <span>حفظ</span>
            </button>

            <button
              type="button"
              onClick={handleTransferToDrafts}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-black flex items-center gap-1.5 transition cursor-pointer shadow-xs"
              title="ترحيل الحركات كمسودات فواتير"
            >
              <Send className="w-3.5 h-3.5" />
              <span>ترحيل ({totals.pendingCount > 0 ? totals.pendingCount : totals.validRowsCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setShowDeleteDayConfirm(true)}
              disabled={!recordedDates.includes(selectedDate) && rows.every(r => !r.customerName && !r.itemName && Number(r.requiredAmount) === 0)}
              className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="حذف نهائي لكشف هذا اليوم"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            </button>

            <button
              type="button"
              onClick={() => window.print()}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg transition cursor-pointer"
              title="طباعة"
            >
              <Printer className="w-3.5 h-3.5" />
            </button>
          </div>

        </div>

        {/* Collapsible Search & Filter Row */}
        {(showFilterBar || isFilterActive) && (
          <div className="mt-2.5 pt-2.5 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
            {/* 1. Date Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-600">التاريخ:</span>
              <input
                type="date"
                value={filterDate}
                onChange={e => setFilterDate(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-mono font-bold text-slate-800 outline-none focus:border-blue-500"
              />
            </div>

            {/* 2. Customer Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-600">الزبون:</span>
              <input
                type="text"
                list="filter-customers-list"
                value={filterCustomer}
                onChange={e => setFilterCustomer(e.target.value)}
                placeholder="اسم الزبون..."
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 w-36"
              />
              <datalist id="filter-customers-list">
                {customerSuggestions.map((c, i) => (
                  <option key={`cust-sug-${i}`} value={c} />
                ))}
              </datalist>
            </div>

            {/* 3. SubCustomer Filter */}
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold text-slate-600">الفرعي:</span>
              <input
                type="text"
                list="filter-subcustomers-list"
                value={filterSubCustomer}
                onChange={e => setFilterSubCustomer(e.target.value)}
                placeholder="الفرعي..."
                className="bg-slate-50 border border-slate-200 rounded-lg px-2 py-0.5 text-xs font-bold text-slate-800 outline-none focus:border-blue-500 w-28"
              />
              <datalist id="filter-subcustomers-list">
                {subCustomerSuggestions.map((s, i) => (
                  <option key={`sub-sug-${i}`} value={s} />
                ))}
              </datalist>
            </div>

            {/* 4. Scope Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setFilterScope('all_days')}
                className={`px-2 py-0.5 rounded font-bold text-[10.5px] transition cursor-pointer ${
                  filterScope === 'all_days' ? 'bg-blue-600 text-white' : 'text-slate-600'
                }`}
              >
                كافة الأيام
              </button>
              <button
                type="button"
                onClick={() => setFilterScope('selected_day')}
                className={`px-2 py-0.5 rounded font-bold text-[10.5px] transition cursor-pointer ${
                  filterScope === 'selected_day' ? 'bg-blue-600 text-white' : 'text-slate-600'
                }`}
              >
                اليوم المحدد
              </button>
            </div>

            {/* Clear Filter Button */}
            {isFilterActive && (
              <button
                type="button"
                onClick={() => {
                  setFilterDate('');
                  setFilterCustomer('');
                  setFilterSubCustomer('');
                  setShowAllDaysDirectly(false);
                  setFilterStatus('all');
                }}
                className="px-2 py-0.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold flex items-center gap-1 transition cursor-pointer mr-auto"
                title="مسح التصفية"
              >
                <X className="w-3 h-3" />
                <span>مسح التصفية</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* STATUS TOAST MESSAGE */}
      {statusMessage && (
        <div
          className={`p-2.5 rounded-xl border flex items-center justify-between text-xs font-bold animate-in fade-in duration-200 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : statusMessage.type === 'error'
              ? 'bg-rose-50 text-rose-900 border-rose-200'
              : 'bg-blue-50 text-blue-900 border-blue-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{statusMessage.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMessage(null)}
            className="p-1 text-slate-400 hover:text-slate-600 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* PRINT-ONLY HEADER */}
      <div className="hidden print:block text-center pb-3 border-b border-slate-900 mb-3">
        <h2 className="text-xl font-black text-slate-900">{settings.appTitle || 'كشف إدخال يومي'}</h2>
        <div className="text-sm font-bold text-slate-700 mt-1 flex items-center justify-center gap-4">
          <span>كشف حركات يوم العمل: <strong className="font-mono">{selectedDate}</strong></span>
          <span>عدد الحركات: <strong className="font-mono">{totals.validRowsCount}</strong></span>
          <span>إجمالي المطلوب: <strong className="font-mono">{totals.totalRequired.toFixed(2)} ₪</strong></span>
          <span>إجمالي المدفوع: <strong className="font-mono">{totals.totalPaid.toFixed(2)} ₪</strong></span>
        </div>
      </div>

      {/* FILTERED VIEW ACROSS ENTRY DAYS OR STANDARD DAILY SHEET */}
      {isFilterActive ? (
        <div className="space-y-3">
          {/* Summary Stats Strip for Filter Results */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
            <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs">
              <span className="text-[10px] text-slate-400 font-bold block">الحركات المطابقة</span>
              <strong className="text-base font-mono font-black text-slate-800">{filteredTotals.count}</strong>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs">
              <span className="text-[10px] text-slate-400 font-bold block">إجمالي المطلوب</span>
              <strong className="text-base font-mono font-black text-slate-900">{filteredTotals.totalRequired.toFixed(2)} ₪</strong>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs">
              <span className="text-[10px] text-slate-400 font-bold block">إجمالي المدفوع</span>
              <strong className="text-base font-mono font-black text-emerald-700">{filteredTotals.totalPaid.toFixed(2)} ₪</strong>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-2.5 text-center shadow-2xs">
              <span className="text-[10px] text-slate-400 font-bold block">المتبقي (الآجل)</span>
              <strong className="text-base font-mono font-black text-rose-700">{filteredTotals.totalRemaining.toFixed(2)} ₪</strong>
            </div>
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 text-center shadow-2xs">
              <span className="text-[10px] text-emerald-700 font-bold block">المعتمد (بالهايلايت)</span>
              <strong className="text-base font-mono font-black text-emerald-800">{filteredTotals.approvedCount}</strong>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-center shadow-2xs">
              <span className="text-[10px] text-amber-700 font-bold block">المعلق (غير معتمد)</span>
              <strong className="text-base font-mono font-black text-amber-800">{filteredTotals.pendingCount}</strong>
            </div>
          </div>

          {/* The Filtered Table Container */}
          <div className="bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden">
            <div className="bg-slate-800 text-white px-3 py-2 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold">
                  جدول نتائج التصفية عبر {filterScope === 'all_days' ? 'كافة أيام الإدخال' : `يوم ${selectedDate}`}
                </span>
                <span className="text-[10px] bg-slate-700 text-slate-200 px-2 py-0.5 rounded font-mono">
                  {filteredRows.length} حركة مطابقة
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setFilterDate('');
                    setFilterCustomer('');
                    setFilterSubCustomer('');
                    setShowAllDaysDirectly(false);
                    setFilterStatus('all');
                  }}
                  className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 text-white rounded text-xs font-bold transition cursor-pointer"
                >
                  العودة للكشف اليومي العادي
                </button>
              </div>
            </div>

            <div className="overflow-x-auto overflow-y-auto max-h-[70vh] border border-slate-200 rounded-xl relative scrollbar-thin">
              <table className="w-full text-right border-collapse text-xs">
                <thead className="sticky top-0 z-20 shadow-xs">
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-300 select-none text-[11px]">
                    <th className="sticky top-0 z-20 bg-slate-100 py-1.5 px-2 text-center border-l border-slate-200">تاريخ اليوم</th>
                    <th className="sticky top-0 z-20 bg-slate-100 py-1.5 px-1 text-center border-l border-slate-200 w-12">#</th>
                    <th className="sticky top-0 z-20 bg-slate-100 py-1.5 px-2 border-l border-slate-200">الزبون الرئيسي</th>
                    <th className="sticky top-0 z-20 bg-slate-100 py-1.5 px-2 border-l border-slate-200">الزبون الفرعي</th>
                    <th className="sticky top-0 z-20 bg-slate-100 py-1.5 px-2 border-l border-slate-200">الصنف / الخدمة</th>
                    <th className="sticky top-0 z-20 bg-slate-100 py-1.5 px-2 border-l border-slate-200">ملاحظات / بيان</th>
                    <th className="sticky top-0 z-20 bg-slate-100 py-1.5 px-2 text-center border-l border-slate-200 w-24">المطلوب</th>
                    <th className="sticky top-0 z-20 bg-slate-100 py-1.5 px-2 text-center border-l border-slate-200 w-24">المدفوع</th>
                    <th className="sticky top-0 z-20 bg-slate-100 py-1.5 px-2 border-l border-slate-200 min-w-[130px]">ملاحظة السداد</th>
                    <th className="sticky top-0 z-20 bg-slate-100 py-1.5 px-2 text-center border-l border-slate-200">الصندوق / الخزنة</th>
                    <th className="sticky top-0 z-20 bg-slate-100 py-1.5 px-2 text-center border-l border-slate-200">حالة الاعتماد</th>
                    <th className="sticky top-0 z-20 bg-slate-100 py-1.5 px-2 text-center w-24">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-slate-400 text-xs">
                        لا توجد حركات مطابقة للزبون أو الزبون الفرعي المحدد في نطاق التصفية.
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, idx) => {
                      const isApproved = Boolean(row.isApproved);
                      return (
                        <tr
                          key={`flt-${row.sheetDate}-${row.id}-${idx}`}
                          className={`transition-colors ${
                            isApproved
                              ? 'bg-emerald-50/90 border-r-4 border-r-emerald-600 hover:bg-emerald-100/70 shadow-2xs text-slate-900'
                              : row.isAdditionalItem
                              ? 'bg-slate-200/80 hover:bg-slate-200/90 border-r-4 border-r-slate-400 font-medium'
                              : idx % 2 === 0
                              ? 'bg-white'
                              : 'bg-slate-50/50'
                          }`}
                        >
                          {/* 1. تاريخ اليوم */}
                          <td className="py-2 px-2 text-center border-l border-slate-200">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedDate(row.sheetDate);
                                setFilterDate('');
                                setFilterCustomer('');
                                setFilterSubCustomer('');
                                setShowAllDaysDirectly(false);
                              }}
                              className="font-mono font-bold text-xs bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white px-2 py-0.5 rounded-lg border border-blue-200 transition cursor-pointer"
                              title="فتح كشف هذا اليوم للتعديل والإدخال"
                            >
                              {row.sheetDate}
                            </button>
                          </td>

                          {/* 2. رقم مسلسل */}
                          <td className="py-2 px-1 text-center font-mono font-bold text-slate-700 border-l border-slate-200">
                            <div className="flex flex-col items-center justify-center">
                              <span className="font-black text-xs text-slate-800">{row.serialNumber}</span>
                              {isApproved && (
                                <span className="mt-0.5 px-1 py-0.2 rounded text-[8px] font-black bg-emerald-600 text-white flex items-center gap-0.5 shadow-2xs" title={`معتمد بالفاتورة: ${row.approvedInvoiceNumber || ''}`}>
                                  <Check className="w-2 h-2" />
                                  <span>معتمد</span>
                                </span>
                              )}
                            </div>
                          </td>

                          {/* 3. اسم الزبون الرئيسي */}
                          <td className="p-2 border-l border-slate-200 font-bold text-xs text-slate-900">
                            {row.customerName || <span className="text-slate-400 italic font-normal">--</span>}
                          </td>

                          {/* 4. الزبون الفرعي */}
                          <td className="p-2 border-l border-slate-200 text-xs text-slate-700">
                            {row.subCustomerName || <span className="text-slate-400 italic font-normal">--</span>}
                          </td>

                          {/* 5. الصنف */}
                          <td className="p-2 border-l border-slate-200 text-xs font-bold text-slate-800">
                            {row.itemName || <span className="text-slate-400 italic font-normal">--</span>}
                          </td>

                          {/* 6. ملاحظات */}
                          <td className="p-2 border-l border-slate-200 text-xs text-slate-600">
                            {row.notes || <span className="text-slate-400 italic font-normal">--</span>}
                          </td>

                          {/* 7. المطلوب */}
                          <td className="p-2 border-l border-slate-200 text-center font-mono font-bold text-xs text-slate-900">
                            {Number(row.requiredAmount || 0).toFixed(2)} ₪
                          </td>

                          {/* 8. المدفوع */}
                          <td className="p-2 border-l border-slate-200 text-center font-mono font-bold text-xs text-emerald-800">
                            {Number(row.paidAmount || 0).toFixed(2)} ₪
                          </td>

                          {/* 9. ملاحظة السداد */}
                          <td className="p-2 border-l border-slate-200 text-xs text-slate-700">
                            {row.paymentNotes ? (
                              <span className="font-medium text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                {row.paymentNotes}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic font-normal">--</span>
                            )}
                          </td>

                          {/* 10. الصندوق */}
                          <td className="p-2 border-l border-slate-200 text-xs text-slate-700 text-center">
                            {row.treasuryName || <span className="text-slate-400">الصندوق النقدي</span>}
                          </td>

                          {/* 11. حالة الاعتماد */}
                          <td className="p-2 border-l border-slate-200 text-center">
                            {isApproved ? (
                              <div className="flex flex-col items-center gap-0.5">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-600 text-white shadow-2xs">
                                  <Check className="w-2.5 h-2.5" />
                                  <span>معتمد</span>
                                </span>
                                {row.approvedInvoiceNumber && (
                                  <span className="text-[9.5px] font-mono text-emerald-800 font-bold">
                                    فاتورة: {row.approvedInvoiceNumber}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <Clock className="w-2.5 h-2.5 text-amber-600" />
                                <span>معلق (غير معتمد)</span>
                              </span>
                            )}
                          </td>

                          {/* 12. إجراءات */}
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {isApproved && (
                                <button
                                  type="button"
                                  onClick={() => setActiveTab('invoices')}
                                  className="p-1.5 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 rounded-lg transition cursor-pointer"
                                  title={`عرض الفاتورة (${row.approvedInvoiceNumber || ''})`}
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedDate(row.sheetDate);
                                  setFilterCustomer('');
                                  setFilterSubCustomer('');
                                  setShowAllDaysDirectly(false);
                                }}
                                className="px-2 py-1 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-200 rounded-lg text-[10.5px] font-bold flex items-center gap-1 transition cursor-pointer"
                                title="فتح كشف هذا اليوم بالكامل للإدخال والتعديل"
                              >
                                <Calendar className="w-3 h-3" />
                                <span>فتح اليوم</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot className="sticky bottom-0 z-20 shadow-xs">
                  <tr className="bg-slate-100 font-black border-t-2 border-slate-400 text-slate-900 text-xs">
                    <td colSpan={6} className="sticky bottom-0 bg-slate-100 py-1.5 px-3 text-left">
                      إجمالي نتائج التصفية ({filteredRows.length} حركة):
                    </td>
                    <td className="sticky bottom-0 bg-slate-100 py-1.5 px-2 text-center font-mono text-xs font-black text-slate-900">
                      {filteredTotals.totalRequired.toFixed(2)} ₪
                    </td>
                    <td className="sticky bottom-0 bg-slate-100 py-1.5 px-2 text-center font-mono text-xs font-black text-emerald-800">
                      {filteredTotals.totalPaid.toFixed(2)} ₪
                    </td>
                    <td colSpan={4} className="sticky bottom-0 bg-slate-100 py-1.5 px-3 text-slate-600 text-[10.5px]">
                      المتبقي/الآجل: <strong className="font-mono text-rose-700 font-bold">{filteredTotals.totalRemaining.toFixed(2)} ₪</strong>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* 2. THE MAIN DAILY ENTRY TABLE (When Not Filtering) */
        <div className="bg-white border border-slate-300 rounded-2xl shadow-sm overflow-hidden">
          {/* Table Toolbar */}
          <div className="bg-slate-800 text-white px-3 py-2 flex flex-wrap items-center justify-between gap-2 print:hidden">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold flex items-center gap-1.5">
                <span>جدول إدخال الحركات المتتابعة (عدد الأسطر: {rows.length})</span>
                <span className="bg-blue-600/60 text-blue-200 text-[10px] px-1.5 py-0.2 rounded font-mono font-normal">
                  {viewMode === 'continuous' ? 'متتابع لكافة التواريخ 📋' : 'يوم ' + selectedDate}
                </span>
              </span>
              <span className="text-[10px] bg-slate-700 text-slate-300 px-2 py-0.5 rounded font-mono">
                الصالح للترحيل: {totals.validRowsCount}
              </span>

              {/* Active Collaborators Live Indicator (Excel Online Style) */}
              {activeCollaborators.length > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-950/90 text-amber-200 border border-amber-500/50 px-2.5 py-0.5 rounded-full text-[10.5px] font-bold shadow-2xs">
                  <Lock className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>يحرر الآن:</span>
                  <div className="flex items-center gap-1">
                    {activeCollaborators.map(c => (
                      <span key={c.userId} className="bg-amber-400/20 text-amber-100 px-1.5 py-0.2 rounded font-black flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                        <span>{c.userName}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {/* Column Widths Customizer Button */}
              <button
                type="button"
                onClick={() => setShowColumnControls(prev => !prev)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer ${
                  showColumnControls
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                }`}
                title="التحكم في عروض أعمدة الجدول يدوياً (سحب الأعمدة أو اختيار قياس جاهز)"
              >
                <Columns className="w-3.5 h-3.5" />
                <span>عرض الأعمدة ⚙️</span>
              </button>

              <button
                type="button"
                onClick={handleCleanEmptyRows}
                className="px-2 py-1 bg-slate-700 hover:bg-slate-600 text-slate-200 rounded text-[11px] font-bold transition cursor-pointer"
                title="حذف الأسطر الفارغة"
              >
                مسح الأسطر الفارغة
              </button>
              <button
                type="button"
                onClick={handleAddRow}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[11px] font-bold flex items-center gap-1 transition cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة سطر (+)</span>
              </button>
            </div>
          </div>

          {/* Expandable Manual Column Widths Controls */}
          {showColumnControls && (
            <div className="bg-slate-900 border-b border-slate-700 p-3 text-slate-200 text-xs flex flex-col gap-2.5 print:hidden animate-in fade-in duration-200">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800 pb-2">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-blue-400" />
                  <span className="font-bold text-white text-xs">
                    التحكم في عرض أعمدة الجدول يدوياً:
                  </span>
                  <span className="text-[11px] text-slate-400">
                    (يمكنك أيضاً سحب الفواصل الرأسية بين عناوين الأعمدة مباشرة بالماوس كشيت الإكسل تماماً)
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-400 ml-1">قياسات سريعة:</span>
                  <button
                    type="button"
                    onClick={() => applyColumnPreset('compact')}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10.5px] font-bold transition border border-slate-700 cursor-pointer"
                  >
                    مضغوط
                  </button>
                  <button
                    type="button"
                    onClick={() => applyColumnPreset('standard')}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10.5px] font-bold transition border border-slate-700 cursor-pointer"
                  >
                    قياسي
                  </button>
                  <button
                    type="button"
                    onClick={() => applyColumnPreset('wide')}
                    className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10.5px] font-bold transition border border-slate-700 cursor-pointer"
                  >
                    متسع
                  </button>
                  <button
                    type="button"
                    onClick={handleResetColumnWidths}
                    className="px-2 py-0.5 bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 rounded text-[10.5px] font-bold transition border border-rose-800/60 flex items-center gap-1 cursor-pointer mr-2"
                    title="استعادة القياسات الافتراضية لكافة الأعمدة"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>استعادة الافتراضي</span>
                  </button>
                </div>
              </div>

              {/* Quick Sliders Grid for each column */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-[11px]">
                {[
                  { key: 'serial', label: '#' },
                  { key: 'entryDate', label: 'تاريخ اليوم' },
                  { key: 'customerName', label: 'الزبون الرئيسي' },
                  { key: 'subCustomerName', label: 'الزبون الفرعي' },
                  { key: 'itemName', label: 'الصنف' },
                  { key: 'notes', label: 'ملاحظات' },
                  { key: 'requiredAmount', label: 'المطلوب' },
                  { key: 'paidAmount', label: 'المدفوع' },
                  { key: 'paymentNotes', label: 'ملاحظة السداد' },
                  { key: 'treasury', label: 'الصندوق' },
                  { key: 'actions', label: 'إجراءات' },
                ].map(col => (
                  <div key={col.key} className="bg-slate-800/80 p-1.5 rounded-lg border border-slate-700 flex flex-col gap-1">
                    <div className="flex items-center justify-between font-bold text-slate-300">
                      <span>{col.label}</span>
                      <span className="font-mono text-[10px] text-blue-400">{columnWidths[col.key] || DEFAULT_COLUMN_WIDTHS[col.key]}px</span>
                    </div>
                    <input
                      type="range"
                      min="45"
                      max="450"
                      value={columnWidths[col.key] || DEFAULT_COLUMN_WIDTHS[col.key]}
                      onChange={e => {
                        const val = parseInt(e.target.value, 10);
                        saveColumnWidths({
                          ...columnWidths,
                          [col.key]: val
                        });
                      }}
                      className="w-full accent-blue-500 cursor-pointer h-1.5 bg-slate-700 rounded-lg"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* The Responsive Table Container with Sticky Header */}
          <div className="flex-1 min-h-0 overflow-x-auto overflow-y-auto border border-slate-300 rounded-xl relative scrollbar-thin shadow-xs bg-white">
            <table className="w-full text-right border-collapse text-xs table-fixed">
              {/* Controlled Column Widths via Colgroup */}
              <colgroup>
                <col style={{ width: `${columnWidths.serial || DEFAULT_COLUMN_WIDTHS.serial}px` }} />
                <col style={{ width: `${columnWidths.entryDate || DEFAULT_COLUMN_WIDTHS.entryDate || 110}px` }} />
                <col style={{ width: `${columnWidths.customerName || DEFAULT_COLUMN_WIDTHS.customerName}px` }} />
                <col style={{ width: `${columnWidths.subCustomerName || DEFAULT_COLUMN_WIDTHS.subCustomerName}px` }} />
                <col style={{ width: `${columnWidths.itemName || DEFAULT_COLUMN_WIDTHS.itemName}px` }} />
                <col style={{ width: `${columnWidths.notes || DEFAULT_COLUMN_WIDTHS.notes}px` }} />
                <col style={{ width: `${columnWidths.requiredAmount || DEFAULT_COLUMN_WIDTHS.requiredAmount}px` }} />
                <col style={{ width: `${columnWidths.paidAmount || DEFAULT_COLUMN_WIDTHS.paidAmount}px` }} />
                <col style={{ width: `${columnWidths.paymentNotes || DEFAULT_COLUMN_WIDTHS.paymentNotes}px` }} />
                <col style={{ width: `${columnWidths.treasury || DEFAULT_COLUMN_WIDTHS.treasury}px` }} />
                <col style={{ width: `${columnWidths.actions || DEFAULT_COLUMN_WIDTHS.actions}px` }} />
              </colgroup>
              <thead className="sticky top-0 z-20 shadow-xs">
                <tr className="bg-slate-100 text-slate-800 font-black border-b border-slate-300 text-[11px] select-none">
                  {/* 1. # */}
                  <th
                    style={{ width: `${columnWidths.serial || DEFAULT_COLUMN_WIDTHS.serial}px` }}
                    className="sticky top-0 z-20 bg-slate-100 relative py-1 px-1 text-center border-l border-slate-200 group"
                  >
                    <span>#</span>
                    <div
                      onMouseDown={(e) => handleStartResize(e, 'serial')}
                      className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100"
                      title="اسحب لتعديل العرض"
                    >
                      <div className="w-0.5 h-full bg-slate-400 group-hover:bg-blue-600"></div>
                    </div>
                  </th>

                  {/* 2. تاريخ اليوم (كشف متتابع) */}
                  <th
                    style={{ width: `${columnWidths.entryDate || DEFAULT_COLUMN_WIDTHS.entryDate || 110}px` }}
                    className="sticky top-0 z-20 bg-slate-100 relative py-1 px-1 text-center border-l border-slate-200 group text-slate-800"
                  >
                    <span className="truncate block font-black">التاريخ 📅</span>
                    <div
                      onMouseDown={(e) => handleStartResize(e, 'entryDate')}
                      className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100"
                      title="اسحب لتعديل العرض"
                    >
                      <div className="w-0.5 h-full bg-slate-400 group-hover:bg-blue-600"></div>
                    </div>
                  </th>

                  {/* 3. اسم الزبون الرئيسي */}
                  <th
                    style={{ width: `${columnWidths.customerName || DEFAULT_COLUMN_WIDTHS.customerName}px` }}
                    className="sticky top-0 z-20 bg-slate-100 relative py-1 px-2 border-l border-slate-200 group"
                  >
                    <span className="truncate block">اسم الزبون الرئيسي</span>
                    <div
                      onMouseDown={(e) => handleStartResize(e, 'customerName')}
                      className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100"
                      title="اسحب لتعديل عرض عمود الزبون"
                    >
                      <div className="w-0.5 h-full bg-slate-400 group-hover:bg-blue-600"></div>
                    </div>
                  </th>

                  {/* 3. الزبون الفرعي */}
                  <th
                    style={{ width: `${columnWidths.subCustomerName || DEFAULT_COLUMN_WIDTHS.subCustomerName}px` }}
                    className="sticky top-0 z-20 bg-slate-100 relative py-1 px-2 border-l border-slate-200 group"
                  >
                    <span className="truncate block">الزبون الفرعي</span>
                    <div
                      onMouseDown={(e) => handleStartResize(e, 'subCustomerName')}
                      className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100"
                      title="اسحب لتعديل عرض عمود الزبون الفرعي"
                    >
                      <div className="w-0.5 h-full bg-slate-400 group-hover:bg-blue-600"></div>
                    </div>
                  </th>

                  {/* 4. الصنف */}
                  <th
                    style={{ width: `${columnWidths.itemName || DEFAULT_COLUMN_WIDTHS.itemName}px` }}
                    className="sticky top-0 z-20 bg-slate-100 relative py-1 px-2 border-l border-slate-200 group"
                  >
                    <span className="truncate block">الصنف</span>
                    <div
                      onMouseDown={(e) => handleStartResize(e, 'itemName')}
                      className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100"
                      title="اسحب لتعديل عرض عمود الصنف"
                    >
                      <div className="w-0.5 h-full bg-slate-400 group-hover:bg-blue-600"></div>
                    </div>
                  </th>

                  {/* 5. ملاحظات */}
                  <th
                    style={{ width: `${columnWidths.notes || DEFAULT_COLUMN_WIDTHS.notes}px` }}
                    className="sticky top-0 z-20 bg-slate-100 relative py-1 px-2 border-l border-slate-200 group"
                  >
                    <span className="truncate block">ملاحظات</span>
                    <div
                      onMouseDown={(e) => handleStartResize(e, 'notes')}
                      className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100"
                      title="اسحب لتعديل عرض عمود الملاحظات"
                    >
                      <div className="w-0.5 h-full bg-slate-400 group-hover:bg-blue-600"></div>
                    </div>
                  </th>

                  {/* 6. المبلغ المطلوب */}
                  <th
                    style={{ width: `${columnWidths.requiredAmount || DEFAULT_COLUMN_WIDTHS.requiredAmount}px` }}
                    className="sticky top-0 z-20 bg-slate-100 relative py-1 px-1.5 text-center border-l border-slate-200 group"
                  >
                    <span className="truncate block">المبلغ المطلوب</span>
                    <div
                      onMouseDown={(e) => handleStartResize(e, 'requiredAmount')}
                      className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100"
                      title="اسحب لتعديل عرض عمود المبلغ المطلوب"
                    >
                      <div className="w-0.5 h-full bg-slate-400 group-hover:bg-blue-600"></div>
                    </div>
                  </th>

                  {/* 7. المدفوع */}
                  <th
                    style={{ width: `${columnWidths.paidAmount || DEFAULT_COLUMN_WIDTHS.paidAmount}px` }}
                    className="sticky top-0 z-20 bg-slate-100 relative py-1 px-1.5 text-center border-l border-slate-200 group"
                  >
                    <span className="truncate block">المدفوع</span>
                    <div
                      onMouseDown={(e) => handleStartResize(e, 'paidAmount')}
                      className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100"
                      title="اسحب لتعديل عرض عمود المدفوع"
                    >
                      <div className="w-0.5 h-full bg-slate-400 group-hover:bg-blue-600"></div>
                    </div>
                  </th>

                  {/* 8. ملاحظة السداد (الملاحظة المرفقة مع السداد قبل الصندوق) */}
                  <th
                    style={{ width: `${columnWidths.paymentNotes || DEFAULT_COLUMN_WIDTHS.paymentNotes}px` }}
                    className="sticky top-0 z-20 bg-slate-100 relative py-1 px-2 border-l border-slate-200 group"
                  >
                    <span className="truncate block">ملاحظة السداد</span>
                    <div
                      onMouseDown={(e) => handleStartResize(e, 'paymentNotes')}
                      className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100"
                      title="اسحب لتعديل عرض عمود ملاحظة السداد"
                    >
                      <div className="w-0.5 h-full bg-slate-400 group-hover:bg-blue-600"></div>
                    </div>
                  </th>

                  {/* 9. الصندوق */}
                  <th
                    style={{ width: `${columnWidths.treasury || DEFAULT_COLUMN_WIDTHS.treasury}px` }}
                    className="sticky top-0 z-20 bg-slate-100 relative py-1 px-2 border-l border-slate-200 group"
                  >
                    <div className="flex items-center justify-between">
                      <span>الصندوق</span>
                      <span className="text-[8.5px] font-normal text-blue-700 bg-blue-50 border border-blue-200 px-1 py-0.2 rounded flex items-center gap-0.5" title="يرتبط تلقائياً بالسطر السابق، والسطر الجديد يرث ما اختير في السطر الذي قبله">
                        <Link2 className="w-2.5 h-2.5" />
                        <span>يرث</span>
                      </span>
                    </div>
                    <div
                      onMouseDown={(e) => handleStartResize(e, 'treasury')}
                      className="absolute top-0 bottom-0 left-0 w-2.5 cursor-col-resize hover:bg-blue-500/50 active:bg-blue-600 transition-colors z-20 flex items-center justify-center opacity-0 group-hover:opacity-100"
                      title="اسحب لتعديل عرض عمود الصندوق"
                    >
                      <div className="w-0.5 h-full bg-slate-400 group-hover:bg-blue-600"></div>
                    </div>
                  </th>

                  {/* 10. إجراء */}
                  <th
                    style={{ width: `${columnWidths.actions || DEFAULT_COLUMN_WIDTHS.actions}px` }}
                    className="sticky top-0 z-20 bg-slate-100 py-1 px-1 text-center print:hidden font-black text-slate-800"
                    title="أيقونة (+) لحفظ البند ومزامنته سحابياً وفتح سطر جديد"
                  >
                    <span>حفظ (+)</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {displayedRows.map((row, idx) => {
                  const reqVal = Number(row.requiredAmount || 0);
                  const paidVal = Number(row.paidAmount || 0);
                  const isPaidFull = reqVal > 0 && paidVal >= reqVal;
                  const isPartial = reqVal > 0 && paidVal > 0 && paidVal < reqVal;
                  const isCredit = reqVal > 0 && paidVal === 0;

                  // Collaborative row lock status
                  const lock = activeLocks[row.id];
                  const isLockedByOther = Boolean(
                    lock &&
                    lock.userId !== (currentUser?.id || 'usr-anon') &&
                    (Date.now() - lock.lockedAt < 120000)
                  );
                  const isLockedByMe = editingRowId === row.id;

                  // Match customer if exists
                  const matchedCust = parties.find(p => 
                    p.id === row.customerId || 
                    p.name.trim().toLowerCase() === row.customerName.trim().toLowerCase()
                  );
                  const subCustList = matchedCust?.subCustomers || [];

                  const groupInfo = getRowCustomerGroupInfo(idx, displayedRows);
                  const isApproved = Boolean(row.isApproved);

                  return (
                    <tr
                      key={row.id}
                      data-row-id={row.id}
                      className={`transition-colors ${
                        isLockedByOther
                          ? 'bg-amber-50/90 border-r-4 border-r-amber-500 ring-1 ring-amber-300 shadow-2xs text-slate-900'
                          : isLockedByMe
                          ? 'bg-blue-50/40 border-r-4 border-r-blue-500 ring-1 ring-blue-300/80 shadow-2xs'
                          : isApproved
                          ? 'bg-emerald-50/90 border-r-4 border-r-emerald-600 hover:bg-emerald-100/70 shadow-2xs text-slate-900'
                          : (groupInfo.isMultiItem || row.isAdditionalItem)
                          ? 'bg-slate-200/85 hover:bg-slate-200/95 border-r-4 border-r-slate-400 font-medium'
                          : idx % 2 === 0
                          ? 'bg-white'
                          : 'bg-slate-50/50'
                      }`}
                    >
                      {/* 1. رقم مسلسل: يُعرض في كل سطر بشكل مستقل ومنظم لمنع أي تداخل بالأعمدة */}
                      <td className="py-0.5 px-0.5 text-center font-mono font-bold text-slate-700 border-l border-slate-200 align-middle bg-slate-50/70">
                        <div className="flex flex-col items-center justify-center min-h-[28px]">
                          <span className="font-black text-sm text-slate-900">{row.serialNumber}</span>
                          
                          {isApproved && (
                            <span className="mt-0.5 px-1 rounded-xs text-[7.5px] font-black bg-emerald-600 text-white flex items-center gap-0.5 shadow-2xs" title={`معتمد بالفاتورة: ${row.approvedInvoiceNumber || ''}`}>
                              <Check className="w-2 h-2" />
                              <span>معتمد</span>
                            </span>
                          )}
                          {/* Live Lock Indicator (Excel Online Style) */}
                          {isLockedByOther && (
                            <div className="flex flex-col items-center gap-0.2 mt-0.5 bg-amber-100 border border-amber-300 px-1 py-0.2 rounded text-[7.5px] font-bold text-amber-900 shadow-2xs animate-pulse" title={`هذا البند محجوز حالياً للتعديل بواسطة (${lock.userName})`}>
                              <div className="flex items-center gap-0.5">
                                <Lock className="w-2 h-2 text-amber-700 shrink-0" />
                                <span className="truncate max-w-[42px]">{lock.userName}</span>
                              </div>
                            </div>
                          )}
                          {isLockedByMe && (
                            <div className="flex items-center gap-0.5 mt-0.5 bg-blue-100 text-blue-800 border border-blue-200 px-1 py-0.2 rounded text-[7px] font-bold">
                              <Edit3 className="w-1.5 h-1.5 text-blue-600" />
                              <span>تعديل</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* 2. عمود تاريخ اليوم: يُعرض في كل سطر بحقل مستقل يضمن ثبات وترتيب الأعمدة 100% */}
                      <td className="py-0.5 px-1 text-center font-mono text-[11px] font-bold border-l border-slate-200 align-middle bg-slate-50/40">
                        <input
                          type="date"
                          disabled={isLockedByOther || row.isAdditionalItem}
                          value={row.entryDate || selectedDate}
                          onChange={e => {
                            const newDate = e.target.value;
                            handleUpdateRow(row.id, { entryDate: newDate });
                          }}
                          className={`w-full border rounded px-1 py-0.5 text-center text-[10.5px] font-mono font-bold text-slate-800 outline-none transition ${
                            row.isAdditionalItem
                              ? 'bg-slate-200/90 border-slate-300 text-slate-600 cursor-not-allowed select-none'
                              : 'bg-white border-slate-200 hover:border-slate-400 focus:border-blue-500'
                          }`}
                          title={row.isAdditionalItem ? "التاريخ مقفل تلقائياً كبند تابع لنفس الفاتورة" : "تاريخ حركة هذا السطر"}
                        />
                      </td>

                      {/* 3. اسم الزبون الرئيسي */}
                      <td className="p-0.5 border-l border-slate-200">
                        <div className="relative">
                          <CustomerCellInput
                            isAdditionalItem={groupInfo.isMultiItem || row.isAdditionalItem}
                            value={row.customerName}
                            parties={parties}
                            disabled={isLockedByOther || row.isAdditionalItem}
                            onFocus={() => handleRowFocus(row.id, 'customerName')}
                            onBlur={() => handleRowBlur(row.id)}
                            onChange={(name, custId) => {
                              if (groupInfo.isMultiItem) {
                                handleUpdateCustomerForGroup(row.serialNumber, name, custId);
                              } else {
                                handleUpdateRow(row.id, {
                                  customerName: name,
                                  customerId: custId
                                });
                              }
                            }}
                          />
                        </div>
                      </td>

                      {/* 3. الزبون الفرعي */}
                      <td className="p-0.5 border-l border-slate-200">
                        {subCustList.length > 0 ? (
                          <div className="relative">
                            <input
                              type="text"
                              disabled={isLockedByOther || row.isAdditionalItem}
                              list={`sub-list-${row.id}`}
                              value={row.subCustomerName || ''}
                              onFocus={() => handleRowFocus(row.id, 'subCustomerName')}
                              onBlur={() => handleRowBlur(row.id)}
                              onChange={e => {
                                if (groupInfo.isMultiItem) {
                                  handleUpdateSubCustomerForGroup(row.serialNumber, e.target.value);
                                } else {
                                  handleUpdateRow(row.id, { subCustomerName: e.target.value });
                                }
                              }}
                              placeholder={isLockedByOther ? 'محجوز...' : 'الزبون الفرعي...'}
                              className={`w-full px-1.5 py-0.5 h-7 border rounded text-[11px] outline-none ${
                                isLockedByOther
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none'
                                  : (groupInfo.isMultiItem || row.isAdditionalItem)
                                ? 'bg-slate-200/90 border-slate-300 hover:border-slate-400 focus:border-blue-500 text-slate-900 font-bold'
                                : 'bg-white border-slate-200 hover:border-slate-400 focus:border-blue-500 text-slate-800'
                              }`}
                            />
                            <datalist id={`sub-list-${row.id}`}>
                              {subCustList.map(s => (
                                <option key={s.id} value={s.name}>
                                  {s.name} {s.phone ? `(${s.phone})` : ''}
                                </option>
                              ))}
                            </datalist>
                          </div>
                        ) : (
                          <input
                            type="text"
                            disabled={isLockedByOther || row.isAdditionalItem}
                            value={row.subCustomerName || ''}
                            onFocus={() => handleRowFocus(row.id, 'subCustomerName')}
                            onBlur={() => handleRowBlur(row.id)}
                            onChange={e => {
                              if (groupInfo.isMultiItem) {
                                handleUpdateSubCustomerForGroup(row.serialNumber, e.target.value);
                              } else {
                                handleUpdateRow(row.id, { subCustomerName: e.target.value });
                              }
                            }}
                            placeholder={isLockedByOther ? 'محجوز...' : 'الفرعي إن وجد...'}
                            className={`w-full px-1.5 py-0.5 h-7 border rounded text-[11px] outline-none ${
                              isLockedByOther
                                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none'
                                : (groupInfo.isMultiItem || row.isAdditionalItem)
                                ? 'bg-slate-200/90 border-slate-300 hover:border-slate-400 focus:border-blue-500 text-slate-900 font-bold'
                                : 'bg-white border-slate-200 hover:border-slate-400 focus:border-blue-500 text-slate-800'
                            }`}
                          />
                        )}
                      </td>

                      {/* 4. الصنف + علامة (+) في زاوية مربع الصنف لإضافة صنف آخر لنفس الزبون */}
                      <td className="p-0.5 border-l border-slate-200">
                        <ItemCellInput
                          isAdditionalItem={groupInfo.isMultiItem || row.isAdditionalItem}
                          value={row.itemName}
                          inventory={inventory}
                          disabled={isLockedByOther}
                          onFocus={() => handleRowFocus(row.id, 'itemName')}
                          onBlur={() => handleRowBlur(row.id)}
                          onChange={(name, itemId, itemPrice) => {
                            const updates: Partial<DailyEntryRow> = {
                              itemName: name,
                              itemId: itemId
                            };
                            // If price available and requiredAmount is currently 0, auto-fill it
                            if (itemPrice && Number(row.requiredAmount || 0) === 0) {
                              updates.requiredAmount = itemPrice;
                            }
                            handleUpdateRow(row.id, updates);
                          }}
                          onAddSubItem={() => handleAddCustomerSubItem(row.id)}
                        />
                      </td>

                      {/* 5. ملاحظات */}
                      <td className="p-0.5 border-l border-slate-200">
                        <input
                          type="text"
                          disabled={isLockedByOther}
                          value={row.notes || ''}
                          onFocus={() => handleRowFocus(row.id, 'notes')}
                          onBlur={() => handleRowBlur(row.id)}
                          onChange={e => handleUpdateRow(row.id, { notes: e.target.value })}
                          placeholder={isLockedByOther ? 'محجوز...' : 'بيان، مقاسات...'}
                          className={`w-full px-1.5 py-0.5 h-7 border rounded text-[11px] outline-none ${
                            isLockedByOther
                              ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none'
                              : (groupInfo.isMultiItem || row.isAdditionalItem)
                                ? 'bg-slate-200/90 border-slate-300 hover:border-slate-400 focus:border-blue-500 text-slate-900 font-bold'
                                : 'bg-white border-slate-200 hover:border-slate-400 focus:border-blue-500 text-slate-800'
                          }`}
                        />
                      </td>

                      {/* 6. المبلغ المطلوب (يجمع لكافة بنود نفس الزبون) */}
                      <td className="p-0.5 border-l border-slate-200 text-center">
                        <div className="relative flex items-center">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            disabled={isLockedByOther}
                            value={row.requiredAmount === 0 ? '' : row.requiredAmount}
                            onFocus={() => handleRowFocus(row.id, 'requiredAmount')}
                            onBlur={() => handleRowBlur(row.id)}
                            onChange={e => {
                              const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                              handleUpdateRow(row.id, { requiredAmount: isNaN(val) ? 0 : val });
                            }}
                            placeholder="0.00"
                            className={`w-full text-center px-1 py-0.5 h-7 border rounded font-mono font-bold text-[11px] outline-none ${
                              isLockedByOther
                                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none'
                                : 'bg-white border-slate-200 hover:border-slate-400 focus:border-blue-500 text-slate-900'
                            }`}
                          />
                        </div>
                        {groupInfo.isMultiItem && groupInfo.isLast && (
                          <div className="text-[8.5px] text-blue-700 font-bold mt-0.5 bg-blue-50 border border-blue-200/60 rounded px-1 py-0.2" title="إجمالي المطلوب لكافة بنود هذا الزبون في هذه الفاتورة">
                            مجموع: {groupInfo.totalGroupRequired.toFixed(2)} ₪
                          </div>
                        )}
                      </td>

                      {/* 7. المدفوع (يجمد في الأسطر السابقة ويعتمد في آخر بند لنفس الزبون فقط) */}
                      <td className="p-0.5 border-l border-slate-200 text-center">
                        {groupInfo.isMultiItem && !groupInfo.isLast ? (
                          <div
                            className="w-full text-center px-1 py-0.5 h-7 bg-slate-100 text-slate-400 border border-slate-200 rounded font-mono text-[10px] flex items-center justify-center gap-1 cursor-not-allowed select-none"
                            title="آلية الدفع مجمدة تلقائياً: تعتمد وتحدد في آخر بند لنفس الزبون لتغطية إجمالي الفاتورة"
                          >
                            <Lock className="w-2.5 h-2.5 text-slate-400" />
                            <span>بالأخير</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-0.5">
                            <input
                              type="number"
                              step="any"
                              min="0"
                              disabled={isLockedByOther}
                              value={row.paidAmount === 0 ? '' : row.paidAmount}
                              onFocus={() => handleRowFocus(row.id, 'paidAmount')}
                              onBlur={() => handleRowBlur(row.id)}
                              onChange={e => {
                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                handleUpdateRow(row.id, { paidAmount: isNaN(val) ? 0 : val });
                              }}
                              onKeyDown={e => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleSaveRowAndOpenNew(idx);
                                }
                              }}
                              placeholder="0.00"
                              className={`w-full text-center px-1 py-0.5 h-7 border rounded font-mono font-bold text-[11px] outline-none ${
                                isLockedByOther
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none'
                                  : isPaidFull
                                  ? 'border-emerald-300 text-emerald-800 bg-emerald-50/30'
                                  : isPartial
                                  ? 'border-amber-300 text-amber-800 bg-amber-50/30'
                                  : 'border-slate-200 text-slate-900 bg-white'
                              }`}
                            />
                            {/* Quick Full-Pay Button */}
                            <button
                              type="button"
                              onClick={() => {
                                handleUpdateRow(row.id, { paidAmount: groupInfo.totalGroupRequired });
                              }}
                              disabled={isLockedByOther || groupInfo.totalGroupRequired <= 0}
                              className="px-1 h-7 bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-800 rounded text-[9.5px] font-bold border border-slate-200 transition shrink-0 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed print:hidden"
                              title="تسجيل سداد كامل المبلغ المطلوب للفاتورة"
                            >
                              كامل
                            </button>
                          </div>
                        )}
                      </td>

                      {/* 8. ملاحظة السداد (الملاحظة المرفقة مع السداد) */}
                      <td className="p-0.5 border-l border-slate-200">
                        {groupInfo.isMultiItem && !groupInfo.isLast ? (
                          <div
                            className="w-full text-center px-1 py-0.5 h-7 bg-slate-100 text-slate-400 border border-slate-200 rounded font-mono text-[9.5px] flex items-center justify-center gap-1 cursor-not-allowed select-none"
                            title="ملاحظة السداد مجمدة: تعتمد وتحدد في آخر بند لنفس الزبون مع الدفع"
                          >
                            <Lock className="w-2.5 h-2.5 text-slate-400" />
                            <span>بالأخير</span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            disabled={isLockedByOther}
                            value={row.paymentNotes || ''}
                            onFocus={() => handleRowFocus(row.id, 'paymentNotes')}
                            onBlur={() => handleRowBlur(row.id)}
                            onChange={e => handleUpdateRow(row.id, { paymentNotes: e.target.value })}
                            placeholder={isLockedByOther ? 'محجوز...' : 'ملاحظة السداد...'}
                            className={`w-full px-1.5 py-0.5 h-7 border rounded text-[11px] outline-none placeholder:text-slate-400 ${
                              isLockedByOther
                                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none'
                                : (groupInfo.isMultiItem || row.isAdditionalItem)
                                ? 'bg-slate-200/90 border-slate-300 hover:border-slate-400 focus:border-blue-500 text-slate-900 font-bold'
                                : 'bg-white border-slate-200 hover:border-slate-400 focus:border-blue-500 text-slate-800'
                            }`}
                          />
                        )}
                      </td>

                      {/* 9. الصندوق (يجمد في الأسطر السابقة ويعتمد في آخر بند لنفس الزبون) */}
                      <td className="p-0.5 border-l border-slate-200">
                        {groupInfo.isMultiItem && !groupInfo.isLast ? (
                          <div
                            className="w-full px-1.5 py-0.5 h-7 bg-slate-100 text-slate-500 border border-slate-200 rounded text-xs truncate flex items-center justify-between cursor-not-allowed select-none"
                            title="الصندوق موحد لكافة بنود نفس الزبون ويعتمد من آخر بند"
                          >
                            <span className="truncate text-[10.5px] font-medium">{groupInfo.lastItemOfGroup?.treasuryName || 'موحد'}</span>
                            <Lock className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                          </div>
                        ) : (
                          <div className="flex items-center gap-0.5">
                            <select
                              disabled={isLockedByOther}
                              value={row.treasuryId || defaultTreasury?.id || ''}
                              onFocus={() => handleRowFocus(row.id, 'treasury')}
                              onBlur={() => handleRowBlur(row.id)}
                              onChange={e => {
                                const tId = e.target.value;
                                const tObj = treasuries.find(t => t.id === tId);
                                if (groupInfo.isMultiItem) {
                                  handleUpdateTreasuryForGroup(row.serialNumber, tId, tObj?.name || '');
                                } else {
                                  handleUpdateRow(row.id, {
                                    treasuryId: tId,
                                    treasuryName: tObj?.name || ''
                                  });
                                }
                              }}
                              onKeyDown={e => {
                                // Pressing Enter in the last cell of the last row automatically creates a new row!
                                if (e.key === 'Enter' && idx === rows.length - 1) {
                                  e.preventDefault();
                                  handleAddRow();
                                }
                              }}
                              className={`w-full px-1 py-0.5 h-7 border rounded text-[11px] outline-none ${
                                isLockedByOther
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none'
                                  : 'bg-white border-slate-200 hover:border-slate-400 focus:border-blue-500 text-slate-800 cursor-pointer'
                              }`}
                              title="اختيار الصندوق أو الخزنة"
                            >
                              {treasuries.map(t => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={isLockedByOther}
                              onClick={() => handleApplyTreasuryToSubsequent(idx)}
                              className="p-1 h-7 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition shrink-0 cursor-pointer print:hidden disabled:opacity-30 disabled:cursor-not-allowed"
                              title="تعميم هذا الصندوق تلقائياً على الأسطر التالية"
                            >
                              <ArrowDownToLine className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </td>

                      {/* 10. إجراءات السطر */}
                      <td className="p-0.5 text-center print:hidden">
                        <div className="flex items-center justify-center gap-0.5">
                          {isLockedByOther && (
                            <button
                              type="button"
                              onClick={() => forceReleaseDailyEntryRowLock(selectedDate, row.id)}
                              className="p-1 text-amber-700 hover:text-amber-950 hover:bg-amber-100 rounded transition cursor-pointer"
                              title={`فك الحجز يدوياً عن هذا البند (${lock.userName})`}
                            >
                              <Unlock className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {isApproved && (
                            <button
                              type="button"
                              onClick={() => setActiveTab('invoices')}
                              className="p-1 text-emerald-700 hover:text-emerald-900 hover:bg-emerald-100 rounded transition cursor-pointer"
                              title={`عرض الفاتورة المعتمدة (${row.approvedInvoiceNumber || ''})`}
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            disabled={isLockedByOther}
                            onClick={() => handleSaveRowAndOpenNew(idx)}
                            className="p-1.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg shadow-xs transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center group"
                            title="حفظ البند ومزامنته سحابياً وفتح سطر جديد (+)"
                          >
                            <Plus className="w-4 h-4 text-white group-hover:scale-110 transition-transform font-black" />
                          </button>
                          <button
                            type="button"
                            disabled={isLockedByOther}
                            onClick={() => handleClearRowData(row.id)}
                            className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title="مسح وتفريغ الكلام والبيانات فقط من هذا السطر"
                          >
                            <Eraser className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={isLockedByOther}
                            onClick={() => promptDeleteRow(row)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                            title="حذف نهائي للسطر"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            {/* Table Footer with Sticky Totals */}
            <tfoot className="sticky bottom-0 z-20 shadow-xs">
              <tr className="bg-slate-100 font-black border-t-2 border-slate-400 text-slate-900 text-xs">
                <td colSpan={6} className="sticky bottom-0 bg-slate-100 py-1.5 px-2 text-left">
                  الإجمالي العام لكشف اليوم ({selectedDate}):
                </td>
                <td className="sticky bottom-0 bg-slate-100 py-1.5 px-1 text-center font-mono text-xs font-black text-slate-900">
                  {totals.totalRequired.toFixed(2)} ₪
                </td>
                <td className="sticky bottom-0 bg-slate-100 py-1.5 px-1 text-center font-mono text-xs font-black text-emerald-800">
                  {totals.totalPaid.toFixed(2)} ₪
                </td>
                <td colSpan={3} className="sticky bottom-0 bg-slate-100 py-1.5 px-2 text-slate-600 text-[10.5px]">
                  المتبقي/الآجل: <strong className="font-mono text-rose-700 font-bold">{totals.totalRemaining.toFixed(2)} ₪</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
        </div>
      )}

      {/* COMPACT SINGLE-ROW FOOTER TOOLBAR (شريط إجماليات وملاحظات مدمج بسطر واحد) */}
      <div className="bg-white border border-slate-300 rounded-xl px-3 py-1.5 shadow-xs flex flex-wrap items-center justify-between gap-2 shrink-0 text-xs print:hidden">
        {/* 1. Summary Totals Badges */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <span className="text-slate-500 font-bold text-[11px]">المطلوب:</span>
            <strong className="font-mono font-black text-slate-900">{totals.totalRequired.toFixed(2)} ₪</strong>
          </div>
          <div className="flex items-center gap-1 border-r border-slate-200 pr-3">
            <span className="text-slate-500 font-bold text-[11px]">المقبوض:</span>
            <strong className="font-mono font-black text-emerald-700">{totals.totalPaid.toFixed(2)} ₪</strong>
          </div>
          <div className="flex items-center gap-1 border-r border-slate-200 pr-3">
            <span className="text-slate-500 font-bold text-[11px]">الآجل:</span>
            <strong className="font-mono font-black text-rose-700">{totals.totalRemaining.toFixed(2)} ₪</strong>
          </div>
          <div className="flex items-center gap-1 border-r border-slate-200 pr-3">
            <span className="text-slate-500 font-bold text-[11px]">الحالة:</span>
            <span className="font-bold text-emerald-700">{totals.approvedCount} معتمد</span>
            {totals.pendingCount > 0 && <span className="text-slate-400">({totals.pendingCount} معلق)</span>}
          </div>
        </div>

        {/* 2. Treasuries Breakdown & Compact Notes */}
        <div className="flex items-center gap-2 flex-1 max-w-xl">
          {Object.keys(totals.treasuryBreakdown).length > 0 && (
            <div className="flex items-center gap-1 shrink-0 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-lg text-[11px]">
              <Building2 className="w-3 h-3 text-blue-600" />
              {(Object.entries(totals.treasuryBreakdown) as [string, { name: string; amount: number; count: number }][]).slice(0, 2).map(([tKey, tData]) => (
                <span key={tKey} className="font-bold text-slate-700">
                  {tData.name}: <strong className="font-mono text-emerald-800">{tData.amount.toFixed(2)} ₪</strong>
                </span>
              ))}
            </div>
          )}
          <input
            type="text"
            value={sheetNotes}
            onChange={e => {
              setIsSaved(false);
              setSheetNotes(e.target.value);
            }}
            placeholder="ملاحظات الكشف..."
            className="flex-1 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 outline-none focus:bg-white focus:border-blue-500 placeholder:text-slate-400 min-w-[140px]"
          />
        </div>
      </div>

      {/* 6. CONFIRM DELETE ROW MODAL (حذف نهائي للسطر) */}
      {rowToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95" dir="rtl">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm">حذف نهائي للسطر</h3>
                <p className="text-xs text-slate-500 font-bold">السطر رقم #{rowToDelete.serialNumber}</p>
              </div>
            </div>
            
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              هل أنت متأكد من الحذف النهائي لهذا السطر
              {rowToDelete.customerName ? ` للزبون (${rowToDelete.customerName})` : ''}
              {rowToDelete.itemName ? ` والصنف (${rowToDelete.itemName})` : ''}
              {Number(rowToDelete.requiredAmount) > 0 ? ` بمبلغ (${Number(rowToDelete.requiredAmount).toFixed(2)} ₪)` : ''}
              ؟ سيتم حذفه نهائياً من الكشف ولا يمكن التراجع عنه.
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRowToDelete(null)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={() => handleClearRowData(rowToDelete.id)}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-xs transition cursor-pointer flex items-center gap-1.5"
                title="تفريغ الحقول ومسح النص والأرقام مع بقاء السطر نفسه"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>حذف الكلام فقط</span>
              </button>
              <button
                type="button"
                onClick={() => executeDeleteRow(rowToDelete.id)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs transition cursor-pointer"
              >
                تأكيد الحذف النهائي للسطر
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. CONFIRM DELETE ENTIRE DAY SHEET MODAL (حذف نهائي لكشف اليوم) */}
      {showDeleteDayConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95" dir="rtl">
            <div className="flex items-center gap-3 text-rose-600 mb-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="font-black text-slate-900 text-sm">حذف نهائي لكشف اليوم</h3>
                <p className="text-xs text-slate-500 font-mono font-bold">تاريخ: {selectedDate}</p>
              </div>
            </div>
            
            <p className="text-xs text-slate-600 mb-4 leading-relaxed">
              هل أنت متأكد من الحذف النهائي لكشف الإدخال اليومي ليوم ({selectedDate}) بالكامل؟ سيتم مسح كافة الحركات والأسطر المسجلة لهذا اليوم نهائياً من السحابة والتخزين المحلي.
            </p>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteDayConfirm(false)}
                className="px-3.5 py-2 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleClearDayData}
                className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black shadow-xs transition cursor-pointer flex items-center gap-1.5"
                title="مسح وتفريغ كافة الحركات والكلام مع إبقاء كشف اليوم فارغاً"
              >
                <Eraser className="w-3.5 h-3.5" />
                <span>حذف الكلام فقط (تفريغ الكشف)</span>
              </button>
              <button
                type="button"
                onClick={executeDeleteDaySheet}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs transition cursor-pointer"
              >
                تأكيد الحذف النهائي للكشف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// SUB-COMPONENTS FOR CELL AUTOCOMPLETES
// ==========================================

const CustomerCellInput: React.FC<{
  value: string;
  parties: Party[];
  onChange: (customerName: string, customerId?: string) => void;
  disabled?: boolean;
  isAdditionalItem?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}> = ({ value, parties, onChange, disabled, isAdditionalItem, onFocus, onBlur }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredParties = useMemo(() => {
    const q = normalizeArabicText(value);
    if (!q) return parties.filter(p => p.type === "customer" || p.type === "both").slice(0, 15);
    return parties
      .filter(p => p.type === "customer" || p.type === "both")
      .filter(p => {
        const pNorm = normalizeArabicText(p.name);
        const codeNorm = normalizeArabicText(p.code || "");
        const phoneNorm = normalizeArabicText(p.phone || "");
        return pNorm.includes(q) || codeNorm.includes(q) || phoneNorm.includes(q);
      })
      .slice(0, 15);
  }, [parties, value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        type="text"
        disabled={disabled}
        value={value}
        onFocus={() => {
          if (disabled) return;
          setIsOpen(true);
          onFocus?.();
        }}
        onBlur={() => {
          onBlur?.();
        }}
        onChange={e => {
          onChange(e.target.value, undefined);
          setIsOpen(true);
        }}
        placeholder={disabled ? "محجوز للتعديل..." : "ابحث أو اكتب اسم الزبون..."}
        className={`w-full px-1.5 py-0.5 h-7 border rounded text-[11px] font-bold outline-none placeholder:font-normal ${
          disabled
            ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none"
            : isAdditionalItem
            ? "bg-slate-200/90 border-slate-300 hover:border-slate-400 focus:border-blue-500 text-slate-900 font-bold"
            : "bg-white border-slate-200 hover:border-slate-400 focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
        }`}
      />

      {isOpen && !disabled && (
        <div className="absolute top-full right-0 w-64 bg-white border border-blue-400 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto p-1 font-sans text-right mt-1">
          <div className="text-[10px] font-bold text-slate-500 px-2 py-1 bg-slate-50 rounded-t flex justify-between">
            <span>العملاء المقترحون ({filteredParties.length}):</span>
          </div>
          {filteredParties.length === 0 ? (
            <div className="p-2 text-center text-[11px] text-slate-400">
              زبون جديد (سيتم إدراجه كاسم مباشر)
            </div>
          ) : (
            filteredParties.map((p, idx) => (
              <button
                key={`cust-${p.id || idx}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(p.name, p.id);
                  setIsOpen(false);
                }}
                className="w-full text-right p-1.5 hover:bg-blue-50 rounded-lg flex items-center justify-between text-xs border-b border-slate-100 last:border-0 cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-slate-900 block truncate">{p.name}</span>
                  {p.phone && <span className="text-[10px] text-slate-400 font-mono">{p.phone}</span>}
                </div>
                {p.subCustomers && p.subCustomers.length > 0 && (
                  <span className="text-[9px] bg-slate-100 text-slate-600 px-1 py-0.5 rounded font-bold shrink-0">
                    {p.subCustomers.length} فروع
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

const ItemCellInput: React.FC<{
  value: string;
  inventory: InventoryItem[];
  onChange: (itemName: string, itemId?: string, itemPrice?: number) => void;
  onAddSubItem?: () => void;
  disabled?: boolean;
  isAdditionalItem?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}> = ({ value, inventory, onChange, onAddSubItem, disabled, isAdditionalItem, onFocus, onBlur }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const filteredItems = useMemo(() => {
    const q = normalizeArabicText(value);
    if (!q) return inventory.slice(0, 15);
    return inventory
      .filter(i => {
        const nameNorm = normalizeArabicText(i.name);
        const codeNorm = normalizeArabicText(i.code);
        return nameNorm.includes(q) || codeNorm.includes(q);
      })
      .slice(0, 15);
  }, [inventory, value]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} className="relative w-full">
      <input
        type="text"
        disabled={disabled}
        value={value}
        onFocus={() => {
          if (disabled) return;
          setIsOpen(true);
          onFocus?.();
        }}
        onBlur={() => {
          onBlur?.();
        }}
        onChange={e => {
          onChange(e.target.value, undefined, undefined);
          setIsOpen(true);
        }}
        placeholder={disabled ? "محجوز للتعديل..." : "الصنف أو الخدمة..."}
        className={`w-full px-1.5 py-0.5 h-7 border rounded text-[11px] font-bold outline-none placeholder:font-normal ${
          disabled
            ? "bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed select-none"
            : isAdditionalItem
            ? "bg-slate-200/90 border-slate-300 hover:border-slate-400 focus:border-blue-500 text-slate-900 font-bold"
            : "bg-white border-slate-200 hover:border-slate-400 focus:border-blue-500 text-slate-900 placeholder:text-slate-400"
        } ${onAddSubItem ? "pl-5" : ""}`}
      />

      {onAddSubItem && !disabled && (
        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onAddSubItem();
          }}
          className="absolute top-1 left-1 w-4 h-4 rounded flex items-center justify-center bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white border border-blue-200 hover:border-blue-600 text-[11px] font-black leading-none transition-colors cursor-pointer z-10 select-none shadow-2xs"
          title="إضافة صنف آخر لنفس الزبون (+)"
          aria-label="إضافة صنف آخر لنفس الزبون"
        >
          +
        </button>
      )}

      {isOpen && !disabled && (
        <div className="absolute top-full right-0 w-64 bg-white border border-blue-400 rounded-xl shadow-xl z-50 max-h-56 overflow-y-auto p-1 font-sans text-right mt-1">
          <div className="text-[10px] font-bold text-slate-500 px-2 py-1 bg-slate-50 rounded-t flex justify-between">
            <span>الأصناف المتوفرة ({filteredItems.length}):</span>
          </div>
          {filteredItems.length === 0 ? (
            <div className="p-2 text-center text-[11px] text-slate-400">
              صنف/خدمة مخصصة جديدة
            </div>
          ) : (
            filteredItems.map((inv, idx) => (
              <button
                key={`item-${inv.id || idx}`}
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(inv.name, inv.id, inv.sellingPrice);
                  setIsOpen(false);
                }}
                className="w-full text-right p-1.5 hover:bg-blue-50 rounded-lg flex items-center justify-between text-xs border-b border-slate-100 last:border-0 cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-slate-900 block truncate">{inv.name}</span>
                  <span className="text-[10px] text-slate-400 font-mono">{inv.code}</span>
                </div>
                <div className="text-left font-mono font-bold text-emerald-700 text-xs shrink-0">
                  {inv.sellingPrice} ₪
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};
