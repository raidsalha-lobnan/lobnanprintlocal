import React, { useMemo } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { getProgramUnitsWithCounts } from '../utils/unitsOfMeasure';
import { Scale, Settings2 } from 'lucide-react';

interface ItemUnitSelectorProps {
  value: string;
  onChange: (unit: string) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  showLabel?: boolean;
  showQuickPills?: boolean;
  compact?: boolean;
}

export const ItemUnitSelector: React.FC<ItemUnitSelectorProps> = ({
  value,
  onChange,
  label = 'وحدة القياس:',
  placeholder = 'اختر وحدة القياس...',
  className = '',
  showLabel = true,
  compact = false
}) => {
  const { inventory, settings, setActiveTab } = useAccounting();

  // جلب الوحدات المعتمدة من إعدادات البرنامج والأصناف
  const programUnits = useMemo(() => {
    return getProgramUnitsWithCounts(inventory, settings.unitsOfMeasure);
  }, [inventory, settings.unitsOfMeasure]);

  // الوحدات المضافة في إعدادات البرنامج
  const settingsUnits = useMemo(() => {
    return (settings.unitsOfMeasure || []).map(u => ({
      name: u.name,
      symbol: u.symbol || u.name,
      calc: u.calculationType
    }));
  }, [settings.unitsOfMeasure]);

  // التحقق مما إذا كانت القيمة الحالية موجودة في القائمة
  const isValueIncluded = useMemo(() => {
    if (!value) return true;
    return programUnits.some(u => u.unit.trim().toLowerCase() === value.trim().toLowerCase());
  }, [programUnits, value]);

  return (
    <div className={`space-y-1.5 ${className}`}>
      {showLabel && (
        <div className="flex items-center justify-between">
          <label className="block text-slate-700 font-semibold text-[11px] flex items-center gap-1">
            <Scale className="w-3 h-3 text-blue-600" />
            <span>{label}</span>
          </label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('settings')}
              className="text-[9px] text-slate-400 font-light hover:text-blue-600 flex items-center gap-0.5 transition-colors cursor-pointer"
              title="إضافة أو تعديل وحدات القياس في إعدادات البرنامج"
            >
              <Settings2 className="w-2.5 h-2.5" />
              <span>إعدادات الوحدات</span>
            </button>
            <span
              className="text-[9px] text-blue-600 bg-blue-50 px-1 py-0.2 rounded font-medium border border-blue-100"
              title="الوحدات المستخرجة من إعدادات البرنامج والأصناف"
            >
              {programUnits.length} وحدة
            </span>
          </div>
        </div>
      )}

      {/* Dropdown Menu (قائمة منسدلة) */}
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          className={`w-full bg-slate-50 border border-slate-300 rounded-md p-1.5 text-xs text-slate-800 focus:bg-white focus:ring-1 focus:ring-blue-500 focus:border-blue-500 font-medium cursor-pointer shadow-2xs ${
            compact ? 'py-1 text-[11px]' : ''
          }`}
          title="اختر وحدة القياس من قائمة وحدات البرنامج المعتمدة"
        >
          <option value="" disabled>
            {placeholder}
          </option>

          {/* إذا كانت القيمة الحالية مخصصة وليست مدرجة مسبقاً */}
          {value && !isValueIncluded && (
            <option value={value}>
              {value} (مخصصة)
            </option>
          )}

          {/* وحدات مضافة في إعدادات النظام */}
          {settingsUnits.length > 0 && (
            <optgroup label="⚙️ وحدات معرفة في إعدادات البرنامج">
              {settingsUnits.map((u, idx) => (
                <option key={`set-${idx}`} value={u.symbol || u.name}>
                  {u.name} {u.symbol && u.symbol !== u.name ? `(${u.symbol})` : ''}
                </option>
              ))}
            </optgroup>
          )}

          {/* سائر الوحدات المعتمدة في البرنامج والأصناف */}
          <optgroup label="📦 قائمة وحدات القياس المعتمدة">
            {programUnits.map(u => {
              // لا نكرر إذا كانت موجودة بالاسم
              return (
                <option key={u.unit} value={u.unit}>
                  {u.unit} {u.isFromInventory ? `(مستخدمة في ${u.count} صنف)` : ''}
                </option>
              );
            })}
          </optgroup>
        </select>
      </div>
    </div>
  );
};
