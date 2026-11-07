import React, { useMemo } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { formatInvoiceCustomerDisplay } from '../utils/partyUtils';
import {
  TrendingUp,
  Printer,
  DollarSign,
  AlertTriangle,
  Clock,
  ArrowUpRight,
  ShoppingCart,
  Boxes,
  Users,
  CheckCircle,
  Plus
} from 'lucide-react';

export const DashboardView: React.FC = () => {
  const { stats, settings, printOrders, invoices, inventory, setActiveTab, setSelectedInvoiceForPrint, setSelectedJobForTicket, parties } = useAccounting();

  const inProgressJobs = (printOrders || []).filter(j => j && j.status !== 'delivered' && j.status !== 'cancelled').slice(0, 5);
  const recentInvoices = useMemo(() => {
    return [...(invoices || [])]
      .sort((a, b) => {
        const numA = parseInt((a.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
        const numB = parseInt((b.invoiceNumber || '').replace(/\D/g, ''), 10) || 0;
        if (numA !== numB) return numB - numA;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      })
      .slice(0, 5);
  }, [invoices]);
  const lowStockItems = (inventory || []).filter(i => i && i.category !== 'copy_scan' && (i.stockQuantity ?? 0) <= (i.minAlertQuantity ?? 0)).slice(0, 4);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'design':
        return { label: 'قيد التصميم', class: 'bg-blue-100 text-blue-700' };
      case 'pending_approval':
        return { label: 'بانتظار الاعتماد', class: 'bg-amber-100 text-amber-700' };
      case 'printing':
        return { label: 'قيد الطباعة', class: 'bg-indigo-100 text-indigo-700' };
      case 'finishing':
        return { label: 'تشطيب وقص', class: 'bg-purple-100 text-purple-700' };
      case 'ready':
        return { label: 'جاهز للتسليم', class: 'bg-emerald-100 text-emerald-700' };
      case 'delivered':
        return { label: 'تم التسليم', class: 'bg-slate-100 text-slate-700' };
      default:
        return { label: status, class: 'bg-slate-100 text-slate-700' };
    }
  };

  // Cash & Treasury summary calculations for the dark blue callout
  const totalInflows = stats.totalTreasuriesBalance || (stats.cashBalance + stats.bankBalance);
  const totalOutflows = stats.supplierPayables;
  const netPosition = totalInflows - totalOutflows;

  return (
    <div className="space-y-4">
      {/* 4-Column KPI Section */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Revenue */}
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-400 font-light font-bold uppercase">إجمالي مبيعات وإيرادات النشاط</p>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">مكتمل</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 font-mono">
            {stats.totalRevenue.toLocaleString('ar-SA')} <span className="text-xs text-slate-400 font-normal">{settings.currency}</span>
          </h2>
          <p className="text-[10px] text-emerald-600 mt-2 font-medium">
            مبيعات المكتبة: {stats.bookstoreRevenue.toLocaleString('ar-SA')} • مطبعة: {stats.printRevenue.toLocaleString('ar-SA')}
          </p>
        </div>

        {/* Print Orders In Progress */}
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-400 font-light font-bold uppercase">طلبات وأوامر قيد التشغيل</p>
            <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded font-bold">نشط</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 font-mono">
            {stats.pendingPrintJobs} <span className="text-xs text-slate-400 font-normal">أمر ورشة</span>
          </h2>
          <p className="text-[10px] text-amber-600 mt-2 font-medium">
            متابعة صالة الماكينات والقص والسلوفان
          </p>
        </div>

        {/* Paper & Raw Material Stock */}
        <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-400 font-light font-bold uppercase">حالة المخزون والخامات</p>
            {stats.lowStockCount > 0 ? (
              <span className="text-[10px] bg-rose-50 text-rose-700 px-1.5 py-0.5 rounded font-bold">{stats.lowStockCount} نواقص</span>
            ) : (
              <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">كافي</span>
            )}
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1 font-mono">
            {inventory.length} <span className="text-xs text-slate-400 font-normal">صنف مسجل</span>
          </h2>
          <p className={`text-[10px] mt-2 font-medium ${stats.lowStockCount > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
            {stats.lowStockCount > 0 ? `تحذير: ${stats.lowStockCount} صنف تحت حد الطلب` : 'كافة أرصدة المخزون ضمن حد الأمان'}
          </p>
        </div>

        {/* Treasuries Liquidity Balance */}
        <div
          onClick={() => setActiveTab('treasuries')}
          className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-xs hover:border-emerald-400 transition-colors cursor-pointer group"
        >
          <div className="flex items-center justify-between">
            <p className="text-[10px] text-slate-400 font-light font-bold uppercase group-hover:text-emerald-700 transition-colors">
              الخزنات والسيولة النقدية والبنكية
            </p>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-bold">
              {stats.treasuriesCount || 4} صناديق
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-emerald-700 mt-1 font-mono">
            {totalInflows.toLocaleString('ar-SA')} <span className="text-xs text-slate-400 font-normal">{settings.currency}</span>
          </h2>
          <p className="text-[9px] text-slate-400 font-light mt-2 font-medium">
            كاش: {stats.cashBalance.toLocaleString('ar-SA')} • بنك وتطبيقات: {stats.bankBalance.toLocaleString('ar-SA')} {settings.currency}
          </p>
        </div>
      </section>

      {/* 12-Column Main High Density Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-3.5">
        {/* Left 8 Cols: Active Production & Sales Table */}
        <div className="lg:col-span-8 bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col overflow-hidden">
          <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm">🖨️</span>
              <h3 className="text-xs font-bold text-slate-800">أحدث طلبات الطباعة والمبيعات</h3>
            </div>
            <button
              onClick={() => setActiveTab('print_orders')}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
            >
              عرض الكل &larr;
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-500 sticky top-0 border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-2.5 font-semibold">رقم العملية</th>
                  <th className="p-2.5 font-semibold">العميل</th>
                  <th className="p-2.5 font-semibold">البيان والمواصفات</th>
                  <th className="p-2.5 font-semibold text-center">الحالة</th>
                  <th className="p-2.5 font-semibold text-left">المبلغ ({settings.currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inProgressJobs.map(job => {
                  const badge = getStatusBadge(job.status);
                  return (
                    <tr key={job.id} className="hover:bg-slate-50 transition-colors">
                      <td className="p-2.5 font-mono font-bold text-blue-600">
                        {job.orderNumber}
                      </td>
                      <td className="p-2.5 font-medium text-slate-800">
                        {job.customerName}
                      </td>
                      <td className="p-2.5 text-slate-600">
                        <span className="font-semibold text-slate-800">{job.title}</span>
                        <span className="text-[11px] text-slate-400 block">{job.paperType} • {job.quantity.toLocaleString('ar-SA')} نسخة</span>
                      </td>
                      <td className="p-2.5 text-center">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${badge.class}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="p-2.5 text-left font-mono font-bold text-slate-900">
                        {job.totalPrice.toLocaleString('ar-SA')}
                      </td>
                    </tr>
                  );
                })}

                {recentInvoices.map((inv, idx) => (
                  <tr key={`dash-inv-${inv.id || idx}-${idx}`} className="hover:bg-slate-50 transition-colors">
                    <td className="p-2.5 font-mono font-bold text-slate-600">
                      {inv.invoiceNumber}
                    </td>
                    <td className="p-2.5 font-medium text-slate-800" title={formatInvoiceCustomerDisplay(inv, parties)}>
                      {formatInvoiceCustomerDisplay(inv, parties)}
                    </td>
                    <td className="p-2.5 text-slate-600">
                      فاتورة نقطة بيع ({inv.paymentMethod === 'cash' ? 'نقدي' : (inv.paymentMethod === 'card' || inv.paymentMethod === 'bank_transfer') ? (inv.paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : 'شبكة مدى') : 'آجل'})
                    </td>
                    <td className="p-2.5 text-center">
                      <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full text-[10px] font-medium">
                        تم التسليم
                      </span>
                    </td>
                    <td className="p-2.5 text-left font-mono font-bold text-slate-900">
                      {(inv.totalAmount || 0).toLocaleString('ar-SA')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right 4 Cols: Low Stock Alerts + Dark Blue Cash Callout */}
        <div className="lg:col-span-4 flex flex-col gap-3.5">
          {/* Low Stock Panel */}
          <div className="bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                <h3 className="text-xs font-bold text-slate-800">تنبيهات المخزون المنخفض</h3>
              </div>
              <button
                onClick={() => setActiveTab('inventory')}
                className="text-[11px] text-blue-600 hover:text-blue-800 font-medium cursor-pointer"
              >
                جرد المخزن
              </button>
            </div>

            <div className="p-3 space-y-2.5 overflow-auto">
              {lowStockItems.length === 0 ? (
                <p className="text-xs text-slate-400 py-3 text-center">المخزون متوفر بنسب ممتازة</p>
              ) : (
                lowStockItems.map((item, idx) => (
                  <div key={`dash-low-${item.id || idx}-${idx}`} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0 last:pb-0">
                    <div>
                      <p className="text-xs font-bold text-slate-800">{item.name}</p>
                      <p className="text-[9px] text-slate-400 font-light">
                        المتبقي: <strong className="text-rose-600 font-mono">{item.stockQuantity} {item.unit}</strong> فقط
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('purchases')}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded text-[10px] font-medium transition-colors cursor-pointer"
                    >
                      طلب شراء
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* High Density Dark Blue Box: Daily Cash Position */}
          <div className="bg-blue-900 rounded-lg p-3.5 text-white shadow-xs">
            <h3 className="text-xs font-bold mb-2 flex items-center justify-between">
              <span>موقف الصندوق والسيولة اليوم</span>
              <span className="text-[10px] bg-blue-800 px-1.5 py-0.5 rounded text-blue-200 font-mono">LIVE</span>
            </h3>

            <div className="flex justify-between items-end pt-1">
              <div>
                <p className="text-[10px] text-blue-200 uppercase">إجمالي السيولة المتاحة</p>
                <p className="text-lg font-bold font-mono text-white">
                  {totalInflows.toLocaleString('ar-SA')}
                </p>
              </div>
              <div className="text-left">
                <p className="text-[10px] text-blue-200 uppercase">مستحقات الموردين</p>
                <p className="text-lg font-bold font-mono text-rose-300">
                  ({totalOutflows.toLocaleString('ar-SA')})
                </p>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-blue-800 flex justify-between items-center">
              <span className="text-xs text-blue-200">الصافي الفعلي بعد الذمم:</span>
              <span className="text-xs font-bold font-mono text-emerald-400">
                {netPosition.toLocaleString('ar-SA')} {settings.currency}
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
