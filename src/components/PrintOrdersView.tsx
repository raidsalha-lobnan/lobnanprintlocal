import React, { useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Invoice, InvoiceItem, LineAttachment, PosInvoiceWorkflowStatus } from '../types';
import {
  Printer,
  Clock,
  CheckCircle,
  Play,
  CheckSquare,
  FileText,
  Eye,
  Download,
  Upload,
  MessageSquare,
  Lock,
  Search,
  Filter,
  Layers,
  Columns,
  List,
  Calendar,
  User,
  Shield,
  ShieldAlert,
  AlertCircle,
  Copy,
  Check,
  Plus,
  PlusCircle,
  Trash2,
  Trash,
  Square
} from 'lucide-react';
import { posSound } from '../utils/audio';
import { InvoiceStatusHistoryModal } from './pos/InvoiceStatusHistoryModal';
import { WorkshopAttachmentModal } from './workshop/WorkshopAttachmentModal';
import { WorkshopTechnicalNoteModal } from './workshop/WorkshopTechnicalNoteModal';
import { formatInvoiceCustomerDisplay } from '../utils/partyUtils';

export const WORKSHOP_STATUSES: Array<{
  id: 'design' | 'pending_approval' | 'print_external' | 'print_internal' | 'ready';
  label: string;
  color: string;
  border: string;
  bg: string;
  badgeBg: string;
  badgeText: string;
  description: string;
}> = [
  {
    id: 'design',
    label: 'تصميم',
    color: 'text-purple-700',
    border: 'border-purple-300',
    bg: 'bg-purple-50/50',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-900',
    description: 'مرحلة إعداد وتجهيز البروفات والتصاميم'
  },
  {
    id: 'pending_approval',
    label: 'بانتظار الاعتماد',
    color: 'text-amber-700',
    border: 'border-amber-300',
    bg: 'bg-amber-50/50',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-900',
    description: 'تنتظر موافقة واعتماد العميل للبدء'
  },
  {
    id: 'print_external',
    label: 'طباعة خارجي',
    color: 'text-sky-700',
    border: 'border-sky-300',
    bg: 'bg-sky-50/50',
    badgeBg: 'bg-sky-100',
    badgeText: 'text-sky-900',
    description: 'قيد التنفيذ لدى ورش ومطابع خارجية'
  },
  {
    id: 'print_internal',
    label: 'طباعة داخلي',
    color: 'text-blue-700',
    border: 'border-blue-300',
    bg: 'bg-blue-50/50',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-900',
    description: 'قيد السحب والتشغيل داخل ماكينات المطبعة'
  },
  {
    id: 'ready',
    label: 'جاهز للتسليم',
    color: 'text-emerald-700',
    border: 'border-emerald-300',
    bg: 'bg-emerald-50/50',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-900',
    description: 'اكتملت الطباعة والتشطيب وجاهزة للتسليم'
  }
];

export const PrintOrdersView: React.FC = () => {
  const {
    invoices,
    updateInvoice,
    addInvoiceTechnicalNote,
    addInvoiceItemAttachment,
    removeInvoiceItemAttachment,
    startInvoicePrinting,
    finishInvoicePrinting,
    setSelectedInvoiceForPrint,
    setSelectedJobForPrint,
    printOrders,
    deletePrintOrder,
    deleteMultiplePrintOrders,
    deleteAllPrintOrders,
    currentUser,
    hasPermission,
    setActiveTab,
    parties
  } = useAccounting();

  const ALL_STATUSES = [...WORKSHOP_STATUSES, ...(hasPermission('edit_invoices') ? [{ id: 'delivered' as any, label: 'تم التسليم', color: 'text-emerald-700', border: 'border-emerald-300', bg: 'bg-emerald-50/50', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-900', description: 'تم تسليمها للعميل نهائياً' }] : [])];

  // Navigation and Filter States
  const [activeViewMode, setActiveViewMode] = useState<'kanban' | 'list'>('kanban');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedInvoiceId, setCopiedInvoiceId] = useState<string | null>(null);
  const [expandedInvoices, setExpandedInvoices] = useState<Set<string>>(new Set());
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    const newSet = new Set(expandedInvoices);
    if(newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setExpandedInvoices(newSet);
  };

  const toggleSelectOrder = (id: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Modals state
  const [activeAttachmentTarget, setActiveAttachmentTarget] = useState<{
    invoice: Invoice;
    item: InvoiceItem;
    itemIndex: number;
  } | null>(null);

  const [activeTechnicalNoteInvoice, setActiveTechnicalNoteInvoice] = useState<Invoice | null>(null);
  const [activeStatusHistoryInvoice, setActiveStatusHistoryInvoice] = useState<Invoice | null>(null);
  const [initialStatusForHistory, setInitialStatusForHistory] = useState<PosInvoiceWorkflowStatus | undefined>();

  // Permission Check: Changing invoice status requires approval or edit permission, or supervisor roles
  const canChangeStatus =
    hasPermission('approve') ||
    hasPermission('edit') ||
    currentUser?.roleId === 'role-super-admin' ||
    currentUser?.roleId === 'role-manager' ||
    currentUser?.roleId === 'role-production-mgr';

  // Normalize any workflow status into the 5 explicit workshop stages
  // فواتير حالة "جديد" أو "عروض" لا تظهر في أوامر الطباعة والورشة
  const normalizeWorkflowStatus = (
    status?: string
  ): 'design' | 'pending_approval' | 'print_external' | 'print_internal' | 'ready' | null => {
    if (!status || status === 'new' || status === 'draft' || status === 'pending' || status === 'quotation') return null;
    if (status === 'delivered' || (status as any) === 'completed' || status === 'cancelled') return null;
    if (status === 'design' || status === 'designing') return 'design';
    if (status === 'pending_approval') return 'pending_approval';
    if (status === 'print_external' || status === 'in_progress_external') return 'print_external';
    if (
      status === 'print_internal' ||
      status === 'in_progress_internal' ||
      status === 'in_progress' ||
      status === 'printing' ||
      status === 'finishing'
    ) {
      return 'print_internal';
    }
    if (status === 'ready') return 'ready';
    return null;
  };

  const standaloneOrdersMapped: Invoice[] = React.useMemo(() => {
    const existingInvIds = new Set(invoices.map(i => i.id));
    return printOrders
      .filter(po => !po.associatedInvoiceId || !existingInvIds.has(po.associatedInvoiceId))
      .map(po => ({
        id: po.id,
        invoiceNumber: po.orderNumber || po.id,
        customerId: po.customerId,
        customerName: po.customerName,
        subCustomerName: po.subCustomerName,
        customerPhone: po.customerPhone,
        date: po.createdAt ? po.createdAt.split('T')[0] : new Date().toISOString().split('T')[0],
        time: po.createdAtTime || (po.createdAt ? po.createdAt.split('T')[1]?.substring(0, 5) : '00:00'),
        items: po.items && po.items.length > 0 ? po.items : [
          {
            itemId: 'custom-print',
            itemCode: 'PRN',
            itemName: po.title || 'أمر طباعة مخصص',
            quantity: po.quantity || 1,
            unitPrice: po.unitCost || 0,
            totalPrice: po.totalPrice || 0,
            unit: 'قطعة',
            notes: `${po.paperType || ''} ${po.dimensions || ''} ${po.colorType || ''} ${(po.finishingOptions || []).join(', ')}`.trim()
          }
        ],
        subtotal: po.totalPrice || 0,
        taxAmount: 0,
        taxRate: 0,
        discountTotal: 0,
        totalAmount: po.totalPrice || 0,
        paidAmount: po.depositPaid || 0,
        remainingAmount: po.remainingBalance || 0,
        paymentStatus: (po.remainingBalance || 0) <= 0 ? 'paid' : (po.depositPaid || 0) > 0 ? 'partial' : 'unpaid',
        paymentMethod: 'cash',
        type: 'standard' as const,
        status: 'draft' as const,
        workflowStatus: (po.status as any) || 'design',
        notes: po.notes || po.title || '',
        isPrintOrder: true,
        isWorkshopVisible: true,
        deliveryDate: po.deliveryDate
      } as unknown as Invoice));
  }, [printOrders, invoices]);

  const allWorkshopInvoices = React.useMemo(() => {
    return [...invoices, ...standaloneOrdersMapped];
  }, [invoices, standaloneOrdersMapped]);

  // Filter invoices to ONLY include the 5 workshop work statuses:
  // أي فاتورة يتم تغير حالتها لتم التسليم لا تظهر في شاشة أوامر الطباعة والورشة ويتم اعتماد حالة الفاتورة أنه تم التسليم
  const workshopInvoices = allWorkshopInvoices.filter((inv) => {
    // القاعدة الصارمة: عندما تكون حالة الفاتورة جديد لا تظهر هذه الفاتورة في أوامر الطباعة والورشة
    if (!inv.workflowStatus || inv.workflowStatus === 'new' || inv.status === 'new' || inv.workflowStatus === 'quotation') {
      return false;
    }

    const isSuperAdminOrMgr = currentUser?.roleId === 'role-super-admin' || currentUser?.roleId === 'role-manager';
    if (!isSuperAdminOrMgr && !hasPermission('edit') && !hasPermission('view_invoices') && (inv.workflowStatus === 'delivered' || inv.status === 'delivered' || inv.workflowStatus === 'completed')) {
      return false;
    }
    const normalized = normalizeWorkflowStatus(inv.workflowStatus);
    // Strict requirement: Only show active work statuses (design, pending_approval, print_external, print_internal, ready)
    if (!normalized) return false;

    // Filter by single status if selected
    if (selectedStatusFilter !== 'all' && normalized !== selectedStatusFilter) {
      return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const formattedCust = formatInvoiceCustomerDisplay(inv, parties).toLowerCase();
      const numMatch = inv.invoiceNumber?.toLowerCase().includes(q);
      const custMatch = inv.customerName?.toLowerCase().includes(q) || formattedCust.includes(q);
      const subMatch = inv.subCustomerName?.toLowerCase().includes(q);
      const notesMatch = inv.notes?.toLowerCase().includes(q);
      const itemsMatch = inv.items?.some(
        (it) =>
          it.itemName?.toLowerCase().includes(q) ||
          it.notes?.toLowerCase().includes(q) ||
          it.description?.toLowerCase().includes(q)
      );
      return numMatch || custMatch || subMatch || notesMatch || itemsMatch;
    }

    return true;
  });

  // Calculate stats count per stage (excluding new, quotation, and delivered)
  const countsByStatus = ALL_STATUSES.reduce((acc, col) => {
    acc[col.id] = workshopInvoices.filter((inv) => 
      normalizeWorkflowStatus(inv.workflowStatus) === col.id
    ).length;
    return acc;
  }, {} as Record<string, number>);

  const handleCopyNumber = (num: string, invId: string) => {
    navigator.clipboard.writeText(num);
    posSound.click();
    setCopiedInvoiceId(invId);
    setTimeout(() => setCopiedInvoiceId(null), 2000);
  };

  const handleStartPrinting = (inv: Invoice) => {
    posSound.beep();
    startInvoicePrinting(inv.id);
  };

  const handleFinishPrinting = (inv: Invoice) => {
    posSound.success();
    finishInvoicePrinting(inv.id);
  };
  
  const handleDirectStatusChange = (invoice: Invoice, newStatus: PosInvoiceWorkflowStatus) => {
    if (!canChangeStatus) {
      posSound.error();
      return;
    }
    posSound.click();
    const isDelivered = newStatus === 'delivered';
    updateInvoice(
      invoice.id,
      { 
        workflowStatus: newStatus,
        ...(isDelivered ? { status: 'delivered', deliveredAt: new Date().toISOString() } : {})
      },
      {
        notes: isDelivered
          ? 'اعتماد الفاتورة (تم التسليم) وأرشفتها من شاشة أوامر الطباعة والورشة'
          : `تغيير الحالة في شاشة الورشة إلى "${ALL_STATUSES.find((s) => s.id === newStatus)?.label || newStatus}"`,
        userName: currentUser?.fullName || currentUser?.username || 'فني الورشة',
        userId: currentUser?.id
      }
    );
  };

  // Helper to open status history modal
  const openStatusHistory = (inv: Invoice, target?: PosInvoiceWorkflowStatus) => {
    setActiveStatusHistoryInvoice(inv);
    setInitialStatusForHistory(target);
  };

  const handleSelectAll = () => {
    if (selectedOrderIds.size === workshopInvoices.length && workshopInvoices.length > 0) {
      setSelectedOrderIds(new Set());
    } else {
      setSelectedOrderIds(new Set(workshopInvoices.map((inv) => inv.id)));
    }
  };

  const handleDeleteSingle = (inv: Invoice) => {
    if (
      window.confirm(
        `هل أنت متأكد من حذف أمر الطباعة/التشغيل رقم (${inv.invoiceNumber}) نهائياً؟\n\nتنبيه: سيتم إزالة أمر الشغيل فقط ولن يتم التأثير إطلاقاً على فواتير المبيعات المسجلة.`
      )
    ) {
      posSound.click();
      deletePrintOrder(inv.id);
      setSelectedOrderIds((prev) => {
        const next = new Set(prev);
        next.delete(inv.id);
        return next;
      });
    }
  };

  const handleDeleteSelected = () => {
    if (selectedOrderIds.size === 0) return;
    if (
      window.confirm(
        `هل أنت متأكد من حذف ${selectedOrderIds.size} من أوامر الطباعة والتشغيل المحددة نهائياً؟\n\nتنبيه: لن يتم التأثير على أي فواتير مبيعات مسجلة حالياً.`
      )
    ) {
      posSound.click();
      deleteMultiplePrintOrders(Array.from(selectedOrderIds));
      setSelectedOrderIds(new Set());
    }
  };

  const handleZeroAll = () => {
    if (workshopInvoices.length === 0 && printOrders.length === 0) {
      alert('لا توجد أوامر طباعة أو تشغيل لتصفيرها.');
      return;
    }
    const confirmMsg = `تأكيد هام ومؤكد:\n\nهل أنت متأكد من تصفير وتطهير كافة أوامر الطباعة والتشغيل والورشة نهائياً؟\n\n- سيتم حذف وتصفير جميع أوامر الشغيل الحالية نهائياً وعدم استرجاعها.\n- نؤكد لك أنه لن يتم المساس أو التأثير على أي من فواتير المبيعات أو المبالغ الحسابية المسجلة إطلاقاً.`;
    if (window.confirm(confirmMsg)) {
      posSound.beep();
      deleteAllPrintOrders();
      setSelectedOrderIds(new Set());
    }
  };

  // Render an individual invoice card containing ONLY requested fields:
  // - رقم الفاتورة
  // - اسم العميل (الزبون)
  // - الاسم الفرعي
  // - تاريخ التسليم
  // - ملاحظات الفاتورة
  // - جدول الفاتورة (مع فتح/تنزيل الملفات والتعديل وإعادة إرفاق)
  // Actions: بدء الطباعة، إنهاء الطباعة، إضافة ملاحظة فنية، تغيير الحالة حسب الصلاحية
  const renderInvoiceCard = (invoice: Invoice, isListView = false, index = 0) => {
    const normalizedStatus = normalizeWorkflowStatus(invoice.workflowStatus) || 'design';
    const statusMeta = ALL_STATUSES.find((s) => s.id === normalizedStatus)!;
    const isPrintingNow = normalizedStatus === 'print_internal';
    const isReadyForDelivery = normalizedStatus === 'ready';

    return (
      <div
        key={`po-card-${invoice.id || index}-${index}`}
        className={`bg-white rounded-xl border transition-all duration-200 shadow-xs hover:shadow-md flex flex-col justify-between ${
          isListView ? 'p-4 md:p-5' : 'p-3.5 sm:p-4'
        } ${
          isPrintingNow
            ? 'border-blue-300 ring-1 ring-blue-200'
            : isReadyForDelivery
            ? 'border-emerald-300'
            : 'border-slate-200'
        }`}
      >
        <div className="space-y-3">
          {/* Top Row: Compact Header with Selection Checkbox, Invoice, Status, Customer, and Notes */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2">
            <div className="flex items-center gap-2 flex-wrap flex-1">
              <input
                type="checkbox"
                checked={selectedOrderIds.has(invoice.id)}
                onChange={() => toggleSelectOrder(invoice.id)}
                className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer accent-blue-600 shrink-0"
                title="تحديد هذا الأمر للحذف أو الإجراءات الجماعية"
              />
              <button
                type="button"
                onClick={() => handleCopyNumber(invoice.invoiceNumber, invoice.id)}
                className="flex items-center gap-1 font-mono font-bold text-[11px] sm:text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 px-1.5 py-0.5 rounded border border-blue-200 transition-colors shrink-0"
                title="نسخ رقم الفاتورة"
              >
                <span>{invoice.invoiceNumber}</span>
                {copiedInvoiceId === invoice.id ? (
                  <Check className="w-3 h-3 text-emerald-600" />
                ) : (
                  <Copy className="w-3 h-3 opacity-60" />
                )}
              </button>

              {/* Status Badge */}
              <span
                className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full border ${statusMeta.badgeBg} ${statusMeta.badgeText} ${statusMeta.border}`}
              >
                {statusMeta.label}
              </span>

              {/* Customer Name & Sub-Name */}
              <div className="flex items-center gap-1.5 mr-1 shrink-0">
                <strong
                  className="text-slate-900 text-[11px] sm:text-xs font-bold truncate max-w-[200px] sm:max-w-[280px]"
                  title={formatInvoiceCustomerDisplay(invoice, parties)}
                >
                  {formatInvoiceCustomerDisplay(invoice, parties)}
                </strong>
              </div>

              {/* Invoice Notes */}
              {invoice.notes && (
                 <div className="text-amber-800 bg-amber-50/50 border border-amber-100 rounded px-1.5 py-0.5 text-[10px] sm:text-xs truncate max-w-[200px] sm:max-w-[300px] flex items-center gap-1" title={invoice.notes}>
                   <FileText className="w-3 h-3 opacity-70" />
                   <span className="truncate">{invoice.notes}</span>
                 </div>
              )}
            </div>

            {/* التواريخ: تاريخ الاستلام وتحته تاريخ التسليم وجعل الكلام والتاريخ سطر واحد */}
            <div className="flex flex-col gap-1 text-[10px] font-mono bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200 shrink-0">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-slate-500 whitespace-nowrap">تاريخ الاستلام:</span>
                <strong className="text-slate-800 font-mono">{invoice.date || 'اليوم'}</strong>
              </div>
              <div className="flex items-center justify-between gap-2 border-t border-slate-200/60 pt-0.5">
                <span className="font-bold text-amber-700 whitespace-nowrap">تاريخ التسليم:</span>
                <strong className="text-amber-900 font-mono font-bold">{invoice.deliveryDate || invoice.date || 'غير محدد'}</strong>
              </div>
            </div>
          </div>

          {/* Invoice Table: جدول الفاتورة */}
          <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
            <div className="bg-slate-100/90 px-3 py-1.5 text-[11px] font-bold text-slate-700 flex items-center justify-between border-b border-slate-200">
              <div className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-blue-600" />
                <span>جدول بنود الفاتورة ({invoice.items.length})</span>
              </div>
              <span className="text-[9px] text-slate-400 font-light font-normal">
                المقاسات، المواصفات، والملفات المرفقة
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-slate-50 text-slate-500 text-[10px] font-semibold border-b border-slate-200">
                  <tr>
                    <th className="p-2">الصنف</th>
                    <th className="p-2 text-center">الكمية</th>
                    <th className="p-2">البيان والملاحظات</th>
                    <th className="p-2 text-center">الملف المرفق والمراجعة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.items.map((it, idx) => {
                    const attachmentsCount = (it.attachments || []).length;
                    const originalCount = (it.attachments || []).filter((a) => a.isOriginal !== false).length;
                    const revisedCount = (it.attachments || []).filter((a) => a.isOriginal === false).length;

                    return (
                      <tr key={it.itemId || idx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="p-2 align-top">
                          <div className="font-bold text-slate-900 text-xs leading-tight">
                            <span>{it.itemName}</span>
                            {(it.notes || it.description) && (it.notes !== it.itemName) && (
                              <span className="text-slate-600 font-normal"> / {it.notes || it.description}</span>
                            )}
                          </div>
                          {it.dimensions && (
                            <div className="text-[9px] text-slate-400 font-light font-mono mt-0.5">
                              المقاس: <strong className="text-slate-700">{it.dimensions}</strong>
                            </div>
                          )}
                          {it.length && it.width && (
                            <div className="text-[9px] text-slate-400 font-light font-mono mt-0.5">
                              الأبعاد: {it.length} × {it.width} سم
                            </div>
                          )}
                        </td>

                        <td className="p-2 text-center align-top whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-800 text-xs">
                            {it.quantity}
                          </span>
                          <span className="text-[9px] text-slate-400 font-light mr-1">{it.unit || 'قطعة'}</span>
                        </td>

                        <td className="p-2 align-top max-w-[160px]">
                          <span className="text-[11px] text-slate-600 block leading-tight">
                            {it.notes || it.description || <span className="text-slate-400">-</span>}
                          </span>
                        </td>

                        <td className="p-2 text-center align-top whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() =>
                              setActiveAttachmentTarget({
                                invoice,
                                item: it,
                                itemIndex: idx
                              })
                            }
                            className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 mx-auto transition-colors border shadow-2xs cursor-pointer ${
                              attachmentsCount > 0
                                ? 'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                            title="فتح ومعاينة أو تنزيل الملفات، وإعادة إرفاق نسخ معدلة"
                          >
                            <FileText className="w-3 h-3" />
                            <span>
                              {attachmentsCount > 0
                                ? `المرفقات (${attachmentsCount})`
                                : 'إرفاق ملف'}
                            </span>
                            {originalCount > 0 && (
                              <Lock className="w-2.5 h-2.5 text-amber-600" title="مرفقات أصلية محمية" />
                            )}
                          </button>
                          {revisedCount > 0 && (
                            <span className="text-[9px] text-sky-600 font-semibold block mt-0.5">
                              (+{revisedCount} نسخة معدلة)
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Toggle Expand Button */}
        <div className="flex justify-center -mt-1 relative z-10">
          <button 
            type="button"
            onClick={() => toggleExpand(invoice.id)}
            className="bg-white text-[10px] font-bold text-slate-500 hover:text-blue-600 hover:bg-slate-50 border border-slate-200 px-3 py-1 rounded-full shadow-xs transition-colors flex items-center gap-1"
          >
            {expandedInvoices.has(invoice.id) ? 'إخفاء التفاصيل ▲' : 'تفاصيل أكثر ▼'}
          </button>
        </div>

        {/* Expanded Area */}

        {expandedInvoices.has(invoice.id) && (
          <div className="pt-2 space-y-3">
            {/* Technical Notes Snippet */}

          {(invoice.technicalNotes || []).length > 0 && (
            <div className="bg-indigo-50/50 border border-indigo-200/80 rounded-lg p-2.5 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-indigo-950 font-bold">
                <div className="flex items-center gap-1">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                  <span>آخر الملاحظات الفنية ({invoice.technicalNotes?.length}):</span>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveTechnicalNoteInvoice(invoice)}
                  className="text-[10px] text-indigo-600 hover:underline font-semibold cursor-pointer"
                >
                  عرض السجل كامل
                </button>
              </div>

              {invoice.technicalNotes?.slice(-2).map((tn) => (
                <div key={tn.id} className="bg-white p-2 rounded border border-indigo-100 text-[11px] text-slate-800">
                  <div className="flex justify-between text-[9px] text-slate-400 font-light mb-0.5">
                    <span className="font-bold text-indigo-900">{tn.userName}</span>
                    <span className="font-mono">{tn.createdAt}</span>
                  </div>
                  <p className="leading-snug">{tn.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Printing Active Tracker info */}
          {invoice.printStartedAt && (
            <div className="bg-blue-50/60 border border-blue-200 rounded-lg p-2 flex items-center justify-between text-[10px] text-blue-900 font-medium">
              <span className="flex items-center gap-1">
                <Play className="w-3 h-3 text-blue-600 fill-blue-600" />
                <span>بدأت الطباعة بواسطة: <strong>{invoice.printStartedBy || 'فني الطباعة'}</strong></span>
              </span>
              <span className="font-mono text-blue-700">{invoice.printStartedAt.split('T')[0]}</span>
            </div>
          )}

          {invoice.printFinishedAt && (
            <div className="bg-emerald-50/60 border border-emerald-200 rounded-lg p-2 flex items-center justify-between text-[10px] text-emerald-900 font-medium">
              <span className="flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-600" />
                <span>اكتملت الطباعة بواسطة: <strong>{invoice.printFinishedBy || 'فني الطباعة'}</strong></span>
              </span>
              <span className="font-mono text-emerald-700">{invoice.printFinishedAt.split('T')[0]}</span>
            </div>
          )}
        
        </div>
        )}
      </div>
      
      {/* Action Controls Toolbar:
            - إضافة ملاحظة فنية
            - بدء الطباعة
            - إنهاء الطباعة
            - تغيير الحالة حسب الصلاحية
        */}
        <div className="mt-4 pt-3 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
          {/* Status Change Selector (Governed by Permission) */}
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-slate-400 font-light font-semibold">الحالة:</span>
            {canChangeStatus ? (
              <select
                value={normalizedStatus}
                onChange={(e) =>
                  handleDirectStatusChange(invoice, e.target.value as PosInvoiceWorkflowStatus)
                }
                className="text-xs bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-lg px-2 py-1 font-bold text-slate-800 cursor-pointer focus:ring-1 focus:ring-blue-500"
              >
                {WORKSHOP_STATUSES.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.label}
                  </option>
                ))}
                <option value="delivered" className="font-bold text-emerald-700">
                  ✓ تم التسليم (خروج من الورشة)
                </option>
              </select>
            ) : (
              <span
                className="text-xs bg-slate-100 text-slate-600 border border-slate-300 rounded-lg px-2 py-1 font-bold flex items-center gap-1"
                title="تغيير الحالة يتطلب صلاحية الاعتماد أو التعديل"
              >
                <Lock className="w-3 h-3 text-slate-400" />
                <span>{statusMeta.label}</span>
              </span>
            )}

            {/* Audit log button */}
            <button
              type="button"
              onClick={() => openStatusHistory(invoice)}
              className="text-[10px] text-blue-600 hover:text-blue-800 hover:underline font-semibold cursor-pointer px-1"
              title="عرض سجل توثيق وتاريخ تغييرات الحالة"
            >
              توثيق وسجل الحالة
            </button>
          </div>

          {/* Action Buttons: Add Note, Start Printing, Finish Printing, Deliver */}
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Add Technical Note */}
            <button
              type="button"
              onClick={() => setActiveTechnicalNoteInvoice(invoice)}
              className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              title="إضافة ملاحظة فنية هندسية للورشة"
            >
              <MessageSquare className="w-3 h-3" />
              <span>ملاحظة فنية</span>
            </button>

            {/* Start Printing (بدء الطباعة) */}
            <button
              type="button"
              disabled={isPrintingNow || isReadyForDelivery}
              onClick={() => handleStartPrinting(invoice)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
                isPrintingNow
                  ? 'bg-blue-100 text-blue-800 border border-blue-300 opacity-90 cursor-default'
                  : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
              }`}
              title="بدء أعمال سحب وتشغيل الطباعة في الورشة"
            >
              <Play className="w-3 h-3 fill-current" />
              <span>{isPrintingNow ? 'قيد الطباعة' : 'بدء الطباعة'}</span>
            </button>

            {/* Finish Printing (إنهاء الطباعة) */}
            <button
              type="button"
              disabled={isReadyForDelivery}
              onClick={() => handleFinishPrinting(invoice)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer ${
                isReadyForDelivery
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 opacity-90 cursor-default'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
              }`}
              title="إنهاء الطباعة وتحويل الفاتورة إلى جاهز للتسليم"
            >
              <CheckSquare className="w-3 h-3" />
              <span>{isReadyForDelivery ? 'مكتمل وجاهز' : 'مكتمل وجاهز'}</span>
            </button>

            {/* Single Order Delete Button */}
            <button
              type="button"
              onClick={() => handleDeleteSingle(invoice)}
              className="bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold px-2.5 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
              title="حذف أمر الطباعة والتشغيل هذا نهائياً دون التأثير على فواتير المبيعات"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>حذف</span>
            </button>

            {/* Mark as Delivered (تسليم للعميل واعتماد حالة الفاتورة تم التسليم) */}
            {isReadyForDelivery && hasPermission('edit_invoices') && (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`هل أنت متأكد من تسليم الفاتورة رقم ${invoice.invoiceNumber} للعميل واعتماد حالتها (تم التسليم)؟ لن تظهر بعدها في شاشة الورشة.`)) {
                    posSound.success();
                    handleDirectStatusChange(invoice, 'delivered');
                  }
                }}
                className="text-xs font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer bg-emerald-700 hover:bg-emerald-800 text-white shadow-xs"
                title="تسليم الفاتورة للعميل واعتماد حالة الفاتورة كـ تم التسليم وخروجها من الورشة"
              >
                <Check className="w-3.5 h-3.5" />
                <span>تسليم للعميل (تم التسليم)</span>
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {/* Top Header & Workshop Summary */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
                <Printer className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">شاشة أوامر الطباعة والورشة</h2>
                <p className="text-[10px] text-slate-400 font-light">
                  تصنيف فواتير العمل التشغيلية (تصميم - بانتظار الاعتماد - طباعة خارجي - طباعة داخلي - جاهز للتسليم) وإدارة المرفقات
                </p>
              </div>
            </div>
          </div>

          {/* Search, Filter & View Mode Switcher */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* New Print Order Button - Opens Dedicated Full Screen */}
            <button
              type="button"
              onClick={() => {
                posSound.click();
                setActiveTab('new_print_order');
              }}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm px-3.5 py-1.5 rounded-lg shadow-sm hover:shadow flex items-center gap-1.5 transition-all cursor-pointer shrink-0 active:scale-95"
              title="فتح شاشة أمر تشغيل وطباعة جديد كاملة (بدون تأثير محاسبي أو مخزني)"
            >
              <PlusCircle className="w-4 h-4" />
              <span>+ أمر جديد</span>
            </button>

            {/* Select All Toggle Button */}
            {workshopInvoices.length > 0 && (
              <button
                type="button"
                onClick={handleSelectAll}
                className={`font-bold text-xs px-2.5 py-1.5 rounded-lg border flex items-center gap-1 transition-all cursor-pointer shrink-0 ${
                  selectedOrderIds.size > 0 && selectedOrderIds.size === workshopInvoices.length
                    ? 'bg-blue-100 text-blue-800 border-blue-300'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-300'
                }`}
                title="تحديد أو إلغاء تحديد كافة أوامر التشغيل والورشة"
              >
                <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                <span>
                  {selectedOrderIds.size === workshopInvoices.length && workshopInvoices.length > 0
                    ? 'إلغاء التحديد'
                    : 'تحديد الكل'}
                </span>
              </button>
            )}

            {/* Batch Delete Selected Orders Button */}
            {selectedOrderIds.size > 0 && (
              <button
                type="button"
                onClick={handleDeleteSelected}
                className="bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs px-3 py-1.5 rounded-lg border border-rose-300 flex items-center gap-1.5 transition-all cursor-pointer shrink-0"
                title="حذف الأوامر المحددة نهائياً دون التأثير على فواتير المبيعات"
              >
                <Trash className="w-3.5 h-3.5 text-rose-700" />
                <span>حذف المحدد ({selectedOrderIds.size})</span>
              </button>
            )}

            {/* Zero / Purge All Print Orders Button */}
            <button
              type="button"
              onClick={handleZeroAll}
              className="bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs sm:text-sm px-3 py-1.5 rounded-lg shadow-sm hover:shadow flex items-center gap-1.5 transition-all cursor-pointer shrink-0 active:scale-95"
              title="تصفير وتطهير كافة أوامر الطباعة والورشة نهائياً (بدون التأثير على فواتير المبيعات المسجلة)"
            >
              <Trash2 className="w-4 h-4" />
              <span>تصفير الأوامر</span>
            </button>

            {/* Search Input */}
            <div className="relative min-w-[200px] sm:min-w-[240px]">
              <Search className="w-3.5 h-3.5 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث برقم الفاتورة، العميل، الصنف..."
                className="w-full bg-slate-50 border border-slate-300 focus:bg-white focus:border-blue-500 rounded-lg pr-8 pl-3 py-1.5 text-xs text-slate-800 outline-none transition-all"
              />
            </div>

            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setActiveViewMode('kanban')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                  activeViewMode === 'kanban'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="عرض لوحة المراحل (Kanban)"
              >
                <Columns className="w-3.5 h-3.5" />
                <span>لوحة المراحل</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveViewMode('list')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md font-bold transition-all cursor-pointer ${
                  activeViewMode === 'list'
                    ? 'bg-white text-blue-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="عرض القائمة التفصيلية"
              >
                <List className="w-3.5 h-3.5" />
                <span>قائمة تفصيلية</span>
              </button>
            </div>
          </div>
        </div>

        {/* 5 Operational Stage Tabs / Filters */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2 overflow-x-auto pb-1">
          <button
            type="button"
            onClick={() => setSelectedStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer border ${
              selectedStatusFilter === 'all'
                ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
            }`}
          >
            <span>كافة أوامر الورشة</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                selectedStatusFilter === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-700'
              }`}
            >
              {workshopInvoices.length}
            </span>
          </button>

          {ALL_STATUSES.map((st) => {
            const count = countsByStatus[st.id] || 0;
            const isSelected = selectedStatusFilter === st.id;

            return (
              <button
                key={st.id}
                type="button"
                onClick={() => setSelectedStatusFilter(st.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer border ${
                  isSelected
                    ? `${st.badgeBg} ${st.badgeText} ${st.border} ring-1 ring-current shadow-xs`
                    : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200'
                }`}
              >
                <span>{st.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                    isSelected ? 'bg-white/80' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main View Area */}
      {workshopInvoices.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
          <Printer className="w-12 h-12 mx-auto mb-3 opacity-30 text-blue-600" />
          <h3 className="text-base font-bold text-slate-700">لا توجد أوامر تشغيل مطابقة في الورشة</h3>
          <p className="text-[10px] text-slate-400 font-light max-w-md mx-auto mt-1">
            يتم إظهار الفواتير التشغيلية المندرجة تحت إحدى حالات العمل الخمسة: (تصميم - بانتظار الاعتماد - طباعة خارجي - طباعة داخلي - جاهز للتسليم).
          </p>
        </div>
      ) : activeViewMode === 'kanban' ? (
        /* KANBAN BOARD: 5 STRICT WORK STATUS COLUMNS */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4 items-start">
          {ALL_STATUSES.filter(
            (col) => selectedStatusFilter === 'all' || selectedStatusFilter === col.id
          ).map((col) => {
            const colInvoices = workshopInvoices.filter(
              (inv) => normalizeWorkflowStatus(inv.workflowStatus) === col.id
            );

            return (
              <div
                key={col.id}
                className={`rounded-xl border flex flex-col max-h-[85vh] ${col.bg} ${col.border}`}
              >
                {/* Column Header */}
                <div className="p-3 border-b border-slate-200/80 bg-white/70 backdrop-blur-xs rounded-t-xl flex items-center justify-between sticky top-0 z-10">
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${col.badgeBg} border ${col.border}`} />
                    <h4 className={`text-xs font-bold ${col.color}`}>{col.label}</h4>
                  </div>
                  <span
                    className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${col.badgeBg} ${col.badgeText} border ${col.border}`}
                  >
                    {colInvoices.length}
                  </span>
                </div>

                {/* Column Invoices List */}
                <div className="p-2.5 space-y-3 overflow-y-auto flex-1">
                  {colInvoices.length === 0 ? (
                    <div className="border border-dashed border-slate-300 rounded-lg p-6 text-center text-slate-400 bg-white/40">
                      <p className="text-[11px]">لا توجد طلبيات في هذه المرحلة</p>
                    </div>
                  ) : (
                    colInvoices.map((inv, idx) => renderInvoiceCard(inv, false, idx))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* DETAILED LIST / CARD VIEW */
        <div className="space-y-3">
          {workshopInvoices.map((inv, idx) => renderInvoiceCard(inv, true, idx))}
        </div>
      )}

      {/* Attachment Preview, Download & Revised Upload Modal */}
      {activeAttachmentTarget && (
        <WorkshopAttachmentModal
          isOpen={!!activeAttachmentTarget}
          onClose={() => setActiveAttachmentTarget(null)}
          invoiceNumber={activeAttachmentTarget.invoice.invoiceNumber}
          item={activeAttachmentTarget.item}
          itemIndex={activeAttachmentTarget.itemIndex}
          currentUserName={currentUser?.fullName || currentUser?.username || 'فني الورشة'}
          onAddAttachment={(itemIdx, attachment) =>
            addInvoiceItemAttachment(activeAttachmentTarget.invoice.id, itemIdx, attachment)
          }
          onRemoveAttachment={(itemIdx, attachmentId) =>
            removeInvoiceItemAttachment(activeAttachmentTarget.invoice.id, itemIdx, attachmentId)
          }
        />
      )}

      {/* Technical Notes Modal */}
      {activeTechnicalNoteInvoice && (
        <WorkshopTechnicalNoteModal
          isOpen={!!activeTechnicalNoteInvoice}
          onClose={() => setActiveTechnicalNoteInvoice(null)}
          invoice={activeTechnicalNoteInvoice}
          onAddNote={(invId, text) => addInvoiceTechnicalNote(invId, text)}
          currentUserName={currentUser?.fullName || currentUser?.username || 'فني الورشة'}
        />
      )}

      {/* Status History & Formal Update Modal */}
      {activeStatusHistoryInvoice && (
        <InvoiceStatusHistoryModal
          isOpen={!!activeStatusHistoryInvoice}
          onClose={() => {
            setActiveStatusHistoryInvoice(null);
            setInitialStatusForHistory(undefined);
          }}
          invoice={activeStatusHistoryInvoice}
          initialTargetStatus={initialStatusForHistory}
        />
      )}
    </div>
  );
};
