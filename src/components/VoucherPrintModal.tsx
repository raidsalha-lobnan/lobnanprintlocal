import React from 'react';
import { useAccounting } from '../context/AccountingContext';
import { tafqeet } from '../utils/tafqeet';
import { Printer, X, Receipt } from 'lucide-react';
import { PrintHeader } from './common/PrintHeader';
import { ReportSignatures } from './common/ReportSignatures';

export const VoucherPrintModal: React.FC = () => {
  const { selectedVoucherForPrint, setSelectedVoucherForPrint, settings, treasuries, parties } = useAccounting();

  if (!selectedVoucherForPrint) return null;

  const voucher = selectedVoucherForPrint;
  const isPayment = voucher.type === 'payment';
  const party = parties.find(p => p.id === voucher.partyId);

  // Treasury / Account name
  const treasury = treasuries.find(t => t.accountCode === voucher.accountCode || t.accountCode === voucher.treasuryAccountCode);
  const treasuryName = treasury?.name || (voucher.paymentMethod === 'cash' ? 'الصندوق الرئيسي' : 'الحساب البنكي');

  // Currency & fraction names for Tafqeet
  const getCurrencyNames = (currCode?: string) => {
    switch (currCode) {
      case 'USD':
        return { name: 'دولار أمريكي', frac: 'سنت' };
      case 'JOD':
        return { name: 'دينار أردني', frac: 'فلس' };
      case 'EUR':
        return { name: 'يورو', frac: 'سنت' };
      case 'SAR':
        return { name: 'ريال سعودي', frac: 'هللة' };
      case 'EGP':
        return { name: 'جنيه مصري', frac: 'قرش' };
      case 'ILS':
      default:
        return { name: 'شيكل', frac: 'أغورة' };
    }
  };

  const { name: currName, frac: fracName } = getCurrencyNames(voucher.currency || settings.baseCurrencyCode);
  const amountWords = tafqeet(voucher.amount, currName, fracName);

  const handlePrint = () => {
    window.print();
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'cash':
        return 'نقداً';
      case 'bank_transfer':
        return 'تحويل بنكي / إيداع';
      case 'cheque':
        return 'شيك مصرفي';
      default:
        return method;
    }
  };

  // Format date display (e.g. 2026 / 09 / 13)
  const formattedDate = (() => {
    if (!voucher.date) return new Date().toISOString().split('T')[0];
    const parts = voucher.date.split('-');
    if (parts.length === 3) {
      return `${parts[0]} / ${parts[1]} / ${parts[2]}`;
    }
    return voucher.date;
  })();

  // Party and Sub-Customer display (without code)
  const partyDisplayName = (() => {
    let name = voucher.partyName || (party ? party.name : 'عميل عام');
    if (voucher.subCustomerName) {
      name += ` - ${voucher.subCustomerName}`;
    }
    return name;
  })();

  // Currency symbol
  const currencySymbol = voucher.currencySymbol || (voucher.currency === 'USD' ? '$' : voucher.currency === 'JOD' ? 'د.أ' : voucher.currency === 'SAR' ? 'ر.س' : settings.currency || '₪');

  // Combined Notes & Payment Details String:
  // يكتب ملاحظة السند أولاً ثم آلية الدفع (نقدي / بنكي) مع تفاصيل الحساب
  const notesAndPaymentDetails = (() => {
    // 1. Payment detail string
    let payStr = '';
    if (voucher.paymentMethod === 'cash') {
      payStr = isPayment ? `نقدي - صرف من: ${treasuryName}` : `نقدي - إيداع في: ${treasuryName}`;
    } else if (voucher.paymentMethod === 'bank_transfer') {
      const refStr = voucher.transferReference ? ` (رقم الحوالة: ${voucher.transferReference})` : '';
      payStr = isPayment ? `بنكي - صرف من: ${treasuryName}${refStr}` : `بنكي - إيداع في: ${treasuryName}${refStr}`;
    } else if (voucher.paymentMethod === 'cheque') {
      const chqParts: string[] = ['شيك بنكي'];
      if (voucher.chequeNumber) chqParts.push(`رقم: ${voucher.chequeNumber}`);
      if (voucher.chequeBank) chqParts.push(`بنك: ${voucher.chequeBank}`);
      if (voucher.chequeDueDate) chqParts.push(`استحقاق: ${voucher.chequeDueDate}`);
      chqParts.push(isPayment ? `مسحوب على: ${treasuryName}` : `مودع في: ${treasuryName}`);
      payStr = chqParts.join(' - ');
    } else {
      // card / electronic
      payStr = isPayment ? `بطاقة / شبكة - صرف من: ${treasuryName}` : `بطاقة / شبكة - إيداع في: ${treasuryName}`;
    }

    // 2. Note / Description if present
    const note = voucher.description ? voucher.description.trim() : '';
    const genericDescriptions = [
      'سند تحصيل نقدية',
      'سند صرف نقدية',
      'سند قبض نقدي',
      'دفعة سداد حساب من العميل',
      'سند قبض مالي',
      'سند صرف مالي'
    ];

    if (note && !genericDescriptions.includes(note)) {
      return `${note} - ${payStr}`;
    }

    return payStr;
  })();

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto print:p-0 print:m-0 print:bg-white print:static print:h-auto print:overflow-visible print-modal-container" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-3xl overflow-hidden flex flex-col max-h-[95vh] print:max-h-none print:shadow-none print:border-none print:w-full print:rounded-none print:overflow-visible">
        
        {/* Top Control Bar (Hidden when printing) */}
        <div className="bg-slate-900 text-white px-5 py-3 flex items-center justify-between print:hidden border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-600 text-white rounded-lg">
              <Receipt className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm">{isPayment ? 'معاينة سند الصرف' : 'معاينة سند القبض'}</h3>
              <span className="font-mono text-xs text-blue-300">
                {voucher.voucherNumber}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة السند</span>
            </button>
            <button
              onClick={() => setSelectedVoucherForPrint(null)}
              className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Voucher Paper */}
        <div className="p-6 sm:p-10 flex-1 overflow-y-auto print:p-0 print:m-0 print:overflow-visible text-slate-950 font-sans bg-white select-none printable-paper print-document">
          
          {/* 1. الهيدر المرفق بالبرنامج (Official Header) */}
          <div className="mb-4">
            <PrintHeader showBorder={false} />
          </div>

          {/* 2. عنوان السند في الوسط وتحته مباشرة رقم السند دون كلمة رقم السند */}
          <div className="text-center my-3 sm:my-4">
            <div className="inline-block bg-black text-white px-10 py-1.5 sm:py-2 rounded-lg font-black text-base sm:text-xl tracking-wider shadow-xs">
              {isPayment ? 'سند صرف' : 'سند قبض'}
            </div>
            <div className="mt-1.5 font-mono font-bold text-sm sm:text-base text-slate-900 tracking-wider">
              {voucher.voucherNumber}
            </div>
          </div>

          {/* 3. شريط المبلغ والعملة (في اليمين) والتاريخ (في اليسار) */}
          <div className="flex items-end justify-between gap-4 mt-4 mb-6 pb-3 border-b border-slate-200">
            {/* جهة اليمين: العملة والخانة فيها المبلغ مع رمز العملة */}
            <div className="flex flex-col items-start text-right">
              <span className="text-xs font-bold text-slate-700 mb-1">{currName}</span>
              <div className="border-2 border-black rounded-full px-6 py-1.5 min-w-[150px] sm:min-w-[170px] text-center bg-white shadow-2xs">
                <span className="font-mono font-black text-lg sm:text-xl text-black">
                  {voucher.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencySymbol}
                </span>
              </div>
            </div>

            {/* جهة اليسار: التاريخ */}
            <div className="flex items-center gap-2 text-sm sm:text-base font-bold pb-2 text-left">
              <span className="text-black font-black">التاريخ:</span>
              <span className="font-mono font-bold tracking-wider text-slate-900">
                {formattedDate}
              </span>
            </div>
          </div>

          {/* 4. بنود السند - أسطر نظيفة بدون أسطر نقاط */}
          <div className="space-y-4 my-6 text-sm sm:text-[15px]">
            
            {/* السطر الأول: إستلمت من / يصرف إلى (دون كود العميل) */}
            <div className="flex items-baseline gap-2 py-1">
              <span className="font-black text-black whitespace-nowrap text-base min-w-[100px]">
                {isPayment ? 'صرفت إلى /' : 'إستلمت من /'}
              </span>
              <span className="font-bold text-slate-900 flex-1 px-1 text-right text-base sm:text-lg">
                {partyDisplayName}
              </span>
            </div>

            {/* السطر الثاني: مبلغ وقدره / */}
            <div className="flex items-baseline gap-2 py-1">
              <span className="font-black text-black whitespace-nowrap text-base min-w-[100px]">
                مبلغ وقدره /
              </span>
              <span className="font-bold text-slate-900 flex-1 px-1 text-right">
                {amountWords}
              </span>
            </div>

            {/* السطر الثالث: ملاحظات / (ملاحظة السند متبوعة بآلية الدفع) */}
            <div className="flex items-baseline gap-2 py-1">
              <span className="font-black text-black whitespace-nowrap text-base min-w-[100px]">
                ملاحظات /
              </span>
              <span className="font-bold text-slate-900 flex-1 px-1 text-right leading-relaxed">
                {notesAndPaymentDetails}
              </span>
            </div>

          </div>

          {/* 5. التوقيعات والختم (Signatures & Stamp Section) */}
          <ReportSignatures columns={2} rightLabel={isPayment ? 'توقيع المستلم' : 'توقيع المحاسب / المستلم'} leftLabel="الختم والاعتماد" />
        </div>
      </div>
    </div>
  );
};
