import React from 'react';
import { useAccounting } from '../context/AccountingContext';
import { ShieldCheck, Database, Layers, CheckCircle2, X, Info } from 'lucide-react';

interface AboutAppModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AboutAppModal: React.FC<AboutAppModalProps> = ({ isOpen, onClose }) => {
  const { settings, currentUser, activeBranchId, branches } = useAccounting();

  if (!isOpen) return null;

  const currentBranch = branches.find(b => b.id === activeBranchId) || branches[0];

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4 select-none animate-in fade-in duration-100" dir="rtl">
      {/* Classic Windows Form / Visual Basic Dialog Box */}
      <div className="w-full max-w-md bg-[#f0f2f5] border-2 border-[#0055ea] rounded-xs shadow-2xl overflow-hidden font-sans">
        {/* Title Bar */}
        <div className="bg-gradient-to-r from-[#0a246a] via-[#1e3a8a] to-[#2563eb] text-white px-3 py-1.5 flex items-center justify-between text-xs font-bold border-b border-[#0055ea]">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-white/20 border border-white/40 rounded-xs flex items-center justify-center text-[10px] font-black">
              VB
            </div>
            <span>حول برنامج الأيهم المحاسبي المتكامل</span>
          </div>
          <button
            onClick={onClose}
            className="w-5 h-5 bg-rose-600 hover:bg-rose-700 text-white rounded-xs flex items-center justify-center font-bold text-xs transition"
            title="إغلاق"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Dialog Content */}
        <div className="p-4 space-y-3 text-slate-800 text-xs">
          {/* Header Row with App Icon */}
          <div className="flex items-center gap-3 pb-3 border-b border-slate-300">
            <div className="w-14 h-14 bg-gradient-to-br from-blue-600 to-indigo-800 rounded-xs border-2 border-white shadow-md flex items-center justify-center text-white text-2xl font-black shrink-0">
              P
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-slate-900 leading-tight">
                {settings.appTitle || 'برنامج الأيهم المحاسبي - مطبعة ومكتبة لبنان - م.رائد صالحة'}
              </h3>
              <p className="text-[11px] text-blue-700 font-bold mt-0.5">
                {settings.businessName || 'مطبعة ومكتبة لبنان'} - نظام إدارة المطابع ونقاط البيع المحاسبية
              </p>
              <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-500 font-mono">
                <span className="bg-slate-200 px-1.5 py-0.5 rounded-xs border border-slate-300 font-bold">
                  الإصدار: v2.5.0 (Desktop Edition)
                </span>
                <span>إشراف وتطوير: م.رائد صالحة</span>
              </div>
            </div>
          </div>

          {/* GroupBox / Frame: License and Enterprise Info */}
          <fieldset className="border border-slate-300 p-2.5 rounded-xs bg-white text-[11px]">
            <legend className="px-1.5 font-bold text-blue-900 text-xs">بيانات الترخيص والمنشأة</legend>
            <div className="space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">اسم المنشأة:</span>
                <span className="font-bold text-slate-800">{settings.businessName || 'مطبعة ومكتبة لبنان'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">المطور والمهندس المشرف:</span>
                <span className="font-bold text-blue-800">م.رائد صالحة</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">الفرع النشط:</span>
                <span className="font-bold text-slate-800">{currentBranch?.name || 'الرئيسي'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">المستخدم المسجل:</span>
                <span className="font-bold text-slate-800">{currentUser?.fullName} ({currentUser?.roleName})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">حالة الترخيص:</span>
                <span className="text-emerald-700 font-bold flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                  ترخيص دائم معتمد
                </span>
              </div>
            </div>
          </fieldset>

          {/* GroupBox / Frame: Technical Specs */}
          <fieldset className="border border-slate-300 p-2.5 rounded-xs bg-white text-[11px]">
            <legend className="px-1.5 font-bold text-blue-900 text-xs">المواصفات التقنية وقاعدة البيانات</legend>
            <div className="space-y-1 text-slate-600">
              <div className="flex justify-between">
                <span>المحرك وقواعد البيانات:</span>
                <span className="font-mono font-bold text-slate-800">Cloud SQL & Firestore DB</span>
              </div>
              <div className="flex justify-between">
                <span>وضع التشغيل المستمر:</span>
                <span className="text-blue-700 font-bold">متصل + دعم كامل لـ Offline</span>
              </div>
              <div className="flex justify-between">
                <span>نظام واجهة المستخدم:</span>
                <span className="font-bold text-slate-800">Visual Basic Enterprise UI v2.5</span>
              </div>
            </div>
          </fieldset>

          <p className="text-[10px] text-slate-500 text-center leading-normal pt-1">
            جميع الحقوق محفوظة للمنشأة © {new Date().getFullYear()}. صُمم هذا النظام خصيصاً لأعمال المطابع والمكتبات التجارية ونقاط البيع وإدارة المستودعات والحسابات المالية.
          </p>
        </div>

        {/* Dialog Footer with Classic OK Button */}
        <div className="bg-[#e4e7eb] px-4 py-2 border-t border-slate-300 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-1 bg-gradient-to-b from-white via-slate-100 to-slate-200 hover:from-blue-50 hover:to-blue-100 text-slate-800 border border-slate-400 hover:border-blue-600 rounded-xs font-bold text-xs shadow-xs active:translate-y-px transition cursor-pointer min-w-[80px]"
          >
            موافق
          </button>
        </div>
      </div>
    </div>
  );
};
