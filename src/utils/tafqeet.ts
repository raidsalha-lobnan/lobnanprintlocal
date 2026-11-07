/**
 * Arabic Number to Words Converter (Tafqeet - تفقيط المبالغ المالية باللغة العربية)
 */

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

function convertGroup(num: number): string {
  if (num === 0) return '';
  const h = Math.floor(num / 100);
  const remainder = num % 100;
  const parts: string[] = [];

  if (h > 0) {
    parts.push(HUNDREDS[h]);
  }

  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(ONES[remainder]);
    } else {
      const o = remainder % 10;
      const t = Math.floor(remainder / 10);
      if (o > 0) {
        parts.push(`${ONES[o]} و${TENS[t]}`);
      } else {
        parts.push(TENS[t]);
      }
    }
  }

  return parts.join(' و');
}

export function tafqeet(amount: number, currencyName: string = 'شيكل', fractionalName: string = 'أغورة'): string {
  if (amount === 0) return 'صفر ' + currencyName;

  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const integerPart = Math.floor(absAmount);
  const decimalPart = Math.round((absAmount - integerPart) * 100);

  const billions = Math.floor(integerPart / 1_000_000_000);
  const millions = Math.floor((integerPart % 1_000_000_000) / 1_000_000);
  const thousands = Math.floor((integerPart % 1_000_000) / 1_000);
  const units = integerPart % 1_000;

  const parts: string[] = [];

  if (billions > 0) {
    if (billions === 1) parts.push('مليار');
    else if (billions === 2) parts.push('ملياران');
    else if (billions >= 3 && billions <= 10) parts.push(`${convertGroup(billions)} مليارات`);
    else parts.push(`${convertGroup(billions)} مليار`);
  }

  if (millions > 0) {
    if (millions === 1) parts.push('مليون');
    else if (millions === 2) parts.push('مليونان');
    else if (millions >= 3 && millions <= 10) parts.push(`${convertGroup(millions)} ملايين`);
    else parts.push(`${convertGroup(millions)} مليون`);
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف');
    else if (thousands === 2) parts.push('ألفان');
    else if (thousands >= 3 && thousands <= 10) parts.push(`${convertGroup(thousands)} آلاف`);
    else parts.push(`${convertGroup(thousands)} ألف`);
  }

  if (units > 0) {
    parts.push(convertGroup(units));
  }

  let result = (isNegative ? 'سالب ' : '') + 'فقط ' + parts.join(' و') + ' ' + currencyName;

  if (decimalPart > 0) {
    result += ` و${convertGroup(decimalPart)} ${fractionalName}`;
  }

  result += ' لا غير.';
  return result;
}

export const tafqeetArabic = tafqeet;
