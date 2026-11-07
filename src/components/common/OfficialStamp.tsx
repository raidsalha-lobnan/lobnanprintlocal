import React from 'react';
import { useAccounting } from '../../context/AccountingContext';

interface OfficialStampProps {
  stampUrl?: string;
  size?: '4cm' | '3.5cm' | 'sm' | 'md' | 'lg';
  className?: string;
  rotation?: number; // degrees, e.g. -4
  showDefaultIfEmpty?: boolean; // if true, renders a generated circular official seal if no image uploaded
}

/**
 * OfficialStamp Component
 * 
 * يضمن ظهور الختم الرسمي بأبعاد 4 سم دائري بدقة عند الطباعة (4cm x 4cm)
 * مع تأثير ختم الحبر الواقعي (mix-blend-multiply، ميلان يدوي طبيعي -4درجات، وتأثير حبر الأختام)
 */
export const OfficialStamp: React.FC<OfficialStampProps> = ({
  stampUrl: propStampUrl,
  size = '3.5cm',
  className = '',
  rotation = -4,
  showDefaultIfEmpty = false,
}) => {
  const { settings } = useAccounting();
  const stampUrl = propStampUrl ?? settings.stampUrl;
  const businessName = settings.businessName || settings.name || 'المنشأة التجارية';

  if (!stampUrl && !showDefaultIfEmpty) {
    return null;
  }

  // Size styles
  const isFixed4cm = size === '4cm';
  const isFixed3_5cm = size === '3.5cm';

  return (
    <div
      className={`official-stamp inline-flex items-center justify-center relative select-none pointer-events-none rounded-full ${
        isFixed4cm ? 'w-[4cm] h-[4cm] min-w-[4cm] min-h-[4cm] max-w-[4cm] max-h-[4cm]' : isFixed3_5cm ? 'w-[3.5cm] h-[3.5cm] min-w-[3.5cm] min-h-[3.5cm] max-w-[3.5cm] max-h-[3.5cm]' : 'w-24 h-24'
      } ${className}`}
      style={{
        transform: `rotate(${rotation}deg)`,
        mixBlendMode: 'multiply',
      }}
      data-stamp-cm="true"
    >
      {stampUrl ? (
        <img
          src={stampUrl}
          alt="Official Stamp"
          className="w-full h-full object-contain rounded-full filter contrast-125 saturate-110 opacity-95 mix-blend-multiply"
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            filter: 'contrast(1.2) saturate(1.15)',
          }}
        />
      ) : showDefaultIfEmpty ? (
        /* Authentic Generated Circular Rubber Stamp */
        <div className="w-full h-full rounded-full border-[3px] border-double border-blue-900/80 text-blue-900 flex flex-col items-center justify-between p-2.5 text-center font-bold relative bg-blue-50/20 shadow-xs">
          <div className="w-[calc(100%-8px)] h-[calc(100%-8px)] rounded-full border border-dashed border-blue-800/60 absolute inset-1 m-auto pointer-events-none" />
          
          <span className="text-[8.5px] font-black tracking-tight text-blue-950 uppercase mt-0.5 line-clamp-1 px-2 z-10">
            ★ {businessName} ★
          </span>
          
          <div className="flex flex-col items-center justify-center my-auto z-10">
            <span className="text-[11px] font-black tracking-wider text-red-700/90 border-y border-red-700/60 py-0.5 px-3 uppercase bg-white/70">
              معتمد OFFICIAL
            </span>
            <span className="text-[7.5px] font-mono font-bold text-blue-900 mt-0.5">
              {settings.taxNumber ? `ضريبي: ${settings.taxNumber}` : 'إدارة المحاسبة والمالية'}
            </span>
          </div>

          <span className="text-[7.5px] font-mono text-blue-900/80 mb-0.5 z-10">
            {new Date().toISOString().split('T')[0]}
          </span>
        </div>
      ) : null}
    </div>
  );
};
