import React, { useState, useMemo } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import {
  Warehouse,
  WarehouseType,
  WarehouseStatus,
  WarehouseOperation,
  WarehouseOperationType,
  WarehouseOperationItem,
  InventoryItem
} from '../types';
import { PrintHeader } from './common/PrintHeader';
import {
  Boxes,
  Plus,
  ArrowRightLeft,
  PackageCheck,
  PackageMinus,
  ClipboardList,
  Scale,
  Trash2,
  RotateCcw,
  Sliders,
  Search,
  Filter,
  Calendar,
  User,
  Building2,
  FileText,
  Printer,
  CheckCircle2,
  Clock,
  MapPin,
  AlertTriangle,
  Edit2,
  Eye,
  Store,
  ChevronDown,
  Info,
  Layers,
  ArrowUpRight,
  ArrowDownLeft,
  Sparkles
} from 'lucide-react';

export const WAREHOUSE_TYPE_LABELS: Record<WarehouseType, { label: string; color: string }> = {
  general_main: { label: 'مستودع رئيسي عام', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  raw_materials: { label: 'مواد خام وورق وأحبار', color: 'bg-amber-50 text-amber-700 border-amber-200' },
  finished_goods: { label: 'منتجات تامة الصنع', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  prints_packaging: { label: 'مطبوعات وتغليف وكرتون', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  stationery: { label: 'قرطاسية ولوازم مكتبية', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  production_in_progress: { label: 'إنتاج قيد التشغيل', color: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
  damaged_scrap: { label: 'تالف وهوالك ومستهلكات', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  transit: { label: 'ترانزيت وبضاعة بالطريق', color: 'bg-slate-100 text-slate-700 border-slate-300' }
};

export const WAREHOUSE_STATUS_LABELS: Record<WarehouseStatus, { label: string; color: string; badge: string }> = {
  active: { label: 'نشط ويعمل', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', badge: 'bg-emerald-500' },
  inactive: { label: 'معطل / مغلق', color: 'text-rose-700 bg-rose-50 border-rose-200', badge: 'bg-rose-500' },
  under_audit: { label: 'قيد الجرد الفعلي', color: 'text-amber-700 bg-amber-50 border-amber-200', badge: 'bg-amber-500' }
};

export const OPERATION_TYPE_INFO: Record<
  WarehouseOperationType,
  { label: string; icon: any; color: string; bg: string; border: string; desc: string }
> = {
  receipt: {
    label: 'استلام مخزني',
    icon: PackageCheck,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    desc: 'إدخال بضاعة أو خامات جديدة للمستودع وزيادة الرصيد'
  },
  issue: {
    label: 'صرف مخزني',
    icon: PackageMinus,
    color: 'text-rose-700',
    bg: 'bg-rose-50',
    border: 'border-rose-200',
    desc: 'صرف بضاعة أو خامات لورشة، مشروع أو جهة معينة'
  },
  transfer: {
    label: 'تحويل بين المستودعات',
    icon: ArrowRightLeft,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    desc: 'نقل مواد بين مستودعين بالفرع نفسه أو بين فرعين مختلفين'
  },
  audit: {
    label: 'محضر جرد',
    icon: ClipboardList,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    desc: 'حصر الكميات الفعلية ومطابقتها مع الأرصدة الدفترية'
  },
  settlement: {
    label: 'تسوية جردية',
    icon: Scale,
    color: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    desc: 'تسوية الفروقات الناتجة عن الجرد واعتماد الرصيد الفعلي'
  },
  damaged: {
    label: 'إتلاف وهالك',
    icon: Trash2,
    color: 'text-red-700',
    bg: 'bg-red-50',
    border: 'border-red-200',
    desc: 'إسقاط بضاعة تالفة أو غير صالحة للاستخدام من المخزن'
  },
  return: {
    label: 'مرتجع للمستودع',
    icon: RotateCcw,
    color: 'text-teal-700',
    bg: 'bg-teal-50',
    border: 'border-teal-200',
    desc: 'إرجاع بضاعة من ورشة أو قسم أو عميل إلى المستودع'
  },
  stock_modify: {
    label: 'تعديل مخزون',
    icon: Sliders,
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    desc: 'تعديل مباشر للكميات أو أسعار التكلفة مع إثبات الحركة'
  }
};

export const WarehouseOperationsView: React.FC = () => {
  const {
    branches,
    activeBranchId,
    setActiveBranchId,
    warehouses,
    activeWarehouseId,
    setActiveWarehouseId,
    addWarehouse,
    updateWarehouse,
    deleteWarehouse,
    getWarehouseStock,
    warehouseOperations,
    addWarehouseOperation,
    inventory,
    stockMovements,
    currentUser,
    settings
  } = useAccounting();

  // Active View Tab
  const [activeMainTab, setActiveMainTab] = useState<'operations' | 'directory' | 'matrix' | 'audit_ledger'>('operations');

  // Filters
  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>('all');
  const [selectedWarehouseFilter, setSelectedWarehouseFilter] = useState<string>('all');
  const [selectedOpTypeFilter, setSelectedOpTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [isNewOpModalOpen, setIsNewOpModalOpen] = useState(false);
  const [selectedOpTypeForNew, setSelectedOpTypeForNew] = useState<WarehouseOperationType>('receipt');
  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [viewingOperation, setViewingOperation] = useState<WarehouseOperation | null>(null);

  // New Operation Form State
  const [opFormBranchId, setOpFormBranchId] = useState<string>(activeBranchId || branches[0]?.id || 'br-1');
  const [opFormWarehouseId, setOpFormWarehouseId] = useState<string>(warehouses[0]?.id || 'wh-1');
  const [opFormTargetBranchId, setOpFormTargetBranchId] = useState<string>(branches[1]?.id || branches[0]?.id || 'br-1');
  const [opFormTargetWarehouseId, setOpFormTargetWarehouseId] = useState<string>(warehouses[1]?.id || warehouses[0]?.id || 'wh-1');
  const [opFormDate, setOpFormDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [opFormTime, setOpFormTime] = useState<string>(new Date().toLocaleTimeString('ar-SA', { hour12: false }));
  const [opFormReferenceNumber, setOpFormReferenceNumber] = useState<string>('');
  const [opFormReason, setOpFormReason] = useState<string>('');
  const [opFormNotes, setOpFormNotes] = useState<string>('');

  // Items selected in operation
  interface FormItemLine {
    itemId: string;
    quantity: number;
    unitCost: number;
    countedQuantity?: number;
    notes?: string;
  }
  const [opFormItems, setOpFormItems] = useState<FormItemLine[]>([
    {
      itemId: inventory[0]?.id || '',
      quantity: 10,
      unitCost: inventory[0]?.purchasePrice || 10,
      countedQuantity: 10,
      notes: ''
    }
  ]);

  // Warehouse Form State (Add / Edit)
  const [whFormCode, setWhFormCode] = useState('');
  const [whFormName, setWhFormName] = useState('');
  const [whFormBranchId, setWhFormBranchId] = useState(activeBranchId || branches[0]?.id || 'br-1');
  const [whFormManager, setWhFormManager] = useState('');
  const [whFormType, setWhFormType] = useState<WarehouseType>('general_main');
  const [whFormStatus, setWhFormStatus] = useState<WarehouseStatus>('active');
  const [whFormLocation, setWhFormLocation] = useState('');
  const [whFormPhone, setWhFormPhone] = useState('');
  const [whFormCapacity, setWhFormCapacity] = useState('');
  const [whFormNotes, setWhFormNotes] = useState('');
  const [whFormIsDefault, setWhFormIsDefault] = useState(false);

  // Available warehouses filtered by op branch
  const availableWarehousesForBranch = useMemo(() => {
    return warehouses.filter(w => w.branchId === opFormBranchId);
  }, [warehouses, opFormBranchId]);

  const availableTargetWarehouses = useMemo(() => {
    return warehouses.filter(w => w.branchId === opFormTargetBranchId && w.id !== opFormWarehouseId);
  }, [warehouses, opFormTargetBranchId, opFormWarehouseId]);

  // Filtered operations list
  const filteredOperations = useMemo(() => {
    return warehouseOperations.filter(op => {
      const matchBranch = selectedBranchFilter === 'all' || op.branchId === selectedBranchFilter;
      const matchWh = selectedWarehouseFilter === 'all' || op.warehouseId === selectedWarehouseFilter || op.targetWarehouseId === selectedWarehouseFilter;
      const matchType = selectedOpTypeFilter === 'all' || op.operationType === selectedOpTypeFilter;
      const matchSearch =
        searchQuery === '' ||
        op.documentNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        op.branchName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        op.warehouseName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        op.userName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (op.referenceNumber && op.referenceNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
        op.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
        op.items.some(it => it.itemName.toLowerCase().includes(searchQuery.toLowerCase()) || it.itemCode.toLowerCase().includes(searchQuery.toLowerCase()));

      return matchBranch && matchWh && matchType && matchSearch;
    });
  }, [warehouseOperations, selectedBranchFilter, selectedWarehouseFilter, selectedOpTypeFilter, searchQuery]);

  // Filtered warehouses directory
  const filteredDirectoryWarehouses = useMemo(() => {
    return warehouses.filter(w => {
      const matchBranch = selectedBranchFilter === 'all' || w.branchId === selectedBranchFilter;
      const matchSearch =
        searchQuery === '' ||
        w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        w.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (w.manager && w.manager.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (w.location && w.location.toLowerCase().includes(searchQuery.toLowerCase()));
      return matchBranch && matchSearch;
    });
  }, [warehouses, selectedBranchFilter, searchQuery]);

  // Open Warehouse modal
  const handleOpenWarehouseModal = (wh?: Warehouse) => {
    if (wh) {
      setEditingWarehouse(wh);
      setWhFormCode(wh.code);
      setWhFormName(wh.name);
      setWhFormBranchId(wh.branchId);
      setWhFormManager(wh.manager || '');
      setWhFormType(wh.warehouseType || 'general_main');
      setWhFormStatus(wh.status || 'active');
      setWhFormLocation(wh.location || '');
      setWhFormPhone(wh.phone || '');
      setWhFormCapacity(wh.capacity || '');
      setWhFormNotes(wh.notes || '');
      setWhFormIsDefault(!!wh.isDefault);
    } else {
      setEditingWarehouse(null);
      const nextNum = warehouses.length + 1;
      setWhFormCode(`WH-0${nextNum}`);
      setWhFormName('');
      setWhFormBranchId(activeBranchId || branches[0]?.id || 'br-1');
      setWhFormManager(currentUser.fullName || '');
      setWhFormType('general_main');
      setWhFormStatus('active');
      setWhFormLocation('');
      setWhFormPhone('');
      setWhFormCapacity('');
      setWhFormNotes('');
      setWhFormIsDefault(warehouses.length === 0);
    }
    setIsWarehouseModalOpen(true);
  };

  const handleSaveWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!whFormName.trim() || !whFormCode.trim()) {
      alert('يرجى كتابة كود واسم المستودع');
      return;
    }

    const branch = branches.find(b => b.id === whFormBranchId);

    if (editingWarehouse) {
      updateWarehouse(editingWarehouse.id, {
        code: whFormCode.trim(),
        name: whFormName.trim(),
        branchId: whFormBranchId,
        branchName: branch?.name,
        manager: whFormManager.trim(),
        warehouseType: whFormType,
        status: whFormStatus,
        location: whFormLocation.trim(),
        phone: whFormPhone.trim(),
        capacity: whFormCapacity.trim(),
        notes: whFormNotes.trim(),
        isDefault: whFormIsDefault
      });
    } else {
      addWarehouse({
        code: whFormCode.trim(),
        name: whFormName.trim(),
        companyId: branch?.companyId || 'comp-1',
        branchId: whFormBranchId,
        branchName: branch?.name,
        manager: whFormManager.trim(),
        warehouseType: whFormType,
        status: whFormStatus,
        location: whFormLocation.trim(),
        phone: whFormPhone.trim(),
        capacity: whFormCapacity.trim(),
        notes: whFormNotes.trim(),
        isDefault: whFormIsDefault
      });
    }
    setIsWarehouseModalOpen(false);
  };

  // Open New Operation Modal
  const handleOpenNewOpModal = (type: WarehouseOperationType, defaultWhId?: string) => {
    setSelectedOpTypeForNew(type);
    const targetBranch = branches.find(b => b.id === activeBranchId) || branches[0];
    setOpFormBranchId(targetBranch?.id || 'br-1');

    const branchWhs = warehouses.filter(w => w.branchId === (targetBranch?.id || 'br-1'));
    const initialWh = defaultWhId || branchWhs[0]?.id || warehouses[0]?.id || 'wh-1';
    setOpFormWarehouseId(initialWh);

    const otherBranches = branches.filter(b => b.id !== targetBranch?.id);
    const targetBranchForTransfer = otherBranches[0]?.id || targetBranch?.id || 'br-1';
    setOpFormTargetBranchId(targetBranchForTransfer);

    const otherWhs = warehouses.filter(w => w.id !== initialWh);
    setOpFormTargetWarehouseId(otherWhs[0]?.id || 'wh-1');

    setOpFormDate(new Date().toISOString().split('T')[0]);
    setOpFormTime(new Date().toLocaleTimeString('ar-SA', { hour12: false }));
    setOpFormReferenceNumber('');
    setOpFormNotes('');

    const defaultReasons: Record<WarehouseOperationType, string> = {
      receipt: 'توريد واستلام بضاعة/خامات جديدة من المورد',
      issue: 'صرف مواد وأوراق لورشة الطباعة والأعمال',
      transfer: 'تحويل مواد لتغذية مستودع الفرع وتلبية الطلبيات',
      audit: 'جرد دوري ربع سنوي ومطابقة الأرصدة الفعلية',
      settlement: 'تسوية الفروقات الجردية وتعديل الدفاتر',
      damaged: 'إتلاف أوراق وبضاعة تالفة بسبب الرطوبة وانتهاء الصلاحية',
      return: 'مرتجع فائض تشغيل من ورشة الطباعة إلى المستودع',
      stock_modify: 'تعديل وتصحيح رصيد مخزني بناء على مراجعة دقيقة'
    };
    setOpFormReason(defaultReasons[type]);

    // Populate initial items
    const sampleItem = inventory[0];
    if (sampleItem) {
      const currentWhStock = getWarehouseStock(initialWh, sampleItem.id);
      setOpFormItems([
        {
          itemId: sampleItem.id,
          quantity: type === 'audit' || type === 'settlement' ? currentWhStock : 10,
          unitCost: sampleItem.purchasePrice,
          countedQuantity: currentWhStock,
          notes: ''
        }
      ]);
    } else {
      setOpFormItems([]);
    }

    setIsNewOpModalOpen(true);
  };

  // Add Item Row to Op Form
  const handleAddItemRow = () => {
    const unselectedItem = inventory.find(inv => !opFormItems.some(f => f.itemId === inv.id)) || inventory[0];
    if (!unselectedItem) return;
    const currentWhStock = getWarehouseStock(opFormWarehouseId, unselectedItem.id);
    setOpFormItems(prev => [
      ...prev,
      {
        itemId: unselectedItem.id,
        quantity: selectedOpTypeForNew === 'audit' || selectedOpTypeForNew === 'settlement' ? currentWhStock : 5,
        unitCost: unselectedItem.purchasePrice,
        countedQuantity: currentWhStock,
        notes: ''
      }
    ]);
  };

  // Remove Item Row
  const handleRemoveItemRow = (index: number) => {
    setOpFormItems(prev => prev.filter((_, i) => i !== index));
  };

  // Update Item Row
  const handleUpdateItemRow = (index: number, field: keyof FormItemLine, value: any) => {
    setOpFormItems(prev =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const updated = { ...line, [field]: value };
        if (field === 'itemId') {
          const invItem = inventory.find(it => it.id === value);
          if (invItem) {
            updated.unitCost = invItem.purchasePrice;
            const curStock = getWarehouseStock(opFormWarehouseId, invItem.id);
            if (selectedOpTypeForNew === 'audit' || selectedOpTypeForNew === 'settlement') {
              updated.countedQuantity = curStock;
              updated.quantity = curStock;
            }
          }
        }
        return updated;
      })
    );
  };

  // Save New Operation
  const handleSaveOperation = (e: React.FormEvent) => {
    e.preventDefault();
    if (opFormItems.length === 0) {
      alert('يرجى إضافة صنف واحد على الأقل للعملية');
      return;
    }

    // Validation for issue, transfer, damaged
    if (['issue', 'transfer', 'damaged'].includes(selectedOpTypeForNew)) {
      for (const line of opFormItems) {
        const item = inventory.find(it => it.id === line.itemId);
        const availableStock = getWarehouseStock(opFormWarehouseId, line.itemId);
        if (line.quantity > availableStock) {
          const confirmOver = window.confirm(
            `تنبيه: الكمية المطلوبة للصنف "${item?.name}" هي (${line.quantity}) بينما الرصيد الحالي بالمستودع هو (${availableStock}). هل تريد المتابعة والسماح بالرصيد السالب؟`
          );
          if (!confirmOver) return;
        }
      }
    }

    if (selectedOpTypeForNew === 'transfer' && opFormWarehouseId === opFormTargetWarehouseId) {
      alert('لا يمكن التحويل إلى نفس المستودع المصدر');
      return;
    }

    // Build operation items
    const processedItems: WarehouseOperationItem[] = opFormItems.map(line => {
      const item = inventory.find(it => it.id === line.itemId) || {
        id: line.itemId,
        code: 'ITEM',
        name: 'صنف غير معروف',
        unit: 'حبة',
        purchasePrice: line.unitCost
      };

      const curStock = getWarehouseStock(opFormWarehouseId, line.itemId);
      const targetCurStock = selectedOpTypeForNew === 'transfer' ? getWarehouseStock(opFormTargetWarehouseId, line.itemId) : undefined;
      const counted = line.countedQuantity !== undefined ? line.countedQuantity : line.quantity;
      const discrepancy = counted - curStock;

      return {
        itemId: item.id,
        itemCode: item.code,
        itemName: item.name,
        unit: (item as any).unit || 'حبة',
        quantity: Number(line.quantity) || 0,
        unitCost: Number(line.unitCost) || 0,
        totalCost: (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
        balanceBefore: curStock,
        balanceAfter:
          selectedOpTypeForNew === 'receipt' || selectedOpTypeForNew === 'return'
            ? curStock + line.quantity
            : selectedOpTypeForNew === 'issue' || selectedOpTypeForNew === 'damaged'
            ? Math.max(0, curStock - line.quantity)
            : selectedOpTypeForNew === 'settlement'
            ? counted
            : curStock,
        targetBalanceBefore: targetCurStock,
        targetBalanceAfter: targetCurStock !== undefined ? targetCurStock + line.quantity : undefined,
        countedQuantity: counted,
        discrepancy: discrepancy,
        notes: line.notes
      };
    });

    const totalQty = processedItems.reduce((sum, it) => sum + it.quantity, 0);
    const totalVal = processedItems.reduce((sum, it) => sum + it.totalCost, 0);

    const branch = branches.find(b => b.id === opFormBranchId);
    const warehouse = warehouses.find(w => w.id === opFormWarehouseId);
    const targetBranch = branches.find(b => b.id === opFormTargetBranchId);
    const targetWarehouse = warehouses.find(w => w.id === opFormTargetWarehouseId);

    const createdOp = addWarehouseOperation({
      operationType: selectedOpTypeForNew,
      date: opFormDate,
      time: opFormTime,
      branchId: opFormBranchId,
      branchName: branch?.name || 'الفرع الرئيسي',
      warehouseId: opFormWarehouseId,
      warehouseName: warehouse?.name || 'المستودع الرئيسي',
      targetBranchId: selectedOpTypeForNew === 'transfer' ? opFormTargetBranchId : undefined,
      targetBranchName: selectedOpTypeForNew === 'transfer' ? targetBranch?.name : undefined,
      targetWarehouseId: selectedOpTypeForNew === 'transfer' ? opFormTargetWarehouseId : undefined,
      targetWarehouseName: selectedOpTypeForNew === 'transfer' ? targetWarehouse?.name : undefined,
      userId: currentUser.id,
      userName: currentUser.fullName,
      userRole: currentUser.roleName,
      items: processedItems,
      totalQuantity: totalQty,
      totalValue: totalVal,
      referenceNumber: opFormReferenceNumber.trim() || undefined,
      reason: opFormReason.trim() || 'عملية مخزنية معتمدة',
      notes: opFormNotes.trim() || undefined,
      status: 'completed'
    });

    setIsNewOpModalOpen(false);
    setViewingOperation(createdOp);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Top Banner & Quick Metrics */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-6 rounded-2xl shadow-sm border border-slate-700/80 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shadow-inner">
            <Boxes className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">نظام المستودعات والعمليات المخزنية</h1>
              <span className="text-xs bg-indigo-500/30 text-indigo-300 font-semibold px-2.5 py-0.5 rounded-full border border-indigo-400/40">
                Multi-Warehouse & Multi-Branch
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 mt-1 max-w-2xl">
              إدارة مستودعات الفروع الثمانية: استلام، صرف، تحويل، جرد، تسوية، إتلاف، مرتجع، وتعديل مع ربط كامل بالمستخدم والفرع والمستند
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 w-full lg:w-auto flex-wrap">
          <button
            onClick={() => handleOpenWarehouseModal()}
            className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 border border-slate-700 shadow-xs cursor-pointer transition"
          >
            <Plus className="w-4 h-4 text-indigo-400" />
            <span>مستودع جديد</span>
          </button>

          <button
            onClick={() => handleOpenNewOpModal('receipt')}
            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm cursor-pointer transition"
          >
            <PackageCheck className="w-4 h-4" />
            <span>تسجيل استلام</span>
          </button>

          <button
            onClick={() => handleOpenNewOpModal('transfer')}
            className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm cursor-pointer transition"
          >
            <ArrowRightLeft className="w-4 h-4" />
            <span>تحويل بين المخازن</span>
          </button>

          <button
            onClick={() => handleOpenNewOpModal('audit')}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 shadow-sm cursor-pointer transition"
          >
            <ClipboardList className="w-4 h-4" />
            <span>محضر جرد</span>
          </button>
        </div>
      </div>

      {/* 8 Operations Quick Launch Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {(
          [
            'receipt',
            'issue',
            'transfer',
            'audit',
            'settlement',
            'damaged',
            'return',
            'stock_modify'
          ] as WarehouseOperationType[]
        ).map(type => {
          const info = OPERATION_TYPE_INFO[type];
          const Icon = info.icon;
          const count = warehouseOperations.filter(op => op.operationType === type).length;

          return (
            <button
              key={type}
              onClick={() => handleOpenNewOpModal(type)}
              className={`p-3 rounded-xl border text-right transition cursor-pointer hover:shadow-md hover:-translate-y-0.5 flex flex-col justify-between bg-white ${info.border}`}
            >
              <div className="flex items-center justify-between gap-1 mb-2">
                <div className={`p-1.5 rounded-lg ${info.bg} ${info.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded">
                  {count}
                </span>
              </div>
              <div>
                <h4 className="text-xs font-black text-slate-900 leading-tight">{info.label}</h4>
                <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5">{info.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* Tabs & Global Filter Bar */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Main Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <button
              onClick={() => setActiveMainTab('operations')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
                activeMainTab === 'operations'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-4 h-4" />
              <span>سجل العمليات والمستندات</span>
              <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono ${
                activeMainTab === 'operations' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {warehouseOperations.length}
              </span>
            </button>

            <button
              onClick={() => setActiveMainTab('directory')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
                activeMainTab === 'directory'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Boxes className="w-4 h-4" />
              <span>دليل المستودعات والفروع</span>
              <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono ${
                activeMainTab === 'directory' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {warehouses.length}
              </span>
            </button>

            <button
              onClick={() => setActiveMainTab('matrix')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
                activeMainTab === 'matrix'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>أرصدة الأصناف بالمستودعات</span>
              <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono ${
                activeMainTab === 'matrix' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {inventory.length}
              </span>
            </button>

            <button
              onClick={() => setActiveMainTab('audit_ledger')}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
                activeMainTab === 'audit_ledger'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <ClipboardList className="w-4 h-4" />
              <span>سجل الحركات والتدقيق</span>
              <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono ${
                activeMainTab === 'audit_ledger' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {stockMovements.length}
              </span>
            </button>
          </div>

          {/* Quick Search */}
          <div className="relative min-w-[260px]">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث برقم السند، الصنف، المستخدم، الفرع..."
              className="w-full pl-3 pr-9 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
            />
          </div>
        </div>

        {/* Dropdown Filters (Branch, Warehouse, Op Type) */}
        <div className="flex flex-wrap items-center gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 text-slate-500 font-bold">
            <Filter className="w-3.5 h-3.5" />
            <span>تصفية:</span>
          </div>

          {/* Branch Filter */}
          <select
            value={selectedBranchFilter}
            onChange={(e) => {
              setSelectedBranchFilter(e.target.value);
              setSelectedWarehouseFilter('all');
            }}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">🏢 جميع الفروع ({branches.length})</option>
            {branches.map(b => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>

          {/* Warehouse Filter */}
          <select
            value={selectedWarehouseFilter}
            onChange={(e) => setSelectedWarehouseFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">📦 جميع المستودعات ({warehouses.length})</option>
            {warehouses
              .filter(w => selectedBranchFilter === 'all' || w.branchId === selectedBranchFilter)
              .map(w => (
                <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
              ))}
          </select>

          {/* Op Type Filter (when in operations or audit tab) */}
          {(activeMainTab === 'operations' || activeMainTab === 'audit_ledger') && (
            <select
              value={selectedOpTypeFilter}
              onChange={(e) => setSelectedOpTypeFilter(e.target.value)}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-bold text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">📑 كل أنواع العمليات (8 أنواع)</option>
              <option value="receipt">استلام مخزني</option>
              <option value="issue">صرف مخزني</option>
              <option value="transfer">تحويل بين المستودعات</option>
              <option value="audit">محضر جرد</option>
              <option value="settlement">تسوية جردية</option>
              <option value="damaged">إتلاف وهالك</option>
              <option value="return">مرتجع للمستودع</option>
              <option value="stock_modify">تعديل مخزون</option>
            </select>
          )}

          {(selectedBranchFilter !== 'all' || selectedWarehouseFilter !== 'all' || selectedOpTypeFilter !== 'all' || searchQuery !== '') && (
            <button
              onClick={() => {
                setSelectedBranchFilter('all');
                setSelectedWarehouseFilter('all');
                setSelectedOpTypeFilter('all');
                setSearchQuery('');
              }}
              className="px-2.5 py-1 text-slate-400 hover:text-rose-600 font-bold cursor-pointer"
            >
              إعادة ضبط الفلاتر ✕
            </button>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* TAB 1: OPERATIONS & DOCUMENTS LEDGER */}
      {/* ========================================================= */}
      {activeMainTab === 'operations' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">سجل السندات والعمليات المخزنية المعتمدة</h3>
                <p className="text-[10px] text-slate-400 font-light">
                  عرض تفاصيل كل حركة مخزنية مع المستخدم المنفذ والفرع والمستند والتاريخ
                </p>
              </div>
              <span className="text-xs font-mono font-bold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg border border-indigo-200">
                {filteredOperations.length} مستند
              </span>
            </div>

            {filteredOperations.length === 0 ? (
              <div className="p-12 text-center text-slate-400 space-y-2">
                <Boxes className="w-12 h-12 mx-auto text-slate-300" />
                <p className="font-bold text-slate-600">لا توجد عمليات مخزنية مطابقة للمعايير المحددة</p>
                <p className="text-xs text-slate-400">يمكنك تسجيل حركة جديدة بالنقر على أحد أزرار العمليات أعلاه</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-right text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                    <tr>
                      <th className="p-3">رقم المستند</th>
                      <th className="p-3">نوع العملية</th>
                      <th className="p-3">التاريخ والوقت</th>
                      <th className="p-3">الفرع والمستودع</th>
                      <th className="p-3">المستهدف (بالتحويل)</th>
                      <th className="p-3">الأصناف المحركة</th>
                      <th className="p-3">المستخدم المسؤول</th>
                      <th className="p-3">إجمالي الكمية</th>
                      <th className="p-3">القيمة التقديرية</th>
                      <th className="p-3 text-center">الإجراء</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredOperations.map((op, idx) => {
                      const info = OPERATION_TYPE_INFO[op.operationType];
                      const Icon = info.icon;

                      return (
                        <tr key={`wh-op-${op.id || idx}-${idx}`} className="hover:bg-slate-50/80 transition">
                          <td className="p-3 font-mono font-bold text-indigo-700">
                            {op.documentNumber}
                            {op.referenceNumber && (
                              <span className="block text-[10px] text-slate-400 font-normal">
                                مرجع: {op.referenceNumber}
                              </span>
                            )}
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${info.bg} ${info.color} ${info.border}`}>
                              <Icon className="w-3.5 h-3.5" />
                              <span>{info.label}</span>
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="font-mono text-slate-800">{op.date}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{op.time}</div>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-900">{op.warehouseName}</div>
                            <div className="text-[11px] text-indigo-600 flex items-center gap-1">
                              <Store className="w-3 h-3" />
                              <span>{op.branchName}</span>
                            </div>
                          </td>
                          <td className="p-3">
                            {op.targetWarehouseName ? (
                              <div>
                                <div className="font-bold text-blue-700">{op.targetWarehouseName}</div>
                                <div className="text-[10px] text-slate-400 font-light">{op.targetBranchName}</div>
                              </div>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-800">
                              {op.items.length === 1 ? op.items[0].itemName : `${op.items[0]?.itemName || ''} (+${op.items.length - 1} أصناف)`}
                            </div>
                            <span className="text-[10px] text-slate-400">
                              {op.items.length} صنف مسجل
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="font-bold text-slate-800 flex items-center gap-1">
                              <User className="w-3 h-3 text-slate-400" />
                              <span>{op.userName}</span>
                            </div>
                            {op.userRole && (
                              <span className="text-[10px] text-slate-400 block">{op.userRole}</span>
                            )}
                          </td>
                          <td className="p-3 font-mono font-bold text-slate-900">
                            {op.totalQuantity.toLocaleString()}
                          </td>
                          <td className="p-3 font-mono font-bold text-emerald-700">
                            {op.totalValue.toLocaleString()} ₪
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={() => setViewingOperation(op)}
                              className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg transition flex items-center gap-1.5 mx-auto cursor-pointer"
                              title="عرض المستند وطباعته"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>المستند</span>
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
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 2: WAREHOUSES DIRECTORY ACCORDING TO BRANCHES */}
      {/* ========================================================= */}
      {activeMainTab === 'directory' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredDirectoryWarehouses.map(wh => {
              const branch = branches.find(b => b.id === wh.branchId);
              const typeMeta = WAREHOUSE_TYPE_LABELS[wh.warehouseType] || WAREHOUSE_TYPE_LABELS.general_main;
              const statusMeta = WAREHOUSE_STATUS_LABELS[wh.status] || WAREHOUSE_STATUS_LABELS.active;

              // Calculate items in this warehouse
              const warehouseItems = inventory.filter(item => {
                const stock = getWarehouseStock(wh.id, item.id);
                return stock > 0;
              });

              const totalQtyInWh = warehouseItems.reduce((sum, item) => sum + getWarehouseStock(wh.id, item.id), 0);
              const totalValInWh = warehouseItems.reduce(
                (sum, item) => sum + getWarehouseStock(wh.id, item.id) * item.purchasePrice,
                0
              );

              return (
                <div
                  key={wh.id}
                  className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:shadow-md transition flex flex-col justify-between"
                >
                  <div>
                    {/* Header */}
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                            {wh.code}
                          </span>
                          {wh.isDefault && (
                            <span className="text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                              رئيسي
                            </span>
                          )}
                        </div>
                        <h3 className="font-black text-slate-900 text-base mt-1.5">{wh.name}</h3>
                        <p className="text-xs text-indigo-600 font-semibold flex items-center gap-1 mt-0.5">
                          <Store className="w-3.5 h-3.5" />
                          <span>{branch ? branch.name : 'الفرع الرئيسي'}</span>
                        </p>
                      </div>

                      <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${statusMeta.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${statusMeta.badge}`}></span>
                        <span>{statusMeta.label}</span>
                      </span>
                    </div>

                    {/* Metadata */}
                    <div className="py-3 space-y-2.5 text-xs text-slate-600">
                      <div>
                        <span className="text-[11px] text-slate-400 block">نوع المخزن:</span>
                        <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold border mt-0.5 ${typeMeta.color}`}>
                          {typeMeta.label}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-50">
                        <div>
                          <span className="text-slate-400 block text-[11px]">المسؤول (أمين المخزن):</span>
                          <strong className="font-bold text-slate-800 flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            <span>{wh.manager || 'غير محدد'}</span>
                          </strong>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[11px]">السعة التخزينية:</span>
                          <span className="font-mono font-bold text-slate-800">{wh.capacity || 'غير محددة'}</span>
                        </div>
                      </div>

                      {wh.location && (
                        <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-light">
                          <MapPin className="w-3 h-3 text-slate-400" />
                          <span>{wh.location}</span>
                        </div>
                      )}

                      {/* Summary Metrics */}
                      <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div>
                          <span className="text-[10px] text-slate-400 block">الأصناف المتوفرة:</span>
                          <strong className="text-xs font-mono font-bold text-slate-900">
                            {warehouseItems.length} صنف ({totalQtyInWh.toLocaleString()} وحدة)
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-400 block">قيمة المخزون:</span>
                          <strong className="text-xs font-mono font-bold text-emerald-700">
                            {totalValInWh.toLocaleString()} ₪
                          </strong>
                        </div>
                      </div>

                      {wh.notes && (
                        <p className="text-[10px] text-slate-400 font-light bg-amber-50/50 p-2 rounded-lg border border-amber-100/70">
                          {wh.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenNewOpModal('receipt', wh.id)}
                        className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[11px] font-bold cursor-pointer transition"
                        title="استلام بضاعة للمستودع"
                      >
                        + استلام
                      </button>
                      <button
                        onClick={() => handleOpenNewOpModal('issue', wh.id)}
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[11px] font-bold cursor-pointer transition"
                        title="صرف مواد من المستودع"
                      >
                        - صرف
                      </button>
                      <button
                        onClick={() => handleOpenNewOpModal('transfer', wh.id)}
                        className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[11px] font-bold cursor-pointer transition"
                        title="تحويل من المستودع"
                      >
                        تحويل
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenWarehouseModal(wh)}
                        className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-lg transition cursor-pointer"
                        title="تعديل بيانات المستودع"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {warehouses.length > 1 && (
                        <button
                          onClick={() => {
                            if (window.confirm(`هل أنت متأكد من حذف المستودع ${wh.name}؟`)) {
                              const res = deleteWarehouse(wh.id);
                              if (!res.success) alert(res.message);
                            }
                          }}
                          className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                          title="حذف المستودع"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 3: STOCK BY WAREHOUSE MATRIX TABLE */}
      {/* ========================================================= */}
      {activeMainTab === 'matrix' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">مصفوفة توزيع أرصدة الأصناف على المستودعات</h3>
              <p className="text-[10px] text-slate-400 font-light">
                متابعة دقيقة لكمية كل صنف في كل مخزن وفرع مع إجمالي الرصيد وسعر التكلفة
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-slate-100 text-slate-700 px-3 py-1 rounded-lg">
              {inventory.length} صنف مسجل
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                <tr>
                  <th className="p-3">كود الصنف</th>
                  <th className="p-3">اسم الصنف</th>
                  <th className="p-3">التصنيف</th>
                  <th className="p-3 text-center">إجمالي النظام</th>
                  {warehouses.map(wh => (
                    <th key={wh.id} className="p-3 text-center bg-slate-100/60">
                      <div className="font-mono text-[11px] text-indigo-700">{wh.code}</div>
                      <div className="font-bold text-[11px] text-slate-800 line-clamp-1">{wh.name}</div>
                      <div className="text-[10px] text-slate-400 font-normal">{wh.branchName || 'الفرع'}</div>
                    </th>
                  ))}
                  <th className="p-3 text-center">سعر التكلفة</th>
                  <th className="p-3 text-center">إجمالي القيمة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {inventory
                  .filter(item => {
                    if (!searchQuery) return true;
                    return (
                      item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      item.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      item.category.toLowerCase().includes(searchQuery.toLowerCase())
                    );
                  })
                  .map((item, idx) => {
                    const totalVal = item.stockQuantity * item.purchasePrice;

                    return (
                      <tr key={`wh-stock-${item.id || idx}-${idx}`} className="hover:bg-slate-50/80 transition">
                        <td className="p-3 font-mono font-bold text-indigo-700">{item.code}</td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{item.name}</div>
                          <span className="text-[10px] text-slate-400">الوحدة: {item.unit || 'حبة'}</span>
                        </td>
                        <td className="p-3">
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                            {item.category}
                          </span>
                        </td>
                        <td className="p-3 text-center font-mono font-black text-sm text-slate-900">
                          {item.stockQuantity.toLocaleString()}
                        </td>

                        {/* Stock Per Warehouse */}
                        {warehouses.map(wh => {
                          const stockInWh = getWarehouseStock(wh.id, item.id);
                          return (
                            <td
                              key={wh.id}
                              className={`p-3 text-center font-mono font-bold ${
                                stockInWh > 0 ? 'text-slate-800 bg-slate-50/40' : 'text-slate-300'
                              }`}
                            >
                              {stockInWh > 0 ? stockInWh.toLocaleString() : '0'}
                            </td>
                          );
                        })}

                        <td className="p-3 text-center font-mono text-slate-700">
                          {item.purchasePrice} ₪
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-emerald-700">
                          {totalVal.toLocaleString()} ₪
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* TAB 4: DETAILED AUDIT LEDGER */}
      {/* ========================================================= */}
      {activeMainTab === 'audit_ledger' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="font-bold text-slate-900 text-sm sm:text-base">سجل حركات الأصناف والمستودعات التدقيقي الكامل</h3>
              <p className="text-[10px] text-slate-400 font-light">
                كل حركة صادرة أو واردة أو محولة مرتبطة بالتاريخ والوقت والمستخدم والفرع والمستودع ورقم المستند
              </p>
            </div>
            <span className="text-xs font-mono font-bold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg">
              {stockMovements.length} حركة مسجلة
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 font-bold">
                <tr>
                  <th className="p-3">التاريخ والوقت</th>
                  <th className="p-3">رقم المستند</th>
                  <th className="p-3">الصنف</th>
                  <th className="p-3">نوع الحركة</th>
                  <th className="p-3">الفرع والمستودع</th>
                  <th className="p-3">المستخدم المسؤول</th>
                  <th className="p-3 text-center">قبل الحركة</th>
                  <th className="p-3 text-center">الكمية</th>
                  <th className="p-3 text-center">بعد الحركة</th>
                  <th className="p-3">السبب والملاحظات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockMovements
                  .filter(mv => {
                    const matchBranch = selectedBranchFilter === 'all' || mv.branchId === selectedBranchFilter;
                    const matchWh = selectedWarehouseFilter === 'all' || mv.warehouseId === selectedWarehouseFilter;
                    const matchSearch =
                      searchQuery === '' ||
                      mv.itemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      mv.itemCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      (mv.documentNumber && mv.documentNumber.toLowerCase().includes(searchQuery.toLowerCase())) ||
                      (mv.userName && mv.userName.toLowerCase().includes(searchQuery.toLowerCase()));
                    return matchBranch && matchWh && matchSearch;
                  })
                  .map((mv, idx) => {
                    const isPositive = mv.type.includes('in') || mv.type === 'transfer_in';

                    return (
                      <tr key={`wh-mv-${mv.id || idx}-${idx}`} className="hover:bg-slate-50/80 transition">
                        <td className="p-3">
                          <div className="font-mono text-slate-900 font-bold">{mv.date}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{mv.time || '—'}</div>
                        </td>
                        <td className="p-3 font-mono font-bold text-indigo-700">
                          {mv.documentNumber || mv.referenceNumber || 'DOC-AUTO'}
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-900">{mv.itemName}</div>
                          <span className="font-mono text-[10px] text-slate-400">{mv.itemCode}</span>
                        </td>
                        <td className="p-3">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                            isPositive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}>
                            {mv.type}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800">{mv.warehouseName || 'مستودع رئيسي'}</div>
                          <span className="text-[10px] text-slate-400">{mv.branchName || 'الفرع'}</span>
                        </td>
                        <td className="p-3">
                          <div className="font-bold text-slate-800 flex items-center gap-1">
                            <User className="w-3 h-3 text-slate-400" />
                            <span>{mv.userName || 'المستخدم'}</span>
                          </div>
                        </td>
                        <td className="p-3 text-center font-mono text-slate-500">
                          {mv.balanceBefore !== undefined ? mv.balanceBefore : '—'}
                        </td>
                        <td className={`p-3 text-center font-mono font-black ${
                          isPositive ? 'text-emerald-700' : 'text-rose-700'
                        }`}>
                          {isPositive ? `+${mv.quantity}` : `-${mv.quantity}`}
                        </td>
                        <td className="p-3 text-center font-mono font-bold text-slate-900">
                          {mv.balanceAfter !== undefined ? mv.balanceAfter : '—'}
                        </td>
                        <td className="p-3 text-slate-500 text-[11px]">
                          {mv.reason || mv.notes || '—'}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: NEW OPERATION WIZARD (SUPPORTING ALL 8 OPERATIONS) */}
      {/* ========================================================= */}
      {isNewOpModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-400/30">
                  <Boxes className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base">
                    تسجيل {OPERATION_TYPE_INFO[selectedOpTypeForNew].label}
                  </h3>
                  <p className="text-xs text-slate-300">
                    {OPERATION_TYPE_INFO[selectedOpTypeForNew].desc}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsNewOpModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveOperation} className="p-6 space-y-4 text-xs sm:text-sm">
              {/* Type Switcher Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                {(
                  [
                    'receipt',
                    'issue',
                    'transfer',
                    'audit',
                    'settlement',
                    'damaged',
                    'return',
                    'stock_modify'
                  ] as WarehouseOperationType[]
                ).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => {
                      setSelectedOpTypeForNew(type);
                      const defaultReasons: Record<WarehouseOperationType, string> = {
                        receipt: 'توريد واستلام بضاعة/خامات جديدة من المورد',
                        issue: 'صرف مواد وأوراق لورشة الطباعة والأعمال',
                        transfer: 'تحويل مواد لتغذية مستودع الفرع وتلبية الطلبيات',
                        audit: 'جرد دوري ربع سنوي ومطابقة الأرصدة الفعلية',
                        settlement: 'تسوية الفروقات الجردية وتعديل الدفاتر',
                        damaged: 'إتلاف أوراق وبضاعة تالفة بسبب الرطوبة وانتهاء الصلاحية',
                        return: 'مرتجع فائض تشغيل من ورشة الطباعة إلى المستودع',
                        stock_modify: 'تعديل وتصحيح رصيد مخزني بناء على مراجعة دقيقة'
                      };
                      setOpFormReason(defaultReasons[type]);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                      selectedOpTypeForNew === type
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {OPERATION_TYPE_INFO[type].label}
                  </button>
                ))}
              </div>

              {/* Source Branch & Warehouse */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الفرع *</label>
                  <select
                    value={opFormBranchId}
                    onChange={(e) => {
                      setOpFormBranchId(e.target.value);
                      const branchWhs = warehouses.filter(w => w.branchId === e.target.value);
                      if (branchWhs.length > 0) setOpFormWarehouseId(branchWhs[0].id);
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white font-bold text-slate-800"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المستودع المصدر / التابع *</label>
                  <select
                    value={opFormWarehouseId}
                    onChange={(e) => setOpFormWarehouseId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white font-bold text-slate-800"
                  >
                    {availableWarehousesForBranch.map(w => (
                      <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Target Branch & Warehouse (Transfer Only) */}
              {selectedOpTypeForNew === 'transfer' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-blue-50/70 rounded-xl border border-blue-200">
                  <div>
                    <label className="block text-xs font-bold text-blue-900 mb-1">الفرع المستهدف (المستلم) *</label>
                    <select
                      value={opFormTargetBranchId}
                      onChange={(e) => {
                        setOpFormTargetBranchId(e.target.value);
                        const targetWhs = warehouses.filter(w => w.branchId === e.target.value && w.id !== opFormWarehouseId);
                        if (targetWhs.length > 0) setOpFormTargetWarehouseId(targetWhs[0].id);
                      }}
                      className="w-full px-3 py-2 text-xs border border-blue-200 rounded-lg bg-white font-bold text-blue-900"
                    >
                      {branches.map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-blue-900 mb-1">المستودع المستهدف *</label>
                    <select
                      value={opFormTargetWarehouseId}
                      onChange={(e) => setOpFormTargetWarehouseId(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-blue-200 rounded-lg bg-white font-bold text-blue-900"
                    >
                      {availableTargetWarehouses.map(w => (
                        <option key={w.id} value={w.id}>{w.code} - {w.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Audit / Date / Reference Row */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">التاريخ *</label>
                  <DateInput required value={opFormDate} onChange={(e) => setOpFormDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الوقت</label>
                  <input
                    type="text"
                    value={opFormTime}
                    onChange={(e) => setOpFormTime(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم المرجع (فاتورة / أمر شغل)</label>
                  <input
                    type="text"
                    value={opFormReferenceNumber}
                    onChange={(e) => setOpFormReferenceNumber(e.target.value)}
                    placeholder="PO-2026-001 أو INV-..."
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-800">
                    الأصناف المشمولة بالعملية ({opFormItems.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddItemRow}
                    className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إضافة صنف</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {opFormItems.map((line, idx) => {
                    const selectedItem = inventory.find(it => it.id === line.itemId);
                    const currentWhStock = getWarehouseStock(opFormWarehouseId, line.itemId);

                    return (
                      <div
                        key={idx}
                        className="p-3 bg-slate-50 rounded-xl border border-slate-200 grid grid-cols-12 gap-2 items-center text-xs"
                      >
                        {/* Item Picker */}
                        <div className="col-span-12 sm:col-span-5">
                          <label className="block text-[9px] text-slate-400 font-light mb-0.5">الصنف</label>
                          <select
                            value={line.itemId}
                            onChange={(e) => handleUpdateItemRow(idx, 'itemId', e.target.value)}
                            className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-800"
                          >
                            {inventory.map((inv, iIdx) => (
                              <option key={`wh-inv-${inv.id || iIdx}-${iIdx}`} value={inv.id}>
                                {inv.code} - {inv.name}
                              </option>
                            ))}
                          </select>
                          <span className="text-[10px] text-slate-400 mt-0.5 block">
                            الرصيد الحالي بالمستودع: <strong className="text-indigo-700 font-mono">{currentWhStock}</strong> {selectedItem?.unit || 'حبة'}
                          </span>
                        </div>

                        {/* Quantity / Counted */}
                        {selectedOpTypeForNew === 'audit' || selectedOpTypeForNew === 'settlement' ? (
                          <>
                            <div className="col-span-6 sm:col-span-3">
                              <label className="block text-[9px] text-slate-400 font-light mb-0.5">الفعلي بالجرد</label>
                              <input
                                type="number"
                                min="0"
                                value={line.countedQuantity !== undefined ? line.countedQuantity : line.quantity}
                                onChange={(e) => {
                                  const val = Number(e.target.value);
                                  handleUpdateItemRow(idx, 'countedQuantity', val);
                                  handleUpdateItemRow(idx, 'quantity', val);
                                }}
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-mono font-bold"
                              />
                            </div>
                            <div className="col-span-6 sm:col-span-3">
                              <label className="block text-[9px] text-slate-400 font-light mb-0.5">الفارق (عجز/فائض)</label>
                              <div className={`px-2 py-1.5 rounded-lg font-mono font-bold text-center ${
                                (line.countedQuantity || 0) - currentWhStock === 0
                                  ? 'bg-slate-100 text-slate-700'
                                  : (line.countedQuantity || 0) - currentWhStock > 0
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}>
                                {(line.countedQuantity || 0) - currentWhStock > 0 ? '+' : ''}
                                {(line.countedQuantity || 0) - currentWhStock}
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="col-span-6 sm:col-span-3">
                              <label className="block text-[9px] text-slate-400 font-light mb-0.5">الكمية *</label>
                              <input
                                type="number"
                                min="1"
                                required
                                value={line.quantity}
                                onChange={(e) => handleUpdateItemRow(idx, 'quantity', Number(e.target.value))}
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-mono font-bold"
                              />
                            </div>
                            <div className="col-span-6 sm:col-span-3">
                              <label className="block text-[9px] text-slate-400 font-light mb-0.5">تكلفة الوحدة (₪)</label>
                              <input
                                type="number"
                                step="0.1"
                                value={line.unitCost}
                                onChange={(e) => handleUpdateItemRow(idx, 'unitCost', Number(e.target.value))}
                                className="w-full px-2 py-1.5 bg-white border border-slate-200 rounded-lg font-mono"
                              />
                            </div>
                          </>
                        )}

                        {/* Remove */}
                        <div className="col-span-12 sm:col-span-1 flex justify-end">
                          {opFormItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveItemRow(idx)}
                              className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition"
                              title="حذف السطر"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Reason & Notes */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">سبب العملية *</label>
                  <input
                    type="text"
                    required
                    value={opFormReason}
                    onChange={(e) => setOpFormReason(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    placeholder="سبب الحركة..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات إضافية</label>
                  <input
                    type="text"
                    value={opFormNotes}
                    onChange={(e) => setOpFormNotes(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    placeholder="ملاحظات..."
                  />
                </div>
              </div>

              {/* Audit Footer Stamp Preview */}
              <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 flex items-center justify-between text-xs text-indigo-900">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span>
                    توثيق النظام: تم الربط بالمستخدم <strong>{currentUser.fullName}</strong> ({currentUser.roleName})
                  </span>
                </div>
                <span className="font-mono text-[11px] text-indigo-700">
                  {opFormDate} | {opFormTime}
                </span>
              </div>

              {/* Submit Buttons */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewOpModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer flex items-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>اعتماد العملية وحفظ المستند</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT WAREHOUSE */}
      {/* ========================================================= */}
      {isWarehouseModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Boxes className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">
                  {editingWarehouse ? 'تعديل بيانات المستودع' : 'إضافة مستودع / مخزن جديد'}
                </h3>
              </div>
              <button
                onClick={() => setIsWarehouseModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveWarehouse} className="p-6 space-y-3.5 text-xs sm:text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كود المخزن *</label>
                  <input
                    type="text"
                    required
                    value={whFormCode}
                    onChange={(e) => setWhFormCode(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono font-bold text-indigo-700"
                    placeholder="WH-01"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الفرع التابع *</label>
                  <select
                    value={whFormBranchId}
                    onChange={(e) => setWhFormBranchId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    {branches.map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم المستودع / المخزن *</label>
                <input
                  type="text"
                  required
                  value={whFormName}
                  onChange={(e) => setWhFormName(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-bold"
                  placeholder="مستودع الخامات والورق الرئيسي"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع المخزن *</label>
                  <select
                    value={whFormType}
                    onChange={(e) => setWhFormType(e.target.value as WarehouseType)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white font-bold text-slate-800"
                  >
                    <option value="general_main">مستودع رئيسي عام</option>
                    <option value="raw_materials">مواد خام وورق وأحبار</option>
                    <option value="finished_goods">منتجات تامة الصنع</option>
                    <option value="prints_packaging">مطبوعات وتغليف وكرتون</option>
                    <option value="stationery">قرطاسية ولوازم مكتبية</option>
                    <option value="production_in_progress">إنتاج قيد التشغيل</option>
                    <option value="damaged_scrap">تالف وهوالك ومستهلكات</option>
                    <option value="transit">ترانزيت وبضاعة بالطريق</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الحالة *</label>
                  <select
                    value={whFormStatus}
                    onChange={(e) => setWhFormStatus(e.target.value as WarehouseStatus)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg bg-white font-bold text-slate-800"
                  >
                    <option value="active">نشط ويعمل</option>
                    <option value="inactive">معطل / مغلق</option>
                    <option value="under_audit">قيد الجرد الفعلي</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المسؤول (أمين المخزن)</label>
                  <input
                    type="text"
                    value={whFormManager}
                    onChange={(e) => setWhFormManager(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    placeholder="عمر مستودعات"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">السعة التخزينية</label>
                  <input
                    type="text"
                    value={whFormCapacity}
                    onChange={(e) => setWhFormCapacity(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono"
                    placeholder="1,200 م³"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الموقع الفعلي</label>
                  <input
                    type="text"
                    value={whFormLocation}
                    onChange={(e) => setWhFormLocation(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                    placeholder="الطابق الأرضي - البوابة 3"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الهاتف</label>
                  <input
                    type="text"
                    value={whFormPhone}
                    onChange={(e) => setWhFormPhone(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg font-mono"
                    placeholder="0599-..."
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات</label>
                <input
                  type="text"
                  value={whFormNotes}
                  onChange={(e) => setWhFormNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  placeholder="ملاحظات حول طبيعة التخزين..."
                />
              </div>

              <label className="flex items-center gap-2 p-2 bg-slate-50 rounded-lg cursor-pointer text-xs">
                <input
                  type="checkbox"
                  checked={whFormIsDefault}
                  onChange={(e) => setWhFormIsDefault(e.target.checked)}
                  className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span className="font-bold text-slate-700">تعيين كمستودع رئيسي للفرع</span>
              </label>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsWarehouseModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer"
                >
                  حفظ المستودع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: VIEW & PRINT OPERATION VOUCHER */}
      {/* ========================================================= */}
      {viewingOperation && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in zoom-in-95 duration-150">
            {/* Action Bar (Not printed) */}
            <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-400" />
                <span className="font-bold text-sm">معاينة وطباعة المستند المخزني</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>طباعة المستند</span>
                </button>
                <button
                  onClick={() => setViewingOperation(null)}
                  className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Document Body */}
            <div className="p-8 space-y-6 text-slate-900 print:p-4">
              {/* Document Header - يعتمد الهيدر الكامل أو الترويسة القياسية */}
              <PrintHeader
                title={OPERATION_TYPE_INFO[viewingOperation.operationType].label}
                subtitle="Warehouse Inventory Movement Voucher"
                docNumber={viewingOperation.documentNumber}
                docDate={`${viewingOperation.date} ${viewingOperation.time || ''}`}
                badge="مستند حركة مخزنية"
                extraMeta={
                  <div className="text-indigo-700 font-bold">
                    <span>الفرع: </span>
                    <span>{viewingOperation.branchName}</span>
                  </div>
                }
              />

              {/* Title Badge */}
              <div className="text-center py-2 bg-slate-100 rounded-xl">
                <h3 className="text-base font-black text-slate-900">
                  {OPERATION_TYPE_INFO[viewingOperation.operationType].label}
                </h3>
                <p className="text-[10px] text-slate-400 font-light">
                  {OPERATION_TYPE_INFO[viewingOperation.operationType].desc}
                </p>
              </div>

              {/* Information Grid */}
              <div className="grid grid-cols-2 gap-4 text-xs bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <span className="text-slate-400 block text-[11px]">المستودع المصدر:</span>
                  <strong className="text-sm font-bold text-slate-900">{viewingOperation.warehouseName}</strong>
                </div>

                {viewingOperation.targetWarehouseName && (
                  <div>
                    <span className="text-slate-400 block text-[11px]">المستودع المستهدف:</span>
                    <strong className="text-sm font-bold text-blue-700">
                      {viewingOperation.targetWarehouseName} ({viewingOperation.targetBranchName})
                    </strong>
                  </div>
                )}

                <div>
                  <span className="text-slate-400 block text-[11px]">المستخدم المسؤول (المنفذ):</span>
                  <strong className="text-slate-900 font-bold">
                    {viewingOperation.userName} {viewingOperation.userRole ? `(${viewingOperation.userRole})` : ''}
                  </strong>
                </div>

                <div>
                  <span className="text-slate-400 block text-[11px]">السبب / الغرض:</span>
                  <span className="text-slate-800 font-medium">{viewingOperation.reason}</span>
                </div>

                {viewingOperation.referenceNumber && (
                  <div>
                    <span className="text-slate-400 block text-[11px]">رقم المرجع:</span>
                    <span className="font-mono font-bold text-slate-800">{viewingOperation.referenceNumber}</span>
                  </div>
                )}
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden text-xs">
                <table className="w-full text-right">
                  <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">كود الصنف</th>
                      <th className="p-2.5">اسم الصنف</th>
                      <th className="p-2.5 text-center">الكمية</th>
                      <th className="p-2.5 text-center">التكلفة</th>
                      <th className="p-2.5 text-center">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {viewingOperation.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="p-2.5 font-mono text-slate-400">{idx + 1}</td>
                        <td className="p-2.5 font-mono font-bold text-indigo-700">{item.itemCode}</td>
                        <td className="p-2.5 font-bold text-slate-900">
                          {item.itemName}
                          {item.countedQuantity !== undefined && (
                            <span className="block text-[10px] text-slate-400">
                              (الفعلي: {item.countedQuantity} | الفارق: {item.discrepancy})
                            </span>
                          )}
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-slate-900">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="p-2.5 text-center font-mono text-slate-700">
                          {item.unitCost} ₪
                        </td>
                        <td className="p-2.5 text-center font-mono font-bold text-emerald-700">
                          {item.totalCost.toLocaleString()} ₪
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t border-slate-200">
                    <tr>
                      <td colSpan={3} className="p-2.5 text-slate-700">المجموع الكلي</td>
                      <td className="p-2.5 text-center font-mono text-slate-900">
                        {viewingOperation.totalQuantity}
                      </td>
                      <td></td>
                      <td className="p-2.5 text-center font-mono text-emerald-700">
                        {viewingOperation.totalValue.toLocaleString()} ₪
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {viewingOperation.notes && (
                <div className="p-3 bg-slate-50 rounded-lg text-xs text-slate-600 border border-slate-200">
                  <strong>ملاحظات: </strong> {viewingOperation.notes}
                </div>
              )}

              {/* Signatures */}
              <div className="grid grid-cols-3 gap-6 pt-8 border-t border-slate-200 text-center text-xs">
                <div>
                  <span className="text-slate-400 block mb-8">أمين المخزن</span>
                  <div className="border-b border-slate-300 w-3/4 mx-auto"></div>
                </div>
                <div>
                  <span className="text-slate-400 block mb-8">المستلم / المسؤول</span>
                  <div className="border-b border-slate-300 w-3/4 mx-auto"></div>
                </div>
                <div>
                  <span className="text-slate-400 block mb-8">اعتماد الإدارة</span>
                  <div className="border-b border-slate-300 w-3/4 mx-auto"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
