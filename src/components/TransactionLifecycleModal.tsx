import React, { useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Invoice } from '../types';
import {
  GitBranch,
  X,
  FileText,
  Package,
  User,
  Wallet,
  TrendingUp,
  BookOpen,
  BarChart3,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Printer,
  DollarSign,
  ShieldCheck,
  Building2,
  Layers,
  Sparkles,
  Receipt,
  Clock,
  ExternalLink,
  Truck
} from 'lucide-react';
import { formatInvoiceCustomerDisplay } from '../utils/partyUtils';

export const TransactionLifecycleModal: React.FC = () => {
  const {
    selectedInvoiceForLifecycle,
    setSelectedInvoiceForLifecycle,
    setSelectedInvoiceForPrint,
    setSelectedPartyForStatement,
    inventory,
    stockMovements,
    parties,
    treasuries,
    journalEntries,
    vouchers,
    settings
  } = useAccounting();

  const [activeStep, setActiveStep] = useState<number>(0);

  if (!selectedInvoiceForLifecycle) return null;
  const inv = selectedInvoiceForLifecycle;

  // 1. Identify Inventory movements related to this invoice
  const relatedMovements = stockMovements.filter(
    sm => sm.referenceNumber === inv.invoiceNumber || (sm.referenceType === 'pos_invoice' && sm.reason?.includes(inv.invoiceNumber))
  );

  // 2. Identify Customer details
  const customer = parties.find(p => p.id === inv.customerId);

  // 3. Identify Vouchers and Treasuries
  const relatedVouchers = vouchers.filter(
    v => (v.description && v.description.includes(inv.invoiceNumber)) || v.id === `vch-inv-${inv.id}` || v.voucherNumber === `RCT-INV-${inv.invoiceNumber.replace('INV-', '')}`
  );

  const relatedTreasuryCash = treasuries.find(t => t.accountCode === (inv as any).cashTreasuryCode || t.accountCode === '1101');
  const relatedTreasuryBank = treasuries.find(t => t.accountCode === (inv as any).bankTreasuryCode || t.accountCode === '1102');

  // 4. Identify Delivery Fee, COGS & Profit
  const isDeliveryItem = (item: any) =>
    item.itemId === 'srv-delivery' ||
    item.itemId === 'srv-delivery-mobile' ||
    item.barcode === 'DELIVERY' ||
    item.itemName === 'خدمة توصيل' ||
    item.itemName?.trim().startsWith('توصيل');

  const deliveryTotal = inv.items.reduce((sum, item) => {
    return sum + (isDeliveryItem(item) ? (item.total || item.unitPrice * item.quantity) : 0);
  }, 0);

  const totalCogsCalculated = inv.items.reduce((sum, item) => {
    if (isDeliveryItem(item)) return sum; // خدمة التوصيل لا تتطلب مخازن ولا تدخل في تكلفة البضاعة
    const matchedInvItem = inventory.find(i => i.id === item.itemId);
    const purchaseCost = matchedInvItem?.purchasePrice || (item as any).purchasePrice || 0;
    return sum + (purchaseCost * item.quantity);
  }, 0);

  const rawNet = inv.baseTotalAmount ? (inv.baseTotalAmount - inv.taxAmount) : (inv.subtotal - inv.discountTotal);
  // صافي إيراد المنشأة الفعلي يستثني خدمة التوصيل لأنها مستحقة لعامل التوصيل بالكامل دون أي مربح
  const netRevenue = Math.max(0, rawNet - deliveryTotal);
  const grossProfit = Math.max(0, netRevenue - totalCogsCalculated);
  const profitMargin = netRevenue > 0 ? ((grossProfit / netRevenue) * 100).toFixed(1) : '0';

  // 5. Identify Journal entries
  const relatedJournalEntries = journalEntries.filter(
    je => je.referenceId === inv.id || je.description?.includes(inv.invoiceNumber)
  );

  const steps = [
    {
      id: 0,
      title: 'الفاتورة',
      label: '1. الفاتورة',
      subtitle: 'تسجيل العملية وتفاصيل البيع',
      icon: FileText,
      badge: inv.invoiceNumber
    },
    {
      id: 1,
      title: 'المخزون',
      label: '2. المخزون',
      subtitle: 'خصم الأصناف وحركات الصرف',
      icon: Package,
      badge: `${inv.items.length} أصناف`
    },
    {
      id: 2,
      title: 'العميل',
      label: '3. العميل',
      subtitle: 'كشف الحساب والمديونية',
      icon: User,
      badge: inv.customerName
    },
    {
      id: 3,
      title: 'الصندوق/البنك',
      label: '4. الصندوق/البنك',
      subtitle: 'تحصيل النقد وسندات القبض',
      icon: Wallet,
      badge: `${(inv.paidAmount || 0).toLocaleString('ar-SA')} ${settings.currency}`
    },
    {
      id: 4,
      title: 'تكلفة المبيعات',
      label: '5. تكلفة المبيعات',
      subtitle: 'احتساب التكلفة ومجمل الربح',
      icon: TrendingUp,
      badge: `${grossProfit.toLocaleString('ar-SA')} ${settings.currency} ربح`
    },
    {
      id: 5,
      title: 'الحسابات',
      label: '6. الحسابات',
      subtitle: 'القيود المزدوجة المتوازنة',
      icon: BookOpen,
      badge: `${relatedJournalEntries.length} قيد آلي`
    },
    {
      id: 6,
      title: 'التقارير',
      label: '7. التقارير',
      subtitle: 'القوائم المالية والضريبية',
      icon: BarChart3,
      badge: 'محدثة لحظياً'
    }
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-5xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 flex items-center justify-center">
              <GitBranch className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold">مسار الحركة المحاسبية الآلية الموحدة للعملية</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>دورة آلية كاملة (7 مراحل)</span>
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                فاتورة رقم: <strong className="text-white font-mono">{inv.invoiceNumber}</strong> | التاريخ: {inv.date} | العميل: <strong className="text-white">{formatInvoiceCustomerDisplay(inv, parties)}</strong>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedInvoiceForPrint(inv);
              }}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>طباعة الفاتورة</span>
            </button>
            <button
              onClick={() => setSelectedInvoiceForLifecycle(null)}
              className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Stepper Pipeline Navigation */}
        <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 overflow-x-auto">
          <div className="flex items-center justify-between min-w-[720px] gap-1.5">
            {steps.map((step, idx) => {
              const Icon = step.icon;
              const isActive = activeStep === step.id;
              const isPast = activeStep > step.id;
              return (
                <React.Fragment key={step.id}>
                  <button
                    onClick={() => setActiveStep(step.id)}
                    className={`flex-1 flex flex-col items-center text-center p-2 rounded-xl transition-all cursor-pointer ${
                      isActive
                        ? 'bg-white shadow-xs border border-indigo-200 text-indigo-700'
                        : 'hover:bg-slate-100 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1">
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          isActive
                            ? 'bg-indigo-600 text-white'
                            : isPast
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                      </div>
                      <span className={`text-xs font-bold ${isActive ? 'text-indigo-900' : 'text-slate-700'}`}>
                        {step.title}
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-400 font-light truncate max-w-[110px]">
                      {step.badge}
                    </span>
                  </button>
                  {idx < steps.length - 1 && (
                    <ArrowLeft className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {/* Step Content Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* STEP 0: INVOICE */}
          {activeStep === 0 && (
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 p-3.5 rounded-xl flex items-start gap-3">
                <FileText className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <h4 className="font-bold text-blue-900 text-sm mb-0.5">المرحلة الأولى: تسجيل الفاتورة كمدخل وحيد للعملية</h4>
                  <p className="text-blue-700">
                    تم إدخال الفاتورة وتثبيت بنودها وأسعارها وضريبتها مرة واحدة، لتنطلق منها تلقائياً كافة قيود وحركات باقي الأقسام دون أي تدخل يدوي إضافي.
                  </p>
                </div>
              </div>

              {/* Invoice Summary Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block mb-1">المجموع قبل الضريبة</span>
                  <strong className="text-slate-900 font-mono text-sm">
                    {((inv.subtotal || 0) - (inv.discountTotal || 0)).toLocaleString('ar-SA')} {settings.currency}
                  </strong>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block mb-1">ضريبة القيمة المضافة ({inv.taxRate || settings.vatRate}%)</span>
                  <strong className="text-slate-900 font-mono text-sm">
                    {(inv.taxAmount || 0).toLocaleString('ar-SA')} {settings.currency}
                  </strong>
                </div>
                <div className="bg-indigo-50 p-3 rounded-xl border border-indigo-200">
                  <span className="text-indigo-600 block mb-1 font-semibold">إجمالي الفاتورة النهائي</span>
                  <strong className="text-indigo-950 font-mono text-base font-black">
                    {(inv.totalAmount || 0).toLocaleString('ar-SA')} {settings.currency}
                  </strong>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                  <span className="text-emerald-600 block mb-1 font-semibold">المبلغ المسدد / المدفوع</span>
                  <strong className="text-emerald-950 font-mono text-base font-black">
                    {(inv.paidAmount || 0).toLocaleString('ar-SA')} {settings.currency}
                  </strong>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 font-bold text-xs text-slate-800 flex justify-between items-center">
                  <span>الأصناف والخدمات في الفاتورة ({inv.items.length})</span>
                  <span className="text-[10px] text-slate-400 font-light">طريقة الدفع: {inv.paymentMethod === 'cash' ? 'نقدي' : (inv.paymentMethod === 'card' || inv.paymentMethod === 'bank_transfer') ? (inv.paymentMethod === 'bank_transfer' ? 'بنكي' : 'شبكة') : 'آجل'}</span>
                </div>
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-100 text-slate-600 font-semibold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">الصنف</th>
                      <th className="p-2.5 text-center">الكمية</th>
                      <th className="p-2.5">سعر الوحدة</th>
                      <th className="p-2.5">الخصم</th>
                      <th className="p-2.5">الضريبة</th>
                      <th className="p-2.5 font-bold">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {inv.items.map((it, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="p-2.5 text-slate-400 font-mono">{idx + 1}</td>
                        <td className="p-2.5 font-bold text-slate-900">
                          {it.itemName}
                          {it.length && it.width && (it.length !== 1 || it.width !== 1) ? (
                            <span className="text-[10px] text-indigo-600 font-normal mr-2">
                              ({it.length} م × {it.width} م)
                            </span>
                          ) : null}
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-indigo-600">{it.quantity}</td>
                        <td className="p-2.5 font-mono">{it.unitPrice.toLocaleString('ar-SA')} {settings.currency}</td>
                        <td className="p-2.5 font-mono text-slate-500">{it.discount ? it.discount.toLocaleString('ar-SA') : '0'}</td>
                        <td className="p-2.5 font-mono text-slate-500">{it.tax.toLocaleString('ar-SA')}</td>
                        <td className="p-2.5 font-mono font-bold text-slate-900">{it.total.toLocaleString('ar-SA')} {settings.currency}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 1: INVENTORY */}
          {activeStep === 1 && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-xl flex items-start gap-3">
                <Package className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <h4 className="font-bold text-emerald-900 text-sm mb-0.5">المرحلة الثانية: الخصم التلقائي من المخزون وكارت الصنف</h4>
                  <p className="text-emerald-700">
                    تم تخفيض أرصدة الأصناف المباعة فورياً من المستودع، وتسجيل حركة صرف مخزنية معتمدة من نوع (out_sale) لكل صنف لحفظ الرصيد قبل وبعد البيع.
                  </p>
                </div>
              </div>

              {relatedMovements.length > 0 ? (
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-right text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-3">كود وحركة الصنف</th>
                        <th className="p-3 text-center">الرصيد قبل</th>
                        <th className="p-3 text-center text-rose-600">الكمية المصروفة</th>
                        <th className="p-3 text-center text-emerald-600">الرصيد بعد</th>
                        <th className="p-3">سعر تكلفة الشراء</th>
                        <th className="p-3">إجمالي التكلفة المخزنية</th>
                        <th className="p-3">تاريخ ووقت الحركة</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {relatedMovements.map((mov, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="p-3">
                            <strong className="block text-slate-900 font-bold">{mov.itemName}</strong>
                            <span className="text-[11px] text-slate-400 font-mono">{mov.itemCode}</span>
                          </td>
                          <td className="p-3 text-center font-mono text-slate-600">{mov.balanceBefore}</td>
                          <td className="p-3 text-center font-mono font-black text-rose-600">-{mov.quantity}</td>
                          <td className="p-3 text-center font-mono font-bold text-emerald-700 bg-emerald-50/50">{mov.balanceAfter}</td>
                          <td className="p-3 font-mono text-slate-700">{mov.unitPrice.toLocaleString('ar-SA')} {settings.currency}</td>
                          <td className="p-3 font-mono font-bold text-slate-900">{mov.totalValue.toLocaleString('ar-SA')} {settings.currency}</td>
                          <td className="p-3 text-[10px] text-slate-400 font-light">{mov.date} {mov.time}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center text-[10px] text-slate-400 font-light">
                  الأصناف المشتملة في هذه الفاتورة خدمات رقمية أو تصوير فوري بدون خصم مخزني فيزيائي.
                </div>
              )}
            </div>
          )}

          {/* STEP 2: CUSTOMER */}
          {activeStep === 2 && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 p-3.5 rounded-xl flex items-start gap-3">
                <User className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <h4 className="font-bold text-indigo-900 text-sm mb-0.5">المرحلة الثالثة: التأثير التلقائي على حساب العميل وكشف الحساب</h4>
                  <p className="text-indigo-700">
                    تم قيد الفاتورة كسحوبات في كشف حساب العميل، وإذا كان هناك سداد فوري تم قيده كمقبوضات، وتحديث الرصيد التراكمي ومطابقته مع السقف الائتماني.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block mb-1">العميل المقيد</span>
                  <strong className="text-slate-900 text-sm font-bold block">{formatInvoiceCustomerDisplay(inv, parties)}</strong>
                  {customer && (
                    <span className="text-[10px] text-slate-400 font-light block mt-1">
                      هاتف: {customer.phone || 'غير مسجل'}
                    </span>
                  )}
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block mb-1">الحركة المالية للعملية</span>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-600">سحوبات الفاتورة (مدين):</span>
                      <strong className="font-mono text-rose-600">+{(inv.totalAmount || 0).toLocaleString('ar-SA')}</strong>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-600">المسدد فوراً (دائن):</span>
                      <strong className="font-mono text-emerald-600">-{(inv.paidAmount || 0).toLocaleString('ar-SA')}</strong>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-200 font-bold">
                      <span className="text-slate-800">الأثر الصافي على المديونية:</span>
                      <span className="font-mono text-indigo-700">
                        +{((inv.totalAmount - (inv.paidAmount || 0))).toLocaleString('ar-SA')} {settings.currency}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block mb-1">الرصيد الإجمالي الحالي للعميل</span>
                  <strong className="text-slate-900 font-mono text-lg font-black block">
                    {customer ? customer.balance.toLocaleString('ar-SA') : '0.00'} {settings.currency}
                  </strong>
                  {customer && customer.creditLimit ? (
                    <div className="mt-2 text-[11px]">
                      <span className="text-slate-500">السقف الائتماني: </span>
                      <strong className="font-mono text-slate-700">{customer.creditLimit.toLocaleString('ar-SA')} {settings.currency}</strong>
                      {customer.balance > customer.creditLimit ? (
                        <span className="block text-rose-600 font-bold mt-0.5">⚠️ تجاوز السقف الائتماني المسموح</span>
                      ) : (
                        <span className="block text-emerald-600 font-bold mt-0.5">✓ ضمن الحدود الائتمانية الآمنة</span>
                      )}
                    </div>
                  ) : null}
                </div>
              </div>

              {customer && (
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setSelectedPartyForStatement(customer);
                    }}
                    className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>عرض كشف الحساب التفصيلي المعتمد للعميل ({customer.name})</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* STEP 3: TREASURY / BANK */}
          {activeStep === 3 && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 p-3.5 rounded-xl flex items-start gap-3">
                <Wallet className="w-5 h-5 text-amber-700 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <h4 className="font-bold text-amber-900 text-sm mb-0.5">المرحلة الرابعة: إيداع النقد بالخزينة/البنك وإنشاء سند القبض</h4>
                  <p className="text-amber-800">
                    تم ترحيل المبلغ المسدد فورياً إلى رصيد الصندوق النقدي أو الحساب البنكي المختار، وتوليد سند قبض رسمي آلي يحمل رقم الفاتورة للتوثيق المالي.
                  </p>
                </div>
              </div>

              {/* Treasury Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-bold">الخزينة النقدية أو البنكية المتأثرة</span>
                    <span className="text-[11px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded-md font-mono">
                      {(inv.paymentMethod === 'card' || inv.paymentMethod === 'bank_transfer') ? '1102 - بنك/شبكة' : '1101 - الصندوق النقدي'}
                    </span>
                  </div>
                  <div className="text-sm font-bold text-slate-900">
                    {(inv.paymentMethod === 'card' || inv.paymentMethod === 'bank_transfer') ? (relatedTreasuryBank?.name || 'الحساب البنكي / الشبكة') : (relatedTreasuryCash?.name || 'الصندوق النقدي (الكاشير)')}
                  </div>
                  <div className="text-xs text-slate-600 flex justify-between border-t border-slate-200 pt-2">
                    <span>المبلغ المودع بالخزينة:</span>
                    <strong className="font-mono text-emerald-700 text-sm">
                      +{(inv.paidAmount || 0).toLocaleString('ar-SA')} {settings.currency}
                    </strong>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                  <span className="text-slate-500 font-bold block">سند القبض الرسمي المنشأ آلياً</span>
                  {relatedVouchers.length > 0 ? (
                    <div>
                      <strong className="font-mono text-indigo-700 text-sm block font-bold">
                        {relatedVouchers[0].voucherNumber}
                      </strong>
                      <p className="text-xs text-slate-600 mt-1">
                        {relatedVouchers[0].description}
                      </p>
                      <span className="inline-block mt-2 text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-0.5 rounded-full font-bold">
                        ✓ سند مقيد في دفتر سندات القبض
                      </span>
                    </div>
                  ) : (
                    <div>
                      <span className="font-mono text-indigo-700 text-sm block font-bold">
                        RCT-INV-{inv.invoiceNumber.replace('INV-', '')}
                      </span>
                      <span className="text-[10px] text-slate-400 font-light">
                        سند قبض فوري مقيد لحساب الفاتورة
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: COGS & PROFIT */}
          {activeStep === 4 && (
            <div className="space-y-4">
              <div className="bg-violet-50 border border-violet-200 p-3.5 rounded-xl flex items-start gap-3">
                <TrendingUp className="w-5 h-5 text-violet-600 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <h4 className="font-bold text-violet-900 text-sm mb-0.5">المرحلة الخامسة: احتساب تكلفة البضاعة المباعة (COGS) ومجمل الربح</h4>
                  <p className="text-violet-700">
                    طبقاً لمعايير المحاسبة الدولية ونظام الجرد المستمر (Perpetual Inventory System)، يتم احتساب تكلفة شراء الأصناف المباعة لحظياً وطرحها من المبيعات لبيان مجمل الربح بدقة.
                  </p>
                </div>
              </div>

              {/* Profit Analysis Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <span className="text-slate-500 block mb-1">صافي إيراد مبيعات المنشأة</span>
                  <strong className="text-slate-900 font-mono text-base font-black">
                    {netRevenue.toLocaleString('ar-SA')} {settings.currency}
                  </strong>
                </div>

                <div className="bg-rose-50 p-3.5 rounded-xl border border-rose-200">
                  <span className="text-rose-600 block mb-1 font-semibold">تكلفة البضاعة المباعة (COGS)</span>
                  <strong className="text-rose-950 font-mono text-base font-black">
                    {totalCogsCalculated.toLocaleString('ar-SA')} {settings.currency}
                  </strong>
                </div>

                <div className="bg-emerald-50 p-3.5 rounded-xl border border-emerald-200">
                  <span className="text-emerald-600 block mb-1 font-semibold">مجمل الربح المحقق</span>
                  <strong className="text-emerald-950 font-mono text-base font-black">
                    {grossProfit.toLocaleString('ar-SA')} {settings.currency}
                  </strong>
                </div>

                <div className="bg-indigo-50 p-3.5 rounded-xl border border-indigo-200">
                  <span className="text-indigo-600 block mb-1 font-semibold">هامش مجمل الربح</span>
                  <strong className="text-indigo-950 font-mono text-base font-black">
                    {profitMargin}%
                  </strong>
                </div>
              </div>

              {deliveryTotal > 0 && (
                <div className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-xl flex items-center justify-between text-xs text-emerald-950">
                  <div className="flex items-center gap-2">
                    <Truck className="w-4 h-4 text-emerald-700 shrink-0" />
                    <div>
                      <span className="font-bold">خدمة توصيل مضافة: </span>
                      <span className="font-mono font-black text-emerald-800">{deliveryTotal.toLocaleString('ar-SA')} {settings.currency}</span>
                    </div>
                  </div>
                  <span className="text-[11px] text-emerald-800 bg-white/80 border border-emerald-300 px-2 py-0.5 rounded-md font-semibold">
                    خدمة صفرية الربح ولا أثر مخزني لها (مستحقات وسيطة لعامل التوصيل)
                  </span>
                </div>
              )}

              {/* Accounting Entry for COGS */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 font-bold text-slate-700">
                  الأثر المحاسبي لتكلفة المبيعات في شجرة الحسابات
                </div>
                <div className="p-3.5 space-y-2">
                  <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div>
                      <span className="font-mono font-bold text-indigo-700 ml-2">5101</span>
                      <span className="font-bold text-slate-900">تكلفة مبيعات القرطاسية والكتب (مصروفات تشغيلية)</span>
                    </div>
                    <span className="font-mono font-bold text-rose-700">+ {totalCogsCalculated.toLocaleString('ar-SA')} {settings.currency} (مدين)</span>
                  </div>
                  <div className="flex justify-between items-center bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    <div>
                      <span className="font-mono font-bold text-indigo-700 ml-2">1301</span>
                      <span className="font-bold text-slate-900">مخزون الكتب والقرطاسية (أصول متداولة)</span>
                    </div>
                    <span className="font-mono font-bold text-emerald-700">- {totalCogsCalculated.toLocaleString('ar-SA')} {settings.currency} (دائن)</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: GENERAL LEDGER ACCOUNTS */}
          {activeStep === 5 && (
            <div className="space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 p-3.5 rounded-xl flex items-start gap-3">
                <BookOpen className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <h4 className="font-bold text-indigo-900 text-sm mb-0.5">المرحلة السادسة: الترحيل الآلي المزدوج لدفتر اليومية العامة</h4>
                  <p className="text-indigo-700">
                    توليد وترحيل القيود المحاسبية التلقائية المزدوجة المتوازنة (Debits = Credits) وضبط موازين المراجعة والأستاذ العام لحظياً.
                  </p>
                </div>
              </div>

              {relatedJournalEntries.length > 0 ? (
                <div className="space-y-3">
                  {relatedJournalEntries.map((je, idx) => {
                    const totalDebit = je.lines.reduce((s, l) => s + l.debit, 0);
                    const totalCredit = je.lines.reduce((s, l) => s + l.credit, 0);
                    const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

                    return (
                      <div key={idx} className="border border-slate-200 rounded-xl overflow-hidden">
                        <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex justify-between items-center text-xs">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-indigo-700">{je.entryNumber}</span>
                            <span className="text-slate-600">| {je.description}</span>
                          </div>
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${isBalanced ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}`}>
                            {isBalanced ? '✓ قيد متوازن 100%' : 'غير متوازن'}
                          </span>
                        </div>

                        <table className="w-full text-right text-xs">
                          <thead className="bg-slate-100/70 text-slate-600 font-semibold border-b border-slate-200">
                            <tr>
                              <th className="p-2.5">رقم الحساب</th>
                              <th className="p-2.5">اسم الحساب في الدليل</th>
                              <th className="p-2.5">البيان والشرح</th>
                              <th className="p-2.5 text-center font-mono">مدين (Debit)</th>
                              <th className="p-2.5 text-center font-mono">دائن (Credit)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {je.lines.map((line, lIdx) => (
                              <tr key={lIdx} className="hover:bg-slate-50/80">
                                <td className="p-2.5 font-mono font-bold text-indigo-700">{line.accountCode}</td>
                                <td className="p-2.5 font-bold text-slate-900">{line.accountName}</td>
                                <td className="p-2.5 text-slate-500 text-[11px]">{line.description || je.description}</td>
                                <td className="p-2.5 text-center font-mono font-bold text-slate-800">
                                  {line.debit > 0 ? `${line.debit.toLocaleString('ar-SA')} ${settings.currency}` : '-'}
                                </td>
                                <td className="p-2.5 text-center font-mono font-bold text-slate-800">
                                  {line.credit > 0 ? `${line.credit.toLocaleString('ar-SA')} ${settings.currency}` : '-'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                            <tr>
                              <td colSpan={3} className="p-2.5 text-left text-slate-700">إجمالي القيد المحاسبي:</td>
                              <td className="p-2.5 text-center font-mono text-indigo-700">{totalDebit.toLocaleString('ar-SA')} {settings.currency}</td>
                              <td className="p-2.5 text-center font-mono text-indigo-700">{totalCredit.toLocaleString('ar-SA')} {settings.currency}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-6 bg-slate-50 rounded-xl border border-slate-200 text-center text-[10px] text-slate-400 font-light">
                  يتم إرفاق القيود التلقائية لدفتر اليومية فور حفظ الفاتورة.
                </div>
              )}
            </div>
          )}

          {/* STEP 6: FINANCIAL REPORTS */}
          {activeStep === 6 && (
            <div className="space-y-4">
              <div className="bg-teal-50 border border-teal-200 p-3.5 rounded-xl flex items-start gap-3">
                <BarChart3 className="w-5 h-5 text-teal-700 mt-0.5 shrink-0" />
                <div className="text-xs">
                  <h4 className="font-bold text-teal-900 text-sm mb-0.5">المرحلة السابعة: الانعكاس اللحظي في التقارير والقوائم الختامية</h4>
                  <p className="text-teal-800">
                    تنعكس العملية فوراً وبشكل تلقائي 100% في قائمة الدخل والميزانية العمومية والإقرار الضريبي دون الحاجة لأي ترحيل يدوي أو إعادة احتساب.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 text-xs">
                {/* Income statement */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold border-b border-slate-200 pb-2">
                    <TrendingUp className="w-4 h-4 text-indigo-600" />
                    <span>قائمة الدخل (الأرباح والخسائر)</span>
                  </div>
                  <ul className="space-y-1.5 text-slate-600">
                    <li className="flex justify-between">
                      <span>إيرادات المبيعات:</span>
                      <strong className="text-emerald-600 font-mono">+{netRevenue.toLocaleString('ar-SA')}</strong>
                    </li>
                    <li className="flex justify-between">
                      <span>تكلفة المبيعات (COGS):</span>
                      <strong className="text-rose-600 font-mono">-{totalCogsCalculated.toLocaleString('ar-SA')}</strong>
                    </li>
                    <li className="flex justify-between pt-1 border-t border-slate-100 font-bold text-slate-900">
                      <span>أثر مجمل الربح:</span>
                      <strong className="text-indigo-600 font-mono">+{grossProfit.toLocaleString('ar-SA')}</strong>
                    </li>
                  </ul>
                </div>

                {/* Balance sheet */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold border-b border-slate-200 pb-2">
                    <Building2 className="w-4 h-4 text-emerald-600" />
                    <span>الميزانية العمومية (المركز المالي)</span>
                  </div>
                  <ul className="space-y-1.5 text-slate-600">
                    <li className="flex justify-between">
                      <span>النقدية / البنك (أصول):</span>
                      <strong className="text-emerald-600 font-mono">+{(inv.paidAmount || 0).toLocaleString('ar-SA')}</strong>
                    </li>
                    <li className="flex justify-between">
                      <span>الذمم المدينة (العملاء):</span>
                      <strong className="text-blue-600 font-mono">+{(inv.totalAmount - (inv.paidAmount || 0)).toLocaleString('ar-SA')}</strong>
                    </li>
                    <li className="flex justify-between">
                      <span>المخزون السلعي (أصول):</span>
                      <strong className="text-rose-600 font-mono">-{totalCogsCalculated.toLocaleString('ar-SA')}</strong>
                    </li>
                  </ul>
                </div>

                {/* Tax Return */}
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs space-y-2">
                  <div className="flex items-center gap-2 text-slate-900 font-bold border-b border-slate-200 pb-2">
                    <ShieldCheck className="w-4 h-4 text-amber-600" />
                    <span>الإقرار الضريبي المعتمد (VAT)</span>
                  </div>
                  <ul className="space-y-1.5 text-slate-600">
                    <li className="flex justify-between">
                      <span>وعاء المبيعات الخاضعة:</span>
                      <strong className="font-mono">{netRevenue.toLocaleString('ar-SA')}</strong>
                    </li>
                    <li className="flex justify-between">
                      <span>نسبة الضريبة:</span>
                      <strong className="font-mono">{inv.taxRate || settings.vatRate}%</strong>
                    </li>
                    <li className="flex justify-between pt-1 border-t border-slate-100 font-bold text-slate-900">
                      <span>ضريبة المخرجات المستحقة:</span>
                      <strong className="text-amber-600 font-mono">+{(inv.taxAmount || 0).toLocaleString('ar-SA')}</strong>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Navigation Controls */}
        <div className="bg-slate-50 border-t border-slate-200 p-4 flex items-center justify-between">
          <button
            onClick={() => setActiveStep(prev => Math.max(0, prev - 1))}
            disabled={activeStep === 0}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeStep === 0
                ? 'opacity-40 cursor-not-allowed bg-slate-200 text-slate-400'
                : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs'
            }`}
          >
            <ArrowRight className="w-4 h-4" />
            <span>المرحلة السابقة</span>
          </button>

          <div className="text-[10px] text-slate-400 font-light font-medium">
            المرحلة <strong className="text-slate-900 font-bold">{activeStep + 1}</strong> من <strong className="text-slate-900 font-bold">{steps.length}</strong>: {steps[activeStep].title}
          </div>

          <button
            onClick={() => setActiveStep(prev => Math.min(steps.length - 1, prev + 1))}
            disabled={activeStep === steps.length - 1}
            className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              activeStep === steps.length - 1
                ? 'opacity-40 cursor-not-allowed bg-slate-200 text-slate-400'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs'
            }`}
          >
            <span>المرحلة التالية</span>
            <ArrowLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
