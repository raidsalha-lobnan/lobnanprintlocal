import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { UnitOfMeasure, UnitCalculationType } from '../../types';
import { defaultUnitsOfMeasure, getUnitCalculationLabel } from '../../utils/unitsOfMeasure';
import { Scale, Plus, Edit2, Trash2, Check, X, Info } from 'lucide-react';
import { posSound } from '../../utils/audio';

export const UnitsOfMeasureSettings: React.FC = () => {
  const { settings, updateSettings } = useAccounting();

  const currentUnits: UnitOfMeasure[] = settings.unitsOfMeasure && settings.unitsOfMeasure.length > 0
    ? settings.unitsOfMeasure
    : defaultUnitsOfMeasure;

  const [units, setUnits] = useState<UnitOfMeasure[]>(currentUnits);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingUnitId, setEditingUnitId] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [symbol, setSymbol] = useState('');
  const [calculationType, setCalculationType] = useState<UnitCalculationType>('unit');
  const [description, setDescription] = useState('');
  const [isSavedSuccess, setIsSavedSuccess] = useState(false);

  const handleOpenAdd = () => {
    setEditingUnitId(null);
    setName('');
    setNameEn('');
    setSymbol('');
    setCalculationType('unit');
    setDescription('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (unit: UnitOfMeasure) => {
    setEditingUnitId(unit.id);
    setName(unit.name);
    setNameEn(unit.nameEn || '');
    setSymbol(unit.symbol || '');
    setCalculationType(unit.calculationType);
    setDescription(unit.description || '');
    setShowAddModal(true);
  };

  const handleDelete = (unitId: string) => {
    if (confirm('هل أنت متأكد من رغبتك في حذف وحدة القياس هذه؟')) {
      const updated = units.filter(u => u.id !== unitId);
      setUnits(updated);
      updateSettings({ unitsOfMeasure: updated });
      posSound.playSuccessBeep();
    }
  };

  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    let updated: UnitOfMeasure[];
    if (editingUnitId) {
      updated = units.map(u =>
        u.id === editingUnitId
          ? {
              ...u,
              name: name.trim(),
              nameEn: nameEn.trim() || undefined,
              symbol: symbol.trim() || name.trim(),
              calculationType,
              description: description.trim() || undefined
            }
          : u
      );
    } else {
      const newUnit: UnitOfMeasure = {
        id: `unit-${Date.now()}`,
        code: `u_${Date.now().toString().slice(-4)}`,
        name: name.trim(),
        nameEn: nameEn.trim() || undefined,
        symbol: symbol.trim() || name.trim(),
        calculationType,
        description: description.trim() || undefined,
        isDefault: false
      };
      updated = [...units, newUnit];
    }

    setUnits(updated);
    updateSettings({ unitsOfMeasure: updated });
    posSound.playSuccessBeep();
    setShowAddModal(false);
    setIsSavedSuccess(true);
    setTimeout(() => setIsSavedSuccess(false), 2000);
  };

  return (
    <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6 text-xs text-slate-800" dir="rtl">
      {/* Title & Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-100 text-blue-800 rounded-xl">
            <Scale className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-base text-slate-900">إدارة وتعدد وحدات القياس للأصناف</h3>
            <p className="text-slate-500 text-xs">
              تحديد وحدات القياس (المتر المربع م²، المتر الطولي م.ط، القطعة/الحبة، الرول، الكيلو) مع ضبط آلية احتساب السعر تلقائياً في الكاشير
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleOpenAdd}
          className="px-4 py-2 bg-[#1f4a7c] hover:bg-blue-800 text-white rounded-xl font-bold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة وحدة قياس جديدة</span>
        </button>
      </div>

      {isSavedSuccess && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-800 p-3 rounded-xl font-bold flex items-center gap-2">
          <Check className="w-4 h-4" />
          <span>تم حفظ تحديثات وحدات القياس بنجاح!</span>
        </div>
      )}

      {/* Info Explainer */}
      <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3.5 flex items-start gap-2.5 text-blue-900">
        <Info className="w-4 h-4 text-blue-700 shrink-0 mt-0.5" />
        <div className="space-y-1 text-[11px] leading-relaxed">
          <p className="font-bold">آليات الاحتساب المعتمدة في النظام:</p>
          <ul className="list-disc list-inside space-y-0.5 text-blue-800">
            <li><strong>متر مربع (م² - Area):</strong> يتم حساب الإجمالي تلقائياً بضرب: <code>الطول × العرض × الكمية × سعر المتر</code> (مناسب للبنرات، الفليكس، الزجاج، اللوحات).</li>
            <li><strong>متر طولي (م.ط - Linear):</strong> يتم حساب الإجمالي تلقائياً بضرب: <code>الطول × الكمية × سعر المتر الطولي</code> (مناسب للقص والتجليد ورولات الأسلاك).</li>
            <li><strong>بالوحدة / الحبة (Unit):</strong> يتم حساب الإجمالي بضرب: <code>الكمية × سعر الحبة</code> (مناسب للدفاتر، الأقلام، والكتب).</li>
          </ul>
        </div>
      </div>

      {/* Units Table */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-right border-collapse text-xs">
          <thead>
            <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
              <th className="py-2.5 px-4">اسم الوحدة</th>
              <th className="py-2.5 px-3">الرمز المختصر</th>
              <th className="py-2.5 px-4">آلية الاحتساب الرياضي</th>
              <th className="py-2.5 px-4">الوصف والتطبيق</th>
              <th className="py-2.5 px-3 w-24 text-center">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200">
            {units.map(unit => (
              <tr key={unit.id} className="hover:bg-slate-50 transition-colors">
                <td className="py-3 px-4 font-bold text-slate-900">
                  <div className="flex items-center gap-2">
                    <span>{unit.name}</span>
                    {unit.nameEn && <span className="text-slate-400 font-normal text-[11px]">({unit.nameEn})</span>}
                    {unit.isDefault && (
                      <span className="bg-emerald-100 text-emerald-800 text-[10px] px-2 py-0.5 rounded-md font-bold">
                        افتراضي
                      </span>
                    )}
                  </div>
                </td>
                <td className="py-3 px-3 font-mono font-bold text-blue-800">
                  {unit.symbol || unit.name}
                </td>
                <td className="py-3 px-4">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-md font-bold text-[11px] ${
                      unit.calculationType === 'area'
                        ? 'bg-purple-100 text-purple-900 border border-purple-200'
                        : unit.calculationType === 'linear'
                        ? 'bg-amber-100 text-amber-900 border border-amber-200'
                        : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                    }`}
                  >
                    {getUnitCalculationLabel(unit.calculationType)}
                  </span>
                </td>
                <td className="py-3 px-4 text-slate-600 text-[11px]">
                  {unit.description || '-'}
                </td>
                <td className="py-3 px-3 text-center">
                  <div className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(unit)}
                      className="p-1 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded cursor-pointer"
                      title="تعديل وحدة القياس"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {!unit.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleDelete(unit.id)}
                        className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded cursor-pointer"
                        title="حذف"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal Add/Edit */}
      {showAddModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/50 backdrop-blur-2xs flex items-center justify-center p-3">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-300 w-full max-w-md p-5 text-xs text-slate-800 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h4 className="font-bold text-sm text-[#1f4a7c]">
                {editingUnitId ? 'تعديل وحدة القياس' : 'إضافة وحدة قياس جديدة'}
              </h4>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveModal} className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">اسم الوحدة بالعربي (مثال: متر مربع، متر طولي، باكت):</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="متر مربع (م²)"
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">الرمز المختصر:</label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={e => setSymbol(e.target.value)}
                    placeholder="م²"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الاسم بالإنجليزي (اختياري):</label>
                  <input
                    type="text"
                    value={nameEn}
                    onChange={e => setNameEn(e.target.value)}
                    placeholder="Square Meter"
                    className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">آلية الاحتساب في الفاتورة والكاشير:</label>
                <select
                  value={calculationType}
                  onChange={e => setCalculationType(e.target.value as UnitCalculationType)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs font-bold"
                >
                  <option value="area">متر مربع (الطول × العرض × الكمية × السعر)</option>
                  <option value="linear">متر طولي (الطول × الكمية × السعر)</option>
                  <option value="unit">بالوحدة / القطعة (الكمية × السعر)</option>
                  <option value="custom">مخصص</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">الوصف أو ملاحظات الاستخدام:</label>
                <input
                  type="text"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder="للبنرات واللوحات الإعلانية..."
                  className="w-full px-3 py-1.5 border border-slate-300 rounded-lg text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-[#1f4a7c] hover:bg-blue-800 text-white font-bold rounded-xl shadow-xs cursor-pointer"
                >
                  حفظ الوحدة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
