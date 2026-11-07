import React, { useState, useRef, useEffect } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import { Printer, Save, Plus, Trash2, Truck } from 'lucide-react';
import { OfficialStamp } from './common/OfficialStamp';


export const ManualInvoiceView: React.FC = () => {
    const { settings, addPosInvoice, addPosInvoiceOnline, invoices, inventory, parties, getItemPriceForCustomer } = useAccounting();
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  
  const MANUAL_INV_DRAFT_KEY = 'manual_inv_draft';
  const savedManualDraft = React.useMemo(() => {
    try {
      const raw = localStorage.getItem('manual_inv_draft');
      if (raw) return JSON.parse(raw);
    } catch {}
    return {};
  }, []);

  const [invoiceNumber, setInvoiceNumber] = useState(() => savedManualDraft.invoiceNumber || '');
  const [date, setDate] = useState(() => savedManualDraft.date || new Date().toISOString().split('T')[0]);
  const [selectedCustomerId, setSelectedCustomerId] = useState(() => savedManualDraft.selectedCustomerId || '');
  const [customerName, setCustomerName] = useState(() => savedManualDraft.customerName || '');
  const [customerPhone, setCustomerPhone] = useState(() => savedManualDraft.customerPhone || '');
  const [customerAddress, setCustomerAddress] = useState(() => savedManualDraft.customerAddress || '');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [sellerName, setSellerName] = useState(() => savedManualDraft.sellerName || settings?.companyName || '');
  const [sellerPhone, setSellerPhone] = useState(() => savedManualDraft.sellerPhone || settings?.phone || '');
  const [sellerAddress, setSellerAddress] = useState(() => savedManualDraft.sellerAddress || settings?.address || '');
  
  const [items, setItems] = useState<Array<{ name: string; itemNotes: string; qty: string; price: string; total: number }>>(() => {
    if (Array.isArray(savedManualDraft.items) && savedManualDraft.items.length > 0) {
      return savedManualDraft.items;
    }
    return Array(12).fill(null).map(() => ({ name: '', itemNotes: '', qty: '', price: '', total: 0 }));
  });
  
  const [notes, setNotes] = useState(() => savedManualDraft.notes || '');
  const [discount, setDiscount] = useState(() => savedManualDraft.discount || '');
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);

  // Auto-save manual invoice draft
  useEffect(() => {
    try {
      const hasContent = customerName.trim() !== '' || customerPhone.trim() !== '' || notes.trim() !== '' || items.some(it => it.name.trim() !== '');
      if (hasContent) {
        localStorage.setItem(MANUAL_INV_DRAFT_KEY, JSON.stringify({
          invoiceNumber,
          date,
          selectedCustomerId,
          customerName,
          customerPhone,
          customerAddress,
          sellerName,
          sellerPhone,
          sellerAddress,
          items,
          notes,
          discount,
          timestamp: Date.now()
        }));
      } else {
        localStorage.removeItem(MANUAL_INV_DRAFT_KEY);
      }
    } catch {}
  }, [invoiceNumber, date, selectedCustomerId, customerName, customerPhone, customerAddress, sellerName, sellerPhone, sellerAddress, items, notes, discount]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        localStorage.setItem(MANUAL_INV_DRAFT_KEY, JSON.stringify({
          invoiceNumber,
          date,
          selectedCustomerId,
          customerName,
          customerPhone,
          customerAddress,
          sellerName,
          sellerPhone,
          sellerAddress,
          items,
          notes,
          discount,
          timestamp: Date.now()
        }));
      } catch {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [invoiceNumber, date, selectedCustomerId, customerName, customerPhone, customerAddress, sellerName, sellerPhone, sellerAddress, items, notes, discount]);
  

  useEffect(() => {
    if (settings) {
      setSellerName(settings.companyName || '');
      setSellerPhone(settings.phone || '');
      setSellerAddress(settings.address || '');
    }
  }, [settings]);

  // Filtered registered customers
  const filteredCustomers = React.useMemo(() => {
    const q = customerName.trim().toLowerCase();
    if (!q) return [];
    return parties.filter(p => !p.isSubCustomer && (p.type === 'customer' || p.type === 'both') && (
      p.name.toLowerCase().includes(q) ||
      (p.phone && p.phone.includes(q)) ||
      (p.code && p.code.toLowerCase().includes(q))
    )).slice(0, 8);
  }, [parties, customerName]);

  const handleSelectCustomer = (party: any) => {
    setSelectedCustomerId(party.id);
    setCustomerName(party.name);
    setCustomerPhone(party.phone || '');
    setCustomerAddress(party.address || '');
    setShowCustomerDropdown(false);

    // Immediately adopt preferred prices for all rows in the invoice
    setItems(prevItems => prevItems.map(row => {
      if (!row.name || !row.name.trim()) return row;
      const matchedInv = inventory.find(i => i.name.trim().toLowerCase() === row.name.trim().toLowerCase() || (i.code && i.code.toLowerCase() === row.name.trim().toLowerCase()));
      if (matchedInv) {
        const { price } = getItemPriceForCustomer(matchedInv, party.id);
        const qty = parseFloat(row.qty) || 0;
        return {
          ...row,
          price: price.toString(),
          total: qty > 0 ? Number((qty * price).toFixed(2)) : row.total
        };
      }
      return row;
    }));
  };

  const selectInventoryItem = (index: number, invItem: any) => {
    const newItems = [...items];
    const { price } = getItemPriceForCustomer(invItem, selectedCustomerId);
    newItems[index].name = invItem.name;
    newItems[index].price = price.toString();
    setActiveItemIndex(null);
    
    const qty = parseFloat(newItems[index].qty) || 0;
    if (qty > 0) {
      newItems[index].total = Number((qty * price).toFixed(2));
    }
    setItems(newItems);
  };

  const handleItemChange = (index: number, field: string, value: string) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;
    if (field === 'qty' || field === 'price') {
      const qty = parseFloat(newItems[index].qty) || 0;
      const prc = parseFloat(newItems[index].price) || 0;
      newItems[index].total = qty * prc;
    }
    setItems(newItems);
  };

  const subtotal = items.reduce((sum, item) => sum + (Number(item.total) || 0), 0);
  const discountVal = parseFloat(discount) || 0;
  const netAmount = Math.max(0, subtotal - discountVal);
  const taxAmount = settings?.taxEnabled ? netAmount * (settings.vatRate / 100) : 0;
  const grandTotal = netAmount + taxAmount;



  const handleAddDeliveryService = () => {
    const deliveryService = inventory.find(
      i => i.id === 'srv-delivery' || i.name.includes('خدمة توصيل') || i.name.includes('توصيل')
    );
    const price = deliveryService ? deliveryService.sellingPrice.toString() : '20';
    const numPrice = parseFloat(price) || 20;

    // Find first empty item row or append
    const emptyIdx = items.findIndex(i => !i.name.trim() && !i.itemNotes.trim() && (!i.total || i.total === 0));
    if (emptyIdx !== -1) {
      const newItems = [...items];
      newItems[emptyIdx] = {
        name: deliveryService ? deliveryService.name : 'خدمة توصيل',
        itemNotes: 'خدمة توصيل طلبات',
        qty: '1',
        price: price,
        total: numPrice
      };
      setItems(newItems);
    } else {
      setItems(prev => [
        ...prev,
        {
          name: deliveryService ? deliveryService.name : 'خدمة توصيل',
          itemNotes: 'خدمة توصيل طلبات',
          qty: '1',
          price: price,
          total: numPrice
        }
      ]);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleSave = async () => {
    // Only save items that have a name and total > 0
    const validItems = items.filter(i => (i.name.trim() !== '' || i.itemNotes?.trim() !== '') && i.total > 0);
    if (validItems.length === 0) {
      alert('يجب إدخال صنف واحد على الأقل');
      return;
    }

    if (!navigator.onLine) {
      alert('⚠️ لا يوجد اتصال بالإنترنت حالياً.\nتم تجميد الشاشة والاحتفاظ بكافة الأصناف والمدخلات بأمان لمنع أي فقدان في البيانات.\nلن يتم حفظ الفاتورة إلا وقت الاتصال بالإنترنت والترحيل المباشر إلى السيرفر.');
      return;
    }

    const res = await addPosInvoiceOnline({
      invoiceNumber: invoiceNumber.trim() || undefined,
      date,
      customerId: selectedCustomerId || undefined,
      customerName: customerName || 'عميل نقدي',
      customerPhone,
      type: 'standard',
      items: validItems.map(i => ({
        id: Math.random().toString(36).substr(2, 9),
        inventoryItemId: '',
        name: i.name.trim() || i.itemNotes.trim(),
        description: i.itemNotes.trim() || undefined,
        notes: i.itemNotes.trim() || undefined,
        quantity: Number(i.qty) || 1,
        unitPrice: Number(i.price) || 0,
        total: i.total,
        isCustom: true
      })),
      subtotal,
      discountTotal: discountVal,
      taxRate: settings.vatRate,
      taxAmount,
      totalAmount: grandTotal,
      paidAmount: grandTotal,
      remainingAmount: 0,
      paymentMethod: 'cash',
      status: 'paid',
      notes,
    });

    if (!res.success) {
      alert(`تعذر الترحيل السحابي للفاتورة: ${res.error || 'خطأ غير معروف'}\nكافة المدخلات محفوظة على الشاشة دون فقدان.`);
      return;
    }

    const assignedNumber = res.invoice?.invoiceNumber || invoiceNumber;
    setInvoiceNumber(assignedNumber);
    alert(`تم ترحيل وحفظ الفاتورة بنجاح في السيرفر وسجل المبيعات برقم (#${assignedNumber}) 🟢`);
  };

  return (
    <div className="w-full h-full flex flex-col print:p-0 print:m-0 print:w-full bg-slate-50 overflow-hidden">
      {/* Top Controls (Hidden on Print) */}
      <div className="flex items-center justify-between bg-white p-4 shadow-sm border-b border-slate-200 print:hidden shrink-0 w-full">
        <div>
          <h2 className="text-lg font-bold text-slate-800">فاتورة مبيعات A4 (تصميم مخصص)</h2>
          <p className="text-[10px] text-slate-400 font-light">قم بتعبئة البيانات وطباعتها أو حفظها في السجل</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddDeliveryService}
            className="flex items-center gap-2 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg font-bold text-sm shadow-sm transition-colors cursor-pointer"
            title="إضافة خدمة توصيل تلقائياً كبند في الفاتورة"
          >
            <Truck className="w-4 h-4" />
            <span>+ خدمة توصيل</span>
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm shadow-sm transition-colors"
          >
            <Save className="w-4 h-4" />
            <span>حفظ بالسجل</span>
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة الفاتورة</span>
          </button>
        </div>
      </div>

      {/* Printable Area - Full Screen Scrollable */}
      <div className="w-full flex-1 overflow-auto bg-white p-4 md:p-8 print:p-0 print:overflow-visible" onClick={() => setActiveItemIndex(null)}>
        <div 
          className="bg-white text-slate-900 font-sans relative box-border w-full max-w-5xl mx-auto min-h-full flex flex-col justify-between" 
          dir="rtl"
        >
          {/* Header Image from Settings */}
          {settings?.headerImageUrl && (
             <div className="w-full mb-6 print:mb-4">
                <img src={settings.headerImageUrl} alt="Header" className="w-full h-auto max-h-48 object-contain" />
             </div>
          )}
          
          <div className="flex-1 flex flex-col">
        
        {/* Header Row */}
        <div className="flex items-start justify-between mb-[3%] relative">
          {/* Invoice Number Box */}
          <div className="w-48 border-[1.5px] border-slate-400 rounded-md p-[1.5%] flex items-center gap-2">
            <span className="font-bold text-sm shrink-0">رقم الفاتورة :</span>
            <input 
              type="text" 
              value={invoiceNumber}
              onChange={e => setInvoiceNumber(e.target.value)}
              placeholder="تلقائي بعد الحفظ"
              className="w-full text-center border-b border-dotted border-slate-400 focus:outline-none focus:border-blue-500 text-sm font-bold bg-transparent"
            />
          </div>

          {/* Center Title */}
          <div className="bg-[#1e3a8a] text-white px-12 py-3 rounded-md absolute left-1/2 -translate-x-1/2 -top-[1.5%]">
            <h1 className="text-[3.5cqw] sm:text-2xl md:text-3xl font-black tracking-wider">فاتورة مبيعات</h1>
          </div>

          {/* Date Box */}
          <div className="w-48 border-[1.5px] border-slate-400 rounded-md p-[1.5%] flex items-center gap-2">
            <span className="font-bold text-sm shrink-0">التاريخ :</span>
            <DateInput value={date} onChange={e => setDate(e.target.value)}
              className="w-full text-center border-b border-dotted border-slate-400 focus:outline-none focus:border-blue-500 text-sm font-bold bg-transparent"
            />
          </div>
        </div>

        {/* Info Boxes */}
        <div className="grid grid-cols-2 gap-[4%] mb-[2%]">
          {/* Customer Box */}
          <div className="border-[1.5px] border-[#1e3a8a] rounded-md overflow-hidden relative">
            <div className="bg-[#dbeafe] py-[1%] text-center font-bold text-[#1e3a8a] border-b-[1.5px] border-[#1e3a8a]">
              بيانات العميل
            </div>
            <div className="p-3 space-y-3">
              <div className="flex items-end gap-2 relative">
                <span className="font-bold text-sm shrink-0">اسم العميل :</span>
                <input
                  type="text"
                  value={customerName}
                  onChange={e => {
                    setCustomerName(e.target.value);
                    setShowCustomerDropdown(true);
                  }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="ابحث عن عميل مسجل أو اكتب اسماً..."
                  className="w-full border-b-[1.5px] border-dotted border-slate-400 focus:outline-none focus:border-blue-500 bg-transparent text-sm"
                />
                {showCustomerDropdown && filteredCustomers.length > 0 && (
                  <div className="absolute top-full right-20 left-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-xl z-50 max-h-48 overflow-y-auto no-print">
                    <div className="text-[10px] bg-slate-100 px-2 py-1 font-bold text-slate-500 border-b">
                      اختر العميل لاعتماد أسعاره المفضلة تلقائياً:
                    </div>
                    {filteredCustomers.map(c => (
                      <div
                        key={c.id}
                        className="px-3 py-1.5 hover:bg-blue-50 cursor-pointer text-xs border-b last:border-b-0 flex items-center justify-between"
                        onClick={() => handleSelectCustomer(c)}
                      >
                        <span className="font-bold text-slate-900">{c.name}</span>
                        <div className="flex items-center gap-2">
                          {c.phone && <span className="text-[10px] text-slate-400 font-mono">{c.phone}</span>}
                          {c.code && <span className="text-[10px] font-mono bg-blue-50 text-blue-700 px-1 rounded">{c.code}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-end gap-2">
                <span className="font-bold text-sm shrink-0">رقم الهاتف :</span>
                <input type="text" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} className="w-full border-b-[1.5px] border-dotted border-slate-400 focus:outline-none focus:border-blue-500 bg-transparent text-sm" />
              </div>
              <div className="flex items-end gap-2">
                <span className="font-bold text-sm shrink-0">العنوان :</span>
                <input type="text" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} className="w-full border-b-[1.5px] border-dotted border-slate-400 focus:outline-none focus:border-blue-500 bg-transparent text-sm" />
              </div>
            </div>
          </div>

          {/* Seller Box */}
          <div className="border-[1.5px] border-[#1e3a8a] rounded-md overflow-hidden">
            <div className="bg-[#dbeafe] py-[1%] text-center font-bold text-[#1e3a8a] border-b-[1.5px] border-[#1e3a8a]">
              بيانات البائع
            </div>
            <div className="p-3 space-y-3">
              <div className="flex items-end gap-2">
                <span className="font-bold text-sm shrink-0">اسم المنشأة :</span>
                <input type="text" value={sellerName} onChange={e => setSellerName(e.target.value)} className="w-full border-b-[1.5px] border-dotted border-slate-400 focus:outline-none focus:border-blue-500 bg-transparent text-sm" />
              </div>
              <div className="flex items-end gap-2">
                <span className="font-bold text-sm shrink-0">رقم الهاتف :</span>
                <input type="text" value={sellerPhone} onChange={e => setSellerPhone(e.target.value)} className="w-full border-b-[1.5px] border-dotted border-slate-400 focus:outline-none focus:border-blue-500 bg-transparent text-sm" />
              </div>
              <div className="flex items-end gap-2">
                <span className="font-bold text-sm shrink-0">العنوان :</span>
                <input type="text" value={sellerAddress} onChange={e => setSellerAddress(e.target.value)} className="w-full border-b-[1.5px] border-dotted border-slate-400 focus:outline-none focus:border-blue-500 bg-transparent text-sm" />
              </div>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="border-[1.5px] border-[#1e3a8a] rounded-md overflow-hidden mb-[2%]">
          <table className="w-full text-center">
            <thead className="bg-[#dbeafe] text-[#1e3a8a] font-bold border-b-[1.5px] border-[#1e3a8a]">
              <tr>
                <th className="py-2 border-l-[1.5px] border-[#1e3a8a] w-12">م</th>
                <th className="py-2 border-l-[1.5px] border-[#1e3a8a] w-48">الصنف</th>
                <th className="py-2 border-l-[1.5px] border-[#1e3a8a]">البيان</th>
                <th className="py-2 border-l-[1.5px] border-[#1e3a8a] w-24">الكمية</th>
                <th className="py-2 border-l-[1.5px] border-[#1e3a8a] w-28">سعر الوحدة</th>
                <th className="py-2 w-32">الإجمالي</th>
              </tr>
            </thead>
            <tbody className="divide-y-[1.5px] divide-[#1e3a8a]">
              {items.map((item, idx) => (
                <tr key={`man-item-${item.id || idx}-${idx}`} className="h-[4%]">
                  <td className="border-l-[1.5px] border-[#1e3a8a] font-bold text-sm text-slate-700">{idx + 1}</td>
                  {/* عمود الصنف المستقل */}
                  <td className="border-l-[1.5px] border-[#1e3a8a] p-0 relative">
                    <input 
                      type="text" 
                      value={item.name} 
                      onChange={e => {
                        handleItemChange(idx, 'name', e.target.value);
                        setActiveItemIndex(idx);
                      }} 
                      onFocus={() => setActiveItemIndex(idx)}
                      placeholder="اختر أو اكتب الصنف..."
                      className="w-full px-2.5 py-1.5 bg-transparent focus:outline-none focus:bg-slate-50 text-sm font-bold text-right" 
                    />
                    {/* Dropdown */}
                    {activeItemIndex === idx && (() => {
                      const itemResults = inventory.filter(i => i.name.includes(item.name) && item.name.trim() !== '');
                      if (itemResults.length > 0) {
                        return (
                          <div className="absolute top-full right-0 w-full mt-1 bg-white border border-slate-200 rounded shadow-lg z-50 max-h-48 overflow-y-auto no-print text-right">
                            {itemResults.map((invItem, iIdx) => (
                              <div 
                                key={`man-inv-${invItem.id || iIdx}-${iIdx}`} 
                                className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0 flex justify-between"
                                onClick={() => selectInventoryItem(idx, invItem)}
                              >
                                <span className="font-bold">{invItem.name}</span>
                                <span className="text-slate-500 tabular-nums">{invItem.sellingPrice} ر.س</span>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </td>

                  {/* عمود البيان المستقل */}
                  <td className="border-l-[1.5px] border-[#1e3a8a] p-0">
                    <input 
                      type="text" 
                      value={item.itemNotes} 
                      onChange={e => handleItemChange(idx, 'itemNotes', e.target.value)} 
                      placeholder="البيان، الشرح أو تفاصيل البند..."
                      className="w-full px-2.5 py-1.5 bg-transparent focus:outline-none focus:bg-slate-50 text-sm text-slate-700 placeholder:text-slate-400 text-right" 
                    />
                  </td>
                  <td className="border-l-[1.5px] border-[#1e3a8a] px-2">
                    <input type="number" min="0" value={item.qty} onChange={e => handleItemChange(idx, 'qty', e.target.value)} className="w-full text-center bg-transparent focus:outline-none focus:bg-slate-50 text-sm" />
                  </td>
                  <td className="border-l-[1.5px] border-[#1e3a8a] px-2">
                    <input type="number" min="0" value={item.price} onChange={e => handleItemChange(idx, 'price', e.target.value)} className="w-full text-center bg-transparent focus:outline-none focus:bg-slate-50 text-sm" />
                  </td>
                  <td className="px-2 text-sm font-bold bg-slate-50/50">
                    {item.total > 0 ? item.total.toLocaleString('ar-SA') : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Bottom Section */}
        <div className="grid grid-cols-2 gap-[4%] mb-[4%]">
          {/* Notes */}
          <div className="border-[1.5px] border-[#1e3a8a] rounded-md overflow-hidden h-max">
            <div className="bg-[#dbeafe] py-[1%] text-center font-bold text-[#1e3a8a] border-b-[1.5px] border-[#1e3a8a]">
              ملاحظات
            </div>
            <div className="p-[1.5%] flex-1 min-h-0">
              <textarea 
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full h-full resize-none bg-transparent focus:outline-none text-sm"
              />
            </div>
          </div>

          {/* Totals */}
          <div className="border-[1.5px] border-[#1e3a8a] rounded-md overflow-hidden flex flex-col">
            <div className="flex border-b-[1.5px] border-[#1e3a8a] divide-x-[1.5px] divide-x-reverse divide-[#1e3a8a] h-[4%]">
              <div className="w-3/5 bg-[#dbeafe] text-[#1e3a8a] font-bold flex items-center justify-center text-sm">إجمالي المبلغ</div>
              <div className="w-2/5 flex items-center justify-center font-bold text-sm bg-slate-50/50">{subtotal.toLocaleString('ar-SA')}</div>
            </div>
            <div className="flex border-b-[1.5px] border-[#1e3a8a] divide-x-[1.5px] divide-x-reverse divide-[#1e3a8a] h-[4%]">
              <div className="w-3/5 bg-[#dbeafe] text-[#1e3a8a] font-bold flex items-center justify-center text-sm">الخصم</div>
              <div className="w-2/5 flex items-center justify-center font-bold text-sm">
                <input type="number" min="0" value={discount} onChange={e => setDiscount(e.target.value)} className="w-full text-center bg-transparent focus:outline-none" />
              </div>
            </div>
            <div className="flex border-b-[1.5px] border-[#1e3a8a] divide-x-[1.5px] divide-x-reverse divide-[#1e3a8a] h-[4%]">
              <div className="w-3/5 bg-[#dbeafe] text-[#1e3a8a] font-bold flex items-center justify-center text-sm">صافي المبلغ</div>
              <div className="w-2/5 flex items-center justify-center font-bold text-sm bg-slate-50/50">{netAmount.toLocaleString('ar-SA')}</div>
            </div>
            <div className="flex border-b-[1.5px] border-[#1e3a8a] divide-x-[1.5px] divide-x-reverse divide-[#1e3a8a] h-[4%]">
              <div className="w-3/5 bg-[#dbeafe] text-[#1e3a8a] font-bold flex items-center justify-center text-sm">قيمة الضريبة</div>
              <div className="w-2/5 flex items-center justify-center font-bold text-sm bg-slate-50/50">{taxAmount > 0 ? taxAmount.toLocaleString('ar-SA') : ''}</div>
            </div>
            <div className="flex divide-x-[1.5px] divide-x-reverse divide-white h-10">
              <div className="w-3/5 bg-[#1e3a8a] text-white font-bold flex items-center justify-center">المبلغ الإجمالي</div>
              <div className="w-2/5 bg-[#1e3a8a] text-white flex items-center justify-center font-black">{grandTotal.toLocaleString('ar-SA')}</div>
            </div>
          </div>
        </div>

        {/* Signatures */}
        <div className="grid grid-cols-2 gap-[4%] mb-[3%] text-center sm:text-sm font-bold text-[#1e3a8a] relative">
          <div>
            <div className="mb-8">توقيع العميل</div>
            <div className="border-b-[1.5px] border-dotted border-[#1e3a8a] mx-12"></div>
          </div>
          <div className="relative">
            <div className="mb-8">توقيع البائع</div>
            <div className="border-b-[1.5px] border-dotted border-[#1e3a8a] mx-12"></div>
            {settings?.stampUrl && (
              <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/4 opacity-90 pointer-events-none mix-blend-multiply">
                 <OfficialStamp stampUrl={settings.stampUrl} />
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center font-bold text-[#1e3a8a] text-[1.2vh] sm:text-sm mt-auto relative pt-4 shrink-0">
          <div className="border-b-[1.5px] border-[#1e3a8a] absolute top-1/2 left-0 w-full -z-10"></div>
          <span className="bg-white px-4">مع خالص الشكر والتقدير</span>
        </div>
      </div>
      </div>
      </div>
      </div>
  );
};
