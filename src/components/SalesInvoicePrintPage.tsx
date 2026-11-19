import React from 'react';
import type { Invoice, InvoiceItem } from '../types';
import { PrintHeader } from './common/PrintHeader';
import { OfficialStamp } from './common/OfficialStamp';
import { formatDateDisplay } from '../utils/dateUtils';

/** Display only: source is the cashier's invoice item array, in its saved order. */
interface SalesInvoicePrintPageProps {
  invoice: Invoice;
  items: InvoiceItem[];
  pageIndex: number;
  pageCount: number;
  currency: string;
  treasuries: Array<{ accountCode?: string; name?: string }>;
  isDraft: boolean;
  compact: boolean;
}

const amount = (value: unknown) => (Number(value) || 0).toFixed(2);

export const SalesInvoicePrintPage: React.FC<SalesInvoicePrintPageProps> = ({
  invoice, items, pageIndex, pageCount, currency, treasuries, isDraft, compact,
}) => {
  const symbol = invoice.currencySymbol || currency;
  const customerName = (invoice.subCustomerName || invoice.customerName || '').trim();
  const total = Number(invoice.totalAmount) || 0;
  const paid = Number(invoice.paidAmount) || 0;
  const remaining = Number.isFinite(Number(invoice.remainingAmount))
    ? Number(invoice.remainingAmount) : Math.max(0, total - paid);
  const cashPaid = Number(invoice.cashPaidAmount) || 0;
  const bankPaid = Number(invoice.bankPaidAmount) || 0;
  const treasuryCode = invoice.bankTreasuryCode || invoice.treasuryAccountCode;
  const treasuryName = treasuries.find(t => t.accountCode === treasuryCode)?.name || treasuryCode || '';
  const paymentChannels: string[] = [];
  if (cashPaid > 0) paymentChannels.push(`نقداً (${amount(cashPaid)} ${symbol})`);
  if (bankPaid > 0) paymentChannels.push(
    `حوالة على (${treasuryName || 'الصندوق المحدد'}) (${amount(bankPaid)} ${symbol})`,
  );
  if (paymentChannels.length === 0) {
    if (invoice.paymentMethod === 'cash') paymentChannels.push('نقداً');
    else if (['bank_transfer', 'e_wallet', 'electronic', 'card', 'pos', 'cheque'].includes(invoice.paymentMethod)) {
      paymentChannels.push(`${invoice.paymentMethod === 'cheque' ? 'شيك' : 'حوالة على'} (${treasuryName || 'الصندوق المحدد'})`);
    } else paymentChannels.push('على الحساب');
  }
  const showFooter = pageIndex === pageCount - 1;
  const startIndex = pageIndex * 15;

  return (
    <div className={`sales-invoice-page ${compact ? 'sales-invoice-compact' : ''}`} dir="rtl" data-sales-page={pageIndex + 1}>
      <PrintHeader showBorder={false} />
      <div className="sales-invoice-title">
        <span className="sales-invoice-number" dir="ltr">{invoice.invoiceNumber}{pageCount > 1 ? `-${pageIndex + 1}` : ''}</span>
        <span className="sales-invoice-title-text">{isDraft ? 'فاتورة مبيعات (مسودة)' : 'فاتورة مبيعات'}</span>
        <span className="sales-invoice-date" dir="ltr">{formatDateDisplay(invoice.date)}</span>
      </div>

      <section className="sales-invoice-meta">
        <div><strong>اسم العميل:</strong> <span>{customerName}</span></div>
        <div><strong>ملاحظات:</strong> <span className="sales-invoice-note">{invoice.notes || ''}</span></div>
      </section>

      <table className="sales-invoice-items">
        <colgroup>
          <col style={{ width: '4%' }} />
          <col style={{ width: '44%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '8%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '10%' }} />
        </colgroup>
        <thead>
          <tr>
            <th>م</th><th>الصنف / البيان</th><th>الطول</th><th>العرض</th>
            <th>العدد</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const note = String(it.notes || it.description || '').trim();
            return (
              <tr key={`${startIndex + i}-${it.itemId}`}>
                <td className="sales-invoice-cell-center">{startIndex + i + 1}</td>
                <td className="sales-invoice-item-name">
                  <strong>{it.itemName}</strong>
                  {note && note !== it.itemName && <span> / {note}</span>}
                </td>
                <td className="sales-invoice-cell-center">{it.length || '—'}</td>
                <td className="sales-invoice-cell-center">{it.width || '—'}</td>
                <td className="sales-invoice-cell-center">{it.count ?? '—'}</td>
                <td className="sales-invoice-cell-center sales-invoice-quantity">{it.quantity}</td>
                <td className="sales-invoice-cell-number">{amount(it.unitPrice)}</td>
                <td className="sales-invoice-cell-number sales-invoice-total">{amount(it.total)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {showFooter && (
        <>
          <div className="sales-invoice-payment-area">
            <section className="sales-invoice-payment-info">
              <div><strong>طريقة الدفع:</strong> <span>{paymentChannels.join(' / ')}</span></div>
              <div><strong>ملاحظة الدفع والإيصال:</strong> <span>{invoice.paymentNotes || ''}</span></div>
            </section>
            <section className="sales-invoice-totals">
              <div><strong>الإجمالي</strong><bdi dir="ltr">{amount(invoice.subtotal)} {symbol}</bdi></div>
              <div><strong>خصم</strong><bdi dir="ltr">{amount(invoice.discountTotal)} {symbol}</bdi></div>
              <div><strong>مدفوع</strong><bdi dir="ltr">{amount(paid)} {symbol}</bdi></div>
              <div><strong>متبقي</strong><bdi dir="ltr">{amount(remaining)} {symbol}</bdi></div>
            </section>
          </div>
          <footer className="sales-invoice-signature">
            <div className="sales-invoice-signature-receiver">توقيع وختم المستلم</div>
            <div className="sales-invoice-stamp">
              <span>الختم والتوقيع</span>
              <div className="sales-invoice-stamp-image">
                <OfficialStamp size="3.5cm" />
              </div>
            </div>
          </footer>
        </>
      )}
      {pageCount > 1 && <div className="sales-invoice-page-number">صفحة {pageIndex + 1} من {pageCount}</div>}
    </div>
  );
};
