import React, { useEffect, useRef } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { TelegramService, TelegramIncomingAction } from '../services/TelegramService';
import { useOfficialAppReportPdf } from '../utils/useOfficialAppReportPdf';
import { isConfirmedSalesInvoice } from '../utils/invoiceConfirmation';
import { formatInvoiceCustomerDisplay } from '../utils/partyUtils';
import { buildDetailedSalesReportHtml } from '../utils/printDetailedSalesInvoiceRegister';
import { captureOfficialSalesRegisterPdf } from '../utils/captureOfficialSalesRegisterPdf';
import {
  fuzzyMatchParties,
  fuzzyMatchEmployees,
  getDateRangeForPeriod,
  parseCustomDateRange,
} from '../utils/telegramReportsHelper';
import { Party, Employee } from '../types';

export type ReportCategoryType =
  | 'customer_statement'
  | 'supplier_statement'
  | 'customer_items'
  | 'treasury_report'
  | 'sales_report'
  | 'purchases_report'
  | 'inventory_report'
  | 'expenses_report'
  | 'employee_statement';

interface SessionState {
  step:
    | 'idle'
    | 'awaiting_customer_name'
    | 'awaiting_supplier_name'
    | 'awaiting_customer_items_party'
    | 'awaiting_employee_name'
    | 'awaiting_custom_period';
  targetReportType?: ReportCategoryType;
  targetPartyId?: string;
  targetEmployeeId?: string;
  pendingDateRange?: { fromDate: string; toDate: string; label: string };
  lastActivity: number;
}

export const TelegramBotIntegration: React.FC = () => {
  const {
    settings,
    parties,
    journalEntries,
    invoices,
    purchases,
    purchaseReturns,
    salesReturns,
    vouchers,
    printOrders,
    debtClearings,
    treasuries,
    inventory,
    expenses,
    employees,
    employeeAdvances,
    employeeDeductions,
    employeeIncentives,
    payrollSheets,
    updateSettings,
  } = useAccounting();

  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const partiesRef = useRef(parties);
  partiesRef.current = parties;

  const invoicesRef = useRef(invoices);
  invoicesRef.current = invoices;

  const purchasesRef = useRef(purchases);
  purchasesRef.current = purchases;

  const purchaseReturnsRef = useRef(purchaseReturns);
  purchaseReturnsRef.current = purchaseReturns;

  const salesReturnsRef = useRef(salesReturns);
  salesReturnsRef.current = salesReturns;

  const vouchersRef = useRef(vouchers);
  vouchersRef.current = vouchers;

  const printOrdersRef = useRef(printOrders);
  printOrdersRef.current = printOrders;

  const journalEntriesRef = useRef(journalEntries);
  journalEntriesRef.current = journalEntries;

  const debtClearingsRef = useRef(debtClearings);
  debtClearingsRef.current = debtClearings;

  const treasuriesRef = useRef(treasuries);
  treasuriesRef.current = treasuries;

  const inventoryRef = useRef(inventory);
  inventoryRef.current = inventory;

  const expensesRef = useRef(expenses);
  expensesRef.current = expenses;

  const employeesRef = useRef(employees);
  employeesRef.current = employees;

  const employeeAdvancesRef = useRef(employeeAdvances);
  employeeAdvancesRef.current = employeeAdvances;

  const employeeDeductionsRef = useRef(employeeDeductions);
  employeeDeductionsRef.current = employeeDeductions;

  const employeeIncentivesRef = useRef(employeeIncentives);
  employeeIncentivesRef.current = employeeIncentives;

  const payrollSheetsRef = useRef(payrollSheets);
  payrollSheetsRef.current = payrollSheets;

  const { createReportPdf, printSurface } = useOfficialAppReportPdf();

  // Session state per chat ID to manage interactive multi-step conversations
  const sessionsRef = useRef<Map<string, SessionState>>(new Map());

  const getSession = (chatId: string): SessionState => {
    let session = sessionsRef.current.get(chatId);
    if (!session || Date.now() - session.lastActivity > 30 * 60 * 1000) {
      session = { step: 'idle', lastActivity: Date.now() };
      sessionsRef.current.set(chatId, session);
    }
    session.lastActivity = Date.now();
    return session;
  };

  const updateSession = (chatId: string, updates: Partial<SessionState>) => {
    const session = getSession(chatId);
    Object.assign(session, updates, { lastActivity: Date.now() });
    sessionsRef.current.set(chatId, session);
  };

  const isEnabled = settings.telegramConfig?.enabled;
  const botToken = settings.telegramConfig?.botToken;

  useEffect(() => {
    if (!isEnabled || !botToken) return;

    // Send Main Reports Menu (Mirrors in-app ReportsView tabs)
    const sendMainMenu = async (chatId: string) => {
      updateSession(chatId, {
        step: 'idle',
        targetReportType: undefined,
        targetPartyId: undefined,
        targetEmployeeId: undefined,
        pendingDateRange: undefined,
      });
      const facilityName = settingsRef.current.businessName || 'مطبعة ومكتبة لبنان';

      const menuText = `
🏢 <b>المساعد المحاسبي الذكي - مركز التقارير</b>
📌 <b>${facilityName}</b>

يرجى اختيار التقرير المطلوب استخراجه بصيغة PDF الرسمية:
      `.trim();

      await TelegramService.sendMessage(menuText, settingsRef.current, {
        chatId,
        replyMarkup: {
          inline_keyboard: [
            [
              { text: '👤 كشف حساب عميل', callback_data: 'menu_customer_statement' },
              { text: '🏢 كشف حساب مورد', callback_data: 'menu_supplier_statement' },
            ],
            [
              { text: '📦 مبيعات أصناف عميل', callback_data: 'menu_customer_items' },
              { text: '💰 حركة الصناديق والسيولة', callback_data: 'menu_treasury_report' },
            ],
            [
              { text: '📊 تقرير المبيعات', callback_data: 'menu_sales_report' },
              { text: '🛒 تقرير المشتريات', callback_data: 'menu_purchases_report' },
            ],
            [
              { text: '⚠️ نواقص المخزون', callback_data: 'menu_inventory_report' },
              { text: '📑 تقرير المصروفات', callback_data: 'menu_expenses_report' },
            ],
            [
              { text: '👷 كشف حساب موظف', callback_data: 'menu_employee_statement' },
              { text: '🔄 تحديث القائمة', callback_data: 'menu_main' },
            ],
          ],
        },
      });
    };

    // Ask to confirm party match
    const sendPartyConfirmation = async (
      chatId: string,
      matches: { party: Party; score: number }[],
      reportType: 'customer_statement' | 'supplier_statement' | 'customer_items',
      customRange?: { fromDate: string; toDate: string; label: string }
    ) => {
      const best = matches[0].party;
      const currency = (settingsRef.current as any).currency || '₪';
      const typeLabel =
        reportType === 'customer_items'
          ? 'العميل'
          : reportType === 'customer_statement'
          ? 'العميل'
          : 'المورد';
      const bal = best.balance || 0;
      const balText =
        bal > 0
          ? `${bal.toFixed(2)} ${currency} (مدين / مطلوب منه)`
          : bal < 0
          ? `${Math.abs(bal).toFixed(2)} ${currency} (دائن / مستحق له)`
          : `0.00 ${currency} (خالص)`;

      updateSession(chatId, {
        targetReportType: reportType,
        targetPartyId: best.id,
        pendingDateRange: customRange,
      });

      const reportTitle =
        reportType === 'customer_items'
          ? 'كشف مبيعات ومسحوبات الأصناف'
          : reportType === 'customer_statement'
          ? 'كشف الحساب التفصيلي للعميل'
          : 'كشف الحساب التفصيلي للمورد';

      const text = `
🔍 <b>نتيجة البحث عن ${typeLabel}:</b>
📋 التقرير المطلوب: <b>${reportTitle}</b>
هل تقصد: <b>${best.name}</b>؟
📌 الرصيد الحالي: <b>${balText}</b>
${best.phone ? `📱 الهاتف: <code>${best.phone}</code>` : ''}
${customRange ? `📅 الفترة المحددة: <b>${customRange.label}</b>` : ''}
      `.trim();

      const inlineKeyboard: any[][] = [
        [{ text: `✅ نعم، أقصد: ${best.name}`, callback_data: `confirm_party_${best.id}` }],
      ];

      if (matches.length > 1) {
        const alt1 = matches[1].party;
        inlineKeyboard.push([{ text: `🔍 أقصد: ${alt1.name}`, callback_data: `confirm_party_${alt1.id}` }]);
      }
      if (matches.length > 2) {
        const alt2 = matches[2].party;
        inlineKeyboard.push([{ text: `🔍 أقصد: ${alt2.name}`, callback_data: `confirm_party_${alt2.id}` }]);
      }

      inlineKeyboard.push([
        { text: '❌ كتابة اسم آخر', callback_data: `retry_search_${reportType}` },
        { text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' },
      ]);

      await TelegramService.sendMessage(text, settingsRef.current, {
        chatId,
        replyMarkup: { inline_keyboard: inlineKeyboard },
      });
    };

    // Ask to confirm employee match
    const sendEmployeeConfirmation = async (
      chatId: string,
      matches: { employee: Employee; score: number }[],
      customRange?: { fromDate: string; toDate: string; label: string }
    ) => {
      const best = matches[0].employee;
      const currency = (settingsRef.current as any).currency || '₪';
      const roleText = best.jobTitle || 'موظف';
      const salaryText = best.salaryAmount ? `${best.salaryAmount.toFixed(2)} ${currency}` : '';

      updateSession(chatId, {
        targetReportType: 'employee_statement',
        targetEmployeeId: best.id,
        pendingDateRange: customRange,
      });

      const text = `
🔍 <b>نتيجة البحث عن الموظف:</b>
هل تقصد: <b>${best.name}</b>؟
📌 المسمى الوظيفي: <b>${roleText}</b>
${salaryText ? `💰 الراتب: <b>${salaryText}</b>\n` : ''}${best.phone ? `📱 الهاتف: <code>${best.phone}</code>\n` : ''}${customRange ? `📅 الفترة المحددة: <b>${customRange.label}</b>` : ''}
      `.trim();

      const inlineKeyboard: any[][] = [
        [{ text: `✅ نعم، أقصد: ${best.name}`, callback_data: `confirm_employee_${best.id}` }],
      ];

      if (matches.length > 1) {
        const alt1 = matches[1].employee;
        inlineKeyboard.push([{ text: `🔍 أقصد: ${alt1.name}`, callback_data: `confirm_employee_${alt1.id}` }]);
      }

      inlineKeyboard.push([
        { text: '❌ كتابة اسم موظف آخر', callback_data: 'menu_employee_statement' },
        { text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' },
      ]);

      await TelegramService.sendMessage(text, settingsRef.current, {
        chatId,
        replyMarkup: { inline_keyboard: inlineKeyboard },
      });
    };

    // Send Generic Interactive Period Selection Menu
    const sendPeriodSelection = async (
      chatId: string,
      title: string,
      reportType: ReportCategoryType,
      entityId: string = 'all'
    ) => {
      const promptText = `
✅ <b>${title}</b>

📅 <b>يرجى اختيار الفترة الزمنية للتقرير:</b>
      `.trim();

      await TelegramService.sendMessage(promptText, settingsRef.current, {
        chatId,
        replyMarkup: {
          inline_keyboard: [
            [
              { text: '📅 اليوم فقط', callback_data: `period_today_${reportType}_${entityId}` },
              { text: '📅 هذا الشهر', callback_data: `period_this_month_${reportType}_${entityId}` },
            ],
            [
              { text: '🗓️ آخر 30 يوم', callback_data: `period_last_30_days_${reportType}_${entityId}` },
              { text: '📆 السنة الحالية', callback_data: `period_this_year_${reportType}_${entityId}` },
            ],
            [
              { text: '♾️ كافة الحركات', callback_data: `period_all_${reportType}_${entityId}` },
              { text: '🎯 تحديد فترة مخصصة (من - إلى)', callback_data: `period_custom_${reportType}_${entityId}` },
            ],
            [{ text: '🔙 رجوع للقائمة الرئيسية', callback_data: 'menu_main' }],
          ],
        },
      });
    };

    // ==========================================
    // DISPATCH METHODS FOR ALL REPORTS (PDF)
    // ==========================================

    // 1. Customer or Supplier Statement PDF
    const dispatchStatementPdf = async (
      chatId: string,
      partyId: string,
      period:
        | 'today'
        | 'this_month'
        | 'last_month'
        | 'last_30_days'
        | 'this_year'
        | 'all'
        | { fromDate: string; toDate: string; label: string },
      requestedReport:'customer_statement'|'supplier_statement'
    ) => {
      const party = partiesRef.current.find(p => p.id === partyId);
      if (!party) {
        await TelegramService.sendMessage('❌ لم يتم العثور على الحساب المحدد.', settingsRef.current, { chatId });
        return;
      }

      const { fromDate, toDate, label: periodLabel } =
        typeof period === 'object' ? period : getDateRangeForPeriod(period);

      await TelegramService.sendMessage(
        `⏳ <b>جاري تجهيز كشف الحساب التفصيلي بالبنود الكاملة والختم الرسمي...</b>\nالطرف: <b>${party.name}</b>\nالفترة: <b>${periodLabel}</b>`,
        settingsRef.current,
        { chatId }
      );

      try {
        // Render the real ReportsView statement, identical to Customers/Reports print.
        const { blob, filename } = await createReportPdf({
          reportType:requestedReport,
          partyId:party.id,fromDate,toDate,
          filename:'account_statement_'+party.code+'_'+(fromDate||'all')+'_'+(toDate||'now')+'.pdf'
        });

        const caption = 'كشف حساب تفصيلي: '+party.name+' — '+periodLabel;

        await TelegramService.sendDocument(blob, filename, caption, chatId, botToken);

        await TelegramService.sendMessage('هل ترغب في طلب كشف آخر أو تقرير جديد؟', settingsRef.current, {
          chatId,
          replyMarkup: {
            inline_keyboard: [
              [
                { text: '👤 كشف عميل آخر', callback_data: 'menu_customer_statement' },
                { text: '🏢 كشف مورد آخر', callback_data: 'menu_supplier_statement' },
              ],
              [{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }],
            ],
          },
        });
      } catch (err: any) {
        console.error('Failed to generate statement PDF for Telegram:', err);
        await TelegramService.sendMessage(
          '❌ حدث خطأ أثناء تجهيز ملف الـ PDF لكشف الحساب. يرجى المحاولة مرة أخرى.',
          settingsRef.current,
          { chatId }
        );
      }
    };

    // 2. Customer Items Statement PDF
    const dispatchCustomerItemsPdf = async (
      chatId: string,
      partyId: string,
      period:
        | 'today'
        | 'this_month'
        | 'last_month'
        | 'last_30_days'
        | 'this_year'
        | 'all'
        | { fromDate: string; toDate: string; label: string }
    ) => {
      const party = partiesRef.current.find(p => p.id === partyId);
      if (!party) {
        await TelegramService.sendMessage('❌ لم يتم العثور على العميل المحدد.', settingsRef.current, { chatId });
        return;
      }

      const { fromDate, toDate, label: periodLabel } =
        typeof period === 'object' ? period : getDateRangeForPeriod(period);

      await TelegramService.sendMessage(
        `⏳ <b>جاري إنشاء كشف مسحوبات ومبيعات الأصناف التراكمي...</b>\nالعميل: <b>${party.name}</b>\nالفترة: <b>${periodLabel}</b>`,
        settingsRef.current,
        { chatId }
      );

      try {
        const { blob, filename } = await createReportPdf({
          reportType:'customer_items',partyId:party.id,fromDate,toDate,
          filename:'customer_items_'+party.code+'_'+(fromDate||'all')+'_'+(toDate||'now')+'.pdf'
        });

        const caption = `
📦 <b>كشف مبيعات ومسحوبات الأصناف: ${party.name}</b>
📅 الفترة: ${periodLabel}
تم إرفاق الكشف المعتمد كاملاً بصيغة PDF.
        `.trim();

        await TelegramService.sendDocument(blob, filename, caption, chatId, botToken);

        await TelegramService.sendMessage('هل ترغب في استخراج تقرير آخر؟', settingsRef.current, {
          chatId,
          replyMarkup: {
            inline_keyboard: [
              [{ text: '📦 أصناف عميل آخر', callback_data: 'menu_customer_items' }],
              [{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }],
            ],
          },
        });
      } catch (err) {
        console.error('Customer items PDF error:', err);
        await TelegramService.sendMessage('❌ تعذر إنشاء ملف PDF لمبيعات الأصناف.', settingsRef.current, { chatId });
      }
    };

    // 3. Treasury Movements & Liquidity PDF (Matches image_0bfa29be.png 1:1)
    const dispatchTreasuryReportPdf = async (
      chatId: string,
      period:
        | 'today'
        | 'this_month'
        | 'last_month'
        | 'last_30_days'
        | 'this_year'
        | 'all'
        | { fromDate: string; toDate: string; label: string }
    ) => {
      const { fromDate, toDate, label: periodLabel } =
        typeof period === 'object' ? period : getDateRangeForPeriod(period);

      const activeTreasuries = treasuriesRef.current;
      const currency = (settingsRef.current as any).currency || '₪';
      const totalLiquidity = activeTreasuries.reduce((sum, t) => sum + (t.balance || 0), 0);

      await TelegramService.sendMessage(
        `⏳ <b>جاري إنشاء كشف حركة الخزائن والتدفق النقدي بالفترة (${periodLabel})...</b>\nإجمالي السيولة النقدية: <b>${totalLiquidity.toFixed(2)} ${currency}</b>`,
        settingsRef.current,
        { chatId }
      );

      try {
        const { blob, filename } = await createReportPdf({
          reportType:'treasuries_movement',fromDate,toDate,
          filename:'treasuries_movement_'+(fromDate||'all')+'_'+(toDate||'now')+'.pdf'
        });

        await TelegramService.sendDocument(
          blob,
          filename,
          `كشف حركة وأرصدة الصناديق والخزائن (${periodLabel}) - إجمالي السيولة: ${totalLiquidity.toFixed(2)} ${currency}`,
          chatId,
          botToken
        );

        await TelegramService.sendMessage('تم استخراج كشف حركة الصناديق بنجاح.', settingsRef.current, {
          chatId,
          replyMarkup: {
            inline_keyboard: [[{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }]],
          },
        });
      } catch (err) {
        console.error('Treasury report PDF error:', err);
        await TelegramService.sendMessage('❌ تعذر إنشاء تقرير حركة الصناديق.', settingsRef.current, { chatId });
      }
    };

    // 4. Sales Report PDF
    const dispatchSalesReportPdf = async (
      chatId: string,
      period:
        | 'today'
        | 'this_month'
        | 'last_month'
        | 'last_30_days'
        | 'this_year'
        | 'all'
        | { fromDate: string; toDate: string; label: string }
    ) => {
      const { fromDate, toDate, label: periodLabel } =
        typeof period === 'object' ? period : getDateRangeForPeriod(period);

      await TelegramService.sendMessage(
        `⏳ <b>جاري تجهيز تقرير فواتير المبيعات بالفترة (${periodLabel})...</b>`,
        settingsRef.current,
        { chatId }
      );

      try {
        // Same A4 Sales Invoice Register generator invoked by the program.
        const matching=invoicesRef.current.filter(inv=>isConfirmedSalesInvoice(inv) &&
          (!fromDate||inv.date>=fromDate)&&(!toDate||inv.date<=toDate));
        const officialHtml=buildDetailedSalesReportHtml(matching,{
          companyName:settingsRef.current.businessName||'',
          settings:settingsRef.current,periodLabel,invoiceTypeLabel:'جميع الفواتير',
          searchLabel:'',customerName:inv=>formatInvoiceCustomerDisplay(inv,partiesRef.current),
          treasuries:treasuriesRef.current,autoPrint:false,
        });
        const blob=await captureOfficialSalesRegisterPdf(officialHtml);
        const filename='sales_invoice_register_'+(fromDate||'all')+'_'+(toDate||'now')+'.pdf';

        await TelegramService.sendDocument(
          blob,
          filename,
          `تقرير فواتير المبيعات المعتمد (${periodLabel})`,
          chatId,
          botToken
        );

        await TelegramService.sendMessage('تم إرسال تقرير المبيعات بنجاح.', settingsRef.current, {
          chatId,
          replyMarkup: {
            inline_keyboard: [[{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }]],
          },
        });
      } catch (err) {
        console.error('Sales report PDF error:', err);
        await TelegramService.sendMessage('❌ تعذر إنشاء تقرير المبيعات.', settingsRef.current, { chatId });
      }
    };

    // 5. Purchases Report PDF
    const dispatchPurchasesReportPdf = async (
      chatId: string,
      period:
        | 'today'
        | 'this_month'
        | 'last_month'
        | 'last_30_days'
        | 'this_year'
        | 'all'
        | { fromDate: string; toDate: string; label: string }
    ) => {
      const { fromDate, toDate, label: periodLabel } =
        typeof period === 'object' ? period : getDateRangeForPeriod(period);

      await TelegramService.sendMessage(
        `⏳ <b>جاري تجهيز تقرير فواتير المشتريات والتوريدات بالفترة (${periodLabel})...</b>`,
        settingsRef.current,
        { chatId }
      );

      try {
        const { blob, filename } = await createReportPdf({
          reportType:'purchases_report',fromDate,toDate,
          filename:'purchases_register_'+(fromDate||'all')+'_'+(toDate||'now')+'.pdf',
        });

        await TelegramService.sendDocument(
          blob,
          filename,
          `تقرير فواتير المشتريات المعتمد (${periodLabel})`,
          chatId,
          botToken
        );

        await TelegramService.sendMessage('تم إرسال تقرير المشتريات بنجاح.', settingsRef.current, {
          chatId,
          replyMarkup: {
            inline_keyboard: [[{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }]],
          },
        });
      } catch (err) {
        console.error('Purchases report PDF error:', err);
        await TelegramService.sendMessage('❌ تعذر إنشاء تقرير المشتريات.', settingsRef.current, { chatId });
      }
    };

    // 6. Inventory Shortages Report PDF
    const dispatchInventoryReportPdf = async (chatId: string) => {
      const items = inventoryRef.current;
      const lowStock = items.filter(it => it.category !== 'copy_scan' && it.stockQuantity <= it.minAlertQuantity);
      const currency = (settingsRef.current as any).currency || '₪';
      const totalValuation = items.reduce((sum, it) => sum + it.stockQuantity * (it.purchasePrice || 0), 0);

      await TelegramService.sendMessage(
        `⏳ <b>جاري إنشاء كشف نواقص المخزون وتنبيهات حد الطلب...</b>\nعدد الأصناف الناقصة: <b>${lowStock.length} صنف</b>\nإجمالي القيمة التقديرية للمخزون: <b>${totalValuation.toFixed(2)} ${currency}</b>`,
        settingsRef.current,
        { chatId }
      );

      try {
        const { blob, filename } = await createReportPdf({
          reportType:'inventory_report',
          filename:'inventory_shortages_'+new Date().toISOString().slice(0,10)+'.pdf',
        });

        await TelegramService.sendDocument(
          blob,
          filename,
          `تقرير نواقص المخزون وتنبيهات حد الطلب (${lowStock.length} صنف ناقص)`,
          chatId,
          botToken
        );

        await TelegramService.sendMessage('تم إرسال تقرير المخزون بنجاح.', settingsRef.current, {
          chatId,
          replyMarkup: {
            inline_keyboard: [[{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }]],
          },
        });
      } catch (err) {
        console.error('Inventory report PDF error:', err);
        await TelegramService.sendMessage('❌ تعذر إنشاء تقرير المخزون.', settingsRef.current, { chatId });
      }
    };

    // 7. Expenses Report PDF
    const dispatchExpensesReportPdf = async (
      chatId: string,
      period:
        | 'today'
        | 'this_month'
        | 'last_month'
        | 'last_30_days'
        | 'this_year'
        | 'all'
        | { fromDate: string; toDate: string; label: string }
    ) => {
      const { fromDate, toDate, label: periodLabel } =
        typeof period === 'object' ? period : getDateRangeForPeriod(period);

      await TelegramService.sendMessage(
        `⏳ <b>جاري تجهيز تقرير المصروفات والنفقات التشغيلية بالفترة (${periodLabel})...</b>`,
        settingsRef.current,
        { chatId }
      );

      try {
        const { blob, filename } = await createReportPdf({
          reportType:'expenses_report',fromDate,toDate,
          filename:'expense_register_'+(fromDate||'all')+'_'+(toDate||'now')+'.pdf',
        });

        await TelegramService.sendDocument(
          blob,
          filename,
          `تقرير المصروفات والنفقات التشغيلية (${periodLabel})`,
          chatId,
          botToken
        );

        await TelegramService.sendMessage('تم إرسال تقرير المصروفات بنجاح.', settingsRef.current, {
          chatId,
          replyMarkup: {
            inline_keyboard: [[{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }]],
          },
        });
      } catch (err) {
        console.error('Expenses report PDF error:', err);
        await TelegramService.sendMessage('❌ تعذر إنشاء تقرير المصروفات.', settingsRef.current, { chatId });
      }
    };

    // 8. Employee Statement PDF
    const dispatchEmployeeStatementPdf = async (
      chatId: string,
      employeeId: string,
      period:
        | 'today'
        | 'this_month'
        | 'last_month'
        | 'last_30_days'
        | 'this_year'
        | 'all'
        | { fromDate: string; toDate: string; label: string }
    ) => {
      const employee = employeesRef.current.find(e => e.id === employeeId);
      if (!employee) {
        await TelegramService.sendMessage('❌ لم يتم العثور على الموظف المحدد.', settingsRef.current, { chatId });
        return;
      }

      const { fromDate, toDate, label: periodLabel } =
        typeof period === 'object' ? period : getDateRangeForPeriod(period);

      await TelegramService.sendMessage(
        `⏳ <b>جاري إنشاء كشف حساب ومسحوبات الموظف (${employee.name})...</b>\nالفترة: <b>${periodLabel}</b>`,
        settingsRef.current,
        { chatId }
      );

      try {
        const { blob, filename } = await createReportPdf({
          reportType:'employee_statement',employeeId:employee.id,fromDate,toDate,
          filename:'employee_statement_'+employee.code+'_'+(fromDate||'all')+'_'+(toDate||'now')+'.pdf'
        });

        await TelegramService.sendDocument(
          blob,
          filename,
          `كشف حساب ومسحوبات الموظف: ${employee.name} (${periodLabel})`,
          chatId,
          botToken
        );

        await TelegramService.sendMessage('تم إرسال كشف حساب الموظف بنجاح.', settingsRef.current, {
          chatId,
          replyMarkup: {
            inline_keyboard: [
              [{ text: '👷 كشف موظف آخر', callback_data: 'menu_employee_statement' }],
              [{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }],
            ],
          },
        });
      } catch (err) {
        console.error('Employee statement PDF error:', err);
        await TelegramService.sendMessage('❌ تعذر إنشاء كشف حساب الموظف.', settingsRef.current, { chatId });
      }
    };

    // Central dispatcher helper for any report type
    const dispatchReportByType = async (
      chatId: string,
      reportType: ReportCategoryType,
      targetId: string,
      period: any
    ) => {
      switch (reportType) {
        case 'customer_statement':
        case 'supplier_statement':
          await dispatchStatementPdf(chatId, targetId, period, reportType);
          break;
        case 'customer_items':
          await dispatchCustomerItemsPdf(chatId, targetId, period);
          break;
        case 'treasury_report':
          await dispatchTreasuryReportPdf(chatId, period);
          break;
        case 'sales_report':
          await dispatchSalesReportPdf(chatId, period);
          break;
        case 'purchases_report':
          await dispatchPurchasesReportPdf(chatId, period);
          break;
        case 'inventory_report':
          await dispatchInventoryReportPdf(chatId);
          break;
        case 'expenses_report':
          await dispatchExpensesReportPdf(chatId, period);
          break;
        case 'employee_statement':
          await dispatchEmployeeStatementPdf(chatId, targetId, period);
          break;
        default:
          await sendMainMenu(chatId);
      }
    };

    // Start Central Telegram Polling
    TelegramService.startPolling(settingsRef.current, async (action: TelegramIncomingAction) => {
      const { type, text, data, chatId } = action;
      const session = getSession(chatId);

      // ==========================================
      // 1. CALLBACK QUERY ACTIONS (Buttons)
      // ==========================================
      if (type === 'callback' && data) {
        if (data === 'menu_main') {
          await sendMainMenu(chatId);
          return;
        }

        // 1.1 Customer Statement Selection
        if (data === 'menu_customer_statement' || data === 'retry_search_customer_statement') {
          updateSession(chatId, {
            step: 'awaiting_customer_name',
            targetReportType: 'customer_statement',
            targetPartyId: undefined,
            pendingDateRange: undefined,
          });
          await TelegramService.sendMessage(
            '👤 <b>كشف حساب عميل تفصيلي:</b>\nيرجى كتابة اسم العميل (أو جزء منه أو رقمه):',
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [[{ text: '❌ إلغاء ورجوع', callback_data: 'menu_main' }]],
              },
            }
          );
          return;
        }

        // 1.2 Supplier Statement Selection
        if (data === 'menu_supplier_statement' || data === 'retry_search_supplier_statement') {
          updateSession(chatId, {
            step: 'awaiting_supplier_name',
            targetReportType: 'supplier_statement',
            targetPartyId: undefined,
            pendingDateRange: undefined,
          });
          await TelegramService.sendMessage(
            '🏢 <b>كشف حساب مورد تفصيلي:</b>\nيرجى كتابة اسم المورد (أو جزء منه أو كوده):',
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [[{ text: '❌ إلغاء ورجوع', callback_data: 'menu_main' }]],
              },
            }
          );
          return;
        }

        // 1.3 Customer Items Selection
        if (data === 'menu_customer_items' || data === 'retry_search_customer_items') {
          updateSession(chatId, {
            step: 'awaiting_customer_items_party',
            targetReportType: 'customer_items',
            targetPartyId: undefined,
            pendingDateRange: undefined,
          });
          await TelegramService.sendMessage(
            '📦 <b>كشف مبيعات ومسحوبات أصناف عميل:</b>\nيرجى كتابة اسم العميل المطلوب:',
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [[{ text: '❌ إلغاء ورجوع', callback_data: 'menu_main' }]],
              },
            }
          );
          return;
        }

        // 1.4 Treasury Movements Selection
        if (data === 'menu_treasury_report') {
          await sendPeriodSelection(chatId, 'حركة وأرصدة الصناديق والخزائن', 'treasury_report', 'all');
          return;
        }

        // 1.5 Sales Report Selection
        if (data === 'menu_sales_report') {
          await sendPeriodSelection(chatId, 'تقرير فواتير المبيعات التفصيلي', 'sales_report', 'all');
          return;
        }

        // 1.6 Purchases Report Selection
        if (data === 'menu_purchases_report') {
          await sendPeriodSelection(chatId, 'تقرير فواتير المشتريات والتوريدات', 'purchases_report', 'all');
          return;
        }

        // 1.7 Inventory Report Selection
        if (data === 'menu_inventory_report') {
          await dispatchInventoryReportPdf(chatId);
          return;
        }

        // 1.8 Expenses Report Selection
        if (data === 'menu_expenses_report') {
          await sendPeriodSelection(chatId, 'تقرير المصروفات والنفقات التشغيلية', 'expenses_report', 'all');
          return;
        }

        // 1.9 Employee Statement Selection
        if (data === 'menu_employee_statement') {
          updateSession(chatId, {
            step: 'awaiting_employee_name',
            targetReportType: 'employee_statement',
            targetEmployeeId: undefined,
            pendingDateRange: undefined,
          });
          await TelegramService.sendMessage(
            '👷 <b>كشف حساب ومسحوبات موظف:</b>\nيرجى كتابة اسم الموظف:',
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [[{ text: '❌ إلغاء ورجوع', callback_data: 'menu_main' }]],
              },
            }
          );
          return;
        }

        // Confirming party from suggestion buttons
        if (data.startsWith('confirm_party_')) {
          const partyId = data.replace('confirm_party_', '');
          const party = partiesRef.current.find(p => p.id === partyId);
          if (party) {
            const reportType = session.targetReportType || 'customer_statement';
            if (session.pendingDateRange) {
              const pendingRange = session.pendingDateRange;
              updateSession(chatId, { step: 'idle', pendingDateRange: undefined });
              await dispatchReportByType(chatId, reportType, party.id, pendingRange);
            } else {
              updateSession(chatId, { step: 'idle', targetPartyId: party.id });
              const title =
                reportType === 'customer_items'
                  ? `كشف مبيعات أصناف: ${party.name}`
                  : `كشف حساب: ${party.name}`;
              await sendPeriodSelection(chatId, title, reportType, party.id);
            }
          } else {
            await TelegramService.sendMessage('❌ تعذر العثور على الطرف المحدد.', settingsRef.current, { chatId });
          }
          return;
        }

        // Confirming employee from suggestion buttons
        if (data.startsWith('confirm_employee_')) {
          const empId = data.replace('confirm_employee_', '');
          const emp = employeesRef.current.find(e => e.id === empId);
          if (emp) {
            if (session.pendingDateRange) {
              const pendingRange = session.pendingDateRange;
              updateSession(chatId, { step: 'idle', pendingDateRange: undefined });
              await dispatchEmployeeStatementPdf(chatId, emp.id, pendingRange);
            } else {
              updateSession(chatId, { step: 'idle', targetEmployeeId: emp.id, targetReportType: 'employee_statement' });
              await sendPeriodSelection(chatId, `كشف حساب الموظف: ${emp.name}`, 'employee_statement', emp.id);
            }
          } else {
            await TelegramService.sendMessage('❌ تعذر العثور على الموظف المحدد.', settingsRef.current, { chatId });
          }
          return;
        }

        // Prompting for custom date range (من - إلى)
        if (data.startsWith('period_custom_')) {
          const rest = data.replace('period_custom_', '');
          const [reportType, ...idParts] = rest.split('_') as [ReportCategoryType, ...string[]];
          const entityId = idParts.join('_') || session.targetPartyId || session.targetEmployeeId || 'all';

          updateSession(chatId, {
            step: 'awaiting_custom_period',
            targetReportType: reportType,
            targetPartyId: reportType !== 'employee_statement' && entityId !== 'all' ? entityId : undefined,
            targetEmployeeId: reportType === 'employee_statement' ? entityId : undefined,
          });

          await TelegramService.sendMessage(
            `🎯 <b>تحديد فترة مخصصة للتقرير:</b>\n\nيرجى كتابة أو إرسال تاريخ البداية والنهاية، مثلاً:\n<code>2026-10-01 إلى 2026-11-01</code>\nأو:\n<code>01-11-2026 الى 01-11-2026</code>\nأو:\n<code>01-11-2026</code> (ليوم واحد فقط)`,
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [
                  [
                    { text: '📅 اليوم فقط', callback_data: `period_today_${reportType}_${entityId}` },
                    { text: '📅 هذا الشهر', callback_data: `period_this_month_${reportType}_${entityId}` },
                  ],
                  [{ text: '❌ إلغاء ورجوع للقائمة', callback_data: 'menu_main' }],
                ],
              },
            }
          );
          return;
        }

        // Standard Period Selection Callback
        if (data.startsWith('period_')) {
          const parts = data.split('_');
          // e.g.: period_today_customer_statement_partyId
          // or:   period_this_month_treasury_report_all
          const periodKey = parts[1] === 'this' && parts[2] === 'month'
            ? 'this_month'
            : parts[1] === 'this' && parts[2] === 'year'
            ? 'this_year'
            : parts[1] === 'last' && parts[2] === '30' && parts[3] === 'days'
            ? 'last_30_days'
            : parts[1];

          // reconstruct remaining
          let reportType: ReportCategoryType = 'customer_statement';
          let entityId = 'all';

          if (data.includes('_customer_statement_')) {
            reportType = 'customer_statement';
            entityId = data.split('_customer_statement_')[1];
          } else if (data.includes('_supplier_statement_')) {
            reportType = 'supplier_statement';
            entityId = data.split('_supplier_statement_')[1];
          } else if (data.includes('_customer_items_')) {
            reportType = 'customer_items';
            entityId = data.split('_customer_items_')[1];
          } else if (data.includes('_treasury_report_')) {
            reportType = 'treasury_report';
            entityId = data.split('_treasury_report_')[1];
          } else if (data.includes('_sales_report_')) {
            reportType = 'sales_report';
            entityId = data.split('_sales_report_')[1];
          } else if (data.includes('_purchases_report_')) {
            reportType = 'purchases_report';
            entityId = data.split('_purchases_report_')[1];
          } else if (data.includes('_expenses_report_')) {
            reportType = 'expenses_report';
            entityId = data.split('_expenses_report_')[1];
          } else if (data.includes('_employee_statement_')) {
            reportType = 'employee_statement';
            entityId = data.split('_employee_statement_')[1];
          } else if (data.startsWith('period_today_') || data.startsWith('period_all_')) {
            // Legacy button fallback
            entityId = parts.slice(2).join('_');
          }

          const targetId = entityId !== 'all' ? entityId : session.targetPartyId || session.targetEmployeeId || '';
          await dispatchReportByType(chatId, reportType, targetId, periodKey as any);
          return;
        }
      }

      // ==========================================
      // 2. TEXT MESSAGE ACTIONS (Commands & Input)
      // ==========================================
      const cleanText = (text || '').trim();

      // Basic menu triggers
      if (
        cleanText === '/start' ||
        cleanText === 'مرحبا' ||
        cleanText === 'القائمة' ||
        cleanText === 'التقارير' ||
        cleanText === 'اوامر' ||
        cleanText === 'أوامر' ||
        cleanText === '/menu' ||
        cleanText === '/help'
      ) {
        await sendMainMenu(chatId);
        return;
      }

      // Direct report shortcuts
      if (cleanText === 'الصناديق' || cleanText === 'حركة الصناديق' || cleanText === 'الخزينة' || cleanText === 'السيولة') {
        await sendPeriodSelection(chatId, 'حركة وأرصدة الصناديق والخزائن', 'treasury_report', 'all');
        return;
      }

      if (cleanText === 'المبيعات' || cleanText === 'تقرير المبيعات' || cleanText === 'فواتير اليوم') {
        await sendPeriodSelection(chatId, 'تقرير فواتير المبيعات التفصيلي', 'sales_report', 'all');
        return;
      }

      if (cleanText === 'المشتريات' || cleanText === 'تقرير المشتريات') {
        await sendPeriodSelection(chatId, 'تقرير فواتير المشتريات والتوريدات', 'purchases_report', 'all');
        return;
      }

      if (cleanText === 'المخزون' || cleanText === 'النواقص' || cleanText === 'تقرير المخزون') {
        await dispatchInventoryReportPdf(chatId);
        return;
      }

      if (cleanText === 'المصروفات' || cleanText === 'تقرير المصروفات' || cleanText === 'النفقات') {
        await sendPeriodSelection(chatId, 'تقرير المصروفات والنفقات التشغيلية', 'expenses_report', 'all');
        return;
      }

      // Handling user typing custom dates (من - إلى)
      if (session.step === 'awaiting_custom_period') {
        const customRange = parseCustomDateRange(cleanText);
        if (customRange) {
          const reportType = session.targetReportType || 'customer_statement';
          const targetId = session.targetPartyId || session.targetEmployeeId || 'all';
          updateSession(chatId, { step: 'idle', pendingDateRange: undefined });
          await dispatchReportByType(chatId, reportType, targetId, customRange);
          return;
        } else {
          await TelegramService.sendMessage(
            `⚠️ <b>تعذر استخراج التاريخين من:</b> "<code>${cleanText}</code>"\n\nيرجى كتابتها بهذا الشكل:\n<code>2026-10-01 إلى 2026-11-01</code>\nأو:\n<code>01-11-2026 الى 01-11-2026</code>\nأو:\n<code>01-11-2026</code> (ليوم واحد)`,
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [[{ text: '🏠 إلغاء ورجوع للقائمة', callback_data: 'menu_main' }]],
              },
            }
          );
          return;
        }
      }

      // Handling Employee search
      if (session.step === 'awaiting_employee_name' || /^(كشف\s+)?(حساب\s+)?موظف\s+/i.test(cleanText)) {
        const rawQuery = cleanText.replace(/^(كشف\s+)?(حساب\s+)?موظف\s+/i, '').trim();
        const embeddedRange = parseCustomDateRange(rawQuery);
        let query = rawQuery;
        if (embeddedRange) {
          query = rawQuery
            .replace(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/g, '')
            .replace(/\b(من|إلى|الى|تاريخ|فترة|يوم)\b/g, '')
            .trim();
        }

        const matches = fuzzyMatchEmployees(query, employeesRef.current);
        if (matches.length > 0) {
          await sendEmployeeConfirmation(chatId, matches, embeddedRange || undefined);
          return;
        } else if (session.step === 'awaiting_employee_name') {
          await TelegramService.sendMessage(
            `❌ لم يتم العثور على موظف باسم "<b>${query}</b>". يرجى المحاولة باسم آخر:`,
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [[{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }]],
              },
            }
          );
          return;
        }
      }

      // 3. Customer items specific detection
      const isItemsPrefix = /^(كشف\s+)?(مبيعات\s+|حركة\s+)?أصناف(\s+عميل)?\s+/i.test(cleanText) ||
        session.step === 'awaiting_customer_items_party';

      if (isItemsPrefix) {
        const rawQuery = isItemsPrefix && session.step !== 'awaiting_customer_items_party'
          ? cleanText.replace(/^(كشف\s+)?(مبيعات\s+|حركة\s+)?أصناف(\s+عميل)?\s+/i, '').trim()
          : cleanText;

        const embeddedRange = parseCustomDateRange(rawQuery);
        let query = rawQuery;
        if (embeddedRange) {
          query = rawQuery
            .replace(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/g, '')
            .replace(/\b(من|إلى|الى|تاريخ|فترة|يوم)\b/g, '')
            .trim();
        }

        const matches = fuzzyMatchParties(query, partiesRef.current, 'customer');
        if (matches.length > 0) {
          await sendPartyConfirmation(chatId, matches, 'customer_items', embeddedRange || undefined);
          return;
        } else if (session.step === 'awaiting_customer_items_party') {
          await TelegramService.sendMessage(
            `❌ عذراً، لم يتم العثور على عميل باسم "<b>${query}</b>".`,
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [[{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }]],
              },
            }
          );
          return;
        }
      }

      // 4. Flexible Statement detection: 'كشف قوافل غزة', 'كشف حساب ...', 'طلب كشف ...', etc.
      const isStatementPrefix = /^(طلب\s+)?كشف(\s+حساب)?(\s+(عميل|مورد))?\s+/i.test(cleanText);
      const isSupplierSpecific = /مورد/i.test(cleanText);

      if (isStatementPrefix || session.step === 'awaiting_customer_name' || session.step === 'awaiting_supplier_name') {
        const rawQuery = isStatementPrefix
          ? cleanText.replace(/^(طلب\s+)?كشف(\s+حساب)?(\s+(عميل|مورد))?\s+/i, '').trim()
          : cleanText;

        const embeddedRange = parseCustomDateRange(rawQuery);
        let query = rawQuery;
        if (embeddedRange) {
          query = rawQuery
            .replace(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/g, '')
            .replace(/\b(من|إلى|الى|تاريخ|فترة|يوم)\b/g, '')
            .trim();
        }

        const filterType = isSupplierSpecific || session.step === 'awaiting_supplier_name'
          ? 'supplier'
          : session.step === 'awaiting_customer_name'
          ? 'customer'
          : 'all';

        const matches = fuzzyMatchParties(query, partiesRef.current, filterType);

        if (matches.length > 0) {
          const reportCategory: ReportCategoryType =
            matches[0].party.type === 'supplier' ? 'supplier_statement' : 'customer_statement';

          await sendPartyConfirmation(chatId, matches, reportCategory, embeddedRange || undefined);
          return;
        } else if (session.step !== 'idle') {
          await TelegramService.sendMessage(
            `❌ عذراً، لم يتم العثور على أي حساب يطابق الاسم "<b>${query}</b>".\nيرجى كتابة الاسم بصيغة أخرى، أو استخدام القائمة:`,
            settingsRef.current,
            {
              chatId,
              replyMarkup: {
                inline_keyboard: [
                  [{ text: '👤 كشف حساب عميل', callback_data: 'menu_customer_statement' }],
                  [{ text: '🏢 كشف حساب مورد', callback_data: 'menu_supplier_statement' }],
                  [{ text: '🏠 القائمة الرئيسية', callback_data: 'menu_main' }],
                ],
              },
            }
          );
          return;
        }
      }

      // 5. Direct party name during idle (e.g. typing 'قوافل غزة')
      if (cleanText.length >= 2) {
        const embeddedRange = parseCustomDateRange(cleanText);
        let query = cleanText;
        if (embeddedRange) {
          query = cleanText
            .replace(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/g, '')
            .replace(/\b(من|إلى|الى|تاريخ|فترة|يوم)\b/g, '')
            .trim();
        }

        const directMatches = fuzzyMatchParties(query, partiesRef.current, 'all');
        if (directMatches.length > 0 && directMatches[0].score >= 50) {
          const reportCategory: ReportCategoryType =
            directMatches[0].party.type === 'supplier' ? 'supplier_statement' : 'customer_statement';
          await sendPartyConfirmation(chatId, directMatches, reportCategory, embeddedRange || undefined);
          return;
        }
      }

      // Default fallback: prompt with main menu
      await TelegramService.sendMessage(
        `لم أتمكن من التعرف على الأمر "<b>${cleanText}</b>". يمكنك استعراض التقارير المتاحة أدناه:`,
        settingsRef.current,
        {
          chatId,
          replyMarkup: {
            inline_keyboard: [
              [
                { text: '👤 كشف حساب عميل', callback_data: 'menu_customer_statement' },
                { text: '🏢 كشف حساب مورد', callback_data: 'menu_supplier_statement' },
              ],
              [
                { text: '💰 كشف الصناديق', callback_data: 'menu_treasury_report' },
                { text: '📊 تقرير المبيعات', callback_data: 'menu_sales_report' },
              ],
              [{ text: '🏠 عرض كافة التقارير', callback_data: 'menu_main' }],
            ],
          },
        }
      );
    });

    return () => {
      TelegramService.stopPolling();
    };
  }, [isEnabled, botToken, createReportPdf]);

  return <>{printSurface}</>;
};
