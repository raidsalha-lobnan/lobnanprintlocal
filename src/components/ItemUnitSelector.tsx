import React, {useMemo} from 'react';
import {useAccounting} from '../context/AccountingContext';
import {Scale, Settings2} from 'lucide-react';

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

/**
 * Only the units expressly configured in Settings are selectable.
 * Historical inventory units are preserved in existing records but are not
 * silently promoted to approved choices or altered without user selection.
 */
export const ItemUnitSelector: React.FC<ItemUnitSelectorProps> = ({
  value, onChange, label = 'وحدة الصنف:',
  placeholder = 'اختر وحدة من الإعدادات',
  className = '', showLabel = true, compact = false,
}) => {
  const {settings, setActiveTab} = useAccounting();
  const units = useMemo(() => {
    const known = new Set<string>();
    return (settings.unitsOfMeasure || []).filter(unit => {
      const id=(unit.symbol || unit.name || '').trim();
      if (!id || known.has(id)) return false;
      known.add(id);
      return true;
    });
  }, [settings.unitsOfMeasure]);

  const approvedUnit = units.find(unit =>
    unit.symbol === value || unit.name === value
  );
  const selectedValue = approvedUnit
    ? (approvedUnit.symbol || approvedUnit.name) : '';
  const unsupportedValue = Boolean(value && !approvedUnit);

  return (
    <div className={'space-y-1.5 '+className}>
      {showLabel && (
        <div className="flex items-center justify-between gap-2">
          <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
            <Scale className="h-3.5 w-3.5 text-blue-600"/>
            {label}
          </label>
          <span className="text-[10px] text-slate-500">{units.length} وحدة معتمدة</span>
        </div>
      )}
      <select
        value={selectedValue}
        onChange={e => onChange(e.target.value)}
        aria-label={label}
        className={'w-full cursor-pointer rounded-md border border-slate-300 bg-white p-1.5 text-xs font-medium text-slate-800 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ' +
          (compact ? 'py-1 text-[11px]' : '')}
      >
        <option value="" disabled>{units.length ? placeholder : 'لا توجد وحدات معتمدة في الإعدادات'}</option>
        {units.map(unit => (
          <option key={unit.id} value={unit.symbol || unit.name}>
            {unit.name}{unit.symbol && unit.symbol !== unit.name ? ' ('+unit.symbol+')' : ''}
          </option>
        ))}
      </select>
      {(unsupportedValue || units.length === 0) && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          <span>
            {unsupportedValue
              ? 'الوحدة الحالية غير معتمدة. اختر وحدة من الإعدادات دون تغيير السجلات السابقة تلقائيًا.'
              : 'أضف وحدة صنف من إعدادات البرنامج أولًا.'}
          </span>
          <button type="button" onClick={() => setActiveTab('settings')}
            className="inline-flex items-center gap-1 font-bold text-blue-700 hover:underline">
            <Settings2 className="h-3 w-3"/> الإعدادات
          </button>
        </div>
      )}
    </div>
  );
};
