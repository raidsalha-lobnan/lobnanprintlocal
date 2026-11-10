import type { BusinessSettings } from '../types';

/** Shared policy for every printable business report: official letterhead first,
 * otherwise the configured logo and real legal business details. */
const escapeAttr = (value: unknown): string => String(value ?? '').replace(
  /[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch] || ch)
);
const safeImage = (value?: string): string => {
  const url = String(value || '').trim();
  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(url)
    || /^https?:\/\//i.test(url) || /^blob:/i.test(url) ? url : '';
};
const clean = (value?: string): string => String(value || '').trim();
const listOf = (values: string[] | undefined, fallback?: string): string[] =>
  (Array.isArray(values) && values.some(value => clean(value))
    ? values : [fallback || '']).map(clean).filter(Boolean);

export function renderBusinessReportHeader(settings: BusinessSettings): string {
  const business = clean(settings.businessName) || clean(settings.name) || 'المنشأة';
  const officialLetterhead = safeImage(settings.headerImageUrl ||
    (settings as BusinessSettings & {letterheadUrl?: string}).letterheadUrl);
  if (officialLetterhead) {
    return '<div class="business-letterhead"><img src="' + escapeAttr(officialLetterhead) +
      '" alt="ترويسة ' + escapeAttr(business) + '"></div>';
  }
  const logo = safeImage(settings.logoUrl);
  const addresses = listOf(settings.addresses,settings.address);
  const phones = listOf(settings.phones,settings.phone);
  const contact = [
    ...phones.map(phone => '<span dir="ltr">' + escapeAttr(phone) + '</span>'),
    ...addresses.map(address => '<span>' + escapeAttr(address) + '</span>'),
    ...(clean(settings.email) ? ['<span>' + escapeAttr(settings.email) + '</span>'] : []),
  ].join('');
  const legal = [
    settings.taxNumber && settings.showTaxNumberInPrints !== false ?
      '<span>الرقم الضريبي: ' + escapeAttr(settings.taxNumber) + '</span>' : '',
    settings.crNumber && settings.showCrNumberInPrints !== false ?
      '<span>السجل التجاري: ' + escapeAttr(settings.crNumber) + '</span>' : '',
  ].filter(Boolean).join('');
  return '<div class="business-standard">' +
    (logo ? '<img class="business-logo" src="' + escapeAttr(logo) + '" alt="شعار ' + escapeAttr(business) + '">' : '') +
    '<div class="business-identity"><strong>' + escapeAttr(business) + '</strong>' +
    (clean(settings.businessNameEn) ? '<small dir="ltr">' + escapeAttr(settings.businessNameEn) + '</small>' : '') +
    (clean(settings.activityType) ? '<small>' + escapeAttr(settings.activityType) + '</small>' : '') +
    '</div><div class="business-contact">' + contact + legal + '</div></div>';
}
