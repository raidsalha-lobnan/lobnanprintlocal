import React from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { X, PauseCircle, Play, Trash2, Clock } from 'lucide-react';

import { PosTableLine } from '../PosView';
import { formatInvoiceCustomerDisplay } from '../../utils/partyUtils';

export interface HeldInvoiceData {
  id: string;
  heldAt: string;
  customerName: string;
  customerId?: string;
  customCustomerText?: string;
  subCustomerName?: string;
  subCustomerId?: string;
  lines: PosTableLine[];
  totalAmount: number;
  notes?: string;
  paymentNotes?: string;
}

interface HeldInvoicesModalProps {
  isOpen: boolean;
  onClose: () => void;
  heldInvoices: HeldInvoiceData[];
  onResumeInvoice: (held: HeldInvoiceData) => void;
  onDeleteHeldInvoice: (id: string) => void;
}

export const HeldInvoicesModal: React.FC<HeldInvoicesModalProps> = ({
  isOpen,
  onClose,
  heldInvoices,
  onResumeInvoice,
  onDeleteHeldInvoice
}) => {
  const { settings, parties } = useAccounting();

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-300 w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden text-slate-800">
        <div className="bg-slate-800 text-white px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-slate-700 rounded-lg">
              <PauseCircle className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="font-bold text-sm">الفواتير المعلقة (F9)</h3>
              <p className="text-[11px] text-slate-300">استعادة فاتورة معلقة لاستكمال عملية الدفع</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-y-auto">
          {heldInvoices.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs">
              لا توجد أي فواتير معلقة حالياً.
            </div>
          ) : (
            <div className="space-y-3">
              {heldInvoices.map((inv, idx) => (
                <div
                  key={`held-inv-${inv.id || idx}-${idx}`}
                  className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex items-center justify-between hover:border-blue-400 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-xs">
                        {idx + 1}
                      </span>
                      <h4 className="font-bold text-xs text-slate-800" title={formatInvoiceCustomerDisplay(inv, parties)}>
                        {formatInvoiceCustomerDisplay(inv, parties)}
                      </h4>
                      <span className="text-[10px] text-slate-400 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span>{inv.heldAt}</span>
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-light font-sans">
                      عدد البنود: <span className="font-bold text-slate-700 font-mono">{inv.lines.length}</span> |
                      إجمالي الفاتورة: <span className="font-bold text-blue-700 font-mono">{inv.totalAmount.toFixed(2)} {settings.currency}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        onResumeInvoice(inv);
                        onClose();
                      }}
                      className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl flex items-center gap-1 cursor-pointer transition-colors shadow-2xs"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>استئناف</span>
                    </button>
                    <button
                      onClick={() => onDeleteHeldInvoice(inv.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl cursor-pointer"
                      title="إلغاء المعلق"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
