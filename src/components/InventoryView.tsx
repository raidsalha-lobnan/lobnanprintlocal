import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { InventoryItem, ItemCategory, AdditionalBarcode, BarcodeFormat, CustomerSpecialPrice } from '../types';
import { BarcodeScannerModal } from './BarcodeScannerModal';
import ManageCategoriesModal from "./ManageCategoriesModal";
import { BarcodeBankModal } from './BarcodeBankModal';
import { StockMovementModal } from './StockMovementModal';
import { ItemUnitSelector } from './ItemUnitSelector';
import { posSound } from '../utils/audio';
import { useHardwareBarcodeScanner } from '../utils/useBarcodeScanner';
import { isCashCustomerParty } from '../utils/partyUtils';
import { sortInventoryForDisplay, inventoryCategoryOptions } from '../utils/inventoryDisplayOrder';
import {
  CATEGORY_DEFINITIONS,
  generateSequentialSku,
  validateSkuUniqueness,
  generateValidEan13,
  matchItemByBarcode,
  getAllItemBarcodes
} from '../utils/barcodeGenerator';
import {
  Boxes,
  Plus,
  Search,
  Filter,
  AlertTriangle,
  Edit2,
  Sliders,
  DollarSign,
  Package,
  Layers,
  BookOpen,
  Camera,
  Barcode as BarcodeIcon,
  CheckCircle2,
  Coins,
  QrCode,
  ClipboardList,
  Sparkles,
  Printer,
  History,
  Zap,
  Trash2,
  Star,
  Tag,
  ArrowUpDown,
  Image as ImageIcon,
  Upload,
  PackageCheck,
  Store,
  LayoutGrid,
  List,
  X
} from 'lucide-react';

export const InventoryView: React.FC = () => {
  const {
    inventory,
    addInventoryItem,
    deleteInventoryItem,
    updateInventoryItem,
    adjustStock,
    settings,
    currencies,
    warehouses,
    activeWarehouseId,
    setActiveWarehouseId,
    getWarehouseStock,
    branches,
    setActiveTab,
    parties
  } = useAccounting();

  // Active Registered Customers for Customer Special Pricing (strictly excludes cash customer)
  const customers = useMemo(() => {
    return (parties || []).filter(p => (p.type === 'customer' || p.type === 'both') && !p.isSubCustomer && !isCashCustomerParty(p));
  }, [parties]);

  // Multi-Currency Display & Valuation (Base: ILS ₪)
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState<string>(settings.baseCurrencyCode || 'ILS');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('all');
  const activeCurrency = useMemo(() => {
    return currencies.find(c => c.code === selectedCurrencyCode) || currencies.find(c => c.isBase) || {
      code: 'ILS',
      name: 'شيكل',
      symbol: '₪',
      rateAgainstBase: 1.0,
      isBase: true,
      isActive: true
    };
  }, [currencies, selectedCurrencyCode]);

  const [dailyExchangeRate, setDailyExchangeRate] = useState<number>(activeCurrency.rateAgainstBase || 1.0);

  useEffect(() => {
    setDailyExchangeRate(activeCurrency.rateAgainstBase || 1.0);
  }, [activeCurrency.rateAgainstBase, selectedCurrencyCode]);

  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);

  // Barcode Bank Modal State
  const [showBarcodeBankModal, setShowBarcodeBankModal] = useState(false);
  const [selectedItemForBarcode, setSelectedItemForBarcode] = useState<InventoryItem | null>(null);

  // Stock Movement Ledger Modal State
  const [showStockMovementModal, setShowStockMovementModal] = useState(false);
  const [selectedItemForMovement, setSelectedItemForMovement] = useState<string | null>(null);
  const [stockMovementInitialTab, setStockMovementInitialTab] = useState<'card' | 'adjust' | 'alerts'>('card');

  // Barcode Scanner Modal states (Camera)
  const [showBarcodeScanner, setShowBarcodeScanner] = useState<boolean>(false);
  const [scannerForSearch, setScannerForSearch] = useState<boolean>(false);
  const [barcodeNotification, setBarcodeNotification] = useState<string | null>(null);
  const [focusTargetStock, setFocusTargetStock] = useState<boolean>(false);

  const barcodeInputRef = useRef<HTMLInputElement | null>(null);
  const stockInputRef = useRef<HTMLInputElement | null>(null);

  // Form state for add/edit
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formCategory, setFormCategory] = useState<ItemCategory>('stationery');
  const [formUnit, setFormUnit] = useState('حبة');
  const [formPurchasePrice, setFormPurchasePrice] = useState<number | string>('');
  const [formSellingPrice, setFormSellingPrice] = useState<number | string>('');
  const [formSellingPrice2, setFormSellingPrice2] = useState<number | string>('');
  const [formSellingPrice3, setFormSellingPrice3] = useState<number | string>('');
  const [formCustomerSpecialPrices, setFormCustomerSpecialPrices] = useState<CustomerSpecialPrice[]>([]);

  // Sub-form for adding a customer special price inside the modal
  const [newSpecialCustomerId, setNewSpecialCustomerId] = useState<string>('');
  const [newSpecialPrice, setNewSpecialPrice] = useState<string | number>('');
  const [newSpecialNotes, setNewSpecialNotes] = useState<string>('');

  // Quick viewer modal for item customer special prices from table/cards
  const [viewingSpecialPricesItem, setViewingSpecialPricesItem] = useState<InventoryItem | null>(null);
  const [formStock, setFormStock] = useState<number | string>('');
  const [formMinAlert, setFormMinAlert] = useState<number | string>('');
  const [formDesc, setFormDesc] = useState('');

  // Multi-barcode management state for Add/Edit modal
  const [formBarcodeEntries, setFormBarcodeEntries] = useState<AdditionalBarcode[]>([]);
  const [newEntryBarcode, setNewEntryBarcode] = useState('');
  const [newEntryLabel, setNewEntryLabel] = useState('باركود كرتونة / عبوة');
  const [newEntryType, setNewEntryType] = useState<BarcodeFormat>('EAN13');
  const [targetBarcodeScanField, setTargetBarcodeScanField] = useState<'primary' | 'additional'>('primary');

  // Low-Stock Quick Filter
  const [filterOnlyLowStock, setFilterOnlyLowStock] = useState<boolean>(false);
  const [filterOnlyFavorites, setFilterOnlyFavorites] = useState<boolean>(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Image & Favorite state for Add/Edit modal
  const [formImageUrl, setFormImageUrl] = useState<string>('');
  const [formIsFavorite, setFormIsFavorite] = useState<boolean>(false);

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('يرجى اختيار ملف صورة صالح (PNG, JPG, WebP...)');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 400;
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          }
        } else {
          if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setFormImageUrl(dataUrl);
        } else {
          setFormImageUrl(event.target?.result as string);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  // Auto focus into quantity after barcode scan
  useEffect(() => {
    if (focusTargetStock) {
      const timer = setTimeout(() => {
        if (stockInputRef.current) {
          stockInputRef.current.focus();
          stockInputRef.current.select();
        }
        setFocusTargetStock(false);
      }, 70);
      return () => clearTimeout(timer);
    }
  }, [focusTargetStock]);

  // Hardware Scanner Integration (Physical Barcode Reader / USB / Bluetooth)
  useHardwareBarcodeScanner({
    enabled: true,
    minChars: 3,
    playSound: true,
    onScan: (scannedCode) => {
      const existing = inventory.find(i => matchItemByBarcode(i, scannedCode));

      if (showAddModal) {
        if (targetBarcodeScanField === 'additional') {
          setNewEntryBarcode(scannedCode);
          setBarcodeNotification(`تم مسح الباركود الإضافي عبر الماسح الضوئي: ${scannedCode}`);
        } else if (!formBarcode) {
          setFormBarcode(scannedCode);
          setBarcodeNotification(`تم مسح الباركود الرئيسي عبر الماسح الضوئي: ${scannedCode}`);
          setFocusTargetStock(true);
        } else {
          // If primary barcode is already set, suggest adding as additional barcode
          setNewEntryBarcode(scannedCode);
          setBarcodeNotification(`تم مسح الباركود: ${scannedCode} (جاهز للإضافة كباركود بديل)`);
        }
      } else {
        setSearchQuery(scannedCode);
        if (existing) {
          setBarcodeNotification(`تم العثور على الصنف عبر الماسح الضوئي: [${existing.code}] ${existing.name}`);
        } else {
          posSound.error();
          setBarcodeNotification(`الصنف غير موجود (الباركود: ${scannedCode})`);
        }
      }

      // Auto dismiss banner after 3.5s
      setTimeout(() => {
        setBarcodeNotification(null);
      }, 3500);
    }
  });

  // Multi-barcode operations in form
  const handleAddBarcodeEntry = () => {
    const code = newEntryBarcode.trim();
    if (!code) return;

    if (formBarcode && formBarcode.trim().toLowerCase() === code.toLowerCase()) {
      alert(`الرمز "${code}" مسجل بالفعل كالباركود الرئيسي لهذا الصنف!`);
      return;
    }

    if (formBarcodeEntries.some(e => e.barcode.toLowerCase() === code.toLowerCase())) {
      alert(`الرمز "${code}" مضاف مسبقاً في قائمة الباركودات البديلة لهذا الصنف!`);
      return;
    }

    const existing = inventory.find(it => it.id !== editingItem?.id && matchItemByBarcode(it, code));
    if (existing) {
      if (!confirm(`تنبيه: هذا الباركود (${code}) مسجل بالفعل للصنف [${existing.code}] ${existing.name}.\nهل ترغب بربطه بهذا الصنف أيضاً كباركود بديل؟`)) {
        return;
      }
    }

    setFormBarcodeEntries(prev => [
      ...prev,
      {
        barcode: code,
        label: newEntryLabel.trim() || 'باركود بديل',
        type: newEntryType,
        createdAt: new Date().toISOString()
      }
    ]);
    setNewEntryBarcode('');
    posSound.playSuccessBeep();
  };

  const handleRemoveBarcodeEntry = (index: number) => {
    posSound.playErrorBeep();
    setFormBarcodeEntries(prev => prev.filter((_, i) => i !== index));
  };

  const handleSetAsPrimaryBarcode = (index: number) => {
    const target = formBarcodeEntries[index];
    if (!target) return;

    const oldPrimary = formBarcode;
    setFormBarcode(target.barcode);
    if (oldPrimary && oldPrimary.trim()) {
      setFormBarcodeEntries(prev => prev.map((entry, i) => {
        if (i === index) {
          return {
            ...entry,
            barcode: oldPrimary,
            label: 'باركود رئيسي سابق'
          };
        }
        return entry;
      }));
    } else {
      setFormBarcodeEntries(prev => prev.filter((_, i) => i !== index));
    }
    posSound.playSuccessBeep();
  };

  const handleGenerateNewEntryBarcode = (fmt: BarcodeFormat) => {
    setNewEntryType(fmt);
    if (fmt === 'EAN13') {
      setNewEntryBarcode(generateValidEan13('628'));
    } else if (fmt === 'QR') {
      setNewEntryBarcode(formCode ? `QR-${formCode}-${Date.now().toString().slice(-4)}` : `QR-${Date.now().toString().slice(-6)}`);
    } else {
      setNewEntryBarcode(formCode ? `${formCode}-BOX` : `ITEM-${Date.now().toString().slice(-6)}`);
    }
    posSound.playSuccessBeep();
  };

  const filteredItems = useMemo(() => {
    return sortInventoryForDisplay(inventory.filter(it => {
      const matchCat = categoryFilter === 'all' || it.category === categoryFilter;
      const isService = it.category === 'copy_scan' || it.category === 'services' || it.id === 'srv-delivery' || it.id === 'srv-delivery-mobile' || it.barcode === 'DELIVERY' || it.name === 'خدمة توصيل' || it.name?.trim().startsWith('توصيل');
      const isLowStock = !isService && it.stockQuantity <= it.minAlertQuantity;
      if (filterOnlyLowStock && !isLowStock) return false;
      if (filterOnlyFavorites && !it.isFavorite) return false;
      if (selectedWarehouseFilter !== 'all') {
        const whStock = getWarehouseStock(selectedWarehouseFilter, it.id);
        if (whStock <= 0 && it.stockQuantity <= 0) return false;
      }

      const q = searchQuery.trim().toLowerCase();
      if (!q) return matchCat;

      const matchBarcode =
        (it.barcode && typeof it.barcode === 'string' && it.barcode.toLowerCase().includes(q)) ||
        (it.additionalBarcodes && Array.isArray(it.additionalBarcodes) && it.additionalBarcodes.some(b => typeof b === 'string' && b.toLowerCase().includes(q))) ||
        (it.barcodeEntries && Array.isArray(it.barcodeEntries) && it.barcodeEntries.some(b => b && ((b.barcode && typeof b.barcode === 'string' && b.barcode.toLowerCase().includes(q)) || (b.label && typeof b.label === 'string' && b.label.toLowerCase().includes(q)))));

      const matchSearch =
        (it.name && typeof it.name === 'string' ? it.name.toLowerCase().includes(q) : false) ||
        (it.code && typeof it.code === 'string' ? it.code.toLowerCase().includes(q) : false) ||
        Boolean(matchBarcode);

      return matchCat && matchSearch;
    }), settings.categories || []);
  }, [inventory, settings.categories, categoryFilter, searchQuery, filterOnlyLowStock, filterOnlyFavorites, selectedWarehouseFilter]);

  // Inventory financial totals
  const totalCostValue = inventory.reduce((acc, it) => acc + (it.stockQuantity * it.purchasePrice), 0);
  const totalSaleValue = inventory.reduce((acc, it) => acc + (it.stockQuantity * it.sellingPrice), 0);
  const rawMaterialsValue = inventory
    .filter(it => it.category === 'print_raw')
    .reduce((acc, it) => acc + (it.stockQuantity * it.purchasePrice), 0);
  const lowStockCount = inventory.filter(it => it.category !== 'copy_scan' && it.category !== 'services' && it.id !== 'srv-delivery' && it.id !== 'srv-delivery-mobile' && it.barcode !== 'DELIVERY' && it.name !== 'خدمة توصيل' && !it.name?.trim().startsWith('توصيل') && it.stockQuantity <= it.minAlertQuantity).length;

  const allCategories = useMemo(() => {
    return settings.categories || [];
  }, [settings.categories]);

  const categoryFilterOptions = useMemo(() =>
    inventoryCategoryOptions(inventory, allCategories, CATEGORY_DEFINITIONS),
    [inventory, allCategories]
  );

  const getCategoryDetails = (catId: string) => {
    return allCategories.find(c => c.id === catId) || (CATEGORY_DEFINITIONS as any)[catId] || CATEGORY_DEFINITIONS['stationery'];
  };

  // Real-time SKU uniqueness check to guarantee no duplicate SKU exists in the system
  const skuValidation = useMemo(() => {
    if (!showAddModal || !formCode.trim()) {
      return { isUnique: true };
    }
    return validateSkuUniqueness(formCode, inventory, editingItem?.id, allCategories);
  }, [showAddModal, formCode, inventory, editingItem, allCategories]);

  const handleOpenAdd = (defaultCat?: ItemCategory) => {
    const cat = defaultCat || (allCategories[0]?.id as ItemCategory) || 'stationery';
    setEditingItem(null);
    setFormName('');
    setFormCode(''); // Leave empty to generate sequential SKU safely after save
    setFormBarcode(''); // Clear primary barcode completely
    setFormBarcodeEntries([]);
    setNewEntryBarcode('');
    setNewEntryLabel('باركود كرتونة / عبوة');
    setTargetBarcodeScanField('primary');
    setFormCategory(cat);
    setFormUnit('حبة');
    setFormPurchasePrice('');
    setFormSellingPrice('');
    setFormSellingPrice2('');
    setFormSellingPrice3('');
    setFormCustomerSpecialPrices([]);
    setNewSpecialCustomerId('');
    setNewSpecialPrice('');
    setNewSpecialNotes('');
    setFormStock('');
    setFormMinAlert('');
    setFormDesc('');
    setFormImageUrl('');
    setFormIsFavorite(false);
    setShowAddModal(true);
  };

  const handleCategoryChange = (newCat: ItemCategory) => {
    if (editingItem) return; // Existing category IDs are immutable outside audited migration.
    setFormCategory(newCat);
    if (!editingItem && formCode.trim()) {
      const nextCode = generateSequentialSku(newCat, inventory.map(i => i.code), allCategories);
      setFormCode(nextCode);
    }
  };

  const handleRegenerateCode = () => {
    const nextCode = generateSequentialSku(formCategory, inventory.map(i => i.code), allCategories);
    setFormCode(nextCode);
    posSound.playSuccessBeep();
  };

  const handleGenerateBarcodeByType = (fmt: 'EAN13' | 'CODE128' | 'QR') => {
    if (fmt === 'EAN13') {
      setFormBarcode(generateValidEan13('628'));
    } else if (fmt === 'QR') {
      setFormBarcode(formCode ? `QR-${formCode}` : `QR-${Date.now().toString().slice(-6)}`);
    } else {
      setFormBarcode(formCode || `ITEM-${Date.now().toString().slice(-6)}`);
    }
    posSound.playSuccessBeep();
  };


  const handleDeleteItem = (it: InventoryItem) => {
    if (window.confirm('هل أنت متأكد من رغبتك في حذف الصنف: ' + it.name + '؟')) {
      const res = deleteInventoryItem(it.id);
      if (res.success) {
         alert(res.message);
      } else {
         alert(res.message);
      }
    }
  };

  const handleOpenEdit = (it: InventoryItem) => {
    setEditingItem(it);
    setFormName(it.name);
    setFormCode(it.code);
    setFormBarcode(it.barcode || '');
    const entries: AdditionalBarcode[] = it.barcodeEntries && it.barcodeEntries.length > 0
      ? [...it.barcodeEntries]
      : (it.additionalBarcodes || []).map(b => ({ barcode: b, label: 'باركود بديل' }));
    setFormBarcodeEntries(entries);
    setNewEntryBarcode('');
    setNewEntryLabel('باركود كرتونة / عبوة');
    setTargetBarcodeScanField('primary');
    setFormCategory(it.category);
    setFormUnit(it.unit);
    setFormPurchasePrice(it.purchasePrice);
    setFormSellingPrice(it.sellingPrice);
    setFormSellingPrice2(it.sellingPrice2 !== undefined && it.sellingPrice2 > 0 ? it.sellingPrice2 : '');
    const initialItemSpecials: CustomerSpecialPrice[] = it.customerSpecialPrices
      ? it.customerSpecialPrices.filter(sp => !isCashCustomerParty(sp.customerId, sp.customerCode, sp.customerName))
      : [];
    customers.forEach(cust => {
      if (isCashCustomerParty(cust)) return;
      if (cust.specialPrices) {
        const pPrice = cust.specialPrices[it.id] !== undefined
          ? cust.specialPrices[it.id]
          : (it.code && cust.specialPrices[it.code] !== undefined ? cust.specialPrices[it.code] : undefined);
        if (pPrice !== undefined && pPrice >= 0 && !initialItemSpecials.some(sp => sp.customerId === cust.id)) {
          initialItemSpecials.push({
            customerId: cust.id,
            customerName: cust.name,
            customerCode: cust.code,
            price: pPrice,
            notes: 'مسجل بملف العميل',
            updatedAt: new Date().toISOString()
          });
        }
      }
    });
    setFormCustomerSpecialPrices(initialItemSpecials);
    setNewSpecialCustomerId('');
    setNewSpecialPrice('');
    setNewSpecialNotes('');
    setFormStock(it.stockQuantity);
    setFormMinAlert(it.minAlertQuantity);
    setFormDesc(it.description || '');
    setFormImageUrl(it.imageUrl || '');
    setFormIsFavorite(it.isFavorite || false);
    setShowAddModal(true);
  };

  // Add a customer special price to the item
  const handleAddCustomerSpecialPrice = () => {
    if (!newSpecialCustomerId) {
      alert('يرجى اختيار العميل أولاً من القائمة');
      return;
    }
    if (isCashCustomerParty(newSpecialCustomerId)) {
      alert('الزبون النقدي لا يمكن تحديد سعر خاص له لأنه يندرج تحته العديد من الزبائن.');
      return;
    }
    const priceNum = Number(newSpecialPrice);
    if (isNaN(priceNum) || priceNum < 0) {
      alert('يرجى إدخال سعر بيع خاص صحيح أكبر من أو يساوي الصفر');
      return;
    }

    const selectedCust = customers.find(c => c.id === newSpecialCustomerId);
    const newEntry: CustomerSpecialPrice = {
      customerId: newSpecialCustomerId,
      customerName: selectedCust?.name || 'عميل محدد',
      customerCode: selectedCust?.code,
      price: priceNum,
      notes: newSpecialNotes.trim() || undefined,
      updatedAt: new Date().toISOString()
    };

    setFormCustomerSpecialPrices(prev => {
      const filtered = prev.filter(p => p.customerId !== newSpecialCustomerId);
      return [...filtered, newEntry];
    });

    setNewSpecialCustomerId('');
    setNewSpecialPrice('');
    setNewSpecialNotes('');
    posSound.playSuccessBeep();
  };

  // Remove a customer special price
  const handleRemoveCustomerSpecialPrice = (custId: string) => {
    setFormCustomerSpecialPrices(prev => prev.filter(p => p.customerId !== custId));
  };

  const handleOpenBarcodeBank = (item?: InventoryItem) => {
    setSelectedItemForBarcode(item || inventory[0] || null);
    setShowBarcodeBankModal(true);
  };

  const handleOpenStockCard = (item?: InventoryItem, tab: 'card' | 'adjust' | 'alerts' = 'card') => {
    setSelectedItemForMovement(item?.id || inventory[0]?.id || null);
    setStockMovementInitialTab(tab);
    setShowStockMovementModal(true);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) return;

    let trimmedCode = formCode.trim();

    // إذا كان الكود فارغاً، يتم توليد الكود التسلسلي غير المكرر فورياً عند الحفظ
    if (!trimmedCode || trimmedCode === 'تلقائي بعد الحفظ') {
      trimmedCode = generateSequentialSku(formCategory, inventory.map(i => i.code || ''), allCategories);
    } else {
      // التحقق الصارم في حال أدخل المستخدم كوداً يدوياً مخصصاً
      const duplicateConflict = inventory.find(
        it => it && it.id !== editingItem?.id && (it.code || '').trim().toLowerCase() === trimmedCode.toLowerCase()
      );

      if (duplicateConflict) {
        posSound.playErrorBeep();
        alert(`⚠️ لا يمكن حفظ الصنف!\n\nكود الصنف (${trimmedCode}) مكرر ومستخدم بالفعل لصنف آخر:\n"${duplicateConflict.name}"\n\nقاعدة النظام: يجب ألا يتكرر كود الصنف نهائياً. يمكنك ترك خانة الكود فارغة ليتم إصدار كود تسلسلي غير مكرر تلقائياً بعد الحفظ.`);
        return;
      }
    }

    const cleanedEntries = formBarcodeEntries.filter(e => e.barcode && e.barcode.trim());
    const additionalCodes = cleanedEntries.map(e => e.barcode.trim());

    const p2 = formSellingPrice2 !== '' && Number(formSellingPrice2) > 0 ? Number(formSellingPrice2) : undefined;
    const p3 = formSellingPrice3 !== '' && Number(formSellingPrice3) > 0 ? Number(formSellingPrice3) : undefined;

    if (editingItem) {
      updateInventoryItem(editingItem.id, {
        name: formName,
        code: trimmedCode,
        barcode: formBarcode.trim(),
        additionalBarcodes: additionalCodes,
        barcodeEntries: cleanedEntries,
        category: formCategory,
        unit: formUnit,
        purchasePrice: Number(formPurchasePrice),
        sellingPrice: Number(formSellingPrice),
        sellingPrice2: p2,
        sellingPrice3: p3,
        customerSpecialPrices: formCustomerSpecialPrices.length > 0 ? formCustomerSpecialPrices : undefined,
        stockQuantity: Number(formStock),
        minAlertQuantity: Number(formMinAlert),
        description: formDesc,
        imageUrl: formImageUrl.trim() || undefined,
        isFavorite: formIsFavorite
      });
    } else {
      addInventoryItem({
        code: trimmedCode,
        barcode: formBarcode.trim(),
        additionalBarcodes: additionalCodes,
        barcodeEntries: cleanedEntries,
        name: formName,
        category: formCategory,
        unit: formUnit,
        purchasePrice: Number(formPurchasePrice),
        sellingPrice: Number(formSellingPrice),
        sellingPrice2: p2,
        sellingPrice3: p3,
        customerSpecialPrices: formCustomerSpecialPrices.length > 0 ? formCustomerSpecialPrices : undefined,
        stockQuantity: Number(formStock),
        minAlertQuantity: Number(formMinAlert),
        description: formDesc,
        imageUrl: formImageUrl.trim() || undefined,
        isFavorite: formIsFavorite,
        isRawMaterial: formCategory === 'print_raw'
      });
    }
    setShowAddModal(false);
  };

  
  


  const getCategoryBadge = (cat: ItemCategory) => {
    const details = getCategoryDetails(cat);
    if (details && details.color) {
      return { label: details.name, class: details.color };
    }
    // Fallbacks
    switch (cat) {
      case 'books':
        return { label: 'كتب وروايات', class: 'bg-emerald-50 text-emerald-700' };
      case 'stationery':
        return { label: 'قرطاسية ومكتبية', class: 'bg-sky-50 text-sky-700' };
      case 'print_raw':
        return { label: 'خامات مطبعة', class: 'bg-indigo-50 text-indigo-700' };
      case 'copy_scan':
        return { label: 'خدمات تصوير', class: 'bg-purple-50 text-purple-700' };
      default:
        return { label: details?.name || 'أخرى', class: 'bg-slate-50 text-slate-700' };
    }
  };


  return (
    <div className="space-y-4">
      {/* Barcode / Scanner Alert Banner */}
      {barcodeNotification && (
        <div className="bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 p-2.5 rounded-lg flex items-center justify-between text-xs text-emerald-900 dark:text-emerald-200 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="font-bold">{barcodeNotification}</span>
          </div>
          <button
            onClick={() => setBarcodeNotification(null)}
            className="text-emerald-600 hover:text-emerald-800 text-xs px-1 font-bold"
          >
            ×
          </button>
        </div>
      )}

      {/* Inventory KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold">إجمالي قيمة المخزون (بالتكلفة)</span>
            <div className="w-6 h-6 rounded bg-blue-50 text-blue-600 flex items-center justify-center">
              <Boxes className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-lg font-bold font-mono text-slate-900">
            {totalCostValue.toLocaleString('ar-SA')} <span className="text-[10px] font-normal text-slate-500 font-sans">{settings.currency}</span>
          </div>
          {selectedCurrencyCode !== 'ILS' && (
            <div className="text-xs font-bold text-blue-600 font-mono mt-0.5">
              ≈ {(totalCostValue / dailyExchangeRate).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} {activeCurrency.symbol}
            </div>
          )}
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold">القيمة البيعية المتوقعة</span>
            <div className="w-6 h-6 rounded bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-lg font-bold font-mono text-emerald-700">
            {totalSaleValue.toLocaleString('ar-SA')} <span className="text-[10px] font-normal text-slate-500 font-sans">{settings.currency}</span>
          </div>
          {selectedCurrencyCode !== 'ILS' && (
            <div className="text-xs font-bold text-emerald-600 font-mono mt-0.5">
              ≈ {(totalSaleValue / dailyExchangeRate).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} {activeCurrency.symbol}
            </div>
          )}
        </div>

        <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold">خامات وأوراق وأحبار المطبعة</span>
            <div className="w-6 h-6 rounded bg-sky-50 text-sky-600 flex items-center justify-center">
              <Layers className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-lg font-bold font-mono text-slate-900">
            {rawMaterialsValue.toLocaleString('ar-SA')} <span className="text-[10px] font-normal text-slate-500 font-sans">{settings.currency}</span>
          </div>
        </div>

        <div
          onClick={() => handleOpenStockCard(undefined, 'alerts')}
          className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs hover:border-rose-300 transition cursor-pointer group"
          title="اضغط لعرض تقرير وتنبيهات الأصناف الحرجة"
        >
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-[11px] font-semibold group-hover:text-rose-600 transition">أصناف تحت حد الطلب (نواقص)</span>
            <div className="w-6 h-6 rounded bg-rose-50 text-rose-600 flex items-center justify-center">
              <AlertTriangle className="w-3.5 h-3.5" />
            </div>
          </div>
          <div className="text-lg font-bold font-mono text-rose-600 flex items-center justify-between">
            <span>{lowStockCount} <span className="text-[10px] font-normal text-slate-500 font-sans">صنف</span></span>
            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
              عرض النواقص ⚠️
            </span>
          </div>
        </div>
      </div>

      {/* Unified Command & Operations Console (شريط العمليات والباركود والماسح والمفضلة) */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs space-y-3">
        {/* Row 1: Primary Action Operations & Barcode/Scanner Suite */}
        {/* Row 1: Primary Action Operations & Barcode/Scanner Suite */}
        <div className="flex flex-wrap items-center justify-between gap-1.5 pb-2 border-b border-slate-100 text-xs">
          {/* Action Buttons Group */}
          <div className="flex flex-wrap items-center gap-1.5">
            {/* Manage Categories Button */}
            <button
              type="button"
              onClick={() => setShowCategoriesModal(true)}
              className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg shadow-xs transition shadow-xs cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>التصنيفات</span>
            </button>
            {/* Primary Add Button */}
            <button
              type="button"
              onClick={() => handleOpenAdd()}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg shadow-xs transition shadow-xs cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة صنف</span>
            </button>

            {/* Stock Movement Ledger Button */}
            <button
              type="button"
              onClick={() => handleOpenStockCard(undefined, 'card')}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold px-2.5 py-1.5 rounded-lg shadow-xs transition cursor-pointer shrink-0"
              title="عرض كارتة حركة المخزون"
            >
              <ClipboardList className="w-3.5 h-3.5 text-amber-400" />
              <span>كارتة الحركة</span>
            </button>

            {/* Warehouse Operations Button */}
            <button
              type="button"
              onClick={() => setActiveTab('warehouses')}
              className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 text-xs font-bold px-2.5 py-1.5 rounded-lg shadow-xs transition cursor-pointer shrink-0"
              title="العمليات المخزنية"
            >
              <PackageCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>العمليات</span>
            </button>
          </div>

          {/* Barcode & Scanner Tools Suite */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-50 p-1 rounded-lg border border-slate-200 shrink-0">
            {/* Barcode & QR Bank Button */}
            <button
              type="button"
              onClick={() => handleOpenBarcodeBank()}
              className="flex items-center gap-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 text-xs font-bold px-2.5 py-1.5 rounded-md shadow-2xs transition cursor-pointer shrink-0"
            >
              <BarcodeIcon className="w-3 h-3 text-indigo-600" />
              <span>بنك الباركود والـ QR</span>
            </button>

            {/* Camera Barcode Scanner */}
            <button
              type="button"
              onClick={() => {
                setScannerForSearch(true);
                setShowBarcodeScanner(prev => !prev);
              }}
              className={`p-1.5 rounded-md border flex items-center justify-center cursor-pointer transition shrink-0 ${
                showBarcodeScanner
                  ? 'bg-blue-600 text-white border-blue-700 shadow-inner'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
              }`}
              title="تشغيل كاميرا الباركود"
            >
              <Camera className={`w-3.5 h-3.5 ${showBarcodeScanner ? 'text-emerald-300 animate-pulse' : 'text-blue-600'}`} />
            </button>

            {/* Hardware Scanner Live Status Indicator */}
            <div className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-md text-[11px] font-bold shadow-2xs whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <Zap className="w-3 h-3 text-emerald-600" />
              <span>الماسح متصل ⚡</span>
            </div>
          </div>
        </div>

        {/* Row 2: Search Box, Category/Warehouse Filters, Quick Filters (المفضلة والنواقص) and View Switcher */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          {/* Search Box & Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-[240px]">
            {/* Search Box */}
            <div className="relative min-w-[160px] flex-1 max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="ابحث..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pr-7.5 pl-10 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:bg-white focus:ring-1 focus:ring-blue-500 font-medium transition"
              />
              <div className="absolute left-1.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition cursor-pointer font-bold text-xs"
                  >
                    ×
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setScannerForSearch(true);
                    setShowBarcodeScanner(true);
                  }}
                  className="text-slate-400 hover:text-blue-600 p-0.5 rounded cursor-pointer"
                  title="البحث بالكاميرا"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Category Filter */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs shrink-0">
              <Filter className="w-3 h-3 text-slate-500" />
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                aria-label="تصفية المجموعات"
                className="bg-transparent border-0 text-xs text-slate-800 font-semibold focus:outline-none cursor-pointer p-0.5"
              >
                <option value="all">كافة التصنيفات ({inventory.length})</option>
                {categoryFilterOptions.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name} ({cat.count})</option>
                ))}
              </select>
            </div>
            {categoryFilter !== "all" && (
              <button type="button" onClick={() => setCategoryFilter("all")}
                className="inline-flex items-center gap-1 px-2 py-1.5 text-xs rounded-lg border border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100"
                title="إلغاء تصفية المجموعة وإظهار جميع الأصناف">
                <X className="w-3.5 h-3.5" /> إظهار كل المجموعات
              </button>
            )}

            {/* Warehouse Filter */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs shrink-0">
              <Boxes className="w-3 h-3 text-indigo-600" />
              <select
                value={selectedWarehouseFilter}
                onChange={e => setSelectedWarehouseFilter(e.target.value)}
                className="bg-transparent border-0 text-xs font-semibold text-slate-800 focus:outline-none cursor-pointer p-0.5"
              >
                <option value="all">جميع المستودعات ({warehouses.length})</option>
                {warehouses.map(w => (
                  <option key={w.id} value={w.id}>
                    {w.code} - {w.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Quick Filters Group */}
          <div className="flex flex-wrap items-center gap-1.5 shrink-0">
            {/* Quick Favorite Items Filter */}
            <button
              type="button"
              onClick={() => setFilterOnlyFavorites(prev => !prev)}
              className={`px-2 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition border cursor-pointer shrink-0 ${
                filterOnlyFavorites
                  ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Star className={`w-3.5 h-3.5 ${filterOnlyFavorites || inventory.some(i => i.isFavorite) ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} />
              <span>المفضلة بالكاشير ({inventory.filter(i => i.isFavorite).length})</span>
            </button>

            {/* Quick Low-Stock Filter */}
            <button
              type="button"
              onClick={() => setFilterOnlyLowStock(prev => !prev)}
              className={`px-2 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition border cursor-pointer shrink-0 ${
                filterOnlyLowStock
                  ? 'bg-rose-600 text-white border-rose-700 shadow-xs'
                  : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>نواقص ({lowStockCount})</span>
            </button>

            {/* Multi-Currency Filter */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs shrink-0">
              <Coins className="w-3 h-3 text-emerald-600" />
              <select
                value={selectedCurrencyCode}
                onChange={e => setSelectedCurrencyCode(e.target.value)}
                className="bg-transparent border-0 text-xs font-bold text-slate-700 focus:outline-none cursor-pointer p-0.5"
              >
                {currencies.map(c => (
                  <option key={c.code} value={c.code}>
                    ({c.symbol}) {c.code}
                  </option>
                ))}
              </select>
              {selectedCurrencyCode !== 'ILS' && (
                <div className="flex items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 text-[10px]">
                  <span className="text-amber-800 font-bold">الصرف:</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={dailyExchangeRate}
                    onChange={e => setDailyExchangeRate(parseFloat(e.target.value) || 1.0)}
                    className="w-12 bg-white border border-amber-300 rounded px-1 text-center font-mono font-bold text-xs"
                  />
                  <span className="text-slate-600 font-bold">₪</span>
                </div>
              )}
            </div>

            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                  viewMode === 'table' ? 'bg-white text-indigo-700 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                <span>جدول</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-bold transition cursor-pointer ${
                  viewMode === 'cards' ? 'bg-white text-indigo-700 shadow-2xs font-extrabold' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <LayoutGrid className="w-3.5 h-3.5" />
                <span>بطاقات</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Inventory Items Display: Cards Grid or Table View */}
      {viewMode === 'cards' ? (
        filteredItems.length === 0 ? (
          <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500 shadow-xs">
            <Boxes className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <h4 className="font-bold text-sm text-slate-800">لا توجد أصناف مطابقة للبحث أو التصفية الحالية</h4>
            <p className="text-[10px] text-slate-400 font-light mt-1">جرب تغيير كلمات البحث أو إلغاء تفعيل عوامل التصفية</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
            {filteredItems.map((item, idx) => {
              const badge = getCategoryBadge(item.category);
              const isService = item.category === 'copy_scan';
              const isLow = !isService && item.stockQuantity <= item.minAlertQuantity;
              const currentStock = selectedWarehouseFilter !== 'all'
                ? getWarehouseStock(selectedWarehouseFilter, item.id)
                : item.stockQuantity;

              return (
                <div
                  key={`inv-card-${item.id || idx}-${idx}`}
                  className="bg-white rounded-xl border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between overflow-hidden group"
                >
                  {/* Card Top: Category & Favorite */}
                  <div className="p-3.5 pb-2">
                    <div className="flex items-start justify-between gap-2 mb-2.5">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${badge.class}`}>
                        {badge.label}
                      </span>
                      {/* Favorite Button */}
                      <button
                        type="button"
                        onClick={() => updateInventoryItem(item.id, { isFavorite: !item.isFavorite })}
                        className={`p-1.5 rounded-full transition-colors cursor-pointer ${
                          item.isFavorite
                            ? 'bg-amber-100 text-amber-500 hover:bg-amber-200'
                            : 'bg-slate-100 text-slate-300 hover:text-amber-400 hover:bg-slate-200'
                        }`}
                        title={item.isFavorite ? 'صنف مفضل في الكاشير (اضغط للإلغاء)' : 'تمييز كصنف مفضل في الكاشير'}
                      >
                        <Star className={`w-4 h-4 ${item.isFavorite ? 'fill-amber-400' : ''}`} />
                      </button>
                    </div>

                    {/* Image & Title */}
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-lg bg-slate-100 border border-slate-200 shrink-0 overflow-hidden flex items-center justify-center">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          />
                        ) : (
                          <ImageIcon className="w-6 h-6 text-slate-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-xs text-slate-900 line-clamp-2 leading-snug">
                          {item.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-1 font-mono text-[10px]">
                          <span className="text-blue-600 font-bold bg-blue-50 px-1 rounded">{item.code}</span>
                          {item.barcode && (
                            <span className="text-slate-400 truncate max-w-[110px]" title={item.barcode}>
                              • {item.barcode}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Stock & Prices Details */}
                  <div className="px-3.5 py-2.5 bg-slate-50/80 border-t border-b border-slate-100 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-light">الرصيد المتاح:</span>
                      <span
                        className={`font-mono font-bold text-xs px-2 py-0.5 rounded ${
                          isService
                            ? 'text-purple-700 bg-purple-50'
                            : isLow
                            ? 'text-rose-700 bg-rose-50 border border-rose-200 animate-pulse'
                            : 'text-emerald-700 bg-emerald-50 border border-emerald-200'
                        }`}
                      >
                        {isService ? 'خدمة غير محدودة' : `${currentStock} ${item.unit || 'حبة'}`}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-mono">
                      <span className="text-[10px] text-slate-400 font-light font-sans">سعر البيع:</span>
                      <span className="font-bold text-blue-600 text-xs">
                        {(Number(item.sellingPrice) || 0).toLocaleString('ar-SA')} ₪
                        {selectedCurrencyCode !== 'ILS' && (
                          <span className="text-[10px] text-emerald-600 font-normal mr-1">
                            (≈ {((Number(item.sellingPrice) || 0) / (dailyExchangeRate || 1)).toFixed(1)} {activeCurrency.symbol})
                          </span>
                        )}
                      </span>
                    </div>

                    {(item.sellingPrice2 || item.sellingPrice3) && (
                      <div className="flex items-center gap-1.5 pt-1 text-[10px] font-mono">
                        {item.sellingPrice2 && (
                          <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded border border-purple-200">
                            س2: {item.sellingPrice2} ₪
                          </span>
                        )}
                        {item.sellingPrice3 && (
                          <span className="bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                            س3: {item.sellingPrice3} ₪
                          </span>
                        )}
                      </div>
                    )}

                    {item.customerSpecialPrices && item.customerSpecialPrices.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setViewingSpecialPricesItem(item)}
                        className="w-full mt-1 text-[10px] font-bold text-amber-800 bg-amber-50 hover:bg-amber-100 py-1 px-2 rounded-md border border-amber-200 flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      >
                        <Star className="w-3 h-3 text-amber-600 fill-amber-500" />
                        <span>{item.customerSpecialPrices.length} عملاء بأسعار خاصة</span>
                      </button>
                    )}
                  </div>

                  {/* Quick Card Action Buttons */}
                  <div className="p-2 bg-white flex items-center justify-between gap-1 text-xs">
                    <button
                      type="button"
                      onClick={() => handleOpenBarcodeBank(item)}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-md text-[11px] font-bold transition cursor-pointer"
                      title="طباعة وتوليد باركود و ملصقات"
                    >
                      <BarcodeIcon className="w-3 h-3" />
                      <span>باركود</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenStockCard(item, 'card')}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 px-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-md text-[11px] font-bold transition cursor-pointer"
                      title="كارتة حركة المخزون"
                    >
                      <ClipboardList className="w-3 h-3" />
                      <span>الكارتة</span>
                    </button>
                    {!isService && (
                      <button
                        type="button"
                        onClick={() => handleOpenStockCard(item, 'adjust')}
                        className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition cursor-pointer"
                        title="تسوية وجرد"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(item)}
                      className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-md transition cursor-pointer"
                      title="تعديل بيانات الصنف"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="inventory-one-row-table w-full min-w-[1420px] text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 text-[11px]">
                <tr>
                  <th className="p-2.5">الكود والباركود</th>
                  <th className="p-2.5">الصورة واسم الصنف / الخامة</th>
                  <th className="p-2.5">التصنيف</th>
                  <th className="p-2.5">الوحدة</th>
                  <th className="p-2.5">سعر الشراء</th>
                  <th className="p-2.5">سعر البيع</th>
                  <th className="p-2.5">الرصيد المتاح</th>
                  <th className="p-2.5">إجمالي القيمة</th>
                  <th className="p-2.5">حد الأمان</th>
                  <th className="p-2.5 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="p-8 text-center text-slate-400">
                      <Boxes className="w-8 h-8 mx-auto text-slate-300 mb-2" />
                      <span>لا توجد أصناف مطابقة للبحث أو التصفية الحالية</span>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item, idx) => {
                    const badge = getCategoryBadge(item.category);
                    const isService = item.category === 'copy_scan';
                    const isLow = !isService && item.stockQuantity <= item.minAlertQuantity;
                    const lineTotalCost = item.stockQuantity * item.purchasePrice;

                    return (
                      <tr key={`inv-row-${item.id || idx}-${idx}`} className={`hover:bg-slate-50 transition-colors whitespace-nowrap ${idx === 0 || item.category !== filteredItems[idx - 1]?.category ? "border-t-2 border-sky-200 bg-sky-50/30" : ""}`}>
                        <td className="p-2 font-mono whitespace-nowrap">
                          <div className="font-bold text-blue-600">{item.code}</div>
                          <div className="text-[9px] text-slate-400 font-light">{item.barcode || '—'}</div>
                          {((item.barcodeEntries && item.barcodeEntries.length > 0) || (item.additionalBarcodes && item.additionalBarcodes.length > 0)) && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenBarcodeBank(item)}
                                className="inline-flex items-center gap-1 text-[9px] bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded border border-sky-200 cursor-pointer hover:bg-sky-100 font-sans font-medium"
                                title={`باركودات بديلة مسجلة:\n${(item.barcodeEntries || []).map(b => `${b.label}: ${b.barcode}`).join('\n') || (item.additionalBarcodes || []).join(', ')}`}
                              >
                                <BarcodeIcon className="w-2.5 h-2.5 text-sky-600" />
                                <span>+{(item.barcodeEntries?.length || item.additionalBarcodes?.length)} بديل</span>
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="p-2.5">
                          <div className="flex items-center gap-2.5">
                            {/* Item Image Thumbnail */}
                            <div className="relative group/thumb shrink-0">
                              {item.imageUrl ? (
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  className="w-10 h-10 object-cover rounded-lg border border-slate-200 shadow-2xs group-hover/thumb:scale-105 transition-transform"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-400">
                                  <ImageIcon className="w-5 h-5 text-slate-300" />
                                </div>
                              )}
                              {item.isFavorite && (
                                <span
                                  className="absolute -top-1 -right-1 bg-amber-400 text-amber-950 rounded-full p-0.5 shadow-xs"
                                  title="صنف مفضل في الكاشير"
                                >
                                  <Star className="w-2.5 h-2.5 fill-amber-950" />
                                </span>
                              )}
                            </div>

                            {/* Name, Favorite Toggle, and Description */}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold text-slate-900 inline-block max-w-[240px] truncate" title={[item.name, item.description].filter(Boolean).join(" — ")}>{item.name}</span>
                                <button
                                  type="button"
                                  onClick={() => updateInventoryItem(item.id, { isFavorite: !item.isFavorite })}
                                  title={item.isFavorite ? 'صنف مفضل في الكاشير (اضغط للإلغاء)' : 'تمييز كصنف مفضل في الكاشير'}
                                  className={`p-0.5 rounded hover:bg-slate-100 transition-colors cursor-pointer ${
                                    item.isFavorite ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'
                                  }`}
                                >
                                  <Star className={`w-3.5 h-3.5 ${item.isFavorite ? 'fill-amber-400' : ''}`} />
                                </button>
                              </div>

                            </div>
                          </div>
                        </td>
                        <td className="p-2.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded font-medium ${badge.class}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="p-2.5 text-slate-600">{item.unit}</td>
                        <td className="p-2.5 font-mono font-semibold text-slate-700">
                          <div>{(Number(item.purchasePrice) || 0).toFixed(2)} ₪</div>
                          {selectedCurrencyCode !== 'ILS' && (
                            <div className="text-[10px] text-blue-600 font-bold">
                              ≈ {((Number(item.purchasePrice) || 0) / (dailyExchangeRate || 1)).toFixed(2)} {activeCurrency.symbol}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 font-mono text-slate-900">
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="font-extrabold text-slate-950">{(Number(item.sellingPrice) || 0).toFixed(2)} ₪</span>
                            
                            {selectedCurrencyCode !== 'ILS' && (
                              <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1 rounded">
                                ≈ {((Number(item.sellingPrice) || 0) / (dailyExchangeRate || 1)).toFixed(2)} {activeCurrency.symbol}
                              </span>
                            )}

                            {item.sellingPrice2 && (
                              <span className="bg-purple-50 text-purple-700 text-[10px] px-1.5 py-0.5 rounded border border-purple-200 shrink-0 font-bold" title="سعر بيع 2">
                                س2: {item.sellingPrice2} ₪
                              </span>
                            )}

                            {item.sellingPrice3 && (
                              <span className="bg-amber-50 text-amber-700 text-[10px] px-1.5 py-0.5 rounded border border-amber-200 shrink-0 font-bold" title="سعر بيع 3">
                                س3: {item.sellingPrice3} ₪
                              </span>
                            )}
                          </div>
                          {item.customerSpecialPrices && item.customerSpecialPrices.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setViewingSpecialPricesItem(item)}
                              className="mt-1 inline-flex items-center gap-1 text-[10px] font-sans font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded border border-amber-300 cursor-pointer transition-colors"
                              title="عرض تفاصيل أسعار العملاء الخاصة"
                            >
                              <Star className="w-3 h-3 text-amber-600 fill-amber-500" />
                              <span>{item.customerSpecialPrices.length} أسعار خاصة</span>
                            </button>
                          )}
                        </td>
                        <td className="p-2.5">
                          {isService ? (
                            <span className="text-slate-400">غير محدود</span>
                          ) : (
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`font-mono font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                    isLow ? 'bg-rose-100 text-rose-700' : 'text-slate-800'
                                  }`}
                                >
                                  {selectedWarehouseFilter !== 'all'
                                    ? getWarehouseStock(selectedWarehouseFilter, item.id)
                                    : item.stockQuantity}
                                </span>
                                {selectedWarehouseFilter !== 'all' && (
                                  <span className="text-[10px] text-slate-400 font-mono" title="إجمالي الرصيد بكافة المستودعات">
                                    (إجمالي: {item.stockQuantity})
                                  </span>
                                )}
                              </div>

                              {/* Warehouses stock breakdown chips */}
                              {warehouses.length > 0 && selectedWarehouseFilter === 'all' && (
                                <div className="flex flex-wrap gap-1 mt-1 max-w-[220px]">
                                  {warehouses.map(wh => {
                                    const whStock = getWarehouseStock(wh.id, item.id);
                                    if (whStock <= 0) return null;
                                    return (
                                      <span
                                        key={wh.id}
                                        title={`${wh.name} (${wh.code}): ${whStock} ${item.unit}`}
                                        className="inline-flex items-center text-[9px] font-mono bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 px-1 py-0.5 rounded border border-slate-200 cursor-default"
                                      >
                                        <span className="font-medium text-slate-500">{wh.code}:</span>
                                        <span className="mr-0.5 font-bold text-slate-800">{whStock}</span>
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 font-mono font-semibold text-slate-800">
                          {isService ? '-' : (
                            <div>
                              <div>{lineTotalCost.toLocaleString('ar-SA')} ₪</div>
                              {selectedCurrencyCode !== 'ILS' && (
                                <div className="text-[9px] text-slate-400 font-light font-bold">
                                  ≈ {(lineTotalCost / dailyExchangeRate).toLocaleString('ar-SA', { maximumFractionDigits: 2 })} {activeCurrency.symbol}
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5 font-mono text-slate-500">
                          {isService ? '-' : item.minAlertQuantity}
                        </td>
                        <td className="p-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {/* Print Barcode & QR Label Button */}
                            <button
                              onClick={() => handleOpenBarcodeBank(item)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 rounded hover:bg-indigo-50 cursor-pointer transition"
                              title="طباعة وتوليد ملصقات باركود و QR (EAN-13 / CODE-128 / QR)"
                            >
                              <BarcodeIcon className="w-3.5 h-3.5 text-indigo-600" />
                            </button>

                            {/* Stock Movement Card Button */}
                            <button
                              onClick={() => handleOpenStockCard(item, 'card')}
                              className="p-1.5 text-slate-500 hover:text-amber-600 rounded hover:bg-amber-50 cursor-pointer transition"
                              title="كارتة حركة المخزون وسجل الوارد والمنصرف"
                            >
                              <ClipboardList className="w-3.5 h-3.5 text-amber-600" />
                            </button>

                            {/* Stock Adjustment Button */}
                            {!isService && (
                              <button
                                onClick={() => handleOpenStockCard(item, 'adjust')}
                                className="p-1.5 text-slate-500 hover:text-slate-900 rounded hover:bg-slate-100 cursor-pointer transition"
                                title="تسوية وجرد المخزون (عجز وزيادة)"
                              >
                                <Sliders className="w-3.5 h-3.5 text-slate-600" />
                              </button>
                            )}

                            {/* Edit Item Button */}
                            <button
                              onClick={() => handleOpenEdit(item)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 rounded hover:bg-blue-50 cursor-pointer transition"
                              title="تعديل بيانات الصنف"
                            >
                              <Edit2 className="w-3.5 h-3.5 text-blue-600" />
                            </button>
                            {/* Delete Item Button */}
                            <button
                              onClick={() => handleDeleteItem(item)}
                              className="p-1.5 text-slate-500 hover:text-red-600 rounded hover:bg-red-50 cursor-pointer transition"
                              title="حذف الصنف"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-red-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-lg max-w-xl w-full p-4 shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2.5 border-b border-slate-200 mb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Boxes className="w-4 h-4 text-blue-600" />
                <span>{editingItem ? 'تعديل بيانات الصنف' : 'إضافة صنف أو خامة جديدة مع تكويد تسلسلي'}</span>
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 text-base cursor-pointer px-1"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveItem} className="space-y-3 text-xs">
              {/* سطر واحد مدمج متكامل: صورة الصنف، كود الصنف، اسم الصنف، وحدة الصنف، الباركود الرئيسي والمجموعة */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-wrap sm:flex-nowrap gap-3 items-center">
                {/* 1. صورة الصنف (Item Image) Square Trigger/Preview */}
                <div className="relative shrink-0">
                  <label className="group block cursor-pointer" title="اضغط لرفع صورة من الجهاز">
                    <div className="relative w-14 h-14 rounded-xl bg-white border-2 border-dashed border-slate-300 group-hover:border-blue-500 overflow-hidden flex flex-col items-center justify-center transition-all shadow-2xs">
                      {formImageUrl ? (
                        <>
                          <img src={formImageUrl} alt="معاينة" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[9px] font-bold transition-opacity">تعديل</div>
                        </>
                      ) : (
                        <div className="flex flex-col items-center justify-center text-slate-400 p-1 text-center">
                          <Camera className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
                          <span className="text-[7.5px] font-semibold mt-0.5">رفع صورة</span>
                        </div>
                      )}
                    </div>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageFileUpload}
                      className="hidden"
                    />
                  </label>
                  {formImageUrl && (
                    <button
                      type="button"
                      onClick={() => setFormImageUrl('')}
                      className="absolute -top-1.5 -left-1.5 w-4.5 h-4.5 bg-rose-600 hover:bg-rose-700 text-white rounded-full flex items-center justify-center text-[10px] shadow-xs cursor-pointer leading-none"
                      title="حذف الصورة"
                    >
                      &times;
                    </button>
                  )}
                </div>

                {/* 2. Inputs Row (اسم الصنف، كود الصنف، الباركود الرئيسي، المجموعة، وحدة الصنف) */}
                <div className="flex-1 grid grid-cols-1 sm:grid-cols-12 gap-2.5 text-xs">
                  {/* اسم الصنف */}
                  <div className="sm:col-span-6 flex items-center gap-1.5 min-w-0">
                    <label className="text-slate-800 font-bold text-[10px] shrink-0 whitespace-nowrap">
                      اسم الصنف:
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-md p-1.5 text-xs font-bold text-slate-900 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      placeholder="اسم الصنف أو الخدمة..."
                    />
                  </div>

                  {/* كود الصنف */}
                  <div className="sm:col-span-3 flex items-center gap-1.5 min-w-0">
                    <label className="text-slate-800 font-bold text-[10px] shrink-0 whitespace-nowrap">
                      كود الصنف:
                    </label>
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="text"
                        required={Boolean(editingItem)}
                        value={formCode}
                        disabled={Boolean(editingItem)}
                        readOnly
                        title="كود الصنف يصدر تلقائيًا حسب المجموعة، ويبقى ثابتًا بعد الحفظ"
                        placeholder="تلقائي بعد الحفظ..."
                        className={`w-full border rounded-md p-1.5 pr-2.5 pl-8 font-mono text-xs font-bold text-center outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 ${
                          !skuValidation.isUnique ? 'bg-rose-50 border-rose-400 text-rose-800' : 'bg-white border-slate-300 text-blue-700'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={handleRegenerateCode}
                        disabled={Boolean(editingItem)}
                        className="absolute left-1 top-1/2 -translate-y-1/2 text-blue-600 hover:text-blue-800 p-1 flex items-center cursor-pointer"
                        title="توليد تلقائي"
                      >
                        <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                      </button>
                    </div>
                  </div>

                  {/* وحدة الصنف */}
                  <div className="sm:col-span-3 flex items-center gap-1.5 min-w-0">
                    <label className="text-slate-800 font-bold text-[10px] shrink-0 whitespace-nowrap">
                      الوحدة:
                    </label>
                    <div className="flex-1 min-w-0">
                      <ItemUnitSelector
                        value={formUnit}
                        onChange={setFormUnit}
                        showLabel={false}
                        placeholder="الوحدة..."
                        className="w-full"
                      />
                    </div>
                  </div>

                  {/* الباركود الرئيسي */}
                  <div className="sm:col-span-6 flex items-center gap-1.5 min-w-0">
                    <label className="text-slate-800 font-bold text-[10px] shrink-0 whitespace-nowrap">
                      الباركود الرئيسي:
                    </label>
                    <div className="relative flex-1 min-w-0">
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        value={formBarcode}
                        onChange={e => setFormBarcode(e.target.value)}
                        placeholder="امسح أو أدخل الباركود..."
                        className="w-full bg-white border border-slate-300 rounded-md p-1.5 pr-2.5 pl-18 font-mono text-xs focus:ring-1 focus:ring-blue-500 text-center outline-none"
                      />
                      {/* أزرار التوليد السريعة داخل حقل الباركود */}
                      <div className="absolute left-1 top-1/2 -translate-y-1/2 flex items-center gap-1 text-[8.5px]">
                        <button
                          type="button"
                          onClick={() => handleGenerateBarcodeByType('EAN13')}
                          className="text-blue-600 hover:underline font-bold"
                          title="توليد EAN-13"
                        >
                          E13
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => handleGenerateBarcodeByType('CODE128')}
                          className="text-blue-600 hover:underline font-bold"
                          title="توليد Code-128"
                        >
                          C128
                        </button>
                        <span className="text-slate-300">|</span>
                        <button
                          type="button"
                          onClick={() => {
                            setScannerForSearch(false);
                            setShowBarcodeScanner(true);
                          }}
                          className="text-blue-500 p-0.5 hover:text-blue-700 cursor-pointer"
                          title="تشغيل الكاميرا"
                        >
                          <Camera className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* المجموعة */}
                  <div className="sm:col-span-6 flex items-center gap-1.5 min-w-0">
                    <label className="text-slate-800 font-bold text-[10px] shrink-0 whitespace-nowrap">
                      المجموعة:
                    </label>
                    <select
                      value={formCategory}
                      disabled={Boolean(editingItem)}
                      title={editingItem ? 'نقل صنف بين التصنيفات يتم فقط بترحيل إداري مدقق' : 'مجموعة الصنف'}
                      onChange={e => handleCategoryChange(e.target.value as ItemCategory)}
                      className="w-full bg-white border border-slate-300 rounded-md p-1.5 text-xs text-slate-700 font-semibold focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                    >
                      {allCategories.map(cat => (
                        <option key={cat.id} value={cat.id}>{cat.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* إدارة الباركودات البديلة والإضافية */}
              <div className="bg-slate-50/90 rounded-xl p-3 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <div className="p-1 bg-blue-100 text-blue-700 rounded-md">
                      <BarcodeIcon className="w-3.5 h-3.5" />
                    </div>
                    <h4 className="font-bold text-slate-800 text-xs">الباركودات البديلة والإضافية</h4>
                  </div>
                  <span className="text-[10px] font-bold bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">
                    {formBarcodeEntries.length} باركود بديل مسجل
                  </span>
                </div>

                {/* قائمة الباركودات البديلة المسجلة */}
                {formBarcodeEntries.length > 0 && (
                  <div className="space-y-1.5 max-h-24 overflow-y-auto">
                    {formBarcodeEntries.map((entry, idx) => (
                      <div key={idx} className="flex items-center justify-between bg-white px-2 py-1 rounded-lg border border-slate-200">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] bg-sky-100 text-sky-800 font-bold px-1 rounded">
                            {entry.label || 'باركود بديل'}
                          </span>
                          <span className="font-mono font-bold text-slate-700 text-xs">{entry.barcode}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => handleSetAsPrimaryBarcode(idx)}
                            className="text-[9px] text-amber-700 hover:text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-0.5 cursor-pointer"
                          >
                            تعيين كرئيسي
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveBarcodeEntry(idx)}
                            className="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* نموذج إضافة باركود بديل جديد */}
                <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-2">
                  <div className="text-[11px] font-bold text-slate-700 flex items-center justify-between">
                    <span>+ إضافة باركود إضافي / بديل:</span>
                    <div className="flex items-center gap-1 text-[10px]">
                      <span className="text-slate-400">توليد:</span>
                      <button
                        type="button"
                        onClick={() => handleGenerateNewEntryBarcode('EAN13')}
                        className="text-blue-600 hover:underline font-bold"
                      >
                        EAN-13
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => handleGenerateNewEntryBarcode('CODE128')}
                        className="text-blue-600 hover:underline font-bold"
                      >
                        Code-128
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                    <div className="sm:col-span-6 relative">
                      <input
                        type="text"
                        value={newEntryBarcode}
                        onChange={e => setNewEntryBarcode(e.target.value)}
                        onFocus={() => setTargetBarcodeScanField('additional')}
                        placeholder="أدخل أو امسح الباركود البديل..."
                        className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 font-mono text-xs focus:bg-white focus:ring-1 focus:ring-blue-500 pl-7 text-center outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setScannerForSearch(false);
                          setTargetBarcodeScanField('additional');
                          setShowBarcodeScanner(true);
                        }}
                        className="absolute left-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-blue-600 p-0.5 cursor-pointer"
                      >
                        <Camera className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="sm:col-span-4">
                      <select
                        value={newEntryLabel}
                        onChange={e => setNewEntryLabel(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs text-slate-700 font-medium"
                      >
                        <option value="باركود كرتونة / عبوة">باركود كرتونة / عبوة</option>
                        <option value="باركود حبة مفردة">باركود حبة مفردة</option>
                        <option value="باركود مورد بديل">باركود مورد بديل</option>
                      </select>
                    </div>

                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={handleAddBarcodeEntry}
                        disabled={!newEntryBarcode.trim()}
                        className="w-full h-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold rounded-md px-2 py-1.5 text-xs flex items-center justify-center gap-1 cursor-pointer transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>إضافة</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* أسعار الشراء والبيع والكميات كلها في سطر واحد أفقي منسق */}
              <div className="bg-slate-50/90 rounded-xl p-3 border border-slate-200 space-y-2.5">
                <div className="grid grid-cols-1 md:grid-cols-6 gap-2.5 items-center">
                  {/* سعر الشراء */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label className="text-slate-700 font-bold text-[10px] shrink-0 whitespace-nowrap">
                      سعر الشراء:
                    </label>
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={formPurchasePrice}
                        onChange={e => setFormPurchasePrice(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded-md p-1 font-mono text-[11px] text-slate-800 focus:ring-1 focus:ring-blue-500 text-center outline-none"
                      />
                      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-bold">₪</span>
                    </div>
                  </div>

                  {/* سعر بيع (1) */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label className="text-slate-900 font-black text-[10px] shrink-0 whitespace-nowrap">
                      سعر بيع (1):
                    </label>
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={formSellingPrice}
                        onChange={e => setFormSellingPrice(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-white border-2 border-blue-400 rounded-md p-1 font-mono font-bold text-blue-900 text-[11px] focus:ring-1 focus:ring-blue-500 text-center outline-none"
                        placeholder="0.00"
                      />
                      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-blue-600 font-bold">₪</span>
                    </div>
                  </div>

                  {/* سعر بيع (2) */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label className="text-slate-700 font-bold text-[10px] shrink-0 whitespace-nowrap">
                      سعر بيع (2):
                    </label>
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formSellingPrice2}
                        onChange={e => setFormSellingPrice2(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded-md p-1 font-mono font-medium text-purple-900 text-[11px] focus:ring-1 focus:ring-purple-500 text-center outline-none"
                        placeholder="اختياري..."
                      />
                      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-bold">₪</span>
                    </div>
                  </div>

                  {/* سعر بيع (3) */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label className="text-slate-700 font-bold text-[10px] shrink-0 whitespace-nowrap">
                      سعر بيع (3):
                    </label>
                    <div className="relative flex-1 min-w-0">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formSellingPrice3}
                        onChange={e => setFormSellingPrice3(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded-md p-1 font-mono font-medium text-amber-900 text-[11px] focus:ring-1 focus:ring-amber-500 text-center outline-none"
                        placeholder="اختياري..."
                      />
                      <span className="absolute left-1 top-1/2 -translate-y-1/2 text-[9px] text-slate-400 font-bold">₪</span>
                    </div>
                  </div>

                  {/* الكمية الافتتاحية / الرصيد */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label className="text-slate-700 font-bold text-[10px] shrink-0 whitespace-nowrap">
                      الكمية الافتتاحية:
                    </label>
                    <input
                      ref={stockInputRef}
                      type="number"
                      value={formStock}
                      onChange={e => setFormStock(e.target.value === '' ? '' : Number(e.target.value))}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          barcodeInputRef.current?.focus();
                          barcodeInputRef.current?.select();
                        }
                      }}
                      className="w-full bg-white border border-slate-300 rounded-md p-1 font-mono text-[11px] focus:ring-1 focus:ring-blue-500 text-slate-800 text-center outline-none"
                    />
                  </div>

                  {/* حد التنبيه (الأمان) */}
                  <div className="flex items-center gap-1.5 min-w-0">
                    <label className="text-slate-700 font-bold text-[10px] shrink-0 whitespace-nowrap">
                      حد التنبيه (الأمان):
                    </label>
                    <input
                      type="number"
                      value={formMinAlert}
                      onChange={e => setFormMinAlert(e.target.value === '' ? '' : Number(e.target.value))}
                      className="w-full bg-white border border-slate-300 rounded-md p-1 font-mono text-[11px] focus:ring-1 focus:ring-blue-500 text-slate-800 text-center outline-none"
                    />
                  </div>
                </div>

                {/* هامش الربح */}
                <div className="flex items-center justify-between text-[11px] bg-white p-2 rounded-lg border border-slate-200">
                  <span className="text-slate-600 font-medium">هامش الربح (سعر 1):</span>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold text-emerald-700">
                      +{(Number(formSellingPrice || 0) - Number(formPurchasePrice || 0)).toFixed(2)} ₪
                    </span>
                    {Number(formPurchasePrice || 0) > 0 && (
                      <span className="text-[9px] text-slate-400 font-light">
                        ({(((Number(formSellingPrice || 0) - Number(formPurchasePrice || 0)) / Number(formPurchasePrice || 0)) * 100).toFixed(1)}%)
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* سعر خاص لعميل معين */}
              <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-200 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-amber-600 fill-amber-500" />
                    <h4 className="text-xs font-bold text-amber-950">
                      سعر خاص لعميل معين:
                    </h4>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
                    {formCustomerSpecialPrices.length} عملاء بسعر خاص
                  </span>
                </div>

                {/* نموذج إضافة سعر خاص */}
                <div className="bg-white p-2.5 rounded-lg border border-amber-200 grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-5">
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      العميل:
                    </label>
                    <select
                      value={newSpecialCustomerId}
                      onChange={e => setNewSpecialCustomerId(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-300 rounded-md p-1.5 text-xs text-slate-800 font-medium focus:bg-white focus:ring-1 focus:ring-amber-500"
                    >
                      <option value="">-- اختر العميل --</option>
                      {customers.map((c, idx) => {
                        const hasAlready = formCustomerSpecialPrices.some(p => p.customerId === c.id);
                        return (
                          <option key={`inv-cust-opt-${c.id || idx}-${idx}`} value={c.id}>
                            {c.name} {c.code ? `(${c.code})` : ''} {hasAlready ? '⭐ مسجل' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      السعر الخاص ({settings.currency}):
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={newSpecialPrice}
                        onChange={e => setNewSpecialPrice(e.target.value)}
                        placeholder="0.00"
                        className="w-full bg-slate-50 border border-slate-300 rounded-md p-1.5 font-mono font-bold text-xs text-slate-900 focus:bg-white focus:ring-1 focus:ring-amber-500"
                      />
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 font-bold">₪</span>
                    </div>
                  </div>

                  <div className="sm:col-span-3">
                    <label className="block text-[10px] font-bold text-slate-700 mb-0.5">
                      الملاحظة:
                    </label>
                    <input
                      type="text"
                      value={newSpecialNotes}
                      onChange={e => setNewSpecialNotes(e.target.value)}
                      placeholder="خصم اتفاقية..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-md p-1.5 text-xs text-slate-700 focus:bg-white focus:ring-1 focus:ring-amber-500"
                    />
                  </div>

                  <div className="sm:col-span-1 flex items-end">
                    <button
                      type="button"
                      onClick={handleAddCustomerSpecialPrice}
                      disabled={!newSpecialCustomerId || newSpecialPrice === ''}
                      className="w-full h-8 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-md flex items-center justify-center transition-colors cursor-pointer shadow-2xs"
                      title="إضافة السعر الخاص للعميل"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* جدول الأسعار الخاصة */}
                {formCustomerSpecialPrices.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-amber-200 bg-white">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-amber-100/70 text-amber-900 font-bold border-b border-amber-200">
                        <tr>
                          <th className="p-2">العميل</th>
                          <th className="p-2">السعر الخاص</th>
                          <th className="p-2">مقارنة بسعر 1</th>
                          <th className="p-2">الملاحظات</th>
                          <th className="p-2 text-center">حذف</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-amber-100 font-sans">
                        {formCustomerSpecialPrices.map((entry, idx) => {
                          const entryPrice = Number(entry?.price ?? 0);
                          const basePrice = Number(formSellingPrice || 0);
                          const diff = entryPrice - basePrice;
                          return (
                            <tr key={`inv-sp-ent-${entry?.customerId || idx}-${idx}`} className="hover:bg-amber-50/50">
                              <td className="p-2 font-bold text-slate-800">
                                {entry?.customerName || 'عميل'}
                                {entry?.customerCode && (
                                  <span className="text-[10px] font-mono text-slate-500 mr-1">
                                    ({entry.customerCode})
                                  </span>
                                )}
                              </td>
                              <td className="p-2 font-mono font-bold text-amber-900">
                                {entryPrice.toFixed(2)} ₪
                              </td>
                              <td className="p-2 text-[11px] font-mono">
                                {diff === 0 ? (
                                  <span className="text-slate-500">مطابق لسعر 1</span>
                                ) : diff < 0 ? (
                                  <span className="text-emerald-700 font-bold">
                                    خصم {Math.abs(diff).toFixed(2)} ₪
                                  </span>
                                ) : (
                                  <span className="text-blue-700 font-bold">
                                    +{diff.toFixed(2)} ₪
                                  </span>
                                )}
                              </td>
                              <td className="p-2 text-[11px] text-slate-600">
                                {entry?.notes || '-'}
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveCustomerSpecialPrice(entry.customerId)}
                                  className="p-1 hover:bg-rose-100 text-rose-600 rounded cursor-pointer transition-colors"
                                  title="حذف"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>



              <div>
                <label className="block text-slate-700 font-semibold mb-1">وصف الصنف والمواصفات:</label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={e => setFormDesc(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-1.5 text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Image Upload and POS Favorite Setting */}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-slate-800 font-bold text-[11px] flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>صورة الصنف (تظهر في قائمة الأصناف والمفضلة بالكاشير):</span>
                  </label>
                  {formImageUrl && (
                    <button
                      type="button"
                      onClick={() => setFormImageUrl('')}
                      className="text-rose-600 hover:text-rose-800 text-[10px] font-bold flex items-center gap-0.5 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>حذف الصورة</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Image Preview Box */}
                  <div className="relative w-16 h-16 rounded-lg bg-white border border-slate-300 overflow-hidden flex items-center justify-center shrink-0 shadow-2xs">
                    {formImageUrl ? (
                      <img
                        src={formImageUrl}
                        alt="معاينة الصنف"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center text-slate-300">
                        <ImageIcon className="w-6 h-6 text-slate-300" />
                        <span className="text-[8px] text-slate-400">لا توجد</span>
                      </div>
                    )}
                  </div>

                  {/* Upload and URL input */}
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 px-2.5 py-1 rounded text-xs font-semibold cursor-pointer shadow-2xs transition">
                        <Upload className="w-3.5 h-3.5 text-blue-600" />
                        <span>رفع صورة من الجهاز...</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={handleImageFileUpload}
                          className="hidden"
                        />
                      </label>
                      <span className="text-[10px] text-slate-400">أو رابط صورة:</span>
                    </div>

                    <input
                      type="url"
                      value={formImageUrl}
                      onChange={e => setFormImageUrl(e.target.value)}
                      placeholder="https://example.com/item.jpg"
                      className="w-full bg-white border border-slate-200 rounded p-1 text-xs font-mono text-slate-700 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                {/* Favorite in POS Checkbox */}
                <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={formIsFavorite}
                      onChange={e => setFormIsFavorite(e.target.checked)}
                      className="w-4 h-4 text-amber-500 rounded border-slate-300 focus:ring-amber-400"
                    />
                    <div className="flex items-center gap-1.5">
                      <Star className={`w-3.5 h-3.5 ${formIsFavorite ? 'text-amber-500 fill-amber-400' : 'text-slate-400'}`} />
                      <span className="text-xs font-bold text-slate-800">
                        تضمين الصنف في قائمة "المفضلة" بشاشة الكاشير
                      </span>
                    </div>
                  </label>
                  <span className="text-[9px] text-slate-400 font-light">
                    يظهر في نافذة الوصول السريع بالكاشير مع الصورة
                  </span>
                </div>
              </div>

              <div className="pt-2.5 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={!skuValidation.isUnique}
                  className={`px-4 py-1.5 font-bold rounded-md text-xs shadow-xs transition-colors ${
                    !skuValidation.isUnique
                      ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer'
                  }`}
                  title={!skuValidation.isUnique ? 'لا يمكن الحفظ: كود الصنف مكرر مع صنف آخر' : 'حفظ الصنف'}
                >
                  حفظ الصنف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Barcode & QR Bank Modal */}
      <BarcodeBankModal
        isOpen={showBarcodeBankModal}
        onClose={() => setShowBarcodeBankModal(false)}
        inventory={inventory}
        selectedItem={selectedItemForBarcode}
        onSelectItem={(item) => setSelectedItemForBarcode(item)}
        currency={settings.currency}
      />

      {/* Quick Customer Special Prices Viewer Modal */}
      {viewingSpecialPricesItem && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-5 shadow-2xl border border-amber-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <Star className="w-5 h-5 fill-amber-500 text-amber-600" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">
                    الأسعار الخاصة للعملاء للصنف
                  </h3>
                  <p className="text-[10px] text-slate-400 font-light font-sans">
                    {viewingSpecialPricesItem.name} ({viewingSpecialPricesItem.code})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingSpecialPricesItem(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Base prices summary */}
            <div className="grid grid-cols-3 gap-2 my-3 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 block text-[10px]">سعر التكلفة:</span>
                <span className="font-bold font-mono text-slate-800">{(Number(viewingSpecialPricesItem.purchasePrice) || 0).toFixed(2)} ₪</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">سعر بيع 1 (أساسي):</span>
                <span className="font-bold font-mono text-blue-600">{(Number(viewingSpecialPricesItem.sellingPrice) || 0).toFixed(2)} ₪</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px]">فئات أخرى:</span>
                <span className="font-mono text-slate-700 text-[11px]">
                  {viewingSpecialPricesItem.sellingPrice2 ? `س2: ${viewingSpecialPricesItem.sellingPrice2} ₪ ` : ''}
                  {viewingSpecialPricesItem.sellingPrice3 ? `| س3: ${viewingSpecialPricesItem.sellingPrice3} ₪` : ''}
                  {!viewingSpecialPricesItem.sellingPrice2 && !viewingSpecialPricesItem.sellingPrice3 && 'لا يوجد'}
                </span>
              </div>
            </div>

            {/* Customers table */}
            <div className="overflow-x-auto rounded-xl border border-amber-200 max-h-64 overflow-y-auto">
              <table className="w-full text-right text-xs">
                <thead className="bg-amber-50 text-amber-900 font-bold border-b border-amber-200 sticky top-0">
                  <tr>
                    <th className="p-2.5">العميل</th>
                    <th className="p-2.5">السعر الخاص</th>
                    <th className="p-2.5">الفارق عن سعر 1</th>
                    <th className="p-2.5">الملاحظة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewingSpecialPricesItem.customerSpecialPrices?.map((sp, idx) => {
                    const spPrice = Number(sp?.price ?? 0);
                    const baseSelling = Number(viewingSpecialPricesItem?.sellingPrice ?? 0);
                    const diff = spPrice - baseSelling;
                    return (
                      <tr key={`inv-sp-row-${sp?.customerId || idx}-${idx}`} className="hover:bg-amber-50/40">
                        <td className="p-2.5 font-bold text-slate-800">
                          {sp?.customerName || 'عميل'}
                          {sp?.customerCode && (
                            <span className="text-[10px] text-slate-400 font-mono mr-1">
                              ({sp.customerCode})
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 font-mono font-bold text-amber-900">
                          {spPrice.toFixed(2)} ₪
                        </td>
                        <td className="p-2.5 font-mono text-[11px]">
                          {diff === 0 ? (
                            <span className="text-slate-400">مطابق</span>
                          ) : diff < 0 ? (
                            <span className="text-emerald-700 font-bold">خصم {Math.abs(diff).toFixed(2)} ₪</span>
                          ) : (
                            <span className="text-blue-700 font-bold">+{diff.toFixed(2)} ₪</span>
                          )}
                        </td>
                        <td className="p-2.5 text-slate-500 text-[11px]">
                          {sp?.notes || '-'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  const it = viewingSpecialPricesItem;
                  setViewingSpecialPricesItem(null);
                  handleOpenEdit(it);
                }}
                className="px-3 py-1.5 bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                <span>تعديل في كارتة الصنف</span>
              </button>

              <button
                type="button"
                onClick={() => setViewingSpecialPricesItem(null)}
                className="px-4 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer transition-colors"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      
      {/* Manage Categories Modal */}
      <ManageCategoriesModal
        isOpen={showCategoriesModal}
        onClose={() => setShowCategoriesModal(false)}
      />

      {/* Stock Movement Ledger & Stock Card Modal */}
      <StockMovementModal
        isOpen={showStockMovementModal}
        onClose={() => setShowStockMovementModal(false)}
        initialItemId={selectedItemForMovement}
        initialTab={stockMovementInitialTab}
      />

      {/* Camera Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={showBarcodeScanner}
        onClose={() => {
          setShowBarcodeScanner(false);
          setScannerForSearch(false);
        }}
        inventory={inventory}
        mode={scannerForSearch ? 'pos' : 'input'}
        title={
          scannerForSearch
            ? 'البحث عن صنف بالباركود عبر الكاميرا'
            : targetBarcodeScanField === 'additional'
            ? 'مسح باركود إضافي / بديل للصنف'
            : (editingItem ? 'مسح باركود لتعديل بيانات الصنف' : 'مسح باركود الصنف أو الخامة بالكاميرا')
        }
        subtitle={
          scannerForSearch
            ? 'وجّه الكاميرا نحو باركود الصنف لتصفيته مباشرة في جدول المخزون'
            : targetBarcodeScanField === 'additional'
            ? 'وجّه الكاميرا لقراءة الباركود البديل (كرتونة، مورد، عبوة) وتعبئته فوراً'
            : 'وجّه الكاميرا نحو باركود المنتج لملء وتحديث حقل الباركود الرئيسي تلقائياً'
        }
        currentBarcode={scannerForSearch ? undefined : (targetBarcodeScanField === 'additional' ? newEntryBarcode : formBarcode)}
        onScanBarcode={code => {
          if (scannerForSearch) {
            setSearchQuery(code);
            setShowBarcodeScanner(false);
            setScannerForSearch(false);
          } else if (targetBarcodeScanField === 'additional') {
            setNewEntryBarcode(code);
            setShowBarcodeScanner(false);
            posSound.playSuccessBeep();
          } else {
            setFormBarcode(code);
            setShowBarcodeScanner(false);
            setFocusTargetStock(true);
            posSound.playSuccessBeep();
          }
        }}
        onScanItem={item => {
          if (scannerForSearch) {
            setSearchQuery(item.barcode || item.code);
            setShowBarcodeScanner(false);
            setScannerForSearch(false);
          }
        }}
        currency={settings.currency}
      />
    </div>
  );
};
