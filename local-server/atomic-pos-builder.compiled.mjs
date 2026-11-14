// src/utils/subCustomerIdentity.ts
function normalizeSubCustomerName(input) {
  return String(input || "").normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "\u0627").replace(/ى/g, "\u064A").replace(/\s+/g, " ").trim().toLocaleLowerCase("ar");
}
function cleanSubCustomerName(input) {
  return String(input || "").replace(/(?:\+?\d[\d\s-]{7,14}\d)/g, " ").replace(/\s+/g, " ").trim();
}
function subCustomerParentId(party) {
  return party.parentPartyId || party.parentCustomerId || "";
}
function registeredSubCustomer(parties, parentId, name) {
  const normalized = normalizeSubCustomerName(name);
  if (!parentId || !normalized) return void 0;
  return parties.find(
    (p) => p.isSubCustomer === true && subCustomerParentId(p) === parentId && normalizeSubCustomerName(p.name) === normalized
  );
}
function findSubCustomerForSale(parties, parentId, name, selectedId) {
  if (!parentId) return void 0;
  const selected = selectedId ? parties.find((p) => p.id === selectedId && p.isSubCustomer === true && subCustomerParentId(p) === parentId) : void 0;
  return selected || registeredSubCustomer(parties, parentId, name);
}

// src/utils/invoiceStatusUtils.ts
function isInvoiceAccountingEligible(status) {
  if (!status) return true;
  return status === "new" || status === "ready" || status === "delivered";
}
function computeInvoicePaymentStatus(params) {
  const method = params.paymentMethod || "cash";
  const cashPaid = Number(params.cashPaidAmount || 0);
  const bankPaid = Number(params.bankPaidAmount || 0);
  if (params.explicitPaymentStatus) {
    if (params.explicitPaymentStatus === "paid_cash" && (method === "card" || method === "bank_transfer" || bankPaid > 0)) {
      return "paid_bank";
    }
    if (params.explicitPaymentStatus === "paid_bank" && (method === "cash" || cashPaid > 0 && bankPaid <= 0)) {
      return "paid_cash";
    }
    return params.explicitPaymentStatus;
  }
  const total = Number(params.totalAmount || 0);
  const paid = Number(params.paidAmount || 0);
  const remaining = params.remainingAmount !== void 0 ? Number(params.remainingAmount) : Math.max(0, total - paid);
  if (method === "credit" && paid <= 0) {
    return "credit";
  }
  if (paid <= 0) {
    return method === "credit" ? "credit" : "unpaid";
  }
  if (cashPaid > 0 && bankPaid > 0) {
    return "paid_cash_bank";
  }
  if (bankPaid > 0 || cashPaid <= 0 && (method === "card" || method === "bank_transfer")) {
    if (remaining <= 0 || paid >= total) {
      return "paid_bank";
    }
    return "partially_paid_bank";
  }
  if (cashPaid > 0 || method === "cash") {
    if (remaining <= 0 || paid >= total) {
      return "paid_cash";
    }
    return "partially_paid_cash";
  }
  if (remaining <= 0 && total > 0) {
    return "paid_cash";
  }
  return "unpaid";
}

// src/utils/posPostingIdentity.ts
function validPart(value, label) {
  if (typeof value !== "string" || !value.trim() || /[\/\u001f]/.test(value)) {
    throw new Error("INVALID_POS_EFFECT_" + label);
  }
  return value;
}
function checkedId(id) {
  if (id.length > 180) throw new Error("POS_EFFECT_ID_EXCEEDS_SERVER_LIMIT");
  return id;
}
function stablePosJournalId(type, invoiceId) {
  const source = validPart(invoiceId, "INVOICE_ID");
  return checkedId("je-pos-" + type + "-" + source.length + "-" + source);
}
function stablePosStockMovementFromSale(movement) {
  return stablePosStockMovementId(
    movement.sourceInvoiceId || movement.referenceNumber || "",
    movement.itemId
  );
}
function stablePosStockMovementId(immutableInvoiceId, itemId) {
  const reference = validPart(immutableInvoiceId, "INVOICE_ID");
  const item = validPart(itemId, "ITEM_ID");
  return checkedId("sm-pos-" + reference.length + "-" + reference + "-" + item.length + "-" + item);
}

// src/sync-next/atomicPosSaleBuilder.ts
var round = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
var safe = (value, label) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("POS_INVALID_" + label);
  return value;
};
var positive = (value, label) => {
  const n = safe(value, label);
  if (n <= 0) throw new Error("POS_INVALID_" + label);
  return n;
};
var nonnegative = (value, label) => {
  const n = safe(value, label);
  if (n < 0) throw new Error("POS_INVALID_" + label);
  return n;
};
var money = (n, label) => {
  const value = round(n);
  if (!Number.isSafeInteger(Math.round(value * 100)) || value < 0)
    throw new Error("POS_INVALID_MONEY_" + label);
  return value;
};
var change = (entity, id, value) => ({
  entity,
  id,
  value
});
function isService(item) {
  return item.category === "services" || item.category === "copy_scan" || item.id === "srv-delivery" || item.id === "srv-delivery-mobile" || item.barcode === "DELIVERY";
}
function isDelivery(item) {
  return item.id === "srv-delivery" || item.id === "srv-delivery-mobile" || item.barcode === "DELIVERY";
}
function buildNewAtomicPosSale(input) {
  const { invoiceId, commandId, items, notes, options = {} } = input;
  if (!invoiceId.startsWith("inv-pos-") || !commandId || !Array.isArray(items) || !items.length)
    throw new Error("POS_ATOMIC_INVOICE_ID_OR_LINES_REQUIRED");
  const now = input.createdAt || (/* @__PURE__ */ new Date()).toISOString();
  const date = options.date || now.slice(0, 10);
  const partyViews = input.parties.filter((r) => r.value);
  const parties = partyViews.map((r) => r.value);
  const inventoryById = new Map(input.inventory.filter((v) => v.value).map((v) => [v.id, v.value]));
  const type = options.counterpartyType || "customer";
  let customerId = options.counterpartyId || input.customerId;
  if (!customerId && type === "customer")
    customerId = parties.find((p) => p.code === "CUST-0001")?.id;
  if (!customerId) throw new Error("POS_CUSTOMER_ID_REQUIRED");
  if (type === "customer" || type === "supplier") {
    const party = parties.find((p) => p.id === customerId);
    if (!party || ![type, "both"].includes(party.type) || party.isSubCustomer)
      throw new Error("POS_COUNTERPARTY_NOT_IN_LOCAL_SNAPSHOT");
  }
  const fx = positive(Number(options.exchangeRate ?? 1), "EXCHANGE_RATE");
  const vat = nonnegative(Number(options.taxRate ?? input.vatRate ?? 0), "TAX_RATE");
  const extraDiscount = nonnegative(Number(options.overallDiscount ?? 0), "OVERALL_DISCOUNT");
  const charges = nonnegative(Number(options.additionalCharges ?? 0), "ADDITIONAL_CHARGES");
  let subtotal = 0, lineDiscounts = 0, deliveryBase = 0, cogsBase = 0;
  const sold = /* @__PURE__ */ new Map();
  const invoiceItems = [];
  for (const line of items) {
    const item = line?.item;
    if (!item?.id) throw new Error("POS_LINE_HAS_NO_IMMUTABLE_ITEM_ID");
    const length = Number(line.length || 0), width = Number(line.width || 0), count = Number(line.count || 1);
    const dimensional = Boolean(line.hasDimensions ?? (length > 0 && width > 0 && (length !== 1 || width !== 1 || count > 1)));
    const qty = positive(dimensional && length > 0 && width > 0 ? Number((length * width * count).toFixed(3)) : Number(line.quantity), "QUANTITY");
    const price = nonnegative(Number(line.unitPrice ?? item.sellingPrice ?? 0), "UNIT_PRICE");
    const discount = money(nonnegative(Number(line.discount ?? 0), "LINE_DISCOUNT"), "LINE_DISCOUNT");
    const gross = money(qty * price, "LINE_GROSS");
    if (discount > gross) throw new Error("POS_DISCOUNT_EXCEEDS_LINE");
    subtotal += gross;
    lineDiscounts += discount;
    const net2 = gross - discount;
    const lineTax = money(net2 * vat / 100, "LINE_TAX");
    if (isDelivery(item)) deliveryBase += net2;
    if (!isService(item)) {
      const stock = inventoryById.get(item.id);
      if (!stock) throw new Error("POS_STOCK_ITEM_MISSING_IN_LOCAL_SNAPSHOT");
      const prev = sold.get(item.id);
      sold.set(item.id, { item: stock, qty: (prev?.qty || 0) + qty });
      cogsBase += qty * nonnegative(Number(stock.purchasePrice || 0), "COST");
    }
    invoiceItems.push({
      itemId: item.id,
      itemCode: item.code,
      itemName: line.itemName || item.name,
      category: item.category,
      quantity: qty,
      unitPrice: price,
      discount,
      tax: lineTax,
      taxRate: vat,
      total: money(net2 + lineTax, "LINE_TOTAL"),
      description: line.description || "",
      notes: line.notes || "",
      hasDimensions: dimensional,
      length,
      width,
      count,
      unit: line.unit || item.unit,
      attachments: line.attachments,
      imageThumbnail: line.imageThumbnail,
      barcode: item.barcode
    });
  }
  subtotal = money(subtotal, "SUBTOTAL");
  const discountTotal = money(lineDiscounts + extraDiscount, "TOTAL_DISCOUNT");
  if (discountTotal > subtotal) throw new Error("POS_TOTAL_DISCOUNT_EXCEEDS_SUBTOTAL");
  const net = round(subtotal - discountTotal);
  const tax = money(net * vat / 100, "VAT");
  const total = money(net + tax + charges, "TOTAL");
  const baseTotal = money(total * fx, "BASE_TOTAL");
  const baseTax = money(tax * fx, "BASE_VAT");
  const baseDelivery = money(deliveryBase * fx, "BASE_DELIVERY");
  const baseRevenue = round(baseTotal - baseTax - baseDelivery);
  if (baseRevenue < 0) throw new Error("POS_DELIVERY_OR_TAX_EXCEEDS_TOTAL");
  const wf = options.workflowStatus || "new";
  const posted = isInvoiceAccountingEligible(wf);
  const quote = wf === "quotation";
  const paid = quote ? 0 : money(nonnegative(Number(options.paidAmount ?? (input.paymentMethod === "credit" ? 0 : total)), "PAID_AMOUNT"), "PAID_AMOUNT");
  if (paid > total) throw new Error("POS_OVERPAYMENT_REQUIRES_SEPARATE_CREDIT_WORKFLOW");
  const remaining = round(total - paid);
  const cash = nonnegative(Number(options.cashPaidAmount ?? 0), "CASH_PAID");
  const bank = nonnegative(Number(options.bankPaidAmount ?? 0), "BANK_PAID");
  const cashRate = positive(Number(options.cashExchangeRate ?? fx), "CASH_RATE");
  const bankRate = positive(Number(options.bankExchangeRate ?? fx), "BANK_RATE");
  const cashBase = money(cash * cashRate, "BASE_CASH");
  const bankBase = money(bank * bankRate, "BASE_BANK");
  const paidBase = money(paid * fx, "BASE_PAID");
  const explicit = round(cashBase + bankBase);
  if (explicit > 0 && Math.abs(explicit - paidBase) > 0.01)
    throw new Error("POS_PAYMENT_SPLIT_DOES_NOT_MATCH_PAID_AMOUNT");
  if (quote && (cashBase > 0 || bankBase > 0))
    throw new Error("POS_QUOTATION_CANNOT_HAVE_PAYMENT");
  const selectedPayment = explicit > 0 ? explicit : paidBase;
  const baseOutstanding = round(baseTotal - selectedPayment);
  if (baseOutstanding < 0) throw new Error("POS_INVALID_BASE_PAYMENT");
  const requestedSubName = cleanSubCustomerName(options.subCustomerName || options.customCustomerText || "");
  const partyChanges = [];
  let subCustomerId, subCustomerName;
  if (type === "customer" && requestedSubName) {
    const sub = findSubCustomerForSale(parties, customerId, requestedSubName, options.subCustomerId);
    subCustomerId = sub?.id || (posted && baseOutstanding > 0 ? "pt-sub-" + invoiceId : void 0);
    subCustomerName = sub?.name || requestedSubName;
    if (!sub && posted && baseOutstanding > 0) {
      partyChanges.push(change("parties", subCustomerId, {
        id: subCustomerId,
        code: "SUB-0001",
        _serverAutoCode: true,
        type: "customer",
        name: requestedSubName,
        phone: options.subCustomerPhone || "",
        parentPartyId: customerId,
        isSubCustomer: true,
        balance: baseOutstanding,
        openingBalance: 0
      }));
    }
  } else if (options.subCustomerId && type === "customer") {
    const selected = parties.find((p) => p.id === options.subCustomerId);
    if (!selected || selected.isSubCustomer !== true || selected.parentPartyId !== customerId)
      throw new Error("POS_SUBCUSTOMER_NOT_OWNED_BY_PARENT");
    subCustomerId = selected.id;
    subCustomerName = selected.name;
  }
  const invoice = {
    id: invoiceId,
    invoiceNumber: "TEMP-" + invoiceId,
    type: "pos",
    date,
    customerId,
    counterpartyType: type,
    counterpartyId: customerId,
    employeeId: type === "employee" ? customerId : void 0,
    customerName: input.customerName,
    items: invoiceItems,
    subtotal,
    discountTotal,
    taxRate: vat,
    taxAmount: tax,
    totalAmount: total,
    paidAmount: paid,
    remainingAmount: remaining,
    paymentMethod: input.paymentMethod,
    status: remaining <= 0 ? "paid" : paid > 0 ? "partial" : "unpaid",
    paymentStatus: computeInvoicePaymentStatus({
      paymentMethod: input.paymentMethod,
      totalAmount: total,
      paidAmount: paid,
      remainingAmount: remaining,
      cashPaidAmount: cash,
      bankPaidAmount: bank,
      explicitPaymentStatus: options.paymentStatus
    }),
    workflowStatus: wf,
    notes: notes || "",
    additionalCharges: charges,
    representative: options.representative,
    branch: options.branch,
    branchId: options.branchId,
    warehouse: options.warehouse,
    userId: options.userId,
    userName: options.userName,
    currency: options.currency || "ILS",
    currencySymbol: options.currencySymbol || "\u20AA",
    exchangeRate: fx,
    baseTotalAmount: baseTotal,
    basePaidAmount: selectedPayment,
    cashPaidAmount: cash,
    bankPaidAmount: bank,
    cashTreasuryCode: options.cashTreasuryCode,
    bankTreasuryCode: options.bankTreasuryCode,
    treasuryAccountCode: options.treasuryAccountCode,
    subCustomerId,
    subCustomerName,
    subCustomerPhone: options.subCustomerPhone,
    customCustomerText: options.customCustomerText,
    paymentNotes: options.paymentNotes,
    isAccountingPosted: posted,
    postedAt: posted ? now : void 0,
    createdAt: now,
    updatedAt: now,
    statusHistory: [{
      id: "st-init-" + invoiceId,
      userName: options.userName || "POS",
      userId: options.userId,
      date,
      time: now.slice(11, 19),
      previousStatus: wf,
      newStatus: wf,
      createdAt: now
    }]
  };
  const stockMovements = [];
  const inventoryChanges = [];
  const journals = [];
  if (posted) {
    if (baseTotal <= 0) throw new Error("POS_ZERO_VALUE_POSTING_REQUIRES_MANUAL_REVIEW");
    const time = now.slice(11, 19);
    for (const [itemId, { item, qty }] of sold) {
      const previous = safe(Number(item.stockQuantity ?? 0), "PREVIOUS_STOCK");
      const after = Number((previous - qty).toFixed(6));
      const cost = money(qty * Number(item.purchasePrice || 0), "LINE_COST");
      const id = stablePosStockMovementFromSale({ sourceInvoiceId: invoiceId, referenceNumber: invoice.invoiceNumber, itemId });
      const movement = {
        id,
        itemId,
        itemCode: item.code,
        itemName: item.name,
        category: item.category,
        date,
        time,
        type: "out_sale",
        quantity: qty,
        balanceBefore: previous,
        balanceAfter: after,
        unitPrice: Number(item.purchasePrice || 0),
        totalValue: cost,
        referenceType: "pos_invoice",
        sourceInvoiceId: invoiceId,
        referenceNumber: invoice.invoiceNumber
      };
      stockMovements.push(change("stockMovements", id, movement));
      inventoryChanges.push(change("inventory", itemId, { ...item, stockQuantity: after, lastMovementDate: date }));
    }
    const debitLines = [];
    if (cashBase) debitLines.push({
      accountCode: options.cashTreasuryCode || "1101",
      accountName: "Cash",
      debit: cashBase,
      credit: 0
    });
    if (bankBase) debitLines.push({
      accountCode: options.bankTreasuryCode || "1102",
      accountName: "Bank",
      debit: bankBase,
      credit: 0
    });
    if (!explicit && paidBase) {
      debitLines.push({
        accountCode: options.treasuryAccountCode || (["card", "bank_transfer"].includes(input.paymentMethod) ? options.bankTreasuryCode || "1102" : options.cashTreasuryCode || "1101"),
        accountName: "Payment collected",
        debit: paidBase,
        credit: 0
      });
    }
    if (baseOutstanding) debitLines.push({
      accountCode: "1201",
      accountName: "Accounts receivable",
      debit: baseOutstanding,
      credit: 0
    });
    const credits = [];
    if (baseRevenue) credits.push({ accountCode: "4101", accountName: "Sales revenue", debit: 0, credit: baseRevenue });
    if (baseDelivery) credits.push({ accountCode: "2104", accountName: "Courier payable", debit: 0, credit: baseDelivery });
    if (baseTax) credits.push({ accountCode: "2103", accountName: "VAT payable", debit: 0, credit: baseTax });
    const journal = {
      id: stablePosJournalId("pos_invoice", invoiceId),
      entryNumber: "JE-POS-" + invoiceId,
      date,
      createdAt: now,
      referenceType: "pos_invoice",
      referenceId: invoiceId,
      description: "POS sale " + invoice.invoiceNumber + " - " + input.customerName,
      lines: [...debitLines, ...credits]
    };
    journals.push(change("journalEntries", journal.id, journal));
    const cogs = money(stockMovements.reduce((s, m) => s + Number(m.value?.totalValue || 0), 0), "TOTAL_COGS");
    if (cogs > 0) {
      const cogsId = stablePosJournalId("cogs", invoiceId);
      const cogsJournal = {
        id: cogsId,
        entryNumber: "JE-COGS-" + invoiceId,
        date,
        createdAt: now,
        referenceType: "cogs",
        referenceId: invoiceId,
        description: "POS cost " + invoice.invoiceNumber,
        lines: [
          { accountCode: "5101", accountName: "Cost of goods sold", debit: cogs, credit: 0 },
          { accountCode: "1301", accountName: "Inventory", debit: 0, credit: cogs }
        ]
      };
      journals.push(change("journalEntries", cogsId, cogsJournal));
    }
    if (baseOutstanding > 0 && type !== "employee") {
      const debtor = subCustomerId || customerId;
      if (!partyChanges.some((p) => p.id === debtor)) {
        const current = parties.find((p) => p.id === debtor);
        if (!current) throw new Error("POS_DEBTOR_ID_NOT_FOUND");
        if (current.code === "CUST-0001") throw new Error("POS_CASH_CUSTOMER_CREDIT_NEEDS_SUBCUSTOMER");
        partyChanges.push(change("parties", debtor, {
          ...current,
          balance: round(safe(Number(current.balance || 0), "DEBTOR_BALANCE") + baseOutstanding)
        }));
      }
    }
  } else if (paid > 0) {
    throw new Error("POS_UNPOSTED_PAYMENT_REQUIRES_DEPOSIT_WORKFLOW");
  }
  const posting = {
    invoiceId,
    commandId,
    invoice: change("invoices", invoiceId, invoice),
    journals,
    stockMovements,
    partyChanges,
    inventoryChanges
  };
  return { posting, invoice };
}
export {
  buildNewAtomicPosSale
};
