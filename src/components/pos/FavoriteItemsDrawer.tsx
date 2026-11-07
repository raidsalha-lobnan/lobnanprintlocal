import React, { useState } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { InventoryItem } from '../../types';
import { X, Star, Plus, Image as ImageIcon, Search } from 'lucide-react';
import { posSound } from '../../utils/audio';

interface FavoriteItemsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectItem: (item: InventoryItem) => void;
}

export const FavoriteItemsDrawer: React.FC<FavoriteItemsDrawerProps> = ({
  isOpen,
  onClose,
  onSelectItem
}) => {
  const { inventory, settings } = useAccounting();
  const [searchQuery, setSearchQuery] = useState('');

  // Default to favorites_only if there are favorite items
  const hasFavorites = (inventory || []).some(i => i.isFavorite);
  const [selectedCategory, setSelectedCategory] = useState<string>(hasFavorites ? 'favorites_only' : 'all');

  if (!isOpen) return null;

  // استخراج التصنيفات ديناميكياً من الأصناف المسجلة وإعدادات النظام
  const categoryNameMap: Record<string, string> = {
    print_raw: 'خامات ومواد الطباعة',
    stationery: 'قرطاسية ومكتبية',
    books: 'كتب وروايات وملازم',
    print_service: 'خدمات الطباعة',
    copy_scan: 'تصوير ومستندات',
    shields_gifts: 'دروع وهدايا',
    office_supplies: 'أدوات مكتبية',
    packaging: 'تغليف وتجليد',
    gifts: 'هدايا وتذكارات',
    services: 'خدمات سريعة'
  };

  const settingsCategories = settings?.categories || [];
  const settingsMap = new Map<string, string>();
  settingsCategories.forEach(cat => {
    if (cat && cat.id) {
      settingsMap.set(cat.id, cat.name);
      settingsMap.set(cat.name, cat.name);
    }
  });

  const rawCategories = Array.from(
    new Set([
      ...(inventory || []).map(i => (i.category || '').trim()).filter(Boolean),
      ...settingsCategories.map(c => c.id)
    ])
  ).filter(cat => !/^\d{5,}$/.test(cat));

  const dynamicCategories = rawCategories.map(catKey => {
    const resolvedName = settingsMap.get(catKey) || categoryNameMap[catKey] || catKey;
    const catItems = (inventory || []).filter(i => {
      const itemCat = (i.category || '').trim();
      return itemCat === catKey || (settingsMap.get(itemCat) === resolvedName);
    });
    return {
      id: catKey,
      label: `${resolvedName} (${catItems.length})`,
      count: catItems.length
    };
  }).filter(c => c.count > 0 || settingsCategories.some(sc => sc.id === c.id));

  const categories = [
    { id: 'favorites_only', label: `⭐ المفضلة (${(inventory || []).filter(i => i.isFavorite).length})` },
    { id: 'all', label: `جميع الأصناف (${(inventory || []).length})` },
    ...dynamicCategories
  ];

  const filteredItems = (inventory || []).filter(item => {
    if (!item) return false;

    // Search query match
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const match =
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.barcode && item.barcode.includes(q));
      if (!match) return false;
    }

    // Category filter
    if (selectedCategory === 'favorites_only') {
      return item.isFavorite === true;
    }
    if (selectedCategory === 'all') {
      return true;
    }

    const itemCat = (item.category || '').trim();
    const targetCatDef = settingsCategories.find(c => c.id === selectedCategory || c.name === selectedCategory);
    const targetName = targetCatDef?.name || categoryNameMap[selectedCategory] || selectedCategory;

    return (
      itemCat === selectedCategory ||
      itemCat === targetName ||
      (targetCatDef && (itemCat === targetCatDef.id || itemCat === targetCatDef.name))
    );
  });

  const handlePickItem = (item: InventoryItem) => {
    posSound.playCashBeep();
    onSelectItem(item);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div className="bg-white w-full max-w-xl h-full shadow-2xl flex flex-col border-r border-slate-200 animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="bg-blue-800 text-white px-4 py-3 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-blue-700 rounded-lg shadow-inner">
              <Star className="w-4 h-4 text-amber-300 fill-amber-300" />
            </div>
            <div>
              <h3 className="font-bold text-sm">الأصناف والخدمات المفضلة للكاشير</h3>
              <p className="text-[11px] text-blue-200">عرض صور الأصناف والإضافة المباشرة للفاتورة بنقرة واحدة</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-blue-200 hover:text-white p-1.5 rounded-lg hover:bg-blue-700 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-2 bg-slate-100 border-b border-slate-200">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="بحث في الأصناف بالاسم أو الكود أو الباركود..."
              className="w-full bg-white border border-slate-300 rounded-lg pr-8 pl-3 py-1.5 text-xs focus:ring-2 focus:ring-blue-500 focus:outline-hidden"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute left-2.5 top-2 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Category filters */}
        <div className="p-2 bg-slate-50 border-b border-slate-200 flex gap-1.5 overflow-x-auto text-xs no-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-2.5 py-1 rounded-lg whitespace-nowrap font-bold text-xs cursor-pointer transition-all ${
                selectedCategory === cat.id
                  ? 'bg-blue-700 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Item Cards Grid with Images - 3 columns compact */}
        <div className="p-2.5 flex-1 overflow-y-auto grid grid-cols-3 gap-2 bg-slate-50/50">
          {filteredItems.length === 0 ? (
            <div className="col-span-3 text-center py-12 text-slate-400">
              <div className="w-12 h-12 mx-auto mb-2.5 rounded-full bg-slate-100 flex items-center justify-center text-slate-300">
                <Star className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-700">لا توجد أصناف مطابقة</p>
              <p className="text-[10px] text-slate-400 mt-1">
                {selectedCategory === 'favorites_only'
                  ? 'يمكنك إضافة أي صنف للمفضلة بوضع علامة النجمة ⭐ عليه في شاشة المخزن.'
                  : 'جرب البحث باسم صنف آخر أو اختر قسماً مختلفاً.'}
              </p>
            </div>
          ) : (
            filteredItems.map((item, idx) => (
              <div
                key={`fav-it-${item.id || idx}-${idx}`}
                onClick={() => handlePickItem(item)}
                className="bg-white border border-slate-200 hover:border-blue-500 hover:shadow-xs p-1.5 rounded-lg flex flex-col justify-between cursor-pointer transition-all group relative overflow-hidden active:scale-97"
                title={`${item.name}\nالسعر: ${item.sellingPrice.toFixed(2)} ₪\n(انقر للإضافة)`}
              >
                {/* Item Image Display */}
                <div className="relative w-full h-16 bg-slate-100 rounded overflow-hidden border border-slate-200 mb-1">
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 bg-slate-50">
                      <ImageIcon className="w-5 h-5 text-slate-300 mb-0.5" />
                      <span className="text-[8px] font-mono text-slate-400">{item.code}</span>
                    </div>
                  )}

                  {/* Favorite Star Badge */}
                  {item.isFavorite && (
                    <span className="absolute top-0.5 right-0.5 bg-amber-400 text-amber-950 rounded-full p-0.5 shadow-2xs" title="صنف مفضل">
                      <Star className="w-2.5 h-2.5 fill-amber-950" />
                    </span>
                  )}

                  {/* Stock Badge */}
                  <span className="absolute bottom-0.5 left-0.5 bg-slate-900/80 text-white font-mono font-bold text-[7.5px] px-1 py-0 rounded">
                    {item.stockQuantity}
                  </span>
                </div>

                {/* Details */}
                <div className="flex-1 flex flex-col justify-between">
                  <h4 className="font-bold text-[10px] text-slate-900 line-clamp-2 leading-tight group-hover:text-blue-700 transition-colors h-6 mb-0.5">
                    {item.name}
                  </h4>

                  <div className="pt-0.5 border-t border-slate-100 flex items-center justify-between">
                    <span className="font-mono font-black text-blue-700 text-[11px]">
                      {item.sellingPrice.toFixed(2)} {settings.currency}
                    </span>
                    <div className="p-0.5 bg-blue-50 text-blue-700 rounded group-hover:bg-blue-600 group-hover:text-white transition-colors">
                      <Plus className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 border-t border-slate-200 flex justify-between items-center text-xs text-slate-600">
          <span className="font-medium">
            عدد الأصناف المعروضة: <strong className="text-slate-900 font-mono">{filteredItems.length}</strong>
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold rounded-lg cursor-pointer transition-colors"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
