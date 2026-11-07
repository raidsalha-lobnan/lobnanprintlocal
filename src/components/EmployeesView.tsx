import React, { useState, useMemo } from 'react';
import { DateInput } from '../components/common/DateInput';
import { useAccounting } from '../context/AccountingContext';
import { Employee, SalaryType, EmployeeDepartment, PaymentMethod, PayrollSheet } from '../types';
import { posSound } from '../utils/audio';
import { EmployeeAdjustmentsView } from './EmployeeAdjustmentsView';
import { PayrollSheetsView } from './PayrollSheetsView';
import { EmployeeAdjustmentsModal } from './EmployeeAdjustmentsModal';
import { PayrollSheetModal } from './PayrollSheetModal';
import {
  Users,
  UserPlus,
  Search,
  Filter,
  Phone,
  Mail,
  Calendar,
  DollarSign,
  CreditCard,
  Banknote,
  Building2,
  CheckCircle2,
  Clock,
  AlertCircle,
  Edit2,
  Trash2,
  Printer,
  Eye,
  Briefcase,
  FileText,
  X,
  TrendingUp,
  Award,
  Layers,
  Check,
  AlertTriangle,
  History,
  Send,
  FileSpreadsheet,
  MinusCircle,
  PlusCircle
} from 'lucide-react';

const DEPARTMENT_LABELS: Record<EmployeeDepartment, { name: string; color: string }> = {
  printing: { name: 'ورشة ومكائن الطباعة', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  design: { name: 'التصميم والجرافيك والفرز', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  sales_pos: { name: 'المبيعات ونقاط البيع', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  finishing: { name: 'التجليد والتشطيب والقص', color: 'bg-amber-100 text-amber-800 border-amber-200' },
  management: { name: 'الإدارة والإشراف العام', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  accounting: { name: 'المحاسبة والمالية', color: 'bg-teal-100 text-teal-800 border-teal-200' },
  delivery: { name: 'التوصيل والخدمات اللوجستية', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  other: { name: 'أقسام أخرى', color: 'bg-slate-100 text-slate-800 border-slate-200' },
};

const SALARY_TYPE_INFO: Record<SalaryType, { label: string; badge: string; desc: string }> = {
  monthly: { label: 'راتب شهري', badge: 'bg-blue-50 text-blue-700 border-blue-200', desc: 'يُصرف نهاية كل شهر ميلادي' },
  weekly: { label: 'راتب أسبوعي', badge: 'bg-amber-50 text-amber-700 border-amber-200', desc: 'يُصرف نهاية كل أسبوع (الخميس)' },
  daily: { label: 'راتب يومي (يومية)', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', desc: 'يُحسب ويُصرف حسب أيام العمل الفعلية' }
};

interface EmployeesViewProps {
  initialSubTab?: 'employees' | 'adjustments' | 'payroll_sheets';
}

export const EmployeesView: React.FC<EmployeesViewProps> = ({ initialSubTab = 'employees' }) => {
  const {
    employees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    payEmployeeSalary,
    employeeAdvances,
    employeeDeductions,
    employeeIncentives,
    payrollSheets,
    setSelectedEmployeeForStatement,
    settings
  } = useAccounting();

  // Primary Sub-navigation tab
  const [activeSubTab, setActiveSubTabState] = useState<'employees' | 'adjustments' | 'payroll_sheets'>(() => {
    try {
      const saved = localStorage.getItem('employees_subtab');
      if (saved && ['employees', 'adjustments', 'payroll_sheets'].includes(saved)) {
        return saved as any;
      }
    } catch {}
    return initialSubTab;
  });

  const setActiveSubTab = React.useCallback((tab: 'employees' | 'adjustments' | 'payroll_sheets') => {
    setActiveSubTabState(tab);
    try {
      localStorage.setItem('employees_subtab', tab);
    } catch {}
  }, []);

  React.useEffect(() => {
    if (initialSubTab && !localStorage.getItem('employees_subtab')) {
      setActiveSubTab(initialSubTab);
    }
  }, [initialSubTab, setActiveSubTab]);

  // Adjustments modal state
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [adjustmentType, setAdjustmentType] = useState<'advance' | 'deduction' | 'incentive'>('advance');
  const [adjustmentPreselectedEmpId, setAdjustmentPreselectedEmpId] = useState<string | undefined>(undefined);

  // Payroll Sheet modal state
  const [showPayrollSheetModal, setShowPayrollSheetModal] = useState(false);
  const [editingPayrollSheet, setEditingPayrollSheet] = useState<PayrollSheet | null>(null);

  // Helper callbacks
  const handleOpenAdjustment = (type: 'advance' | 'deduction' | 'incentive', employeeId?: string) => {
    setAdjustmentType(type);
    setAdjustmentPreselectedEmpId(employeeId);
    setShowAdjustmentModal(true);
  };

  const handleOpenCreatePayrollSheet = () => {
    setEditingPayrollSheet(null);
    setShowPayrollSheetModal(true);
  };

  const handleOpenEditPayrollSheet = (sheet: PayrollSheet) => {
    setEditingPayrollSheet(sheet);
    setShowPayrollSheetModal(true);
  };

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState<string>('all');
  const [selectedSalaryType, setSelectedSalaryType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  // Modal states
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedEmployeeForDetail, setSelectedEmployeeForDetail] = useState<Employee | null>(null);

  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedEmployeeForPay, setSelectedEmployeeForPay] = useState<Employee | null>(null);

  // Quick Pay Form State
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payType, setPayType] = useState<'salary' | 'advance' | 'bonus'>('salary');
  const [payPeriod, setPayPeriod] = useState<string>('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>('bank_transfer');
  const [payNotes, setPayNotes] = useState<string>('');

  // Add/Edit Form State
  const [formName, setFormName] = useState('');
  const [formCode, setFormCode] = useState('');
  const [formJobTitle, setFormJobTitle] = useState('');
  const [formDepartment, setFormDepartment] = useState<EmployeeDepartment>('printing');
  const [formNationalId, setFormNationalId] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formSalaryType, setFormSalaryType] = useState<SalaryType>('monthly');
  const [formSalaryAmount, setFormSalaryAmount] = useState<number>(3500);
  const [formAllowances, setFormAllowances] = useState<number>(0);
  const [formHireDate, setFormHireDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [formStatus, setFormStatus] = useState<'active' | 'on_leave' | 'terminated'>('active');
  const [formPaymentMethod, setFormPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [formBankName, setFormBankName] = useState('');
  const [formIban, setFormIban] = useState('');
  const [formEmergencyName, setFormEmergencyName] = useState('');
  const [formEmergencyPhone, setFormEmergencyPhone] = useState('');
  const [formEmergencyRelation, setFormEmergencyRelation] = useState('');
  const [formNotes, setFormNotes] = useState('');

  // Open modal for new employee
  const handleOpenAdd = () => {
    setEditingEmployee(null);
    const nextCode = `EMP-${String(employees.length + 1).padStart(3, '0')}`;
    setFormName('');
    setFormCode(nextCode);
    setFormJobTitle('');
    setFormDepartment('printing');
    setFormNationalId('');
    setFormPhone('');
    setFormEmail('');
    setFormSalaryType('monthly');
    setFormSalaryAmount(3500);
    setFormAllowances(0);
    setFormHireDate(new Date().toISOString().split('T')[0]);
    setFormStatus('active');
    setFormPaymentMethod('bank_transfer');
    setFormBankName('بنك فلسطين');
    setFormIban('');
    setFormEmergencyName('');
    setFormEmergencyPhone('');
    setFormEmergencyRelation('');
    setFormNotes('');
    setShowAddEditModal(true);
  };

  // Open modal for editing employee
  const handleOpenEdit = (emp: Employee) => {
    setEditingEmployee(emp);
    setFormName(emp.name);
    setFormCode(emp.code);
    setFormJobTitle(emp.jobTitle);
    setFormDepartment(emp.department);
    setFormNationalId(emp.nationalId || '');
    setFormPhone(emp.phone);
    setFormEmail(emp.email || '');
    setFormSalaryType(emp.salaryType);
    setFormSalaryAmount(emp.salaryAmount);
    setFormAllowances(emp.allowances || 0);
    setFormHireDate(emp.hireDate);
    setFormStatus(emp.status);
    setFormPaymentMethod(emp.paymentMethod);
    setFormBankName(emp.bankName || '');
    setFormIban(emp.iban || '');
    setFormEmergencyName(emp.emergencyContactName || '');
    setFormEmergencyPhone(emp.emergencyContactPhone || '');
    setFormEmergencyRelation(emp.emergencyRelation || '');
    setFormNotes(emp.notes || '');
    setShowAddEditModal(true);
  };

  // Open Pay Modal
  const handleOpenPay = (emp: Employee) => {
    setSelectedEmployeeForPay(emp);
    const defaultAmount = (emp.salaryAmount || 0) + (emp.allowances || 0);
    setPayAmount(defaultAmount);
    setPayType('salary');

    // Generate descriptive default period based on salary type
    const now = new Date();
    const monthNames = [
      'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
      'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];
    let defaultPeriodDesc = '';
    if (emp.salaryType === 'monthly') {
      defaultPeriodDesc = `راتب شهر ${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    } else if (emp.salaryType === 'weekly') {
      defaultPeriodDesc = `راتب الأسبوع الحالي (${now.toLocaleDateString('ar-SA')})`;
    } else {
      defaultPeriodDesc = `يومية عمل (${now.toLocaleDateString('ar-SA')})`;
    }
    setPayPeriod(defaultPeriodDesc);
    setPayMethod(emp.paymentMethod);
    setPayNotes(`صرف مستحقات الموظف ${emp.name}`);
    setShowPayModal(true);
  };

  // Submit Add/Edit form
  const handleSaveEmployee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formJobTitle.trim()) {
      alert('يرجى كتابة اسم الموظف والمسمى الوظيفي');
      return;
    }

    const empData: Omit<Employee, 'id'> = {
      code: formCode || `EMP-${Date.now().toString().slice(-3)}`,
      name: formName.trim(),
      jobTitle: formJobTitle.trim(),
      department: formDepartment,
      nationalId: formNationalId.trim() || undefined,
      phone: formPhone.trim(),
      email: formEmail.trim() || undefined,
      salaryType: formSalaryType,
      salaryAmount: Number(formSalaryAmount) || 0,
      allowances: Number(formAllowances) || 0,
      hireDate: formHireDate,
      status: formStatus,
      paymentMethod: formPaymentMethod,
      bankName: formPaymentMethod === 'bank_transfer' ? formBankName : undefined,
      iban: formPaymentMethod === 'bank_transfer' ? formIban : undefined,
      emergencyContactName: formEmergencyName.trim() || undefined,
      emergencyContactPhone: formEmergencyPhone.trim() || undefined,
      emergencyRelation: formEmergencyRelation.trim() || undefined,
      notes: formNotes.trim() || undefined,
      paymentHistory: editingEmployee ? editingEmployee.paymentHistory : []
    };

    if (editingEmployee) {
      updateEmployee(editingEmployee.id, empData);
    } else {
      addEmployee(empData);
    }

    posSound.playSuccessBeep();
    setShowAddEditModal(false);
  };

  // Submit salary payment
  const handleConfirmPay = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmployeeForPay) return;
    if (payAmount <= 0) {
      alert('يرجى تحديد مبلغ صالح للصرف');
      return;
    }

    payEmployeeSalary(
      selectedEmployeeForPay.id,
      payAmount,
      payMethod,
      payNotes,
      payType as 'salary' | 'advance',
      payPeriod
    );

    posSound.playCashBeep();
    setShowPayModal(false);
  };

  // Delete employee
  const handleDeleteEmployee = (emp: Employee) => {
    if (window.confirm(`هل أنت متأكد من حذف الموظف "${emp.name}" من سجلات المنشأة؟`)) {
      deleteEmployee(emp.id);
      posSound.playErrorBeep();
    }
  };

  // Filtered employees
  const filteredEmployees = useMemo(() => {
    return employees.filter(emp => {
      const matchSearch =
        searchQuery.trim() === '' ||
        emp.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.jobTitle.toLowerCase().includes(searchQuery.toLowerCase()) ||
        emp.phone.includes(searchQuery) ||
        (emp.nationalId && emp.nationalId.includes(searchQuery));

      const matchDept = selectedDept === 'all' || emp.department === selectedDept;
      const matchSalaryType = selectedSalaryType === 'all' || emp.salaryType === selectedSalaryType;
      const matchStatus = selectedStatus === 'all' || emp.status === selectedStatus;

      return matchSearch && matchDept && matchSalaryType && matchStatus;
    });
  }, [employees, searchQuery, selectedDept, selectedSalaryType, selectedStatus]);

  // Statistics
  const activeCount = employees.filter(e => e.status === 'active').length;
  const monthlyCount = employees.filter(e => e.salaryType === 'monthly').length;
  const weeklyCount = employees.filter(e => e.salaryType === 'weekly').length;
  const dailyCount = employees.filter(e => e.salaryType === 'daily').length;

  // Monthly estimate of active employees
  const totalMonthlyPayrollEstimate = useMemo(() => {
    return employees
      .filter(e => e.status === 'active')
      .reduce((sum, e) => {
        const total = (e.salaryAmount || 0) + (e.allowances || 0);
        if (e.salaryType === 'monthly') return sum + total;
        if (e.salaryType === 'weekly') return sum + Math.round(total * 4.33);
        if (e.salaryType === 'daily') return sum + Math.round(total * 26);
        return sum + total;
      }, 0);
  }, [employees]);

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                <Users className="w-5 h-5" />
              </div>
              <h1 className="text-lg font-bold text-slate-900">
                سجل شؤون الموظفين والرواتب
              </h1>
              <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold border border-blue-200">
                {employees.length} موظف
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-light mt-1">
              إدارة بيانات فريق العمل، المسميات الوظيفية، وتحديد أنظمة الرواتب (يومي، أسبوعي، شهري) وإصدار سندات الصرف
            </p>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => window.print()}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200"
              title="طباعة كشف الموظفين"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span className="hidden md:inline">طباعة الكشف</span>
            </button>

            <button
              onClick={() => {
                if (employees.length > 0) {
                  setSelectedEmployeeForStatement(employees[0]);
                }
              }}
              className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="فتح الكشف المالي التفصيلي للموظفين"
            >
              <FileText className="w-4 h-4 text-indigo-600" />
              <span className="hidden sm:inline">كشف مالي تفصيلي</span>
            </button>

            <button
              onClick={handleOpenAdd}
              className="flex-1 sm:flex-none px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              <UserPlus className="w-4 h-4" />
              <span>إضافة موظف جديد</span>
            </button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-3 border-t border-slate-100">
          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
            <div className="text-[10px] text-slate-400 font-light font-medium flex items-center justify-between">
              <span>إجمالي الموظفين</span>
              <Users className="w-3.5 h-3.5 text-blue-500" />
            </div>
            <div className="text-lg font-black text-slate-800 mt-1">
              {employees.length}{' '}
              <span className="text-[10px] font-normal text-slate-500">
                ({activeCount} على رأس العمل)
              </span>
            </div>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
            <div className="text-[10px] text-slate-400 font-light font-medium flex items-center justify-between">
              <span>مسير الرواتب الشهري التقديري</span>
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-lg font-black text-emerald-700 font-mono mt-1">
              {totalMonthlyPayrollEstimate.toLocaleString()}{' '}
              <span className="text-[10px] font-bold text-emerald-600">{settings.currency}</span>
            </div>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
            <div className="text-[10px] text-slate-400 font-light font-medium flex items-center justify-between">
              <span>رواتب شهرية</span>
              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.2 rounded font-bold">شهري</span>
            </div>
            <div className="text-lg font-black text-slate-800 mt-1">
              {monthlyCount}{' '}
              <span className="text-[10px] font-normal text-slate-500">موظفين</span>
            </div>
          </div>

          <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
            <div className="text-[10px] text-slate-400 font-light font-medium flex items-center justify-between">
              <span>رواتب أسبوعية ويومية</span>
              <span className="text-[10px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-bold">أسبوعي/يومي</span>
            </div>
            <div className="text-lg font-black text-slate-800 mt-1">
              <span className="text-amber-700">{weeklyCount} أسبوعي</span>
              <span className="text-slate-400 mx-1">|</span>
              <span className="text-emerald-700">{dailyCount} يومي</span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Sub-Navigation Tabs */}
      <div className="flex items-center gap-1.5 p-1.5 bg-slate-200/75 rounded-xl border border-slate-300/80 shadow-2xs">
        <button
          type="button"
          onClick={() => setActiveSubTab('employees')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'employees'
              ? 'bg-white text-blue-900 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <Users className="w-4 h-4 text-blue-600" />
          <span>دليل وبيانات الموظفين</span>
          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
            {employees.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('adjustments')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'adjustments'
              ? 'bg-white text-blue-900 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <CreditCard className="w-4 h-4 text-amber-600" />
          <span>السلف والخصومات والحوافز</span>
          {employeeAdvances.filter(a => a.status === 'pending').length + employeeDeductions.filter(d => d.status === 'pending').length > 0 && (
            <span className="bg-amber-100 text-amber-800 border border-amber-200 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
              {employeeAdvances.filter(a => a.status === 'pending').length + employeeDeductions.filter(d => d.status === 'pending').length} معلق
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('payroll_sheets')}
          className={`flex-1 py-2.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer ${
            activeSubTab === 'payroll_sheets'
              ? 'bg-white text-blue-900 shadow-xs border border-slate-200'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/60'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <span>كشوفات ومسيرات الرواتب</span>
          <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full text-[10px] font-mono font-bold">
            {payrollSheets.length}
          </span>
        </button>
      </div>

      {/* Tab Content: Adjustments Ledger */}
      {activeSubTab === 'adjustments' && (
        <EmployeeAdjustmentsView onOpenAddModal={handleOpenAdjustment} />
      )}

      {/* Tab Content: Payroll Sheets */}
      {activeSubTab === 'payroll_sheets' && (
        <PayrollSheetsView
          onOpenCreateModal={handleOpenCreatePayrollSheet}
          onOpenEditModal={handleOpenEditPayrollSheet}
        />
      )}

      {/* Tab Content: Employees Directory */}
      {activeSubTab === 'employees' && (
        <>
      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم، الكود (EMP)، المسمى الوظيفي، الجوال أو رقم الهوية..."
            className="w-full pr-9 pl-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:ring-1 focus:ring-blue-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Department Filter */}
          <select
            value={selectedDept}
            onChange={e => setSelectedDept(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:bg-white focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">كل الأقسام</option>
            <option value="printing">ورشة الطباعة والمكائن</option>
            <option value="design">التصميم والجرافيك</option>
            <option value="sales_pos">المبيعات ونقاط البيع</option>
            <option value="finishing">التجليد والتشطيب</option>
            <option value="management">الإدارة والإشراف</option>
            <option value="accounting">المحاسبة والمالية</option>
            <option value="delivery">التوصيل والخدمات</option>
            <option value="other">أخرى</option>
          </select>

          {/* Salary Type Filter */}
          <select
            value={selectedSalaryType}
            onChange={e => setSelectedSalaryType(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:bg-white focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">كل أنواع الرواتب</option>
            <option value="monthly">راتب شهري</option>
            <option value="weekly">راتب أسبوعي</option>
            <option value="daily">راتب يومي (يومية)</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-700 focus:bg-white focus:ring-1 focus:ring-blue-500"
          >
            <option value="all">كل الحالات</option>
            <option value="active">على رأس العمل (نشط)</option>
            <option value="on_leave">في إجازة</option>
            <option value="terminated">منتهي الخدمة</option>
          </select>

          {/* Toggle View Mode */}
          <div className="flex border border-slate-200 rounded-lg overflow-hidden bg-slate-50 p-0.5">
            <button
              onClick={() => setViewMode('table')}
              className={`px-2 py-1 text-xs rounded font-semibold transition-colors cursor-pointer ${
                viewMode === 'table' ? 'bg-white shadow-xs text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              جدول
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`px-2 py-1 text-xs rounded font-semibold transition-colors cursor-pointer ${
                viewMode === 'cards' ? 'bg-white shadow-xs text-blue-700 font-bold' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              بطاقات
            </button>
          </div>
        </div>
      </div>

      {/* Main Employee Content (Table / Cards) */}
      {filteredEmployees.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-700">لا توجد نتائج مطابقة</h3>
          <p className="text-xs text-slate-400 mt-1">جرّب تغيير عبارة البحث أو الفلتر المطبق، أو أضف موظفاً جديداً.</p>
          <button
            onClick={handleOpenAdd}
            className="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>إضافة موظف الآن</span>
          </button>
        </div>
      ) : viewMode === 'table' ? (
        /* Detailed Table View */
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs">
              <thead className="bg-slate-800 text-white font-semibold">
                <tr>
                  <th className="p-3">الموظف / الكود</th>
                  <th className="p-3">المسمى الوظيفي والقسم</th>
                  <th className="p-3">نوع الراتب</th>
                  <th className="p-3">الراتب الأساسي والبدلات</th>
                  <th className="p-3">طريقة الصرف</th>
                  <th className="p-3">الحالة</th>
                  <th className="p-3 text-center">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredEmployees.map(emp => {
                  const deptInfo = DEPARTMENT_LABELS[emp.department] || DEPARTMENT_LABELS.other;
                  const salaryInfo = SALARY_TYPE_INFO[emp.salaryType];
                  const totalSalary = (emp.salaryAmount || 0) + (emp.allowances || 0);

                  return (
                    <tr key={emp.id} className="hover:bg-blue-50/40 transition-colors">
                      {/* Name & Code */}
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs shrink-0">
                            {emp.name ? emp.name.slice(0, 1) : 'م'}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 hover:text-blue-600 cursor-pointer" onClick={() => {
                              setSelectedEmployeeForDetail(emp);
                              setShowDetailModal(true);
                            }}>
                              {emp.name}
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-[9px] text-slate-400 font-light bg-slate-100 px-1 py-0.2 rounded font-semibold">
                                {emp.code}
                              </span>
                              {emp.phone && (
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {emp.phone}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Job Title & Department */}
                      <td className="p-3">
                        <div className="font-semibold text-slate-800">{emp.jobTitle}</div>
                        <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium border mt-1 ${deptInfo.color}`}>
                          {deptInfo.name}
                        </span>
                      </td>

                      {/* Salary Type */}
                      <td className="p-3">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded border ${salaryInfo.badge}`}>
                          <Clock className="w-3 h-3" />
                          <span>{salaryInfo.label}</span>
                        </span>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {salaryInfo.desc}
                        </div>
                      </td>

                      {/* Salary Amount & Allowances */}
                      <td className="p-3">
                        <div className="font-mono font-bold text-slate-900 text-sm">
                          {emp.salaryAmount.toLocaleString()}{' '}
                          <span className="text-[10px] font-normal text-slate-500">{settings.currency}</span>
                        </div>
                        {emp.allowances ? (
                          <div className="text-[9px] text-slate-400 font-light mt-0.5 flex items-center gap-1">
                            <span>+ بدلات:</span>
                            <span className="font-mono font-semibold text-emerald-600">
                              {emp.allowances.toLocaleString()} {settings.currency}
                            </span>
                            <span className="text-slate-400 font-mono">
                              (الإجمالي: {totalSalary.toLocaleString()})
                            </span>
                          </div>
                        ) : null}
                      </td>

                      {/* Payment Method */}
                      <td className="p-3">
                        <div className="flex items-center gap-1 text-slate-700">
                          {emp.paymentMethod === 'bank_transfer' ? (
                            <>
                              <Building2 className="w-3.5 h-3.5 text-blue-600" />
                              <span>تحويل بنكي</span>
                            </>
                          ) : emp.paymentMethod === 'cheque' ? (
                            <>
                              <FileText className="w-3.5 h-3.5 text-amber-600" />
                              <span>شيك بنكي</span>
                            </>
                          ) : (
                            <>
                              <Banknote className="w-3.5 h-3.5 text-emerald-600" />
                              <span>نقداً (كاش)</span>
                            </>
                          )}
                        </div>
                        {emp.bankName && (
                          <div className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">
                            {emp.bankName}
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="p-3">
                        {emp.status === 'active' ? (
                          <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>على رأس العمل</span>
                          </span>
                        ) : emp.status === 'on_leave' ? (
                          <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            <span>في إجازة</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                            <span>منتهي الخدمة</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="p-3">
                        <div className="flex items-center justify-center gap-1 flex-wrap">
                          <button
                            onClick={() => handleOpenAdjustment('advance', emp.id)}
                            className="px-1.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                            title="تسجيل سلفة نقدية للموظف"
                          >
                            <CreditCard className="w-3 h-3 text-amber-600" />
                            <span>سلفة</span>
                          </button>

                          <button
                            onClick={() => handleOpenAdjustment('deduction', emp.id)}
                            className="px-1.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                            title="تسجيل خصم / جزاء للموظف"
                          >
                            <MinusCircle className="w-3 h-3 text-rose-600" />
                            <span>خصم</span>
                          </button>

                          <button
                            onClick={() => handleOpenAdjustment('incentive', emp.id)}
                            className="px-1.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                            title="تسجيل حافز ومكافأة للموظف"
                          >
                            <PlusCircle className="w-3 h-3 text-emerald-600" />
                            <span>حافز</span>
                          </button>

                          <button
                            onClick={() => setSelectedEmployeeForStatement(emp)}
                            className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="كشف مالي تفصيلي للموظف"
                          >
                            <FileText className="w-3 h-3 text-indigo-600" />
                            <span>كشف مالي</span>
                          </button>

                          <button
                            onClick={() => handleOpenPay(emp)}
                            className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                            title="صرف راتب فوري للموظف"
                          >
                            <DollarSign className="w-3 h-3" />
                            <span>صرف</span>
                          </button>

                          <button
                            onClick={() => {
                              setSelectedEmployeeForDetail(emp);
                              setShowDetailModal(true);
                            }}
                            className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                            title="عرض الملف الكامل وسجل الرواتب"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleOpenEdit(emp)}
                            className="p-1 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors cursor-pointer"
                            title="تعديل بيانات الموظف"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          <button
                            onClick={() => handleDeleteEmployee(emp)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                            title="حذف الموظف"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Cards View */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredEmployees.map(emp => {
            const deptInfo = DEPARTMENT_LABELS[emp.department] || DEPARTMENT_LABELS.other;
            const salaryInfo = SALARY_TYPE_INFO[emp.salaryType];
            const totalSalary = (emp.salaryAmount || 0) + (emp.allowances || 0);

            return (
              <div
                key={emp.id}
                className="bg-white rounded-xl shadow-xs border border-slate-200 p-4 flex flex-col justify-between hover:border-blue-300 transition-all"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full bg-blue-50 border border-blue-200 text-blue-700 font-bold flex items-center justify-center text-sm">
                        {emp.name ? emp.name.slice(0, 1) : 'م'}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-900 text-sm hover:text-blue-600 cursor-pointer" onClick={() => {
                          setSelectedEmployeeForDetail(emp);
                          setShowDetailModal(true);
                        }}>
                          {emp.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="font-mono text-[9px] text-slate-400 font-light bg-slate-100 px-1 py-0.2 rounded font-semibold">
                            {emp.code}
                          </span>
                          <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold border ${deptInfo.color}`}>
                            {deptInfo.name}
                          </span>
                        </div>
                      </div>
                    </div>

                    {emp.status === 'active' ? (
                      <span className="w-2 h-2 rounded-full bg-emerald-500" title="على رأس العمل" />
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-amber-500" title="في إجازة أو منتهي" />
                    )}
                  </div>

                  <div className="mt-3 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                    <div className="text-xs font-semibold text-slate-800">
                      {emp.jobTitle}
                    </div>
                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-200/60">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${salaryInfo.badge}`}>
                        {salaryInfo.label}
                      </span>
                      <div className="text-right">
                        <span className="text-sm font-black font-mono text-slate-900">
                          {emp.salaryAmount.toLocaleString()}{' '}
                          <span className="text-[10px] font-normal text-slate-500">{settings.currency}</span>
                        </span>
                        {emp.allowances ? (
                          <div className="text-[9px] text-emerald-700 font-mono font-semibold">
                            + {emp.allowances.toLocaleString()} بدلات
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-[10px] text-slate-400 font-light space-y-1">
                    {emp.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span className="font-mono">{emp.phone}</span>
                      </div>
                    )}
                    {emp.bankName && emp.paymentMethod === 'bank_transfer' && (
                      <div className="flex items-center gap-1.5">
                        <Building2 className="w-3 h-3 text-slate-400" />
                        <span className="truncate">{emp.bankName}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenAdjustment('advance', emp.id)}
                      className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                      title="تسجيل سلفة"
                    >
                      <CreditCard className="w-3 h-3 text-amber-600" />
                      <span>سلفة</span>
                    </button>
                    <button
                      onClick={() => handleOpenAdjustment('deduction', emp.id)}
                      className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                      title="تسجيل خصم"
                    >
                      <MinusCircle className="w-3 h-3 text-rose-600" />
                      <span>خصم</span>
                    </button>
                    <button
                      onClick={() => handleOpenAdjustment('incentive', emp.id)}
                      className="px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                      title="تسجيل حافز"
                    >
                      <PlusCircle className="w-3 h-3 text-emerald-600" />
                      <span>حافز</span>
                    </button>
                    <button
                      onClick={() => setSelectedEmployeeForStatement(emp)}
                      className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                      title="كشف مالي تفصيلي للموظف"
                    >
                      <FileText className="w-3 h-3 text-indigo-600" />
                      <span>كشف مالي</span>
                    </button>
                    <button
                      onClick={() => handleOpenPay(emp)}
                      className="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded text-[10px] font-bold flex items-center gap-0.5 transition-colors cursor-pointer"
                      title="صرف راتب فوري"
                    >
                      <DollarSign className="w-3 h-3" />
                      <span>صرف</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => {
                        setSelectedEmployeeForDetail(emp);
                        setShowDetailModal(true);
                      }}
                      className="p-1 text-slate-400 hover:text-blue-600 rounded cursor-pointer"
                      title="عرض الملف"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleOpenEdit(emp)}
                      className="p-1 text-slate-400 hover:text-amber-600 rounded cursor-pointer"
                      title="تعديل"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteEmployee(emp)}
                      className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                      title="حذف"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      </>
      )}

      {/* ========================================================================= */}
      {/* ADD / EDIT EMPLOYEE MODAL */}
      {/* ========================================================================= */}
      {showAddEditModal && (
        <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 my-8">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white">
                  <UserPlus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold">
                    {editingEmployee ? `تعديل بيانات الموظف: ${editingEmployee.name}` : 'إضافة موظف جديد إلى السجلات'}
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    أدخل تفاصيل الموظف، المسمى الوظيفي، نوع الراتب (شهري، أسبوعي، يومي) والقيمة المالية
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowAddEditModal(false)}
                className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="p-4 space-y-4 max-h-[82vh] overflow-y-auto text-xs">
              {/* Section 1: Basic Information */}
              <div>
                <h4 className="font-bold text-slate-900 mb-2 pb-1 border-b border-slate-100 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-blue-600" />
                  <span>1. البيانات الأساسية والوظيفية</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div className="sm:col-span-2">
                    <label className="block text-slate-700 font-semibold mb-1">
                      اسم الموظف بالكامل <span className="text-rose-500">*</span>:
                    </label>
                    <input
                      type="text"
                      required
                      value={formName}
                      onChange={e => setFormName(e.target.value)}
                      placeholder="مثال: أحمد محمود النجار"
                      className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 font-medium focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">كود الموظف:</label>
                    <div className="flex gap-1">
                      <input
                        type="text"
                        value={formCode}
                        onChange={e => setFormCode(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 font-mono text-center font-bold text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => setFormCode(`EMP-${Math.floor(100 + Math.random() * 900)}`)}
                        className="px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[10px] font-semibold cursor-pointer border border-slate-200"
                        title="توليد كود تلقائي"
                      >
                        توليد
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2.5">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      المسمى الوظيفي <span className="text-rose-500">*</span>:
                    </label>
                    <input
                      type="text"
                      required
                      value={formJobTitle}
                      onChange={e => setFormJobTitle(e.target.value)}
                      placeholder="مثال: فني طباعة أوفست، مصمم جرافيك، كاشير..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">القسم / الإدارة:</label>
                    <select
                      value={formDepartment}
                      onChange={e => setFormDepartment(e.target.value as EmployeeDepartment)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 focus:bg-white focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="printing">ورشة ومكائن الطباعة</option>
                      <option value="design">التصميم والجرافيك والفرز</option>
                      <option value="sales_pos">المبيعات ونقاط البيع (الكاشير)</option>
                      <option value="finishing">التجليد والتشطيب والقص</option>
                      <option value="management">الإدارة والإشراف العام</option>
                      <option value="accounting">المحاسبة والمالية</option>
                      <option value="delivery">التوصيل والخدمات اللوجستية</option>
                      <option value="other">أقسام أخرى</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2.5">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">رقم الهوية / الإقامة:</label>
                    <input
                      type="text"
                      value={formNationalId}
                      onChange={e => setFormNationalId(e.target.value)}
                      placeholder="10 أرقام..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 font-mono focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">تاريخ المباشرة / التعيين:</label>
                    <DateInput value={formHireDate} onChange={e => setFormHireDate(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 font-mono focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">حالة العمل:</label>
                    <select
                      value={formStatus}
                      onChange={e => setFormStatus(e.target.value as 'active' | 'on_leave' | 'terminated')}
                      className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 focus:bg-white focus:ring-1 focus:ring-blue-500 font-semibold"
                    >
                      <option value="active">على رأس العمل (نشط)</option>
                      <option value="on_leave">في إجازة رسمية</option>
                      <option value="terminated">منتهي الخدمة / مستقيل</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Salary Structure (CRITICAL USER REQUIREMENT) */}
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <h4 className="font-bold text-slate-900 mb-2 pb-1 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                    <span>2. نظام الراتب والاستحقاقات المالية</span>
                  </div>
                  <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.2 rounded">
                    إلزامي
                  </span>
                </h4>

                {/* Salary Type Selector */}
                <div className="mb-3">
                  <label className="block text-slate-700 font-bold mb-1.5">
                    اختر نوع احتساب الراتب:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormSalaryType('monthly')}
                      className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                        formSalaryType === 'monthly'
                          ? 'bg-blue-600 text-white border-blue-600 shadow-xs font-bold'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold">راتب شهري</div>
                      <div className={`text-[10px] mt-0.5 ${formSalaryType === 'monthly' ? 'text-blue-100' : 'text-slate-400'}`}>
                        صرف نهاية كل شهر
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormSalaryType('weekly')}
                      className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                        formSalaryType === 'weekly'
                          ? 'bg-amber-600 text-white border-amber-600 shadow-xs font-bold'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold">راتب أسبوعي</div>
                      <div className={`text-[10px] mt-0.5 ${formSalaryType === 'weekly' ? 'text-amber-100' : 'text-slate-400'}`}>
                        صرف نهاية كل أسبوع
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormSalaryType('daily')}
                      className={`p-2.5 rounded-lg border text-center transition-all cursor-pointer ${
                        formSalaryType === 'daily'
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-xs font-bold">راتب يومي (يومية)</div>
                      <div className={`text-[10px] mt-0.5 ${formSalaryType === 'daily' ? 'text-emerald-100' : 'text-slate-400'}`}>
                        يومية عمل فعلية
                      </div>
                    </button>
                  </div>
                </div>

                {/* Salary Amount and Allowances */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      قيمة الراتب الأساسي ({formSalaryType === 'monthly' ? 'شهرياً' : formSalaryType === 'weekly' ? 'أسبوعياً' : 'لليوم الواحد'}){' '}
                      <span className="text-rose-500">*</span>:
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        required
                        value={formSalaryAmount}
                        onChange={e => setFormSalaryAmount(Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded-md p-2 pl-12 font-mono font-bold text-slate-900 text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">
                        {settings.currency}
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-bold mb-1">
                      البدلات الدورية (سكن / انتقال / إعاشة):
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        step="0.01"
                        value={formAllowances}
                        onChange={e => setFormAllowances(Number(e.target.value))}
                        className="w-full bg-white border border-slate-300 rounded-md p-2 pl-12 font-mono font-bold text-slate-900 text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 font-bold text-slate-400 text-xs">
                        {settings.currency}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Calculation breakdown summary */}
                <div className="mt-2.5 p-2 bg-emerald-50 rounded-lg border border-emerald-200 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5 text-emerald-800 font-semibold">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>إجمالي الاستحقاق المالي:</span>
                  </div>
                  <div className="font-mono font-black text-emerald-900 text-sm">
                    {(Number(formSalaryAmount || 0) + Number(formAllowances || 0)).toLocaleString()}{' '}
                    <span className="text-xs font-normal text-emerald-700">
                      {settings.currency} / {formSalaryType === 'monthly' ? 'شهر' : formSalaryType === 'weekly' ? 'أسبوع' : 'يوم عمل'}
                    </span>
                  </div>
                </div>

                {/* Payment Disbursement Method */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-3 pt-3 border-t border-slate-200">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">طريقة صرف الراتب:</label>
                    <select
                      value={formPaymentMethod}
                      onChange={e => setFormPaymentMethod(e.target.value as PaymentMethod)}
                      className="w-full bg-white border border-slate-300 rounded-md p-2 focus:ring-1 focus:ring-blue-500 font-semibold"
                    >
                      <option value="bank_transfer">تحويل بنكي</option>
                      <option value="cash">نقداً من الصندوق (الكاشير)</option>
                      <option value="cheque">شيك بنكي</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">اسم البنك (إن وجد):</label>
                    <input
                      type="text"
                      value={formBankName}
                      onChange={e => setFormBankName(e.target.value)}
                      placeholder="مثال: بنك فلسطين، البنك العربي، بنك القدس..."
                      className="w-full bg-white border border-slate-300 rounded-md p-2 focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">رقم الآيبان (IBAN):</label>
                    <input
                      type="text"
                      value={formIban}
                      onChange={e => setFormIban(e.target.value)}
                      placeholder="SA0000000000000000000000"
                      className="w-full bg-white border border-slate-300 rounded-md p-2 font-mono text-[11px] focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Section 3: Contact & Emergency */}
              <div>
                <h4 className="font-bold text-slate-900 mb-2 pb-1 border-b border-slate-100 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-blue-600" />
                  <span>3. بيانات الاتصال والطوارئ</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">
                      رقم الجوال الشخصي <span className="text-rose-500">*</span>:
                    </label>
                    <input
                      type="text"
                      required
                      value={formPhone}
                      onChange={e => setFormPhone(e.target.value)}
                      placeholder="05xxxxxxxx"
                      className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 font-mono focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-700 font-semibold mb-1">البريد الإلكتروني:</label>
                    <input
                      type="email"
                      value={formEmail}
                      onChange={e => setFormEmail(e.target.value)}
                      placeholder="employee@example.com"
                      className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 font-mono focus:bg-white focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-2.5 bg-slate-50 p-2 rounded-lg border border-slate-100">
                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">اسم قريب للطوارئ:</label>
                    <input
                      type="text"
                      value={formEmergencyName}
                      onChange={e => setFormEmergencyName(e.target.value)}
                      placeholder="اسم جهة الاتصال..."
                      className="w-full bg-white border border-slate-200 rounded-md p-1.5 text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">جوال الطوارئ:</label>
                    <input
                      type="text"
                      value={formEmergencyPhone}
                      onChange={e => setFormEmergencyPhone(e.target.value)}
                      placeholder="05xxxxxxxx"
                      className="w-full bg-white border border-slate-200 rounded-md p-1.5 font-mono text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-slate-600 text-[11px] font-semibold mb-1">صلة القرابة:</label>
                    <input
                      type="text"
                      value={formEmergencyRelation}
                      onChange={e => setFormEmergencyRelation(e.target.value)}
                      placeholder="أب، أخ، زوجة..."
                      className="w-full bg-white border border-slate-200 rounded-md p-1.5 text-xs"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Notes */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">ملاحظات إضافية وسيرة وظيفية:</label>
                <textarea
                  rows={2}
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  placeholder="ملاحظات حول الخبرات، الماكينات التي يجيد العمل عليها، الشروط..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 focus:bg-white focus:ring-1 focus:ring-blue-500"
                />
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddEditModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingEmployee ? 'تحديث بيانات الموظف' : 'حفظ الموظف الجديد'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* QUICK SALARY PAYMENT MODAL */}
      {/* ========================================================================= */}
      {showPayModal && selectedEmployeeForPay && (
        <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3">
          <div className="bg-white rounded-xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200">
            <div className="px-4 py-3 bg-emerald-800 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
                  <DollarSign className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold">
                    صرف مستحقات / راتب للموظف: {selectedEmployeeForPay.name}
                  </h3>
                  <p className="text-[10px] text-emerald-200">
                    كود: {selectedEmployeeForPay.code} | {selectedEmployeeForPay.jobTitle}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowPayModal(false)}
                className="p-1 text-emerald-300 hover:text-white rounded transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmPay} className="p-4 space-y-3.5 text-xs">
              <div className="bg-emerald-50 p-2.5 rounded-lg border border-emerald-200 flex items-center justify-between">
                <div>
                  <span className="text-slate-600 text-[11px] block">نظام الراتب المسجل:</span>
                  <span className="font-bold text-emerald-900">
                    {SALARY_TYPE_INFO[selectedEmployeeForPay.salaryType].label} (
                    {selectedEmployeeForPay.salaryAmount.toLocaleString()} {settings.currency}
                    {selectedEmployeeForPay.allowances ? ` + ${selectedEmployeeForPay.allowances} بدلات` : ''})
                  </span>
                </div>
                <div className="text-left font-mono font-bold text-emerald-700 text-xs">
                  {selectedEmployeeForPay.paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : 'نقداً من الصندوق'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">نوع السند المنصرف:</label>
                  <select
                    value={payType}
                    onChange={e => setPayType(e.target.value as 'salary' | 'advance' | 'bonus')}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 font-bold text-slate-800"
                  >
                    <option value="salary">صرف راتب دوري معتمد</option>
                    <option value="advance">سلفة مقدمة على الراتب</option>
                    <option value="bonus">مكافأة / حافز إضافي</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    المبلغ المنصرف ({settings.currency}) <span className="text-rose-500">*</span>:
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={payAmount}
                    onChange={e => setPayAmount(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-md p-2 font-mono font-bold text-slate-900 text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  بيان الفترة المستحقة <span className="text-rose-500">*</span>:
                </label>
                <input
                  type="text"
                  required
                  value={payPeriod}
                  onChange={e => setPayPeriod(e.target.value)}
                  placeholder="مثال: راتب شهر سبتمبر 2026 أو الأسبوع 36..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 focus:bg-white focus:ring-1 focus:ring-emerald-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">طريقة الدفع:</label>
                  <select
                    value={payMethod}
                    onChange={e => setPayMethod(e.target.value as PaymentMethod)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 font-semibold"
                  >
                    <option value="bank_transfer">تحويل بنكي</option>
                    <option value="cash">نقداً من الصندوق (الكاشير)</option>
                    <option value="cheque">شيك بنكي</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-700 font-semibold mb-1">الحساب المحاسبي المدين:</label>
                  <input
                    type="text"
                    disabled
                    value="5201 - مصروفات الرواتب والأجور"
                    className="w-full bg-slate-100 border border-slate-200 rounded-md p-2 text-slate-500 text-[11px]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-700 font-semibold mb-1">ملاحظات سند الصرف:</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-md p-2 text-xs"
                />
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-400 font-light">
                سيتم إصدار سند صرف رسمي (Payment Voucher) وقيد محاسبي يخصم من رصيد الخزينة أو البنك ويُسجل في مصروفات الرواتب (حساب 5201).
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPayModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Send className="w-4 h-4" />
                  <span>اعتماد وصرف السند الآن</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* EMPLOYEE DETAIL & PAYMENT HISTORY MODAL */}
      {/* ========================================================================= */}
      {showDetailModal && selectedEmployeeForDetail && (
        <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 overflow-y-auto">
          <div className="bg-white rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200 my-6">
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-600 flex items-center justify-center text-white font-bold">
                  {selectedEmployeeForDetail?.name ? selectedEmployeeForDetail.name.slice(0, 1) : 'م'}
                </div>
                <div>
                  <h3 className="text-xs font-bold">
                    الملف الوظيفي الكامل: {selectedEmployeeForDetail.name}
                  </h3>
                  <p className="text-[10px] text-slate-400">
                    كود: {selectedEmployeeForDetail.code} | {selectedEmployeeForDetail.jobTitle}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                  title="طباعة بطاقة الموظف"
                >
                  <Printer className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowDetailModal(false)}
                  className="p-1 text-slate-400 hover:text-white rounded transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto text-xs">
              {/* Profile Card Header */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-blue-600 text-white font-black text-lg flex items-center justify-center shadow-xs">
                    {selectedEmployeeForDetail?.name ? selectedEmployeeForDetail.name.slice(0, 1) : 'م'}
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-slate-900">{selectedEmployeeForDetail.name}</h2>
                    <div className="text-xs font-semibold text-slate-600 mt-0.5">
                      {selectedEmployeeForDetail.jobTitle}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-2 py-0.5 rounded font-semibold border ${DEPARTMENT_LABELS[selectedEmployeeForDetail.department]?.color || ''}`}>
                        {DEPARTMENT_LABELS[selectedEmployeeForDetail.department]?.name}
                      </span>
                      <span className="font-mono text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.2 rounded font-bold">
                        {selectedEmployeeForDetail.code}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="text-right sm:text-left bg-white p-3 rounded-lg border border-slate-200 shrink-0">
                  <div className="text-[10px] text-slate-400 font-semibold">نظام الراتب والاستحقاق:</div>
                  <div className="text-sm font-black font-mono text-emerald-700 mt-0.5">
                    {selectedEmployeeForDetail.salaryAmount.toLocaleString()} {settings.currency}
                  </div>
                  <div className="text-[9px] text-slate-400 font-light font-semibold mt-0.5">
                    {SALARY_TYPE_INFO[selectedEmployeeForDetail.salaryType].label}
                    {selectedEmployeeForDetail.allowances ? ` (+ ${selectedEmployeeForDetail.allowances} بدلات)` : ''}
                  </div>
                </div>
              </div>

              {/* Data Grid Information */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-800 pb-1 border-b border-slate-100 flex items-center gap-1.5">
                    <Briefcase className="w-3.5 h-3.5 text-blue-500" />
                    <span>بيانات العمل والهوية</span>
                  </h4>
                  <div className="flex justify-between text-slate-600">
                    <span>رقم الهوية / الإقامة:</span>
                    <span className="font-mono font-bold text-slate-900">{selectedEmployeeForDetail.nationalId || 'غير مسجل'}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>تاريخ المباشرة:</span>
                    <span className="font-mono text-slate-900">{selectedEmployeeForDetail.hireDate}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>حالة الموظف:</span>
                    <span className="font-bold text-slate-900">
                      {selectedEmployeeForDetail.status === 'active' ? 'على رأس العمل (نشط)' : selectedEmployeeForDetail.status === 'on_leave' ? 'في إجازة' : 'منتهي الخدمة'}
                    </span>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-2">
                  <h4 className="font-bold text-slate-800 pb-1 border-b border-slate-100 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>البيانات المصرفية والتحويل</span>
                  </h4>
                  <div className="flex justify-between text-slate-600">
                    <span>طريقة الصرف:</span>
                    <span className="font-bold text-slate-900">
                      {selectedEmployeeForDetail.paymentMethod === 'bank_transfer' ? 'تحويل بنكي' : selectedEmployeeForDetail.paymentMethod === 'cash' ? 'نقداً من الصندوق' : 'شيك'}
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>اسم البنك:</span>
                    <span className="text-slate-900">{selectedEmployeeForDetail.bankName || '—'}</span>
                  </div>
                  <div className="flex justify-between text-slate-600">
                    <span>الآيبان (IBAN):</span>
                    <span className="font-mono text-[10px] text-slate-900">{selectedEmployeeForDetail.iban || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Contact Information */}
              <div className="bg-white p-3 rounded-lg border border-slate-200">
                <h4 className="font-bold text-slate-800 pb-1 border-b border-slate-100 flex items-center gap-1.5 mb-2">
                  <Phone className="w-3.5 h-3.5 text-blue-500" />
                  <span>معلومات التواصل والطوارئ</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <span className="text-slate-500 block text-[11px]">الجوال:</span>
                    <span className="font-mono font-bold text-slate-900">{selectedEmployeeForDetail.phone}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">البريد:</span>
                    <span className="font-mono text-slate-900 truncate block">{selectedEmployeeForDetail.email || '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">طوارئ:</span>
                    <span className="text-slate-900">
                      {selectedEmployeeForDetail.emergencyContactName ? `${selectedEmployeeForDetail.emergencyContactName} (${selectedEmployeeForDetail.emergencyContactPhone || ''})` : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Salary Payment History */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-slate-900 flex items-center gap-1.5">
                    <History className="w-3.5 h-3.5 text-emerald-600" />
                    <span>سجل صرف الرواتب والسلف السابقة</span>
                  </h4>
                  <button
                    onClick={() => {
                      setShowDetailModal(false);
                      handleOpenPay(selectedEmployeeForDetail);
                    }}
                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <DollarSign className="w-3 h-3" />
                    <span>+ صرف دفعة جديدة</span>
                  </button>
                </div>

                {(!selectedEmployeeForDetail.paymentHistory || selectedEmployeeForDetail.paymentHistory.length === 0) ? (
                  <div className="bg-slate-50 p-4 rounded-lg text-center text-slate-500 border border-slate-200">
                    لا توجد مسيرات رواتب مسجلة لهذا الموظف بعد.
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-semibold">
                        <tr>
                          <th className="p-2">التاريخ</th>
                          <th className="p-2">النوع والفترة</th>
                          <th className="p-2">طريقة الدفع</th>
                          <th className="p-2">رقم السند</th>
                          <th className="p-2 text-left">المبلغ</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {selectedEmployeeForDetail.paymentHistory.map((record, idx) => (
                          <tr key={`emp-rec-${record.id || idx}-${idx}`} className="hover:bg-slate-50">
                            <td className="p-2 font-mono text-slate-600">{record.date}</td>
                            <td className="p-2">
                              <span className="font-bold text-slate-800">{record.period}</span>
                              <span className="text-[10px] text-slate-400 block">{record.notes}</span>
                            </td>
                            <td className="p-2 text-slate-600">
                              {record.paymentMethod === 'bank_transfer' ? 'بنكي' : 'نقداً'}
                            </td>
                            <td className="p-2 font-mono text-slate-500 text-[10px]">
                              {record.voucherNumber || '—'}
                            </td>
                            <td className="p-2 text-left font-mono font-bold text-emerald-700">
                              {record.amount.toLocaleString()} {settings.currency}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  handleOpenEdit(selectedEmployeeForDetail);
                }}
                className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded font-semibold transition-colors cursor-pointer text-xs"
              >
                تعديل الملف
              </button>

              <button
                onClick={() => setShowDetailModal(false)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white rounded font-bold transition-colors cursor-pointer text-xs"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Adjustments Modal (Advance, Deduction, Incentive) */}
      <EmployeeAdjustmentsModal
        isOpen={showAdjustmentModal}
        onClose={() => setShowAdjustmentModal(false)}
        initialType={adjustmentType}
        preselectedEmployeeId={adjustmentPreselectedEmpId}
      />

      {/* Payroll Sheet Wizard / Modal (Draft & Disburse) */}
      <PayrollSheetModal
        isOpen={showPayrollSheetModal}
        onClose={() => setShowPayrollSheetModal(false)}
        editingSheet={editingPayrollSheet}
      />
    </div>
  );
};
