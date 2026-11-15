import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ledgerAccountForTreasury } from '../src/utils/treasuryCodes';

const context = readFileSync('src/context/AccountingContext.tsx', 'utf8');
const expenses = readFileSync('src/components/ExpensesView.tsx', 'utf8');
const server = readFileSync('local-server/sync-service.mjs', 'utf8');

test('cash box and noncash treasuries map to the correct general ledger accounts', () => {
  assert.equal(ledgerAccountForTreasury('cash'), '1101');
  assert.equal(ledgerAccountForTreasury('noncash'), '1102');
});

test('supplier payment credits a GL account, never a CASH-#### treasury identifier', () => {
  const from = context.indexOf('const createPaymentVoucher =');
  const to = context.indexOf('const updatePaymentVoucher =', from);
  assert.ok(from >= 0 && to > from);
  const payment = context.slice(from, to).split('// Payment voucher:')[1];
  assert.ok(payment);
  assert.match(payment, /accountCode:\s*ledgerCode,[\s\S]{0,200}credit:\s*baseAmount/);
  assert.doesNotMatch(payment, /accountCode:\s*cashBankCode,[\s\S]{0,200}credit:\s*baseAmount/);
});

test('expense form creates only one financial disbursement', () => {
  assert.match(expenses, /\baddExpense\(\{/);
  assert.doesNotMatch(expenses, /\bcreatePaymentVoucher\s*\(/);
  assert.match(context, /const addExpense\s*=\s*\(/);
});

test('new customer receipts remain server-owned atomic operations', () => {
  assert.match(server, /if\(change\.entity==='vouchers'&&actual===0&&val\?\.type==='receipt'\)/);
  assert.match(server, /await postNewCustomerReceipt\(client,workspace,val,applied\)/);
  assert.match(server, /RECEIPT_SERVER_ATOMIC_POSTING_REQUIRES_SINGLE_VOUCHER/);
});
