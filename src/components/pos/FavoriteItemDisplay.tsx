import React, { useState } from 'react';
import type { InventoryItem } from '../../types';

type DisplayItem = Pick<InventoryItem, 'imageUrl' | 'name' | 'code'>;

export function FavoriteItemVisual({ item }: {item: DisplayItem}) {
  const [failedUrl, setFailedUrl] = useState('');
  if (item.imageUrl && item.imageUrl !== failedUrl) {
    return <img src={item.imageUrl} alt={item.name} referrerPolicy="no-referrer"
      className="h-full w-full object-contain" onError={() => setFailedUrl(item.imageUrl!)} />;
  }
  const code = item.code || '';
  return <div className="flex h-full w-full items-center justify-center px-0.5 pt-2.5 text-slate-900">
    <svg viewBox={`0 0 ${Math.max(1, code.length) * 10} 22`} className="w-full max-h-6" role="img" aria-label={code}>
      <text x="50%" y="16" textAnchor="middle" direction="ltr" fontFamily="monospace" fontSize="16" fontWeight="bold" fill="currentColor">{code}</text>
    </svg>
  </div>;
}

export function FavoriteItemName({ name }: {name: string}) {
  return <div style={{containerType: 'inline-size'}} className="w-full">
    <h4 className="my-1 text-center font-bold leading-tight text-slate-900"
      style={{fontSize: `clamp(9px, ${Math.min(15, 380 / Math.max(1, name.length))}cqi, 14px)`,
        overflowWrap: 'anywhere'}}>{name}</h4>
  </div>;
}
