import React from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { Building2, MapPin, Hash } from 'lucide-react';
import { BusinessSettings } from '../../types';

interface PrintHeaderProps {
  title?: string;
  subtitle?: string;
  docNumber?: string;
  docDate?: string;
  badge?: string;
  badgeColor?: string;
  extraMeta?: React.ReactNode;
  rightAction?: React.ReactNode;
  qrCode?: React.ReactNode;
  overrideSettings?: Partial<BusinessSettings>;
  className?: string;
  showBorder?: boolean;
}

/**
 * PrintHeader Component
 * 
 * القواعد الصارمة المعتمدة بحسب طلب المستخدم:
 * 1. في حال تم رفع "هيدر كامل" (headerImageUrl / letterheadUrl): يتم اعتماده كترويسة رسمية كاملة لكافة الكشوفات والأوراق المطبوعة.
 * 2. في حال عدم رفع هيدر كامل: يتم وضع اللوقو يمين، وبجانبه الاسم العربي أولاً ثم الاسم الإنجليزي تحته مباشرة.
 * 3. يتم اقتران العناوين والأرقام خطوة بخطوة على نسق: "العنوان الأول - الرقم الأول"، "العنوان الثاني - الرقم الثاني" وهكذا.
 * 4. الكاشير الحراري ThermalReceiptHeader: يستخدم نفس ترتيب الهيدر (اللوقو والاسم بالعربي والانجليزي المقترن بالعناوين والأرقام).
 */
export const PrintHeader: React.FC<PrintHeaderProps> = ({
  title,
  subtitle,
  docNumber,
  docDate,
  badge,
  badgeColor = 'bg-slate-900 text-white',
  extraMeta,
  rightAction,
  qrCode,
  overrideSettings,
  className = '',
  showBorder = true,
}) => {
  const { settings: contextSettings } = useAccounting();
  const settings: any = { ...contextSettings, ...(overrideSettings || {}) };

  const headerImageUrl = settings.headerImageUrl || settings.letterheadUrl || settings.headerImage || '';
  const logoUrl = settings.logoUrl || settings.logo || '';
  const businessName = settings.businessName || settings.name || 'المنشأة التجارية';

  const hasFullHeader = Boolean(headerImageUrl && headerImageUrl.trim());
  const hasLogo = Boolean(logoUrl && logoUrl.trim());

  // Addresses list (supports multiple addresses or single address string)
  const addressesList = (
    settings.addresses && settings.addresses.length > 0
      ? settings.addresses
      : settings.address
      ? [settings.address]
      : []
  ).filter((a: any) => a && a.trim());

  // Phones list (supports multiple phones or single phone string)
  const phonesList = (
    settings.phones && settings.phones.length > 0
      ? settings.phones
      : settings.phone
      ? [settings.phone]
      : []
  ).filter((p: any) => p && p.trim());

  // Paired Address - Phone lines ("العنوان الأول - الرقم الأول")
  const maxPairs = Math.max(addressesList.length, phonesList.length);
  const pairedContactLines: string[] = [];
  for (let i = 0; i < maxPairs; i++) {
    const addr = addressesList[i];
    const ph = phonesList[i];
    if (addr && ph) {
      pairedContactLines.push(`${addr} - ${ph}`);
    } else if (addr) {
      pairedContactLines.push(addr);
    } else if (ph) {
      pairedContactLines.push(ph);
    }
  }

  // CASE 1: Full Header Image is Uploaded (اعتماد الهيدر الكامل المصمم)
  if (hasFullHeader) {
    return (
      <div className={`print-header w-full mb-2 print:mb-1.5 print:block ${className}`} data-component="print-header">
        {/* Full Header Banner Image */}
        <div className="w-full overflow-hidden rounded-lg border border-slate-200/60 print:border-none print:rounded-none bg-white">
          <img
            src={headerImageUrl}
            alt={businessName || 'ترويسة رسمية'}
            className="w-full max-h-40 sm:max-h-48 md:max-h-56 object-contain object-center print:max-h-44 mx-auto block"
          />
        </div>

        {/* Sub-bar for document identification: Centered Title in Blue Rounded Box, DocNumber Right, DocDate Left */}
        {(title || docNumber || docDate || badge || extraMeta || qrCode) && (
          <div className={`mt-1 pt-1 pb-1 flex items-center justify-between gap-2 text-xs w-full ${showBorder ? 'border-b-2 border-slate-900' : ''}`}>
            {/* Right side in RTL: Invoice Number */}
            <div className="w-1/3 text-right font-mono text-xs text-slate-900 font-bold truncate">
              {docNumber && (
                <div className="inline-flex items-center gap-1">
                  <span className="text-slate-600 font-sans font-semibold text-xs">الرقم:</span>
                  <strong className="text-slate-950 font-black text-sm">{docNumber}</strong>
                </div>
              )}
            </div>

            {/* Center: Title in elegant dark blue rounded box with white text */}
            <div className="w-1/3 flex flex-col justify-center items-center">
              {title && (
                <div className="bg-[#2b3a67] text-white border-2 border-[#2b3a67] font-black text-xs sm:text-sm px-6 py-0.5 rounded-xl text-center whitespace-nowrap inline-block tracking-wide shadow-xs">
                  {title}
                </div>
              )}
              {badge && (
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold mt-1 ${badgeColor}`}>
                  {badge}
                </span>
              )}
            </div>

            {/* Left side in RTL: Date */}
            <div className="w-1/3 text-left font-mono text-xs text-slate-900 font-bold truncate">
              {docDate && (
                <div className="inline-flex items-center gap-1">
                  <span className="text-slate-600 font-sans font-semibold text-xs">التاريخ:</span>
                  <span className="text-slate-950 font-bold text-xs">{docDate}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  // CASE 2: Standard Header (Logo on Right + Arabic Name First + English Name Underneath + Paired Addresses & Phones)
  return (
    <div className={`print-header w-full mb-2 print:mb-1.5 print:block ${showBorder ? 'border-b-2 border-slate-900 pb-1.5' : ''} ${className}`} data-component="print-header">
      <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
        {/* Right side (RTL start): Logo on the Right, Name beside it, Paired Addresses/Phones */}
        <div className="flex items-start gap-3.5 flex-1 min-w-0">
          {/* Logo on Right */}
          {hasLogo ? (
            <div className="shrink-0 w-20 h-20 sm:w-24 sm:h-24 bg-white border border-slate-200 rounded-xl p-1.5 flex items-center justify-center shadow-2xs overflow-hidden">
              <img
                src={logoUrl}
                alt={businessName}
                className="w-full h-full object-contain object-center"
              />
            </div>
          ) : (
            <div className="shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex flex-col items-center justify-center font-bold text-xs p-1 shadow-2xs">
              <Building2 className="w-6 h-6 mb-0.5 text-blue-600" />
              <span className="text-[9px] text-center leading-tight truncate max-w-full">
                {settings.logoText || 'النور'}
              </span>
            </div>
          )}

          {/* Beside Logo: Arabic Name First, English Name Underneath */}
          <div className="min-w-0 flex-1">
            {/* Arabic Business Name */}
            <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-snug">
              {businessName}
            </h1>
            
            {/* English Business Name Underneath */}
            {settings.businessNameEn && (
              <p className="text-xs sm:text-sm text-slate-600 font-bold font-mono mt-0.5 tracking-tight">
                {settings.businessNameEn}
              </p>
            )}

            {(settings.activityType || settings.description) && (
              <p className="text-xs text-slate-600 font-medium mt-0.5">
                {settings.activityType || settings.description}
              </p>
            )}

            {/* Official Registration & Tax Numbers */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-700 font-mono mt-1.5">
              {(settings.taxNumber && settings.showTaxNumberInPrints !== false) && (
                <span className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-bold">
                  <Hash className="w-3 h-3 text-slate-500" />
                  <span>الرقم الضريبي: {settings.taxNumber}</span>
                </span>
              )}
              {((settings.crNumber || settings.commercialRegister) && settings.showCrNumberInPrints !== false) && (
                <span className="inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                  <span>س.ت: {settings.crNumber || settings.commercialRegister}</span>
                </span>
              )}
            </div>

            {/* Paired Address - Phone Lines ("العنوان الأول - الرقم الأول") */}
            {pairedContactLines.length > 0 && (
              <div className="space-y-0.5 text-[11px] text-slate-800 font-medium mt-1.5 font-sans">
                {pairedContactLines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 leading-tight">
                    <MapPin className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span>{line}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Left side (RTL end): QR Code or Extra Action */}
        {(qrCode || rightAction) && (
          <div className="text-left shrink-0 flex flex-col items-end sm:min-w-[120px]">
            {qrCode && <div className="mt-1">{qrCode}</div>}
            {rightAction && <div className="mt-1">{rightAction}</div>}
          </div>
        )}
      </div>

      {/* Full-width Sub-bar: Title in Centered Blue Rounded Box, DocNumber Right, DocDate Left */}
      {(title || docNumber || docDate || badge || extraMeta) && (
        <div className="mt-1.5 pt-1 pb-0.5 flex items-center justify-between gap-2 text-xs w-full">
          {/* Right side in RTL: Invoice Number */}
          <div className="w-1/3 text-right font-mono text-xs text-slate-900 font-bold truncate">
            {docNumber && (
              <div className="inline-flex items-center gap-1">
                <span className="text-slate-600 font-sans font-semibold text-xs">الرقم:</span>
                <strong className="text-slate-950 font-black text-sm">{docNumber}</strong>
              </div>
            )}
          </div>

          {/* Center: Title in elegant dark blue rounded box with white text */}
          <div className="w-1/3 flex flex-col justify-center items-center">
            {title && (
              <div className="bg-[#2b3a67] text-white border-2 border-[#2b3a67] font-black text-xs sm:text-sm px-6 py-0.5 rounded-xl text-center whitespace-nowrap inline-block tracking-wide shadow-xs">
                {title}
              </div>
            )}
            {badge && (
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold mt-1 ${badgeColor}`}>
                {badge}
              </span>
            )}
          </div>

          {/* Left side in RTL: Date */}
          <div className="w-1/3 text-left font-mono text-xs text-slate-900 font-bold truncate">
            {docDate && (
              <div className="inline-flex items-center gap-1">
                <span className="text-slate-600 font-sans font-semibold text-xs">التاريخ:</span>
                <span className="text-slate-950 font-bold text-xs">{docDate}</span>
              </div>
            )}
            {extraMeta}
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * ThermalReceiptHeader Component
 * 
 * مخصص لطابعات الكاشير الحراري (80mm / 58mm).
 * يتضمن اللوقو والاسم بالعربي والانجليزي المقترن بالعناوين والأرقام.
 */
interface ThermalReceiptHeaderProps {
  overrideSettings?: Partial<BusinessSettings>;
  receiptTitle?: string;
  className?: string;
}

export const ThermalReceiptHeader: React.FC<ThermalReceiptHeaderProps> = ({
  overrideSettings,
  receiptTitle,
  className = ''
}) => {
  const { settings: contextSettings } = useAccounting();
  const settings: any = { ...contextSettings, ...(overrideSettings || {}) };

  const hasLogo = Boolean(settings.logoUrl && settings.logoUrl.trim());
  const businessName = settings.businessName || settings.name || 'المنشأة التجارية';

  const addressesList = (
    settings.addresses && settings.addresses.length > 0
      ? settings.addresses
      : settings.address
      ? [settings.address]
      : []
  ).filter((a: any) => a && a.trim());

  const phonesList = (
    settings.phones && settings.phones.length > 0
      ? settings.phones
      : settings.phone
      ? [settings.phone]
      : []
  ).filter((p: any) => p && p.trim());

  const maxPairs = Math.max(addressesList.length, phonesList.length);
  const pairedContactLines: string[] = [];
  for (let i = 0; i < maxPairs; i++) {
    const addr = addressesList[i];
    const ph = phonesList[i];
    if (addr && ph) {
      pairedContactLines.push(`${addr} - ${ph}`);
    } else if (addr) {
      pairedContactLines.push(addr);
    } else if (ph) {
      pairedContactLines.push(ph);
    }
  }

  return (
    <div className={`text-center space-y-1.5 pb-2 border-b border-dashed border-slate-400 font-mono ${className}`}>
      {/* Top Section: Logo & Name beside it */}
      <div className="flex items-center justify-center gap-2.5">
        {hasLogo && (
          <div className="shrink-0">
            <img
              src={settings.logoUrl}
              alt={businessName}
              className="max-h-12 max-w-[90px] object-contain filter grayscale contrast-125"
            />
          </div>
        )}

        <div className="text-right">
          <h2 className="font-black text-sm text-slate-950 leading-tight">
            {businessName}
          </h2>
          {settings.businessNameEn && (
            <p className="text-[10px] text-slate-700 font-bold">{settings.businessNameEn}</p>
          )}
        </div>
      </div>

      {receiptTitle && (
        <div className="inline-block bg-slate-900 text-white font-bold text-[11px] px-2.5 py-0.5 rounded my-1">
          {receiptTitle}
        </div>
      )}

      {/* Tax and CR */}
      <div className="text-[10px] font-bold text-slate-900">
        {(settings.taxNumber && settings.showTaxNumberInPrints !== false) && <div>الرقم الضريبي: {settings.taxNumber}</div>}
        {(settings.crNumber && settings.showCrNumberInPrints !== false) && <div>سجل تجاري: {settings.crNumber}</div>}
      </div>

      {/* Paired Addresses and Phones ("العنوان الأول - الرقم الأول") */}
      {pairedContactLines.length > 0 && (
        <div className="text-[10px] text-slate-900 font-medium space-y-0.5 pt-0.5 font-sans">
          {pairedContactLines.map((line, idx) => (
            <div key={idx} className="leading-tight">{line}</div>
          ))}
        </div>
      )}
    </div>
  );
};
