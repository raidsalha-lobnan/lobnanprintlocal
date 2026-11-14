import type {Treasury} from '../types';

export const MAIN_CASH_TREASURY_CODE = 'CASH-1101';
export const TREASURY_CODE_PATTERN = /^CASH-\d{4,}$/;

/** Preserve the official CASH-#### identifier. Legacy four-digit references
 * can be resolved for viewing an old document, not used for issuing new codes. */
export function canonicalTreasuryCode(value: unknown): string {
 const code=String(value??'').trim();
 if(TREASURY_CODE_PATTERN.test(code))return code;
 if(/^\d{4,}$/.test(code))return 'CASH-'+code;
 return '';
}

export function requiredTreasury(
 list: readonly Treasury[],
 kind: 'cash'|'noncash',
 selectedCode?: string
): Treasury {
 const code=kind==='cash'?MAIN_CASH_TREASURY_CODE:
  canonicalTreasuryCode(selectedCode);
 if(!code)throw new Error('يجب اختيار الصندوق البنكي أو المحفظة قبل الحفظ.');
 const matching=list.filter(t=>t.accountCode===code&&t.status!=='inactive');
 if(matching.length!==1)throw new Error('رمز الصندوق غير موجود أو مكرر، يرجى مراجعة إعدادات الصناديق.');
 const treasury=matching[0];
 const allowed=kind==='cash'
  ?treasury.type==='cash_box'&&treasury.accountCode===MAIN_CASH_TREASURY_CODE
  :treasury.type!=='cash_box'&&treasury.accountCode!==MAIN_CASH_TREASURY_CODE;
 if(!allowed)throw new Error('لا يمكن توجيه المبلغ إلى صندوق من نوع مختلف.');
 return treasury;
}

/** Chart-of-accounts ledger IDs are distinct from treasury IDs. */
export const ledgerAccountForTreasury=(kind:'cash'|'noncash')=>
 kind==='cash'?'1101':'1102';
