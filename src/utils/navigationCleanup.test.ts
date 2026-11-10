import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=(name:string)=>readFileSync(new URL('../components/'+name,import.meta.url),'utf8');
const desktop=read('Navbar.tsx');
const mobile=read('MobileNavigationModal.tsx');
const home=read('HomeScreenView.tsx');
const inventory=read('InventoryView.tsx');

function desktopMenu(){
 const start=desktop.indexOf('const menuSections: TopMenuSection[] = [');
 const end=desktop.indexOf('\n  ];',start);
 assert.ok(start>=0&&end>start);
 return desktop.slice(start,end);
}
const sections=[
  'control_panel_menu','sales_menu','purchases_expenses_menu','items_menu',
  'finance_accounting_menu','hr_menu','reports_menu','settings_menu'
];

test('desktop has exactly eight logical sections, in the approved order',()=>{
 const found=[...desktopMenu().matchAll(/\bid: '([a-z_]+_menu)'/g)].map(x=>x[1]);
 assert.deepEqual(found,sections);
 assert.doesNotMatch(desktopMenu(),/id: 'help_menu'/);
});
test('all financial and operational screens remain reachable exactly once from desktop menus',()=>{
 const menu=desktopMenu();
 const featureIds=[
   'home','dashboard','pos','print_orders','parties','invoices','excel_drafts',
   'daily_entry_sheet','sales_returns','receipt_vouchers','special_invoice',
   'purchases_suppliers','purchases_invoices','purchases_returns','payment_vouchers',
   'expenses','inventory','warehouses','employees','employees_adjustments',
   'employees_payroll','branches','treasuries','debt_clearing','accounting',
   'sync_statement','report_customer_statement','report_customer_items',
   'report_supplier_statement','report_supplier_items','report_receipt_vouchers',
   'report_payment_vouchers','report_employee_statement','report_payroll_sheets',
   'report_treasuries_movement','reports','users_permissions','settings_general',
   'settings_sql','settings_backup','action_local_database',
   'action_import_master_snapshot','audit_log','action_about'
 ];
 const ids=[...menu.matchAll(/\bid: '([a-z_]+)'/g)].map(x=>x[1]);
 for(const id of featureIds){
   assert.equal(ids.filter(i=>i===id).length,1,'Feature not uniquely accessible: '+id);
 }
});
test('only one manual synchronization shortcut remains, conflict display and settings diagnostics preserved',()=>{
 assert.equal((desktop.match(/onClick=\{handleManualSync\}/g)||[]).length,1);
 assert.match(desktop,/syncCoordinatorState\?\.conflict/);
 assert.match(desktop,/pendingSyncCount/);
 assert.match(desktop,/id: 'action_import_master_snapshot'/);
 assert.match(desktop,/id: 'audit_log'/);
 assert.match(desktop,/id: 'sync_statement'/);
 assert.doesNotMatch(desktop,/Visual Basic Menu/);
 assert.doesNotMatch(desktop,/حصة فايربيس/);
 assert.doesNotMatch(desktop,/title="الشاشة الرئيسية للبرنامج"/);
});
test('mobile navigation shares eight-section ordering and respects permissions',()=>{
 assert.match(mobile,/const displaySections = useMemo/);
 assert.match(mobile,/order = \['control_panel_menu', 'sales_menu', 'purchases_expenses_menu', 'items_menu', 'finance_accounting_menu', 'hr_menu', 'reports_menu', 'settings_menu'\]/);
 assert.match(mobile,/hasPermission\(item\.perm as any\)/);
 assert.match(mobile,/items\.filter\(item => item\.id !== 'report_employee_statement'\)/);
 assert.match(mobile,/section\.id === 'reports_menu' && staffReport/);
 assert.match(mobile,/\{displaySections\.map\(\(section\) =>/);
 assert.match(mobile,/\{subItem\.label\.replace\(/);
});
test('mobile administration preserves protected maintenance, audit and sync routes',()=>{
 assert.match(mobile,/action_local_database: onOpenLocalDatabase/);
 assert.match(mobile,/action_import_master_snapshot: onImportMasterSnapshot/);
 assert.match(mobile,/action_about: onOpenAbout/);
 assert.doesNotMatch(mobile,/action_firebase_quota|onOpenLegacyDiagnostic/);
 assert.match(mobile,/id: 'audit_log'/);
 assert.match(mobile,/id: 'sync_statement'/);
 assert.match(mobile,/hasPermission\(item\.perm as any\)/);
 assert.match(desktop,/onImportMasterSnapshot=\{\(\) =>/);
 assert.match(desktop,/onOpenLocalDatabase=\{\(\) =>/);
});
test('mobile signout uses secure account session, not legacy Firebase',()=>{
 assert.match(mobile,/secureLoginEnabled\(\)/);
 assert.match(mobile,/clearSession\(\)/);
 assert.match(mobile,/getCurrentSessionToken\(\)/);
 assert.doesNotMatch(mobile,/import\('\.\.\/firebase'\)/);
});
test('redundant shortcut tags and unverified scanner-connected notice removed',()=>{
 const visibleCards=home.slice(home.indexOf('{displayedShortcuts.map('),home.indexOf('{/* Customize Shortcuts Modal'));
 assert.doesNotMatch(visibleCards,/\{shortcut\.code\}/);
 assert.doesNotMatch(home,/مركز الانطلاق السريع لتشغيل مهامك اليومية بكفاءة عالية/);
 assert.doesNotMatch(inventory,/الماسح متصل/);
 assert.match(inventory,/setShowBarcodeScanner/);
});
