import React, { useState, useMemo } from 'react';
import { DateInput } from '../components/common/DateInput';
import {
  X,
  ClipboardList,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Scale,
  Calendar,
  Filter,
  Download,
  Printer,
  Search,
  CheckCircle2,
  Package,
  Layers,
  History,
  TrendingDown,
  TrendingUp,
  RotateCcw
} from 'lucide-react';
import { InventoryItem, StockMovement, StockMovementType, ItemCategory } from '../types';
import { useAccounting } from '../context/AccountingContext';
import { CATEGORY_DEFINITIONS } from '../utils/barcodeGenerator';
import { posSound } from '../utils/audio';
import { PrintHeader } from './common/PrintHeader';

interface StockMovementModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialItemId?: string | null;
  initialTab?: 'card' | 'adjust' | 'alerts';
}

export const StockMovementModal: React.FC<StockMovementModalProps> = ({
  isOpen,
  onClose,
  initialItemId,
  initialTab = 'card'
}) => {
  const {
    inventory,
    stockMovements,
    adjustStock,
    settings
  } = useAccounting();

  const [activeTab, setActiveTab] = useState<'card' | 'adjust' | 'alerts'>(initialTab);

  // Selected item for stock card or adjustment
  const [selectedItemId, setSelectedItemId] = useState<string>(
    initialItemId || (inventory[0]?.id || '')
  );
  const selectedItem = inventory.find(it => it.id === selectedItemId) || inventory[0];

  // Filters for stock ledger
  const [movementTypeFilter, setMovementTypeFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [searchNotes, setSearchNotes] = useState<string>('');

  // Adjustment Form State
  const [adjustCountedQty, setAdjustCountedQty] = useState<string>(
    selectedItem ? String(selectedItem.stockQuantity) : '0'
  );
  const [adjustReason, setAdjustReason] = useState<string>('فرق جرد دوري فعلي بالمستودع');
  const [adjustNotes, setAdjustNotes] = useState<string>('');
  const [adjustSuccess, setAdjustSuccess] = useState<boolean>(false);

  // Update adjustment counted input whenever selected item changes
  const handleSelectChange = (newId: string) => {
    setSelectedItemId(newId);
    const item = inventory.find(i => i.id === newId);
    if (item) {
      setAdjustCountedQty(String(item.stockQuantity));
    }
  };

  // Filtered movements for selected item
  const itemMovements = useMemo(() => {
    if (!selectedItem) return [];

    return stockMovements
      .filter(m => m.itemId === selectedItem.id)
      .filter(m => {
        if (movementTypeFilter === 'all') return true;
        if (movementTypeFilter === 'in') return m.type.startsWith('in_');
        if (movementTypeFilter === 'out') return m.type.startsWith('out_');
        return m.type === movementTypeFilter;
      })
      .filter(m => {
        if (startDate && m.date < startDate) return false;
        if (endDate && m.date > endDate) return false;
        return true;
      })
      .filter(m => {
        if (!searchNotes) return true;
        const q = searchNotes.toLowerCase();
        return (
          m.referenceNumber?.toLowerCase().includes(q) ||
          m.reason?.toLowerCase().includes(q) ||
          m.notes?.toLowerCase().includes(q) ||
          m.performedBy?.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => new Date(`${b.date} ${b.time || '00:00'}`).getTime() - new Date(`${a.date} ${a.time || '00:00'}`).getTime());
  }, [stockMovements, selectedItem, movementTypeFilter, startDate, endDate, searchNotes]);

  // Overall statistics for the selected item
  const stats = useMemo(() => {
    if (!selectedItem) {
      return { totalIn: 0, totalOut: 0, totalAdjustments: 0, isLowStock: false };
    }

    const allItemMoves = stockMovements.filter(m => m.itemId === selectedItem.id);
    const totalIn = allItemMoves
      .filter(m => m.type.startsWith('in_'))
      .reduce((sum, m) => sum + m.quantity, 0);

    const totalOut = allItemMoves
      .filter(m => m.type.startsWith('out_'))
      .reduce((sum, m) => sum + m.quantity, 0);

    const totalAdjustments = allItemMoves
      .filter(m => m.type === 'in_adjustment' || m.type === 'out_adjustment')
      .length;

    const isLowStock = selectedItem.category !== 'copy_scan' && selectedItem.stockQuantity <= selectedItem.minAlertQuantity;

    return {
      totalIn,
      totalOut,
      totalAdjustments,
      isLowStock
    };
  }, [stockMovements, selectedItem]);

  // Low stock items list across all inventory
  const lowStockItems = useMemo(() => {
    return inventory.filter(it => it.category !== 'copy_scan' && it.stockQuantity <= it.minAlertQuantity);
  }, [inventory]);

  if (!isOpen) return null;

  const currencySymbol = settings.currency || '₪';
  const categoryDef = selectedItem ? CATEGORY_DEFINITIONS[selectedItem.category] : null;

  // Calculate Adjustment Differences
  const currentSysQty = selectedItem?.stockQuantity || 0;
  const countedQtyNum = parseFloat(adjustCountedQty) || 0;
  const diffQty = countedQtyNum - currentSysQty;
  const diffType: 'surplus' | 'deficit' | 'matched' =
    diffQty > 0 ? 'surplus' : diffQty < 0 ? 'deficit' : 'matched';
  const diffVal = Math.abs(diffQty) * (selectedItem?.purchasePrice || 0);

  // Submit Adjustment
  const handleApplyAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    adjustStock(selectedItem.id, countedQtyNum, adjustReason, adjustNotes);
    posSound.playSuccessBeep();
    setAdjustSuccess(true);
    setTimeout(() => {
      setAdjustSuccess(false);
      setActiveTab('card');
    }, 1500);
  };

  // Export movement log to CSV
  const handleExportCSV = () => {
    if (!selectedItem || itemMovements.length === 0) return;

    const headers = [
      'التاريخ',
      'الوقت',
      'نوع الحركة',
      'رقم السند/المرجع',
      'وارد',
      'منصرف',
      'الرصيد بعد الحركة',
      'سعر الوحدة',
      'القيمة الإجمالية',
      'السبب والبيان',
      'الموظف المنفذ'
    ];

    const rows = itemMovements.map(m => {
      const isIncoming = m.type.startsWith('in_');
      return [
        m.date,
        m.time || '',
        formatMovementTypeName(m.type),
        m.referenceNumber || '',
        isIncoming ? m.quantity : '',
        !isIncoming ? m.quantity : '',
        m.balanceAfter,
        m.unitPrice || '',
        m.totalValue || '',
        `"${(m.reason || m.notes || '').replace(/"/g, '""')}"`,
        m.performedBy || ''
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_card_${selectedItem.code}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Print Stock Card
  const handlePrintCard = () => {
    posSound.playCashDrawer();
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] overflow-y-auto bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
      {/* Print only stock card A4 layout */}
      <div className="print-only hidden print:block">
        <style dangerouslySetInnerHTML={{
          __html: `
            @media print {
              body * { visibility: hidden !important; }
              .print-only, .print-only * { visibility: visible !important; }
              .print-only {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                display: block !important;
              }
              @page { size: A4 portrait; margin: 12mm; }
            }
          `
        }} />

        <div className="p-4 bg-white text-slate-950 font-sans" dir="rtl">
          {/* Header - يعتمد الهيدر الكامل أو الترويسة القياسية */}
          <PrintHeader
            title="كارتة حركة مخزون معتمدة"
            subtitle="Inventory Stock Card & Audit Movement Ledger"
            docNumber={selectedItem?.code}
            docDate={new Date().toLocaleDateString('ar-SA')}
            badge="كارتة مخزنية رسمية"
          />

          {/* Item details */}
          <div className="bg-slate-100 p-3 rounded-lg border border-slate-300 grid grid-cols-4 gap-2 mb-4 text-xs">
            <div>
              <span className="font-bold text-slate-500">اسم الصنف:</span>
              <div className="font-black text-sm">{selectedItem?.name}</div>
            </div>
            <div>
              <span className="font-bold text-slate-500">كود الصنف:</span>
              <div className="font-mono font-bold">{selectedItem?.code}</div>
            </div>
            <div>
              <span className="font-bold text-slate-500">الباركود:</span>
              <div className="font-mono font-bold">{selectedItem?.barcode || '-'}</div>
            </div>
            <div>
              <span className="font-bold text-slate-500">التصنيف:</span>
              <div className="font-bold">{categoryDef?.name}</div>
            </div>
            <div className="mt-1">
              <span className="font-bold text-slate-500">الرصيد الحالي:</span>
              <div className="font-black text-sm text-blue-700">{selectedItem?.stockQuantity} {selectedItem?.unit}</div>
            </div>
            <div className="mt-1">
              <span className="font-bold text-slate-500">حد الطلب:</span>
              <div className="font-bold text-amber-700">{selectedItem?.minAlertQuantity} {selectedItem?.unit}</div>
            </div>
            <div className="mt-1">
              <span className="font-bold text-slate-500">سعر التكلفة:</span>
              <div className="font-bold">{selectedItem?.purchasePrice?.toFixed(2)} {currencySymbol}</div>
            </div>
            <div className="mt-1">
              <span className="font-bold text-slate-500">سعر البيع:</span>
              <div className="font-bold">{selectedItem?.sellingPrice?.toFixed(2)} {currencySymbol}</div>
            </div>
          </div>

          {/* Table */}
          <table className="w-full border-collapse border border-slate-300 text-xs mb-6">
            <thead>
              <tr className="bg-slate-800 text-white">
                <th className="border border-slate-400 p-1.5 text-center">#</th>
                <th className="border border-slate-400 p-1.5 text-right">التاريخ</th>
                <th className="border border-slate-400 p-1.5 text-right">نوع الحركة</th>
                <th className="border border-slate-400 p-1.5 text-right">رقم المرجع</th>
                <th className="border border-slate-400 p-1.5 text-center">وارد (+)</th>
                <th className="border border-slate-400 p-1.5 text-center">منصرف (-)</th>
                <th className="border border-slate-400 p-1.5 text-center">الرصيد التراكمي</th>
                <th className="border border-slate-400 p-1.5 text-right">البيان والسبب</th>
              </tr>
            </thead>
            <tbody>
              {itemMovements.map((m, idx) => {
                const isIncoming = m.type.startsWith('in_');
                return (
                  <tr key={m.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="border border-slate-300 p-1.5 text-center font-mono">{idx + 1}</td>
                    <td className="border border-slate-300 p-1.5 text-right">{m.date} {m.time}</td>
                    <td className="border border-slate-300 p-1.5 text-right font-bold">{formatMovementTypeName(m.type)}</td>
                    <td className="border border-slate-300 p-1.5 text-right font-mono">{m.referenceNumber || '-'}</td>
                    <td className="border border-slate-300 p-1.5 text-center font-bold text-emerald-700">
                      {isIncoming ? `+${m.quantity}` : '-'}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-center font-bold text-rose-700">
                      {!isIncoming ? `-${m.quantity}` : '-'}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-center font-black bg-slate-100">
                      {m.balanceAfter}
                    </td>
                    <td className="border border-slate-300 p-1.5 text-right text-[11px]">{m.reason || m.notes || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Signatures */}
          <div className="grid grid-cols-3 gap-8 text-center text-xs pt-8 border-t border-slate-300 mt-8">
            <div>
              <p className="font-bold">أمين المستودع</p>
              <div className="mt-8 border-b border-dotted border-slate-400 w-32 mx-auto"></div>
            </div>
            <div>
              <p className="font-bold">المحاسب المالي</p>
              <div className="mt-8 border-b border-dotted border-slate-400 w-32 mx-auto"></div>
            </div>
            <div>
              <p className="font-bold">اعتماد الإدارة العامة</p>
              <div className="mt-8 border-b border-dotted border-slate-400 w-32 mx-auto"></div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Modal Container */}
      <div className="bg-white dark:bg-slate-900 w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between border-b border-indigo-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-600/30 rounded-xl border border-indigo-400/30">
              <ClipboardList className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-black flex items-center gap-2">
                كارتة حركة المخزون
                <span className="text-xs font-bold px-2 py-0.5 bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 rounded-full">
                  سجل الوارد والمنصرف والتسويات
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                تتبع حركات الأصناف، رصيد تراكمي لحظي، تسويات الجرد (عجز وزيادة)، وتنبيهات حد الطلب
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-xl text-white/80 hover:text-white transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/80 px-6 gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('card')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'card'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            كارتة حركة الصنف (سجل الحركات)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('adjust')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'adjust'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <Scale className="w-4 h-4" />
            تسوية مخزنية (عجز وزيادة)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className={`py-3 px-4 text-xs font-bold border-b-2 flex items-center gap-2 transition ${
              activeTab === 'alerts'
                ? 'border-rose-600 text-rose-600 dark:text-rose-400 bg-white dark:bg-slate-800'
                : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            تنبيهات حد الطلب
            {lowStockItems.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-black bg-rose-500 text-white rounded-full">
                {lowStockItems.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body Container */}
        <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* TAB 1: Stock Movement Card */}
          {activeTab === 'card' && (
            <div className="space-y-5">
              {/* Item Selector & KPI Overview Header */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {/* Item Select */}
                <div className="md:col-span-5 space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-indigo-600" />
                    الصنف المعروض:
                  </label>
                  <select
                    value={selectedItemId}
                    onChange={e => handleSelectChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    {inventory.map((item, idx) => (
                      <option key={`stk-mv-opt-${item.id || idx}-${idx}`} value={item.id}>
                        [{item.code}] - {item.name} (رصيد: {item.stockQuantity} {item.unit})
                      </option>
                    ))}
                  </select>
                </div>

                {/* KPI Metrics */}
                <div className="md:col-span-7 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {/* Current stock */}
                  <div className={`p-3 rounded-xl border flex flex-col justify-center text-center ${
                    stats.isLowStock
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200'
                      : 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-900 text-indigo-800 dark:text-indigo-200'
                  }`}>
                    <div className="text-[11px] font-bold opacity-80">الرصيد الحالي</div>
                    <div className="text-xl font-black mt-0.5">
                      {selectedItem?.stockQuantity} <span className="text-xs font-normal">{selectedItem?.unit}</span>
                    </div>
                  </div>

                  {/* Reorder limit */}
                  <div className="p-3 rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 flex flex-col justify-center text-center">
                    <div className="text-[11px] font-bold opacity-80">حد الطلب</div>
                    <div className="text-xl font-black mt-0.5">
                      {selectedItem?.minAlertQuantity} <span className="text-xs font-normal">{selectedItem?.unit}</span>
                    </div>
                  </div>

                  {/* Total Incoming */}
                  <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 flex flex-col justify-center text-center">
                    <div className="text-[11px] font-bold opacity-80 flex items-center justify-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      إجمالي الوارد
                    </div>
                    <div className="text-xl font-black mt-0.5">
                      +{stats.totalIn}
                    </div>
                  </div>

                  {/* Total Outgoing */}
                  <div className="p-3 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 flex flex-col justify-center text-center">
                    <div className="text-[11px] font-bold opacity-80 flex items-center justify-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" />
                      إجمالي المنصرف
                    </div>
                    <div className="text-xl font-black mt-0.5">
                      -{stats.totalOut}
                    </div>
                  </div>
                </div>
              </div>

              {/* Low stock alert banner */}
              {stats.isLowStock && (
                <div className="p-3.5 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800 rounded-xl flex items-center justify-between gap-3 text-rose-900 dark:text-rose-200">
                  <div className="flex items-center gap-2 text-xs font-bold">
                    <AlertTriangle className="w-5 h-5 text-rose-600 flex-shrink-0" />
                    <span>
                      تنبيه حد الطلب: رصيد هذا الصنف ({selectedItem?.stockQuantity} {selectedItem?.unit}) وصل أو قل عن حد الأمان المطلوب ({selectedItem?.minAlertQuantity} {selectedItem?.unit}).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveTab('adjust')}
                    className="px-3 py-1 text-xs font-black bg-rose-600 hover:bg-rose-700 text-white rounded-lg whitespace-nowrap transition"
                  >
                    تسوية جرد
                  </button>
                </div>
              )}

              {/* Ledger Filters Bar */}
              <div className="bg-slate-50 dark:bg-slate-800/60 p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-700 dark:text-slate-300">
                    <Filter className="w-3.5 h-3.5 text-indigo-600" />
                    تصفية الحركات:
                  </div>

                  <select
                    value={movementTypeFilter}
                    onChange={e => setMovementTypeFilter(e.target.value)}
                    className="px-2.5 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-semibold"
                  >
                    <option value="all">كل الحركات</option>
                    <option value="in">الوارد فقط (+)</option>
                    <option value="out">المنصرف فقط (-)</option>
                    <option value="in_purchase">وارد مشتريات</option>
                    <option value="out_sale">منصرف مبيعات كاشير</option>
                    <option value="out_print_job">منصرف أوامر شغل مطبعة</option>
                    <option value="in_adjustment">تسوية جرد (زيادة وفائض)</option>
                    <option value="out_adjustment">تسوية جرد (عجز وهالك)</option>
                    <option value="out_return">مردودات مشتريات</option>
                    <option value="in_opening">رصيد افتتاحي</option>
                  </select>

                  <div className="flex items-center gap-1 text-slate-500">
                    <Calendar className="w-3.5 h-3.5" />
                    من:
                    <DateInput value={startDate} onChange={e => setStartDate(e.target.value)}
                      className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                    />
                    إلى:
                    <DateInput value={endDate} onChange={e => setEndDate(e.target.value)}
                      className="px-2 py-1 rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white text-xs"
                    />
                  </div>
                </div>

                {/* Export & Print buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-700 hover:bg-slate-100 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-lg flex items-center gap-1.5 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    تصدير Excel/CSV
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintCard}
                    className="px-3 py-1.5 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm flex items-center gap-1.5 transition"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    طباعة كارتة الصنف A4
                  </button>
                </div>
              </div>

              {/* Movement Ledger Table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                      <tr>
                        <th className="p-3">التاريخ والوقت</th>
                        <th className="p-3">نوع الحركة</th>
                        <th className="p-3">رقم المرجع / السند</th>
                        <th className="p-3 text-center">وارد (+)</th>
                        <th className="p-3 text-center">منصرف (-)</th>
                        <th className="p-3 text-center bg-slate-200/50 dark:bg-slate-700/50">الرصيد بعد الحركة</th>
                        <th className="p-3">سعر الوحدة</th>
                        <th className="p-3">القيمة الإجمالية</th>
                        <th className="p-3">السبب والبيان</th>
                        <th className="p-3">الموظف المنفذ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                      {itemMovements.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="p-8 text-center text-slate-500 dark:text-slate-400">
                            لا توجد حركات مخزنية مسجلة لهذا الصنف تطابق معايير التصفية المحددة.
                          </td>
                        </tr>
                      ) : (
                        itemMovements.map(m => {
                          const isIncoming = m.type.startsWith('in_');
                          const badge = getMovementBadge(m.type);

                          return (
                            <tr
                              key={m.id}
                              className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition font-medium"
                            >
                              <td className="p-3 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                <div>{m.date}</div>
                                {m.time && <div className="text-[10px] text-slate-400">{m.time}</div>}
                              </td>
                              <td className="p-3">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold ${badge.bg} ${badge.color}`}>
                                  {badge.icon}
                                  {badge.label}
                                </span>
                              </td>
                              <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-300">
                                {m.referenceNumber || '-'}
                              </td>
                              <td className="p-3 text-center font-black text-emerald-600 dark:text-emerald-400">
                                {isIncoming ? `+${m.quantity}` : '-'}
                              </td>
                              <td className="p-3 text-center font-black text-rose-600 dark:text-rose-400">
                                {!isIncoming ? `-${m.quantity}` : '-'}
                              </td>
                              <td className="p-3 text-center font-black bg-slate-50 dark:bg-slate-800/40 text-slate-900 dark:text-white">
                                {m.balanceAfter} <span className="text-[10px] font-normal text-slate-400">{selectedItem?.unit}</span>
                              </td>
                              <td className="p-3 font-mono text-slate-600 dark:text-slate-400">
                                {m.unitPrice !== undefined ? `${m.unitPrice.toFixed(2)} ${currencySymbol}` : '-'}
                              </td>
                              <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                                {m.totalValue !== undefined ? `${m.totalValue.toFixed(2)} ${currencySymbol}` : '-'}
                              </td>
                              <td className="p-3 max-w-xs text-slate-700 dark:text-slate-300">
                                <div className="font-semibold">{m.reason || '-'}</div>
                                {m.notes && <div className="text-[11px] text-slate-400 mt-0.5">{m.notes}</div>}
                              </td>
                              <td className="p-3 text-slate-500 text-xs">
                                {m.performedBy || 'المسؤول'}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Stock Adjustment Form (عجز وزيادة) */}
          {activeTab === 'adjust' && (
            <div className="max-w-2xl mx-auto space-y-5">
              <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                <h3 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                  <Scale className="w-5 h-5 text-indigo-600" />
                  تسوية الجرد المخزني (إثبات العجز أو الزيادة)
                </h3>
                <p className="text-[10px] text-slate-400 font-light mt-1">
                  تتيح هذه الشاشة تسجيل الفارق بين الرصيد الدفتري المسجل بالنظام والرصيد الفعلي بالجرد، مع توثيق السبب وإدراج الحركة في كارتة الصنف فوراً.
                </p>
              </div>

              <form onSubmit={handleApplyAdjustment} className="space-y-4">
                {/* Item selection */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    الصنف المراد تسويته:
                  </label>
                  <select
                    value={selectedItemId}
                    onChange={e => handleSelectChange(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500"
                  >
                    {inventory.map((item, idx) => (
                      <option key={`stk-adj-opt-${item.id || idx}-${idx}`} value={item.id}>
                        [{item.code}] - {item.name} (الرصيد الدفتري الحالي: {item.stockQuantity} {item.unit})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Stock comparison cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-center border border-slate-200 dark:border-slate-700">
                    <div className="text-[10px] text-slate-400 font-light font-bold">الرصيد الدفتري الحالي</div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                      {currentSysQty} <span className="text-xs font-normal">{selectedItem?.unit}</span>
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-center border border-blue-200 dark:border-blue-900">
                    <div className="text-xs text-blue-700 dark:text-blue-300 font-bold">الكمية الفعلية بالجرد</div>
                    <div className="mt-1">
                      <input
                        type="number"
                        step="any"
                        value={adjustCountedQty}
                        onChange={e => setAdjustCountedQty(e.target.value)}
                        className="w-28 px-2 py-1 text-xl font-black text-center rounded-lg border border-blue-400 bg-white dark:bg-slate-900 text-blue-700 dark:text-blue-300 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Difference card */}
                  <div className={`p-3 rounded-xl text-center border ${
                    diffType === 'deficit'
                      ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200'
                      : diffType === 'surplus'
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300'
                  }`}>
                    <div className="text-xs font-bold">
                      {diffType === 'deficit' ? 'عجز مخزني (نقص)' : diffType === 'surplus' ? 'زيادة مخزنية (فائض)' : 'مطابق تماماً'}
                    </div>
                    <div className="text-2xl font-black mt-1">
                      {diffQty > 0 ? `+${diffQty}` : diffQty} <span className="text-xs font-normal">{selectedItem?.unit}</span>
                    </div>
                    {diffQty !== 0 && (
                      <div className="text-[11px] font-semibold mt-0.5 opacity-90">
                        القيمة: {diffVal.toFixed(2)} {currencySymbol}
                      </div>
                    )}
                  </div>
                </div>

                {/* Reason selector */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    سبب ومبرر التسوية:
                  </label>
                  <select
                    value={adjustReason}
                    onChange={e => setAdjustReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
                  >
                    <option value="فرق جرد دوري فعلي بالمستودع">فرق جرد دوري فعلي بالمستودع</option>
                    <option value="تالف وهالك تشغيل تجارب ضبط ماكينات المطبعة">تالف وهالك تشغيل تجارب ضبط ماكينات المطبعة</option>
                    <option value="عينات ترويجية ونماذج عرض للعملاء">عينات ترويجية ونماذج عرض للعملاء</option>
                    <option value="بضاعة تالفة بسبب سوء التخزين أو النقل">بضاعة تالفة بسبب سوء التخزين أو النقل</option>
                    <option value="فائض غير مقيد من طلبيات سابقة">فائض غير مقيد من طلبيات سابقة</option>
                    <option value="تسوية رصيد افتتاحي مدور">تسوية رصيد افتتاحي مدور</option>
                    <option value="أخرى (تحدد في الملاحظات)">أخرى (تحدد في الملاحظات)</option>
                  </select>
                </div>

                {/* Extra Notes */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                    ملاحظات وتفاصيل إضافية:
                  </label>
                  <textarea
                    rows={2}
                    value={adjustNotes}
                    onChange={e => setAdjustNotes(e.target.value)}
                    placeholder="أي ملاحظات تخص محضر الجرد أو رقم القرار..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                  />
                </div>

                {/* Action button */}
                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={diffQty === 0}
                    className={`w-full py-3 px-4 rounded-xl text-xs font-black text-white shadow-md flex items-center justify-center gap-2 transition ${
                      diffQty === 0
                        ? 'bg-slate-400 cursor-not-allowed'
                        : 'bg-indigo-600 hover:bg-indigo-700'
                    }`}
                  >
                    {adjustSuccess ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-yellow-300" />
                        تم ترحيل التسوية وتحديث كارتة الصنف بنجاح!
                      </>
                    ) : (
                      <>
                        <Scale className="w-4 h-4" />
                        اعتماد وترحيل التسوية المخزنية فوراً
                      </>
                    )}
                  </button>
                  {diffQty === 0 && (
                    <p className="text-[11px] text-center text-slate-500 mt-1.5">
                      الكمية المدخلة مطابقة للرصيد المسجل، لا توجد فروقات للتسوية.
                    </p>
                  )}
                </div>
              </form>
            </div>
          )}

          {/* TAB 3: Low Stock Alerts (حد الطلب) */}
          {activeTab === 'alerts' && (
            <div className="space-y-4">
              <div className="bg-amber-50 dark:bg-amber-950/40 p-4 rounded-xl border border-amber-200 dark:border-amber-900 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-amber-900 dark:text-amber-200 flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    تقرير الأصناف الواصلة لحد الطلب أو النافذة
                  </h3>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                    إجمالي الأصناف الحرجة المطلوب إعادة طلبها: {lowStockItems.length} صنف
                  </p>
                </div>
              </div>

              {/* Low stock items table */}
              <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-sm">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">كود الصنف</th>
                      <th className="p-3">اسم الصنف</th>
                      <th className="p-3">التصنيف</th>
                      <th className="p-3 text-center">الرصيد المتوفر</th>
                      <th className="p-3 text-center">حد الطلب</th>
                      <th className="p-3 text-center">حالة النقص</th>
                      <th className="p-3 text-center">إجراءات سريعة</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {lowStockItems.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="p-8 text-center text-emerald-600 font-bold">
                          ممتاز! جميع الأصناف في المستودع فوق حد الطلب ولا توجد نواقص حرجة حالياً.
                        </td>
                      </tr>
                    ) : (
                      lowStockItems.map((item, idx) => {
                        const isZero = item.stockQuantity === 0;
                        const def = CATEGORY_DEFINITIONS[item.category];

                        return (
                          <tr key={`stk-low-${item.id || idx}-${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="p-3 font-mono font-bold text-slate-800 dark:text-slate-200">{item.code}</td>
                            <td className="p-3 font-bold text-slate-900 dark:text-white">{item.name}</td>
                            <td className="p-3 text-slate-600 dark:text-slate-400">{def?.name || item.category}</td>
                            <td className="p-3 text-center font-black text-rose-600">
                              {item.stockQuantity} {item.unit}
                            </td>
                            <td className="p-3 text-center font-bold text-amber-600">
                              {item.minAlertQuantity} {item.unit}
                            </td>
                            <td className="p-3 text-center">
                              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black ${
                                isZero
                                  ? 'bg-rose-600 text-white'
                                  : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300'
                              }`}>
                                {isZero ? 'نفد تماماً (صفر)' : 'تحت حد الأمان'}
                              </span>
                            </td>
                            <td className="p-3 text-center">
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedItemId(item.id);
                                  setActiveTab('card');
                                }}
                                className="px-3 py-1 text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 rounded-lg hover:bg-indigo-100 transition"
                              >
                                عرض الكارتة
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="text-[10px] text-slate-400 font-light">
            الصنف النشط: <span className="font-bold text-slate-700 dark:text-slate-300">{selectedItem?.name}</span> ({selectedItem?.code})
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper: Format Movement Type
function formatMovementTypeName(type: StockMovementType): string {
  switch (type) {
    case 'in_purchase':
      return 'وارد مشتريات وتوريد';
    case 'out_sale':
      return 'منصرف مبيعات كاشير';
    case 'out_print_job':
      return 'منصرف تشغيل أمر مطبعة';
    case 'in_adjustment':
      return 'تسوية جرد (زيادة وفائض)';
    case 'out_adjustment':
      return 'تسوية جرد (عجز وهالك)';
    case 'out_return':
      return 'مردودات مشتريات للمورد';
    case 'in_return':
      return 'مرتجع مبيعات من عميل';
    case 'in_opening':
      return 'رصيد افتتاحي مدور';
    case 'out_damaged':
      return 'هالك وتالف تشغيل';
    default:
      return type;
  }
}

// Helper: Get Badge colors & icon for each movement
function getMovementBadge(type: StockMovementType) {
  switch (type) {
    case 'in_purchase':
      return {
        label: 'وارد مشتريات',
        bg: 'bg-emerald-50 dark:bg-emerald-900/30',
        color: 'text-emerald-700 dark:text-emerald-300',
        icon: <ArrowDownLeft className="w-3 h-3 text-emerald-600" />
      };
    case 'out_sale':
      return {
        label: 'منصرف مبيعات',
        bg: 'bg-rose-50 dark:bg-rose-900/30',
        color: 'text-rose-700 dark:text-rose-300',
        icon: <ArrowUpRight className="w-3 h-3 text-rose-600" />
      };
    case 'out_print_job':
      return {
        label: 'منصرف تشغيل مطبعة',
        bg: 'bg-blue-50 dark:bg-blue-900/30',
        color: 'text-blue-700 dark:text-blue-300',
        icon: <Layers className="w-3 h-3 text-blue-600" />
      };
    case 'in_adjustment':
      return {
        label: 'تسوية (زيادة)',
        bg: 'bg-teal-50 dark:bg-teal-900/30',
        color: 'text-teal-700 dark:text-teal-300',
        icon: <Scale className="w-3 h-3 text-teal-600" />
      };
    case 'out_adjustment':
      return {
        label: 'تسوية (عجز)',
        bg: 'bg-amber-50 dark:bg-amber-950/40',
        color: 'text-amber-800 dark:text-amber-200',
        icon: <Scale className="w-3 h-3 text-amber-600" />
      };
    case 'out_return':
      return {
        label: 'مردود مشتريات',
        bg: 'bg-purple-50 dark:bg-purple-900/30',
        color: 'text-purple-700 dark:text-purple-300',
        icon: <RotateCcw className="w-3 h-3 text-purple-600" />
      };
    case 'in_opening':
      return {
        label: 'رصيد افتتاحي',
        bg: 'bg-slate-100 dark:bg-slate-800',
        color: 'text-slate-700 dark:text-slate-300',
        icon: <Package className="w-3 h-3" />
      };
    default:
      return {
        label: type,
        bg: 'bg-slate-100',
        color: 'text-slate-700',
        icon: null
      };
  }
}
