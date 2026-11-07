import React from 'react';
import { useAccounting } from '../../context/AccountingContext';
import { OfficialStamp } from './OfficialStamp';

interface ReportSignaturesProps {
  columns?: 2 | 3;
  rightLabel?: string;
  centerLabel?: string;
  leftLabel?: string;
}

export const ReportSignatures: React.FC<ReportSignaturesProps> = ({
  columns = 2,
  rightLabel = 'توقيع وختم المستلم',
  centerLabel = 'توقيع العميل / المستلم',
  leftLabel = 'الختم',
}) => {
  const { settings } = useAccounting();

  return (
    <div className={`pt-6 border-t border-slate-300 grid gap-6 text-center text-xs mt-6 ${columns === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
      {/* Right Column: توقيع وختم المستلم */}
      <div className="space-y-4 flex flex-col items-center justify-end min-h-[80px]">
        <span className="font-bold text-slate-800 text-sm block mb-auto">{rightLabel}</span>
      </div>

      {/* Center Column (Only if columns === 3) */}
      {columns === 3 && (
        <div className="space-y-4 flex flex-col items-center justify-end min-h-[80px]">
          <span className="font-bold text-slate-800 text-sm block mb-auto">{centerLabel}</span>
        </div>
      )}

      {/* Left Column: الختم */}
      <div className="space-y-2 flex flex-col items-center justify-end min-h-[80px]">
        <span className="font-bold text-slate-800 text-sm block mb-auto">{leftLabel}</span>
        
        <div className="min-h-[3.8cm] flex items-center justify-center relative">
          {settings.stampUrl ? (
            <div className="relative flex items-center justify-center">
              <OfficialStamp size="3.2cm" />
              {settings.signatureUrl && (
                <img
                  src={settings.signatureUrl}
                  alt="Signature"
                  className="absolute bottom-1 max-h-12 max-w-[120px] object-contain mix-blend-multiply opacity-85 pointer-events-none"
                />
              )}
            </div>
          ) : settings.signatureUrl ? (
            <img
              src={settings.signatureUrl}
              alt="Signature"
              className="max-h-16 max-w-[140px] object-contain mix-blend-multiply opacity-90"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
};
