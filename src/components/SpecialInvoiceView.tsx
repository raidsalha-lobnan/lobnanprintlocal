import React, { useState, useEffect, useRef } from 'react';
import { DateInput } from '../components/common/DateInput';
import { X, Maximize2, Printer, Save, Truck, Plus, Trash2 } from 'lucide-react';
import { OfficialStamp } from './common/OfficialStamp';
import { useAccounting } from '../context/AccountingContext';
import { Party, InventoryItem } from '../types';
import { posSound } from '../utils/audio';

export interface SpecialInvoiceViewProps {
  onClose: () => void;
}

export const SpecialInvoiceView: React.FC<SpecialInvoiceViewProps> = ({ onClose }) => {
  const { invoices, settings, parties, inventory, addPosInvoice, addPosInvoiceOnline, getItemPriceForCustomer } = useAccounting();

  // Floating Window State
  const [position, setPosition] = useState(() => {
    const saved = localStorage.getItem('special_invoice_pos');
    return saved ? JSON.parse(saved) : { x: 50, y: 50 };
  });
  const [size, setSize] = useState(() => {
    const saved = localStorage.getItem('special_invoice_size');
    return saved ? JSON.parse(saved) : { w: 900, h: 600 };
  });
  const [isFullScreen, setIsFullScreen] = useState(false);

  const windowRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, initialX: 0, initialY: 0 });

  const isResizing = useRef(false);
  const resizeStart = useRef({ x: 0, y: 0, initialW: 0, initialH: 0 });

  // Invoice Data State with draft recovery across refreshes
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [date, setDate] = useState(() => {
    try {
      const saved = localStorage.getItem('special_inv_draft');
      if (saved) return JSON.parse(saved).date || new Date().toISOString().split('T')[0];
    } catch {}
    return new Date().toISOString().split('T')[0];
  });
  
  // Customer Data
  const [selectedCustomerId, setSelectedCustomerId] = useState(() => {
    try {
      const saved = localStorage.getItem('special_inv_draft');
      if (saved) return JSON.parse(saved).selectedCustomerId || '';
    } catch {}
    return '';
  });
  const [customerName, setCustomerName] = useState(() => {
    try {
      const saved = localStorage.getItem('special_inv_draft');
      if (saved) return JSON.parse(saved).customerName || '';
    } catch {}
    return '';
  });
  const [customerPhone, setCustomerPhone] = useState(() => {
    try {
      const saved = localStorage.getItem('special_inv_draft');
      if (saved) return JSON.parse(saved).customerPhone || '';
    } catch {}
    return '';
  });
  const [customerAddress, setCustomerAddress] = useState(() => {
    try {
      const saved = localStorage.getItem('special_inv_draft');
      if (saved) return JSON.parse(saved).customerAddress || '';
    } catch {}
    return '';
  });
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  
  // Seller Data
  const [sellerName, setSellerName] = useState('');
  const [sellerPhone, setSellerPhone] = useState('');
  const [sellerAddress, setSellerAddress] = useState('');

  // Items
  const [items, setItems] = useState<Array<{ name: string; itemNotes: string; quantity: string; price: string; total: string }>>(() => {
    try {
      const saved = localStorage.getItem('special_inv_draft');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed.items) && parsed.items.length > 0) return parsed.items;
      }
    } catch {}
    return Array(12).fill(null).map(() => ({ name: '', itemNotes: '', quantity: '', price: '', total: '' }));
  });
  
  const [activeItemIndex, setActiveItemIndex] = useState<number | null>(null);

  // Totals
  const [notes, setNotes] = useState(() => {
    try {
      const saved = localStorage.getItem('special_inv_draft');
      if (saved) return JSON.parse(saved).notes || '';
    } catch {}
    return '';
  });
  const [discount, setDiscount] = useState(() => {
    try {
      const saved = localStorage.getItem('special_inv_draft');
      if (saved) return JSON.parse(saved).discount || '';
    } catch {}
    return '';
  });
  const [tax, setTax] = useState(() => {
    try {
      const saved = localStorage.getItem('special_inv_draft');
      if (saved) return JSON.parse(saved).tax || '';
    } catch {}
    return '';
  });

  // حفظ مسودة الفاتورة الخاصة تلقائياً عند أي تعديل
  useEffect(() => {
    try {
      const hasContent = customerName.trim() !== '' || customerPhone.trim() !== '' || notes.trim() !== '' || items.some(it => it.name.trim() !== '');
      if (hasContent) {
        localStorage.setItem('special_inv_draft', JSON.stringify({
          customerName, customerPhone, customerAddress, items, notes, discount, tax, date
        }));
      } else {
        localStorage.removeItem('special_inv_draft');
      }
    } catch {}
  }, [customerName, customerPhone, customerAddress, items, notes, discount, tax, date]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        localStorage.setItem('special_inv_draft', JSON.stringify({
          customerName, customerPhone, customerAddress, items, notes, discount, tax, date
        }));
      } catch {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [customerName, customerPhone, customerAddress, items, notes, discount, tax, date]);


  useEffect(() => {
    if (settings) {
      setSellerName(settings.companyName || '');
      setSellerPhone(settings.phone || '');
      setSellerAddress(settings.address || '');
    }
  }, [settings]);

  // Derived Values
  const customers = parties.filter(p => p.type === 'customer' && p.name.includes(customerName) && customerName.trim() !== '');
  
  const handleSelectCustomer = (c: Party) => {
    setSelectedCustomerId(c.id);
    setCustomerName(c.name);
    setCustomerPhone(c.phone || '');
    setCustomerAddress(c.address || '');
    setShowCustomerDropdown(false);

    // Immediately adopt preferred prices for all rows in the invoice
    setItems(prevItems => prevItems.map(row => {
      if (!row.name || !row.name.trim()) return row;
      const matchedInv = inventory.find(i => i.name.trim().toLowerCase() === row.name.trim().toLowerCase() || (i.code && i.code.toLowerCase() === row.name.trim().toLowerCase()));
      if (matchedInv) {
        const { price } = getItemPriceForCustomer(matchedInv, c.id);
        const qty = parseFloat(row.quantity) || 0;
        return {
          ...row,
          price: price.toString(),
          total: qty > 0 ? (qty * price).toFixed(2) : row.total
        };
      }
      return row;
    }));
  };

  const handleItemChange = (index: number, field: string, value: string) => {
    const newItems = [...items];
    (newItems[index] as any)[field] = value;

    if (field === 'quantity' || field === 'price') {
      const qty = parseFloat(newItems[index].quantity) || 0;
      const prc = parseFloat(newItems[index].price) || 0;
      if (qty > 0 || prc > 0) {
        newItems[index].total = (qty * prc).toFixed(2);
      } else {
        newItems[index].total = '';
      }
    }

    setItems(newItems);
  };

  const selectInventoryItem = (index: number, invItem: InventoryItem) => {
    const newItems = [...items];
    const { price } = getItemPriceForCustomer(invItem, selectedCustomerId);
    newItems[index].name = invItem.name;
    newItems[index].price = price.toString();
    setActiveItemIndex(null);
    
    // recalc total if qty exists
    const qty = parseFloat(newItems[index].quantity) || 0;
    if (qty > 0) {
      newItems[index].total = (qty * price).toFixed(2);
    }
    setItems(newItems);
  };
  const handleAddDeliveryService = () => {
    const deliveryService = inventory.find(
      i => i.id === 'srv-delivery' || i.name.includes('خدمة توصيل') || i.name.includes('توصيل')
    );
    const price = deliveryService ? deliveryService.sellingPrice.toString() : '20';
    
    // Check if there's an empty line to replace, else append
    const emptyIndex = items.findIndex(it => !it.name.trim() && !it.itemNotes.trim() && !it.total);
    if (emptyIndex !== -1) {
      const newItems = [...items];
      newItems[emptyIndex] = {
        name: deliveryService ? deliveryService.name : 'خدمة توصيل',
        itemNotes: 'خدمة توصيل طلبات',
        quantity: '1',
        price: price,
        total: price
      };
      setItems(newItems);
    } else {
      setItems(prev => [
        ...prev,
        {
          name: deliveryService ? deliveryService.name : 'خدمة توصيل',
          itemNotes: 'خدمة توصيل طلبات',
          quantity: '1',
          price: price,
          total: price
        }
      ]);
    }
    posSound.playSuccessBeep();
  };

  const handleAddNewLine = () => {
    setItems(prev => [
      ...prev,
      { name: '', itemNotes: '', quantity: '', price: '', total: '' }
    ]);
  };

  const subTotal = items.reduce((acc, item) => acc + (parseFloat(item.total) || 0), 0);
  const netAmount = subTotal - (parseFloat(discount) || 0);
  const grandTotal = netAmount + (parseFloat(tax) || 0);

  // Drag Logic
  const handleMouseDown = (e: React.MouseEvent) => {
    if (isFullScreen) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, button, .no-drag')) return;
    
    isDragging.current = true;
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      initialX: position.x,
      initialY: position.y
    };
  };

  // Resize Logic
  const handleResizeDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    isResizing.current = true;
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      initialW: size.w,
      initialH: size.h
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging.current) {
        const dx = e.clientX - dragStart.current.x;
        const dy = e.clientY - dragStart.current.y;
        setPosition({
          x: Math.max(0, dragStart.current.initialX + dx),
          y: Math.max(0, dragStart.current.initialY + dy)
        });
      } else if (isResizing.current) {
        const dx = e.clientX - resizeStart.current.x;
        const dy = e.clientY - resizeStart.current.y;
        setSize({
          w: Math.max(400, resizeStart.current.initialW + dx),
          h: Math.max(300, resizeStart.current.initialH + dy)
        });
      }
    };

    const handleMouseUp = () => {
      if (isDragging.current) {
        localStorage.setItem('special_invoice_pos', JSON.stringify(position));
        isDragging.current = false;
      }
      if (isResizing.current) {
        localStorage.setItem('special_invoice_size', JSON.stringify(size));
        isResizing.current = false;
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [position, size]);

  const handlePrint = () => {
    posSound.playSuccessBeep();
    window.print();
  };

  const handleSave = async () => {
    const validItems = items.filter(i => (i.name || i.itemNotes) && Number(i.total) > 0);
    if (validItems.length === 0) {
      alert('يجب إدخال صنف واحد على الأقل مع إجمالي صحيح');
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
        quantity: Number(i.quantity) || 1,
        unitPrice: Number(i.price) || 0,
        total: Number(i.total),
        isCustom: true
      })),
      subtotal: validItems.reduce((sum, item) => sum + Number(item.total), 0),
      discountTotal: Number(discount) || 0,
      taxRate: settings.vatRate,
      taxAmount: Number(tax) || 0,
      totalAmount: grandTotal,
      paidAmount: grandTotal,
      remainingAmount: 0,
      paymentMethod: 'cash',
      status: 'paid',
      notes,
    });

    if (!res.success) {
      alert(`تعذر الترحيل السحابي للفاتورة: ${res.error || 'خطأ غير معروف'}\nكافة المدخلات محفوظة على الشاشة.`);
      return;
    }

    const assignedNumber = res.invoice?.invoiceNumber || invoiceNumber;
    setInvoiceNumber(assignedNumber);
    alert(`تم ترحيل وحفظ الفاتورة بنجاح في السيرفر وسجل المبيعات برقم (#${assignedNumber}) 🟢`);
  };
  return (
    <>
      <style>
        {`
          @media print {
            body * { visibility: hidden; }
            .special-invoice-print, .special-invoice-print * { visibility: visible; }
            .special-invoice-print {
              position: absolute;
              left: 0;
              top: 0;
              width: 100% !important;
              margin: 0 !important;
              padding: 0 !important;
              box-shadow: none !important;
              border: none !important;
              transform: none !important;
              background: white !important;
            }
            .special-invoice-print .no-print { display: none !important; }
            
            /* Make inputs look like text in print */
            .special-invoice-print input, 
            .special-invoice-print textarea {
               border: none !important;
               background: transparent !important;
               box-shadow: none !important;
               outline: none !important;
               resize: none !important;
            }
            /* Remove placeholder text in print */
            .special-invoice-print input::placeholder,
            .special-invoice-print textarea::placeholder {
               color: transparent !important;
            }
          }
        `}
      </style>
      
      <div 
        className="w-full h-full flex flex-col bg-slate-50 overflow-hidden special-invoice-print"
        dir="rtl"
      >
        {/* Header - No Print */}
        <div className="flex items-center justify-between bg-white p-4 shadow-sm border-b border-slate-200 no-print shrink-0 w-full">
          <div>
            <h2 className="text-lg font-bold text-slate-800">فاتورة مبيعات خاصة</h2>
            <p className="text-[10px] text-slate-400 font-light">تنسيق خاص لفواتير المبيعات مع خيارات مرنة</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold text-sm shadow-sm transition-colors">
              <Save className="w-4 h-4" />
              <span>حفظ بالسجل</span>
            </button>
            <button onClick={handlePrint} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm shadow-sm transition-colors">
              <Printer className="w-4 h-4" />
              <span>طباعة الفاتورة</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-8 bg-white" onClick={() => { setShowCustomerDropdown(false); setActiveItemIndex(null); }}>
          
          <div className="max-w-[800px] mx-auto">
            {/* Top Section */}
            <div className="flex justify-between items-center mb-6">
              <div className="border-[1.5px] border-[#1f375b] rounded-md p-2 flex flex-col items-center justify-center text-center w-48 shadow-sm">
                <span className="font-bold text-[#1f375b] mb-1 text-sm">رقم الفاتورة</span>
                <input 
                  type="text" 
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  placeholder="تلقائي بعد الحفظ"
                  className="w-full text-center font-bold text-lg outline-none bg-transparent"
                />
              </div>

              <div className="bg-[#1f375b] text-white px-12 py-3 rounded-lg font-bold text-2xl shadow-md">
                فاتورة مبيعات
              </div>

              <div className="border border-[#1f375b] rounded-lg px-4 py-2 flex items-center gap-2 w-64">
                <span className="font-bold text-[#1f375b]">التاريخ :</span>
                <DateInput value={date} onChange={(e) => setDate(e.target.value)}
                  className="flex-1 border-b border-dotted border-slate-400 focus:outline-none text-center font-bold text-sm bg-transparent"
                />
              </div>
            </div>

            {/* Parties Info */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              {/* Seller */}
              <div className="border border-[#1f375b] rounded-lg overflow-hidden">
                <div className="bg-[#1f375b]/10 text-center font-bold text-[#1f375b] py-2 border-b border-[#1f375b]">
                  بيانات البائع
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-700 w-24">اسم المنشأة :</span>
                    <input 
                      type="text" 
                      value={sellerName}
                      onChange={(e) => setSellerName(e.target.value)}
                      className="flex-1 border-b border-slate-400 border-dotted focus:outline-none focus:border-blue-500 text-sm py-1 bg-transparent" 
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-700 w-24">رقم الهاتف :</span>
                    <input 
                      type="text" 
                      value={sellerPhone}
                      onChange={(e) => setSellerPhone(e.target.value)}
                      className="flex-1 border-b border-slate-400 border-dotted focus:outline-none focus:border-blue-500 text-sm py-1 bg-transparent tabular-nums text-right" 
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-700 w-24">العنوان :</span>
                    <input 
                      type="text" 
                      value={sellerAddress}
                      onChange={(e) => setSellerAddress(e.target.value)}
                      className="flex-1 border-b border-slate-400 border-dotted focus:outline-none focus:border-blue-500 text-sm py-1 bg-transparent" 
                    />
                  </div>
                </div>
              </div>

              {/* Customer */}
              <div className="border border-[#1f375b] rounded-lg overflow-hidden relative">
                <div className="bg-[#1f375b]/10 text-center font-bold text-[#1f375b] py-2 border-b border-[#1f375b]">
                  بيانات العميل
                </div>
                <div className="p-4 space-y-4">
                  <div className="flex items-center gap-2 relative">
                    <span className="font-bold text-sm text-slate-700 w-24">اسم العميل :</span>
                    <input 
                      type="text" 
                      value={customerName}
                      onChange={(e) => {
                        setCustomerName(e.target.value);
                        setShowCustomerDropdown(true);
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="ابحث عن عميل أو أدخل اسم جديد..."
                      className="flex-1 border-b border-slate-400 border-dotted focus:outline-none focus:border-blue-500 text-sm py-1 bg-transparent" 
                    />
                    {showCustomerDropdown && customers.length > 0 && (
                      <div className="absolute top-full right-24 left-0 mt-1 bg-white border border-slate-200 rounded shadow-lg z-50 max-h-48 overflow-y-auto no-print">
                        {customers.map(c => (
                          <div 
                            key={c.id} 
                            className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0"
                            onClick={() => handleSelectCustomer(c)}
                          >
                            <div className="font-bold">{c.name}</div>
                            {(c.phone || c.address) && (
                              <div className="text-xs text-slate-500 flex gap-2">
                                {c.phone && <span>{c.phone}</span>}
                                {c.address && <span>{c.address}</span>}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-700 w-24">رقم الهاتف :</span>
                    <input 
                      type="text" 
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      className="flex-1 border-b border-slate-400 border-dotted focus:outline-none focus:border-blue-500 text-sm py-1 bg-transparent tabular-nums text-right" 
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-slate-700 w-24">العنوان :</span>
                    <input 
                      type="text" 
                      value={customerAddress}
                      onChange={(e) => setCustomerAddress(e.target.value)}
                      className="flex-1 border-b border-slate-400 border-dotted focus:outline-none focus:border-blue-500 text-sm py-1 bg-transparent" 
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Table Actions Header */}
            <div className="flex items-center justify-between mb-2 no-print">
              <span className="text-xs font-bold text-slate-600">بنود الفاتورة:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleAddDeliveryService}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-2xs transition-colors cursor-pointer"
                  title="إضافة خدمة توصيل تلقائياً كبند في الفاتورة"
                >
                  <Truck className="w-3.5 h-3.5" />
                  <span>+ خدمة توصيل</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddNewLine}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs transition-colors cursor-pointer"
                  title="إضافة سطر بند جديد"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ إضافة سطر</span>
                </button>
              </div>
            </div>

            {/* Table */}
            <div className="border border-[#1f375b] rounded-lg overflow-hidden mb-6 relative">
              <table className="w-full text-center border-collapse relative">
                <thead>
                  <tr className="bg-[#1f375b]/10 text-[#1f375b] font-bold text-sm">
                    <th className="py-2 border-b border-l border-[#1f375b] w-12">م</th>
                    <th className="py-2 border-b border-l border-[#1f375b] w-48">الصنف</th>
                    <th className="py-2 border-b border-l border-[#1f375b]">البيان</th>
                    <th className="py-2 border-b border-l border-[#1f375b] w-24">الكمية</th>
                    <th className="py-2 border-b border-l border-[#1f375b] w-24">سعر الوحدة</th>
                    <th className="py-2 border-b border-[#1f375b] w-32">الإجمالي</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, idx) => {
                    const itemResults = inventory.filter(i => i.name.includes(item.name) && item.name.trim() !== '');
                    return (
                      <tr key={`spec-item-${item.id || idx}-${idx}`} className="group">
                        <td className="py-1 border-b border-l border-[#1f375b] font-bold text-sm bg-slate-50/50">{idx + 1}</td>
                        {/* عمود الصنف المستقل */}
                        <td className="border-b border-l border-[#1f375b] p-0 relative bg-white">
                          <input 
                            type="text" 
                            value={item.name}
                            onChange={(e) => {
                              handleItemChange(idx, 'name', e.target.value);
                              setActiveItemIndex(idx);
                            }}
                            onFocus={() => setActiveItemIndex(idx)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="اختر أو اكتب الصنف..."
                            className="w-full px-2.5 py-1.5 text-sm font-bold text-right focus:outline-none bg-transparent"
                          />

                          {/* Item Dropdown */}
                          {activeItemIndex === idx && itemResults.length > 0 && (
                            <div className="absolute top-full right-0 w-full mt-1 bg-white border border-slate-200 rounded shadow-lg z-50 max-h-48 overflow-y-auto no-print text-right">
                              {itemResults.map((invItem, iIdx) => (
                                <div 
                                  key={`spec-inv-${invItem.id || iIdx}-${iIdx}`} 
                                  className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-sm border-b last:border-b-0 flex justify-between"
                                  onClick={() => selectInventoryItem(idx, invItem)}
                                >
                                  <span className="font-bold">{invItem.name}</span>
                                  {(() => {
                                    const pInfo = getItemPriceForCustomer(invItem, selectedCustomerId);
                                    return (
                                      <span className="text-slate-500 tabular-nums flex items-center gap-1 font-mono">
                                        {pInfo.isSpecialPrice && <span className="text-[10px] text-amber-600 font-bold">★ خاص</span>}
                                        <span>{pInfo.price} {settings.currency || 'ر.س'}</span>
                                      </span>
                                    );
                                  })()}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* عمود البيان المستقل */}
                        <td className="border-b border-l border-[#1f375b] p-0 bg-white">
                          <input 
                            type="text" 
                            value={item.itemNotes}
                            onChange={(e) => handleItemChange(idx, 'itemNotes', e.target.value)}
                            placeholder="البيان، الشرح، أو تفاصيل البند..."
                            className="w-full px-2.5 py-1.5 text-sm text-right focus:outline-none bg-transparent text-slate-700 placeholder:text-slate-400"
                          />
                        </td>
                        <td className="border-b border-l border-[#1f375b] p-0 bg-white">
                          <input 
                            type="number" 
                            value={item.quantity}
                            onChange={(e) => handleItemChange(idx, 'quantity', e.target.value)}
                            className="w-full h-full px-2 py-1.5 text-sm text-center focus:outline-none bg-transparent tabular-nums"
                          />
                        </td>
                        <td className="border-b border-l border-[#1f375b] p-0 bg-white">
                          <input 
                            type="number" 
                            value={item.price}
                            onChange={(e) => handleItemChange(idx, 'price', e.target.value)}
                            className="w-full h-full px-2 py-1.5 text-sm text-center focus:outline-none bg-transparent tabular-nums"
                          />
                        </td>
                        <td className="border-b border-[#1f375b] p-0 bg-slate-50/50">
                          <input 
                            type="number" 
                            value={item.total}
                            readOnly
                            className="w-full h-full px-2 py-1.5 text-sm text-center font-bold text-slate-800 focus:outline-none bg-transparent tabular-nums"
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Footer Data */}
            <div className="grid grid-cols-2 gap-4 mb-10">
              {/* Notes */}
              <div className="border border-[#1f375b] rounded-lg overflow-hidden flex flex-col h-full">
                <div className="bg-[#1f375b]/10 text-center font-bold text-[#1f375b] py-2 border-b border-[#1f375b]">
                  ملاحظات
                </div>
                <textarea 
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="flex-1 p-3 text-sm resize-none focus:outline-none bg-transparent w-full"
                ></textarea>
              </div>

              {/* Totals */}
              <div className="border border-[#1f375b] rounded-lg overflow-hidden flex flex-col">
                <div className="flex border-b border-[#1f375b]">
                  <div className="w-1/2 bg-[#1f375b]/10 text-[#1f375b] font-bold text-center py-1.5 border-l border-[#1f375b] flex items-center justify-center text-sm">
                    إجمالي المبلغ
                  </div>
                  <div className="w-1/2 p-0">
                    <div className="w-full h-full px-3 py-1.5 text-center text-sm font-bold flex items-center justify-center tabular-nums">
                      {subTotal > 0 ? subTotal.toFixed(2) : ''}
                    </div>
                  </div>
                </div>
                <div className="flex border-b border-[#1f375b]">
                  <div className="w-1/2 bg-[#1f375b]/10 text-[#1f375b] font-bold text-center py-1.5 border-l border-[#1f375b] flex items-center justify-center text-sm">
                    الخصم
                  </div>
                  <div className="w-1/2 p-0 bg-white">
                    <input 
                      type="number" 
                      value={discount}
                      onChange={(e) => setDiscount(e.target.value)}
                      className="w-full h-full px-3 py-1.5 text-center text-sm text-rose-600 focus:outline-none bg-transparent font-bold tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex border-b border-[#1f375b]">
                  <div className="w-1/2 bg-[#1f375b]/10 text-[#1f375b] font-bold text-center py-1.5 border-l border-[#1f375b] flex items-center justify-center text-sm">
                    صافي المبلغ
                  </div>
                  <div className="w-1/2 p-0">
                    <div className="w-full h-full px-3 py-1.5 text-center text-sm font-bold flex items-center justify-center tabular-nums">
                      {netAmount > 0 ? netAmount.toFixed(2) : ''}
                    </div>
                  </div>
                </div>
                <div className="flex border-b border-[#1f375b]">
                  <div className="w-1/2 bg-[#1f375b]/10 text-[#1f375b] font-bold text-center py-1.5 border-l border-[#1f375b] flex items-center justify-center text-sm">
                    قيمة الضريبة
                  </div>
                  <div className="w-1/2 p-0 bg-white">
                    <input 
                      type="number" 
                      value={tax}
                      onChange={(e) => setTax(e.target.value)}
                      className="w-full h-full px-3 py-1.5 text-center text-sm text-blue-600 focus:outline-none bg-transparent font-bold tabular-nums"
                    />
                  </div>
                </div>
                <div className="flex bg-[#1f375b] text-white flex-1">
                  <div className="w-1/2 font-bold text-center py-2 border-l border-slate-600 flex items-center justify-center">
                    المبلغ الإجمالي
                  </div>
                  <div className="w-1/2 font-bold text-center py-2 flex items-center justify-center tabular-nums text-xl">
                    {grandTotal > 0 ? grandTotal.toFixed(2) : ''}
                  </div>
                </div>
              </div>
            </div>

            {/* Signatures */}
            <div className="flex justify-between items-end mt-12 px-8 mb-8 h-24">
              <div className="text-center w-48 relative">
                <div className="font-bold text-slate-800 mb-6">توقيع العميل</div>
                <div className="border-b border-dotted border-slate-400 w-full"></div>
              </div>
              <div className="text-center text-[#1f375b] font-bold text-lg mb-2">
                مع خالص الشكر والتقدير
              </div>
              <div className="text-center w-48 relative">
                <div className="font-bold text-slate-800 mb-6 relative z-10">توقيع البائع</div>
                
                {/* Stamp */}
                {settings?.stampUrl && (
                  <div className="absolute -top-12 left-1/2 -translate-x-1/2 opacity-90 pointer-events-none mix-blend-multiply z-0">
                    <OfficialStamp stampUrl={settings.stampUrl} />
                  </div>
                )}
                
                <div className="border-b border-dotted border-slate-400 w-full relative z-10"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
