import type {Party,Employee} from '../types';

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

