import React, { useState, useMemo } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Branch, Company, Warehouse } from '../types';
import {
  Building2,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  Phone,
  MapPin,
  User,
  Boxes,
  Wallet,
  Landmark,
  Layers,
  ArrowRight,
  ShieldCheck,
  Store,
  Sparkles,
  Info,
  Check,
  Search,
  Filter
} from 'lucide-react';

export const BranchesManagementView: React.FC = () => {
  const {
    companies,
    addCompany,
    updateCompany,
    deleteCompany,
    branches,
    activeBranchId,
    setActiveBranchId,
    addBranch,
    updateBranch,
    deleteBranch,
    warehouses,
    addWarehouse,
    updateWarehouse,
    deleteWarehouse,
    treasuries,
    currentUser,
    hasPermission,
    settings
  } = useAccounting();

  const [activeTab, setActiveTabState] = useState<'branches' | 'companies' | 'warehouses'>(() => {
    try {
      const saved = localStorage.getItem('branches_subtab');
      if (saved && ['branches', 'companies', 'warehouses'].includes(saved)) {
        return saved as any;
      }
    } catch {}
    return 'branches';
  });

  const setActiveTab = React.useCallback((tab: 'branches' | 'companies' | 'warehouses') => {
    setActiveTabState(tab);
    try {
      localStorage.setItem('branches_subtab', tab);
    } catch {}
  }, []);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);

  const [isCompanyModalOpen, setIsCompanyModalOpen] = useState(false);
  const [editingCompany, setEditingCompany] = useState<Company | null>(null);

  const [isWarehouseModalOpen, setIsWarehouseModalOpen] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);

  // Form states for Branch
  const [branchForm, setBranchForm] = useState({
    companyId: 'comp-1',
    branchNumber: '',
    branchCode: '',
    name: '',
    address: '',
    phone: '',
    manager: '',
    status: 'active' as 'active' | 'inactive',
    warehouseIds: [] as string[],
    treasuryIds: [] as string[],
    bankAccountIds: [] as string[],
    notes: '',
    isMain: false
  });

  // Form states for Company
  const [companyForm, setCompanyForm] = useState({
    code: '',
    name: '',
    tradeName: '',
    crNumber: '',
    taxNumber: '',
    address: '',
    phone: '',
    email: '',
    currency: 'ILS',
    status: 'active' as 'active' | 'inactive',
    notes: ''
  });

  // Form states for Warehouse
  const [warehouseForm, setWarehouseForm] = useState({
    code: '',
    name: '',
    companyId: 'comp-1',
    branchId: 'br-1',
    location: '',
    manager: '',
    phone: '',
    status: 'active' as 'active' | 'inactive',
    notes: '',
    isDefault: false
  });

  // Filtered branches
  const filteredBranches = useMemo(() => {
    return branches.filter(b =>
      b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.branchCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.manager.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.address.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [branches, searchQuery]);

  // Filtered companies
  const filteredCompanies = useMemo(() => {
    return companies.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (c.crNumber && c.crNumber.includes(searchQuery))
    );
  }, [companies, searchQuery]);

  // Filtered warehouses
  const filteredWarehouses = useMemo(() => {
    return warehouses.filter(w =>
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.manager && w.manager.toLowerCase().includes(searchQuery.toLowerCase()))
    );
  }, [warehouses, searchQuery]);

  // Open Branch Modal
  const handleOpenBranchModal = (branch?: Branch) => {
    if (branch) {
      setEditingBranch(branch);
      setBranchForm({
        companyId: branch.companyId || 'comp-1',
        branchNumber: branch.branchNumber,
        branchCode: branch.branchCode,
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
        manager: branch.manager,
        status: branch.status,
        warehouseIds: [...branch.warehouseIds],
        treasuryIds: [...branch.treasuryIds],
        bankAccountIds: [...branch.bankAccountIds],
        notes: branch.notes || '',
        isMain: !!branch.isMain
      });
    } else {
      setEditingBranch(null);
      const nextNum = branches.length + 1;
      setBranchForm({
        companyId: companies[0]?.id || 'comp-1',
        branchNumber: String(nextNum),
        branchCode: `BR-0${nextNum}`,
        name: '',
        address: '',
        phone: '',
        manager: currentUser.fullName || '',
        status: 'active',
        warehouseIds: warehouses.slice(0, 1).map(w => w.id),
        treasuryIds: ['1101'],
        bankAccountIds: ['1102'],
        notes: '',
        isMain: branches.length === 0
      });
    }
    setIsBranchModalOpen(true);
  };

  // Save Branch
  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchForm.name.trim() || !branchForm.branchCode.trim()) {
      alert('يرجى كتابة اسم الفرع وكود الفرع');
      return;
    }

    if (editingBranch) {
      updateBranch(editingBranch.id, branchForm);
    } else {
      addBranch(branchForm);
    }
    setIsBranchModalOpen(false);
  };

  // Open Company Modal
  const handleOpenCompanyModal = (comp?: Company) => {
    if (comp) {
      setEditingCompany(comp);
      setCompanyForm({
        code: comp.code,
        name: comp.name,
        tradeName: comp.tradeName || '',
        crNumber: comp.crNumber || '',
        taxNumber: comp.taxNumber || '',
        address: comp.address,
        phone: comp.phone,
        email: comp.email || '',
        currency: comp.currency,
        status: comp.status,
        notes: comp.notes || ''
      });
    } else {
      setEditingCompany(null);
      setCompanyForm({
        code: `COMP-0${companies.length + 1}`,
        name: '',
        tradeName: '',
        crNumber: '',
        taxNumber: '',
        address: '',
        phone: '',
        email: '',
        currency: settings.baseCurrencyCode || 'ILS',
        status: 'active',
        notes: ''
      });
    }
    setIsCompanyModalOpen(true);
  };

  // Save Company
  const handleSaveCompany = (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyForm.name.trim() || !companyForm.code.trim()) {
      alert('يرجى إدخال اسم وكود المنشأة / الشركة');
      return;
    }

    if (editingCompany) {
      updateCompany(editingCompany.id, companyForm);
    } else {
      addCompany(companyForm);
    }
    setIsCompanyModalOpen(false);
  };

  // Open Warehouse Modal
  const handleOpenWarehouseModal = (wh?: Warehouse) => {
    if (wh) {
      setEditingWarehouse(wh);
      setWarehouseForm({
        code: wh.code,
        name: wh.name,
        companyId: wh.companyId,
        branchId: wh.branchId || 'br-1',
        location: wh.location || '',
        manager: wh.manager || '',
        phone: wh.phone || '',
        status: wh.status,
        notes: wh.notes || '',
        isDefault: !!wh.isDefault
      });
    } else {
      setEditingWarehouse(null);
      setWarehouseForm({
        code: `WH-0${warehouses.length + 1}`,
        name: '',
        companyId: companies[0]?.id || 'comp-1',
        branchId: activeBranchId || branches[0]?.id || 'br-1',
        location: '',
        manager: '',
        phone: '',
        status: 'active',
        notes: '',
        isDefault: warehouses.length === 0
      });
    }
    setIsWarehouseModalOpen(true);
  };

  // Save Warehouse
  const handleSaveWarehouse = (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseForm.name.trim() || !warehouseForm.code.trim()) {
      alert('يرجى إدخال اسم المستودع وكوده');
      return;
    }

    if (editingWarehouse) {
      updateWarehouse(editingWarehouse.id, warehouseForm);
    } else {
      addWarehouse(warehouseForm);
    }
    setIsWarehouseModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white p-6 rounded-2xl shadow-sm border border-slate-700/80 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shadow-inner">
            <Building2 className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight">إدارة الشركات والفروع والمستودعات</h1>
              <span className="text-xs bg-indigo-500/30 text-indigo-300 font-semibold px-2.5 py-0.5 rounded-full border border-indigo-400/40">
                Multi-Branch ERP
              </span>
            </div>
            <p className="text-sm text-slate-300 mt-1">
              هيكل تنظيمي مرن يربط الفروع بالمخازن التابعة والصناديق النقدية والحسابات البنكية مع تحديد صلاحيات وصول المستخدمين.
            </p>
          </div>
        </div>

        {/* Quick Action */}
        <div className="flex items-center gap-2 self-stretch md:self-auto">
          {activeTab === 'branches' && (
            <button
              onClick={() => handleOpenBranchModal()}
              className="w-full md:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer transition"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة فرع جديد</span>
            </button>
          )}
          {activeTab === 'companies' && (
            <button
              onClick={() => handleOpenCompanyModal()}
              className="w-full md:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer transition"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة شركة / منشأة</span>
            </button>
          )}
          {activeTab === 'warehouses' && (
            <button
              onClick={() => handleOpenWarehouseModal()}
              className="w-full md:w-auto px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm cursor-pointer transition"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة مستودع / مخزن</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs & Search Filter */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          <button
            onClick={() => setActiveTab('branches')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
              activeTab === 'branches'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Store className="w-4 h-4" />
            <span>الفروع ومنافذ البيع</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono ${
              activeTab === 'branches' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {branches.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('companies')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
              activeTab === 'companies'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>الشركات والمنشآت</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono ${
              activeTab === 'companies' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {companies.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('warehouses')}
            className={`px-4 py-2 rounded-lg text-xs sm:text-sm font-bold flex items-center gap-2 cursor-pointer transition whitespace-nowrap ${
              activeTab === 'warehouses'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Boxes className="w-4 h-4" />
            <span>المخازن والمستودعات</span>
            <span className={`px-1.5 py-0.5 rounded-md text-[11px] font-mono ${
              activeTab === 'warehouses' ? 'bg-indigo-700 text-white' : 'bg-slate-200 text-slate-700'
            }`}>
              {warehouses.length}
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="relative min-w-[240px]">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، الكود، المدير..."
            className="w-full pl-3 pr-9 py-1.5 text-xs sm:text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white"
          />
        </div>
      </div>

      {/* ========================================================= */}
      {/* 1. BRANCHES LIST TAB */}
      {/* ========================================================= */}
      {activeTab === 'branches' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredBranches.map(branch => {
              const isActive = branch.id === activeBranchId;
              const company = companies.find(c => c.id === branch.companyId);
              const branchWarehouses = warehouses.filter(w => branch.warehouseIds.includes(w.id));
              const branchTreasuries = treasuries.filter(t => branch.treasuryIds.includes(t.accountCode) || branch.treasuryIds.includes(t.id));

              return (
                <div
                  key={branch.id}
                  className={`bg-white rounded-2xl border p-5 transition shadow-xs hover:shadow-md flex flex-col justify-between ${
                    isActive
                      ? 'border-indigo-500 ring-2 ring-indigo-500/20'
                      : 'border-slate-200'
                  }`}
                >
                  <div>
                    {/* Top Header */}
                    <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200">
                            {branch.branchCode}
                          </span>
                          <span className="text-[10px] text-slate-400 font-light font-medium">رقم #{branch.branchNumber}</span>
                          {branch.isMain && (
                            <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                              المركز الرئيسي ⭐
                            </span>
                          )}
                        </div>
                        <h3 className="font-black text-slate-900 text-base mt-1.5">{branch.name}</h3>
                        <p className="text-[10px] text-slate-400 font-light">{company?.name || 'الشركة الرئيسية'}</p>
                      </div>

                      <div className="flex items-center gap-1">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                          branch.status === 'active'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-rose-50 text-rose-700 border border-rose-200'
                        }`}>
                          {branch.status === 'active' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" />
                              <span>نشط</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3" />
                              <span>غير نشط</span>
                            </>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Branch Details */}
                    <div className="py-3.5 space-y-2 text-xs text-slate-600">
                      <div className="flex items-center gap-2">
                        <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-500">المدير:</span>
                        <span className="font-bold text-slate-800">{branch.manager}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-500">الهاتف:</span>
                        <span className="font-mono text-slate-800" dir="ltr">{branch.phone}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-500">العنوان:</span>
                        <span className="text-slate-800 truncate">{branch.address}</span>
                      </div>
                    </div>

                    {/* Associated Assets (المخازن والصناديق التابعة) */}
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <div>
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1 mb-1">
                          <Boxes className="w-3.5 h-3.5 text-indigo-500" />
                          <span>المخازن التابعة ({branchWarehouses.length}):</span>
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {branchWarehouses.map(w => (
                            <span key={w.id} className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200">
                              {w.name}
                            </span>
                          ))}
                          {branchWarehouses.length === 0 && (
                            <span className="text-[11px] text-slate-400 italic">لا توجد مخازن مخصصة</span>
                          )}
                        </div>
                      </div>

                      <div>
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1 mb-1">
                          <Wallet className="w-3.5 h-3.5 text-emerald-500" />
                          <span>الصناديق والبنوك ({branch.treasuryIds.length + branch.bankAccountIds.length}):</span>
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {branch.treasuryIds.map(code => (
                            <span key={code} className="text-[10px] bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded border border-emerald-200 font-mono">
                              كاشير {code}
                            </span>
                          ))}
                          {branch.bankAccountIds.map(code => (
                            <span key={code} className="text-[10px] bg-blue-50 text-blue-800 px-2 py-0.5 rounded border border-blue-200 font-mono">
                              بنكي {code}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Footer */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => setActiveBranchId(branch.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                        isActive
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700'
                      }`}
                      title={isActive ? 'هذا هو الفرع النشط حالياً بالنظام' : 'التبديل إلى هذا الفرع'}
                    >
                      {isActive ? (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          <span>الفرع النشط حالياً ✓</span>
                        </>
                      ) : (
                        <>
                          <Store className="w-3.5 h-3.5" />
                          <span>تفعيل الفرع</span>
                        </>
                      )}
                    </button>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleOpenBranchModal(branch)}
                        className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-lg transition cursor-pointer"
                        title="تعديل بيانات الفرع"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      {branches.length > 1 && (
                        <button
                          onClick={() => {
                            if (window.confirm(`هل أنت متأكد من حذف ${branch.name}؟`)) {
                              const res = deleteBranch(branch.id);
                              if (!res.success) alert(res.message);
                            }
                          }}
                          className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                          title="حذف الفرع"
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
      {/* 2. COMPANIES LIST TAB */}
      {/* ========================================================= */}
      {activeTab === 'companies' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCompanies.map(comp => {
            const compBranches = branches.filter(b => b.companyId === comp.id);
            const compWarehouses = warehouses.filter(w => w.companyId === comp.id);

            return (
              <div
                key={comp.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                          {comp.code}
                        </span>
                        {comp.isDefault && (
                          <span className="text-[10px] bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold">
                            المنشأة الأم الافتراضية ⭐
                          </span>
                        )}
                      </div>
                      <h3 className="font-black text-slate-900 text-lg mt-1.5">{comp.name}</h3>
                      {comp.tradeName && (
                        <p className="text-[10px] text-slate-400 font-light font-semibold">{comp.tradeName}</p>
                      )}
                    </div>

                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      comp.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {comp.status === 'active' ? 'نشطة' : 'غير نشطة'}
                    </span>
                  </div>

                  <div className="py-3 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[11px]">السجل التجاري (CR):</span>
                      <strong className="font-mono text-slate-800">{comp.crNumber || 'غير مسجل'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">الرقم الضريبي (VAT):</span>
                      <strong className="font-mono text-slate-800">{comp.taxNumber || 'غير مسجل'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">العملة الأساسية:</span>
                      <strong className="font-bold text-slate-800">{comp.currency} (شيكل)</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">الهاتف:</span>
                      <strong className="font-mono text-slate-800" dir="ltr">{comp.phone}</strong>
                    </div>
                    <div className="col-span-2">
                      <span className="text-slate-400 block text-[11px]">العنوان:</span>
                      <span className="text-slate-800">{comp.address}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center gap-4 text-xs">
                    <div className="flex items-center gap-1 text-indigo-700 font-bold bg-indigo-50 px-2.5 py-1 rounded-lg">
                      <Store className="w-3.5 h-3.5" />
                      <span>{compBranches.length} فروع تابعة</span>
                    </div>
                    <div className="flex items-center gap-1 text-slate-700 font-bold bg-slate-100 px-2.5 py-1 rounded-lg">
                      <Boxes className="w-3.5 h-3.5 text-slate-500" />
                      <span>{compWarehouses.length} مستودعات</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleOpenCompanyModal(comp)}
                    className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-lg transition cursor-pointer"
                    title="تعديل المنشأة"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {companies.length > 1 && (
                    <button
                      onClick={() => {
                        if (window.confirm(`هل أنت متأكد من حذف ${comp.name}؟`)) {
                          const res = deleteCompany(comp.id);
                          if (!res.success) alert(res.message);
                        }
                      }}
                      className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition cursor-pointer"
                      title="حذف المنشأة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ========================================================= */}
      {/* 3. WAREHOUSES LIST TAB */}
      {/* ========================================================= */}
      {activeTab === 'warehouses' && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredWarehouses.map(wh => {
            const branch = branches.find(b => b.id === wh.branchId);

            return (
              <div
                key={wh.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs hover:shadow-md transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-100">
                    <div>
                      <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                        {wh.code}
                      </span>
                      <h3 className="font-black text-slate-900 text-base mt-1.5">{wh.name}</h3>
                      <p className="text-xs text-indigo-600 font-semibold">
                        تابعة لـ: {branch ? branch.name : 'المركز الرئيسي'}
                      </p>
                    </div>

                    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      wh.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}>
                      {wh.status === 'active' ? 'نشط' : 'معطل'}
                    </span>
                  </div>

                  <div className="py-3 space-y-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-slate-500">أمين المخزن:</span>
                      <span className="font-bold text-slate-800">{wh.manager || 'غير محدد'}</span>
                    </div>

                    {wh.location && (
                      <div className="flex items-center gap-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-500">الموقع:</span>
                        <span className="text-slate-800">{wh.location}</span>
                      </div>
                    )}

                    {wh.notes && (
                      <p className="text-[10px] text-slate-400 font-light bg-slate-50 p-2 rounded-lg border border-slate-100">
                        {wh.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-end gap-1">
                  <button
                    onClick={() => handleOpenWarehouseModal(wh)}
                    className="p-1.5 hover:bg-slate-100 text-slate-500 hover:text-indigo-600 rounded-lg transition cursor-pointer"
                    title="تعديل المستودع"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  {warehouses.length > 1 && (
                    <button
                      onClick={() => {
                        if (window.confirm(`هل أنت متأكد من حذف مستودع ${wh.name}؟`)) {
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
            );
          })}
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT BRANCH */}
      {/* ========================================================= */}
      {isBranchModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Store className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">
                  {editingBranch ? 'تعديل بيانات الفرع' : 'إضافة فرع جديد للمنشأة'}
                </h3>
              </div>
              <button
                onClick={() => setIsBranchModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveBranch} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الفرع *</label>
                  <input
                    type="text"
                    required
                    value={branchForm.branchNumber}
                    onChange={(e) => setBranchForm({ ...branchForm, branchNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono"
                    placeholder="1"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كود الفرع *</label>
                  <input
                    type="text"
                    required
                    value={branchForm.branchCode}
                    onChange={(e) => setBranchForm({ ...branchForm, branchCode: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono font-bold text-indigo-700"
                    placeholder="BR-01"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الشركة التابعة</label>
                  <select
                    value={branchForm.companyId}
                    onChange={(e) => setBranchForm({ ...branchForm, companyId: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    {companies.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">اسم الفرع *</label>
                <input
                  type="text"
                  required
                  value={branchForm.name}
                  onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg"
                  placeholder="مثال: فرع المركز الرئيسي والإدارة"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">المدير المسؤول *</label>
                  <input
                    type="text"
                    required
                    value={branchForm.manager}
                    onChange={(e) => setBranchForm({ ...branchForm, manager: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg"
                    placeholder="أ. رائد صالحة"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الهاتف *</label>
                  <input
                    type="text"
                    required
                    value={branchForm.phone}
                    onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono"
                    placeholder="02-6284900"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العنوان التفصيلي *</label>
                <input
                  type="text"
                  required
                  value={branchForm.address}
                  onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg"
                  placeholder="القدس - شارع صلاح الدين - مجمع النور التجاري"
                />
              </div>

              {/* Associated Warehouses (المخازن التابعة) */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  المخازن التابعة لهذا الفرع (تحديد المستودعات):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {warehouses.map(wh => {
                    const isChecked = branchForm.warehouseIds.includes(wh.id);
                    return (
                      <label
                        key={wh.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                          isChecked ? 'bg-indigo-50 border-indigo-300 text-indigo-900 font-bold' : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setBranchForm({ ...branchForm, warehouseIds: [...branchForm.warehouseIds, wh.id] });
                            } else {
                              setBranchForm({ ...branchForm, warehouseIds: branchForm.warehouseIds.filter(id => id !== wh.id) });
                            }
                          }}
                          className="rounded text-indigo-600"
                        />
                        <span>{wh.name} ({wh.code})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Associated Treasuries (الصناديق التابعة) */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800">
                  الصناديق والحسابات التابعة للفرع (نقدية وبنوك):
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {treasuries.map(tr => {
                    const isChecked = branchForm.treasuryIds.includes(tr.accountCode) || branchForm.bankAccountIds.includes(tr.accountCode);
                    return (
                      <label
                        key={tr.id}
                        className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition ${
                          isChecked ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold' : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              if (tr.type === 'bank') {
                                setBranchForm({ ...branchForm, bankAccountIds: [...branchForm.bankAccountIds, tr.accountCode] });
                              } else {
                                setBranchForm({ ...branchForm, treasuryIds: [...branchForm.treasuryIds, tr.accountCode] });
                              }
                            } else {
                              setBranchForm({
                                ...branchForm,
                                treasuryIds: branchForm.treasuryIds.filter(id => id !== tr.accountCode),
                                bankAccountIds: branchForm.bankAccountIds.filter(id => id !== tr.accountCode)
                              });
                            }
                          }}
                          className="rounded text-emerald-600"
                        />
                        <span className="font-mono text-[10px] text-slate-400 font-light">[{tr.accountCode}]</span>
                        <span>{tr.name} ({tr.type === 'bank' ? 'بنكي' : 'صندوق كاش'})</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الحالة</label>
                  <select
                    value={branchForm.status}
                    onChange={(e) => setBranchForm({ ...branchForm, status: e.target.value as 'active' | 'inactive' })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="active">نشط ويعمل</option>
                    <option value="inactive">معطل مؤقتاً</option>
                  </select>
                </div>

                <div className="flex items-center pt-6">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={branchForm.isMain}
                      onChange={(e) => setBranchForm({ ...branchForm, isMain: e.target.checked })}
                      className="rounded text-indigo-600"
                    />
                    <span>تعيين كالفرع الرئيسي للمنشأة ⭐</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">ملاحظات الفرع</label>
                <textarea
                  rows={2}
                  value={branchForm.notes}
                  onChange={(e) => setBranchForm({ ...branchForm, notes: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg"
                  placeholder="ملاحظات إضافية حول ساعات العمل، الورش التابعة، إلخ..."
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBranchModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs cursor-pointer"
                >
                  حفظ الفرع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL: ADD / EDIT COMPANY */}
      {/* ========================================================= */}
      {isCompanyModalOpen && (
        <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 animate-in zoom-in-95 duration-150">
            <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">
                  {editingCompany ? 'تعديل بيانات الشركة / المنشأة' : 'إضافة شركة أو منشأة جديدة'}
                </h3>
              </div>
              <button
                onClick={() => setIsCompanyModalOpen(false)}
                className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCompany} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كود المنشأة *</label>
                  <input
                    type="text"
                    required
                    value={companyForm.code}
                    onChange={(e) => setCompanyForm({ ...companyForm, code: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono font-bold text-indigo-700"
                    placeholder="COMP-01"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">العملة الأساسية</label>
                  <input
                    type="text"
                    value={companyForm.currency}
                    onChange={(e) => setCompanyForm({ ...companyForm, currency: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono"
                    placeholder="ILS"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الاسم القانوني للمنشأة *</label>
                <input
                  type="text"
                  required
                  value={companyForm.name}
                  onChange={(e) => setCompanyForm({ ...companyForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-bold"
                  placeholder="مطبعة ومكتبة القدس الحديثة"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الاسم التجاري / العلامة</label>
                <input
                  type="text"
                  value={companyForm.tradeName}
                  onChange={(e) => setCompanyForm({ ...companyForm, tradeName: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg"
                  placeholder="دار القدس للطباعة والنشر"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم السجل التجاري (CR)</label>
                  <input
                    type="text"
                    value={companyForm.crNumber}
                    onChange={(e) => setCompanyForm({ ...companyForm, crNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono"
                    placeholder="1029384756"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الرقم الضريبي (VAT)</label>
                  <input
                    type="text"
                    value={companyForm.taxNumber}
                    onChange={(e) => setCompanyForm({ ...companyForm, taxNumber: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono"
                    placeholder="300192837400003"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الهاتف</label>
                  <input
                    type="text"
                    value={companyForm.phone}
                    onChange={(e) => setCompanyForm({ ...companyForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono"
                    placeholder="02-6284900"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">البريد الإلكتروني</label>
                  <input
                    type="email"
                    value={companyForm.email}
                    onChange={(e) => setCompanyForm({ ...companyForm, email: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono"
                    placeholder="info@company.com"
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">العنوان الرئيسي</label>
                <input
                  type="text"
                  value={companyForm.address}
                  onChange={(e) => setCompanyForm({ ...companyForm, address: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg"
                  placeholder="القدس - شارع صلاح الدين"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCompanyModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs cursor-pointer"
                >
                  حفظ المنشأة
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

            <form onSubmit={handleSaveWarehouse} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">كود المخزن *</label>
                  <input
                    type="text"
                    required
                    value={warehouseForm.code}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono font-bold text-indigo-700"
                    placeholder="WH-01"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الفرع التابع *</label>
                  <select
                    value={warehouseForm.branchId}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, branchId: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg bg-white"
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
                  value={warehouseForm.name}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-bold"
                  placeholder="مستودع الخامات والورق"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">أمين المخزن المسؤول</label>
                  <input
                    type="text"
                    value={warehouseForm.manager}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, manager: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg"
                    placeholder="عمر مستودعات"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الهاتف</label>
                  <input
                    type="text"
                    value={warehouseForm.phone}
                    onChange={(e) => setWarehouseForm({ ...warehouseForm, phone: e.target.value })}
                    className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg font-mono"
                    placeholder="0599-..."
                    dir="ltr"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">الموقع الفعلي</label>
                <input
                  type="text"
                  value={warehouseForm.location}
                  onChange={(e) => setWarehouseForm({ ...warehouseForm, location: e.target.value })}
                  className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-lg"
                  placeholder="الهنجر الشرقي - الطابق الأرضي"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsWarehouseModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl text-xs sm:text-sm font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs sm:text-sm font-bold shadow-xs cursor-pointer"
                >
                  حفظ المستودع
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
