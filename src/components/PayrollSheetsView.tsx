import React, { useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { PayrollSheet } from '../types';
import { posSound } from '../utils/audio';
import {
  FileSpreadsheet,
  PlusCircle,
  CheckCircle2,
  Clock,
  Printer,
  Eye,
  Edit2,
  Trash2,
  Wallet,
  Calendar,
  DollarSign,
  Users,
  Building2,
  AlertCircle,
  X,
  RotateCcw
} from 'lucide-react';

interface PayrollSheetsViewProps {
  onOpenCreateModal: () => void;
  onOpenEditModal: (sheet: PayrollSheet) => void;
}

export const PayrollSheetsView: React.FC<PayrollSheetsViewProps> = ({
  onOpenCreateModal,
  onOpenEditModal
}) => {
  const {
    payrollSheets,
    accounts,
    treasuries,
    deleteDraftPayrollSheet,
    approveAndDisbursePayrollSheet,
    unapprovePayrollSheet,
    updateDraftPayrollSheet,
    setSelectedPayrollSheetForPrint,
    settings
  } = useAccounting();

  // State to inspect details of a specific sheet
  const [selectedSheetForDetails, setSelectedSheetForDetails] = useState<PayrollSheet | null>(null);

  // Metrics
  const approvedSheets = payrollSheets.filter(s => s.status === 'approved');
  const draftSheets = payrollSheets.filter(s => s.status === 'draft');
  const totalDisbursedYTD = approvedSheets.reduce((sum, s) => sum + s.totalNet, 0);

  // Quick treasury change for draft sheets
  const handleTreasuryChange = (sheetId: string, newCode: string) => {
    const treasury = treasuries.find(t => t.accountCode === newCode) || accounts.find(a => a.code === newCode);
    updateDraftPayrollSheet(sheetId, {
      treasuryAccountCode: newCode,
      treasuryName: treasury ? treasury.name : 'الصندوق النقدي'
    });
  };

  // Direct approve and disburse from the list
  const handleApprove = (sheet: PayrollSheet) => {
    const treasuryCode = sheet.treasuryAccountCode || '1101';
    const treasury = treasuries.find(t => t.accountCode === treasuryCode) || accounts.find(a => a.code === treasuryCode);

    if (treasury && treasury.balance < sheet.totalNet) {
      alert(
        `تنبيه مالي: رصيد ${treasury.name} الحالي (${treasury.balance.toLocaleString()} ر.س) غير كافٍ لصرف إجمالي الرواتب (${sheet.totalNet.toLocaleString()} ر.س). يرجى تغذية الخزينة أو تعديل خزينة الصرف.`
      );
      return;
    }

    if (
      !window.confirm(
        `تأكيد الاعتماد والصرف:\nهل ترغب في صرف كشف الرواتب "${sheet.title}"؟\n\nالمبلغ الإجمالي: ${sheet.totalNet.toLocaleString()} ر.س\nالخزينة المحددة: ${treasury?.name}\n\nسيتم خصم المبلغ من الخزينة، وإصدار سند صرف وقيد محاسبي، وتسوية السلف والخصومات والحوافز تلقائياً.`
      )
    ) {
      return;
    }

    const result = approveAndDisbursePayrollSheet(sheet.id, treasuryCode);
    if (result.success) {
      posSound.playCashBeep();
    } else {
      alert(result.message || 'حدث خطأ أثناء الصرف');
    }
  };

  const handleDeleteDraft = (sheet: PayrollSheet) => {
    if (window.confirm(`هل أنت متأكد من حذف مسودة كشف الرواتب "${sheet.title}"؟`)) {
      deleteDraftPayrollSheet(sheet.id);
      posSound.playErrorBeep();
    }
  };

  const handleUnapprove = (id: string) => {
    if (window.confirm('هل أنت متأكد من إلغاء اعتماد هذا الكشف؟ سيتم حذف القيود والسندات المرتبطة به وسيعود كمسودة قابلة للتعديل.')) {
      const res = unapprovePayrollSheet(id);
      if (res.success) {
        alert(res.message);
      } else {
        alert(res.message);
      }
    }
  };

  return (
    <div className="space-y-4" dir="rtl">
      
      {/* Top Banner and Summary */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                <FileSpreadsheet className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">سجل كشوفات ومسيرات الرواتب</h2>
              <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full font-bold border border-blue-200">
                {payrollSheets.length} كشف مسجل
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-light mt-1">
              إعداد مسودات الرواتب، تحديد نظام الاحتساب (شهري، أسبوعي، يومي)، اختيار خزينة الصرف، والاعتماد المحاسبي الدائم
            </p>
          </div>

          <button
            onClick={onOpenCreateModal}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <PlusCircle className="w-4 h-4" />
            <span>+ إنشاء كشف رواتب جديد (مسودة)</span>
          </button>
        </div>

        {/* Live Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-100 text-xs">
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block">كشوفات معتمدة ومصروفة</span>
            <span className="text-lg font-black text-emerald-700 font-mono mt-0.5 block">
              {approvedSheets.length} كشف
            </span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block">مسودات قيد المراجعة</span>
            <span className="text-lg font-black text-amber-700 font-mono mt-0.5 block">
              {draftSheets.length} مسودة
            </span>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
            <span className="text-slate-500 block">إجمالي الرواتب المصروفة</span>
            <span className="text-lg font-black text-slate-900 font-mono mt-0.5 block">
              {totalDisbursedYTD.toLocaleString()} {settings.currency}
            </span>
          </div>

          <div className="bg-blue-50/50 p-2.5 rounded-lg border border-blue-200">
            <span className="text-blue-700 block font-medium">أرصدة الخزائن المتاحة للصرف</span>
            <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-blue-900 font-bold">
              <span>كاش: {(treasuries.find(t => t.type === 'cash_box')?.balance || 0).toLocaleString()} ر.س</span>
              <span>بنك: {(treasuries.find(t => t.type === 'bank_app' || t.type === 'bank_account')?.balance || 0).toLocaleString()} ر.س</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sheets Table / List (Permanently Stored & Displayed) */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
          <span className="font-bold text-slate-800">
            كافة كشوفات ومسيرات الرواتب (تظل محفوظة وظاهرة دائماً)
          </span>
          <span className="text-slate-500 text-[11px]">
            مرتبة من الأحدث إلى الأقدم
          </span>
        </div>

        {payrollSheets.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-xs">
            <FileSpreadsheet className="w-12 h-12 text-slate-300 mx-auto mb-2" />
            <p className="font-bold text-slate-700">لا توجد كشوفات رواتب حتى الآن</p>
            <p className="mt-1 text-slate-400">
              اضغط على "إنشاء كشف رواتب جديد" لإعداد مسودة كشف الرواتب وتحديد خزينة الصرف
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs border-collapse">
              <thead>
                <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 font-bold text-[11px]">
                  <th className="p-3">رقم الكشف</th>
                  <th className="p-3">عنوان الكشف والفترة</th>
                  <th className="p-3 text-center">النظام</th>
                  <th className="p-3 text-center">الموظفون</th>
                  <th className="p-3 text-center">إجمالي الاستحقاق</th>
                  <th className="p-3 text-center">الخصومات والسلف</th>
                  <th className="p-3 text-center font-black bg-blue-50 text-blue-900">صافي الصرف</th>
                  <th className="p-3">الخزينة المحددة للصرف</th>
                  <th className="p-3 text-center">الحالة</th>
                  <th className="p-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payrollSheets.map(sheet => {
                  const systemLabel =
                    sheet.calculationSystem === 'monthly'
                      ? 'شهري'
                      : sheet.calculationSystem === 'weekly'
                      ? 'أسبوعي'
                      : sheet.calculationSystem === 'daily'
                      ? 'يومي'
                      : 'شامل';

                  const grossEarnings = sheet.totalBasic + sheet.totalAllowances + sheet.totalIncentives;
                  const totalCuts = sheet.totalDeductions + sheet.totalAdvances;

                  return (
                    <tr key={sheet.id} className="hover:bg-slate-50/70 transition-colors">
                      
                      {/* Sheet Number */}
                      <td className="p-3">
                        <span className="font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                          {sheet.sheetNumber}
                        </span>
                        <div className="text-[10px] text-slate-400 mt-1 font-mono">{sheet.createdAt}</div>
                      </td>

                      {/* Title & Period */}
                      <td className="p-3">
                        <div className="font-bold text-slate-900 text-sm hover:text-blue-600 cursor-pointer" onClick={() => setSelectedSheetForDetails(sheet)}>
                          {sheet.title}
                        </div>
                        <div className="text-[10px] text-slate-400 font-light mt-0.5">
                          الفترة: {sheet.period} ({sheet.startDate} إلى {sheet.endDate})
                        </div>
                      </td>

                      {/* System */}
                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                          {systemLabel}
                        </span>
                      </td>

                      {/* Employee count */}
                      <td className="p-3 text-center font-mono font-bold text-slate-800">
                        {sheet.employeesCount} موظف
                      </td>

                      {/* Gross Earnings */}
                      <td className="p-3 text-center font-mono text-slate-700">
                        <div>{grossEarnings.toLocaleString()} ر.س</div>
                        {sheet.totalIncentives > 0 && (
                          <div className="text-[10px] text-emerald-600">حوافز: +{sheet.totalIncentives.toLocaleString()}</div>
                        )}
                      </td>

                      {/* Cuts */}
                      <td className="p-3 text-center font-mono text-rose-700">
                        {totalCuts > 0 ? `-${totalCuts.toLocaleString()} ر.س` : '0'}
                        {sheet.totalAdvances > 0 && (
                          <div className="text-[10px] text-amber-700">سلف: -{sheet.totalAdvances.toLocaleString()}</div>
                        )}
                      </td>

                      {/* Total Net */}
                      <td className="p-3 text-center bg-blue-50/40 font-mono font-black text-slate-900 text-sm">
                        {sheet.totalNet.toLocaleString()} {settings.currency}
                      </td>

                      {/* Treasury */}
                      <td className="p-3">
                        {sheet.status === 'draft' ? (
                          <select
                            value={sheet.treasuryAccountCode || '1101'}
                            onChange={e => handleTreasuryChange(sheet.id, e.target.value)}
                            className="bg-slate-50 border border-slate-300 rounded-lg px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-blue-500 max-w-[170px]"
                          >
                            {treasuries.map(t => (
                              <option key={t.id} value={t.accountCode}>
                                {t.name} ({t.balance.toLocaleString()} {settings.currency})
                              </option>
                            ))}
                          </select>
                        ) : (
                          <div>
                            <span className="font-bold text-slate-800 flex items-center gap-1">
                              <Wallet className="w-3 h-3 text-slate-400" />
                              {sheet.treasuryName || 'الصندوق النقدي'}
                            </span>
                            {sheet.voucherNumber && (
                              <span className="font-mono text-[10px] text-emerald-700 font-bold block">
                                سند صرف: {sheet.voucherNumber}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3 text-center">
                        {sheet.status === 'approved' ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full text-[10px] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            <span>معتمد ومصروف</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full text-[10px] font-bold">
                            <Clock className="w-3.5 h-3.5 text-amber-600" />
                            <span>مسودة قيد المراجعة</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          
                          {/* If Draft: Approve button, Edit, Delete */}
                          {sheet.status === 'draft' && (
                            <>
                              <button
                                onClick={() => handleApprove(sheet)}
                                className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs"
                                title="اعتماد وصرف كشف الرواتب فوراً من الخزينة"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                <span>اعتماد وصرف</span>
                              </button>

                              <button
                                onClick={() => onOpenEditModal(sheet)}
                                className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                                title="تعديل بنود المسودة"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              <button
                                onClick={() => handleDeleteDraft(sheet)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="حذف المسودة"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}

                          {/* View Details */}
                          <button
                            onClick={() => setSelectedSheetForDetails(sheet)}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                            title="عرض تفاصيل الكشف والموظفين"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          {/* Print Official Sheet */}
                          <button
                            onClick={() => setSelectedPayrollSheetForPrint(sheet)}
                            className="p-1 text-slate-400 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors cursor-pointer"
                            title="طباعة مسير الرواتب الرسمي (A4)"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          
                          {/* Unapprove if approved */}
                          {sheet.status === 'approved' && (
                            <button
                              onClick={() => handleUnapprove(sheet.id)}
                              className="px-2 py-1 bg-rose-50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 rounded text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer border border-rose-200"
                              title="إلغاء الاعتماد للتعديل"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>إلغاء الاعتماد للتعديل</span>
                            </button>
                          )}

                        </div>
                      </td>

                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sheet Details Modal (View Line Items) */}
      {selectedSheetForDetails && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full border border-slate-200 overflow-hidden my-auto flex flex-col max-h-[90vh]">
            
            <div className="bg-slate-900 text-white px-5 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-blue-400" />
                <div>
                  <h3 className="font-bold text-sm">
                    تفاصيل كشف الرواتب - {selectedSheetForDetails.title} ({selectedSheetForDetails.sheetNumber})
                  </h3>
                  <p className="text-xs text-slate-400">
                    الفترة: {selectedSheetForDetails.period} | الخزينة: {selectedSheetForDetails.treasuryName}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSelectedPayrollSheetForPrint(selectedSheetForDetails)}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة A4</span>
                </button>
                <button
                  onClick={() => setSelectedSheetForDetails(null)}
                  className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-right border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                      <th className="p-2.5 text-center w-8">#</th>
                      <th className="p-2.5">الموظف</th>
                      <th className="p-2.5">المسمى الوظيفي</th>
                      <th className="p-2.5 text-center">نظام الراتب</th>
                      <th className="p-2.5 text-center">الأساسي</th>
                      <th className="p-2.5 text-center">البدلات</th>
                      <th className="p-2.5 text-center text-emerald-700">الحوافز</th>
                      <th className="p-2.5 text-center text-rose-700">الخصومات</th>
                      <th className="p-2.5 text-center text-amber-800">السلف</th>
                      <th className="p-2.5 text-center font-black bg-blue-50 text-blue-900">صافي المستحق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedSheetForDetails.items.map((item, idx) => (
                      <tr key={item.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                        <td className="p-2.5 text-center font-mono text-slate-500">{idx + 1}</td>
                        <td className="p-2.5 font-bold text-slate-900">{item.employeeName}</td>
                        <td className="p-2.5 text-slate-600">{item.jobTitle}</td>
                        <td className="p-2.5 text-center text-slate-600">
                          {item.salaryType === 'monthly' ? 'شهري' : item.salaryType === 'weekly' ? 'أسبوعي' : 'يومي'}
                        </td>
                        <td className="p-2.5 text-center font-mono">{item.basicSalary.toLocaleString()}</td>
                        <td className="p-2.5 text-center font-mono">{item.allowances.toLocaleString()}</td>
                        <td className="p-2.5 text-center font-mono text-emerald-700">
                          {item.incentives > 0 ? `+${item.incentives.toLocaleString()}` : '0'}
                        </td>
                        <td className="p-2.5 text-center font-mono text-rose-600">
                          {item.deductions > 0 ? `-${item.deductions.toLocaleString()}` : '0'}
                        </td>
                        <td className="p-2.5 text-center font-mono text-amber-800">
                          {item.advancesDeducted > 0 ? `-${item.advancesDeducted.toLocaleString()}` : '0'}
                        </td>
                        <td className="p-2.5 text-center font-mono font-black text-slate-900 bg-blue-50/30">
                          {item.netSalary.toLocaleString()} ر.س
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-slate-200 font-bold text-slate-900 border-t-2 border-slate-300">
                      <td colSpan={4} className="p-2.5 text-center">المجموع الكلي</td>
                      <td className="p-2.5 text-center font-mono">{selectedSheetForDetails.totalBasic.toLocaleString()}</td>
                      <td className="p-2.5 text-center font-mono">{selectedSheetForDetails.totalAllowances.toLocaleString()}</td>
                      <td className="p-2.5 text-center font-mono text-emerald-700">+{selectedSheetForDetails.totalIncentives.toLocaleString()}</td>
                      <td className="p-2.5 text-center font-mono text-rose-700">-{selectedSheetForDetails.totalDeductions.toLocaleString()}</td>
                      <td className="p-2.5 text-center font-mono text-amber-800">-{selectedSheetForDetails.totalAdvances.toLocaleString()}</td>
                      <td className="p-2.5 text-center font-mono font-black text-blue-900 bg-blue-100">
                        {selectedSheetForDetails.totalNet.toLocaleString()} ر.س
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex items-center justify-between text-xs shrink-0">
              <div className="text-slate-500">
                الحالة: <strong className={selectedSheetForDetails.status === 'approved' ? 'text-emerald-700' : 'text-amber-700'}>
                  {selectedSheetForDetails.status === 'approved' ? 'معتمد ومصروف من الخزينة' : 'مسودة قيد المراجعة'}
                </strong>
              </div>

              <button
                onClick={() => setSelectedSheetForDetails(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg font-bold transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};
