import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { InventoryItem } from '../../types';
import { Search, Plus, CheckCircle2, AlertCircle, Package } from 'lucide-react';
import { matchItemByBarcode } from '../../utils/barcodeGenerator';

interface ItemAutocompleteInputProps {
  value: string;
  lineId: string;
  inventoryItemId?: string;
  barcode?: string;
  inventory: InventoryItem[];
  pricingTier?: 'retail' | 'wholesale' | 'special';
  currency?: string;
  onChangeText: (text: string) => void;
  onSelectItem: (item: InventoryItem) => void;
  onQuickAdd?: (nameQuery: string) => void;
  onOpenSearchModal?: () => void;
  placeholder?: string;
  isActiveRow?: boolean;
}

// Arabic normalization helper for resilient searching
function normalizeArabic(text: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/[\u064B-\u065F\u0670]/g, '') // remove Tashkeel
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[يى]/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/[-_.,()/\\]/g, ' ');
}

// Helper to highlight matching letters
function HighlightMatch({ text, query }: { text: string; query: string }) {
  if (!query?.trim() || !text) return <span>{text}</span>;

  const normalizedText = normalizeArabic(text);
  const normalizedQuery = normalizeArabic(query);
  const index = normalizedText.indexOf(normalizedQuery);

  if (index === -1) {
    return <span>{text}</span>;
  }

  const before = text.substring(0, index);
  const match = text.substring(index, index + query.length);
  const after = text.substring(index + query.length);

  return (
    <span>
      {before}
      <span className="bg-amber-200/90 text-amber-950 font-black px-0.5 rounded-xs underline decoration-amber-500">
        {match}
      </span>
      {after}
    </span>
  );
}

export const ItemAutocompleteInput: React.FC<ItemAutocompleteInputProps> = ({
  value,
  lineId,
  inventoryItemId,
  barcode,
  inventory,
  onChangeText,
  onSelectItem,
  onQuickAdd,
  onOpenSearchModal,
  placeholder = 'اسم الصنف أو الخدمة...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number; showAbove: boolean } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Matched registered inventory item if already linked
  const linkedItem = useMemo(() => {
    if (!inventoryItemId && !barcode) return null;
    return (inventory || []).find(i => (inventoryItemId && i.id === inventoryItemId) || (barcode && matchItemByBarcode(i, barcode)));
  }, [inventory, inventoryItemId, barcode]);

  // Compute matching inventory items
  const matches = useMemo(() => {
    if (!inventory || inventory.length === 0) return [];

    const normQuery = normalizeArabic(value);
    const rawQuery = (value || '').trim().toLowerCase();

    if (!normQuery) {
      // If query is empty, show the first 15 registered items
      return inventory.slice(0, 15);
    }

    const filtered = inventory.filter(it => {
      if (!it) return false;
      const normName = normalizeArabic(it.name || '');
      const code = (it.code || '').toLowerCase();
      const bcode = (it.barcode || '').toLowerCase();
      const hasMultiBarcodeMatch =
        (it.additionalBarcodes && it.additionalBarcodes.some(b => b && b.toLowerCase().includes(rawQuery))) ||
        (it.barcodeEntries && it.barcodeEntries.some(b => (b.barcode && b.barcode.toLowerCase().includes(rawQuery)) || (b.label && b.label.toLowerCase().includes(rawQuery))));

      return (
        normName.includes(normQuery) ||
        code.includes(rawQuery) ||
        bcode.includes(rawQuery) ||
        hasMultiBarcodeMatch
      );
    });

    // Sort: exact matches first, then prefix matches, then alphabetical
    filtered.sort((a, b) => {
      const aNorm = normalizeArabic(a.name || '');
      const bNorm = normalizeArabic(b.name || '');
      const aStarts = aNorm.startsWith(normQuery);
      const bStarts = bNorm.startsWith(normQuery);

      if (aStarts && !bStarts) return -1;
      if (!aStarts && bStarts) return 1;
      return aNorm.localeCompare(bNorm);
    });

    return filtered.slice(0, 15);
  }, [inventory, value]);

  // Update floating dropdown coordinates
  const updatePosition = useCallback(() => {
    if (!inputRef.current) return;
    const rect = inputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = 280;
    const showAbove = spaceBelow < estimatedHeight && rect.top > estimatedHeight;

    setCoords({
      top: showAbove ? rect.top - 6 : rect.bottom + 4,
      left: Math.max(10, Math.min(rect.left, window.innerWidth - 380)),
      width: Math.max(rect.width, 360),
      showAbove
    });
  }, []);

  // Update position on window scroll or resize
  useEffect(() => {
    if (!isOpen) return;
    updatePosition();

    const handleScrollOrResize = () => {
      updatePosition();
    };

    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);

    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, updatePosition]);

  // Handle outside clicks to close dropdown
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(target)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const justSelectedRef = useRef(false);

  // Select an item from the suggestions
  const handleSelect = (item: InventoryItem) => {
    justSelectedRef.current = true;
    setIsOpen(false);
    setHighlightedIndex(-1);
    onSelectItem(item);
    setTimeout(() => {
      justSelectedRef.current = false;
    }, 400);
  };

  // Keyboard navigation inside input
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        updatePosition();
        setHighlightedIndex(0);
      } else if (matches.length > 0) {
        setHighlightedIndex(prev => (prev < matches.length - 1 ? prev + 1 : 0));
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (isOpen && matches.length > 0) {
        setHighlightedIndex(prev => (prev > 0 ? prev - 1 : matches.length - 1));
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (isOpen && matches.length > 0) {
        const selected = (highlightedIndex >= 0 && highlightedIndex < matches.length)
          ? matches[highlightedIndex]
          : matches[0];
        handleSelect(selected);
      } else {
        setIsOpen(false);
        // Move focus directly to the next editable field in the row
        const notesInput = document.getElementById(`notes-input-${lineId}`) as HTMLInputElement | null;
        const lengthInput = document.getElementById(`length-input-${lineId}`) as HTMLInputElement | null;
        const countInput = document.getElementById(`count-input-${lineId}`) as HTMLInputElement | null;
        const qtyInput = (document.getElementById(`quantity-input-${lineId}`) || document.getElementById(`dim-quantity-input-${lineId}`)) as HTMLInputElement | null;
        const target = notesInput || lengthInput || countInput || qtyInput;
        if (target) {
          target.focus();
          if (typeof target.select === 'function') target.select();
        }
      }
    } else if (e.key === 'Tab') {
      if (isOpen && matches.length > 0) {
        e.preventDefault();
        const selected = (highlightedIndex >= 0 && highlightedIndex < matches.length)
          ? matches[highlightedIndex]
          : matches[0];
        handleSelect(selected);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full flex items-center">
      {/* Search Input with visual inventory link indicator */}
      <div className="relative w-full flex items-center">
        <input
          id={`item-input-${lineId}`}
          ref={inputRef}
          type="text"
          value={value}
          onChange={e => {
            onChangeText(e.target.value);
            if (!isOpen) {
              setIsOpen(true);
              updatePosition();
            }
            setHighlightedIndex(0);
          }}
          onFocus={() => {
            if (justSelectedRef.current) return;
            setIsOpen(true);
            updatePosition();
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={`w-full pr-2 pl-7 py-1.5 bg-transparent border-0 rounded-none focus:outline-none font-bold text-slate-900 text-xs transition-colors ${
            linkedItem ? 'text-blue-900' : ''
          }`}
        />

        {/* Action / Linked badge icon on the left edge */}
        <div className="absolute left-1 flex items-center gap-1">
          {linkedItem ? (
            <span
              title={`مرتبط بالصنف: ${linkedItem.name} (${linkedItem.code || ''})`}
              className="text-emerald-600 hover:text-emerald-700 cursor-pointer flex items-center"
              onClick={e => {
                e.stopPropagation();
                setIsOpen(prev => !prev);
                updatePosition();
              }}
            >
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            </span>
          ) : (
            <button
              type="button"
              tabIndex={-1}
              onClick={e => {
                e.stopPropagation();
                inputRef.current?.focus();
                setIsOpen(prev => !prev);
                updatePosition();
              }}
              title="البحث في قائمة الأصناف"
              className="text-slate-400 hover:text-blue-600 p-0.5 rounded cursor-pointer transition-colors"
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Floating Suggestions Dropdown (Rendered in Portal to prevent clipping) */}
      {isOpen &&
        coords &&
        createPortal(
          <div
            ref={dropdownRef}
            dir="rtl"
            style={{
              position: 'fixed',
              top: coords.showAbove ? undefined : coords.top,
              bottom: coords.showAbove ? window.innerHeight - coords.top : undefined,
              left: coords.left,
              width: coords.width,
              zIndex: 99999
            }}
            className="bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden text-slate-800 text-xs animate-in fade-in zoom-in-95 duration-100 ring-4 ring-slate-900/10"
          >
            {/* Header */}
            <div className="bg-slate-800 text-white px-3 py-1.5 flex items-center justify-between shadow-xs">
              <div className="flex items-center gap-1.5">
                <Package className="w-3.5 h-3.5 text-blue-300" />
                <span className="font-bold text-xs">قائمة الأصناف</span>
                <span className="bg-slate-700 text-slate-200 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                  {matches.length}
                </span>
              </div>
              <div className="text-[10px] text-slate-300 flex items-center gap-1">
                <span>↑↓ للتنقل</span>
                <span>•</span>
                <span>Enter للاختيار</span>
              </div>
            </div>

            {/* List of items - ONLY Item Number and Item Name on the same line */}
            <div className="max-h-60 overflow-y-auto divide-y divide-slate-100">
              {matches.length === 0 ? (
                <div className="p-4 text-center">
                  <div className="text-amber-600 font-semibold text-xs mb-1 flex items-center justify-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    <span>لم يتم العثور على صنف مطابق لـ "{value}"</span>
                  </div>
                  <p className="text-[10px] text-slate-400 font-light mb-3">
                    يمكنك إبقاء المسمى أو إضافة صنف جديد للمخزون.
                  </p>
                  {onQuickAdd && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onQuickAdd(value);
                      }}
                      className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1 mx-auto shadow-xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>إضافة "{value}" كصنف جديد</span>
                    </button>
                  )}
                </div>
              ) : (
                matches.map((item, idx) => {
                  const isHighlighted = idx === highlightedIndex;

                  return (
                    <div
                      key={`auto-item-${item.id || idx}-${idx}`}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setHighlightedIndex(idx)}
                      className={`px-3 py-2 transition-colors cursor-pointer flex items-center gap-2.5 ${
                        isHighlighted
                          ? 'bg-blue-600 text-white font-semibold'
                          : 'hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      {/* 1. رقم الصنف (Item Code) */}
                      {item.code ? (
                        <span
                          className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border shrink-0 transition-colors ${
                            isHighlighted
                              ? 'bg-blue-700 text-white border-blue-500'
                              : 'bg-slate-100 text-slate-700 border-slate-300'
                          }`}
                        >
                          {item.code}
                        </span>
                      ) : (
                        <span
                          className={`font-mono text-[11px] px-2 py-0.5 rounded border shrink-0 ${
                            isHighlighted
                              ? 'bg-blue-700 text-blue-200 border-blue-500'
                              : 'bg-slate-50 text-slate-400 border-slate-200'
                          }`}
                        >
                          -
                        </span>
                      )}

                      {/* 2. اسم الصنف على نفس السطر (Item Name) */}
                      <span
                        className={`flex-1 min-w-0 text-xs font-bold truncate ${
                          isHighlighted ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        <HighlightMatch text={item.name} query={value} />
                      </span>
                    </div>
                  );
                })
              )}
            </div>

            {/* Bottom Actions Bar */}
            <div className="bg-slate-50 border-t border-slate-200 px-3 py-1.5 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                {onQuickAdd && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onQuickAdd(value);
                    }}
                    className="text-blue-700 hover:text-blue-900 hover:underline flex items-center gap-1 font-bold text-[11px] cursor-pointer"
                  >
                    <Plus className="w-3 h-3 text-blue-600" />
                    <span>صنف جديد للمخزون</span>
                  </button>
                )}
                {onOpenSearchModal && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      onOpenSearchModal();
                    }}
                    className="text-slate-600 hover:text-slate-800 hover:underline flex items-center gap-1 text-[11px] cursor-pointer mr-2 border-r border-slate-300 pr-2"
                  >
                    <Search className="w-3 h-3 text-slate-500" />
                    <span>بحث شامل (F3)</span>
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-[11px] text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                إغلاق (Esc)
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
