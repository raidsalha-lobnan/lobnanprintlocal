import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Party } from '../../types';
import { X, User, Receipt, Phone, MapPin, Printer, FileText, ArrowRight, Link as LinkIcon } from 'lucide-react';
import { PosCustomerSearchInput } from './PosCustomerSearchInput';
import { formatDateDisplay } from '../../utils/dateUtils';

interface CustomerLedgerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCustomer?: Party | null;
}

export const CustomerLedgerModal: React.FC<CustomerLedgerModalProps> = ({
  isOpen,
  onClose,
  currentCustomer
}) => {
  const { parties, invoices, setSelectedInvoiceForPrint, setSelectedPartyForStatement, settings } = useAccounting();
  // Main customers only - sub-customers are separated
  const customers = parties.filter(p => (p.type === 'customer' || p.type === 'both') && !p.isSubCustomer);

  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    currentCustomer?.id || (customers.length > 0 ? customers[0].id : '')
  );

  if (!isOpen) return null;

  const customer = parties.find(p => p.id === selectedCustomerId) || currentCustomer;
  const parentCustomer = customer?.parentPartyId ? parties.find(p => p.id === customer.parentPartyId) : null;
  const subCustomers = customer ? parties.filter(p => p.isSubCustomer && p.parentPartyId === customer.id && p.id !== customer.id) : [];

  // Invoices for this customer or sub-customer
  const customerInvoices = invoices.filter(inv => {
    if (!customer) return false;
    if (customer.isSubCustomer) {
      return (
        inv.subCustomerId === customer.id ||
        (inv.subCustomerName && inv.subCustomerName.trim().toLowerCase() === customer.name.trim().toLowerCase()) ||
        (inv.customCustomerText && inv.customCustomerText.toLowerCase().includes(customer.name.toLowerCase()))
      );
    }
    return inv.customerId === customer.id || inv.customerName === customer.name;
  });

  const totalBilled = customerInvoices.reduce((sum, inv) => sum + inv.totalAmount, 0);
  const totalPaid = customerInvoices.reduce((sum, inv) => sum + inv.paidAmount, 0);
  const calculatedRemaining = totalBilled - totalPaid;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden text-slate-800">
        {/* Header */}
        <div className="bg-blue-800 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-700 rounded-lg">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="font-bold text-sm">
                {customer?.isSubCustomer ? `كشف حساب زبون فرعي (${customer.name})` : 'كشف حساب وتعاملات العميل'}
              </h3>
              <p className="text-[11px] text-blue-200">
                {customer?.isSubCustomer && parentCustomer 
                  ? `زبون فرعي / دين مؤقت تابع للعميل الرئيسي: ${parentCustomer.name}`
                  : 'سجل الفواتير والمدفوعات والمستحقات'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-blue-200 hover:text-white p-1 rounded-lg hover:bg-blue-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Sub-Customer / Parent Link Banner */}
        {customer?.isSubCustomer && parentCustomer && (
          <div className="bg-amber-50 px-4 py-2 border-b border-amber-200 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2 text-amber-900 font-bold">
              <LinkIcon className="w-4 h-4 text-amber-600" />
              <span>هذا زبون فرعي متصل بالعميل الرئيسي:</span>
              <span className="font-bold text-blue-800 bg-white px-2 py-0.5 rounded border border-blue-200">
                {parentCustomer.name} ({parentCustomer.code})
              </span>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCustomerId(parentCustomer.id)}
              className="inline-flex items-center gap-1 text-blue-700 hover:text-blue-900 font-bold bg-blue-100/70 hover:bg-blue-200 px-2 py-0.5 rounded cursor-pointer transition-colors"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>الذهاب لكشف العميل الرئيسي</span>
            </button>
          </div>
        )}

        {/* Customer Selector & Profile Summary */}
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs">
          <div className="w-full sm:w-72">
            <label className="block font-bold text-slate-700 mb-1">ابحث واكتب اسم العميل أو الزبون الفرعي:</label>
            <PosCustomerSearchInput
              customers={customers}
              selectedCustomerId={selectedCustomerId}
              customerName={customer?.name || ''}
              customerCode={customer?.code}
              onSelectCustomer={c => setSelectedCustomerId(c.id)}
              onChangeCustomerName={() => {}}
              placeholder="ابحث بالاسم، الكود، أو الهاتف..."
            />
          </div>

          {customer && (
            <div className="flex flex-wrap items-center gap-4 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
              <div className="text-center px-2">
                <span className="text-[10px] text-slate-400 block">
                  {customer.isSubCustomer ? 'كود الزبون الفرعي' : 'الرقم التسلسلي'}
                </span>
                <span className="text-xs font-black font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 block">
                  {customer.code || (customer.isSubCustomer ? 'SUB-0001' : 'CUST-0000')}
                </span>
              </div>
              <div className="text-center px-2 border-r border-slate-200">
                <span className="text-[10px] text-slate-400 block">
                  {customer.isSubCustomer ? 'رصيد الزبون الفرعي' : 'الرصيد المستحق'}
                </span>
                <span className={`text-base font-black font-mono ${customer.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {customer.balance.toFixed(2)} {settings.currency}
                </span>
              </div>
              <div className="text-center px-2 border-r border-slate-200">
                <span className="text-[10px] text-slate-400 block">إجمالي المبيعات</span>
                <span className="text-xs font-bold font-mono text-slate-800">
                  {totalBilled.toFixed(2)} {settings.currency}
                </span>
              </div>
              <div className="text-center px-2 border-r border-slate-200">
                <span className="text-[10px] text-slate-400 block">عدد الفواتير</span>
                <span className="text-xs font-bold font-mono text-blue-700">
                  {customerInvoices.length}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Sub-Customers list if main customer is selected */}
        {!customer?.isSubCustomer && subCustomers.length > 0 && (
          <div className="px-4 py-2 bg-amber-50/60 border-b border-amber-200 text-xs">
            <div className="flex items-center justify-between mb-1">
              <span className="font-bold text-amber-900 flex items-center gap-1">
                <LinkIcon className="w-3.5 h-3.5 text-amber-700" />
                <span>الزبائن الفرعيين التابعين لهذا العميل (دين مؤقت ومسحوبات فرعية):</span>
              </span>
              <span className="text-[10px] text-amber-700 font-semibold">{subCustomers.length} مسجلين</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-1">
              {subCustomers.map(sub => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => setSelectedCustomerId(sub.id)}
                  className="flex items-center gap-1.5 bg-white hover:bg-amber-100/70 border border-amber-300 px-2.5 py-1 rounded-lg text-slate-800 text-[11px] font-bold cursor-pointer transition-colors shadow-2xs"
                  title="عرض كشف حساب خاص بهذا الزبون الفرعي"
                >
                  <span className="text-blue-700">{sub.name}</span>
                  {sub.phone && <span className="text-slate-500 font-mono text-[10px]">({sub.phone})</span>}
                  <span className={`font-mono text-[10px] font-black ${sub.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {sub.balance.toFixed(2)} ₪
                  </span>
                  <FileText className="w-3 h-3 text-amber-600 mr-0.5" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Contact details */}
        {customer && (
          <div className="px-5 py-2 bg-blue-50/60 border-b border-blue-100 flex items-center gap-6 text-[11px] text-slate-600">
            <span className="flex items-center gap-1">
              <Phone className="w-3.5 h-3.5 text-blue-600" />
              <span>{customer.phone || 'لا يوجد هاتف مسجل'}</span>
            </span>
            {customer.address && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-blue-600" />
                <span>{customer.address}</span>
              </span>
            )}
            {customer.taxNumber && (
              <span className="font-mono text-slate-500">
                الرقم الضريبي: {customer.taxNumber}
              </span>
            )}
          </div>
        )}

        {/* Invoices List */}
        <div className="p-4 flex-1 overflow-y-auto">
          <h4 className="font-bold text-xs text-slate-700 mb-2 flex items-center gap-1.5">
            <Receipt className="w-4 h-4 text-blue-600" />
            <span>فواتير العميل السابقة:</span>
          </h4>

          {customerInvoices.length === 0 ? (
            <div className="p-8 text-center text-slate-400 text-xs">
              لا توجد فواتير سابقة مسجلة لهذا العميل.
            </div>
          ) : (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 text-[11px]">
                  <tr>
                    <th className="p-2.5">رقم الفاتورة</th>
                    <th className="p-2.5">التاريخ</th>
                    <th className="p-2.5">الزبون الفرعي</th>
                    <th className="p-2.5">طريقة الدفع</th>
                    <th className="p-2.5 text-left">المجموع</th>
                    <th className="p-2.5 text-left">المدفوع</th>
                    <th className="p-2.5 text-left">المتبقي</th>
                    <th className="p-2.5 text-center">طباعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {customerInvoices.map((inv, idx) => (
                    <React.Fragment key={`${inv.id || 'cust-ledger'}-${idx}`}>
                      <tr className="hover:bg-slate-50 transition-colors">
                        <td className="p-2.5 font-bold text-blue-700">{inv.invoiceNumber}</td>
                        <td className="p-2.5 text-slate-600 font-sans text-[11px]">{formatDateDisplay(inv.date)}</td>
                        <td className="p-2.5 font-sans text-[11px]">
                          {(inv.subCustomerName || inv.customCustomerText) ? (
                            <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[10px] px-2 py-0.5 rounded font-bold">
                              {inv.subCustomerName || inv.customCustomerText}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">مباشر</span>
                          )}
                        </td>
                        <td className="p-2.5 font-sans text-[11px]">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                            inv.paymentMethod === 'credit' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                          }`}>
                            {inv.paymentMethod === 'cash' ? 'نقدي' : (inv.paymentMethod === 'card' || inv.paymentMethod === 'bank_transfer') ? (inv.paymentMethod === 'bank_transfer' ? 'بنكي' : 'شبكة') : 'آجل'}
                          </span>
                        </td>
                        <td className="p-2.5 text-left font-bold">{(Number(inv.totalAmount) || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-left text-emerald-600">{(Number(inv.paidAmount) || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-left text-rose-600 font-bold">{(Number(inv.remainingAmount) || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-center">
                          <button
                            onClick={() => {
                              setSelectedInvoiceForPrint(inv);
                              onClose();
                            }}
                            title="طباعة الفاتورة"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg cursor-pointer"
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                      {inv.notes && (
                        <tr className="bg-amber-50/40 border-b border-amber-100/80">
                          <td colSpan={8} className="px-3 py-1 font-sans text-[11px] text-amber-950">
                            <div className="flex items-center gap-1.5">
                              <FileText className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                              <span className="font-bold text-amber-900">ملاحظات الفاتورة ({inv.invoiceNumber}):</span>
                              <span className="text-slate-700 font-medium">{inv.notes}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
          {customer ? (
            <button
              type="button"
              onClick={() => {
                setSelectedPartyForStatement(customer);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white text-xs font-bold rounded-xl cursor-pointer shadow-xs transition-colors"
            >
              <FileText className="w-4 h-4" />
              <span>كشف حساب تفصيلي رسمي A4</span>
            </button>
          ) : <div />}

          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
