import { CurrencyInfo } from '../types';

export const defaultCurrencies: CurrencyInfo[] = [
  {
    code: 'ILS',
    name: 'شيكل',
    symbol: '₪',
    rateAgainstBase: 1.0,
    isBase: true,
    updatedAt: new Date().toISOString().split('T')[0]
  },
  {
    code: 'USD',
    name: 'دولار أمريكي',
    symbol: '$',
    rateAgainstBase: 3.70,
    isBase: false,
    updatedAt: new Date().toISOString().split('T')[0]
  },
  {
    code: 'JOD',
    name: 'دينار أردني',
    symbol: 'د.أ',
    rateAgainstBase: 5.20,
    isBase: false,
    updatedAt: new Date().toISOString().split('T')[0]
  },
  {
    code: 'EUR',
    name: 'يورو أوروبي',
    symbol: '€',
    rateAgainstBase: 4.05,
    isBase: false,
    updatedAt: new Date().toISOString().split('T')[0]
  },
  {
    code: 'SAR',
    name: 'ريال سعودي',
    symbol: 'ر.س',
    rateAgainstBase: 0.98,
    isBase: false,
    updatedAt: new Date().toISOString().split('T')[0]
  },
  {
    code: 'EGP',
    name: 'جنيه مصري',
    symbol: 'ج.م',
    rateAgainstBase: 0.076,
    isBase: false,
    updatedAt: new Date().toISOString().split('T')[0]
  }
];

export function getCurrencyInfo(code: string, currencies: CurrencyInfo[] = defaultCurrencies): CurrencyInfo {
  const found = currencies.find(c => c.code.toUpperCase() === code.toUpperCase() || c.symbol === code);
  return (
    found || {
      code: code || 'ILS',
      name: code || 'شيكل',
      symbol: code === 'ILS' ? '₪' : code,
      rateAgainstBase: 1.0,
      isBase: code === 'ILS'
    }
  );
}

/**
 * Converts any amount from a source currency to the base currency (Palestinian Shekel ₪ ILS).
 * Formula: amount * rateAgainstBase
 */
export function convertToBase(amount: number, fromCode: string, currencies: CurrencyInfo[] = defaultCurrencies): number {
  if (!amount || isNaN(amount)) return 0;
  const curr = getCurrencyInfo(fromCode, currencies);
  return Number((amount * curr.rateAgainstBase).toFixed(2));
}

/**
 * Converts an amount from base currency (ILS ₪) into a foreign target currency.
 * Formula: amount / rateAgainstBase
 */
export function convertFromBase(baseAmount: number, targetCode: string, currencies: CurrencyInfo[] = defaultCurrencies): number {
  if (!baseAmount || isNaN(baseAmount)) return 0;
  const curr = getCurrencyInfo(targetCode, currencies);
  if (!curr.rateAgainstBase || curr.rateAgainstBase <= 0) return baseAmount;
  return Number((baseAmount / curr.rateAgainstBase).toFixed(2));
}

/**
 * Converts an amount from one currency to another using the Base currency as bridge.
 */
export function convertCurrency(
  amount: number,
  fromCode: string,
  toCode: string,
  currencies: CurrencyInfo[] = defaultCurrencies
): number {
  if (!amount || isNaN(amount)) return 0;
  if (fromCode.toUpperCase() === toCode.toUpperCase()) return amount;
  const inBase = convertToBase(amount, fromCode, currencies);
  return convertFromBase(inBase, toCode, currencies);
}

/**
 * Format currency with symbol
 */
export function formatCurrency(
  amount: number,
  currencyCodeOrSymbol: string = '₪',
  currencies: CurrencyInfo[] = defaultCurrencies
): string {
  const curr = getCurrencyInfo(currencyCodeOrSymbol, currencies);
  return `${amount.toLocaleString('ar-SA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${curr.symbol}`;
}

/**
 * Try to fetch live exchange rates from open exchange API or return refreshed realistic market rates
 */
export async function fetchLiveExchangeRates(currentCurrencies: CurrencyInfo[]): Promise<CurrencyInfo[]> {
  try {
    // Attempt to fetch from public free open exchange endpoint if online
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      const response = await fetch('https://open.er-api.com/v6/latest/ILS');
      if (response.ok) {
        const data = await response.json();
        if (data && data.rates) {
          const today = new Date().toISOString().split('T')[0];
          return currentCurrencies.map(curr => {
            if (curr.isBase || curr.code === 'ILS') {
              return { ...curr, rateAgainstBase: 1.0, updatedAt: today };
            }
            // data.rates is relative to 1 ILS (e.g. USD = 0.270 -> 1 USD = 1/0.270 = 3.70 ILS)
            const rateInilsPerForeign = data.rates[curr.code] ? 1 / data.rates[curr.code] : curr.rateAgainstBase;
            return {
              ...curr,
              rateAgainstBase: Number(rateInilsPerForeign.toFixed(3)),
              updatedAt: today
            };
          });
        }
      }
    }
  } catch (err) {
    console.warn('Could not fetch live rates online, using offline market rates:', err);
  }

  // Fallback to updated realistic market rates against ILS
  const today = new Date().toISOString().split('T')[0];
  const marketRates: Record<string, number> = {
    ILS: 1.0,
    USD: 3.71,
    JOD: 5.23,
    EUR: 4.04,
    SAR: 0.989,
    EGP: 0.076
  };

  return currentCurrencies.map(curr => ({
    ...curr,
    rateAgainstBase: marketRates[curr.code] || curr.rateAgainstBase || 1.0,
    updatedAt: today
  }));
}
