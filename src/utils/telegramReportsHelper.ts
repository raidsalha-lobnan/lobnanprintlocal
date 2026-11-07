import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  Party,
  Employee,
  BusinessSettings,
  Treasury,
  Invoice,
  PurchaseInvoice,
  ExpenseItem,
  InventoryItem,
  PaymentVoucher,
  EmployeeAdvance,
  EmployeeDeduction,
  EmployeeIncentive,
  PayrollSheet,
} from '../types';
import { StatementResult, generateEmployeeStatement } from './statementGenerator';
import { getInvoiceTreasuryDisplay } from './invoiceStatusUtils';
import { formatInvoiceCustomerDisplay } from './partyUtils';
import masterSnapshot from '../data/blankSnapshot.json';

const defaultLobnanBanner = (masterSnapshot as any)?.settings?.headerImageUrl || '';
const defaultLobnanStamp = (masterSnapshot as any)?.settings?.stampUrl || '';
const defaultLobnanSignature = (masterSnapshot as any)?.settings?.signatureUrl || '';

/**
 * Normalizes Arabic text for flexible, error-tolerant comparison
 */
export function normalizeArabicText(str: string): string {
  if (!str) return '';
  return str
    .trim()
    .toLowerCase()
    .replace(/[\u064B-\u065F\u0670]/g, '') // Remove tashkeel/diacritics
    .replace(/[إأآا]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/[ىي]/g, 'ي')
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/[\s\-_/\\,.]+/g, ' ');
}

/**
 * Calculates Levenshtein edit distance between two strings
 */
function levenshteinDistance(s1: string, s2: string): number {
  const m = s1.length;
  const n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Fuzzy matches user query against party records (customers/suppliers)
 */
export function fuzzyMatchParties(
  rawQuery: string,
  parties: Party[],
  typeFilter?: 'customer' | 'supplier' | 'all'
): { party: Party; score: number }[] {
  const query = normalizeArabicText(rawQuery);
  if (!query || query.length < 1) return [];

  const filteredParties = parties.filter(p => {
    if (!typeFilter || typeFilter === 'all') return true;
    if (typeFilter === 'customer') {
      return p.type === 'customer' || p.type === 'both' || !p.type;
    }
    if (typeFilter === 'supplier') {
      return p.type === 'supplier' || p.type === 'both';
    }
    return true;
  });

  const scored: { party: Party; score: number }[] = [];

  for (const party of filteredParties) {
    const normName = normalizeArabicText(party.name || '');
    const normCompany = normalizeArabicText((party as any).companyName || '');
    const normCode = normalizeArabicText(party.code || '');
    const normPhone = (party.phone || '').replace(/\D/g, '');
    const cleanQueryPhone = query.replace(/\D/g, '');

    let score = 0;

    // 1. Exact phone match or exact code match
    if (cleanQueryPhone.length >= 4 && normPhone.includes(cleanQueryPhone)) {
      score = 100;
    } else if (normCode && normCode === query) {
      score = 100;
    }
    // 2. Exact normalized name match
    else if (normName === query || normCompany === query) {
      score = 95;
    }
    // 3. Name starts with query
    else if (normName.startsWith(query) || normCompany.startsWith(query)) {
      score = 90;
    }
    // 4. Substring containment
    else if (normName.includes(query) || normCompany.includes(query)) {
      score = 80;
    } else {
      // 5. Token overlap
      const queryTokens = query.split(' ').filter(Boolean);
      const nameTokens = normName.split(' ').filter(Boolean);
      let matchCount = 0;
      for (const qTok of queryTokens) {
        if (nameTokens.some(nTok => nTok.includes(qTok) || qTok.includes(nTok))) {
          matchCount++;
        }
      }
      if (queryTokens.length > 0 && matchCount > 0) {
        score = 60 + (matchCount / queryTokens.length) * 25;
      } else {
        // 6. Levenshtein distance for typos
        const dist = levenshteinDistance(query, normName.slice(0, Math.max(query.length, 10)));
        const maxLen = Math.max(query.length, normName.length);
        if (maxLen > 0 && dist <= 3) {
          score = Math.max(0, 60 - dist * 15);
        }
      }
    }

    if (score >= 40) {
      scored.push({ party, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Fuzzy matches user query against employee records
 */
export function fuzzyMatchEmployees(
  rawQuery: string,
  employees: Employee[]
): { employee: Employee; score: number }[] {
  const query = normalizeArabicText(rawQuery);
  if (!query || query.length < 1) return [];

  const scored: { employee: Employee; score: number }[] = [];

  for (const emp of employees) {
    const normName = normalizeArabicText(emp.name || '');
    const normCode = normalizeArabicText(emp.code || '');
    const normPhone = (emp.phone || '').replace(/\D/g, '');
    const cleanQueryPhone = query.replace(/\D/g, '');

    let score = 0;

    if (cleanQueryPhone.length >= 4 && normPhone.includes(cleanQueryPhone)) {
      score = 100;
    } else if (normCode && normCode === query) {
      score = 100;
    } else if (normName === query) {
      score = 95;
    } else if (normName.startsWith(query)) {
      score = 90;
    } else if (normName.includes(query)) {
      score = 80;
    } else {
      const dist = levenshteinDistance(query, normName.slice(0, Math.max(query.length, 10)));
      if (dist <= 3) {
        score = Math.max(0, 60 - dist * 15);
      }
    }

    if (score >= 40) {
      scored.push({ employee: emp, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return scored;
}

/**
 * Converts Eastern Arabic numerals (٠-٩) to standard Western Arabic numerals (0-9)
 */
export function convertEasternArabicDigits(str: string): string {
  if (!str) return '';
  return str.replace(/[٠-٩]/g, d => '0123456789'['٠١٢٣٤٥٦٧٨٩'.indexOf(d)]);
}

/**
 * Parses user input to extract custom date range (fromDate & toDate)
 * Supports formats like: YYYY-MM-DD to YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, etc.
 */
export function parseCustomDateRange(
  rawInput: string
): { fromDate: string; toDate: string; label: string } | null {
  if (!rawInput) return null;
  const input = convertEasternArabicDigits(rawInput).trim();

  // Match dates like 2026-11-01, 2026/11/01, 01-11-2026, 01/11/2026
  const dateRegex = /(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})|(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/g;
  const matches = input.match(dateRegex);

  if (!matches || matches.length === 0) return null;

  const toIso = (dateStr: string): string => {
    const parts = dateStr.split(/[-/.]/);
    if (parts[0].length === 4) {
      // YYYY-MM-DD
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      const d = parts[2].padStart(2, '0');
      return `${y}-${m}-${d}`;
    } else {
      // DD-MM-YYYY
      const d = parts[0].padStart(2, '0');
      const m = parts[1].padStart(2, '0');
      const y = parts[2];
      return `${y}-${m}-${d}`;
    }
  };

  const isoDates = matches.map(toIso);
  let fromDate = isoDates[0];
  let toDate = isoDates.length > 1 ? isoDates[1] : isoDates[0];

  if (fromDate > toDate) {
    const temp = fromDate;
    fromDate = toDate;
    toDate = temp;
  }

  const formatDisplay = (iso: string) => {
    const parts = iso.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  const label =
    fromDate === toDate
      ? `يوم (${formatDisplay(fromDate)})`
      : `من ${formatDisplay(fromDate)} إلى ${formatDisplay(toDate)}`;

  return { fromDate, toDate, label };
}

/**
 * Returns fromDate and toDate for common accounting periods
 */
export function getDateRangeForPeriod(
  period: 'today' | 'this_month' | 'last_month' | 'last_30_days' | 'this_year' | 'all'
): { fromDate?: string; toDate?: string; label: string } {
  const today = new Date();
  const todayIso = today.toISOString().split('T')[0];

  const formatDisplay = (iso: string) => {
    const parts = iso.split('-');
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  };

  if (period === 'today') {
    return {
      fromDate: todayIso,
      toDate: todayIso,
      label: `اليوم (${formatDisplay(todayIso)})`,
    };
  }

  if (period === 'this_month') {
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    return {
      fromDate: `${year}-${month}-01`,
      toDate: todayIso,
      label: 'هذا الشهر',
    };
  }

  if (period === 'last_month') {
    const prevMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const year = prevMonthDate.getFullYear();
    const month = String(prevMonthDate.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(year, prevMonthDate.getMonth() + 1, 0).getDate();
    return {
      fromDate: `${year}-${month}-01`,
      toDate: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
      label: 'الشهر الماضي',
    };
  }

  if (period === 'last_30_days') {
    const past = new Date(today);
    past.setDate(past.getDate() - 30);
    return {
      fromDate: past.toISOString().split('T')[0],
      toDate: todayIso,
      label: 'آخر 30 يوم',
    };
  }

  if (period === 'this_year') {
    const year = today.getFullYear();
    return {
      fromDate: `${year}-01-01`,
      toDate: todayIso,
      label: 'السنة الحالية',
    };
  }

  return {
    fromDate: undefined,
    toDate: todayIso,
    label: 'كافة الحركات',
  };
}

/**
 * Formats full customer display name with parent customer if applicable
 */
export function getPartyFullDisplayName(party: Party, parentParty?: Party | null): string {
  if (!party) return '';
  if (party.isSubCustomer && parentParty) {
    return `${parentParty.name} / ${party.name}`;
  }
  if ((party as any).parentCustomerName) {
    return `${(party as any).parentCustomerName} / ${party.name}`;
  }
  return party.name;
}

/**
 * Converts an HTML string into a PDF Blob via an offscreen render iframe
 */
export async function renderHtmlToPdfBlob(htmlContent: string): Promise<Blob> {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.left = '-9999px';
  iframe.style.top = '-9999px';
  iframe.style.width = '850px';
  iframe.style.height = '1200px';
  iframe.style.border = 'none';
  iframe.style.zIndex = '-1000';
  document.body.appendChild(iframe);

  try {
    const iframeDoc = iframe.contentWindow?.document || iframe.contentDocument;
    if (!iframeDoc) throw new Error('Could not access iframe document');

    iframeDoc.open();
    iframeDoc.write(htmlContent);
    iframeDoc.close();

    // Allow CSS, web fonts, and layout to settle
    await new Promise(resolve => setTimeout(resolve, 600));

    const contentHeight = Math.max(
      iframeDoc.body.scrollHeight,
      iframeDoc.documentElement.scrollHeight,
      800
    );
    iframe.style.height = `${contentHeight + 50}px`;

    const canvas = await html2canvas(iframeDoc.body, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 850,
    });

    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfPageWidth = pdf.internal.pageSize.getWidth();
    const pdfPageHeight = pdf.internal.pageSize.getHeight();

    const imgWidth = pdfPageWidth;
    const imgHeight = (canvas.height * pdfPageWidth) / canvas.width;

    // Multi-page slicing if content exceeds single A4 page
    let heightLeft = imgHeight;
    let position = 0;
    const imgData = canvas.toDataURL('image/jpeg', 0.95);

    pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
    heightLeft -= pdfPageHeight;

    while (heightLeft > 5) {
      position = position - pdfPageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, position, imgWidth, imgHeight);
      heightLeft -= pdfPageHeight;
    }

    return pdf.output('blob');
  } finally {
    try {
      document.body.removeChild(iframe);
    } catch {}
  }
}

/**
 * Formats standard ISO date (YYYY-MM-DD) into DD-MM-YYYY format
 */
function formatToDdMmYyyy(dateStr?: string): string {
  if (!dateStr) return 'بداية التعامل';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}-${parts[1]}-${parts[0]}`;
  }
  return dateStr;
}

/**
 * Generates an official, detailed account statement PDF for Telegram
 * 100% matched to the on-screen statement with item breakdown tables and bottom summary cards
 */
export async function generateStatementPdfBlob(params: {
  party: Party;
  parentParty?: Party | null;
  statementResult: StatementResult;
  settings: BusinessSettings;
  periodLabel: string;
}): Promise<{ blob: Blob; filename: string }> {
  const { party, parentParty, statementResult, settings, periodLabel } = params;

  const displayName = getPartyFullDisplayName(party, parentParty);
  const currency = (settings as any).currency || '₪';
  const businessName = settings.businessName || 'مطبعة ومكتبة لبنان';
  const phone1 = '00972594299942';
  const phone2 = '00972597080014';
  const address1 = 'دير البلح - شارع البروك';
  const address2 = 'الشيخ رضوان - مفترق الغزالي';
  const headerImageUrl = settings.headerImageUrl || (settings as any).letterheadUrl || defaultLobnanBanner;

  const isCustomer = party.type !== 'supplier';
  const rows = statementResult.rows || [];
  const openingBalance = statementResult.openingBalance || 0;
  const closingBalance = statementResult.closingBalance || 0;
  const totalDebit = statementResult.totalDebit || 0;
  const totalCredit = statementResult.totalCredit || 0;

  const displayFromDate = statementResult.fromDate ? formatToDdMmYyyy(statementResult.fromDate) : 'بداية التعامل';
  const displayToDate = statementResult.toDate ? formatToDdMmYyyy(statementResult.toDate) : formatToDdMmYyyy(new Date().toISOString());

  let tableRowsHtml = '';

  // Opening Balance Row - ONLY displayed if openingBalance !== 0
  if (openingBalance !== 0) {
    tableRowsHtml += `
      <tr style="background-color: #f8fafc; font-weight: bold; border-bottom: 2px solid #cbd5e1;">
        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace;">-</td>
        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace;">${displayFromDate}</td>
        <td style="padding: 5px 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold; color: #475569;">
          رصيد سابق - رصيد الحساب الافتتاحي السابق (ما قبل تاريخ ${displayFromDate})
        </td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; color: #b91c1c; font-family: monospace;">
          ${openingBalance > 0 ? openingBalance.toFixed(2) : '-'}
        </td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; color: #047857; font-family: monospace;">
          ${openingBalance < 0 ? Math.abs(openingBalance).toFixed(2) : '-'}
        </td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: 800; font-family: monospace;">
          ${openingBalance.toFixed(2)}
        </td>
      </tr>
    `;
  }

  // Transaction Rows + Item Sub-Tables (Matches image_71096944.png 1:1)
  rows.forEach((row, idx) => {
    const isEven = idx % 2 === 0;
    const debitText = row.debit > 0 ? row.debit.toFixed(2) : '-';
    const creditText = row.credit > 0 ? row.credit.toFixed(2) : '-';
    const typeLabel =
      row.typeLabel ||
      (row.type === 'invoice'
        ? 'فاتورة مبيعات'
        : row.type === 'receipt'
        ? 'سند قبض'
        : row.type === 'payment'
        ? 'سند صرف'
        : row.type === 'purchase'
        ? 'فاتورة مشتريات'
        : row.type === 'sales_return'
        ? 'مردودات مبيعات'
        : row.type === 'purchase_return'
        ? 'مردودات مشتريات'
        : row.type === 'clearance'
        ? 'مقاصة ديون'
        : 'حركة مالية');

    let note = '';
    if (row.type === 'invoice') {
      if (row.invoiceNotes) {
        note = row.invoiceNotes;
        if (row.subCustomerName) note += ` [الزبون الفرعي: ${row.subCustomerName}]`;
      } else if (row.subCustomerName) {
        note = `[الزبون الفرعي: ${row.subCustomerName}]`;
      } else if (row.description) {
        const cleaned = row.description
          .replace(/^فاتورة مبيعات\s*(\([^)]*\))?\s*(-\s*)?/, '')
          .replace(/-\s*إجمالي\s*[\d,.]+/gi, '')
          .replace(/إجمالي\s*[\d,.]+/gi, '')
          .replace(/-\s*total\s*[\d,.]+/gi, '')
          .trim();
        note = cleaned;
      }
    } else if (row.type === 'receipt' || row.type === 'payment') {
      const rawNote = row.voucherNotes || row.description || '';
      note = rawNote.replace(/^(سند قبض|سند صرف)\s*(نقدية|شيك|تحويل)?\s*(-\s*)?/, '').trim();
    } else {
      note = row.description || '';
    }
    const cleanNote = note.trim();

    const titleParts = [typeLabel];
    if (row.referenceNumber && row.referenceNumber !== 'OPENING') {
      titleParts.push(row.referenceNumber);
    }
    if (cleanNote) {
      titleParts.push(cleanNote);
    }
    const fullTitle = titleParts.join(' - ');

    // Main Transaction Row
    tableRowsHtml += `
      <tr style="background-color: ${isEven ? '#ffffff' : '#fcfdfd'}; border-bottom: 1px solid #cbd5e1;">
        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 32px;">${idx + 1}</td>
        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-size: 11px; width: 85px;">${row.date || ''}</td>
        <td style="padding: 5px 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${fullTitle}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; color: #be123c; font-family: monospace; width: 85px;">${debitText}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; color: #047857; font-family: monospace; width: 85px;">${creditText}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: 800; font-family: monospace; width: 95px; background-color: #f8fafc;">${(row.runningBalance || 0).toFixed(2)}</td>
      </tr>
    `;

    // Inner Sub-Table for Invoice Items (Matches image_71096944.png 1:1)
    if (row.items && row.items.length > 0) {
      let itemRowsHtml = '';
      row.items.forEach((it, iIdx) => {
        const itemNote = it.notes || it.description;
        const itemFullDesc = itemNote && itemNote !== it.itemName ? `${it.itemName} / ${itemNote}` : it.itemName;

        itemRowsHtml += `
          <tr style="background-color: #ffffff; border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 3px 4px; text-align: center; border-left: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 28px;">${iIdx + 1}</td>
            <td style="padding: 3px 8px; text-align: right; border-left: 1px solid #cbd5e1; font-weight: bold; color: #334155;">${itemFullDesc}</td>
            <td style="padding: 3px 4px; text-align: center; border-left: 1px solid #cbd5e1; font-family: monospace; width: 45px;">${it.length != null && it.length !== 0 ? it.length : '-'}</td>
            <td style="padding: 3px 4px; text-align: center; border-left: 1px solid #cbd5e1; font-family: monospace; width: 45px;">${it.width != null && it.width !== 0 ? it.width : '-'}</td>
            <td style="padding: 3px 4px; text-align: center; border-left: 1px solid #cbd5e1; font-family: monospace; width: 40px; font-weight: bold;">${it.count || 1}</td>
            <td style="padding: 3px 4px; text-align: center; border-left: 1px solid #cbd5e1; font-family: monospace; width: 45px; font-weight: bold; color: #1e3a8a;">${it.quantity}</td>
            <td style="padding: 3px 6px; text-align: center; border-left: 1px solid #cbd5e1; font-family: monospace; width: 55px;">${it.unitPrice.toFixed(2)}</td>
            <td style="padding: 3px 6px; text-align: center; font-family: monospace; width: 65px; font-weight: bold;">${it.total.toFixed(2)}</td>
          </tr>
        `;
      });

      tableRowsHtml += `
        <tr style="background-color: #ffffff;">
          <td colspan="6" style="padding: 0; border: 1px solid #cbd5e1;">
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
              <thead>
                <tr style="background-color: #f1f5f9; color: #1e293b; border-bottom: 1px solid #cbd5e1; font-weight: bold;">
                  <th style="width: 28px; text-align: center; border-left: 1px solid #cbd5e1; padding: 4px;">م</th>
                  <th style="text-align: right; border-left: 1px solid #cbd5e1; padding: 4px 8px;">الصنف والبيان</th>
                  <th style="width: 45px; text-align: center; border-left: 1px solid #cbd5e1; padding: 4px;">الطول</th>
                  <th style="width: 45px; text-align: center; border-left: 1px solid #cbd5e1; padding: 4px;">العرض</th>
                  <th style="width: 40px; text-align: center; border-left: 1px solid #cbd5e1; padding: 4px;">العدد</th>
                  <th style="width: 45px; text-align: center; border-left: 1px solid #cbd5e1; padding: 4px;">الكمية</th>
                  <th style="width: 55px; text-align: center; border-left: 1px solid #cbd5e1; padding: 4px;">السعر</th>
                  <th style="width: 65px; text-align: center; padding: 4px;">الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                ${itemRowsHtml}
              </tbody>
            </table>
          </td>
        </tr>
      `;
    }
  });

  // Table Footer Row
  const footerRowHtml = `
    <tr style="background-color: #f1f5f9; font-weight: bold; border-top: 2px solid #cbd5e1;">
      <td colspan="3" style="text-align: left; padding: 6px 12px; border: 1px solid #cbd5e1; font-size: 12px; color: #0f172a;">
        الإجمالي العام للحركات بالفترة:
      </td>
      <td style="text-align: center; font-weight: 800; color: #b91c1c; padding: 6px; border: 1px solid #cbd5e1; font-size: 12px; font-family: monospace;">
        ${totalDebit.toFixed(2)}
      </td>
      <td style="text-align: center; font-weight: 800; color: #047857; padding: 6px; border: 1px solid #cbd5e1; font-size: 12px; font-family: monospace;">
        ${totalCredit.toFixed(2)}
      </td>
      <td style="text-align: center; font-weight: 800; font-family: monospace; padding: 6px; border: 1px solid #cbd5e1; font-size: 12px; color: #0f172a; background-color: #e2e8f0;">
        ${currency} ${closingBalance.toFixed(2)}
      </td>
    </tr>
  `;

  // Top Header Banner (Official Lobnan Print Banner)
  let headerBannerHtml = '';
  if (headerImageUrl) {
    headerBannerHtml = `
      <div style="width: 100%; text-align: center; margin-bottom: 6px;">
        <img src="${headerImageUrl}" alt="مطبعة لبنان" style="width: 100%; max-height: 155px; object-fit: contain; display: block; margin: 0 auto;" />
      </div>
    `;
  } else {
    headerBannerHtml = `
      <div style="width: 100%; border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 14px; margin-bottom: 8px; background: #ffffff; display: flex; justify-content: space-between; align-items: center;">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="background: #0f172a; color: white; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900;">
            ل
          </div>
          <div>
            <div style="font-size: 20px; font-weight: 900; color: #0f172a; letter-spacing: -0.5px;">${businessName}</div>
            <div style="font-size: 10px; font-weight: bold; color: #475569; font-family: monospace;">LOBNAN PRINT & LIBRARY</div>
          </div>
        </div>
        <div style="text-align: left; font-size: 10.5px; color: #334155; line-height: 1.5;">
          <div>📍 ${address1} | ${address2}</div>
          <div style="font-family: monospace; font-weight: bold;">📱 ${phone1} | ${phone2}</div>
        </div>
      </div>
    `;
  }

  // 4 Bottom Summary Cards (Matches image_71096944.png 1:1)
  const balanceStatus = isCustomer
    ? closingBalance > 0
      ? 'مدين'
      : closingBalance < 0
      ? 'دائن'
      : 'متزن'
    : closingBalance > 0
    ? 'دائن'
    : closingBalance < 0
    ? 'مدين'
    : 'متزن';

  const bottomCardsHtml = `
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 10px; font-size: 11px; font-family: 'Segoe UI', Tahoma, Arial, sans-serif;">
      <!-- Card 1: رصيد سابق -->
      <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 4px; text-align: center; font-weight: bold;">
        <span style="color: #64748b; font-size: 10px;">رصيد سابق:</span>
        <span style="color: #0f172a; margin-right: 4px; font-family: monospace; font-size: 11.5px; font-weight: 800;">${openingBalance.toFixed(2)} ${currency}</span>
      </div>

      <!-- Card 2: إجمالي مدين -->
      <div style="background: #ffffff; border: 1px solid #fca5a5; border-radius: 4px; padding: 6px 4px; text-align: center; font-weight: bold;">
        <span style="color: #991b1b; font-size: 10px;">إجمالي مدين:</span>
        <span style="color: #b91c1c; margin-right: 4px; font-family: monospace; font-size: 11.5px; font-weight: 800;">${totalDebit.toFixed(2)} ${currency}</span>
      </div>

      <!-- Card 3: إجمالي دائن -->
      <div style="background: #ffffff; border: 1px solid #86efac; border-radius: 4px; padding: 6px 4px; text-align: center; font-weight: bold;">
        <span style="color: #166534; font-size: 10px;">إجمالي دائن:</span>
        <span style="color: #047857; margin-right: 4px; font-family: monospace; font-size: 11.5px; font-weight: 800;">${totalCredit.toFixed(2)} ${currency}</span>
      </div>

      <!-- Card 4: الإجمالي -->
      <div style="background: ${closingBalance > 0 ? '#fffbeb' : '#ffffff'}; border: 1px solid #fcd34d; border-radius: 4px; padding: 6px 4px; text-align: center; font-weight: bold;">
        <span style="color: #92400e; font-size: 10px;">الإجمالي:</span>
        <span style="color: #b45309; margin-right: 4px; font-family: monospace; font-size: 11.5px; font-weight: 800;">${Math.abs(closingBalance).toFixed(2)} ${currency}</span>
        <span style="color: #92400e; font-size: 9.5px;">(${balanceStatus})</span>
      </div>
    </div>
  `;

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>كشف حساب - ${displayName}</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          margin: 0;
          padding: 12px;
          background: #ffffff;
          color: #0f172a;
          direction: rtl;
        }
        .report-outer-container {
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          padding: 14px 16px;
          background: #ffffff;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 0;
        }
        th {
          background-color: #f1f5f9;
          color: #0f172a;
          padding: 6px 4px;
          font-size: 11.5px;
          font-weight: bold;
          border: 1px solid #94a3b8;
          text-align: center;
        }
      </style>
    </head>
    <body>
      <div class="report-outer-container">
        <!-- 1. Header Banner -->
        ${headerBannerHtml}

        <!-- 2. Statement Title & Period -->
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; margin-top: 4px;">
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; line-height: 1.4;">
            ${isCustomer ? 'كشف حساب عميل تفصيلي:' : 'كشف حساب مورد تفصيلي:'} <span style="color: ${isCustomer ? '#1e3a8a' : '#881337'};">${displayName}</span>
          </div>
          <div style="font-size: 12px; color: #475569; font-weight: 600; margin-top: 4px;">
            من تاريخ: <span style="font-family: monospace;">${displayFromDate}</span> إلى تاريخ: <span style="font-family: monospace;">${displayToDate}</span>
          </div>
        </div>

        <!-- 3. Main Detailed Table -->
        <table style="border: 1px solid #94a3b8; font-size: 11.5px;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a; font-weight: bold; border-bottom: 2px solid #94a3b8;">
              <th style="width: 32px; text-align: center; border: 1px solid #94a3b8;">م</th>
              <th style="width: 85px; text-align: center; border: 1px solid #94a3b8; font-family: monospace;">التاريخ</th>
              <th style="text-align: center; border: 1px solid #94a3b8; padding: 6px 8px;">البيان والشرح والتفاصيل الكاملة</th>
              <th style="width: 85px; text-align: center; border: 1px solid #94a3b8; background-color: #ffe4e6; color: #be123c;">${isCustomer ? 'مدين (عليه)' : 'مدين (المسدد)'}</th>
              <th style="width: 85px; text-align: center; border: 1px solid #94a3b8; background-color: #dcfce7; color: #15803d;">${isCustomer ? 'دائن (له)' : 'دائن (التوريدات)'}</th>
              <th style="width: 95px; text-align: center; border: 1px solid #94a3b8; background-color: #e2e8f0; color: #0f172a;">الرصيد التراكمي</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
          <tfoot>
            ${footerRowHtml}
          </tfoot>
        </table>

        <!-- 4. Bottom 4 Summary Cards -->
        ${bottomCardsHtml}

        <!-- 5. Official Signatures and Lobnan Print Stamp -->
        ${getReportSignaturesHtml({
          rightLabel: 'المحاسب المسؤول',
          centerLabel: isCustomer ? 'توقيع وختم العميل بالمطابقة' : 'مصادقة وختم المورد',
          leftLabel: 'المدير المالي والاعتماد',
          settings,
        })}
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const safeName = party.name.replace(/[/\\?%*:|"<>]/g, '_');
  const filename = `كشف_حساب_${safeName}_${displayFromDate}_إلى_${displayToDate}.pdf`;

  return { blob, filename };
}

/**
 * Generates official report signature and stamp block
 */
export function getReportSignaturesHtml(params: {
  rightLabel?: string;
  centerLabel?: string;
  leftLabel?: string;
  settings?: BusinessSettings;
}): string {
  const {
    rightLabel = 'المحاسب المسؤول',
    centerLabel = 'المراجع والمحاسب',
    leftLabel = 'المدير المالي والاعتماد',
    settings,
  } = params;

  const stampUrl = settings?.stampUrl || defaultLobnanStamp;
  const signatureUrl = settings?.signatureUrl || defaultLobnanSignature;

  return `
    <div style="margin-top: 22px; padding-top: 12px; border-top: 1px solid #cbd5e1; display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; text-align: center; font-size: 11px;">
      <!-- Right: Preparation -->
      <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 80px;">
        <span style="font-weight: bold; color: #1e293b; font-size: 11.5px;">${rightLabel}</span>
        <div style="border-bottom: 1px dashed #94a3b8; width: 75%; margin: 0 auto; height: 35px;"></div>
      </div>

      <!-- Center: Reviewer / Customer -->
      <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 80px;">
        <span style="font-weight: bold; color: #1e293b; font-size: 11.5px;">${centerLabel}</span>
        <div style="border-bottom: 1px dashed #94a3b8; width: 75%; margin: 0 auto; height: 35px;"></div>
      </div>

      <!-- Left: Financial Manager & Official Stamp -->
      <div style="display: flex; flex-direction: column; justify-content: space-between; min-height: 80px; position: relative;">
        <span style="font-weight: bold; color: #1e293b; font-size: 11.5px;">${leftLabel}</span>
        <div style="display: flex; justify-content: center; align-items: center; min-height: 65px; position: relative;">
          ${
            stampUrl
              ? `<img src="${stampUrl}" alt="Official Stamp" style="width: 78px; height: 78px; object-fit: contain; filter: contrast(1.15) saturate(1.1); transform: rotate(-4deg); mix-blend-mode: multiply;" />`
              : ''
          }
          ${
            signatureUrl
              ? `<img src="${signatureUrl}" alt="Signature" style="position: absolute; bottom: 2px; max-height: 40px; max-width: 90px; object-fit: contain; mix-blend-mode: multiply; opacity: 0.85;" />`
              : ''
          }
        </div>
      </div>
    </div>
  `;
}

/**
 * Generates an official Customer Items Aggregated report (كشف مبيعات أصناف العميل)
 */
export async function generateCustomerItemsPdfBlob(params: {
  party: Party;
  parentParty?: Party | null;
  invoices: Invoice[];
  settings: BusinessSettings;
  fromDate?: string;
  toDate?: string;
}): Promise<{ blob: Blob; filename: string }> {
  const { party, parentParty, invoices, settings, fromDate, toDate } = params;
  const currency = settings.currency || '₪';
  const displayName = getPartyFullDisplayName(party, parentParty);

  const displayFromDate = fromDate ? formatToDdMmYyyy(fromDate) : 'بداية التعامل';
  const displayToDate = toDate ? formatToDdMmYyyy(toDate) : formatToDdMmYyyy(new Date().toISOString());

  // Aggregate items
  const map = new Map<string, {
    itemName: string;
    description?: string;
    totalQuantity: number;
    totalAmount: number;
    lastDate: string;
    invoiceCount: number;
  }>();

  invoices.forEach(inv => {
    const isMatch = inv.customerId === party.id || inv.customerName === party.name;
    if (!isMatch) return;
    if (fromDate && inv.date < fromDate) return;
    if (toDate && inv.date > toDate) return;

    (inv.items || []).forEach(line => {
      const key = line.itemId || line.itemName;
      const name = line.itemName;
      const qty = Number(line.quantity) || 1;
      const lineTotal = Number(line.total) || (line.unitPrice * qty);

      if (!map.has(key)) {
        map.set(key, {
          itemName: name,
          description: line.notes || line.description || '',
          totalQuantity: qty,
          totalAmount: lineTotal,
          lastDate: inv.date || '',
          invoiceCount: 1,
        });
      } else {
        const prev = map.get(key)!;
        prev.totalQuantity += qty;
        prev.totalAmount += lineTotal;
        prev.invoiceCount += 1;
        if (inv.date && inv.date > prev.lastDate) {
          prev.lastDate = inv.date;
        }
      }
    });
  });

  const items = Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
  const totalQuantity = items.reduce((s, i) => s + i.totalQuantity, 0);
  const totalAmount = items.reduce((s, i) => s + i.totalAmount, 0);

  const headerImageUrl = settings.headerImageUrl || (settings as any).letterheadUrl || defaultLobnanBanner;
  const headerBannerHtml = headerImageUrl
    ? `<div style="width: 100%; text-align: center; margin-bottom: 6px;"><img src="${headerImageUrl}" alt="مطبعة لبنان" style="width: 100%; max-height: 155px; object-fit: contain; display: block; margin: 0 auto;" /></div>`
    : `<div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;"><h2 style="margin: 0; color: #0f172a;">${settings.businessName || 'مطبعة ومكتبة لبنان'}</h2></div>`;

  const rowsHtml = items.map((item, idx) => {
    const avgPrice = item.totalQuantity > 0 ? item.totalAmount / item.totalQuantity : 0;
    return `
      <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fcfdfd'}; border-bottom: 1px solid #cbd5e1;">
        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 32px;">${idx + 1}</td>
        <td style="padding: 5px 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">
          ${item.itemName} ${item.description && item.description !== item.itemName ? `<span style="color: #64748b; font-weight: normal;"> / ${item.description}</span>` : ''}
        </td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; color: #1e3a8a; font-family: monospace; width: 75px;">${item.totalQuantity}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; width: 75px;">${avgPrice.toFixed(2)}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 85px;">${item.totalAmount.toFixed(2)}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; width: 85px; font-size: 11px;">${item.lastDate || '-'}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; color: #2563eb; width: 65px;">${item.invoiceCount}</td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>كشف مبيعات الأصناف للعميل - ${displayName}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 12px; background: #ffffff; color: #0f172a; direction: rtl; }
        .report-outer-container { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; background: #ffffff; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11.5px; }
        th { background: #f1f5f9; color: #0f172a; padding: 6px 4px; font-size: 11.5px; border: 1px solid #94a3b8; text-align: center; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="report-outer-container">
        ${headerBannerHtml}
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; margin-top: 4px;">
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; line-height: 1.4;">
            كشف مبيعات ومسحوبات الأصناف التراكمي: <span style="color: #1e3a8a;">${displayName}</span>
          </div>
          <div style="font-size: 12px; color: #475569; font-weight: 600; margin-top: 4px;">
            من تاريخ: <span style="font-family: monospace;">${displayFromDate}</span> إلى تاريخ: <span style="font-family: monospace;">${displayToDate}</span>
          </div>
        </div>

        <!-- Summary Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 12px; text-align: center;">
            <span style="font-size: 11px; color: #475569; font-weight: bold;">إجمالي قيمة المشتريات: </span>
            <strong style="font-size: 14px; color: #1e3a8a; font-family: monospace;">${totalAmount.toFixed(2)} ${currency}</strong>
          </div>
          <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 12px; text-align: center;">
            <span style="font-size: 11px; color: #475569; font-weight: bold;">إجمالي عدد الوحدات: </span>
            <strong style="font-size: 14px; color: #047857; font-family: monospace;">${totalQuantity}</strong>
          </div>
        </div>

        <table style="border: 1px solid #94a3b8;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a; font-weight: bold; border-bottom: 2px solid #94a3b8;">
              <th style="width: 32px;">م</th>
              <th>اسم الصنف والبيان</th>
              <th style="width: 75px;">إجمالي الكمية</th>
              <th style="width: 75px;">متوسط السعر</th>
              <th style="width: 85px;">إجمالي القيمة</th>
              <th style="width: 85px;">آخر سحب</th>
              <th style="width: 65px;">الفواتير</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="7" style="padding: 16px; text-align: center; color: #64748b;">لا توجد مسحوبات أصناف مسجلة لهذا العميل خلال الفترة</td></tr>'}
          </tbody>
          <tfoot style="background-color: #f1f5f9; font-weight: bold; border-top: 2px solid #cbd5e1;">
            <tr>
              <td colspan="2" style="text-align: left; padding: 6px 12px; border: 1px solid #cbd5e1; font-size: 12px; color: #0f172a;">الإجمالي العام:</td>
              <td style="text-align: center; font-weight: 800; color: #1e3a8a; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${totalQuantity}</td>
              <td style="border: 1px solid #cbd5e1;"></td>
              <td style="text-align: center; font-weight: 800; color: #0f172a; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${totalAmount.toFixed(2)} ${currency}</td>
              <td colspan="2" style="border: 1px solid #cbd5e1;"></td>
            </tr>
          </tfoot>
        </table>

        ${getReportSignaturesHtml({
          rightLabel: 'إعداد التقرير',
          centerLabel: 'توقيع وختم العميل بالمطابقة',
          leftLabel: 'المدير المالي والاعتماد',
          settings,
        })}
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const safeName = party.name.replace(/[/\\?%*:|"<>]/g, '_');
  const filename = `كشف_أصناف_${safeName}_${displayFromDate}_إلى_${displayToDate}.pdf`;
  return { blob, filename };
}

/**
 * Generates an official treasury movements & cash flow report as PDF
 * Perfectly matches image_0bfa29be.png and ReportsView.tsx
 */
export async function generateTreasuryReportPdfBlob(params: {
  treasuries: Treasury[];
  vouchers?: PaymentVoucher[];
  invoices?: Invoice[];
  parties?: Party[];
  settings: BusinessSettings;
  fromDate?: string;
  toDate?: string;
  selectedTreasuryCode?: string;
}): Promise<{ blob: Blob; filename: string }> {
  const {
    treasuries,
    vouchers = [],
    invoices = [],
    parties = [],
    settings,
    fromDate,
    toDate,
    selectedTreasuryCode = 'all',
  } = params;

  const currency = settings.currency || '₪';
  const targetTreasuries = selectedTreasuryCode === 'all'
    ? treasuries
    : treasuries.filter(t => t.accountCode === selectedTreasuryCode);

  const displayFromDate = fromDate ? formatToDdMmYyyy(fromDate) : 'بداية التعامل';
  const displayToDate = toDate ? formatToDdMmYyyy(toDate) : formatToDdMmYyyy(new Date().toISOString());

  // Collect and deduplicate movements
  interface TreasuryMovementRow {
    date: string;
    treasuryName: string;
    type: string;
    docNumber: string;
    partyName: string;
    actualCurrency: string;
    actualAmount: number;
    exchangeRate: number;
    inflow: number;
    outflow: number;
    notes: string;
  }

  const rows: TreasuryMovementRow[] = [];
  const seenTxKeys = new Set<string>();

  // 1. Transactions directly on target treasuries
  targetTreasuries.forEach(t => {
    (t.transactions || []).forEach(tx => {
      const cleanDate = (tx.date || '').split('T')[0];
      if (fromDate && cleanDate < fromDate) return;
      if (toDate && cleanDate > toDate) return;

      const actualCurr = tx.currency || tx.actualCurrency || 'ILS';
      const rate = Number(tx.exchangeRate) || 1.0;
      const actualAmt = Math.abs(Number(tx.actualAmount !== undefined ? tx.actualAmount : tx.amount) || 0);
      const baseAmt = Math.abs(Number(tx.baseAmount !== undefined ? tx.baseAmount : actualAmt * rate) || 0);
      const isIncome = tx.type === 'deposit' || tx.type === 'transfer_in';

      let opLabel = isIncome ? 'إيداع نقدي' : 'سحب نقدي';
      if (tx.referenceType === 'pos_sale' || tx.referenceType === 'invoice') opLabel = 'تحصيل مبيعات';
      else if (tx.type === 'transfer_in') opLabel = 'تحويل وارد';
      else if (tx.type === 'transfer_out') opLabel = 'تحويل صادر';
      else if (tx.referenceType === 'receipt') opLabel = 'سند قبض';
      else if (tx.referenceType === 'payment') opLabel = 'سند صرف';
      else if (tx.referenceType === 'expense') opLabel = 'مصروفات نقدية';
      else if (tx.referenceType === 'purchase') opLabel = 'سداد مشتريات';

      const docNum = tx.voucherNumber || tx.referenceId || (tx.id || '').slice(0, 10) || '-';
      const party = tx.partyName || (tx.targetTreasuryName ? `إلى/من: ${tx.targetTreasuryName}` : '-');

      const uniqueKey = `${t.accountCode}_${docNum}_${cleanDate}_${baseAmt}`;
      seenTxKeys.add(uniqueKey);
      if (docNum && docNum !== '-') seenTxKeys.add(`${t.accountCode}_${docNum}`);

      rows.push({
        date: cleanDate,
        treasuryName: t.name,
        type: opLabel,
        docNumber: docNum,
        partyName: party,
        actualCurrency: actualCurr,
        actualAmount: actualAmt,
        exchangeRate: rate,
        inflow: isIncome ? baseAmt : 0,
        outflow: !isIncome ? baseAmt : 0,
        notes: tx.description || '-',
      });
    });
  });

  // 2. Vouchers linked to target treasuries not recorded yet
  vouchers.forEach(v => {
    const cleanDate = (v.date || '').split('T')[0];
    if (fromDate && cleanDate < fromDate) return;
    if (toDate && cleanDate > toDate) return;

    const vTreasuryCode = v.treasuryAccountCode || v.accountCode;
    const isMatch = selectedTreasuryCode === 'all' || selectedTreasuryCode === vTreasuryCode;
    if (!isMatch) return;

    const docNum = v.voucherNumber;
    if (seenTxKeys.has(`${vTreasuryCode}_${docNum}`)) return;

    const tObj = treasuries.find(t => t.accountCode === vTreasuryCode);
    const isReceipt = v.type === 'receipt';
    const curr = v.currency || 'ILS';
    const rate = Number(v.exchangeRate) || 1.0;
    const actualAmt = Number(v.amount) || 0;
    const baseAmt = actualAmt * rate;

    rows.push({
      date: cleanDate,
      treasuryName: tObj?.name || 'الصندوق',
      type: isReceipt ? 'سند قبض' : 'سند صرف',
      docNumber: docNum,
      partyName: v.partyName || '-',
      actualCurrency: curr,
      actualAmount: actualAmt,
      exchangeRate: rate,
      inflow: isReceipt ? baseAmt : 0,
      outflow: !isReceipt ? baseAmt : 0,
      notes: v.description || '-',
    });
  });

  rows.sort((a, b) => b.date.localeCompare(a.date));

  const totalInflow = rows.reduce((s, r) => s + r.inflow, 0);
  const totalOutflow = rows.reduce((s, r) => s + r.outflow, 0);
  const netFlow = totalInflow - totalOutflow;

  // Holdings in selected treasuries
  const totalLiquidityILS = targetTreasuries.reduce((s, t) => s + (t.balance || 0), 0);

  const headerImageUrl = settings.headerImageUrl || (settings as any).letterheadUrl || defaultLobnanBanner;
  const headerBannerHtml = headerImageUrl
    ? `<div style="width: 100%; text-align: center; margin-bottom: 6px;"><img src="${headerImageUrl}" alt="مطبعة لبنان" style="width: 100%; max-height: 155px; object-fit: contain; display: block; margin: 0 auto;" /></div>`
    : `<div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;"><h2 style="margin: 0; color: #0f172a;">${settings.businessName || 'مطبعة ومكتبة لبنان'}</h2></div>`;

  const rowsHtml = rows.map((r, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fcfdfd'}; border-bottom: 1px solid #cbd5e1;">
      <td style="padding: 4px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-size: 11px;">${r.date}</td>
      <td style="padding: 4px 6px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold; font-size: 11px;">${r.treasuryName}</td>
      <td style="padding: 4px; text-align: center; border: 1px solid #cbd5e1; font-size: 11px;">${r.type}</td>
      <td style="padding: 4px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #1e3a8a; font-size: 11px;">${r.docNumber}</td>
      <td style="padding: 4px 6px; text-align: right; border: 1px solid #cbd5e1; font-size: 11px;">${r.partyName}</td>
      <td style="padding: 4px 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; font-size: 11px;">${r.actualAmount.toFixed(2)} ${r.actualCurrency === 'ILS' ? '₪' : r.actualCurrency}</td>
      <td style="padding: 4px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-size: 10px; color: #64748b;">${r.exchangeRate.toFixed(4)}</td>
      <td style="padding: 4px 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #047857; font-size: 11px;">${r.inflow > 0 ? r.inflow.toFixed(2) : '-'}</td>
      <td style="padding: 4px 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #b91c1c; font-size: 11px;">${r.outflow > 0 ? r.outflow.toFixed(2) : '-'}</td>
      <td style="padding: 4px 6px; text-align: right; border: 1px solid #cbd5e1; font-size: 10.5px; color: #475569; max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${r.notes}</td>
    </tr>
  `).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>كشف حركات الصناديق والخزائن البنكية</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 12px; background: #ffffff; color: #0f172a; direction: rtl; }
        .report-outer-container { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; background: #ffffff; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11px; }
        th { background: #f1f5f9; color: #0f172a; padding: 5px 4px; font-size: 11px; border: 1px solid #94a3b8; text-align: center; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="report-outer-container">
        ${headerBannerHtml}
        
        <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px;">
          <div>
            <span style="font-size: 10px; color: #0f766e; font-weight: bold; background: #f0fdfa; padding: 2px 6px; border-radius: 4px;">إدارة السيولة والخزائن</span>
            <div style="font-size: 16px; font-weight: 900; color: #0f172a; margin-top: 2px;">كشف حركات الصناديق والحسابات البنكية</div>
            <div style="font-size: 11px; color: #64748b; font-weight: 600;">تفاصيل التدفقات النقدية والعملات الفعلية وأسعار الصرف</div>
            <div style="font-size: 11px; color: #475569; font-weight: bold; margin-top: 2px;">
              من تاريخ: <span style="font-family: monospace;">${displayFromDate}</span> إلى تاريخ: <span style="font-family: monospace;">${displayToDate}</span>
            </div>
          </div>
          
          <div style="text-align: left; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 12px;">
            <span style="font-size: 10.5px; color: #64748b; font-weight: bold; display: block;">الموجودات الفعلية في الصناديق المختارة:</span>
            <strong style="font-size: 15px; color: #0f766e; font-family: monospace;">${totalLiquidityILS.toFixed(2)} ${currency}</strong>
            <span style="font-size: 10px; color: #475569; display: block;">المعادل المحاسبي الإجمالي</span>
          </div>
        </div>

        <table style="border: 1px solid #94a3b8;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a; font-weight: bold; border-bottom: 2px solid #94a3b8;">
              <th style="width: 75px;">التاريخ</th>
              <th style="width: 90px;">الصندوق</th>
              <th style="width: 75px;">العملية</th>
              <th style="width: 70px;">المستند</th>
              <th>الطرف / المستفيد</th>
              <th style="width: 80px;">المبلغ الفعلي</th>
              <th style="width: 50px;">الصرف</th>
              <th style="width: 75px; color: #047857;">وارد (₪)</th>
              <th style="width: 75px; color: #b91c1c;">منصرف (₪)</th>
              <th style="width: 120px;">البيان والشرح</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="10" style="padding: 16px; text-align: center; color: #64748b;">لا توجد حركات مسجلة للصناديق خلال الفترة المحددة</td></tr>'}
          </tbody>
          <tfoot style="background-color: #f1f5f9; font-weight: bold; border-top: 2px solid #cbd5e1;">
            <tr>
              <td colspan="7" style="text-align: left; padding: 6px 12px; border: 1px solid #cbd5e1; font-size: 11.5px; color: #0f172a;">
                إجمالي التدفقات المكافئة (شيكل) - صافي الحركة: <span style="font-family: monospace; color: ${netFlow >= 0 ? '#047857' : '#b91c1c'};">${netFlow.toFixed(2)} ₪</span>
              </td>
              <td style="text-align: center; font-weight: 800; color: #047857; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">+${totalInflow.toFixed(2)}</td>
              <td style="text-align: center; font-weight: 800; color: #b91c1c; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">-${totalOutflow.toFixed(2)}</td>
              <td style="border: 1px solid #cbd5e1;"></td>
            </tr>
          </tfoot>
        </table>

        ${getReportSignaturesHtml({
          rightLabel: 'مسؤول الصندوق',
          centerLabel: 'المراجع الداخلي',
          leftLabel: 'المدير المالي والاعتماد',
          settings,
        })}
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const filename = `كشف_حركات_الصناديق_${displayFromDate}_إلى_${displayToDate}.pdf`;
  return { blob, filename };
}

/**
 * Generates today's / period sales report as PDF
 */
export async function generateSalesReportPdfBlob(params: {
  invoices: Invoice[];
  parties?: Party[];
  treasuries?: Treasury[];
  settings: BusinessSettings;
  fromDate?: string;
  toDate?: string;
}): Promise<{ blob: Blob; filename: string }> {
  const { invoices, parties = [], treasuries = [], settings, fromDate, toDate } = params;
  const currency = settings.currency || '₪';
  const todayIso = new Date().toISOString().split('T')[0];

  const targetFrom = fromDate || todayIso;
  const targetTo = toDate || todayIso;

  const displayFromDate = formatToDdMmYyyy(targetFrom);
  const displayToDate = formatToDdMmYyyy(targetTo);

  const filteredInvoices = invoices.filter(inv => {
    const invDate = (inv.date || '').split('T')[0];
    if (invDate < targetFrom) return false;
    if (invDate > targetTo) return false;
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const totalSales = filteredInvoices.reduce((sum, inv) => sum + (inv.totalAmount || (inv as any).total || 0), 0);
  const paidSales = filteredInvoices.reduce((sum, inv) => sum + (inv.paidAmount || (inv.paymentMethod === 'cash' ? inv.totalAmount : 0) || 0), 0);
  const remainingSales = Math.max(0, totalSales - paidSales);

  const headerImageUrl = settings.headerImageUrl || (settings as any).letterheadUrl || defaultLobnanBanner;
  const headerBannerHtml = headerImageUrl
    ? `<div style="width: 100%; text-align: center; margin-bottom: 6px;"><img src="${headerImageUrl}" alt="مطبعة لبنان" style="width: 100%; max-height: 155px; object-fit: contain; display: block; margin: 0 auto;" /></div>`
    : `<div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;"><h2 style="margin: 0; color: #0f172a;">${settings.businessName || 'مطبعة ومكتبة لبنان'}</h2></div>`;

  const rowsHtml = filteredInvoices.map((inv, idx) => {
    const invTotal = inv.totalAmount || (inv as any).total || 0;
    const invPaid = inv.paidAmount || (inv.paymentMethod === 'cash' ? invTotal : 0);
    const invRemaining = Math.max(0, invTotal - invPaid);
    const customerText = formatInvoiceCustomerDisplay(inv, parties) || inv.customerName || 'زبون نقدي';
    const tInfo = getInvoiceTreasuryDisplay(inv, treasuries);

    return `
      <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fcfdfd'}; border-bottom: 1px solid #cbd5e1;">
        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 32px;">${idx + 1}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 85px; color: #1e3a8a;">${inv.invoiceNumber}</td>
        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-size: 11px; width: 80px;">${inv.date || ''}</td>
        <td style="padding: 5px 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${customerText}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-size: 11px; width: 110px;">${tInfo.label}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 80px;">${invTotal.toFixed(2)}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; color: #047857; font-family: monospace; width: 80px;">${invPaid.toFixed(2)}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; color: #b91c1c; font-family: monospace; width: 80px;">${invRemaining.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>تقرير فواتير ومبيعات الفترة</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 12px; background: #ffffff; color: #0f172a; direction: rtl; }
        .report-outer-container { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; background: #ffffff; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11.5px; }
        th { background: #f1f5f9; color: #0f172a; padding: 6px 4px; font-size: 11px; border: 1px solid #94a3b8; text-align: center; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="report-outer-container">
        ${headerBannerHtml}
        
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; margin-top: 4px;">
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; line-height: 1.4;">
            تقرير فواتير ومبيعات الفترة
          </div>
          <div style="font-size: 12px; color: #475569; font-weight: 600; margin-top: 4px;">
            من تاريخ: <span style="font-family: monospace;">${displayFromDate}</span> إلى تاريخ: <span style="font-family: monospace;">${displayToDate}</span>
          </div>
        </div>

        <!-- Summary Grid -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px; font-size: 11px;">
          <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 4px; text-align: center;">
            <span style="color: #64748b; font-size: 10px; font-weight: bold;">عدد الفواتير:</span>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a; font-family: monospace;">${filteredInvoices.length}</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #93c5fd; border-radius: 4px; padding: 6px 4px; text-align: center;">
            <span style="color: #1e3a8a; font-size: 10px; font-weight: bold;">إجمالي المبيعات:</span>
            <div style="font-size: 14px; font-weight: bold; color: #1e3a8a; font-family: monospace;">${totalSales.toFixed(2)} ${currency}</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #86efac; border-radius: 4px; padding: 6px 4px; text-align: center;">
            <span style="color: #166534; font-size: 10px; font-weight: bold;">المدفوع نقداً/شبكة:</span>
            <div style="font-size: 14px; font-weight: bold; color: #047857; font-family: monospace;">${paidSales.toFixed(2)} ${currency}</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #fca5a5; border-radius: 4px; padding: 6px 4px; text-align: center;">
            <span style="color: #991b1b; font-size: 10px; font-weight: bold;">المتبقي ذمم آجلة:</span>
            <div style="font-size: 14px; font-weight: bold; color: #b91c1c; font-family: monospace;">${remainingSales.toFixed(2)} ${currency}</div>
          </div>
        </div>

        <table style="border: 1px solid #94a3b8;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a; font-weight: bold; border-bottom: 2px solid #94a3b8;">
              <th style="width: 32px;">م</th>
              <th style="width: 85px;">رقم الفاتورة</th>
              <th style="width: 80px;">التاريخ</th>
              <th>اسم العميل</th>
              <th style="width: 75px;">طريقة الدفع</th>
              <th style="width: 80px;">الإجمالي</th>
              <th style="width: 80px;">المدفوع</th>
              <th style="width: 80px;">المتبقي</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" style="padding: 16px; text-align: center; color: #64748b;">لا توجد فواتير مبيعات مسجلة خلال الفترة المحددة</td></tr>'}
          </tbody>
          <tfoot style="background-color: #f1f5f9; font-weight: bold; border-top: 2px solid #cbd5e1;">
            <tr>
              <td colspan="5" style="text-align: left; padding: 6px 12px; border: 1px solid #cbd5e1; font-size: 11.5px; color: #0f172a;">الإجمالي العام:</td>
              <td style="text-align: center; font-weight: 800; color: #0f172a; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${totalSales.toFixed(2)}</td>
              <td style="text-align: center; font-weight: 800; color: #047857; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${paidSales.toFixed(2)}</td>
              <td style="text-align: center; font-weight: 800; color: #b91c1c; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${remainingSales.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        ${getReportSignaturesHtml({
          rightLabel: 'مسؤول المبيعات والكاشير',
          centerLabel: 'المراجعة والتدقيق',
          leftLabel: 'المدير المالي والاعتماد',
          settings,
        })}
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const filename = `تقرير_المبيعات_${displayFromDate}_إلى_${displayToDate}.pdf`;
  return { blob, filename };
}

/**
 * Generates Purchases Report as PDF
 */
export async function generatePurchasesReportPdfBlob(params: {
  purchases: PurchaseInvoice[];
  settings: BusinessSettings;
  fromDate?: string;
  toDate?: string;
}): Promise<{ blob: Blob; filename: string }> {
  const { purchases, settings, fromDate, toDate } = params;
  const currency = settings.currency || '₪';
  const todayIso = new Date().toISOString().split('T')[0];

  const targetFrom = fromDate || todayIso;
  const targetTo = toDate || todayIso;

  const displayFromDate = formatToDdMmYyyy(targetFrom);
  const displayToDate = formatToDdMmYyyy(targetTo);

  const filteredPurchases = purchases.filter(pur => {
    const purDate = (pur.date || '').split('T')[0];
    if (purDate < targetFrom) return false;
    if (purDate > targetTo) return false;
    return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const totalPurchases = filteredPurchases.reduce((sum, p) => sum + (p.totalAmount || 0), 0);
  const paidPurchases = filteredPurchases.reduce((sum, p) => sum + (p.paidAmount || (p.paymentMethod === 'cash' ? p.totalAmount : 0) || 0), 0);
  const remainingPurchases = Math.max(0, totalPurchases - paidPurchases);

  const headerImageUrl = settings.headerImageUrl || (settings as any).letterheadUrl || defaultLobnanBanner;
  const headerBannerHtml = headerImageUrl
    ? `<div style="width: 100%; text-align: center; margin-bottom: 6px;"><img src="${headerImageUrl}" alt="مطبعة لبنان" style="width: 100%; max-height: 155px; object-fit: contain; display: block; margin: 0 auto;" /></div>`
    : `<div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;"><h2 style="margin: 0; color: #0f172a;">${settings.businessName || 'مطبعة ومكتبة لبنان'}</h2></div>`;

  const rowsHtml = filteredPurchases.map((pur, idx) => {
    const purTotal = pur.totalAmount || 0;
    const purPaid = pur.paidAmount || (pur.paymentMethod === 'cash' ? purTotal : 0);
    const purRem = Math.max(0, purTotal - purPaid);
    const payMethod = pur.paymentMethod === 'cash' ? 'نقدي' : pur.paymentMethod === 'credit' ? 'آجل' : 'شيك/بنك';

    return `
      <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fcfdfd'}; border-bottom: 1px solid #cbd5e1;">
        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 32px;">${idx + 1}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 85px; color: #1e3a8a;">${pur.invoiceNumber}</td>
        <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-size: 11px; width: 80px;">${pur.date || ''}</td>
        <td style="padding: 5px 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${pur.supplierName || 'مورد عام'}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-size: 11px; width: 75px;">${payMethod}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 80px;">${purTotal.toFixed(2)}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; color: #047857; font-family: monospace; width: 80px;">${purPaid.toFixed(2)}</td>
        <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; color: #b91c1c; font-family: monospace; width: 80px;">${purRem.toFixed(2)}</td>
      </tr>
    `;
  }).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>تقرير فواتير المشتريات والتوريدات</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 12px; background: #ffffff; color: #0f172a; direction: rtl; }
        .report-outer-container { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; background: #ffffff; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11.5px; }
        th { background: #f1f5f9; color: #0f172a; padding: 6px 4px; font-size: 11px; border: 1px solid #94a3b8; text-align: center; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="report-outer-container">
        ${headerBannerHtml}
        
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; margin-top: 4px;">
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; line-height: 1.4;">
            تقرير فواتير المشتريات والتوريدات
          </div>
          <div style="font-size: 12px; color: #475569; font-weight: 600; margin-top: 4px;">
            من تاريخ: <span style="font-family: monospace;">${displayFromDate}</span> إلى تاريخ: <span style="font-family: monospace;">${displayToDate}</span>
          </div>
        </div>

        <!-- Summary Grid -->
        <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px; font-size: 11px;">
          <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 4px; text-align: center;">
            <span style="color: #64748b; font-size: 10px; font-weight: bold;">عدد الفواتير:</span>
            <div style="font-size: 14px; font-weight: bold; color: #0f172a; font-family: monospace;">${filteredPurchases.length}</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #fca5a5; border-radius: 4px; padding: 6px 4px; text-align: center;">
            <span style="color: #991b1b; font-size: 10px; font-weight: bold;">إجمالي المشتريات:</span>
            <div style="font-size: 14px; font-weight: bold; color: #b91c1c; font-family: monospace;">${totalPurchases.toFixed(2)} ${currency}</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #86efac; border-radius: 4px; padding: 6px 4px; text-align: center;">
            <span style="color: #166534; font-size: 10px; font-weight: bold;">المدفوع:</span>
            <div style="font-size: 14px; font-weight: bold; color: #047857; font-family: monospace;">${paidPurchases.toFixed(2)} ${currency}</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #fcd34d; border-radius: 4px; padding: 6px 4px; text-align: center;">
            <span style="color: #92400e; font-size: 10px; font-weight: bold;">المتبقي آجل:</span>
            <div style="font-size: 14px; font-weight: bold; color: #b45309; font-family: monospace;">${remainingPurchases.toFixed(2)} ${currency}</div>
          </div>
        </div>

        <table style="border: 1px solid #94a3b8;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a; font-weight: bold; border-bottom: 2px solid #94a3b8;">
              <th style="width: 32px;">م</th>
              <th style="width: 85px;">رقم الفاتورة</th>
              <th style="width: 80px;">التاريخ</th>
              <th>اسم المورد</th>
              <th style="width: 75px;">طريقة الدفع</th>
              <th style="width: 80px;">الإجمالي</th>
              <th style="width: 80px;">المدفوع</th>
              <th style="width: 80px;">المتبقي</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" style="padding: 16px; text-align: center; color: #64748b;">لا توجد فواتير مشتريات مسجلة خلال الفترة المحددة</td></tr>'}
          </tbody>
          <tfoot style="background-color: #f1f5f9; font-weight: bold; border-top: 2px solid #cbd5e1;">
            <tr>
              <td colspan="5" style="text-align: left; padding: 6px 12px; border: 1px solid #cbd5e1; font-size: 11.5px; color: #0f172a;">الإجمالي العام:</td>
              <td style="text-align: center; font-weight: 800; color: #b91c1c; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${totalPurchases.toFixed(2)}</td>
              <td style="text-align: center; font-weight: 800; color: #047857; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${paidPurchases.toFixed(2)}</td>
              <td style="text-align: center; font-weight: 800; color: #b45309; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${remainingPurchases.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        ${getReportSignaturesHtml({
          rightLabel: 'مسؤول المشتريات والمستودع',
          centerLabel: 'المراجعة والتدقيق',
          leftLabel: 'المدير المالي والاعتماد',
          settings,
        })}
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const filename = `تقرير_المشتريات_${displayFromDate}_إلى_${displayToDate}.pdf`;
  return { blob, filename };
}

/**
 * Generates low stock inventory report as PDF
 */
export async function generateInventoryReportPdfBlob(params: {
  inventory: InventoryItem[];
  settings: BusinessSettings;
}): Promise<{ blob: Blob; filename: string }> {
  const { inventory, settings } = params;
  const currency = settings.currency || '₪';
  const lowStock = inventory.filter(it => it.category !== 'copy_scan' && it.stockQuantity <= it.minAlertQuantity);
  const totalInventoryValuation = inventory.reduce((sum, it) => sum + (it.stockQuantity * (it.purchasePrice || 0)), 0);

  const headerImageUrl = settings.headerImageUrl || (settings as any).letterheadUrl || defaultLobnanBanner;
  const headerBannerHtml = headerImageUrl
    ? `<div style="width: 100%; text-align: center; margin-bottom: 6px;"><img src="${headerImageUrl}" alt="مطبعة لبنان" style="width: 100%; max-height: 155px; object-fit: contain; display: block; margin: 0 auto;" /></div>`
    : `<div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;"><h2 style="margin: 0; color: #0f172a;">${settings.businessName || 'مطبعة ومكتبة لبنان'}</h2></div>`;

  const rowsHtml = lowStock.map((it, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fcfdfd'}; border-bottom: 1px solid #cbd5e1;">
      <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 32px;">${idx + 1}</td>
      <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; width: 80px;">${it.code || '-'}</td>
      <td style="padding: 5px 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${it.name}</td>
      <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; color: #b91c1c; font-weight: bold; font-family: monospace; width: 85px;">${it.stockQuantity}</td>
      <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; width: 80px;">${it.minAlertQuantity}</td>
      <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; width: 85px;">${it.sellingPrice?.toFixed(2)} ${currency}</td>
      <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-size: 11px; color: #b91c1c; font-weight: bold; width: 85px;">طلب توريد ⚠️</td>
    </tr>
  `).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>تقرير نواقص وتنبيهات المخزون</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 12px; background: #ffffff; color: #0f172a; direction: rtl; }
        .report-outer-container { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; background: #ffffff; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11.5px; }
        th { background: #f1f5f9; color: #0f172a; padding: 6px 4px; font-size: 11px; border: 1px solid #94a3b8; text-align: center; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="report-outer-container">
        ${headerBannerHtml}
        
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; margin-top: 4px;">
          <div style="font-size: 16px; font-weight: 900; color: #b91c1c; line-height: 1.4;">
            تقرير نواقص المخزون وتنبيهات حد الطلب
          </div>
          <div style="font-size: 12px; color: #475569; font-weight: 600; margin-top: 4px;">
            تاريخ التقرير: <span style="font-family: monospace;">${formatToDdMmYyyy(new Date().toISOString())}</span>
          </div>
        </div>

        <table style="border: 1px solid #94a3b8;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a; font-weight: bold; border-bottom: 2px solid #94a3b8;">
              <th style="width: 32px;">م</th>
              <th style="width: 80px;">كود الصنف</th>
              <th>اسم الصنف والبيان</th>
              <th style="width: 85px;">الرصيد الحالي</th>
              <th style="width: 80px;">حد الطلب</th>
              <th style="width: 85px;">سعر البيع</th>
              <th style="width: 85px;">حالة الصنف</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="7" style="padding: 16px; text-align: center; color: #047857; font-weight: bold;">جميع الأصناف متوفرة ولا توجد أي نواقص حالياً</td></tr>'}
          </tbody>
        </table>

        <div style="margin-top: 14px; padding: 10px 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; display: flex; justify-content: space-between; font-size: 12px;">
          <span>إجمالي الأصناف التي بلغت حد الطلب: <b style="color: #b91c1c;">${lowStock.length} صنف</b></span>
          <span>إجمالي القيمة التقديرية لكافة المخزون: <b style="font-family: monospace; color: #1e3a8a;">${totalInventoryValuation.toFixed(2)} ${currency}</b></span>
        </div>

        ${getReportSignaturesHtml({
          rightLabel: 'أمين المستودع والمخزن',
          centerLabel: 'المراجعة والجرد',
          leftLabel: 'المدير العام والاعتماد',
          settings,
        })}
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const filename = `تقرير_نواقص_المخزون_${new Date().toISOString().slice(0, 10)}.pdf`;
  return { blob, filename };
}

/**
 * Generates an official Employee Statement PDF
 */
export async function generateEmployeeStatementPdfBlob(params: {
  employee: Employee;
  vouchers: PaymentVoucher[];
  advances?: EmployeeAdvance[];
  deductions?: EmployeeDeduction[];
  incentives?: EmployeeIncentive[];
  payrollSheets?: PayrollSheet[];
  invoices?: Invoice[];
  purchases?: PurchaseInvoice[];
  settings: BusinessSettings;
  fromDate?: string;
  toDate?: string;
}): Promise<{ blob: Blob; filename: string }> {
  const {
    employee,
    vouchers,
    advances = [],
    deductions = [],
    incentives = [],
    payrollSheets = [],
    invoices = [],
    purchases = [],
    settings,
    fromDate,
    toDate,
  } = params;

  const currency = settings.currency || '₪';
  const displayFromDate = fromDate ? formatToDdMmYyyy(fromDate) : 'بداية العمل';
  const displayToDate = toDate ? formatToDdMmYyyy(toDate) : formatToDdMmYyyy(new Date().toISOString());

  const stmt = generateEmployeeStatement({
    employee,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    vouchers,
    advances,
    deductions,
    incentives,
    invoices,
    purchases,
    payrollSheets,
  });

  const headerImageUrl = settings.headerImageUrl || (settings as any).letterheadUrl || defaultLobnanBanner;
  const headerBannerHtml = headerImageUrl
    ? `<div style="width: 100%; text-align: center; margin-bottom: 6px;"><img src="${headerImageUrl}" alt="مطبعة لبنان" style="width: 100%; max-height: 155px; object-fit: contain; display: block; margin: 0 auto;" /></div>`
    : `<div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;"><h2 style="margin: 0; color: #0f172a;">${settings.businessName || 'مطبعة ومكتبة لبنان'}</h2></div>`;

  const rowsHtml = stmt.rows.map((r, idx) => `
    <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fcfdfd'}; border-bottom: 1px solid #cbd5e1;">
      <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 32px;">${idx + 1}</td>
      <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-size: 11px; width: 85px;">${r.date}</td>
      <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-size: 11px; width: 80px;">${r.typeLabel}</td>
      <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #1e3a8a; width: 80px;">${r.referenceNumber || '-'}</td>
      <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; color: #047857; font-family: monospace; width: 85px;">${r.entitlement > 0 ? r.entitlement.toFixed(2) : '-'}</td>
      <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; color: #b91c1c; font-family: monospace; width: 85px;">${(r.advance + r.deduction + r.disbursement) > 0 ? (r.advance + r.deduction + r.disbursement).toFixed(2) : '-'}</td>
      <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: 800; font-family: monospace; width: 95px; background-color: #f8fafc;">${r.runningBalance.toFixed(2)}</td>
      <td style="padding: 5px 8px; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; color: #334155;">${r.description || '-'}</td>
    </tr>
  `).join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>كشف حساب موظف - ${employee.name}</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 12px; background: #ffffff; color: #0f172a; direction: rtl; }
        .report-outer-container { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; background: #ffffff; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11.5px; }
        th { background: #f1f5f9; color: #0f172a; padding: 6px 4px; font-size: 11px; border: 1px solid #94a3b8; text-align: center; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="report-outer-container">
        ${headerBannerHtml}
        
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; margin-top: 4px;">
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; line-height: 1.4;">
            كشف حساب موظف تفصيلي: <span style="color: #047857;">${employee.name}</span>
          </div>
          <div style="font-size: 12px; color: #475569; font-weight: 600; margin-top: 4px;">
            من تاريخ: <span style="font-family: monospace;">${displayFromDate}</span> إلى تاريخ: <span style="font-family: monospace;">${displayToDate}</span>
          </div>
        </div>

        <!-- Summary Grid -->
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px; font-size: 11px;">
          <div style="background: #ffffff; border: 1px solid #86efac; border-radius: 4px; padding: 6px 4px; text-align: center;">
            <span style="color: #166534; font-size: 10px; font-weight: bold;">إجمالي الاستحقاقات (له):</span>
            <div style="font-size: 14px; font-weight: bold; color: #047857; font-family: monospace;">${stmt.totalDue.toFixed(2)} ${currency}</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #fca5a5; border-radius: 4px; padding: 6px 4px; text-align: center;">
            <span style="color: #991b1b; font-size: 10px; font-weight: bold;">إجمالي المسدد والسلف (عليه):</span>
            <div style="font-size: 14px; font-weight: bold; color: #b91c1c; font-family: monospace;">${stmt.totalPaid.toFixed(2)} ${currency}</div>
          </div>
          <div style="background: #ffffff; border: 1px solid #93c5fd; border-radius: 4px; padding: 6px 4px; text-align: center;">
            <span style="color: #1e3a8a; font-size: 10px; font-weight: bold;">صافي الرصيد المستحق:</span>
            <div style="font-size: 14px; font-weight: bold; color: #1e3a8a; font-family: monospace;">${stmt.closingBalance.toFixed(2)} ${currency}</div>
          </div>
        </div>

        <table style="border: 1px solid #94a3b8;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a; font-weight: bold; border-bottom: 2px solid #94a3b8;">
              <th style="width: 32px;">م</th>
              <th style="width: 85px;">التاريخ</th>
              <th style="width: 80px;">نوع الحركة</th>
              <th style="width: 80px;">المستند</th>
              <th style="width: 85px; color: #047857;">استحقاقات (+)</th>
              <th style="width: 85px; color: #b91c1c;">منصرفات (-)</th>
              <th style="width: 95px;">الرصيد التراكمي</th>
              <th>البيان والشرح</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" style="padding: 16px; text-align: center; color: #64748b;">لا توجد حركات مسجلة للموظف خلال الفترة المحددة</td></tr>'}
          </tbody>
          <tfoot style="background-color: #f1f5f9; font-weight: bold; border-top: 2px solid #cbd5e1;">
            <tr>
              <td colspan="4" style="text-align: left; padding: 6px 12px; border: 1px solid #cbd5e1; font-size: 11.5px; color: #0f172a;">الإجمالي العام:</td>
              <td style="text-align: center; font-weight: 800; color: #047857; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${stmt.totalDue.toFixed(2)}</td>
              <td style="text-align: center; font-weight: 800; color: #b91c1c; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${stmt.totalPaid.toFixed(2)}</td>
              <td style="text-align: center; font-weight: 800; color: #1e3a8a; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${stmt.closingBalance.toFixed(2)} ${currency}</td>
              <td style="border: 1px solid #cbd5e1;"></td>
            </tr>
          </tfoot>
        </table>

        ${getReportSignaturesHtml({
          rightLabel: 'المحاسب المسؤول',
          centerLabel: 'توقيع واستلام الموظف',
          leftLabel: 'المدير العام والاعتماد',
          settings,
        })}
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const safeName = employee.name.replace(/[/\\?%*:|"<>]/g, '_');
  const filename = `كشف_حساب_موظف_${safeName}_${displayFromDate}_إلى_${displayToDate}.pdf`;
  return { blob, filename };
}

/**
 * Generates an official Expenses & Operational Costs Report PDF
 */
export async function generateExpensesReportPdfBlob(params: {
  expenses: ExpenseItem[];
  settings: BusinessSettings;
  fromDate?: string;
  toDate?: string;
}): Promise<{ blob: Blob; filename: string }> {
  const { expenses, settings, fromDate, toDate } = params;
  const currency = settings.currency || '₪';
  const todayIso = new Date().toISOString().split('T')[0];

  const targetFrom = fromDate || todayIso.slice(0, 7) + '-01';
  const targetTo = toDate || todayIso;

  const displayFromDate = formatToDdMmYyyy(targetFrom);
  const displayToDate = formatToDdMmYyyy(targetTo);

  const filteredExpenses = expenses
    .filter(e => {
      const eDate = (e.date || '').split('T')[0];
      if (eDate < targetFrom) return false;
      if (eDate > targetTo) return false;
      return true;
    })
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  const totalAmount = filteredExpenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  // Group by category
  const categoriesMap: Record<string, number> = {};
  filteredExpenses.forEach(e => {
    const cat = e.categoryName || 'مصروفات عامة';
    categoriesMap[cat] = (categoriesMap[cat] || 0) + (e.amount || 0);
  });

  const headerImageUrl = settings.headerImageUrl || (settings as any).letterheadUrl || defaultLobnanBanner;
  const headerBannerHtml = headerImageUrl
    ? `<div style="width: 100%; text-align: center; margin-bottom: 6px;"><img src="${headerImageUrl}" alt="مطبعة لبنان" style="width: 100%; max-height: 155px; object-fit: contain; display: block; margin: 0 auto;" /></div>`
    : `<div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px;"><h2 style="margin: 0; color: #0f172a;">${settings.businessName || 'مطبعة ومكتبة لبنان'}</h2></div>`;

  const rowsHtml = filteredExpenses
    .map((e, idx) => {
      const voucherNum = e.voucherNumber || '-';
      const cat = e.categoryName || 'مصروفات عامة';
      const treasury = e.treasuryName || 'الصندوق النقدي';
      const beneficiary = e.beneficiary || '-';
      const notes = e.notes || '-';

      return `
        <tr style="background-color: ${idx % 2 === 0 ? '#ffffff' : '#fcfdfd'}; border-bottom: 1px solid #cbd5e1;">
          <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-weight: bold; font-family: monospace; width: 32px;">${idx + 1}</td>
          <td style="padding: 5px 4px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-size: 11px; width: 85px;">${e.date || ''}</td>
          <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-family: monospace; font-weight: bold; color: #1e3a8a; width: 85px;">${voucherNum}</td>
          <td style="padding: 5px 8px; text-align: right; border: 1px solid #cbd5e1; font-weight: bold; color: #0f172a;">${cat}</td>
          <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-size: 11px; width: 95px;">${beneficiary}</td>
          <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-size: 11px; width: 90px; color: #475569;">${treasury}</td>
          <td style="padding: 5px 6px; text-align: center; border: 1px solid #cbd5e1; font-weight: 800; color: #b91c1c; font-family: monospace; width: 85px;">${(e.amount || 0).toFixed(2)}</td>
          <td style="padding: 5px 8px; text-align: right; border: 1px solid #cbd5e1; font-size: 11px; color: #334155;">${notes}</td>
        </tr>
      `;
    })
    .join('');

  const catSummaryHtml = Object.entries(categoriesMap)
    .map(
      ([cat, amt]) => `
      <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 4px; padding: 4px 8px; display: flex; justify-content: space-between; font-size: 11px;">
        <span style="color: #475569;">${cat}:</span>
        <strong style="color: #0f172a; font-family: monospace;">${amt.toFixed(2)} ${currency}</strong>
      </div>
    `
    )
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
    <head>
      <meta charset="UTF-8">
      <title>تقرير المصروفات والنفقات التشغيلية</title>
      <style>
        * { box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 12px; background: #ffffff; color: #0f172a; direction: rtl; }
        .report-outer-container { border: 1px solid #cbd5e1; border-radius: 6px; padding: 14px 16px; background: #ffffff; }
        table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 11.5px; }
        th { background: #f1f5f9; color: #0f172a; padding: 6px 4px; font-size: 11px; border: 1px solid #94a3b8; text-align: center; font-weight: bold; }
      </style>
    </head>
    <body>
      <div class="report-outer-container">
        ${headerBannerHtml}
        
        <div style="text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 12px; margin-top: 4px;">
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; line-height: 1.4;">
            تقرير المصروفات والنفقات التشغيلية
          </div>
          <div style="font-size: 12px; color: #475569; font-weight: 600; margin-top: 4px;">
            من تاريخ: <span style="font-family: monospace;">${displayFromDate}</span> إلى تاريخ: <span style="font-family: monospace;">${displayToDate}</span>
          </div>
        </div>

        <!-- Summary Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 12px;">
          <div style="background: #ffffff; border: 1px solid #fca5a5; border-radius: 4px; padding: 6px 12px; text-align: center;">
            <span style="font-size: 11px; color: #991b1b; font-weight: bold;">إجمالي المصروفات: </span>
            <strong style="font-size: 14px; color: #b91c1c; font-family: monospace;">${totalAmount.toFixed(2)} ${currency}</strong>
          </div>
          <div style="background: #ffffff; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 12px; text-align: center;">
            <span style="font-size: 11px; color: #475569; font-weight: bold;">عدد حركات الصرف: </span>
            <strong style="font-size: 14px; color: #0f172a; font-family: monospace;">${filteredExpenses.length} حركة</strong>
          </div>
        </div>

        ${
          catSummaryHtml
            ? `<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 12px;">${catSummaryHtml}</div>`
            : ''
        }

        <table style="border: 1px solid #94a3b8;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #0f172a; font-weight: bold; border-bottom: 2px solid #94a3b8;">
              <th style="width: 32px;">م</th>
              <th style="width: 85px;">التاريخ</th>
              <th style="width: 85px;">رقم السند</th>
              <th>التصنيف والبيان</th>
              <th style="width: 95px;">المستفيد</th>
              <th style="width: 90px;">الصندوق / المصدر</th>
              <th style="width: 85px; color: #b91c1c;">المبلغ</th>
              <th>الملاحظات</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml || '<tr><td colspan="8" style="padding: 16px; text-align: center; color: #64748b;">لا توجد مصروفات مسجلة خلال هذه الفترة</td></tr>'}
          </tbody>
          <tfoot style="background-color: #f1f5f9; font-weight: bold; border-top: 2px solid #cbd5e1;">
            <tr>
              <td colspan="6" style="text-align: left; padding: 6px 12px; border: 1px solid #cbd5e1; font-size: 11.5px; color: #0f172a;">الإجمالي العام:</td>
              <td style="text-align: center; font-weight: 800; color: #b91c1c; padding: 6px; border: 1px solid #cbd5e1; font-family: monospace;">${totalAmount.toFixed(2)}</td>
              <td style="border: 1px solid #cbd5e1;"></td>
            </tr>
          </tfoot>
        </table>

        ${getReportSignaturesHtml({
          rightLabel: 'المسؤول المالي والصرف',
          centerLabel: 'المراجعة والتدقيق',
          leftLabel: 'المدير العام والاعتماد',
          settings,
        })}
      </div>
    </body>
    </html>
  `;

  const blob = await renderHtmlToPdfBlob(htmlContent);
  const filename = `تقرير_المصروفات_${displayFromDate}_إلى_${displayToDate}.pdf`;
  return { blob, filename };
}

