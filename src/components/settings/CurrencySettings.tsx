import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { CurrencyInfo } from '../../types';
import {
  Coins,
  RefreshCw,
  Plus,
  Edit2,
  Check,
  X,
  TrendingUp,
  AlertCircle,
  Info,
  Globe
} from 'lucide-react';

export const CurrencySettings: React.FC = () => {
  const {
    currencies,
    updateCurrencies,
    updateCurrencyRate,
    fetchLiveRates,
    settings,
    updateSettings
  } = useAccounting();

  const [isLoadingLiveRates, setIsLoadingLiveRates] = useState(false);
  const [liveRateStatus, setLiveRateStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Edit rate modal or row
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [editRateValue, setEditRateValue] = useState<number>(1);

  // Add new currency modal
  const [isAddingCurrency, setIsAddingCurrency] = useState(false);
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newSymbol, setNewSymbol] = useState('');
  const [newRate, setNewRate] = useState<number>(1.0);

  const handleStartEdit = (currency: CurrencyInfo) => {
    setEditingCode(currency.code);
    setEditRateValue(currency.rateAgainstBase);
  };

  const handleSaveEdit = (code: string) => {
    if (editRateValue <= 0) {
      alert('يجب أن يكون سعر الصرف أكبر من الصفر');
      return;
    }
    updateCurrencyRate(code, editRateValue);
    setEditingCode(null);
  };

  const handleFetchLive = async () => {
    setIsLoadingLiveRates(true);
    setLiveRateStatus(null);
    try {
      const res = await fetchLiveRates();
      setLiveRateStatus(res);
      setTimeout(() => setLiveRateStatus(null), 5000);
    } catch (err: any) {
      setLiveRateStatus({ success: false, message: 'حدث خطأ أثناء جلب أسعار الصرف' });
    } finally {
      setIsLoadingLiveRates(false);
    }
  };

  const handleToggleActive = (code: string) => {
    const updated = currencies.map(c => {
      if (c.code === code) {
        if (c.isBase) return c; // Cannot deactivate base currency
        return { ...c, isActive: !c.isActive };
      }
      return c;
    });
    updateCurrencies(updated);
  };

  const handleAddCurrency = (e: React.FormEvent) => {
    e.preventDefault();
    const code = newCode.trim().toUpperCase();
    if (!code || !newName.trim()) {
      alert('الرجاء إدخال كود واسم العملة');
      return;
    }

    if (currencies.some(c => c.code === code)) {
      alert('هذه العملة مضافة بالفعل في النظام');
      return;
    }

    const newCurr: CurrencyInfo = {
      code,
      name: newName.trim(),
      symbol: newSymbol.trim() || code,
      rateAgainstBase: Number(newRate) > 0 ? Number(newRate) : 1.0,
      isBase: false,
      isActive: true,
      updatedAt: new Date().toISOString().split('T')[0]
    };

    updateCurrencies([...currencies, newCurr]);
    setIsAddingCurrency(false);
    setNewCode('');
    setNewName('');
    setNewSymbol('');
    setNewRate(1.0);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            <Coins className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">إدارة العملات وأسعار الصرف اليومية</h3>
              <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                العملة الأساسية: الشيكل الفلسطيني (₪)
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-light">
              تحديد العملات المتاحة في نقطة البيع والمشتريات وتحويل كل العمليات والقيود آلياً للشيكل الفلسطيني.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleFetchLive}
            disabled={isLoadingLiveRates}
            className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1.5 rounded-lg border border-blue-200 transition-colors cursor-pointer disabled:opacity-50"
            title="جلب أحدث أسعار الصرف الحية عبر الإنترنت"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLiveRates ? 'animate-spin' : ''}`} />
            <span>{isLoadingLiveRates ? 'جارِ التحديث...' : 'تحديث أسعار الصرف الحية'}</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAddingCurrency(true)}
            className="flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة عملة</span>
          </button>
        </div>
      </div>

      {/* Live Rate Notification Feedback */}
      {liveRateStatus && (
        <div
          className={`p-3 rounded-lg border flex items-center gap-2 text-xs ${
            liveRateStatus.success
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {liveRateStatus.success ? (
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{liveRateStatus.message}</span>
        </div>
      )}

      {/* Palestinian Shekel Explanation Note */}
      <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-3 flex items-start gap-2.5 text-xs text-amber-900">
        <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <span className="font-bold">ملاحظة محاسبية هامة:</span> يتم تسجيل جميع القيود اليومية، كشوفات حسابات العملاء والموردين، وتقارير الأرباح والميزانية بالعملة الأساسية للنظام وهي <strong>الشيكل الفلسطيني (₪ / ILS)</strong>. عند اختيار عملة أجنبية في شاشة الكاشير، يقوم النظام بتحويل الإجمالي تلقائياً إلى الشيكل اعتماداً على سعر الصرف المحدد أدناه.
        </div>
      </div>

      {/* Currencies Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-50 text-slate-700 font-bold border-b border-slate-200">
            <tr>
              <th className="py-2.5 px-3">العملة</th>
              <th className="py-2.5 px-3">الرمز</th>
              <th className="py-2.5 px-3">الكود</th>
              <th className="py-2.5 px-3 text-center">سعر الصرف مقابل الشيكل</th>
              <th className="py-2.5 px-3 text-center">المعادل المحاسبي</th>
              <th className="py-2.5 px-3 text-center">آخر تحديث</th>
              <th className="py-2.5 px-3 text-center">الحالة</th>
              <th className="py-2.5 px-3 text-center">الإجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {currencies.map(curr => {
              const isBase = curr.isBase || curr.code === 'ILS';
              const isEditing = editingCode === curr.code;

              return (
                <tr
                  key={curr.code}
                  className={`hover:bg-slate-50/70 transition-colors ${
                    isBase ? 'bg-emerald-50/30 font-semibold' : ''
                  }`}
                >
                  <td className="py-2 px-3 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="font-bold text-slate-800">{curr.name}</span>
                    {isBase && (
                      <span className="bg-emerald-100 text-emerald-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-emerald-200">
                        الأساسية
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono font-bold text-slate-800">
                    {curr.symbol}
                  </td>
                  <td className="py-2 px-3 font-mono text-slate-600">
                    {curr.code}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {isBase ? (
                      <span className="font-mono text-slate-500 font-bold">1.00 (ثابت)</span>
                    ) : isEditing ? (
                      <div className="flex items-center justify-center gap-1">
                        <input
                          type="number"
                          step="0.001"
                          min="0.001"
                          value={editRateValue}
                          onChange={e => setEditRateValue(parseFloat(e.target.value) || 0)}
                          className="w-20 px-2 py-0.5 border border-blue-400 rounded text-center font-mono font-bold bg-white text-xs focus:ring-1 focus:ring-blue-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleSaveEdit(curr.code)}
                          className="p-1 bg-emerald-600 text-white rounded hover:bg-emerald-700 cursor-pointer"
                          title="حفظ السعر"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingCode(null)}
                          className="p-1 bg-slate-200 text-slate-600 rounded hover:bg-slate-300 cursor-pointer"
                          title="إلغاء"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                        <span>{curr.rateAgainstBase.toFixed(4)}</span>
                        <span className="text-[10px] text-blue-500 font-sans">₪</span>
                      </div>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center font-mono text-[11px] text-slate-600">
                    {isBase ? (
                      <span>1 {curr.symbol} = 1.00 ₪</span>
                    ) : (
                      <span>1 {curr.symbol} = {curr.rateAgainstBase} ₪</span>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center text-slate-500 font-mono text-[11px]">
                    {curr.updatedAt || 'اليوم'}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {isBase ? (
                      <span className="text-emerald-700 text-[11px] font-bold">نشطة دائماً</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleActive(curr.code)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full cursor-pointer transition-colors ${
                          curr.isActive !== false
                            ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {curr.isActive !== false ? 'مفعلة' : 'معطلة'}
                      </button>
                    )}
                  </td>
                  <td className="py-2 px-3 text-center">
                    {!isBase && !isEditing && (
                      <button
                        type="button"
                        onClick={() => handleStartEdit(curr)}
                        className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800 font-semibold px-2 py-1 rounded hover:bg-blue-50 cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>تعديل السعر</span>
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Modal to add custom currency */}
      {isAddingCurrency && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-5 max-w-md w-full text-slate-800 space-y-4 animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-emerald-600" />
                <span>إضافة عملة جديدة للنظام</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsAddingCurrency(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAddCurrency} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                  كود العملة الدولي (3 أحرف):
                </label>
                <input
                  type="text"
                  required
                  maxLength={5}
                  value={newCode}
                  onChange={e => setNewCode(e.target.value.toUpperCase())}
                  placeholder="مثال: GBP أو TRY أو KWD"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs uppercase focus:bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                  اسم العملة باللغة العربية:
                </label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="مثال: جنيه إسترليني أو ليرة تركية"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-xs focus:bg-white focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                    رمز العملة:
                  </label>
                  <input
                    type="text"
                    required
                    value={newSymbol}
                    onChange={e => setNewSymbol(e.target.value)}
                    placeholder="مثال: £ أو ₺ أو د.ك"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono text-xs focus:bg-white focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1 text-[11px]">
                    سعر الصرف (كم شيكل = 1 وحدة):
                  </label>
                  <input
                    type="number"
                    step="0.0001"
                    min="0.0001"
                    required
                    value={newRate}
                    onChange={e => setNewRate(parseFloat(e.target.value) || 1)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono font-bold text-xs focus:bg-white focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddingCurrency(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer text-xs flex items-center gap-1 shadow-xs"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>حفظ العملة</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
