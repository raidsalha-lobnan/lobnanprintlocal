import React, { useState, useMemo, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { InventoryItem, ItemCategory } from '../../types';
import { CATEGORY_DEFINITIONS } from '../../utils/barcodeGenerator';
import {
  Star,
  Plus,
  Image as ImageIcon,
  Search,
  ChevronRight,
  ChevronLeft,
  Filter,
  Check,
  Package,
  Layers,
  Sparkles,
  RefreshCw
} from 'lucide-react';
import { posSound } from '../../utils/audio';

interface PosFavoritesSidebarProps {
  onSelectItem: (item: InventoryItem) => void;
  className?: string;
}

export const PosFavoritesSidebar: React.FC<PosFavoritesSidebarProps> = ({
  onSelectItem,
  className = ''
}) => {
  const { inventory, updateInventoryItem, settings } = useAccounting();
  const [searchQuery, setSearchQuery] = useState('');
  const [densityMode, setDensityMode] = useState<'ultra' | 'normal'>(() => {
    try {
      const saved = localStorage.getItem('pos_favorites_density_mode');
      return saved === 'normal' ? 'normal' : 'ultra';
    } catch {
      return 'ultra';
    }
  });
  const [showOnlyFavorites, setShowOnlyFavorites] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pos_favorites_show_only_favs');
      return saved !== null ? saved === 'true' : true;
    } catch {
      return true;
    }
  });
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('pos_favorites_sidebar_collapsed');
      return saved !== null ? saved === 'true' : false;
    } catch {
      return false;
    }
  });

  const handleSetCollapsed = (val: boolean) => {
    setIsCollapsed(val);
    try {
      localStorage.setItem('pos_favorites_sidebar_collapsed', String(val));
    } catch {}
  };

  const handleToggleDensity = () => {
    setDensityMode(prev => {
      const next = prev === 'ultra' ? 'normal' : 'ultra';
      try {
        localStorage.setItem('pos_favorites_density_mode', next);
      } catch {}
      return next;
    });
  };

  const handleToggleShowOnlyFavorites = () => {
    setShowOnlyFavorites(prev => {
      const next = !prev;
      try {
        localStorage.setItem('pos_favorites_show_only_favs', String(next));
      } catch {}
      return next;
    });
  };

  // 1. استخراج التصنيفات ديناميكياً من التصنيفات المضافة في الأصناف وإعدادات النظام
  const categories = useMemo(() => {
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

    // خريطة التصنيفات المعرفة في الإعدادات
    const settingsCategories = settings?.categories || [];
    const settingsMap = new Map<string, string>();
    settingsCategories.forEach(cat => {
      if (cat && cat.id) {
        settingsMap.set(cat.id, cat.name);
        settingsMap.set(cat.name, cat.name);
      }
    });

    // استخراج كافة التصنيفات الموجودة فعلياً في أصناف المخزون
    const inventoryCategories = new Set<string>();
    (inventory || []).forEach(i => {
      const cat = (i.category || '').trim();
      if (cat && !/^\d{5,}$/.test(cat)) {
        inventoryCategories.add(cat);
      }
    });

    // دمج تصنيفات الإعدادات مع تصنيفات الأصناف المسجلة
    const allCategoryKeys = new Set<string>([
      ...Array.from(inventoryCategories),
      ...settingsCategories.map(c => c.id)
    ]);

    // بناء قائمة التصنيفات
    const catList = Array.from(allCategoryKeys)
      .map(catKey => {
        const def = CATEGORY_DEFINITIONS[catKey as ItemCategory];
        const resolvedName =
          settingsMap.get(catKey) ||
          categoryNameMap[catKey] ||
          def?.name ||
          catKey;

        const catItems = (inventory || []).filter(i => {
          const itemCat = (i.category || '').trim();
          return itemCat === catKey || (settingsMap.get(itemCat) === resolvedName);
        });
        const favItems = catItems.filter(i => i.isFavorite === true);

        return {
          id: catKey,
          name: resolvedName,
          totalCount: catItems.length,
          favCount: favItems.length,
          prefix: def?.prefix || 'ITM'
        };
      })
      .filter(c => c.totalCount > 0 || settingsCategories.some(sc => sc.id === c.id));

    // حساب إجمالي كافة الأصناف المفضلة في المخزون
    const allFavCount = (inventory || []).filter(i => i.isFavorite === true).length;
    const allItemsCount = (inventory || []).length;

    const allFavCategory = {
      id: 'all_favorites',
      name: '⭐ كافة المفضلة',
      totalCount: allItemsCount,
      favCount: allFavCount,
      prefix: 'FAV'
    };

    if (catList.length === 0) {
      const defaults = Object.entries(categoryNameMap).map(([id, name]) => {
        const cItems = (inventory || []).filter(i => (i.category || '').trim() === id);
        return {
          id,
          name,
          totalCount: cItems.length,
          favCount: cItems.filter(i => i.isFavorite === true).length,
          prefix: CATEGORY_DEFINITIONS[id as ItemCategory]?.prefix || 'ITM'
        };
      });
      return [allFavCategory, ...defaults];
    }

    // ترتيب التصنيفات: التصنيفات التي بها مفضلات أكثر تظهر أولاً
    const sorted = [...catList].sort((a, b) => {
      if (b.favCount !== a.favCount) return b.favCount - a.favCount;
      return b.totalCount - a.totalCount;
    });

    return [allFavCategory, ...sorted];
  }, [inventory, settings?.categories]);

  // 2. أول تصنيف يكون هو الظاهر مجرد فتح الكاشير تلقائياً
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    return categories[0]?.id || 'all_favorites';
  });

  // التأكد من أن التصنيف المختار صالح وموجود دائماً
  useEffect(() => {
    if (categories.length > 0 && !categories.some(c => c.id === selectedCategory)) {
      setSelectedCategory(categories[0].id);
    }
  }, [categories, selectedCategory]);

  const activeCategoryObj = categories.find(c => c.id === selectedCategory) || categories[0];

  // 3. الأصناف التابعة للتصنيف المختار
  const categoryItems = useMemo(() => {
    if (selectedCategory === 'all_favorites') {
      return (inventory || []).filter(i => i.isFavorite === true);
    }

    const settingsCategories = settings?.categories || [];
    const targetCatDef = settingsCategories.find(c => c.id === selectedCategory || c.name === selectedCategory);
    const targetName = targetCatDef?.name || activeCategoryObj?.name || selectedCategory;

    return (inventory || []).filter(item => {
      const itemCat = (item.category || '').trim();
      return (
        itemCat === selectedCategory ||
        itemCat === targetName ||
        (targetCatDef && (itemCat === targetCatDef.id || itemCat === targetCatDef.name))
      );
    });
  }, [inventory, selectedCategory, settings?.categories, activeCategoryObj]);

  const displayedItems = useMemo(() => {
    return categoryItems.filter(item => {
      if (!item) return false;

      // فلترة المفضلة فقط إذا لم نكن في تبويب كافة المفضلة
      if (selectedCategory !== 'all_favorites' && showOnlyFavorites && !item.isFavorite) {
        return false;
      }

      // البحث السريع
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const match =
          item.name.toLowerCase().includes(q) ||
          item.code.toLowerCase().includes(q) ||
          (item.barcode && item.barcode.includes(q));
        if (!match) return false;
      }

      return true;
    });
  }, [categoryItems, selectedCategory, showOnlyFavorites, searchQuery]);

  // إضافة الصنف لجدول الفاتورة فور النقر عليه
  const handlePickItem = (item: InventoryItem) => {
    posSound.playCashBeep();
    onSelectItem(item);
  };

  // تبديل حالة المفضلة للصنف بنقرة واحدة
  const handleToggleFavorite = (e: React.MouseEvent, item: InventoryItem) => {
    e.stopPropagation();
    const nextState = !item.isFavorite;
    updateInventoryItem(item.id, { isFavorite: nextState });
    posSound.beep();
  };

  // إذا تم تصغير الشريط
  if (isCollapsed) {
    return (
      <div className="bg-[#1f4a7c] text-white border border-[#173a62] rounded-xl p-2 flex flex-row lg:flex-col items-center justify-between shadow-md shrink-0 w-full lg:w-11 py-2 lg:py-3 transition-all order-first">
        <button
          type="button"
          onClick={() => handleSetCollapsed(false)}
          className="p-1.5 bg-amber-400 text-amber-950 rounded-lg hover:bg-amber-300 transition-colors shadow-xs cursor-pointer flex items-center gap-1"
          title="فتح شريط المفضلة السريعة"
        >
          <ChevronLeft className="w-4 h-4 hidden lg:block" />
          <Star className="w-4 h-4 lg:hidden fill-amber-950" />
          <span className="text-[11px] font-bold lg:hidden">فتح المفضلة والتصنيفات</span>
        </button>
        <div className="lg:my-auto lg:py-6 font-bold text-xs tracking-wider text-blue-200 flex items-center gap-1.5 lg:[writing-mode:vertical-rl]">
          <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 hidden lg:inline" />
          <span className="hidden lg:inline">مفضلة الكاشير</span>
        </div>
        <span className="text-[10px] font-mono bg-blue-900/90 px-1.5 py-0.5 rounded text-amber-300 font-bold">
          ⭐ {(inventory || []).filter(i => i.isFavorite).length}
        </span>
      </div>
    );
  }

  return (
    <div
      id="pos-favorites-sidebar"
      className={`bg-white rounded-xl border border-slate-300 shadow-sm flex flex-col overflow-hidden shrink-0 select-none ${className}`}
    >
      {/* 2. أزرار التصنيفات المأخوذة من الأصناف وإعدادات النظام */}
      <div className="bg-[#f0f4f9] p-1.5 border-b border-slate-200">
        <div className="flex items-center justify-between mb-1 px-1">
          <div className="flex items-center gap-1.5 text-blue-900 font-bold text-xs">
            <Layers className="w-3.5 h-3.5 text-blue-600" />
            <span>تصنيفات الأصناف ({categories.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleToggleDensity}
              className={`p-1 rounded text-[10px] font-bold border transition-colors cursor-pointer flex items-center gap-0.5 ${
                densityMode === 'ultra'
                  ? 'bg-blue-100 text-blue-900 border-blue-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
              title={densityMode === 'ultra' ? 'التبديل إلى الحجم القياسي' : 'التبديل إلى الحجم المصغر (ظهور عدد أكبر)'}
            >
              <Sparkles className="w-2.5 h-2.5 text-amber-600" />
              <span>{densityMode === 'ultra' ? 'مصغر ⚡' : 'عادي'}</span>
            </button>
            <button
              type="button"
              onClick={() => handleSetCollapsed(true)}
              className="text-slate-400 hover:text-slate-700 p-0.5 rounded hover:bg-slate-200 transition-colors cursor-pointer"
              title="تصغير شريط المفضلة والتصنيفات"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* شبكة أزرار التصنيفات المنبثقة من الأصناف المخزنة */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 max-h-24 overflow-y-auto pr-0.5 custom-scrollbar">
          {categories.map(cat => {
            const isActive = selectedCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(cat.id);
                  posSound.click();
                }}
                className={`px-1.5 py-0.5 rounded-md text-[9.5px] sm:text-[10px] font-bold text-right transition-all flex items-center justify-between cursor-pointer border ${
                  isActive
                    ? 'bg-[#1f4a7c] text-white border-[#173a62] shadow-2xs scale-[1.01] ring-1 ring-blue-400/40'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
                title={`تصنيف: ${cat.name} (${cat.favCount} مفضل / ${cat.totalCount} إجمالي)`}
              >
                <span className="truncate ml-1">{cat.name}</span>
                <span
                  className={`text-[8.5px] font-mono px-1 py-0 rounded shrink-0 font-bold ${
                    isActive
                      ? 'bg-amber-400 text-amber-950'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {cat.id === 'all_favorites' ? cat.favCount : (showOnlyFavorites ? cat.favCount : cat.totalCount)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. شريط البحث السريع والتبديل بين المفضلة وكل أصناف التصنيف */}
      <div className="p-1 bg-slate-50 border-b border-slate-200 flex items-center gap-1">
        <div className="relative flex-1">
          <Search className="w-3 h-3 text-slate-400 absolute right-2 top-1.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder={`بحث في "${activeCategoryObj?.name || 'الأصناف'}"...`}
            className="w-full bg-white border border-slate-300 rounded-md pr-6 pl-5 py-0.5 text-[11px] focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-1.5 top-0.5 text-slate-400 hover:text-slate-600 text-xs font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* زر التبديل بين المفضلة فقط أو جميع أصناف التصنيف */}
        {selectedCategory !== 'all_favorites' && (
          <button
            type="button"
            onClick={handleToggleShowOnlyFavorites}
            className={`px-1.5 py-0.5 rounded-md text-[9.5px] font-bold shrink-0 flex items-center gap-1 border cursor-pointer transition-colors ${
              showOnlyFavorites
                ? 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100'
                : 'bg-blue-50 text-blue-900 border-blue-300 hover:bg-blue-100'
            }`}
            title={
              showOnlyFavorites
                ? 'عرض الأصناف المفضلة فقط (انقر لعرض كل أصناف التصنيف)'
                : 'عرض كل أصناف التصنيف لتحديد المفضلة بالنجمة ⭐'
            }
          >
            <Star
              className={`w-2.5 h-2.5 ${
                showOnlyFavorites ? 'fill-amber-500 text-amber-500' : 'text-slate-400'
              }`}
            />
            <span>{showOnlyFavorites ? 'المفضلة ⭐' : 'الكل'}</span>
          </button>
        )}
      </div>

      {/* 4. شبكة الأصناف المصغرة عالية الكثافة - لتسمح بظهور عدد أكبر بكثير في الشاشة */}
      <div className="flex-1 overflow-y-auto p-1 bg-slate-100/70 custom-scrollbar">
        {displayedItems.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-3 text-slate-400 space-y-1.5">
            <div className="w-9 h-9 rounded-full bg-slate-200 flex items-center justify-center text-slate-400 shadow-inner">
              <Star className="w-4 h-4 text-amber-400 fill-amber-300/40" />
            </div>
            <div>
              <p className="text-[11px] font-bold text-slate-700">
                {selectedCategory === 'all_favorites'
                  ? 'لا توجد أصناف مميزة بنجمة المفضلة ⭐ حتى الآن'
                  : showOnlyFavorites
                  ? `لا توجد أصناف مفضلة في تصنيف "${activeCategoryObj?.name || ''}"`
                  : 'لا توجد أصناف تطابق البحث'}
              </p>
              <p className="text-[9px] text-slate-400 font-light mt-0.5 max-w-[200px]">
                انقر على رمز النجمة ⭐ بجانب أي صنف ليظهر في المفضلة فوراً.
              </p>
            </div>

            {selectedCategory !== 'all_favorites' && showOnlyFavorites && categoryItems.length > 0 && (
              <button
                type="button"
                onClick={() => setShowOnlyFavorites(false)}
                className="mt-1 px-2.5 py-1 bg-[#1f4a7c] hover:bg-[#183a62] text-white rounded-lg text-[10.5px] font-bold shadow-xs cursor-pointer flex items-center gap-1"
              >
                <Plus className="w-3 h-3 text-amber-300" />
                <span>عرض كل أصناف التصنيف ({categoryItems.length})</span>
              </button>
            )}
          </div>
        ) : (
          <div className={densityMode === 'ultra' ? "grid grid-cols-3 sm:grid-cols-4 gap-1" : "grid grid-cols-3 gap-1.5"}>
            {displayedItems.map((item, idx) => {
              const isFav = item.isFavorite === true;
              return (
                <div
                  key={`pos-fav-${item.id || idx}-${idx}`}
                  onClick={() => handlePickItem(item)}
                  className={`bg-white border border-slate-200 hover:border-blue-500 hover:shadow-xs rounded-lg flex flex-col justify-between cursor-pointer transition-all group relative overflow-hidden active:scale-96 ${
                    densityMode === 'ultra' ? 'p-1' : 'p-1.5'
                  }`}
                  title={`${item.name}\nالسعر: ${item.sellingPrice.toFixed(2)} ${settings.currency || '₪'}\nالمتوفر: ${item.stockQuantity} ${item.unit || 'حبة'}\n(انقر للإدراج في الفاتورة)`}
                >
                  {/* حاوية صورة الصنف المصغرة بحجم مدمج */}
                  <div className={`relative w-full bg-slate-50 rounded overflow-hidden border border-slate-200 mb-0.5 flex items-center justify-center ${
                    densityMode === 'ultra' ? 'h-10' : 'h-13'
                  }`}>
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-300 p-0.5">
                        <Package className={densityMode === 'ultra' ? "w-3.5 h-3.5 text-slate-400" : "w-4 h-4 text-slate-400"} />
                        <span className="text-[7px] font-mono text-slate-400 font-bold truncate max-w-full">
                          {item.code}
                        </span>
                      </div>
                    )}

                    {/* زر النجمة لتحديد / إلغاء المفضلة */}
                    <button
                      type="button"
                      onClick={e => handleToggleFavorite(e, item)}
                      title={isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                      className={`absolute top-0.5 right-0.5 p-0.5 rounded-full shadow-2xs transition-all cursor-pointer ${
                        isFav
                          ? 'bg-amber-400 text-amber-950 hover:bg-amber-300 ring-1 ring-amber-500/50'
                          : 'bg-black/40 text-white hover:bg-amber-400 hover:text-amber-950'
                      }`}
                    >
                      <Star className={`w-2 h-2 ${isFav ? 'fill-amber-950' : ''}`} />
                    </button>

                    {/* رصيد المخزون المصغر */}
                    <span
                      className={`absolute bottom-0.5 left-0.5 text-[7px] font-mono px-0.5 py-0 rounded font-bold leading-tight ${
                        item.stockQuantity <= item.minAlertQuantity
                          ? 'bg-rose-600 text-white'
                          : 'bg-slate-900/85 text-white'
                      }`}
                    >
                      {item.stockQuantity}
                    </span>
                  </div>

                  {/* تفاصيل الصنف: الاسم بحجم مضغوط والسعر وزر الإضافة */}
                  <div className="flex-1 flex flex-col justify-between">
                    <h4 className={`font-bold text-slate-800 line-clamp-2 leading-tight group-hover:text-blue-700 transition-colors mb-0.5 ${
                      densityMode === 'ultra' ? 'text-[8.5px] h-5' : 'text-[9.5px] h-6'
                    }`}>
                      {item.name}
                    </h4>

                    <div className="pt-0.5 border-t border-slate-100 flex items-center justify-between">
                      <span className={`font-mono font-black text-blue-700 ${
                        densityMode === 'ultra' ? 'text-[9px]' : 'text-[10px]'
                      }`}>
                        {item.sellingPrice.toFixed(2)}
                        <span className="text-[7.5px] font-normal text-slate-500 mr-0.5">{settings.currency || '₪'}</span>
                      </span>
                      <span className="p-0.5 bg-blue-50 text-blue-700 rounded group-hover:bg-blue-600 group-hover:text-white transition-colors">
                        <Plus className="w-2 h-2" />
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 5. Footer: معلومات سريعة ومختصرة */}
      <div className="p-1 bg-slate-100 border-t border-slate-200 text-[9px] text-slate-600 flex items-center justify-between">
        <span className="flex items-center gap-1 font-semibold truncate">
          <Star className="w-2.5 h-2.5 text-amber-500 fill-amber-500 shrink-0" />
          <span className="truncate">
            {activeCategoryObj?.name}: {displayedItems.length} صنف
          </span>
        </span>
        <span className="text-slate-400 text-[8.5px] shrink-0">نقر = إدراج</span>
      </div>
    </div>
  );
};
