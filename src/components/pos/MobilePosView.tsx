import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useAccounting } from '../../context/AccountingContext';
import {requestMasterForm, peekMasterResult, consumeMasterResult} from '../../utils/masterFormNavigation';
import {indexedSubCustomers, registeredSubCustomer, cleanSubCustomerName, isInvoiceOnlySubCustomer, subCustomerParentId} from '../../utils/subCustomerIdentity';
import { onlineInvoicePostingService } from '../../services/onlineInvoicePostingService';
import {
  ShoppingCart,
  Search,
  Plus,
  Minus,
  Trash2,
  Printer,
  CheckCircle,
  ArrowRight,
  User,
  Users,
  CreditCard,
  Banknote,
  Clock,
  Sparkles,
  Layers,
  ChevronDown,
  Check,
  X,
  Smartphone,
  Monitor,
  Barcode,
  Camera,
  AlertCircle,
  Ruler,
  FileText,
  Percent,
  Coins,
  DollarSign,
  UserPlus,
  Building2,
  ArrowLeftRight,
  PauseCircle,
  History,
  Truck,
  RotateCcw
} from 'lucide-react';
import { InventoryItem, Party, PaymentMethod, Invoice } from '../../types';
import { BarcodeScannerModal } from '../BarcodeScannerModal';
import { matchItemByBarcode } from '../../utils/barcodeGenerator';
import { posSound } from '../../utils/audio';
import { isSquareMeterUnit } from '../../utils/unitsOfMeasure';

interface MobilePosViewProps {
  onSwitchToDesktop?: () => void;
}

export interface MobileCartItem {
  id: string;
  item: InventoryItem;
  quantity: number;
  unitPrice: number;
  discount: number;
  notes: string;
  hasDimensions: boolean;
  length: number;
  width: number;
  count: number;
}

export interface MobileHeldInvoice {
  id: string;
  heldAt: string;
  customerName: string;
  customerId?: string;
  subCustomerId?: string;
  customSubCustomerName?: string;
  partyTypeMode?: 'customer' | 'supplier' | 'employee' | 'walkin';
  cart: MobileCartItem[];
  totalAmount: number;
  globalDiscount?: string;
  notes?: string;
}

export const MobilePosView: React.FC<MobilePosViewProps> = ({ onSwitchToDesktop }) => {
  const {
    inventory,
    parties,
    employees,
    addParty,
    invoices,
    treasuries,
    settings,
    currencies,
    createPosSale,
    postPosSaleOnline,
    setSelectedInvoiceForPrint,
    setDirectPrintOptions,
    setActiveTab,
    currentUserId,
    currentUser,
    activeBranchId,
    activeWarehouseId,
    getItemPriceForCustomer
  } = useAccounting();

  // Multi-Currency
  const baseCurrency = currencies.find(c => c.isBase) || { code: 'ILS', symbol: '₪', rateAgainstBase: 1.0 };
  const [selectedCurrencyCode, setSelectedCurrencyCode] = useState(settings.baseCurrencyCode || 'ILS');
  const activeCurrency = currencies.find(c => c.code === selectedCurrencyCode) || baseCurrency;

  const MOBILE_POS_DRAFT_KEY = 'mobile_pos_active_draft';
  const savedMobileDraft = useMemo(() => {
    try {
      const raw = localStorage.getItem('mobile_pos_active_draft');
      if (raw) return JSON.parse(raw);
    } catch {}
    return {} as any;
  }, []);

  // 1. Customer / Supplier / Employee Mode & Inputs (زبون / مورد / موظف)
  const [partyTypeMode, setPartyTypeMode] = useState<'customer' | 'supplier' | 'employee'>(() => {
    return savedMobileDraft.partyTypeMode || 'customer';
  });
  const [customerNameInput, setCustomerNameInput] = useState<string>(() => {
    return savedMobileDraft.customerNameInput !== undefined ? savedMobileDraft.customerNameInput : 'زبون نقدي / عام';
  });
  const [customSubCustomerName, setCustomSubCustomerName] = useState<string>(() => {
    return savedMobileDraft.customSubCustomerName || '';
  });
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(() => {
    return savedMobileDraft.selectedCustomerId || '';
  });
  const [selectedSubCustomerId, setSelectedSubCustomerId] = useState<string>(() => {
    return savedMobileDraft.selectedSubCustomerId || '';
  });
  const [showPartySuggestions, setShowPartySuggestions] = useState<boolean>(false);

  // Bank treasury selection for card/bank payment
  const bankTreasuries = useMemo(() => {
    return (treasuries || []).filter(t =>
      t.type === 'bank' ||
      t.type === 'electronic' ||
      (t.accountCode && t.accountCode.startsWith('1102')) ||
      (t.name && t.name.includes('بنك')) ||
      (t.name && t.name.includes('شيك'))
    );
  }, [treasuries]);

  const [selectedBankTreasuryCode, setSelectedBankTreasuryCode] = useState<string>('');

  useEffect(() => {
    if (bankTreasuries.length > 0 && !selectedBankTreasuryCode) {
      setSelectedBankTreasuryCode(bankTreasuries[0].accountCode);
    }
  }, [bankTreasuries, selectedBankTreasuryCode]);

  // Cash treasury selection for cash payment
  const cashTreasuries = useMemo(() => {
    return (treasuries || []).filter(t =>
      t.type === 'cash' ||
      (t.accountCode && t.accountCode.startsWith('1101')) ||
      (t.name && t.name.includes('نقدي'))
    );
  }, [treasuries]);

  const [selectedCashTreasuryCode, setSelectedCashTreasuryCode] = useState<string>('1101');

  useEffect(() => {
    if (cashTreasuries.length > 0 && !selectedCashTreasuryCode) {
      setSelectedCashTreasuryCode(cashTreasuries[0].accountCode || '1101');
    }
  }, [cashTreasuries, selectedCashTreasuryCode]);

  // Payment currency & exchange rate state (Global / default, plus dedicated cash & bank rates)
  const [payCurrencyCode, setPayCurrencyCode] = useState<string>(settings.baseCurrencyCode || 'ILS');
  const [payExchangeRate, setPayExchangeRate] = useState<number>(1.0);

  // Method-specific currency & exchange rate states (Cash vs Bank/Card)
  const [cashCurrencyCode, setCashCurrencyCode] = useState<string>(settings.baseCurrencyCode || 'ILS');
  const [cashExchangeRate, setCashExchangeRate] = useState<number>(1.0);

  const [bankCurrencyCode, setBankCurrencyCode] = useState<string>(settings.baseCurrencyCode || 'ILS');
  const [bankExchangeRate, setBankExchangeRate] = useState<number>(1.0);

  const [invoiceNotes, setInvoiceNotes] = useState<string>(() => savedMobileDraft.invoiceNotes || '');

  useEffect(() => {
    const found = currencies.find(c => c.code === payCurrencyCode);
    if (found) {
      setPayExchangeRate(found.rateAgainstBase || 1.0);
    }
  }, [payCurrencyCode, currencies]);

  useEffect(() => {
    const found = currencies.find(c => c.code === cashCurrencyCode);
    if (found) {
      setCashExchangeRate(found.rateAgainstBase || 1.0);
    }
  }, [cashCurrencyCode, currencies]);

  useEffect(() => {
    const found = currencies.find(c => c.code === bankCurrencyCode);
    if (found) {
      setBankExchangeRate(found.rateAgainstBase || 1.0);
    }
  }, [bankCurrencyCode, currencies]);

  // Parties / Employees suggestions matching
  const matchingParties = useMemo(() => {
    const q = customerNameInput.trim().toLowerCase();

    if (partyTypeMode === 'customer') {
      const allCustomers = parties.filter(p => (p.type === 'customer' || p.type === 'both') && !p.isSubCustomer);
      if (!q || q === 'زبون نقدي / عام') {
        return allCustomers.slice(0, 12);
      }
      return allCustomers.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q))
      );
    }

    if (partyTypeMode === 'supplier') {
      const allSuppliers = parties.filter(p => (p.type === 'supplier' || p.type === 'both') && !p.isSubCustomer);
      if (!q) {
        return allSuppliers.slice(0, 12);
      }
      return allSuppliers.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.phone && p.phone.includes(q)) ||
        (p.code && p.code.toLowerCase().includes(q))
      );
    }

    if (partyTypeMode === 'employee') {
      const allEmployees = (employees || []).filter(e => e.status !== 'terminated');
      if (!q) {
        return allEmployees.slice(0, 12);
      }
      return allEmployees.filter(e =>
        e.name.toLowerCase().includes(q) ||
        (e.phone && e.phone.includes(q)) ||
        (e.code && e.code.toLowerCase().includes(q)) ||
        (e.jobTitle && e.jobTitle.toLowerCase().includes(q)) ||
        (e.department && e.department.toLowerCase().includes(q))
      );
    }

    return [];
  }, [parties, employees, customerNameInput, partyTypeMode]);

  // Sub-Customers matching for selected customer
  const subCustomersForCustomer = useMemo(() => {
    if (!selectedCustomerId) return [];
    return indexedSubCustomers(parties, invoices).filter(p => subCustomerParentId(p) === selectedCustomerId);
  }, [parties, invoices, selectedCustomerId]);

  const [showCustomerPicker, setShowCustomerPicker] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');


  // Cart state
  const [cart, setCart] = useState<MobileCartItem[]>(() => {
    return Array.isArray(savedMobileDraft.cart) ? savedMobileDraft.cart : [];
  });
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(() => {
    return savedMobileDraft.paymentMethod || 'cash';
  });
  const [globalDiscount, setGlobalDiscount] = useState<string>(() => {
    return savedMobileDraft.globalDiscount || '';
  });
  const [paidAmountInput, setPaidAmountInput] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [successNotification, setSuccessNotification] = useState<{ number: string; total: number } | null>(null);

  // Auto-save mobile POS draft (لضمان بقاء البيانات والأصناف عند التحديث أو F5)
  useEffect(() => {
    try {
      const hasContent =
        cart.length > 0 ||
        (customerNameInput && customerNameInput !== 'زبون نقدي / عام') ||
        selectedCustomerId !== '' ||
        customSubCustomerName !== '' ||
        globalDiscount !== '' ||
        (invoiceNotes && invoiceNotes.trim() !== '');

      if (hasContent) {
        localStorage.setItem(MOBILE_POS_DRAFT_KEY, JSON.stringify({
          partyTypeMode,
          customerNameInput,
          customSubCustomerName,
          selectedCustomerId,
          selectedSubCustomerId,
          cart,
          paymentMethod,
          globalDiscount,
          invoiceNotes,
          timestamp: Date.now()
        }));
      } else {
        localStorage.removeItem(MOBILE_POS_DRAFT_KEY);
      }
    } catch {}
  }, [partyTypeMode, customerNameInput, customSubCustomerName, selectedCustomerId, selectedSubCustomerId, cart, paymentMethod, globalDiscount, invoiceNotes]);

  useEffect(() => {
    const handleBeforeUnload = () => {
      try {
        localStorage.setItem(MOBILE_POS_DRAFT_KEY, JSON.stringify({
          partyTypeMode,
          customerNameInput,
          customSubCustomerName,
          selectedCustomerId,
          selectedSubCustomerId,
          cart,
          paymentMethod,
          globalDiscount,
          invoiceNotes,
          timestamp: Date.now()
        }));
      } catch {}
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [partyTypeMode, customerNameInput, customSubCustomerName, selectedCustomerId, selectedSubCustomerId, cart, paymentMethod, globalDiscount, invoiceNotes]);

  // Automatically re-evaluate cart item prices whenever customer changes in Mobile POS
  const prevMobileCustIdRef = useRef(selectedCustomerId);
  useEffect(() => {
    if (prevMobileCustIdRef.current !== selectedCustomerId) {
      prevMobileCustIdRef.current = selectedCustomerId;
      if (cart.length > 0) {
        setCart(prev => prev.map(ci => {
          const matchedInv = inventory.find(i => i.id === ci.item.id) || ci.item;
          const { price } = getItemPriceForCustomer(matchedInv, selectedCustomerId);
          return {
            ...ci,
            item: matchedInv,
            unitPrice: price
          };
        }));
      }
    }
  }, [selectedCustomerId, cart.length, inventory, getItemPriceForCustomer]);

  // Shortcut Modals & Operations State
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [showHeldModal, setShowHeldModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [showCurrencyModal, setShowCurrencyModal] = useState(false);
  const [deliveryFeeInput, setDeliveryFeeInput] = useState<string>('15');
  const [deliveryNotesInput, setDeliveryNotesInput] = useState<string>('');

  // Held Invoices Persistence in LocalStorage
  const [heldInvoices, setHeldInvoices] = useState<MobileHeldInvoice[]>(() => {
    try {
      const raw = localStorage.getItem('pos_mobile_held_invoices');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('pos_mobile_held_invoices', JSON.stringify(heldInvoices));
    } catch (e) {
      console.error('Failed to store held invoices in localStorage', e);
    }
  }, [heldInvoices]);

  // 3. Unified Search & Barcode Input State (دمج البحث والباركود في خانة واحدة ذكية)
  const [searchBarcodeQuery, setSearchBarcodeQuery] = useState<string>('');
  const [essentialQty, setEssentialQty] = useState<string>('1');
  const [essentialPrice, setEssentialPrice] = useState<string>('');
  const [matchedItem, setMatchedItem] = useState<InventoryItem | null>(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState<boolean>(false);
  const [barcodeAlertMsg, setBarcodeAlertMsg] = useState<string | null>(null);

  // 4. Dimensions & Notes Modal State
  const [activeDimensionItem, setActiveDimensionItem] = useState<MobileCartItem | null>(null);
  const [dimLength, setDimLength] = useState<string>('1');
  const [dimWidth, setDimWidth] = useState<string>('1');
  const [dimCount, setDimCount] = useState<string>('1');
  const [dimNotes, setDimNotes] = useState<string>('');

  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Match barcode automatically
  useEffect(() => {
    const clean = searchBarcodeQuery.trim();
    if (!clean) {
      setMatchedItem(null);
      setEssentialPrice('');
      return;
    }
    const found = inventory.find(i => matchItemByBarcode(i, clean) || i.code === clean);
    if (found) {
      setMatchedItem(found);
      const prcInfo = getItemPriceForCustomer(found, selectedCustomerId);
      setEssentialPrice(String(prcInfo.price || ''));
      setBarcodeAlertMsg(null);
    } else {
      setMatchedItem(null);
    }
  }, [searchBarcodeQuery, inventory, selectedCustomerId, getItemPriceForCustomer]);

  // Categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    inventory.forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return Array.from(cats);
  }, [inventory]);

  // Filtered inventory suggestions when typing
  const filteredItems = useMemo(() => {
    const q = searchBarcodeQuery.toLowerCase().trim();
    if (!q) return [];
    return inventory.filter(i =>
      i.name.toLowerCase().includes(q) ||
      (i.code && i.code.toLowerCase().includes(q)) ||
      (i.barcode && i.barcode.toLowerCase().includes(q))
    ).slice(0, 15);
  }, [inventory, searchBarcodeQuery]);

  // Direct Add Item via Barcode or Search
  const handleDirectAdd = (targetItem?: InventoryItem) => {
    const itemToAdd = targetItem || matchedItem || inventory.find(i => matchItemByBarcode(i, searchBarcodeQuery.trim()) || i.code === searchBarcodeQuery.trim());
    const qty = Math.max(0.01, parseFloat(essentialQty) || 1);

    if (itemToAdd) {
      const preferredPrice = getItemPriceForCustomer(itemToAdd, selectedCustomerId).price;
      const price = essentialPrice ? parseFloat(essentialPrice) || preferredPrice : preferredPrice;
      const requiresDimensions = isSquareMeterUnit(itemToAdd.unit, itemToAdd.unitCalculationType);

      setCart(prev => {
        const existingIdx = prev.findIndex(ci => ci.item.id === itemToAdd.id);
        if (existingIdx >= 0) {
          const updated = {
            ...prev[existingIdx],
            quantity: prev[existingIdx].quantity + qty,
            ...(essentialPrice ? { unitPrice: price } : {})
          };
          const rest = prev.filter((_, idx) => idx !== existingIdx);
          // Put updated item at the TOP!
          return [updated, ...rest];
        } else {
          const newItem: MobileCartItem = {
            id: `ci-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            item: itemToAdd,
            quantity: qty,
            unitPrice: price,
            discount: 0,
            notes: '',
            hasDimensions: requiresDimensions,
            length: 1,
            width: 1,
            count: 1
          };
          // Put new item at the TOP!
          return [newItem, ...prev];
        }
      });

      posSound.beep();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate(35);
      }

      setSearchBarcodeQuery('');
      setEssentialQty('1');
      setEssentialPrice('');
      setMatchedItem(null);
      setBarcodeAlertMsg(null);

      setTimeout(() => {
        barcodeInputRef.current?.focus();
      }, 50);
    } else if (searchBarcodeQuery.trim()) {
      posSound.error();
      setBarcodeAlertMsg(`الصنف غير موجود: ${searchBarcodeQuery.trim()}`);
      setTimeout(() => setBarcodeAlertMsg(null), 4000);
    }
  };

  // Quick Catalog Add
  const handleCatalogAdd = (item: InventoryItem) => {
    const requiresDimensions = isSquareMeterUnit(item.unit, item.unitCalculationType);

    setCart(prev => {
      const existingIndex = prev.findIndex(ci => ci.item.id === item.id);
      if (existingIndex >= 0) {
        const updated = {
          ...prev[existingIndex],
          quantity: prev[existingIndex].quantity + 1
        };
        const rest = prev.filter((_, idx) => idx !== existingIndex);
        return [updated, ...rest];
      } else {
        const newItem: MobileCartItem = {
          id: `ci-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          item,
          quantity: 1,
          unitPrice: getItemPriceForCustomer(item, selectedCustomerId).price || 0,
          discount: 0,
          notes: '',
          hasDimensions: requiresDimensions,
          length: 1,
          width: 1,
          count: 1
        };
        return [newItem, ...prev];
      }
    });

    posSound.beep();
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(30);
    }
  };

  // Open Dimensions Modal
  const openDimensionsModal = (cartItem: MobileCartItem) => {
    setActiveDimensionItem(cartItem);
    setDimLength(String(cartItem.length || 1));
    setDimWidth(String(cartItem.width || 1));
    setDimCount(String(cartItem.count || 1));
    setDimNotes(cartItem.notes || '');
  };

  // Save Dimensions Modal
  const saveDimensions = () => {
    if (!activeDimensionItem) return;
    const l = Math.max(0.01, parseFloat(dimLength) || 1);
    const w = Math.max(0.01, parseFloat(dimWidth) || 1);
    const c = Math.max(1, parseFloat(dimCount) || 1);
    const calculatedArea = Number((l * w * c).toFixed(3));

    setCart(prev =>
      prev.map(item => {
        if (item.id === activeDimensionItem.id) {
          return {
            ...item,
            hasDimensions: true,
            length: l,
            width: w,
            count: c,
            quantity: calculatedArea,
            notes: dimNotes
          };
        }
        return item;
      })
    );

    setActiveDimensionItem(null);
    posSound.beep();
  };

  // Cart operations
  const updateQuantity = (id: string, delta: number) => {
    setCart(prev =>
      prev.map(ci => {
        if (ci.id === id) {
          const newQty = Math.max(0.01, ci.quantity + delta);
          return { ...ci, quantity: Number(newQty.toFixed(2)) };
        }
        return ci;
      })
    );
  };

  const updateUnitPrice = (id: string, price: number) => {
    setCart(prev =>
      prev.map(ci => {
        if (ci.id === id) {
          return { ...ci, unitPrice: Math.max(0, price) };
        }
        return ci;
      })
    );
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(ci => ci.id !== id));
  };

  const clearCart = () => {
    if (cart.length > 0 && window.confirm('هل تريد تفريغ سلة الفاتورة الحالية؟')) {
      setCart([]);
      setGlobalDiscount('');
      setPaidAmountInput('');
      setIsPaymentModalOpen(false);
    }
  };

  // -------------------------------------------------------------
  // Shortcuts Toolbar Handlers (تعليق، فواتير معلقة، توصيل، تجميع، إلغاء، حذف)
  // -------------------------------------------------------------
  const handleHoldInvoice = () => {
    if (cart.length === 0) {
      posSound.error();
      alert('لا توجد بنود في الفاتورة لتعليقها.');
      return;
    }
    const newHeld: MobileHeldInvoice = {
      id: `held-${Date.now()}`,
      heldAt: new Date().toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit' }),
      customerName: customerNameInput.trim() || 'زبون نقدي / عام',
      customerId: selectedCustomerId,
      subCustomerId: selectedSubCustomerId,
      customSubCustomerName,
      partyTypeMode,
      cart: [...cart],
      totalAmount: netTotal,
      globalDiscount,
      notes: invoiceNotes
    };

    setHeldInvoices(prev => [newHeld, ...prev]);
    setCart([]);
    setGlobalDiscount('');
    setPaidAmountInput('');
    setInvoiceNotes('');
    setCustomSubCustomerName('');
    setSelectedSubCustomerId('');
    setCustomerNameInput('زبون نقدي / عام');
    setSelectedCustomerId('');
    setPartyTypeMode('walkin');
    setIsPaymentModalOpen(false);
    posSound.beep();
    setSuccessNotification({
      number: 'معلقة',
      total: newHeld.totalAmount
    });
    setTimeout(() => setSuccessNotification(null), 3500);
  };

  const handleResumeHeldInvoice = (held: MobileHeldInvoice) => {
    if (cart.length > 0) {
      if (!window.confirm('توجد بنود في الفاتورة الحالية، هل تريد استبدالها بالفاتورة المعلقة؟')) {
        return;
      }
    }
    setCart(held.cart);
    if (held.customerName) setCustomerNameInput(held.customerName);
    if (held.customerId) setSelectedCustomerId(held.customerId);
    if (held.subCustomerId) setSelectedSubCustomerId(held.subCustomerId);
    if (held.customSubCustomerName) setCustomSubCustomerName(held.customSubCustomerName);
    if (held.partyTypeMode) setPartyTypeMode(held.partyTypeMode);
    if (held.globalDiscount) setGlobalDiscount(held.globalDiscount);
    if (held.notes) setInvoiceNotes(held.notes);

    setHeldInvoices(prev => prev.filter(h => h.id !== held.id));
    setShowHeldModal(false);
    posSound.beep();
  };

  const handleDeleteHeldInvoice = (id: string) => {
    if (window.confirm('هل تريد حذف هذه الفاتورة المعلقة؟')) {
      setHeldInvoices(prev => prev.filter(h => h.id !== id));
      posSound.beep();
    }
  };

  const handleApplyDelivery = (fee: number, notes: string) => {
    const deliveryInventoryItem: InventoryItem = {
      id: 'srv-delivery-mobile',
      code: 'DELIVERY',
      barcode: 'DELIVERY',
      name: 'خدمة توصيل',
      description: 'خدمة توصيل طلبات',
      sellingPrice: fee,
      purchasePrice: fee, // بالتكلفة الأصلية دون مربح
      stockQuantity: 0,   // ليس لها مخزن ولا رصيد
      minAlertQuantity: 0,
      unit: 'خدمة',
      category: 'خدمات'
    };

    setCart(prev => {
      const existingIdx = prev.findIndex(ci => ci.item.id === 'srv-delivery-mobile' || ci.item.name === 'خدمة توصيل');
      if (existingIdx >= 0) {
        const updated = {
          ...prev[existingIdx],
          unitPrice: fee,
          notes: notes || 'خدمة توصيل مباشر'
        };
        const rest = prev.filter((_, idx) => idx !== existingIdx);
        return [updated, ...rest];
      } else {
        const newItem: MobileCartItem = {
          id: `ci-delivery-${Date.now()}`,
          item: deliveryInventoryItem,
          quantity: 1,
          unitPrice: fee,
          discount: 0,
          notes: notes || 'خدمة توصيل مباشر',
          hasDimensions: false,
          length: 1,
          width: 1,
          count: 1
        };
        return [newItem, ...prev];
      }
    });

    setShowDeliveryModal(false);
    posSound.beep();
  };

  const handleRemoveDelivery = () => {
    setCart(prev => prev.filter(ci => ci.item.id !== 'srv-delivery-mobile' && ci.item.name !== 'خدمة توصيل'));
    setShowDeliveryModal(false);
    posSound.beep();
  };

  const handleConsolidateItems = () => {
    if (cart.length <= 1) {
      alert('لا توجد بنود كافية للتجميع.');
      return;
    }
    const map = new Map<string, MobileCartItem>();
    let mergedCount = 0;

    for (const ci of cart) {
      const key = `${ci.item.id}_${ci.unitPrice}_${ci.hasDimensions ? `${ci.length}x${ci.width}` : 'nodim'}_${ci.notes || ''}`;
      if (map.has(key)) {
        const existing = map.get(key)!;
        existing.quantity = Number((existing.quantity + ci.quantity).toFixed(2));
        mergedCount++;
      } else {
        map.set(key, { ...ci });
      }
    }

    if (mergedCount > 0) {
      setCart(Array.from(map.values()));
      posSound.beep();
      alert(`تم تجميع ${mergedCount} بند مكرر بنجاح.`);
    } else {
      alert('الأصناف مجمعة بالفعل، لا يوجد بنود مكررة.');
    }
  };

  const handleCancelInvoice = () => {
    if (cart.length === 0) {
      return;
    }
    if (window.confirm('هل تريد إلغاء الفاتورة بالكامل وتفريغ البنود؟')) {
      setCart([]);
      setGlobalDiscount('');
      setPaidAmountInput('');
      setInvoiceNotes('');
      setCustomerNameInput('زبون نقدي / عام');
      setSelectedCustomerId('');
      setSelectedSubCustomerId('');
      setCustomSubCustomerName('');
      setPartyTypeMode('customer');
      setIsPaymentModalOpen(false);
      posSound.beep();
    }
  };

  const handleDeleteTopItem = () => {
    if (cart.length === 0) {
      alert('الفاتورة فارغة، لا يوجد بنود لحذفها.');
      return;
    }
    const topItem = cart[0];
    if (window.confirm(`حذف آخر بند مضاف: "${topItem.item.name}"؟`)) {
      removeFromCart(topItem.id);
      posSound.beep();
    }
  };

  // Totals calculations
  const subtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
  }, [cart]);

  const totalItemDiscounts = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.discount || 0), 0);
  }, [cart]);

  const parsedGlobalDiscount = Math.max(0, parseFloat(globalDiscount) || 0);
  const totalDiscount = totalItemDiscounts + parsedGlobalDiscount;

  const taxRate = settings.taxRate || 0;
  const taxableAmount = Math.max(0, subtotal - totalDiscount);
  const taxAmount = settings.taxNumber ? Number(((taxableAmount * taxRate) / 100).toFixed(2)) : 0;
  const netTotal = Number((taxableAmount + taxAmount).toFixed(2));

  // Live Effective Paid & Remaining calculations for UI and Validation
  const rawLivePaid = paidAmountInput.trim() !== ''
    ? parseFloat(paidAmountInput)
    : (paymentMethod === 'credit' ? 0 : netTotal);
  const effectivePaid = isNaN(rawLivePaid) ? (paymentMethod === 'credit' ? 0 : netTotal) : Math.max(0, rawLivePaid);
  const effectiveRemaining = Math.max(0, Number((netTotal - effectivePaid).toFixed(2)));

  const isMainCustomerSelected = Boolean(
    selectedCustomerId ||
    (partyTypeMode !== 'customer' && customerNameInput.trim() !== '') ||
    (partyTypeMode === 'customer' && customerNameInput.trim() !== '' && customerNameInput.trim() !== 'زبون نقدي / عام')
  );
  const hasSubCustomerSpecified = Boolean(
    selectedSubCustomerId ||
    customSubCustomerName.trim() !== ''
  );
  const isRemainingAllowed = isMainCustomerSelected || hasSubCustomerSpecified;

  // Handle Checkout & Save (Strict Online-Only Synchronous Posting)
  const handleCheckout = async (autoPrint: boolean = false) => {
    if (cart.length === 0) {
      alert('الرجاء إضافة أصناف إلى الفاتورة أولاً');
      return;
    }

    // Offline checkout is allowed after the durable IndexedDB local save succeeds.

    if (onlineInvoicePostingService.isPostingBusy()) {
      alert('جاري ترحيل فاتورة سابقة حالياً بالتتابع إلى السيرفر... يرجى الانتظار ثوانٍ معدودة لإتمام الترحيل أولاً بأول.');
      return;
    }

    try {
      const rawPaid = paidAmountInput.trim() !== ''
        ? parseFloat(paidAmountInput)
        : (paymentMethod === 'credit' ? 0 : netTotal);
      const paid = isNaN(rawPaid) ? (paymentMethod === 'credit' ? 0 : netTotal) : Math.max(0, rawPaid);
      const remaining = Math.max(0, Number((netTotal - paid).toFixed(2)));

      // If remaining balance exists, validate that it is associated with a specific customer or sub-customer
      if (remaining > 0) {
        const isMainCustomer = Boolean(
          selectedCustomerId ||
          (partyTypeMode !== 'customer' && customerNameInput.trim() !== '') ||
          (partyTypeMode === 'customer' && customerNameInput.trim() !== '' && customerNameInput.trim() !== 'زبون نقدي / عام')
        );
        const hasSubCustomer = Boolean(
          selectedSubCustomerId ||
          customSubCustomerName.trim() !== ''
        );

        if (!isMainCustomer && !hasSubCustomer) {
          alert(
            `خطأ في حفظ الفاتورة:\n\n` +
            `يوجد متبقي على الفاتورة بقيمة ${remaining.toFixed(2)} ${activeCurrency.symbol}.\n\n` +
            `لتسجيل متبقي (ذمة/آجل)، يجب إما:\n` +
            `1) اختيار أو كتابة اسم ${partyTypeMode === 'supplier' ? 'المورد' : partyTypeMode === 'employee' ? 'الموظف' : 'العميل'}.\n` +
            `2) أو كتابة اسم الزبون الفرعي في خانة الاسم الفرعي لتسجيل المديونية عليه.`
          );
          return;
        }
      }

      const itemsPayload = cart.map(ci => ({
        item: ci.item,
        quantity: ci.quantity,
        unitPrice: ci.unitPrice,
        discount: ci.discount,
        notes: ci.hasDimensions
          ? `مقاس: ${ci.length}م × ${ci.width}م (عدد ${ci.count}) | ${ci.notes}`
          : ci.notes
      }));

      let effectiveCustomerName = customerNameInput.trim();
      if (!effectiveCustomerName) {
        effectiveCustomerName = partyTypeMode === 'customer'
          ? 'زبون نقدي / عام'
          : partyTypeMode === 'supplier'
          ? 'مورد عام'
          : 'موظف';
      }

      const subCustName = selectedSubCustomerId
        ? parties.find(p => p.id === selectedSubCustomerId)?.name
        : customSubCustomerName.trim();

      const fullCustomerDisplayName = subCustName
        ? `${effectiveCustomerName} - [فرع/قسم: ${subCustName}]`
        : effectiveCustomerName;

      // Method-specific currency and exchange rate resolution
      const activeCashCurr = currencies.find(c => c.code === cashCurrencyCode) || activeCurrency;
      const activeBankCurr = currencies.find(c => c.code === bankCurrencyCode) || activeCurrency;

      const activePayCurr = paymentMethod === 'card'
        ? activeBankCurr
        : paymentMethod === 'cash'
        ? activeCashCurr
        : (currencies.find(c => c.code === payCurrencyCode) || activeCurrency);

      const effectivePayExchangeRate = paymentMethod === 'card'
        ? bankExchangeRate
        : paymentMethod === 'cash'
        ? cashExchangeRate
        : payExchangeRate;

      const effectiveTreasuryCode = paymentMethod === 'card'
        ? (selectedBankTreasuryCode || '1102')
        : (selectedCashTreasuryCode || '1101');

      onlineInvoicePostingService.stageInvoiceDraft({
        cart,
        customerNameInput,
        selectedCustomerId,
        timestamp: Date.now()
      });

      const postRes = await postPosSaleOnline(
        itemsPayload,
        fullCustomerDisplayName,
        paymentMethod,
        selectedCustomerId || undefined,
        invoiceNotes.trim() || `فاتورة كاشير هاتف - ${paymentMethod === 'cash' ? 'نقداً' : paymentMethod === 'card' ? 'شبكة/بنك' : 'آجل'}`,
        {
          taxRate: taxRate,
          paidAmount: paid,
          currency: activePayCurr.code,
          currencySymbol: activePayCurr.symbol,
          exchangeRate: effectivePayExchangeRate,
          treasuryAccountCode: effectiveTreasuryCode,
          cashPaidAmount: paymentMethod === 'cash' || paymentMethod === 'credit' ? paid : 0,
          cashTreasuryCode: selectedCashTreasuryCode || '1101',
          cashCurrency: activeCashCurr.code,
          cashExchangeRate: cashExchangeRate,
          bankPaidAmount: paymentMethod === 'card' ? paid : 0,
          bankTreasuryCode: selectedBankTreasuryCode || '1102',
          bankCurrency: activeBankCurr.code,
          bankExchangeRate: bankExchangeRate,
          branchId: activeBranchId,
          counterpartyType: partyTypeMode,
          counterpartyId: selectedCustomerId || undefined,
          subCustomerId: selectedSubCustomerId && !isInvoiceOnlySubCustomer({id: selectedSubCustomerId}) ? selectedSubCustomerId : undefined,
          subCustomerName: subCustName || undefined,
          customCustomerText: subCustName || undefined,
          userId: currentUserId,
          userName: currentUser?.fullName || currentUser?.username || 'كاشير الهاتف',
          notes: invoiceNotes.trim()
        }
      );

      if (!postRes.success || !postRes.invoice) {
        alert(`تعذر الترحيل السحابي للفاتورة: ${postRes.error || 'خطأ غير معروف'}\nكافة الأصناف والمدخلات محفوظة في السلة.`);
        return;
      }

      const createdInvoice = postRes.invoice;
      // A walk-in sub-customer is recorded under the permanent main customer
      // only after this invoice has been durably accepted.
      if (partyTypeMode === 'customer' && selectedCustomerId && subCustName) {
        const parent = parties.find(p => p.id === selectedCustomerId && !p.isSubCustomer);
        const walkInName = cleanSubCustomerName(subCustName);
        if (parent && walkInName && !registeredSubCustomer(parties, parent.id, walkInName)) {
          try {
            addParty({
              type: 'customer', name: walkInName,
              isSubCustomer: true, parentPartyId: parent.id,
              openingBalance: 0, initialBalance: 0
            });
          } catch (error) {
            // The accounting invoice remains saved; read-only history lookup
            // will still group it by its name and parent.
            console.warn('Mobile walk-in registration pending:', error);
          }
        }
      }
      onlineInvoicePostingService.clearStagedInvoiceDraft();

      setSuccessNotification({
        number: createdInvoice.invoiceNumber,
        total: netTotal
      });

      if (autoPrint) {
        setSelectedInvoiceForPrint(createdInvoice);
        setDirectPrintOptions({ format: 'thermal', autoPrint: true });
      }

      // Reset
      try {
        localStorage.removeItem(MOBILE_POS_DRAFT_KEY);
      } catch {}
      setCart([]);
      setGlobalDiscount('');
      setPaidAmountInput('');
      setCustomSubCustomerName('');
      setSelectedSubCustomerId('');
      setInvoiceNotes('');
      setIsPaymentModalOpen(false);

      posSound.beep();
      if (typeof navigator !== 'undefined' && navigator.vibrate) {
        navigator.vibrate([40, 60, 40]);
      }

      setTimeout(() => {
        setSuccessNotification(null);
      }, 5000);
    } catch (e) {
      console.error('Error in mobile checkout:', e);
      alert('حدث خطأ أثناء حفظ الفاتورة');
    }
  };

  React.useEffect(() => {
    const result = peekMasterResult();
    if (!result) return;
    if (result.kind === 'employee') {
      const employee = employees.find(e => e.id === result.id);
      if (!employee) return;
      consumeMasterResult();
      setPartyTypeMode('employee');
      setSelectedCustomerId(employee.id);
      setCustomerNameInput(employee.name);
      return;
    }
    if (result.kind === 'item') {
      const item = inventory.find(i => i.id === result.id);
      if (!item) return;
      consumeMasterResult();
      // Item add remains an explicit cart action on mobile, not a hidden
      // creation of stock quantity or financial lines.
      setSearchBarcodeQuery(item.barcode || item.code || item.name);
      return;
    }
    const party = parties.find(p => p.id === result.id);
    if (!party) return;
    consumeMasterResult();
    if (result.isSubCustomer) {
      setSelectedSubCustomerId(party.id);
      setCustomSubCustomerName(party.name);
      return;
    }
    setPartyTypeMode(result.kind === 'supplier' ? 'supplier' : 'customer');
    setSelectedCustomerId(party.id);
    setCustomerNameInput(party.name);
  }, [parties, employees, inventory]);

  return (
    <div className="flex flex-col h-full bg-[#f1f5f9] w-full overflow-hidden text-slate-800 selection:bg-blue-500 selection:text-white" dir="rtl">
      {/* ========================================================================= */}
      {/* TOP HEADER: Shortcuts Toolbar (تعليق، المعلقة، توصيل، تجميع، إلغاء، حذف، العملة) */}
      {/* ========================================================================= */}
      <div className="bg-[#0f172a] text-white px-2 py-1 shadow-md shrink-0 border-b border-slate-800">
        <div className="flex items-center justify-between gap-1.5 w-full">
          {/* Action buttons in 2 compact rows without any scrollbar */}
          <div className="flex items-center gap-1 flex-1 min-w-0">
            {/* زر الرجوع للرئيسية */}
            <button
              onClick={() => setActiveTab('home')}
              className="h-[52px] px-2 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-white active:scale-95 transition-all flex items-center justify-center shrink-0 border border-slate-700/80"
              title="الرئيسية"
            >
              <ArrowRight className="w-4 h-4" />
            </button>

            {/* شبكة الأزرار على سطرين متجانبين */}
            <div className="grid grid-rows-2 grid-flow-col auto-cols-fr gap-1 flex-1 min-w-0">
              {/* Row 1, Col 1: تعليق الفاتورة */}
              <button
                type="button"
                onClick={handleHoldInvoice}
                className="h-[25px] px-1.5 rounded-md bg-slate-800 hover:bg-amber-500/20 text-amber-400 border border-slate-700 hover:border-amber-500/50 flex items-center justify-center gap-1 text-[10px] font-bold active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                title="تعليق الفاتورة الحالية"
              >
                <PauseCircle className="w-3 h-3 text-amber-400 shrink-0" />
                <span>تعليق</span>
              </button>

              {/* Row 2, Col 1: الفواتير المعلقة */}
              <button
                type="button"
                onClick={() => setShowHeldModal(true)}
                className="h-[25px] px-1.5 rounded-md bg-slate-800 hover:bg-blue-500/20 text-blue-400 border border-slate-700 hover:border-blue-500/50 flex items-center justify-center gap-1 text-[10px] font-bold active:scale-95 transition-all relative cursor-pointer whitespace-nowrap"
                title="الفواتير المعلقة"
              >
                <History className="w-3 h-3 text-blue-400 shrink-0" />
                <span>المعلقة</span>
                {heldInvoices.length > 0 && (
                  <span className="bg-blue-500 text-white font-mono text-[8px] font-black rounded-full px-1 py-0 leading-tight">
                    {heldInvoices.length}
                  </span>
                )}
              </button>

              {/* Row 1, Col 2: خدمة التوصيل */}
              <button
                type="button"
                onClick={() => setShowDeliveryModal(true)}
                className="h-[25px] px-1.5 rounded-md bg-slate-800 hover:bg-emerald-500/20 text-emerald-400 border border-slate-700 hover:border-emerald-500/50 flex items-center justify-center gap-1 text-[10px] font-bold active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                title="خدمة التوصيل"
              >
                <Truck className="w-3 h-3 text-emerald-400 shrink-0" />
                <span>توصيل</span>
              </button>

              {/* Row 2, Col 2: زر تجميع الأصناف */}
              <button
                type="button"
                onClick={handleConsolidateItems}
                className="h-[25px] px-1.5 rounded-md bg-slate-800 hover:bg-purple-500/20 text-purple-400 border border-slate-700 hover:border-purple-500/50 flex items-center justify-center gap-1 text-[10px] font-bold active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                title="تجميع الأصناف المتشابهة"
              >
                <Layers className="w-3 h-3 text-purple-400 shrink-0" />
                <span>تجميع</span>
              </button>

              {/* Row 1, Col 3: زر إلغاء */}
              <button
                type="button"
                onClick={handleCancelInvoice}
                className="h-[25px] px-1.5 rounded-md bg-slate-800 hover:bg-orange-500/20 text-orange-400 border border-slate-700 hover:border-orange-500/50 flex items-center justify-center gap-1 text-[10px] font-bold active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                title="إلغاء الفاتورة وتفريغ السلة"
              >
                <RotateCcw className="w-3 h-3 text-orange-400 shrink-0" />
                <span>إلغاء</span>
              </button>

              {/* Row 2, Col 3: زر حذف */}
              <button
                type="button"
                onClick={handleDeleteTopItem}
                className="h-[25px] px-1.5 rounded-md bg-slate-800 hover:bg-rose-500/20 text-rose-400 border border-slate-700 hover:border-rose-500/50 flex items-center justify-center gap-1 text-[10px] font-bold active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                title="حذف آخر صنف مضاف"
              >
                <Trash2 className="w-3 h-3 text-rose-400 shrink-0" />
                <span>حذف</span>
              </button>
            </div>
          </div>

          {/* Left side: Currency Button & Exchange Rate Input & Desktop switch */}
          <div className="flex flex-col gap-1 shrink-0">
            {/* Row 1: Currency Button + Desktop switch */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowCurrencyModal(true)}
                className="h-[25px] px-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 flex items-center gap-1 text-[10px] font-bold active:scale-95 transition-all cursor-pointer whitespace-nowrap"
                title="اختيار العملة"
              >
                <Coins className="w-3 h-3 text-amber-400 shrink-0" />
                <span>العملة ({activeCurrency.symbol})</span>
              </button>

              {onSwitchToDesktop && (
                <button
                  onClick={onSwitchToDesktop}
                  className="h-[25px] w-[25px] rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 flex items-center justify-center active:scale-95 transition-all shrink-0"
                  title="عرض مكتبي"
                >
                  <Monitor className="w-3 h-3 text-blue-400" />
                </button>
              )}
            </div>

            {/* Row 2: Exchange Rate Input (خانة كتابة وتحديد سعر الصرف) */}
            <div className="h-[25px] bg-slate-800/90 border border-slate-700 rounded-md px-1.5 flex items-center justify-between gap-1 shadow-xs">
              <span className="text-[9px] font-bold text-amber-400/90 shrink-0 select-none">سعر الصرف:</span>
              <input
                type="number"
                step="any"
                min="0.0001"
                value={payExchangeRate}
                onChange={(e) => {
                  const val = Math.max(0.0001, parseFloat(e.target.value) || 1.0);
                  setPayExchangeRate(val);
                }}
                className="w-14 text-center text-[10px] font-mono font-black text-white bg-slate-900/80 border border-slate-600/80 rounded px-0.5 py-0.5 focus:border-amber-400 focus:bg-slate-950 outline-none transition-colors"
                title="تحديد سعر صرف العملة المعتمد في الفاتورة"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Success Notification Banner */}
      {successNotification && (
        <div className="bg-emerald-600 text-white p-2.5 px-4 flex items-center justify-between text-xs font-bold animate-in slide-in-from-top duration-200 shrink-0 shadow-md">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4" />
            <span>تم حفظ الفاتورة #{successNotification.number} بنجاح ({successNotification.total.toFixed(2)} {activeCurrency.symbol})</span>
          </div>
          <button onClick={() => setSuccessNotification(null)} className="p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MAIN CASHIER BODY (Scrollable Layout ordered as requested)                 */}
      {/* 1. اسم الزبون                                                             */}
      {/* 2. تحته الزبون الفرعي                                                    */}
      {/* 3. تحته البحث بالباركود أو الصنف وزر الكاميرا                            */}
      {/* 4. تحت الفاتورة وقائمة الأصناف مع المقاسات والملاحظات                     */}
      {/* 5. تحت تدرج آلية الدفع كاملة                                              */}
      {/* ========================================================================= */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2.5 space-y-2.5">
        {/* ========================================================================= */}
        {/* 1. اسم العميل والاسم الفرعي وزر التبديل (عميل / مورد / زبون)              */}
        {/* ========================================================================= */}
        <div className="bg-white p-2.5 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          {/* Main Customer Name Input with Toggle Button */}
          <div className="flex items-center gap-1.5">
            {/* Toggle Button: زبون ⇆ مورد ⇆ موظف */}
            <button
              type="button"
              onClick={() => {
                setPartyTypeMode(prev => {
                  let next: 'customer' | 'supplier' | 'employee' = 'customer';
                  if (prev === 'customer') next = 'supplier';
                  else if (prev === 'supplier') next = 'employee';
                  else next = 'customer';

                  if (next === 'customer') {
                    setCustomerNameInput('زبون نقدي / عام');
                  } else {
                    if (customerNameInput === 'زبون نقدي / عام') {
                      setCustomerNameInput('');
                    }
                  }
                  setSelectedCustomerId('');
                  setSelectedSubCustomerId('');
                  setShowPartySuggestions(false);
                  posSound.beep();
                  return next;
                });
              }}
              className={`h-9 px-3 rounded-full border-2 font-extrabold text-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer shadow-xs active:scale-95 ${
                partyTypeMode === 'customer'
                  ? 'bg-amber-50/80 text-amber-900 border-amber-400 hover:bg-amber-100'
                  : partyTypeMode === 'supplier'
                  ? 'bg-purple-50/80 text-purple-900 border-purple-400 hover:bg-purple-100'
                  : 'bg-teal-50/80 text-teal-900 border-teal-400 hover:bg-teal-100'
              }`}
              title="اضغط للتبديل: زبون ⇆ مورد ⇆ موظف"
            >
              <span className="text-[13px]">
                {partyTypeMode === 'customer' ? 'زبون' : partyTypeMode === 'supplier' ? 'مورد' : 'موظف'}
              </span>
              <ArrowLeftRight className="w-3.5 h-3.5 opacity-80 shrink-0" />
            </button>

            {/* Customer / Supplier / Employee Name Input with live search/suggestions */}
            <div className="relative flex-1">
              <div className="flex items-center">
                <input
                  type="text"
                  value={customerNameInput}
                  onChange={(e) => {
                    setCustomerNameInput(e.target.value);
                    setSelectedCustomerId('');
                    setShowPartySuggestions(true);
                  }}
                  onFocus={() => setShowPartySuggestions(true)}
                  placeholder={
                    partyTypeMode === 'customer'
                      ? 'اسم الزبون (افتراضي: زبون نقدي)...'
                      : partyTypeMode === 'supplier'
                      ? 'أدخل أو ابحث عن اسم المورد...'
                      : 'أدخل أو ابحث عن اسم الموظف...'
                  }
                  className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none transition-colors"
                />
                {customerNameInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerNameInput(partyTypeMode === 'customer' ? 'زبون نقدي / عام' : '');
                      setSelectedCustomerId('');
                      setSelectedSubCustomerId('');
                      setShowPartySuggestions(false);
                    }}
                    className="absolute left-2 text-slate-400 hover:text-slate-600 p-1"
                    title={partyTypeMode === 'customer' ? 'إعادة تعيين للزبون العام' : 'مسح خانة البحث'}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Suggestions Dropdown (Filtered by Party Type) */}
              {showPartySuggestions && matchingParties.length > 0 && (
                <div className="absolute top-full right-0 left-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-52 overflow-y-auto divide-y divide-slate-100">
                  <div className="px-3 py-1 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[10px] text-slate-500 font-bold sticky top-0">
                    <span>
                      {partyTypeMode === 'customer' ? 'الزبائن والعملاء' : partyTypeMode === 'supplier' ? 'الموردين' : 'الموظفين'}
                    </span>
                    <span className="font-mono text-slate-400">{matchingParties.length} نتيجة</span>
                  </div>
                  {matchingParties.map((item: any, idx: number) => {
                    if (partyTypeMode === 'employee') {
                      return (
                        <button
                          key={`mob-emp-sug-${item.id || idx}-${idx}`}
                          type="button"
                          onClick={() => {
                            setCustomerNameInput(item.name);
                            setSelectedCustomerId(item.id);
                            setSelectedSubCustomerId('');
                            setShowPartySuggestions(false);
                            posSound.beep();
                          }}
                          className="w-full text-right px-3 py-2 text-xs font-bold hover:bg-teal-50 flex items-center justify-between transition-colors cursor-pointer"
                        >
                          <div className="flex flex-col text-right">
                            <span className="text-slate-800 font-extrabold">{item.name}</span>
                            <span className="text-[10px] text-slate-500 font-normal">
                              {item.jobTitle || 'موظف'} {item.department ? `• قسم: ${item.department}` : ''} {item.phone ? `• هاتف: ${item.phone}` : ''}
                            </span>
                          </div>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold bg-teal-50 text-teal-700 border border-teal-200 shrink-0">
                            {item.code || 'موظف'}
                          </span>
                        </button>
                      );
                    }

                    // Customer or Supplier
                    return (
                      <button
                        key={`mob-cust-sug-${item.id || idx}-${idx}`}
                        type="button"
                        onClick={() => {
                          setCustomerNameInput(item.name);
                          setSelectedCustomerId(item.id);
                          setSelectedSubCustomerId('');
                          setShowPartySuggestions(false);
                          posSound.beep();
                        }}
                        className={`w-full text-right px-3 py-2 text-xs font-bold flex items-center justify-between transition-colors cursor-pointer ${
                          partyTypeMode === 'supplier' ? 'hover:bg-purple-50' : 'hover:bg-blue-50'
                        }`}
                      >
                        <div className="flex flex-col text-right">
                          <span className="text-slate-800 font-extrabold">{item.name}</span>
                          <span className="text-[10px] text-slate-500 font-normal">
                            {item.phone ? `هاتف: ${item.phone}` : ''} {item.code ? `• كود: ${item.code}` : ''}
                          </span>
                        </div>
                        {item.balance !== undefined && item.balance !== 0 ? (
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold shrink-0 ${
                            item.balance > 0 ? 'bg-rose-50 text-rose-700 border border-rose-200' : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {item.balance.toFixed(2)} {activeCurrency.symbol}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 shrink-0">
                            {partyTypeMode === 'supplier' ? 'مورد' : 'عميل'}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Sub-Customer / Department Name Input (Shown for Customers) */}
          {partyTypeMode === 'customer' && (
            <div className="flex items-center gap-1.5 pt-1 border-t border-slate-100">
              <span className="text-[11px] font-bold text-slate-400 shrink-0 px-1">الاسم الفرعي:</span>
              {subCustomersForCustomer.length > 0 && (
                <select
                  value={selectedSubCustomerId}
                  onChange={(e) => {
                    const match = subCustomersForCustomer.find(p => p.id === e.target.value);
                    setSelectedSubCustomerId(match && !isInvoiceOnlySubCustomer(match) ? match.id : '');
                    setCustomSubCustomerName(match?.name || '');
                  }}
                  className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- اختياري: اختر الفرع أو الجهة التابعة --</option>
                  {subCustomersForCustomer.map(sub => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name} {sub.phone ? `(${sub.phone})` : ''}
                    </option>
                  ))}
                </select>
              )}
                <input
                  type="text"
                  placeholder="الاسم الفرعي / القسم / المستلم (اختياري)..."
                  value={customSubCustomerName}
                  onChange={(e) => {setCustomSubCustomerName(e.target.value);setSelectedSubCustomerId('');}}
                  className="flex-1 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none transition-colors"
                />
              {(selectedSubCustomerId || customSubCustomerName) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedSubCustomerId('');
                    setCustomSubCustomerName('');
                  }}
                  className="p-1.5 text-slate-400 hover:text-rose-500 rounded-lg shrink-0"
                  title="مسح الاسم الفرعي"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 3. دمج البحث والباركود في خانة واحدة ذكية ومضغوطة للشاشة                  */}
        {/* ========================================================================= */}
        <div className="bg-white p-2 rounded-2xl border border-blue-200 shadow-xs space-y-1.5">
          {/* Matched item indicator (if barcode/code recognized) */}
          {matchedItem && (
            <div className="flex items-center justify-between bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-xl text-xs font-bold text-emerald-800 animate-in fade-in">
              <span className="truncate flex-1">الصنف: {matchedItem.name}</span>
              <span className="font-mono text-emerald-700 mr-2 shrink-0 flex items-center gap-1">
                {(() => {
                  const prcInfo = getItemPriceForCustomer(matchedItem, selectedCustomerId);
                  return (
                    <>
                      {prcInfo.isSpecialPrice && <span className="text-[10px] text-amber-600 font-bold">★ سعر خاص:</span>}
                      <span>{(prcInfo.price || 0).toFixed(2)} {activeCurrency.symbol}</span>
                    </>
                  );
                })()}
              </span>
            </div>
          )}

          {/* Unified Barcode/Search, Qty, Price, Add Button Row */}
          <div className="grid grid-cols-12 gap-1.5 items-end">
            {/* Unified Search / Barcode Input with Camera + Search/Barcode icons */}
            <div className="col-span-5 relative">
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5">البحث أو الباركود:</label>
              <div className="relative">
                <input
                  ref={barcodeInputRef}
                  type="text"
                  value={searchBarcodeQuery}
                  onChange={e => setSearchBarcodeQuery(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleDirectAdd();
                    }
                  }}
                  placeholder="اسم أو باركود..."
                  className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 rounded-xl pr-2 pl-7 py-1.5 text-xs font-bold text-slate-900 shadow-inner focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setIsCameraModalOpen(true)}
                  className="absolute left-1 top-1/2 -translate-y-1/2 p-1 text-blue-600 hover:bg-blue-100 rounded-lg cursor-pointer"
                  title="مسح بالكاميرا"
                >
                  <Camera className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Quantity */}
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5 text-center">الكمية:</label>
              <input
                type="number"
                min="0.01"
                step="any"
                value={essentialQty}
                onChange={e => setEssentialQty(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleDirectAdd();
                  }
                }}
                className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 rounded-xl py-1.5 px-1 text-xs font-mono font-black text-center text-slate-900 shadow-inner focus:outline-none"
              />
            </div>

            {/* Price */}
            <div className="col-span-3">
              <label className="block text-[10px] font-bold text-slate-500 mb-0.5 text-center">السعر:</label>
              <input
                type="number"
                step="any"
                value={essentialPrice}
                onChange={e => setEssentialPrice(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleDirectAdd();
                  }
                }}
                placeholder="0.00"
                className="w-full bg-slate-50 border border-slate-300 focus:border-blue-500 rounded-xl py-1.5 px-1 text-xs font-mono font-black text-center text-slate-900 shadow-inner focus:outline-none"
              />
            </div>

            {/* Add Button */}
            <div className="col-span-2">
              <button
                type="button"
                onClick={() => handleDirectAdd()}
                className="w-full h-[33px] bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1 shadow-sm transition-all cursor-pointer"
                title="إضافة الصنف"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>إضافة</span>
              </button>
            </div>
          </div>

          {/* Search suggestions dropdown when typing */}
          {searchBarcodeQuery.trim() && !matchedItem && filteredItems.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1 divide-y divide-slate-100 bg-slate-50 rounded-xl p-1 border border-blue-200 shadow-md">
              {filteredItems.map((item, idx) => (
                <div
                  key={`mob-bc-item-${item.id || idx}-${idx}`}
                  onClick={() => {
                    handleDirectAdd(item);
                  }}
                  className="p-1.5 flex items-center justify-between text-xs hover:bg-blue-100/70 rounded-lg cursor-pointer transition-colors"
                >
                  <div className="min-w-0 flex-1">
                    <span className="font-bold text-slate-800 block truncate">{item.name}</span>
                    <span className="text-[10px] text-slate-400 font-mono">#{item.code || item.barcode || '—'}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold font-mono text-blue-600 text-xs flex items-center gap-1">
                      {(() => {
                        const pInfo = getItemPriceForCustomer(item, selectedCustomerId);
                        return (
                          <>
                            {pInfo.isSpecialPrice && <span className="text-[10px] text-amber-600 font-bold" title="سعر خاص للعميل">★</span>}
                            <span>{(pInfo.price || 0).toFixed(2)} {activeCurrency.symbol}</span>
                          </>
                        );
                      })()}
                    </span>
                    <div className="w-5 h-5 rounded bg-emerald-600 text-white flex items-center justify-center">
                      <Plus className="w-3 h-3" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {barcodeAlertMsg && (
            <div className="text-xs font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{barcodeAlertMsg}</span>
            </div>
          )}
        </div>

        {/* ========================================================================= */}
        {/* 4. الفاتورة وقائمة الأصناف مع المقاسات والملاحظات                          */}
        {/* ========================================================================= */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Cart items list - sequential index and newest item always on top */}
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {cart.map((ci, index) => {
              const lineTotal = ci.quantity * ci.unitPrice - (ci.discount || 0);
              const isNameLong = ci.item.name.length > 22;
              return (
                <div key={ci.id} className="px-2.5 py-1.5 space-y-1 hover:bg-slate-50/80 transition-colors">
                  {/* Top: Sequential number + Name & Line Total */}
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5 flex-1 min-w-0">
                      <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-slate-100 text-slate-700 font-mono text-[10px] font-black border border-slate-200 shrink-0">
                        #{index + 1}
                      </span>
                      <span
                        className={`font-bold text-slate-900 truncate block flex-1 ${isNameLong ? 'text-[11px]' : 'text-xs'}`}
                        title={ci.item.name}
                      >
                        {ci.item.name}
                      </span>
                    </div>
                    <span className="text-xs font-black font-mono text-emerald-600 shrink-0">
                      {lineTotal.toFixed(2)} {activeCurrency.symbol}
                    </span>
                  </div>

                  {/* Micro-badge for dimensions & notes if present */}
                  {(ci.hasDimensions || ci.notes) && (
                    <div className="bg-amber-50 text-amber-900 text-[9px] font-bold px-1.5 py-0.5 rounded border border-amber-200/80 flex items-center gap-1 truncate max-w-full">
                      <Ruler className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                      <span className="truncate">
                        {ci.hasDimensions ? `${ci.length}م × ${ci.width}م (${ci.count}ق = ${ci.quantity}م²)` : ''}
                        {ci.notes ? ` • ${ci.notes}` : ''}
                      </span>
                    </div>
                  )}

                  {/* Bottom: Price Input (Editable!) + Stepper + Dimensions + Delete */}
                  <div className="flex items-center justify-between gap-1 pt-0.5">
                    {/* Price Input (Directly editable on mobile!) */}
                    {(() => {
                      const isSpecial = getItemPriceForCustomer(ci.item, selectedCustomerId).isSpecialPrice;
                      return (
                        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border shrink-0 ${isSpecial ? 'bg-amber-100/80 border-amber-300 font-bold' : 'bg-slate-100 border-slate-200'}`} title={isSpecial ? 'سعر خاص معتمد لهذا العميل' : undefined}>
                          <span className={`text-[10px] font-bold ${isSpecial ? 'text-amber-800' : 'text-slate-500'}`}>
                            {isSpecial ? '★ خاص:' : 'السعر:'}
                          </span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={ci.unitPrice}
                            onChange={(e) => updateUnitPrice(ci.id, parseFloat(e.target.value) || 0)}
                            className="w-14 text-center text-xs font-mono font-bold bg-white border border-slate-300 rounded px-1 py-0.5 text-slate-900 focus:outline-none focus:border-blue-500"
                            title="تعديل سعر الصنف"
                          />
                        </div>
                      );
                    })()}

                    {/* Stepper (Quantity) */}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateQuantity(ci.id, -1)}
                        className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold active:scale-95 text-xs"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <input
                        type="number"
                        step="any"
                        value={ci.quantity}
                        onChange={(e) => {
                          const val = Math.max(0.01, parseFloat(e.target.value) || 1);
                          setCart(prev => prev.map(item => item.id === ci.id ? { ...item, quantity: val } : item));
                        }}
                        className="w-10 text-center text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded py-0.5"
                      />
                      <button
                        type="button"
                        onClick={() => updateQuantity(ci.id, 1)}
                        className="w-6 h-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold active:scale-95 text-xs"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>

                    {/* Dimensions & Trash */}
                    <div className="flex items-center gap-1 shrink-0">
                      {isSquareMeterUnit(ci.item.unit, ci.item.unitCalculationType) && (
                        <button
                          type="button"
                          onClick={() => openDimensionsModal(ci)}
                          className={`p-1 rounded-md text-[10px] font-bold flex items-center gap-0.5 border transition-colors cursor-pointer ${
                            ci.hasDimensions || ci.notes
                              ? 'bg-amber-100 border-amber-300 text-amber-800'
                              : 'bg-slate-100 border-slate-200 text-slate-600 hover:bg-slate-200'
                          }`}
                          title="المقاسات والملاحظات"
                        >
                          <Ruler className="w-3 h-3 text-amber-600" />
                          <span className="text-[9px] hidden min-[360px]:inline">مقاس</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => removeFromCart(ci.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                        title="حذف الصنف"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}

            {cart.length === 0 && (
              <div className="text-center py-8 text-slate-400">
                <ShoppingCart className="w-8 h-8 mx-auto mb-1.5 opacity-30 text-slate-500" />
                <p className="text-xs font-bold text-slate-600">الفاتورة فارغة</p>
                <p className="text-[11px] text-slate-400 mt-0.5">امسح الباركود أو ابحث عن الأصناف لإضافتها</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* BOTTOM BAR: Quick Summary & Open Payment Modal Button                     */}
      {/* ========================================================================= */}
      {cart.length > 0 && (
        <div className="bg-white border-t border-slate-200 p-2 px-3 shadow-lg flex items-center justify-between gap-3 shrink-0 z-20">
          <div className="flex flex-col min-w-0">
            <span className="text-[11px] font-bold text-slate-500 truncate">
              {cart.length} صنف • الإجمالي:
            </span>
            <span className="text-base font-black text-blue-700 font-mono">
              {netTotal.toFixed(2)} {activeCurrency.symbol}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsPaymentModalOpen(true)}
            className="flex-1 max-w-[220px] bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-black py-2.5 px-3 rounded-xl text-xs flex items-center justify-center gap-2 shadow-md transition-all cursor-pointer"
          >
            <CreditCard className="w-4 h-4" />
            <span>الدفع وإنهاء الفاتورة</span>
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Payment & Final Checkout (شاشة الدفع وإنهاء الفاتورة)             */}
      {/* ========================================================================= */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-xs flex flex-col justify-end animate-in fade-in">
          <div className="bg-white rounded-t-3xl p-3.5 space-y-2.5 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200 shadow-2xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900">شاشة الدفع وإنهاء الفاتورة</h3>
                  <p className="text-[10px] text-slate-500 font-mono">
                    {cart.length} صنف • الصافي المطلوب: {netTotal.toFixed(2)} {activeCurrency.symbol}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1.5 rounded-lg bg-slate-100 text-slate-400 hover:text-slate-600 active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Payment Method Selector (Compact 3 buttons) */}
            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setPaymentMethod('cash')}
                className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  paymentMethod === 'cash'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>نقدي</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('card')}
                className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  paymentMethod === 'card'
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>شبكة/بنك</span>
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod('credit')}
                className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                  paymentMethod === 'credit'
                    ? 'bg-rose-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>آجل (ذمم)</span>
              </button>
            </div>

            {/* Cash Payment Details: Currency, Exchange Rate & Treasury */}
            {paymentMethod === 'cash' && (
              <div className="bg-emerald-50/80 border border-emerald-200 rounded-xl p-2 space-y-2 animate-in fade-in">
                {/* Currency & Exchange Rate Row for Cash */}
                <div className="flex items-center justify-between gap-2 bg-white/90 p-1.5 rounded-lg border border-emerald-200">
                  <span className="text-[11px] font-bold text-emerald-950 flex items-center gap-1 shrink-0">
                    <Coins className="w-3.5 h-3.5 text-emerald-600" />
                    <span>عملة النقد:</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={cashCurrencyCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        setCashCurrencyCode(code);
                        const curr = currencies.find(c => c.code === code);
                        setCashExchangeRate(code === 'ILS' ? 1.0 : curr?.rateAgainstBase || 1.0);
                      }}
                      className="bg-emerald-50 text-[11px] font-bold text-emerald-950 px-2 py-1 rounded border border-emerald-300 focus:outline-none cursor-pointer"
                      title="عملة الدفع النقدي"
                    >
                      {currencies.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.name || c.code} ({c.symbol})
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-emerald-300" title="سعر صرف العملة النقدية">
                      <span className="text-[9px] text-slate-500 font-bold">صرف:</span>
                      <input
                        type="number"
                        step="any"
                        min="0.0001"
                        disabled={cashCurrencyCode === 'ILS'}
                        value={cashCurrencyCode === 'ILS' ? 1 : cashExchangeRate}
                        onChange={(e) => setCashExchangeRate(Math.max(0.0001, parseFloat(e.target.value) || 1.0))}
                        className={`w-12 text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 ${
                          cashCurrencyCode === 'ILS' ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'bg-white text-slate-900'
                        }`}
                        title="سعر صرف العملة النقدية لتحديد القيمة بالشيكل"
                      />
                    </div>
                  </div>
                </div>

                {/* Cash Treasury Selector (إذا وجد أكثر من صندوق نقدي) */}
                {cashTreasuries.length > 1 && (
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-emerald-900 flex items-center gap-1">
                      <span>صندوق النقدية للإيداع:</span>
                    </label>
                    <select
                      value={selectedCashTreasuryCode}
                      onChange={(e) => setSelectedCashTreasuryCode(e.target.value)}
                      className="w-full bg-white border border-emerald-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:border-emerald-500"
                    >
                      {cashTreasuries.map(c => (
                        <option key={c.accountCode || c.id} value={c.accountCode}>
                          {c.name} ({c.accountCode})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Bank/Card Payment Details: Currency, Exchange Rate & Bank Account / Treasury Dropdown */}
            {paymentMethod === 'card' && (
              <div className="bg-blue-50/80 border border-blue-200 rounded-xl p-2 space-y-2 animate-in fade-in">
                {/* Currency & Exchange Rate Row for Bank/Card */}
                <div className="flex items-center justify-between gap-2 bg-white/90 p-1.5 rounded-lg border border-blue-200">
                  <span className="text-[11px] font-bold text-blue-950 flex items-center gap-1 shrink-0">
                    <Coins className="w-3.5 h-3.5 text-blue-600" />
                    <span>عملة البنك:</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <select
                      value={bankCurrencyCode}
                      onChange={(e) => {
                        const code = e.target.value;
                        setBankCurrencyCode(code);
                        const curr = currencies.find(c => c.code === code);
                        setBankExchangeRate(code === 'ILS' ? 1.0 : curr?.rateAgainstBase || 1.0);
                      }}
                      className="bg-blue-50 text-[11px] font-bold text-blue-950 px-2 py-1 rounded border border-blue-300 focus:outline-none cursor-pointer"
                      title="عملة الدفع البنكي / الشبكة"
                    >
                      {currencies.map(c => (
                        <option key={c.code} value={c.code}>
                          {c.name || c.code} ({c.symbol})
                        </option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1 bg-white px-1.5 py-0.5 rounded border border-blue-300" title="سعر صرف العملة البنكية">
                      <span className="text-[9px] text-slate-500 font-bold">صرف:</span>
                      <input
                        type="number"
                        step="any"
                        min="0.0001"
                        disabled={bankCurrencyCode === 'ILS'}
                        value={bankCurrencyCode === 'ILS' ? 1 : bankExchangeRate}
                        onChange={(e) => setBankExchangeRate(Math.max(0.0001, parseFloat(e.target.value) || 1.0))}
                        className={`w-12 text-center text-[11px] font-mono font-bold rounded px-0.5 py-0.5 ${
                          bankCurrencyCode === 'ILS' ? 'opacity-60 cursor-not-allowed bg-slate-100' : 'bg-white text-slate-900'
                        }`}
                        title="سعر صرف العملة البنكية لتحديد القيمة بالشيكل"
                      />
                    </div>
                  </div>
                </div>

                {/* Bank Account / Treasury Dropdown */}
                <div className="space-y-1">
                  <label className="block text-[10px] font-bold text-blue-900 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>الصندوق أو الحساب البنكي المسجل:</span>
                  </label>
                  {bankTreasuries.length > 0 ? (
                    <select
                      value={selectedBankTreasuryCode}
                      onChange={(e) => setSelectedBankTreasuryCode(e.target.value)}
                      className="w-full bg-white border border-blue-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                    >
                      {bankTreasuries.map(b => (
                        <option key={b.accountCode || b.id} value={b.accountCode}>
                          {b.name} ({b.accountCode})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      value={selectedBankTreasuryCode}
                      onChange={(e) => setSelectedBankTreasuryCode(e.target.value)}
                      className="w-full bg-white border border-blue-300 rounded-lg px-2 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:border-blue-500"
                    >
                      <option value="1102">حساب بنكي رئيسي (1102)</option>
                    </select>
                  )}
                </div>
              </div>
            )}

            {/* Invoice / Payment Notes Field */}
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="ملاحظات الفاتورة أو الدفع (اختياري)..."
                value={invoiceNotes}
                onChange={(e) => setInvoiceNotes(e.target.value)}
                className="w-full bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-blue-500 rounded-xl px-2.5 py-1 text-xs text-slate-800 placeholder-slate-400 focus:outline-none transition-colors"
              />
              {invoiceNotes && (
                <button
                  type="button"
                  onClick={() => setInvoiceNotes('')}
                  className="p-1 text-slate-400 hover:text-rose-500 shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Financial Summary Breakdown (Compact 2-col / inline) */}
            <div className="bg-slate-50 rounded-xl p-2 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-slate-600">
                <span className="text-[11px]">المجموع:</span>
                <span className="font-mono font-bold text-slate-800">{subtotal.toFixed(2)} {activeCurrency.symbol}</span>
              </div>

              {/* Discount Input */}
              <div className="flex items-center justify-between text-slate-700">
                <span className="flex items-center gap-0.5 text-[11px]">
                  <Percent className="w-3 h-3 text-amber-500" />
                  <span>خصم:</span>
                </span>
                <div className="w-20">
                  <input
                    type="number"
                    placeholder="0.00"
                    value={globalDiscount}
                    onChange={(e) => setGlobalDiscount(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-md px-1.5 py-0.5 text-xs font-mono text-center font-bold text-rose-600 focus:outline-none focus:border-rose-400"
                  />
                </div>
              </div>

              {settings.taxNumber && (
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-[11px]">ضريبة ({taxRate}%):</span>
                  <span className="font-mono font-bold">{taxAmount.toFixed(2)} {activeCurrency.symbol}</span>
                </div>
              )}

              {/* Net Total */}
              <div className="flex items-center justify-between pt-1 border-t border-slate-200 text-xs font-black text-slate-900">
                <span>الصافي المطلوب:</span>
                <div className="text-left font-mono">
                  <span className="text-sm font-black text-blue-700">
                    {netTotal.toFixed(2)} {activeCurrency.symbol}
                  </span>
                  {/* Converted amount in selected payment method currency if different */}
                  {(() => {
                    const currentMethodCurrCode = paymentMethod === 'cash' ? cashCurrencyCode : paymentMethod === 'card' ? bankCurrencyCode : payCurrencyCode;
                    const currentMethodRate = paymentMethod === 'cash' ? cashExchangeRate : paymentMethod === 'card' ? bankExchangeRate : payExchangeRate;
                    const currentMethodCurr = currencies.find(c => c.code === currentMethodCurrCode);
                    if (currentMethodCurrCode !== activeCurrency.code && currentMethodRate > 0) {
                      return (
                        <span className="block text-[10px] text-emerald-700 font-bold">
                          ≈ {((netTotal * (activeCurrency.rateAgainstBase || 1.0)) / currentMethodRate).toFixed(2)} {currentMethodCurr?.symbol || currentMethodCurrCode}
                        </span>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>

              {/* Paid Amount Input Row (Available for Cash, Card, Credit) */}
              <div className="pt-1.5 border-t border-slate-200 space-y-1">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 text-[11px] font-bold text-slate-700">
                    <span>المبلغ المدفوع:</span>
                    <button
                      type="button"
                      onClick={() => setPaidAmountInput(String(netTotal))}
                      className="text-[10px] text-blue-600 hover:underline cursor-pointer"
                      title="دفع كامل المبلغ"
                    >
                      (كامل)
                    </button>
                  </div>
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      step="any"
                      placeholder={paymentMethod === 'credit' ? '0.00' : String(netTotal)}
                      value={paidAmountInput}
                      onChange={(e) => setPaidAmountInput(e.target.value)}
                      className="w-24 bg-white border border-slate-300 focus:border-blue-500 rounded-md px-1.5 py-0.5 text-xs font-mono text-center font-bold text-slate-900 focus:outline-none"
                    />
                    <span className="text-[10px] font-bold text-slate-500">{activeCurrency.symbol}</span>
                  </div>
                </div>

                {/* Remaining debt balance & validation badge if remaining > 0 */}
                {effectiveRemaining > 0 && (
                  <div className="mt-1 pt-1 border-t border-slate-200 space-y-1">
                    <div className="flex items-center justify-between text-[11px] font-bold text-rose-700">
                      <span>المتبقي (ذمة):</span>
                      <span className="font-mono text-xs">
                        {effectiveRemaining.toFixed(2)} {activeCurrency.symbol}
                      </span>
                    </div>

                    {!isRemainingAllowed ? (
                      <div className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-lg p-1.5 flex items-start gap-1">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0 mt-0.5" />
                        <span>لتسجيل متبقي، يجب اختيار عميل رئيسي أو كتابة اسم الزبون الفرعي.</span>
                      </div>
                    ) : (
                      <div className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-2 py-1 flex items-center gap-1">
                        <Check className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span>سيتم تسجيل المتبقي على حساب العميل / الزبون الفرعي.</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Action Buttons: Save & Save/Print (Compact height) */}
            <div className="grid grid-cols-2 gap-2 pt-0.5">
              <button
                type="button"
                onClick={() => handleCheckout(false)}
                className="w-full bg-slate-900 hover:bg-slate-800 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                <Check className="w-4 h-4 text-emerald-400" />
                <span>حفظ الفاتورة</span>
              </button>

              <button
                type="button"
                onClick={() => handleCheckout(true)}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>حفظ وطباعة</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Held Invoices (الفواتير المعلقة)                                   */}
      {/* ========================================================================= */}
      {showHeldModal && (
        <div className="fixed inset-0 z-[115] bg-black/70 backdrop-blur-xs flex flex-col justify-end animate-in fade-in">
          <div className="bg-white rounded-t-3xl p-4 space-y-3 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center font-bold">
                  <History className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900">الفواتير المعلقة ({heldInvoices.length})</h3>
                  <p className="text-[10px] text-slate-500">اختر فاتورة لاستئناف العمل عليها وإنهائها</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowHeldModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {heldInvoices.length === 0 ? (
              <div className="text-center py-8 text-slate-400 space-y-1">
                <PauseCircle className="w-10 h-10 mx-auto text-slate-300" />
                <p className="text-xs font-bold text-slate-600">لا توجد فواتير معلقة حالياً</p>
                <p className="text-[11px] text-slate-400">يمكنك تعليق أي فاتورة مفتوحة عبر زر "تعليق" في الشريط العلوي</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {heldInvoices.map((held, hIdx) => (
                  <div
                    key={`held-mob-${held.id || hIdx}-${hIdx}`}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between gap-2 hover:bg-blue-50/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900 truncate">
                          {held.customerName || 'زبون عام نقدي'}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">({held.heldAt})</span>
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-2">
                        <span>{held.cart.length} أصناف</span>
                        <span>•</span>
                        <span className="font-mono font-bold text-emerald-600">
                          {held.totalAmount.toFixed(2)} {activeCurrency.symbol}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleResumeHeldInvoice(held)}
                        className="bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        <span>استئناف</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteHeldInvoice(held.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 active:scale-95 transition-all cursor-pointer"
                        title="حذف الفاتورة المعلقة"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Delivery Service (خدمة التوصيل)                                    */}
      {/* ========================================================================= */}
      {showDeliveryModal && (
        <div className="fixed inset-0 z-[115] bg-black/70 backdrop-blur-xs flex flex-col justify-end animate-in fade-in">
          <div className="bg-white rounded-t-3xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <Truck className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900">إضافة خدمة توصيل</h3>
                  <p className="text-[10px] text-slate-500">إدراج أجرة التوصيل كبند مباشر في الفاتورة</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowDeliveryModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">قيمة رسوم التوصيل ({activeCurrency.symbol}):</label>
              <input
                type="number"
                step="any"
                min="0"
                value={deliveryFeeInput}
                onChange={(e) => setDeliveryFeeInput(e.target.value)}
                placeholder="15"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-center font-mono font-black text-sm text-slate-900 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">عنوان / تفاصيل التوصيل (اختياري):</label>
              <input
                type="text"
                value={deliveryNotesInput}
                onChange={(e) => setDeliveryNotesInput(e.target.value)}
                placeholder="مثال: توصيل سريع للمنزل - الحي الشمالي..."
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-900 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleApplyDelivery(parseFloat(deliveryFeeInput) || 0, deliveryNotesInput)}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold py-2.5 rounded-xl flex items-center justify-center gap-1.5 active:scale-95 shadow-md cursor-pointer"
              >
                <Check className="w-4 h-4" />
                <span>إدراج في الفاتورة</span>
              </button>

              {cart.some(ci => ci.item.id === 'srv-delivery-mobile' || ci.item.name === 'خدمة توصيل') && (
                <button
                  type="button"
                  onClick={handleRemoveDelivery}
                  className="bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold px-3 py-2.5 rounded-xl flex items-center justify-center gap-1 active:scale-95 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>إلغاء التوصيل</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Currency Selector (شاشة اختيار العملة)                             */}
      {/* ========================================================================= */}
      {showCurrencyModal && (
        <div className="fixed inset-0 z-[115] bg-black/70 backdrop-blur-xs flex flex-col justify-end animate-in fade-in">
          <div className="bg-white rounded-t-3xl p-4 space-y-3 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold">
                  <Coins className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900">اختيار عملة الفاتورة</h3>
                  <p className="text-[10px] text-slate-500">العملة الحالية: {activeCurrency.name || activeCurrency.code} ({activeCurrency.symbol})</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCurrencyModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-1.5">
              {currencies.map(c => {
                const isSelected = selectedCurrencyCode === c.code;
                return (
                  <button
                    key={c.code}
                    type="button"
                    onClick={() => {
                      setSelectedCurrencyCode(c.code);
                      setPayCurrencyCode(c.code);
                      setPayExchangeRate(c.rateAgainstBase || 1.0);
                      setCashCurrencyCode(c.code);
                      setCashExchangeRate(c.code === 'ILS' ? 1.0 : c.rateAgainstBase || 1.0);
                      setBankCurrencyCode(c.code);
                      setBankExchangeRate(c.code === 'ILS' ? 1.0 : c.rateAgainstBase || 1.0);
                      setShowCurrencyModal(false);
                      posSound.beep();
                    }}
                    className={`w-full p-2.5 rounded-2xl border text-right flex items-center justify-between transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-amber-50 border-amber-300 font-bold text-amber-950'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-xl bg-white border border-slate-200 font-mono font-black text-xs flex items-center justify-center text-slate-800">
                        {c.symbol}
                      </span>
                      <div>
                        <div className="text-xs font-bold">{c.name || c.code}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{c.code} • سعر الصرف: {c.rateAgainstBase || 1.0}</div>
                      </div>
                    </div>
                    {isSelected && (
                      <span className="w-5 h-5 rounded-full bg-amber-500 text-white flex items-center justify-center">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Dimensions & Notes for Custom Sized Items (المقاسات والملاحظات)    */}
      {/* ========================================================================= */}
      {activeDimensionItem && (
        <div className="fixed inset-0 z-[110] bg-black/70 backdrop-blur-xs flex flex-col justify-end animate-in fade-in">
          <div className="bg-white rounded-t-3xl p-4 space-y-3 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <Ruler className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900">المقاسات وملاحظات التشغيل</h3>
                  <p className="text-[11px] text-slate-500 truncate max-w-xs">{activeDimensionItem.item.name}</p>
                </div>
              </div>
              <button
                onClick={() => setActiveDimensionItem(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Inputs: Length, Width, Count */}
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 text-center">الطول (متر):</label>
                <input
                  type="number"
                  step="any"
                  value={dimLength}
                  onChange={(e) => setDimLength(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-1 text-xs font-mono font-bold text-center text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 text-center">العرض (متر):</label>
                <input
                  type="number"
                  step="any"
                  value={dimWidth}
                  onChange={(e) => setDimWidth(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-1 text-xs font-mono font-bold text-center text-slate-900"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1 text-center">العدد (قطع):</label>
                <input
                  type="number"
                  step="any"
                  value={dimCount}
                  onChange={(e) => setDimCount(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl py-2 px-1 text-xs font-mono font-bold text-center text-slate-900"
                />
              </div>
            </div>

            {/* Calculated Area Preview */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between text-xs text-amber-900 font-bold">
              <span>المساحة الإجمالية المحتسبة:</span>
              <span className="font-mono text-sm">
                {(Math.max(0.01, parseFloat(dimLength) || 1) * Math.max(0.01, parseFloat(dimWidth) || 1) * Math.max(1, parseFloat(dimCount) || 1)).toFixed(3)} م²
              </span>
            </div>

            {/* Notes textarea */}
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                الملاحظات ومواصفات الطباعة والتشغيل:
              </label>
              <textarea
                rows={3}
                placeholder="أدخل أي ملاحظات خاصة بالتشغيل، القص، السلفنة، الخامات..."
                value={dimNotes}
                onChange={(e) => setDimNotes(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Save Button */}
            <button
              type="button"
              onClick={saveDimensions}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md active:scale-95 transition-all cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>تطبيق المقاسات والملاحظات على الصنف</span>
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: Customer / Supplier / Employee Picker                              */}
      {/* ========================================================================= */}
      {showCustomerPicker && (
        <div className="fixed inset-0 z-[110] bg-black/70 flex flex-col justify-end animate-in fade-in">
          <div className="bg-white rounded-t-3xl max-h-[85vh] flex flex-col p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-xs text-slate-800">
                {partyTypeMode === 'customer' ? 'اختر الزبون / العميل' : partyTypeMode === 'supplier' ? 'اختر المورد' : 'اختر الموظف'}
              </h3>
              <button
                onClick={() => setShowCustomerPicker(false)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Search Input & Quick Add Button */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder={
                    partyTypeMode === 'customer'
                      ? 'ابحث باسم الزبون أو الهاتف...'
                      : partyTypeMode === 'supplier'
                      ? 'ابحث باسم المورد أو الهاتف...'
                      : 'ابحث باسم الموظف أو الوظيفة...'
                  }
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-2 pr-9 pl-3 text-xs"
                />
              </div>
              {(
                <button
                  type="button"
                  onClick={() => {
                    setShowCustomerPicker(false);
                    requestMasterForm({kind:partyTypeMode === 'supplier' ? 'supplier' : partyTypeMode === 'employee' ? 'employee' : 'party',source:'pos',initialName:customerSearch.trim()});
                  }}
                  className="bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-xl flex items-center gap-1 shrink-0"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>جديد</span>
                </button>
              )}
            </div>

            {/* Entity List */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 max-h-64 divide-y divide-slate-100">
              {partyTypeMode === 'employee' ? (
                (employees || [])
                  .filter(e => e.status !== 'terminated')
                  .filter(e =>
                    e.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                    (e.phone && e.phone.includes(customerSearch)) ||
                    (e.jobTitle && e.jobTitle.toLowerCase().includes(customerSearch.toLowerCase())) ||
                    (e.department && e.department.toLowerCase().includes(customerSearch.toLowerCase()))
                  )
                  .map((emp, idx) => (
                    <button
                      key={`mob-emp-${emp.id || idx}-${idx}`}
                      onClick={() => {
                        setSelectedCustomerId(emp.id);
                        setCustomerNameInput(emp.name);
                        setSelectedSubCustomerId('');
                        setCustomSubCustomerName('');
                        setShowCustomerPicker(false);
                        posSound.beep();
                      }}
                      className={`w-full p-2.5 rounded-xl text-right flex items-center justify-between text-xs transition-colors cursor-pointer ${
                        selectedCustomerId === emp.id
                          ? 'bg-teal-50 border border-teal-300 font-bold text-teal-900'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div>
                        <div className="font-bold">{emp.name}</div>
                        <span className="text-[10px] text-slate-400">
                          {emp.jobTitle || 'موظف'} {emp.department ? `• ${emp.department}` : ''} {emp.phone ? `• ${emp.phone}` : ''}
                        </span>
                      </div>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded font-bold bg-teal-50 text-teal-700 border border-teal-200 shrink-0">
                        {emp.code || 'موظف'}
                      </span>
                    </button>
                  ))
              ) : (
                parties
                  .filter(p => !p.isSubCustomer && (
                    partyTypeMode === 'supplier'
                      ? (p.type === 'supplier' || p.type === 'both')
                      : (p.type === 'customer' || p.type === 'both')
                  ))
                  .filter(c =>
                    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
                    (c.phone && c.phone.includes(customerSearch))
                  )
                  .map((c, idx) => (
                    <button
                      key={`mob-party-${c.id || idx}-${idx}`}
                      onClick={() => {
                        setSelectedCustomerId(c.id);
                        setCustomerNameInput(c.name);
                        setSelectedSubCustomerId('');
                        setCustomSubCustomerName('');
                        setShowCustomerPicker(false);
                        posSound.beep();
                      }}
                      className={`w-full p-2.5 rounded-xl text-right flex items-center justify-between text-xs transition-colors cursor-pointer ${
                        selectedCustomerId === c.id
                          ? 'bg-blue-50 border border-blue-300 font-bold text-blue-900'
                          : 'hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div>
                        <div className="font-bold">{c.name}</div>
                        {c.phone && <span className="text-[10px] text-slate-400 font-mono">{c.phone}</span>}
                      </div>
                      {c.balance !== undefined && c.balance !== 0 && (
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded font-bold ${
                          c.balance > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                        }`}>
                          {c.balance.toFixed(2)} {activeCurrency.symbol}
                        </span>
                      )}
                    </button>
                  ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* Mobile customer creation uses the same master-data form as desktop. */}

      {/* Camera Barcode Scanner Modal */}
      <BarcodeScannerModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        inventory={inventory}
        mode="pos"
        currency={activeCurrency.symbol}
        onScanBarcode={(scannedCode) => {
          setSearchBarcodeQuery(scannedCode);
          setIsCameraModalOpen(false);
          const found = inventory.find(i => matchItemByBarcode(i, scannedCode) || i.code === scannedCode);
          if (found) {
            handleDirectAdd(found);
          }
        }}
        onScanItem={(scannedItem) => {
          setIsCameraModalOpen(false);
          handleDirectAdd(scannedItem);
        }}
      />
    </div>
  );
};
