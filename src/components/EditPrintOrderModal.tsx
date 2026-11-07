import React, { useState, useEffect } from 'react';
import { DateInput } from '../components/common/DateInput';
import { PrintJobOrder, PrintOrderStatus, PrintServiceType } from '../types';
import { X, Save, Edit3, Layers, CheckCircle } from 'lucide-react';
import { posSound } from '../utils/audio';

interface EditPrintOrderModalProps {
  order: PrintJobOrder | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (updated: Partial<PrintJobOrder>) => void;
  currencySymbol?: string;
}

const serviceTypeLabels: Record<PrintServiceType, string> = {
  business_cards: 'كروت شخصية وبيزنس كارد',
  flyer_brochure: 'بروشور وفلاير ومطبوعات ورقية',
  books_booklets: 'كتب وملازم دراسية ومجلات',
  banner_flex: 'بنر وفليكس ورول اب خارجي',
  stickers_labels: 'ستيكر وليبل مقصوص ولاصق',
  stamps: 'أختام كريستال وخشب وأوتوماتيك',
  binding_finishing: 'تجليد حراري وسلك وسلوفان',
  custom_print: 'طباعة وتجهيز حسب الطلب'
};

const finishingOptionsList = [
  'سلوفان حراري مطفي',
  'سلوفان حراري لامع',
  'سلوفان مخملي Soft Touch',
  'بصمة ذهبية / فضية حرارية (Foil)',
  'سبوت يو في موضعي (Spot UV)',
  'تكسير وقص داي كت (Die-Cut)',
  'ترييج وتكعيب آلي (Creasing)',
  'تجليد حلزوني سلك (Wire Binding)',
  'خياطة وتجليد دبابيس (Saddle Stitch)',
  'تركيب كبسولات وحلقات معدنية (Eyelets)'
];

export const EditPrintOrderModal: React.FC<EditPrintOrderModalProps> = ({
  order,
  isOpen,
  onClose,
  onSave,
  currencySymbol = '₪'
}) => {
  const [title, setTitle] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [serviceType, setServiceType] = useState<PrintServiceType>('custom_print');
  const [paperType, setPaperType] = useState('');
  const [dimensions, setDimensions] = useState('');
  const [quantity, setQuantity] = useState<number>(1);
  const [colorType, setColorType] = useState('');
  const [selectedFinishings, setSelectedFinishings] = useState<string[]>([]);
  const [unitCost, setUnitCost] = useState<number>(0);
  const [totalPrice, setTotalPrice] = useState<number>(0);
  const [depositPaid, setDepositPaid] = useState<number>(0);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [status, setStatus] = useState<PrintOrderStatus>('design');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (order && isOpen) {
      setTitle(order.title || '');
      setCustomerName(order.customerName || '');
      setCustomerPhone(order.customerPhone || '');
      setServiceType(order.serviceType || 'custom_print');
      setPaperType(order.paperType || '');
      setDimensions(order.dimensions || '');
      setQuantity(order.quantity || 1);
      setColorType(order.colorType || 'ألوان كاملة 4/4');
      setSelectedFinishings(order.finishingOptions || []);
      setUnitCost(order.unitCost || 0);
      setTotalPrice(order.totalPrice || 0);
      setDepositPaid(order.depositPaid || 0);
      setDeliveryDate(order.deliveryDate || new Date().toISOString().split('T')[0]);
      setStatus(order.status || 'design');
      setNotes(order.notes || '');
    }
  }, [order, isOpen]);

  if (!isOpen || !order) return null;

  const isDelivered = order.status === 'delivered';
  const remaining = Math.max(0, Number((totalPrice - depositPaid).toFixed(2)));

  const toggleFinishing = (opt: string) => {
    setSelectedFinishings(prev =>
      prev.includes(opt) ? prev.filter(f => f !== opt) : [...prev, opt]
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isDelivered) {
      alert('لا يمكن تعديل طلبية تم تسليمها بالفعل.');
      return;
    }

    onSave({
      title,
      customerName,
      customerPhone,
      serviceType,
      paperType,
      dimensions,
      quantity: Number(quantity) || 1,
      colorType,
      finishingOptions: selectedFinishings,
      unitCost: Number(unitCost) || 0,
      totalPrice: Number(totalPrice) || 0,
      depositPaid: Number(depositPaid) || 0,
      remainingBalance: remaining,
      status,
      deliveryDate,
      notes
    });

    posSound.playSuccessBeep();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 text-slate-800 text-xs overflow-y-auto"
      dir="rtl"
    >
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto">
        {/* Header */}
        <div className="bg-[#1f4a7c] text-white px-5 py-3.5 flex items-center justify-between border-b border-[#143254]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-blue-500 text-white rounded-xl shadow-xs">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white">تعديل تفاصيل طلبية الطباعة والورشة</h3>
                <span className="font-mono bg-blue-900/70 border border-blue-400/40 text-blue-100 px-2 py-0.5 rounded text-[11px] font-bold">
                  {order.orderNumber}
                </span>
              </div>
              <p className="text-[11px] text-blue-200 mt-0.5">
                تعديل مواصفات الطلبية غير المسلمة والأسعار ومراحل التنفيذ
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-blue-200 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Warning if delivered */}
        {isDelivered && (
          <div className="bg-rose-50 text-rose-800 p-3 text-xs font-bold border-b border-rose-200 flex items-center gap-2">
            <span>تنبيه: هذه الطلبية مكتملة وتم تسليمها للعميل، لا يمكن تعديل بياناتها.</span>
          </div>
        )}

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Customer & Title */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1">اسم ووصف الطلبية / المطبوع:</label>
              <input
                type="text"
                required
                disabled={isDelivered}
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="مثال: بروشور تعريفي مقاس A4 مطوي"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 font-semibold text-xs focus:bg-white focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">نوع الخدمة والإنتاج:</label>
              <select
                disabled={isDelivered}
                value={serviceType}
                onChange={e => setServiceType(e.target.value as PrintServiceType)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-2 py-1.5 font-semibold text-xs focus:bg-white focus:border-blue-500 cursor-pointer"
              >
                {Object.entries(serviceTypeLabels).map(([key, lbl]) => (
                  <option key={key} value={key}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1">اسم العميل:</label>
              <input
                type="text"
                required
                disabled={isDelivered}
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 font-semibold text-xs focus:bg-white focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-slate-700 font-bold mb-1">رقم هاتف / جوال العميل:</label>
              <input
                type="text"
                disabled={isDelivered}
                value={customerPhone}
                onChange={e => setCustomerPhone(e.target.value)}
                placeholder="059xxxxxxx"
                className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-1.5 font-mono text-xs focus:bg-white focus:border-blue-500 text-left"
              />
            </div>
          </div>

          {/* Specifications */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-3">
            <h4 className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>المواصفات الفنية ومقاييس الطباعة</span>
            </h4>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-slate-600 text-[11px] font-semibold mb-1">الكمية:</label>
                <input
                  type="number"
                  min="1"
                  required
                  disabled={isDelivered}
                  value={quantity}
                  onChange={e => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono font-bold text-xs text-center"
                />
              </div>

              <div>
                <label className="block text-slate-600 text-[11px] font-semibold mb-1">المقاس / الأبعاد:</label>
                <input
                  type="text"
                  disabled={isDelivered}
                  value={dimensions}
                  onChange={e => setDimensions(e.target.value)}
                  placeholder="مثال: 9 × 5.5 سم"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-center"
                />
              </div>

              <div>
                <label className="block text-slate-600 text-[11px] font-semibold mb-1">الخامة والورق:</label>
                <input
                  type="text"
                  disabled={isDelivered}
                  value={paperType}
                  onChange={e => setPaperType(e.target.value)}
                  placeholder="مثال: كوشيه 350 جرام"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-center"
                />
              </div>

              <div>
                <label className="block text-slate-600 text-[11px] font-semibold mb-1">الألوان والطباعة:</label>
                <input
                  type="text"
                  disabled={isDelivered}
                  value={colorType}
                  onChange={e => setColorType(e.target.value)}
                  placeholder="وجهين 4/4 ألوان"
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 text-xs text-center"
                />
              </div>
            </div>

            {/* Finishing Options */}
            <div>
              <label className="block text-slate-700 font-bold mb-1.5">خيارات التشطيب والتجهيز الإضافية:</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {finishingOptionsList.map(opt => {
                  const isSelected = selectedFinishings.includes(opt);
                  return (
                    <button
                      key={opt}
                      type="button"
                      disabled={isDelivered}
                      onClick={() => toggleFinishing(opt)}
                      className={`px-2 py-1 text-right text-[10px] rounded-lg border font-semibold flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-blue-50 border-blue-400 text-blue-900 font-bold'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <span className="truncate">{opt}</span>
                      {isSelected && <CheckCircle className="w-3 h-3 text-blue-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Pricing & Financials */}
          <div className="bg-amber-50/50 p-3 rounded-xl border border-amber-200 space-y-2.5">
            <h4 className="font-bold text-amber-950 text-xs">الأسعار والتحصيل</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              <div>
                <label className="block text-slate-600 text-[11px] font-semibold mb-1">تكلفة الإنتاج:</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={isDelivered}
                  value={unitCost}
                  onChange={e => setUnitCost(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2 py-1 font-mono text-xs text-left"
                />
              </div>
              <div>
                <label className="block text-slate-700 text-[11px] font-bold mb-1">السعر الإجمالي:</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  disabled={isDelivered}
                  value={totalPrice}
                  onChange={e => setTotalPrice(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-blue-400 rounded-lg px-2 py-1 font-mono font-black text-xs text-left text-blue-900"
                />
              </div>
              <div>
                <label className="block text-emerald-700 text-[11px] font-bold mb-1">المدفوع / العربون:</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  disabled={isDelivered}
                  value={depositPaid}
                  onChange={e => setDepositPaid(parseFloat(e.target.value) || 0)}
                  className="w-full bg-white border border-emerald-400 rounded-lg px-2 py-1 font-mono font-bold text-xs text-left text-emerald-800"
                />
              </div>
              <div>
                <label className="block text-rose-700 text-[11px] font-bold mb-1">المتبقي على العميل:</label>
                <div className="w-full bg-slate-100 border border-slate-300 rounded-lg px-2 py-1 font-mono font-black text-xs text-left text-rose-700 flex items-center justify-between">
                  <span>{remaining.toFixed(2)}</span>
                  <span className="text-[9px] text-slate-400 font-light font-sans">{currencySymbol}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Workflow Status & Delivery Date */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-700 font-bold mb-1">مرحلة العمل وحالة الطلبية:</label>
              <select
                disabled={isDelivered}
                value={status}
                onChange={e => setStatus(e.target.value as PrintOrderStatus)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 font-bold text-xs cursor-pointer focus:border-blue-500"
              >
                <option value="new">بيع جديد / أمر جديد</option>
                <option value="design">قيد التصميم</option>
                <option value="pending_approval">بإنتظار الاعتماد</option>
                <option value="in_progress_external">قيد التنفيذ خارج</option>
                <option value="in_progress_internal">قيد التنفيذ داخل</option>
                <option value="printing">قيد سحب الطباعة</option>
                <option value="finishing">التشطيب والتجليد</option>
                <option value="ready">جاهز للتسليم</option>
                <option value="delivered">تم التسليم</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-700 font-bold mb-1">موعد التسليم المتوقع:</label>
              <DateInput disabled={isDelivered} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)}
                className="w-full bg-white border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:border-blue-500"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-slate-700 font-bold mb-1">ملاحظات التشغيل والورشة:</label>
            <textarea
              rows={2}
              disabled={isDelivered}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="أي تفاصيل خاصة بالقص، الألوان، أو تعليمات الفنيين..."
              className="w-full bg-slate-50 border border-slate-300 rounded-lg p-2 text-xs focus:bg-white focus:border-blue-500"
            />
          </div>

          {/* Footer buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs cursor-pointer transition-colors"
            >
              إلغاء
            </button>
            {!isDelivered && (
              <button
                type="submit"
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs flex items-center gap-1.5 cursor-pointer shadow-md transition-colors"
              >
                <Save className="w-4 h-4" />
                <span>حفظ التعديلات واعتمادها</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
