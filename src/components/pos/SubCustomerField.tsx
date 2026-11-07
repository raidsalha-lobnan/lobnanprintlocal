import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Party } from '../../types';
import { UserCheck, FileText, Phone, Link as LinkIcon, ChevronDown, Plus, AlertCircle } from 'lucide-react';

interface SubCustomerFieldProps {
  compact?: boolean;
  parentCustomerId?: string;
  parentCustomerName?: string;
  parties: Party[];
  customCustomerText: string;
  onChangeCustomText: (text: string) => void;
  subCustomerId?: string;
  onSelectSubCustomer: (subCustomer: Party | null) => void;
  subCustomerName: string;
  onChangeSubCustomerName: (name: string) => void;
  subCustomerPhone: string;
  onChangeSubCustomerPhone: (phone: string) => void;
  onOpenSubCustomerStatement: (subCustomer: Party) => void;
  onSelectMainCustomer?: (customer: Party) => void;
  onQuickAddSub?: (name: string, phone: string) => void;
}

const normalizeArabic = (text: string = '') => {
  return text
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[يى]/g, 'ي');
};

export const SubCustomerField: React.FC<SubCustomerFieldProps> = ({
  compact = false,
  parentCustomerId,
  parentCustomerName,
  parties = [],
  customCustomerText,
  onChangeCustomText,
  subCustomerId,
  onSelectSubCustomer,
  subCustomerName,
  onChangeSubCustomerName,
  subCustomerPhone,
  onChangeSubCustomerPhone,
  onOpenSubCustomerStatement,
  onSelectMainCustomer,
  onQuickAddSub
}) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 1. All main customers in the system (strictly main only)
  const mainCustomers = useMemo(() => {
    return parties.filter(p => !p.isSubCustomer && (p.type === 'customer' || p.type === 'both'));
  }, [parties]);

  // Set of normalized names of all main customers
  const mainCustomerNamesSet = useMemo(() => {
    const set = new Set<string>();
    mainCustomers.forEach(p => {
      const norm = normalizeArabic(p.name);
      if (norm) set.add(norm);
    });
    return set;
  }, [mainCustomers]);

  // 2. All valid sub-customers: must have isSubCustomer===true AND must NEVER match any main customer name
  const allSubs = useMemo(() => {
    return parties.filter(p => {
      if (!p.isSubCustomer) return false;
      const norm = normalizeArabic(p.name);
      // Exclude if it shares the name of any main customer
      if (mainCustomerNamesSet.has(norm)) return false;
      return true;
    });
  }, [parties, mainCustomerNamesSet]);

  // 3. Sub-customers associated with the selected main customer or general sub-customers
  const linkedSubCustomers = useMemo(() => {
    return allSubs.filter(p => 
      (parentCustomerId && p.parentPartyId === parentCustomerId) ||
      (!parentCustomerId && p.isSubCustomer)
    );
  }, [allSubs, parentCustomerId]);

  // 4. Removed matchedMainCustomer based on user request to hide the warning.

  // 5. Filter sub-customers in real-time, strictly excluding any main customers
  const matchingSubCustomers = useMemo(() => {
    const raw = normalizeArabic(customCustomerText);

    if (!raw) {
      // If empty query, show sub-customers linked to current parent customer or top 15
      return parentCustomerId
        ? allSubs.filter(p => p.parentPartyId === parentCustomerId)
        : allSubs.slice(0, 15);
    }

    return allSubs.filter(p => {
      const normName = normalizeArabic(p.name);
      const cleanPhone = (p.phone || '').replace(/[\s-]/g, '');
      return normName.includes(raw) || cleanPhone.includes(raw);
    });
  }, [allSubs, customCustomerText, parentCustomerId]);

  // Currently active or matched sub-customer (must not be a main customer)
  const activeSubCustomer = useMemo(() => {
    return allSubs.find(p => 
      (subCustomerId && p.id === subCustomerId) ||
      (normalizeArabic(p.name) === normalizeArabic(subCustomerName))
    );
  }, [allSubs, subCustomerId, subCustomerName]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectExisting = (sub: Party) => {
    onSelectSubCustomer(sub);
    onChangeSubCustomerName(sub.name);
    onChangeSubCustomerPhone(sub.phone || '');
    onChangeCustomText(`${sub.name}${sub.phone ? ` ${sub.phone}` : ''}`);
    setShowSuggestions(false);
  };

  const handleTextChange = (text: string) => {
    onChangeCustomText(text);

    // Extract phone if typed within text
    const phoneMatch = text.match(/(05\d{8}|01\d{8,9}|\+?\d{9,12})/);
    const extractedPhone = phoneMatch ? phoneMatch[0] : '';
    const extractedName = text.replace(extractedPhone, '').trim();
    const queryNorm = normalizeArabic(extractedName || text);

    onChangeSubCustomerName(extractedName || text);
    if (extractedPhone) {
      onChangeSubCustomerPhone(extractedPhone);
    }

    // Check if it matches an existing registered sub-customer
    const matched = linkedSubCustomers.find(p => 
      normalizeArabic(p.name) === queryNorm ||
      (extractedPhone && p.phone && p.phone.replace(/[\s-]/g, '') === extractedPhone.replace(/[\s-]/g, ''))
    );
    if (matched) {
      onSelectSubCustomer(matched);
    } else if (subCustomerId) {
      onSelectSubCustomer(null);
    }
  };

  const handleBlur = () => {
    // Intentionally do not auto-create sub-customer on blur per user request.
    // The user must explicitly click the add button to create a new sub-customer.
  };

  return (
    <div ref={containerRef} className={`w-full relative ${compact ? '' : 'space-y-1'}`}>
      {/* Input container */}
      <div className="relative flex items-center">
        <input
          type="text"
          value={customCustomerText}
          onChange={e => handleTextChange(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onBlur={handleBlur}
          placeholder={compact ? "اسم أو هاتف الزبون الفرعي..." : "اسم ثانوي أو زبون فرعي ورقم هاتفه (مثال: محمود أحمد 01557735502)"}
          className={`w-[324.631px] border rounded px-2.5 ${compact ? 'py-0.5' : 'py-1'} text-center font-bold text-xs shadow-2xs focus:outline-none pl-7 pr-7 bg-[#fdfbe9] border-amber-300 text-slate-800 focus:bg-white focus:border-amber-500`}
        />

        {linkedSubCustomers.length > 0 && (
          <button
            type="button"
            onClick={() => setShowSuggestions(!showSuggestions)}
            className="absolute left-1.5 p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
            title="عرض الزبائن الفرعيين المسجلين لهذا العميل"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSuggestions ? 'rotate-180' : ''}`} />
          </button>
        )}

        {activeSubCustomer ? (
          <div className="absolute right-2 flex items-center text-emerald-600" title="زبون فرعي مسجل ومعتمد">
            <UserCheck className="w-3.5 h-3.5" />
          </div>
        ) : null}
      </div>

      {/* Dropdown Suggestions of existing sub-customers */}
      {showSuggestions && (
        <div className="absolute top-full left-0 right-0 mt-1 z-30 bg-white border border-slate-300 rounded-lg shadow-xl max-h-60 overflow-y-auto text-xs">
          {matchingSubCustomers.length > 0 ? (
            <div>
              <div className="p-1.5 bg-slate-100 text-slate-600 font-bold border-b border-slate-200 text-[10px] flex items-center justify-between">
                <span>الزبائن الفرعيين المطابقين للبحث:</span>
                <span className="text-slate-500 font-mono">{matchingSubCustomers.length} نتيجة</span>
              </div>
              <div className="divide-y divide-slate-100">
                {matchingSubCustomers.map(sub => (
                  <div
                    key={sub.id}
                    onClick={() => handleSelectExisting(sub)}
                    className="p-2 hover:bg-amber-50 flex items-center justify-between cursor-pointer transition-colors"
                  >
                    <div className="flex flex-col">
                      <span className="font-bold text-slate-800 flex items-center gap-1">
                        {sub.name}
                        {sub.id === subCustomerId && (
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 px-1 rounded font-normal">الحالي</span>
                        )}
                      </span>
                      {sub.phone && (
                        <span className="text-[9px] text-slate-400 font-light flex items-center gap-1 font-mono">
                          <Phone className="w-2.5 h-2.5 text-slate-400" />
                          {sub.phone}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-[11px] font-mono font-bold ${sub.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {sub.balance.toFixed(2)} ₪
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenSubCustomerStatement(sub);
                        }}
                        className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                        title="كشف حساب خاص بهذا الزبون الفرعي"
                      >
                        <FileText className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : customCustomerText.trim().length > 0 && !activeSubCustomer ? (
            <div className="p-2.5 text-center text-slate-600 bg-amber-50/50">
              <div className="flex items-center justify-center gap-1 text-amber-800 font-bold text-xs mb-0.5">
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة كاسم فرعي جديد: "{customCustomerText.trim()}"</span>
              </div>
              <p className="text-[9px] text-slate-400 font-light">
                سيتم حفظ الاسم تلقائياً في قائمة العملاء الفرعيين وتجميع حركاته المستقبلية في كشف حساب واحد
              </p>
            </div>
          ) : (
            <div className="p-3 text-center text-slate-500 text-[11px]">
              لا توجد نتائج مطابقة في الزبائن الفرعيين
            </div>
          )}
        </div>
      )}
    </div>
  );
};
