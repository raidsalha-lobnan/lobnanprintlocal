import React, { useState, useMemo } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import { SalesReturn, SalesReturnItem } from '../types';
import { PrintHeader } from './common/PrintHeader';
import { AutocompleteCombobox } from './common/AutocompleteCombobox';
import {
  RotateCcw,
  Plus,
  Search,
  Calendar,
  User,
  FileText,
  Printer,
  Trash2,
  DollarSign,
  TrendingDown,
  CheckCircle2,
  AlertCircle,
  X,
  Package,
  Layers,
  ArrowDownLeft,
  Building2,
  Filter
} from 'lucide-react';
import { tafqeet } from '../utils/tafqeet';

export const SalesReturnsView: React.FC = () => {
  const {
    salesReturns,
    createSalesReturn,
    deleteSalesReturn,
    selectedSalesReturnForPrint,
    setSelectedSalesReturnForPrint,
    invoices,
    parties,
    inventory,
    treasuries,
    settings,
    currentUser
  } = useAccounting();

  // Search and filter
  const [searchQuery, setSearchQuery] = useState('');
  const [settlementFilter, setSettlementFilter] = useState<'all' | 'credit_balance' | 'cash_refund' | 'bank_refund'>('all');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  // Modal: New Return
  const [showNewReturnModal, setShowNewReturnModal] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [returnDate, setReturnDate] = useState(new Date().toISOString().split('T')[0]);
  const [settlementType, setSettlementType] = useState<'credit_balance' | 'cash_refund' | 'bank_refund'>('credit_balance');
  const [treasuryCode, setTreasuryCode] = useState('1101');
  const [returnNotes, setReturnNotes] = useState('');

  // Return items list
  const [itemsToReturn, setItemsToReturn] = useState<SalesReturnItem[]>([]);

  // Manual item addition (for direct returns)
  const [manualItemId, setManualItemId] = useState('');
  const [manualQty, setManualQty] = useState<number | ''>(1);
  const [manualPrice, setManualPrice] = useState<number | ''>('');
  const [manualReason, setManualReason] = useState('إرجاع بضاعة معيبة / غير مطابقة');

  // Customer filter for parties
  const customers = useMemo(() => {
    return parties.filter(p => p.type === 'customer' || p.type === 'both');
  }, [parties]);

  // Invoices for selected customer
  const customerInvoices = useMemo(() => {
    if (!selectedCustomerId) return [];
    return invoices.filter(inv => inv.customerPartyId === selectedCustomerId || inv.customerId === selectedCustomerId);
  }, [invoices, selectedCustomerId]);

  // Handle selecting an invoice: auto-populate return items
  const handleSelectInvoice = (invId: string) => {
    setSelectedInvoiceId(invId);
    if (!invId) {
      setItemsToReturn([]);
      return;
    }
    const inv = invoices.find(i => i.id === invId);
    if (!inv || !inv.items) return;

    const initialItems: SalesReturnItem[] = inv.items.map(item => ({
      itemId: item.itemId || item.id,
      itemName: item.description || item.itemName || 'صنف',
      quantity: 1, // default 1, user can adjust
      unitPrice: item.unitPrice,
      total: item.unitPrice * 1,
      reason: 'طلب العميل إرجاع البند'
    }));
    setItemsToReturn(initialItems);
  };

  // Totals for return modal
  const returnSubtotal = useMemo(() => {
    return itemsToReturn.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  }, [itemsToReturn]);

  const taxRate = settings.taxRate ?? 15;
  const returnTax = useMemo(() => {
    return Number((returnSubtotal * (taxRate / 100)).toFixed(2));
  }, [returnSubtotal, taxRate]);

  const returnTotal = returnSubtotal + returnTax;

  // Add manual item
  const handleAddManualItem = () => {
    if (!manualItemId || !manualQty || manualQty <= 0) return;
    const invItem = inventory.find(i => i.id === manualItemId);
    if (!invItem) return;

    const price = typeof manualPrice === 'number' && manualPrice >= 0 ? manualPrice : invItem.price;
    const newItem: SalesReturnItem = {
      itemId: invItem.id,
      itemName: invItem.name,
      quantity: Number(manualQty),
      unitPrice: price,
      total: Number(manualQty) * price,
      reason: manualReason
    };

    setItemsToReturn(prev => [...prev, newItem]);
    setManualItemId('');
    setManualQty(1);
    setManualPrice('');
  };

  const handleRemoveItem = (index: number) => {
    setItemsToReturn(prev => prev.filter((_, i) => i !== index));
  };

  const handleUpdateItemQty = (index: number, newQty: number) => {
    if (newQty < 0) return;
    setItemsToReturn(prev => prev.map((item, i) => {
      if (i === index) {
        return {
          ...item,
          quantity: newQty,
          total: Number((newQty * item.unitPrice).toFixed(2))
        };
      }
      return item;
    }));
  };

  // Submit return
  const handleCreateReturn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomerId) {
      alert('يرجى اختيار العميل أولاً');
      return;
    }
    if (itemsToReturn.length === 0 || returnTotal <= 0) {
      alert('يرجى إضافة بند واحد على الأقل للمرتجع بقيمة صالحة');
      return;
    }

    const customer = parties.find(p => p.id === selectedCustomerId);
    const selectedInv = invoices.find(i => i.id === selectedInvoiceId);

    const newReturn = createSalesReturn({
      date: returnDate,
      customerId: selectedCustomerId,
      customerName: customer?.name || 'عميل نقدي',
      invoiceId: selectedInvoiceId || undefined,
      invoiceNumber: selectedInv?.invoiceNumber || undefined,
      items: itemsToReturn.filter(i => i.quantity > 0),
      subtotal: returnSubtotal,
      taxRate,
      taxAmount: returnTax,
      totalAmount: returnTotal,
      settlementType,
      treasuryAccountCode: settlementType !== 'credit_balance' ? treasuryCode : undefined,
      notes: returnNotes
    });

    // Close and reset
    setShowNewReturnModal(false);
    setSelectedCustomerId('');
    setSelectedInvoiceId('');
    setItemsToReturn([]);
    setReturnNotes('');

    // Open print preview
    setSelectedSalesReturnForPrint(newReturn);
  };

  // Filtered sales returns
  const filteredReturns = useMemo(() => {
    return salesReturns.filter(ret => {
      if (settlementFilter !== 'all' && ret.settlementType !== settlementFilter) return false;
      if (fromDate && ret.date < fromDate) return false;
      if (toDate && ret.date > toDate) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchNum = ret.returnNumber.toLowerCase().includes(q);
        const matchCust = ret.customerName.toLowerCase().includes(q);
        const matchInv = ret.invoiceNumber && ret.invoiceNumber.toLowerCase().includes(q);
        const matchNote = ret.notes && ret.notes.toLowerCase().includes(q);
        if (!matchNum && !matchCust && !matchInv && !matchNote) return false;
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [salesReturns, settlementFilter, fromDate, toDate, searchQuery]);

  // Overall Statistics
  const totalReturnsCount = salesReturns.length;
  const totalReturnsAmount = salesReturns.reduce((sum, r) => sum + r.totalAmount, 0);
  const currentMonthReturns = salesReturns
    .filter(r => r.date.startsWith(new Date().toISOString().substring(0, 7)))
    .reduce((sum, r) => sum + r.totalAmount, 0);

  const cashRefundsTotal = salesReturns
    .filter(r => r.settlementType === 'cash_refund' || r.settlementType === 'bank_refund')
    .reduce((sum, r) => sum + r.totalAmount, 0);

  const creditOffsetsTotal = salesReturns
    .filter(r => r.settlementType === 'credit_balance')
    .reduce((sum, r) => sum + r.totalAmount, 0);

  const getSettlementBadge = (type: string) => {
    switch (type) {
      case 'credit_balance':
        return <span className="bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded text-[11px] font-medium">رصيد دائن بالحساب</span>;
      case 'cash_refund':
        return <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium">استرداد نقدي فوري</span>;
      case 'bank_refund':
        return <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-0.5 rounded text-[11px] font-medium">تحويل بنكي</span>;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-5" dir="rtl">
      {/* Top Header & Action */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-rose-50 text-rose-600 rounded-lg">
              <RotateCcw className="w-5 h-5" />
            </span>
            <h1 className="text-xl font-bold text-slate-800">مرتجع فواتير المبيعات (إشعارات دائنة)</h1>
          </div>
          <p className="text-[10px] text-slate-400 font-light mt-1">
            إدارة مردودات المبيعات وإصدار الإشعارات الدائنة الضريبية وإرجاع الأصناف للمخزن مع تسوية حسابات العملاء والصندوق
          </p>
        </div>

        <button
          onClick={() => {
            setShowNewReturnModal(true);
            setItemsToReturn([]);
            setSelectedInvoiceId('');
            setSelectedCustomerId('');
          }}
          className="bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>تحرير مرتجع مبيعات جديد</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">إجمالي قيمة المرتجعات</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-rose-600">
              {totalReturnsAmount.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">{totalReturnsCount} إشعار مرتجع مسجل</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">مرتجعات الشهر الجاري</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-slate-800">
              {currentMonthReturns.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">تؤثر على صافي أرباح الشهر</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">تسويات أرصدة العملاء</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-blue-600">
              {creditOffsetsTotal.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">تخفيض ذمم مدينة للعملاء</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[10px] text-slate-400 font-light font-medium block">مبالغ مستردة نقدياً / بنكياً</span>
          <div className="flex items-baseline gap-2 mt-1">
            <strong className="text-xl font-mono font-bold text-emerald-600">
              {cashRefundsTotal.toLocaleString('ar-SA')}
            </strong>
            <span className="text-xs text-slate-400">{settings.currency}</span>
          </div>
          <span className="text-[10px] text-slate-400 mt-1 block">خرجت من الصندوق أو البنك</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-1 min-w-[260px]">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="بحث برقم المرتجع، العميل، رقم الفاتورة..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-3 pr-9 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <select
              value={settlementFilter}
              onChange={e => setSettlementFilter(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-700 focus:outline-none"
            >
              <option value="all">كل أنواع التسوية</option>
              <option value="credit_balance">رصيد دائن بالحساب</option>
              <option value="cash_refund">استرداد نقدي</option>
              <option value="bank_refund">تحويل بنكي</option>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="text-[11px] text-slate-400">من:</span>
          <DateInput value={fromDate} onChange={e => setFromDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
          />
          <span className="text-[11px] text-slate-400">إلى:</span>
          <DateInput value={toDate} onChange={e => setToDate(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
          />
          {(searchQuery || settlementFilter !== 'all' || fromDate || toDate) && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSettlementFilter('all');
                setFromDate('');
                setToDate('');
              }}
              className="text-rose-600 hover:text-rose-700 text-[11px] font-medium px-2 py-1"
            >
              إلغاء الفلاتر
            </button>
          )}
        </div>
      </div>

      {/* Returns Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-right text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
              <tr>
                <th className="p-3">رقم المرتجع</th>
                <th className="p-3">التاريخ</th>
                <th className="p-3">العميل</th>
                <th className="p-3">الفاتورة المرجعية</th>
                <th className="p-3">طريقة التسوية</th>
                <th className="p-3">عدد البنود</th>
                <th className="p-3">المجموع الصافي</th>
                <th className="p-3">الضريبة ({taxRate}%)</th>
                <th className="p-3">الإجمالي الشامل</th>
                <th className="p-3 text-center">الإجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-slate-700">
              {filteredReturns.length === 0 ? (
                <tr>
                  <td colSpan={10} className="p-8 text-center text-slate-400">
                    <RotateCcw className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="font-medium">لا توجد مرتجعات مبيعات مطابقة لمعايير البحث</p>
                  </td>
                </tr>
              ) : (
                filteredReturns.map((ret, idx) => (
                  <tr key={`sret-${ret.id || idx}-${idx}`} className="hover:bg-slate-50/70 transition-colors">
                    <td className="p-3 font-mono font-bold text-rose-600">
                      {ret.returnNumber}
                    </td>
                    <td className="p-3 text-slate-600">{ret.date}</td>
                    <td className="p-3 font-semibold text-slate-800">{ret.customerName}</td>
                    <td className="p-3">
                      {ret.invoiceNumber ? (
                        <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                          {ret.invoiceNumber}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">مرتجع بضاعة مباشر</span>
                      )}
                    </td>
                    <td className="p-3">{getSettlementBadge(ret.settlementType)}</td>
                    <td className="p-3 text-slate-600">{ret.items?.length || 0} بند</td>
                    <td className="p-3 font-mono">{ret.subtotal.toLocaleString('ar-SA')} {settings.currency}</td>
                    <td className="p-3 font-mono text-slate-500">{ret.taxAmount.toLocaleString('ar-SA')} {settings.currency}</td>
                    <td className="p-3 font-mono font-bold text-slate-900 text-sm">
                      {ret.totalAmount.toLocaleString('ar-SA')} {settings.currency}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => setSelectedSalesReturnForPrint(ret)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-colors cursor-pointer"
                          title="طباعة إشعار دائن ضريبي معتمد"
                        >
                          <Printer className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (window.confirm(`هل أنت متأكد من حذف إشعار المرتجع ${ret.returnNumber}؟`)) {
                              deleteSalesReturn(ret.id);
                            }
                          }}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                          title="حذف المرتجع"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* MODAL: CREATE SALES RETURN */}
      {showNewReturnModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-3 text-slate-800 text-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-rose-700 to-rose-900 text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <RotateCcw className="w-5 h-5 text-rose-300" />
                <div>
                  <h3 className="font-bold text-sm">تحرير مرتجع فواتير مبيعات (إشعار دائن ضريبي)</h3>
                  <p className="text-[11px] text-rose-200">إرجاع البضائع للمخزن وعكس الضريبة وتسوية حساب العميل</p>
                </div>
              </div>
              <button
                onClick={() => setShowNewReturnModal(false)}
                className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleCreateReturn} className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Row 1: Customer & Reference Invoice */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="flex flex-col">
                  <label className="block text-slate-700 font-semibold mb-1">العميل المسترجع منه: *</label>
                  <AutocompleteCombobox
                    items={customers.map(c => ({
                      id: c.id,
                      name: c.name,
                      code: c.code,
                      badge: `رصيد: ${c.balance} ${settings.currency}`
                    }))}
                    selectedId={selectedCustomerId}
                    value={customers.find(c => c.id === selectedCustomerId)?.name || ''}
                    entityType="customer"
                    placeholder="ابحث عن العميل..."
                    onSelect={(opt) => {
                      setSelectedCustomerId(opt.id);
                      setSelectedInvoiceId('');
                      setItemsToReturn([]);
                    }}
                    required={true}
                    className="flex-1"
                    inputClassName="p-2"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">الفاتورة المرجعية (اختياري):</label>
                  <select
                    value={selectedInvoiceId}
                    onChange={e => handleSelectInvoice(e.target.value)}
                    disabled={!selectedCustomerId}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-rose-500 disabled:bg-slate-100"
                  >
                    <option value="">-- مرتجع بضاعة مباشر بدون فاتورة --</option>
                    {customerInvoices.map((inv, idx) => (
                      <option key={`ret-inv-opt-${inv.id || idx}-${idx}`} value={inv.id}>
                        فاتورة #{inv.invoiceNumber} بتاريخ {inv.date} (إجمالي: {inv.totalAmount || (inv as any).total} {settings.currency})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">تاريخ المرتجع: *</label>
                  <DateInput value={returnDate} onChange={e => setReturnDate(e.target.value)}
                    required
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                    <Package className="w-4 h-4 text-rose-600" />
                    <span>البنود والأصناف المرتجعة</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-light">
                    ستعاد هذه الكميات تلقائياً إلى المخزن عند اعتماد المرتجع
                  </span>
                </div>

                {/* Items Table */}
                {itemsToReturn.length > 0 ? (
                  <div className="overflow-x-auto bg-white rounded-lg border border-slate-200">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100/70 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="p-2.5 w-10 text-center font-bold text-slate-800">م</th>
                          <th className="p-2.5">اسم الصنف</th>
                          <th className="p-2.5 w-24">الكمية المرتجعة</th>
                          <th className="p-2.5 w-24">سعر الوحدة</th>
                          <th className="p-2.5 w-28">المجموع</th>
                          <th className="p-2.5">سبب الإرجاع</th>
                          <th className="p-2.5 w-12 text-center">حذف</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {itemsToReturn.map((item, idx) => (
                          <tr key={idx} className="hover:bg-slate-50">
                            <td className="p-2.5 text-center font-mono font-bold text-slate-700">{idx + 1}</td>
                            <td className="p-2.5 font-semibold text-slate-800">{item.itemName}</td>
                            <td className="p-2.5">
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={item.quantity}
                                onChange={e => handleUpdateItemQty(idx, Number(e.target.value))}
                                className="w-20 p-1 border border-slate-200 rounded text-center font-mono"
                              />
                            </td>
                            <td className="p-2.5 font-mono">{item.unitPrice} {settings.currency}</td>
                            <td className="p-2.5 font-mono font-bold text-rose-600">
                              {(item.quantity * item.unitPrice).toFixed(2)} {settings.currency}
                            </td>
                            <td className="p-2.5">
                              <input
                                type="text"
                                value={item.reason || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setItemsToReturn(prev => prev.map((it, i) => i === idx ? { ...it, reason: val } : it));
                                }}
                                placeholder="سبب إرجاع الصنف..."
                                className="w-full p-1 border border-slate-200 rounded text-[11px]"
                              />
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(idx)}
                                className="text-rose-500 hover:text-rose-700 p-1"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-4 text-slate-400 bg-white rounded-lg border border-dashed border-slate-200">
                    <p>لم يتم تحديد أي بنود مرتجعة بعد. اختر فاتورة أو أضف أصنافاً يدوياً أدناه.</p>
                  </div>
                )}

                {/* Add Manual Item from Inventory */}
                <div className="bg-white p-3 rounded-lg border border-slate-200 flex flex-wrap items-end gap-2 text-xs">
                  <div className="flex-1 min-w-[180px]">
                    <label className="block text-slate-600 mb-1 text-[11px]">إضافة صنف من المخزن مباشرة:</label>
                    <select
                      value={manualItemId}
                      onChange={e => {
                        setManualItemId(e.target.value);
                        const it = inventory.find(i => i.id === e.target.value);
                        if (it) setManualPrice(it.price);
                      }}
                      className="w-full p-1.5 border border-slate-200 rounded text-xs"
                    >
                      <option value="">-- اختر صنفاً للإرجاع --</option>
                      {inventory.map((item, idx) => (
                        <option key={`ret-item-opt-${item.id || idx}-${idx}`} value={item.id}>
                          {item.name} ({item.stockQuantity} بالمخزن) - سعر: {item.price} {settings.currency}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="w-20">
                    <label className="block text-slate-600 mb-1 text-[11px]">الكمية:</label>
                    <input
                      type="number"
                      min="1"
                      value={manualQty}
                      onChange={e => setManualQty(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full p-1.5 border border-slate-200 rounded text-center font-mono"
                    />
                  </div>

                  <div className="w-24">
                    <label className="block text-slate-600 mb-1 text-[11px]">سعر الوحدة:</label>
                    <input
                      type="number"
                      step="0.01"
                      value={manualPrice}
                      onChange={e => setManualPrice(e.target.value === '' ? '' : Number(e.target.value))}
                      placeholder="السعر"
                      className="w-full p-1.5 border border-slate-200 rounded text-center font-mono"
                    />
                  </div>

                  <div className="flex-1 min-w-[160px]">
                    <label className="block text-slate-600 mb-1 text-[11px]">السبب:</label>
                    <input
                      type="text"
                      value={manualReason}
                      onChange={e => setManualReason(e.target.value)}
                      className="w-full p-1.5 border border-slate-200 rounded text-xs"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handleAddManualItem}
                    disabled={!manualItemId}
                    className="bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white px-3 py-1.5 rounded text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة بند</span>
                  </button>
                </div>
              </div>

              {/* Settlement and Financial Summary */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Settlement Method */}
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                  <h4 className="font-bold text-slate-800 text-xs">طريقة تسوية المرتجع المالي</h4>
                  
                  <div className="space-y-2">
                    <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                      <input
                        type="radio"
                        name="settlementType"
                        checked={settlementType === 'credit_balance'}
                        onChange={() => setSettlementType('credit_balance')}
                        className="text-rose-600 focus:ring-rose-500"
                      />
                      <div>
                        <span className="font-semibold text-slate-800 block">رصيد دائن في حساب العميل</span>
                        <span className="text-[10px] text-slate-400 font-light block">يتم خصم المبلغ من مديونية العميل كإشعار دائن رسمي</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                      <input
                        type="radio"
                        name="settlementType"
                        checked={settlementType === 'cash_refund'}
                        onChange={() => setSettlementType('cash_refund')}
                        className="text-rose-600 focus:ring-rose-500"
                      />
                      <div>
                        <span className="font-semibold text-slate-800 block">استرداد نقدي فوري من الصندوق (الكاشير)</span>
                        <span className="text-[10px] text-slate-400 font-light block">يتم صرف المبلغ نقداً للعميل وخصمه من رصيد الصندوق</span>
                      </div>
                    </label>

                    <label className="flex items-center gap-2 p-2 bg-white rounded-lg border border-slate-200 cursor-pointer">
                      <input
                        type="radio"
                        name="settlementType"
                        checked={settlementType === 'bank_refund'}
                        onChange={() => setSettlementType('bank_refund')}
                        className="text-rose-600 focus:ring-rose-500"
                      />
                      <div>
                        <span className="font-semibold text-slate-800 block">تحويل بنكي مسترد</span>
                        <span className="text-[10px] text-slate-400 font-light block">يتم خصم المبلغ من الحساب البنكي وتحويله لحساب العميل</span>
                      </div>
                    </label>
                  </div>

                  {settlementType !== 'credit_balance' && (
                    <div className="pt-2">
                      <label className="block text-slate-700 font-semibold mb-1 text-[11px]">الصندوق / الحساب المودع منه:</label>
                      <select
                        value={treasuryCode}
                        onChange={e => setTreasuryCode(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                      >
                        {treasuries.map(t => (
                          <option key={t.id} value={t.accountCode}>
                            {t.name} (الرصيد: {t.balance.toLocaleString('ar-SA')} {settings.currency})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1 text-[11px]">ملاحظات وبيان المرتجع:</label>
                    <textarea
                      rows={2}
                      value={returnNotes}
                      onChange={e => setReturnNotes(e.target.value)}
                      placeholder="أسباب الإرجاع، كود أمر العمل، أو أي ملاحظات فنية..."
                      className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                </div>

                {/* Financial Totals */}
                <div className="bg-rose-50/50 p-4 rounded-xl border border-rose-200/80 flex flex-col justify-between space-y-3">
                  <h4 className="font-bold text-rose-950 text-xs">ملخص القيمة المالية للمرتجع</h4>
                  
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>المجموع الصافي الخاضع للضريبة:</span>
                      <span className="font-mono font-bold">{returnSubtotal.toLocaleString('ar-SA')} {settings.currency}</span>
                    </div>

                    <div className="flex justify-between text-slate-600">
                      <span>ضريبة القيمة المضافة ({taxRate}%):</span>
                      <span className="font-mono font-bold">{returnTax.toLocaleString('ar-SA')} {settings.currency}</span>
                    </div>

                    <div className="border-t border-rose-200 pt-2 flex justify-between items-baseline text-slate-900">
                      <span className="font-bold text-sm">الإجمالي الشامل للمرتجع:</span>
                      <span className="font-mono font-extrabold text-xl text-rose-700">
                        {returnTotal.toLocaleString('ar-SA')} {settings.currency}
                      </span>
                    </div>

                    <div className="text-[10px] text-slate-400 font-light pt-1">
                      {returnTotal > 0 ? tafqeet(returnTotal, settings.currency || 'ريال سعودي', 'هللة') : ''}
                    </div>
                  </div>

                  <div className="border-t border-rose-200/60 pt-3">
                    <button
                      type="submit"
                      disabled={itemsToReturn.length === 0 || returnTotal <= 0}
                      className="w-full bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>اعتماد المرتجع وإعادة الكميات للمخزن</span>
                    </button>
                  </div>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PRINT SALES RETURN / CREDIT NOTE */}
      {selectedSalesReturnForPrint && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto print:p-0 print:bg-white print:static print:h-auto">
          <div className="bg-white rounded-xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[92vh] print:max-h-none print:shadow-none print:border-none print:w-full">
            {/* Controls Bar (hidden during print) */}
            <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-rose-400" />
                <h3 className="font-bold text-sm">معاينة وطباعة إشعار دائن ضريبي (مرتجع مبيعات)</h3>
                <span className="font-mono text-xs bg-slate-800 text-slate-200 px-2 py-0.5 rounded border border-slate-700">
                  {selectedSalesReturnForPrint.returnNumber}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الإشعار</span>
                </button>
                <button
                  onClick={() => setSelectedSalesReturnForPrint(null)}
                  className="text-slate-400 hover:text-white p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Printable Document Sheet */}
            <div className="p-8 space-y-6 text-slate-800 print:p-6 overflow-y-auto font-sans" dir="rtl">
              {/* Header - يعتمد الهيدر الكامل المرفوع أو الترويسة القياسية */}
              <PrintHeader
                title="إشعار دائن ضريبي / مردودات مبيعات"
                subtitle="Tax Credit Note - Sales Return"
                docNumber={selectedSalesReturnForPrint.returnNumber}
                docDate={selectedSalesReturnForPrint.date}
                badge="إشعار دائن ضريبي معتمد"
              />

              {/* Customer and Reference Details */}
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-lg border border-slate-200 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">المستفيد / العميل:</span>
                  <strong className="text-slate-900 text-sm">{selectedSalesReturnForPrint.customerName}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">الفاتورة المرجعية:</span>
                  <strong className="text-slate-900 font-mono">
                    {selectedSalesReturnForPrint.invoiceNumber ? `#${selectedSalesReturnForPrint.invoiceNumber}` : 'مرتجع بضاعة مباشر'}
                  </strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">نوع تسوية الإرجاع:</span>
                  <span className="font-medium text-slate-800">
                    {selectedSalesReturnForPrint.settlementType === 'credit_balance'
                      ? 'قيد كرصيد دائن في حساب العميل'
                      : selectedSalesReturnForPrint.settlementType === 'cash_refund'
                      ? 'استرداد نقدي فوري'
                      : 'تحويل بنكي مسترد'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">الفرع والمستخدم:</span>
                  <span className="text-slate-700">{currentUser?.fullName || 'الكاشير'}</span>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">م</th>
                      <th className="p-2.5">الصنف / البيان المرتجع</th>
                      <th className="p-2.5 text-center">الكمية</th>
                      <th className="p-2.5 text-left">سعر الوحدة</th>
                      <th className="p-2.5 text-left">الإجمالي الصافي</th>
                      <th className="p-2.5">سبب الإرجاع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedSalesReturnForPrint.items?.map((it, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 text-slate-500 font-mono">{idx + 1}</td>
                        <td className="p-2.5 font-semibold text-slate-800">{it.itemName}</td>
                        <td className="p-2.5 text-center font-mono font-bold">{it.quantity}</td>
                        <td className="p-2.5 text-left font-mono">{it.unitPrice.toFixed(2)}</td>
                        <td className="p-2.5 text-left font-mono font-bold">{it.total.toFixed(2)}</td>
                        <td className="p-2.5 text-slate-500 text-[11px]">{it.reason || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Totals Summary */}
              <div className="flex justify-end">
                <div className="w-72 bg-slate-50 p-4 rounded-lg border border-slate-200 space-y-2 text-xs">
                  <div className="flex justify-between text-slate-600">
                    <span>المجموع الصافي:</span>
                    <span className="font-mono font-bold">{selectedSalesReturnForPrint.subtotal.toFixed(2)} {settings.currency}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>ضريبة القيمة المضافة ({selectedSalesReturnForPrint.taxRate}%):</span>
                    <span className="font-mono font-bold">{selectedSalesReturnForPrint.taxAmount.toFixed(2)} {settings.currency}</span>
                  </div>
                  <div className="border-t border-slate-300 pt-2 flex justify-between font-bold text-sm text-slate-900">
                    <span>الإجمالي المستحق للدائن:</span>
                    <span className="font-mono text-rose-700">{selectedSalesReturnForPrint.totalAmount.toFixed(2)} {settings.currency}</span>
                  </div>
                </div>
              </div>

              {/* Amount in Words */}
              <div className="bg-slate-50 p-2.5 rounded border border-slate-200 text-xs">
                <span className="text-slate-500">المبلغ كتابةً: </span>
                <strong className="text-slate-800">
                  {tafqeet(selectedSalesReturnForPrint.totalAmount, settings.currency || 'ريال سعودي', 'هللة')}
                </strong>
              </div>

              {/* Notes */}
              {selectedSalesReturnForPrint.notes && (
                <div className="text-xs text-slate-600">
                  <span className="font-semibold">ملاحظات: </span>
                  <span>{selectedSalesReturnForPrint.notes}</span>
                </div>
              )}

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-8 pt-8 text-center text-xs text-slate-600 border-t border-slate-200">
                <div>
                  <span className="block font-semibold mb-8">المحاسب / الكاشير</span>
                  <span className="border-t border-slate-400 block pt-1">التوقيع: .....................</span>
                </div>
                <div>
                  <span className="block font-semibold mb-8">أمين المستودع</span>
                  <span className="border-t border-slate-400 block pt-1">استلام البضاعة: .....................</span>
                </div>
                <div>
                  <span className="block font-semibold mb-8">العميل / المستلم</span>
                  <span className="border-t border-slate-400 block pt-1">التوقيع: .....................</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
