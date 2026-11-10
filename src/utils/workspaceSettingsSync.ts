import type { BusinessSettings } from '../types';
import type { LocalView } from '../sync-next/types';

// One authoritative settings record for the entire connected workspace.
// Historical imports may use workspace-settings; reuse it when no global exists.
export const GLOBAL_SETTINGS_ID='global';
export const LEGACY_SETTINGS_ID='workspace-settings';

export function selectWorkspaceSettings(rows:readonly LocalView[]):LocalView|undefined {
  const current=rows.find(row=>row.id===GLOBAL_SETTINGS_ID && row.value);
  const legacy=rows.find(row=>row.id===LEGACY_SETTINGS_ID && row.value);
  return current||legacy;
}

const DEVICE_ONLY_FIELDS = new Set(['sqlServerConfig']);
const SAFE_SHARED_KEYS = new Set([
 'appTitle','businessName','businessNameEn','activityType','taxNumber','crNumber',
 'showTaxNumberInPrints','showCrNumberInPrints','phone','email','address','logoUrl',
 'headerImageUrl','stampUrl','signatureUrl','addresses','phones','name','description',
 'invoiceFooter','currency','baseCurrencyCode','vatRate','invoiceFooterNote',
 'logoText','currencies','unitsOfMeasure','defaultPosLayout','defaultPosButtons',
 'defaultPosColumnWidths','userScreenConfigs','homeShortcuts','categories',
 'telegramConfig',
]);

const plain=(value:unknown):Record<string,unknown>=>
  value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};

export function sharedWorkspaceSettings(value:unknown,id=GLOBAL_SETTINGS_ID):Record<string,unknown> {
  const source=plain(value);
  const shared:Record<string,unknown>={id};
  for(const [key,val] of Object.entries(source)){
    if(SAFE_SHARED_KEYS.has(key) && !DEVICE_ONLY_FIELDS.has(key) && val!==undefined){
      shared[key]=val;
    }
  }
  return shared;
}

export function applyWorkspaceSettings(
  previous:BusinessSettings, raw:unknown,
):BusinessSettings {
  const shared=sharedWorkspaceSettings(raw);
  const {id: _id,...values}=shared;
  // An authoritative record without a print asset means no shared asset.
  // Do not keep a stale browser-only letterhead on one device: the provider
  // makes a recoverable local backup before applying the authoritative blank.
  const images = {
    headerImageUrl: typeof values.headerImageUrl === 'string' ? values.headerImageUrl : '',
    logoUrl: typeof values.logoUrl === 'string' ? values.logoUrl : '',
    stampUrl: typeof values.stampUrl === 'string' ? values.stampUrl : '',
    signatureUrl: typeof values.signatureUrl === 'string' ? values.signatureUrl : '',
  };
  // Preserve a device-local SQL connector and auth/session configuration.
  return {...previous,...values,...images} as BusinessSettings;
}

export function mergeWorkspaceSettingsDraft(
  current:unknown,change:Partial<BusinessSettings>,
  id=GLOBAL_SETTINGS_ID,
):Record<string,unknown>{
  const old=sharedWorkspaceSettings(current,id);
  const patch=sharedWorkspaceSettings(change,id);
  // Preserve existing shared fields that are not included in a partial edit.
  return {...old,...patch,id};
}
