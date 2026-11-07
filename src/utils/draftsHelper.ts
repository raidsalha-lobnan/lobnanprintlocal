import { Invoice } from '../types';

export function getAllStoredDraftsAsInvoices(): Invoice[] {
  const result: Invoice[] = [];
  const seenIds = new Set<string>();

  try {
    // 1. Multi-item drafts from Excel/OneDrive / Draft Queue keys
    const draftKeys = [
      'accounting_pending_multi_draft_invoices_v5',
      'accounting_pending_draft_invoices_v4',
      'accounting_pending_draft_invoices_v3',
      'accounting_pending_draft_invoices_v2',
      'live_onedrive_drafts_v3'
    ];

    draftKeys.forEach(key => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((d: any, idx: number) => {
            if (!d) return;
            const draftId = d.id || `${key}-${idx}`;
            if (seenIds.has(draftId)) return;
            seenIds.add(draftId);

            const items = (d.items || []).map((it: any, itIdx: number) => ({
              id: it.id || `it-${itIdx}`,
              itemId: it.matchedInventoryId || it.itemId,
              itemCode: it.itemCode || '',
              barcode: it.barcode || '',
              itemName: it.itemName || it.name || 'بند مسودة',
              description: it.notes || it.description || '',
              notes: it.notes || it.description || '',
              quantity: Number(it.quantity) || 1,
              length: Number(it.length) || 1,
              width: Number(it.width) || 1,
              count: Number(it.count) || Number(it.quantity) || 1,
              unit: it.unit || 'حبة',
              unitPrice: Number(it.unitPrice) || Number(it.price) || 0,
              total: Number(it.totalAmount) || Number(it.total) || ((Number(it.quantity) || 1) * (Number(it.unitPrice) || Number(it.price) || 0)),
              attachments: it.attachments || [],
              imageThumbnail: it.imageThumbnail || ''
            }));

            const total = Number(d.totalAmount) || items.reduce((sum: number, it: any) => sum + (Number(it.total) || 0), 0);
            const paid = Number(d.paidAmount) || 0;

            result.push({
              id: draftId,
              invoiceNumber: d.invoiceNumber ? (d.invoiceNumber.startsWith('مسودة-') ? d.invoiceNumber : `مسودة-${d.invoiceNumber}`) : `مسودة-${String(result.length + 1).padStart(3, '0')}`,
              date: d.date || new Date().toISOString().split('T')[0],
              customerId: d.customerId || 'pt-cust-1',
              customerName: d.customerName || 'عميل كاشير نقدي',
              subCustomerId: d.subCustomerId,
              subCustomerName: d.subCustomerName || '',
              subCustomerPhone: d.subCustomerPhone,
              type: 'pos',
              items,
              subtotal: total,
              discountTotal: 0,
              taxRate: 0,
              taxAmount: 0,
              totalAmount: total,
              paidAmount: paid,
              remainingAmount: Math.max(0, total - paid),
              paymentMethod: d.paymentMethod || 'cash',
              notes: d.notes || 'مسودة محفوظة',
              workflowStatus: 'draft' as any,
              status: 'draft' as any,
              createdAt: d.createdAt || new Date().toISOString()
            });
          });
        }
      } catch (e) {
        console.warn(`Error reading drafts from key ${key}:`, e);
      }
    });

    // Clean up any legacy auto-held items in localStorage
    try {
      const heldRaw = localStorage.getItem('pos_held_invoices');
      if (heldRaw) {
        const parsedHeld = JSON.parse(heldRaw);
        if (Array.isArray(parsedHeld)) {
          const cleaned = parsedHeld.filter(
            (h: any) => h && !h.notes?.includes('معلقة تلقائياً')
          );
          if (cleaned.length !== parsedHeld.length) {
            localStorage.setItem('pos_held_invoices', JSON.stringify(cleaned));
          }
        }
      }
    } catch {}

    // 3. Special Invoice Draft
    const specialRaw = localStorage.getItem('special_inv_draft');
    if (specialRaw) {
      try {
        const s = JSON.parse(specialRaw);
        if (s && (s.customerName || (Array.isArray(s.items) && s.items.some((it: any) => it.name && it.name.trim())))) {
          const sId = 'draft-special-invoice';
          if (!seenIds.has(sId)) {
            seenIds.add(sId);
            const items = (s.items || [])
              .filter((it: any) => it.name && it.name.trim())
              .map((it: any, idx: number) => ({
                id: `sp-it-${idx}`,
                itemName: it.name,
                description: it.itemNotes || '',
                notes: it.itemNotes || '',
                quantity: Number(it.qty) || 1,
                length: 1,
                width: 1,
                count: Number(it.qty) || 1,
                unit: 'حبة',
                unitPrice: Number(it.price) || 0,
                discount: 0,
                total: Number(it.total) || ((Number(it.qty) || 1) * (Number(it.price) || 0))
              }));

            const sub = items.reduce((sum: number, it: any) => sum + (Number(it.total) || 0), 0);
            const disc = Number(s.discount) || 0;
            const total = Math.max(0, sub - disc);

            result.push({
              id: sId,
              invoiceNumber: 'مسودة-خاصة',
              date: s.date || new Date().toISOString().split('T')[0],
              customerId: 'pt-cust-1',
              customerName: s.customerName || 'عميل فاتورة خاصة',
              subCustomerPhone: s.customerPhone,
              type: 'pos',
              items,
              subtotal: sub,
              discountTotal: disc,
              taxRate: 0,
              taxAmount: 0,
              totalAmount: total,
              paidAmount: 0,
              remainingAmount: total,
              paymentMethod: 'cash',
              notes: s.notes || 'مسودة فاتورة خاصة',
              workflowStatus: 'draft' as any,
              status: 'draft' as any,
              createdAt: new Date().toISOString()
            });
          }
        }
      } catch (e) {
        console.warn('Error reading special invoice draft:', e);
      }
    }

    // 4. Manual Invoice Draft
    const manualRaw = localStorage.getItem('manual_inv_draft');
    if (manualRaw) {
      try {
        const m = JSON.parse(manualRaw);
        if (m && (m.customerName || (Array.isArray(m.items) && m.items.some((it: any) => it.name && it.name.trim())))) {
          const mId = 'draft-manual-invoice';
          if (!seenIds.has(mId)) {
            seenIds.add(mId);
            const items = (m.items || [])
              .filter((it: any) => it.name && it.name.trim())
              .map((it: any, idx: number) => ({
                id: `mn-it-${idx}`,
                itemName: it.name,
                description: it.itemNotes || '',
                notes: it.itemNotes || '',
                quantity: Number(it.qty) || 1,
                length: 1,
                width: 1,
                count: Number(it.qty) || 1,
                unit: 'حبة',
                unitPrice: Number(it.price) || 0,
                discount: 0,
                total: Number(it.total) || ((Number(it.qty) || 1) * (Number(it.price) || 0))
              }));

            const sub = items.reduce((sum: number, it: any) => sum + (Number(it.total) || 0), 0);
            const disc = Number(m.discount) || 0;
            const total = Math.max(0, sub - disc);

            result.push({
              id: mId,
              invoiceNumber: m.invoiceNumber || 'مسودة-يدوية',
              date: m.date || new Date().toISOString().split('T')[0],
              customerId: 'pt-cust-1',
              customerName: m.customerName || 'عميل فاتورة يدوية',
              subCustomerPhone: m.customerPhone,
              type: 'pos',
              items,
              subtotal: sub,
              discountTotal: disc,
              taxRate: 0,
              taxAmount: 0,
              totalAmount: total,
              paidAmount: 0,
              remainingAmount: total,
              paymentMethod: 'cash',
              notes: m.notes || 'مسودة فاتورة يدوية',
              workflowStatus: 'draft' as any,
              status: 'draft' as any,
              createdAt: new Date().toISOString()
            });
          }
        }
      } catch (e) {
        console.warn('Error reading manual invoice draft:', e);
      }
    }
  } catch (err) {
    console.error('Error reading drafts as invoices:', err);
  }

  return result;
}

