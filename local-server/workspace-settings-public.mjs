import {stripPrivateFields} from './legacy-snapshot.mjs';

// Non-administrative staff need the shared business identity for invoices,
// reports, units, categories and currencies, not server credentials or secrets.
export const PUBLIC_WORKSPACE_SETTINGS = new Set([
  'appTitle','businessName','businessNameEn','name','activityType',
  'taxNumber','crNumber','showTaxNumberInPrints','showCrNumberInPrints',
  'phone','phones','email','address','addresses','description',
  'logoUrl','headerImageUrl','stampUrl','signatureUrl','logoText',
  'invoiceFooter','invoiceFooterNote','currency','baseCurrencyCode',
  'vatRate','currencies','unitsOfMeasure','categories',
  'defaultPosLayout','defaultPosButtons','defaultPosColumnWidths',
  'userScreenConfigs','homeShortcuts',
]);

export function settingsVisibleToUser(value,access){
  if(!value || typeof value!=='object')return value;
  const safe=stripPrivateFields(value);
  // Connection endpoints belong to the individual device, not the workspace.
  delete safe.sqlServerConfig;
  // Telegram token is a server-side integration secret, not a general-purpose
  // credential that may be returned to settings screens or sync event readers.
  if(safe.telegramConfig && typeof safe.telegramConfig==='object'){
    const {botToken: _token, ...details}=safe.telegramConfig;
    safe.telegramConfig=details;
  }
  if(access?.can('view_settings')===true)return safe;
  const publicSettings={id:safe.id};
  for(const [key,val] of Object.entries(safe)){
    if(PUBLIC_WORKSPACE_SETTINGS.has(key))publicSettings[key]=val;
  }
  return publicSettings;
}

/** Keep credentials on the private database only. A sanitized client snapshot
 * intentionally omits them, and an unrelated settings edit must not clear them.
 * The user may clear a token explicitly by submitting an empty string. */
export function preserveWorkspaceSettingsCredentials(previous,next){
  if(!next || typeof next!=='object')return next;
  const updated={...next};
  const priorTelegram=previous?.telegramConfig;
  if(priorTelegram && typeof priorTelegram==='object'){
    if(!updated.telegramConfig){
      updated.telegramConfig={...priorTelegram};
    }else if(typeof updated.telegramConfig==='object'){
      const saved=priorTelegram.botToken;
      if(saved && !Object.prototype.hasOwnProperty.call(updated.telegramConfig,'botToken'))
        updated.telegramConfig={...updated.telegramConfig,botToken:saved};
    }
  }
  // A SQL/tunnel connector is specific to the device and is not published in
  // the global settings record. Existing server-side legacy data stays intact
  // for rollback, but it is not sent back as workspace configuration.
  delete updated.sqlServerConfig;
  return updated;
}
