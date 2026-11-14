// local-server/report-ssr-entry.tsx
import React5 from "react";
import { renderToStaticMarkup } from "react-dom/server";

// src/components/ReportsView.tsx
import { useState as useState2, useMemo as useMemo2, useEffect as useEffect3 } from "react";

// src/components/common/DateInput.tsx
import { useEffect } from "react";
import { jsx } from "react/jsx-runtime";
var DateInput = ({ value, onChange, className, ...rest }) => {
  const getTodayIso = () => (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  useEffect(() => {
    if (!value) {
      onChange({ target: { value: getTodayIso() } });
    }
  }, []);
  return /* @__PURE__ */ jsx(
    "input",
    {
      type: "date",
      lang: "en-GB",
      value: value || "",
      onChange: (e) => onChange({ target: { value: e.target.value } }),
      className: `${className || ""} hide-calendar-indicator text-center font-mono`,
      style: {
        direction: "ltr"
      },
      ...rest
    }
  );
};

// local-server/report-snapshot-context.ts
var useAccounting = () => globalThis.__reportSnapshot ?? {};

// src/components/ReportsView.tsx
import {
  BarChart3,
  Printer,
  FileSpreadsheet,
  TrendingUp,
  Percent,
  Users,
  Truck as Truck2,
  Boxes,
  Wallet,
  Receipt,
  UserCheck as UserCheck2,
  Landmark,
  Image as ImageIcon,
  X as X2
} from "lucide-react";

// src/utils/invoiceStatusUtils.ts
function isInvoiceAccountingEligible(status) {
  if (!status) return true;
  return status === "new" || status === "ready" || status === "delivered";
}

// src/utils/subCustomerIdentity.ts
function normalizeSubCustomerName(input) {
  return String(input || "").normalize("NFKC").replace(/[\u064B-\u065F\u0670\u0640]/g, "").replace(/[أإآٱ]/g, "\u0627").replace(/ى/g, "\u064A").replace(/\s+/g, " ").trim().toLocaleLowerCase("ar");
}
function cleanSubCustomerName(input) {
  return String(input || "").replace(/(?:\+?\d[\d\s-]{7,14}\d)/g, " ").replace(/\s+/g, " ").trim();
}
function getInvoiceSubCustomerName(inv) {
  return cleanSubCustomerName(inv.subCustomerName || inv.customCustomerText || "");
}
function invoiceParentCustomerId(inv) {
  if (inv.counterpartyType && inv.counterpartyType !== "customer") return "";
  return String(inv.customerId || inv.counterpartyId || "");
}
function subCustomerParentId(party) {
  return party.parentPartyId || party.parentCustomerId || "";
}

// src/utils/invoiceConfirmation.ts
var isConfirmedSalesInvoice = (invoice) => {
  const number2 = String(invoice.invoiceNumber || "").trim();
  return /^INV-\d+$/.test(number2) && (invoice.isOfficial !== false || invoice.isAccountingPosted === true);
};

// src/utils/statementGenerator.ts
function generateAccountStatement(params) {
  const {
    party,
    fromDate,
    toDate,
    subCustomerId,
    subCustomers = [],
    invoices = [],
    purchases = [],
    purchaseReturns = [],
    salesReturns = [],
    vouchers = [],
    printOrders = [],
    journalEntries = [],
    debtClearings = []
  } = params;
  const allTx = [];
  const targetSubCustObj = subCustomerId && subCustomerId !== "all" ? subCustomers.find((s) => s.id === subCustomerId || s.code === subCustomerId) || (party.isSubCustomer ? party : null) : party.isSubCustomer ? party : null;
  const targetSubCustName = targetSubCustObj?.name?.trim().toLowerCase();
  const matchesSubCust = (invSubCustId, invSubCustName, customText) => {
    if (!subCustomerId || subCustomerId === "all") return true;
    if (invSubCustId && (invSubCustId === subCustomerId || targetSubCustObj && invSubCustId === targetSubCustObj.id)) return true;
    if (targetSubCustName) {
      if (invSubCustName && normalizeSubCustomerName(invSubCustName) === normalizeSubCustomerName(targetSubCustName)) return true;
      if (customText && normalizeSubCustomerName(getInvoiceSubCustomerName({ subCustomerName: invSubCustName, customCustomerText: customText })) === normalizeSubCustomerName(targetSubCustName)) return true;
    }
    return false;
  };
  const partyInitDate = targetSubCustObj && targetSubCustObj.openingBalanceDate || party.openingBalanceDate || "2000-01-01";
  let initialBal = targetSubCustObj ? Number(targetSubCustObj.openingBalance || 0) : Number(party.openingBalance || 0);
  const initBalType = targetSubCustObj ? targetSubCustObj.openingBalanceType : party.openingBalanceType;
  if (initBalType === "credit") {
    initialBal = -Math.abs(initialBal);
  }
  if (initialBal !== 0) {
    allTx.push({
      id: `init-${targetSubCustObj ? targetSubCustObj.id : party.id}`,
      date: partyInitDate,
      refNum: "OPENING",
      type: "opening",
      category: "opening",
      typeLabel: "\u0631\u0635\u064A\u062F \u0627\u0641\u062A\u062A\u0627\u062D\u064A \u062A\u0623\u0633\u064A\u0633\u064A",
      description: targetSubCustObj ? `\u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u0627\u0641\u062A\u062A\u0627\u062D\u064A \u0627\u0644\u0645\u0642\u064A\u062F \u0644\u0644\u0632\u0628\u0648\u0646 \u0627\u0644\u0641\u0631\u0639\u064A: ${targetSubCustObj.name}` : "\u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u0627\u0641\u062A\u062A\u0627\u062D\u064A \u0627\u0644\u0645\u0642\u064A\u062F \u0639\u0646\u062F \u0625\u0646\u0634\u0627\u0621 \u0627\u0644\u062D\u0633\u0627\u0628",
      debit: initialBal > 0 ? initialBal : 0,
      credit: initialBal < 0 ? Math.abs(initialBal) : 0
    });
  }
  invoices.forEach((inv) => {
    if (!isConfirmedSalesInvoice(inv)) return;
    if (!isInvoiceAccountingEligible(inv.workflowStatus)) {
      return;
    }
    const isMainCustMatch = invoiceParentCustomerId(inv) === party.id;
    const linkedParentId = subCustomerParentId(party);
    const belongsToParent = party.isSubCustomer && Boolean(linkedParentId) && invoiceParentCustomerId(inv) === linkedParentId;
    const sameWalkInName = belongsToParent && normalizeSubCustomerName(getInvoiceSubCustomerName(inv)) === normalizeSubCustomerName(party.name);
    const isTarget = party.isSubCustomer ? belongsToParent && (inv.subCustomerId === party.id || sameWalkInName) : isMainCustMatch && matchesSubCust(inv.subCustomerId, inv.subCustomerName, inv.customCustomerText);
    if (isTarget) {
      const subCustNote = !party.isSubCustomer && (inv.subCustomerName || inv.customCustomerText) ? ` [\u0627\u0644\u0632\u0628\u0648\u0646 \u0627\u0644\u0641\u0631\u0639\u064A: ${inv.subCustomerName || inv.customCustomerText}]` : "";
      const itemsDetail = (inv.items || []).map((it) => {
        const itAny = it;
        return {
          itemId: it.itemId,
          itemCode: itAny.itemCode || itAny.item?.code || "",
          itemName: it.itemName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
          length: it.length,
          width: it.width,
          count: it.count || 1,
          hasDimensions: itAny.hasDimensions,
          unitCalculationType: itAny.unitCalculationType,
          discount: it.discount || 0,
          unit: it.unit,
          notes: itAny.notes || it.description,
          description: it.description,
          imageThumbnail: itAny.imageThumbnail || itAny.item?.imageUrl || "",
          attachments: it.attachments || []
        };
      });
      allTx.push({
        id: inv.id,
        date: inv.date,
        refNum: inv.invoiceNumber,
        type: "invoice",
        category: "withdrawal",
        typeLabel: "\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0628\u064A\u0639\u0627\u062A",
        description: inv.notes ? `${inv.notes}${subCustNote}` : subCustNote ? subCustNote.trim() : "",
        invoiceNotes: inv.notes || "",
        subtotal: inv.subtotal,
        discountTotal: inv.discountTotal || 0,
        taxAmount: inv.taxAmount || 0,
        totalAmount: inv.totalAmount,
        paidAmount: inv.paidAmount || 0,
        remainingAmount: inv.remainingAmount ?? Number(inv.totalAmount || 0) - Number(inv.paidAmount || 0),
        currencySymbol: inv.currencySymbol,
        subCustomerName: inv.subCustomerName || inv.customCustomerText,
        items: itemsDetail,
        debit: inv.baseTotalAmount || inv.totalAmount,
        credit: 0
      });
      const paidInInv = inv.basePaidAmount !== void 0 ? inv.basePaidAmount : inv.paidAmount || 0;
      if (paidInInv > 0) {
        const pmtMethodLabel = inv.paymentMethod === "cash" ? "\u0646\u0642\u062F\u0627\u064B (\u0627\u0644\u0635\u0646\u062F\u0648\u0642)" : inv.paymentMethod === "card" ? "\u0628\u0637\u0627\u0642\u0629/\u0634\u0628\u0643\u0629" : inv.paymentMethod === "bank_transfer" ? "\u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A" : inv.paymentMethod === "cheque" ? "\u0634\u064A\u0643 \u0628\u0646\u0643\u064A" : "\u0633\u062F\u0627\u062F \u0645\u0639 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629";
        allTx.push({
          id: `${inv.id}-pmt`,
          date: inv.date,
          refNum: `PAY-${inv.invoiceNumber}`,
          type: "receipt",
          category: "receipt",
          typeLabel: "\u0633\u0646\u062F \u0642\u0628\u0636",
          description: `\u0633\u062F\u0627\u062F \u0642\u064A\u0645\u0629 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 (${pmtMethodLabel})`,
          paymentMethod: inv.paymentMethod,
          paymentMethodLabel: pmtMethodLabel,
          voucherNotes: inv.paymentNotes || inv.receiptNotes || "",
          subCustomerName: inv.subCustomerName || inv.customCustomerText,
          debit: 0,
          credit: paidInInv
        });
      }
    }
  });
  printOrders.forEach((job) => {
    if (job.customerId === party.id) {
      if (job.status !== "delivered") {
        return;
      }
      const alreadyHasInvoice = invoices.some(
        (inv) => inv.printJobId === job.id || Boolean(job.associatedInvoiceId) && inv.id === job.associatedInvoiceId
      );
      if (alreadyHasInvoice) {
        return;
      }
      allTx.push({
        id: job.id,
        date: job.deliveryDate || job.createdAt,
        refNum: job.orderNumber,
        type: "invoice",
        category: "withdrawal",
        typeLabel: "\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0628\u064A\u0639\u0627\u062A",
        description: `\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0628\u064A\u0639\u0627\u062A - \u0623\u0645\u0631 \u062A\u0634\u063A\u064A\u0644 \u0645\u0637\u0628\u0639\u0629: ${job.title} (${job.quantity} \u0646\u0633\u062E\u0629)${job.paperType ? ` - \u0648\u0631\u0642: ${job.paperType}` : ""}`,
        items: [
          {
            itemName: job.title,
            quantity: job.quantity,
            unitPrice: job.quantity > 0 ? job.totalPrice / job.quantity : job.totalPrice,
            total: job.totalPrice,
            unit: job.dimensions || "\u0648\u062D\u062F\u0629",
            notes: job.notes
          }
        ],
        debit: job.totalPrice,
        credit: 0
      });
      if (job.depositPaid > 0) {
        const hasMatchingVoucher = vouchers.some(
          (v) => v.partyId === party.id && (v.voucherNumber === `DEP-${job.orderNumber}` || v.description && v.description.includes(job.orderNumber))
        );
        if (!hasMatchingVoucher) {
          allTx.push({
            id: `${job.id}-dep`,
            date: job.createdAt,
            refNum: `DEP-${job.orderNumber}`,
            type: "receipt",
            category: "receipt",
            typeLabel: "\u0633\u0646\u062F \u0642\u0628\u0636",
            description: `\u0639\u0631\u0628\u0648\u0646 \u0645\u0633\u062A\u0644\u0645 \u0644\u0623\u0645\u0631 \u0627\u0644\u062A\u0634\u063A\u064A\u0644 \u0627\u0644\u0645\u0633\u0644\u0651\u0645 ${job.orderNumber}`,
            debit: 0,
            credit: job.depositPaid
          });
        }
      }
    }
  });
  purchases.forEach((pur) => {
    if (pur.supplierId === party.id) {
      const purItems = (pur.items || []).map((it) => ({
        itemName: it.itemName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
        count: 1,
        discount: 0,
        notes: it.notes || it.description,
        unit: it.unit
      }));
      allTx.push({
        id: pur.id,
        date: pur.date,
        refNum: pur.invoiceNumber,
        type: "purchase",
        category: "withdrawal",
        // For supplier, supplies/purchases
        typeLabel: "\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0634\u062A\u0631\u064A\u0627\u062A",
        description: pur.notes || (pur.supplierInvoiceNumber ? `\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0648\u0631\u062F #${pur.supplierInvoiceNumber}` : ""),
        invoiceNotes: pur.notes || "",
        subtotal: pur.subtotal,
        discountTotal: 0,
        taxAmount: pur.taxAmount || 0,
        totalAmount: pur.totalAmount,
        items: purItems,
        debit: 0,
        credit: pur.baseTotalAmount || pur.totalAmount
      });
      const paidInPur = pur.basePaidAmount !== void 0 ? pur.basePaidAmount : pur.paidAmount || 0;
      if (paidInPur > 0) {
        allTx.push({
          id: `${pur.id}-pmt`,
          date: pur.date,
          refNum: `DISB-${pur.invoiceNumber}`,
          type: "payment",
          category: "disbursement",
          typeLabel: "\u0633\u0646\u062F \u0635\u0631\u0641",
          description: `\u0633\u062F\u0627\u062F \u0645\u0633\u062F\u062F \u0644\u0644\u0645\u0648\u0631\u062F (${pur.paymentMethod === "cash" ? "\u0646\u0642\u062F\u0627\u064B" : "\u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A"})`,
          paymentMethod: pur.paymentMethod,
          paymentMethodLabel: pur.paymentMethod === "cash" ? "\u0646\u0642\u062F\u0627\u064B (\u0627\u0644\u0635\u0646\u062F\u0648\u0642)" : "\u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A",
          voucherNotes: pur.notes,
          debit: paidInPur,
          credit: 0
        });
      }
    }
  });
  purchaseReturns.forEach((ret) => {
    if (ret.supplierId === party.id) {
      allTx.push({
        id: ret.id,
        date: ret.date,
        refNum: ret.returnNumber,
        type: "purchase_return",
        category: "receipt",
        typeLabel: "\u0645\u0631\u062F\u0648\u062F\u0627\u062A \u0645\u0634\u062A\u0631\u064A\u0627\u062A",
        description: `\u0645\u0631\u062A\u062C\u0639 \u062E\u0627\u0645\u0627\u062A \u0644\u0644\u0645\u0648\u0631\u062F (${ret.items.map((i) => `${i.itemName} \xD7 ${i.quantity}`).join("\u060C ")})${ret.notes ? ` - ${ret.notes}` : ""}`,
        invoiceNotes: ret.notes,
        subtotal: ret.totalAmount,
        totalAmount: ret.totalAmount,
        debit: ret.totalAmount,
        credit: 0
      });
    }
  });
  salesReturns.forEach((ret) => {
    if (ret.customerId === party.id) {
      allTx.push({
        id: ret.id,
        date: ret.date,
        refNum: ret.returnNumber,
        type: "sales_return",
        category: "receipt",
        typeLabel: "\u0645\u0631\u062F\u0648\u062F\u0627\u062A \u0645\u0628\u064A\u0639\u0627\u062A",
        description: `\u0645\u0631\u062A\u062C\u0639 \u0645\u0628\u064A\u0639\u0627\u062A \u0644\u0644\u0639\u0645\u064A\u0644${ret.invoiceNumber ? ` (\u0639\u0646 \u0641\u0627\u062A\u0648\u0631\u0629 ${ret.invoiceNumber})` : ""}: ${ret.items.map((i) => `${i.itemName} \xD7 ${i.quantity}`).join("\u060C ")}`,
        invoiceNotes: ret.notes,
        voucherNotes: ret.notes,
        subtotal: ret.subtotal,
        taxAmount: ret.taxAmount,
        totalAmount: ret.totalAmount,
        items: ret.items.map((it) => ({
          itemId: it.itemId,
          itemName: it.itemName,
          quantity: it.quantity,
          unitPrice: it.unitPrice,
          total: it.total,
          notes: it.reason
        })),
        debit: 0,
        credit: ret.totalAmount
      });
    }
  });
  vouchers.forEach((vch) => {
    if (vch.id.startsWith("vch-inv-") || vch.id.startsWith("vch-pur-")) {
      return;
    }
    const matchesVchSubCust = !subCustomerId || subCustomerId === "all" ? true : vch.partyId === subCustomerId || targetSubCustObj && vch.partyId === targetSubCustObj.id || targetSubCustName && vch.partyName && vch.partyName.trim().toLowerCase().includes(targetSubCustName) || targetSubCustName && vch.description && vch.description.trim().toLowerCase().includes(targetSubCustName) || targetSubCustName && vch.subCustomerName && vch.subCustomerName.trim().toLowerCase().includes(targetSubCustName);
    const isTarget = party.isSubCustomer ? vch.partyId === party.id || vch.description && vch.description.includes(party.name) || vch.partyName && vch.partyName.includes(party.name) : vch.partyId === party.id && matchesVchSubCust;
    if (isTarget) {
      const vchNote = vch.notes || vch.description;
      const paymentMethodLabel = vch.paymentMethod === "cash" ? "\u0646\u0642\u062F\u0627\u064B (\u0627\u0644\u0635\u0646\u062F\u0648\u0642)" : vch.paymentMethod === "cheque" ? "\u0634\u064A\u0643 \u0628\u0646\u0643\u064A" : vch.paymentMethod === "bank_transfer" ? "\u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A" : "\u0623\u062E\u0631\u0649";
      if (vch.type === "receipt") {
        allTx.push({
          id: vch.id,
          date: vch.date,
          refNum: vch.voucherNumber,
          type: "receipt",
          category: "receipt",
          typeLabel: "\u0633\u0646\u062F \u0642\u0628\u0636",
          description: vch.description || "\u0633\u0646\u062F \u0642\u0628\u0636 \u0648\u062A\u062D\u0635\u064A\u0644 \u062F\u0641\u0639\u0629 \u0646\u0642\u062F\u064A\u0629 \u0645\u0646 \u0627\u0644\u0639\u0645\u064A\u0644",
          voucherNotes: vchNote,
          paymentMethod: vch.paymentMethod,
          paymentMethodLabel,
          chequeNumber: vch.chequeNumber,
          chequeBank: vch.chequeBank,
          chequeDueDate: vch.chequeDueDate,
          transferReference: vch.transferReference,
          accountCode: vch.treasuryAccountCode || vch.accountCode,
          subCustomerName: vch.subCustomerName,
          debit: 0,
          credit: vch.amount
        });
      } else {
        const isCust = party.type === "customer";
        allTx.push({
          id: vch.id,
          date: vch.date,
          refNum: vch.voucherNumber,
          type: "payment",
          category: "disbursement",
          typeLabel: "\u0633\u0646\u062F \u0635\u0631\u0641",
          description: vch.description || (isCust ? "\u0633\u0646\u062F \u0635\u0631\u0641 \u0648\u0627\u0633\u062A\u0631\u062F\u0627\u062F \u0644\u0644\u0639\u0645\u064A\u0644" : "\u0633\u0646\u062F \u0635\u0631\u0641 \u0648\u0633\u062F\u0627\u062F \u062F\u0641\u0639\u0629 \u0644\u0644\u0645\u0648\u0631\u062F"),
          voucherNotes: vchNote,
          paymentMethod: vch.paymentMethod,
          paymentMethodLabel,
          chequeNumber: vch.chequeNumber,
          chequeBank: vch.chequeBank,
          chequeDueDate: vch.chequeDueDate,
          transferReference: vch.transferReference,
          accountCode: vch.treasuryAccountCode || vch.accountCode,
          subCustomerName: vch.subCustomerName,
          debit: vch.amount,
          credit: 0
        });
      }
    }
  });
  journalEntries.filter((e) => !e.referenceType || e.referenceType === "manual").forEach((entry) => {
    entry.lines.forEach((line, lIdx) => {
      const isMatch = line.description && line.description.includes(party.name) || entry.description && entry.description.includes(party.name) || line.accountName && line.accountName.includes(party.name);
      if (isMatch) {
        allTx.push({
          id: `${entry.id}-${lIdx}`,
          date: entry.date,
          refNum: entry.entryNumber,
          type: "journal",
          category: line.debit > 0 ? "withdrawal" : "receipt",
          typeLabel: "\u0642\u064A\u062F \u064A\u0648\u0645\u064A\u0629 \u062A\u0633\u0648\u064A\u0629",
          description: `${line.description || entry.description} [\u062D\u0633\u0627\u0628: ${line.accountName}]`,
          voucherNotes: entry.notes || entry.description,
          accountCode: line.accountCode,
          debit: line.debit,
          credit: line.credit
        });
      }
    });
  });
  debtClearings.forEach((clr) => {
    if (clr.customerId === party.id) {
      allTx.push({
        id: `${clr.id}-cust`,
        date: clr.date,
        refNum: clr.clearingNumber,
        type: "clearance",
        category: "receipt",
        typeLabel: "\u0645\u0642\u0627\u0635\u0629 \u062D\u0633\u0627\u0628\u0627\u062A (\u0642\u0628\u0636 / \u062A\u0633\u0648\u064A\u0629 \u062F\u0627\u0626\u0646\u0629)",
        description: `\u0645\u0642\u0627\u0635\u0629 \u062A\u0633\u0648\u064A\u0629 \u0645\u0639 \u0627\u0644\u0645\u0648\u0631\u062F: ${clr.supplierName} - ${clr.reason || "\u062A\u0633\u0648\u064A\u0629 \u0623\u0631\u0635\u062F\u0629 \u0645\u062A\u0628\u0627\u062F\u0644\u0629"}`,
        voucherNotes: clr.notes,
        counterPartyName: clr.supplierName,
        reason: clr.reason,
        debit: 0,
        credit: clr.amount
      });
    }
    if (clr.supplierId === party.id) {
      allTx.push({
        id: `${clr.id}-supp`,
        date: clr.date,
        refNum: clr.clearingNumber,
        type: "clearance",
        category: "disbursement",
        typeLabel: "\u0645\u0642\u0627\u0635\u0629 \u062D\u0633\u0627\u0628\u0627\u062A (\u0635\u0631\u0641 / \u062A\u0633\u0648\u064A\u0629 \u0645\u062F\u064A\u0646\u0629)",
        description: `\u0645\u0642\u0627\u0635\u0629 \u062A\u0633\u0648\u064A\u0629 \u0645\u0639 \u0627\u0644\u0639\u0645\u064A\u0644: ${clr.customerName} - ${clr.reason || "\u062A\u0633\u0648\u064A\u0629 \u0623\u0631\u0635\u062F\u0629 \u0645\u062A\u0628\u0627\u062F\u0644\u0629"}`,
        voucherNotes: clr.notes,
        counterPartyName: clr.customerName,
        reason: clr.reason,
        debit: clr.amount,
        credit: 0
      });
    }
  });
  allTx.sort((a, b) => {
    const dComp = a.date.localeCompare(b.date);
    if (dComp !== 0) return dComp;
    if (a.type === "opening") return -1;
    if (b.type === "opening") return 1;
    return a.id.localeCompare(b.id);
  });
  let periodOpeningBalance = 0;
  const filteredTx = [];
  allTx.forEach((tx) => {
    if (fromDate && tx.date < fromDate) {
      periodOpeningBalance += tx.debit - tx.credit;
    } else if (!toDate || tx.date <= toDate) {
      filteredTx.push(tx);
    }
  });
  let running = periodOpeningBalance;
  const rows = [];
  let totalDebit = 0;
  let totalCredit = 0;
  let totalWithdrawals = 0;
  let totalReceipts = 0;
  let totalDisbursements = 0;
  filteredTx.forEach((tx) => {
    running += tx.debit - tx.credit;
    totalDebit += tx.debit;
    totalCredit += tx.credit;
    if (tx.category === "withdrawal") {
      totalWithdrawals += tx.debit;
    } else if (tx.category === "receipt") {
      totalReceipts += tx.credit;
    } else if (tx.category === "disbursement") {
      totalDisbursements += tx.debit;
    }
    rows.push({
      id: tx.id,
      date: tx.date,
      referenceNumber: tx.refNum,
      type: tx.type,
      category: tx.category,
      typeLabel: tx.typeLabel,
      description: tx.description,
      invoiceNotes: tx.invoiceNotes,
      voucherNotes: tx.voucherNotes,
      subtotal: tx.subtotal,
      discountTotal: tx.discountTotal,
      discountAmount: tx.discountTotal,
      taxAmount: tx.taxAmount,
      totalAmount: tx.totalAmount,
      paidAmount: tx.paidAmount,
      remainingAmount: tx.remainingAmount,
      currencySymbol: tx.currencySymbol,
      paymentMethod: tx.paymentMethod,
      paymentMethodLabel: tx.paymentMethodLabel,
      chequeNumber: tx.chequeNumber,
      chequeBank: tx.chequeBank,
      chequeDueDate: tx.chequeDueDate,
      transferReference: tx.transferReference,
      accountCode: tx.accountCode,
      treasuryName: tx.treasuryName,
      counterPartyName: tx.counterPartyName,
      reason: tx.reason,
      subCustomerName: tx.subCustomerName,
      items: tx.items,
      debit: tx.debit,
      credit: tx.credit,
      runningBalance: running
    });
  });
  const closingBalance = running;
  const creditLimit = Number(party.creditLimit || 0);
  const isCreditExceeded = creditLimit > 0 && closingBalance > creditLimit;
  const creditUsagePercentage = creditLimit > 0 ? closingBalance / creditLimit * 100 : 0;
  return {
    party,
    fromDate,
    toDate,
    openingBalance: periodOpeningBalance,
    rows,
    totalDebit,
    totalCredit,
    totalWithdrawals,
    totalReceipts,
    totalDisbursements,
    netMovement: totalDebit - totalCredit,
    closingBalance,
    creditLimit,
    isCreditExceeded,
    creditUsagePercentage,
    statementDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
  };
}
function generateEmployeeStatement(params) {
  const {
    employee,
    fromDate,
    toDate,
    vouchers = [],
    advances = [],
    deductions = [],
    incentives = [],
    invoices = [],
    purchases = [],
    purchaseReturns = [],
    salesReturns = [],
    payrollSheets = [],
    journalEntries = [],
    debtClearings = []
  } = params;
  const allTx = [];
  const empId = (employee.id || "").trim();
  const empCode = (employee.code || "").trim();
  const empName = (employee.name || "").trim();
  const empPhone = (employee.phone || "").trim();
  const isMatched = (targetId, targetName, targetText, targetEmpId) => {
    if (targetId) {
      const tid = targetId.trim();
      if (tid === empId) return true;
      if (empCode && tid.toLowerCase() === empCode.toLowerCase()) return true;
    }
    if (targetEmpId) {
      const teid = targetEmpId.trim();
      if (teid === empId) return true;
      if (empCode && teid.toLowerCase() === empCode.toLowerCase()) return true;
    }
    if (targetName && empName) {
      const tname = targetName.trim().toLowerCase();
      const ename = empName.toLowerCase();
      if (tname === ename) return true;
      if (tname.includes(ename) || ename.includes(tname)) return true;
    }
    if (empPhone && targetText && targetText.includes(empPhone)) return true;
    if (targetText) {
      const textLower = targetText.toLowerCase();
      if (empCode && empCode.length >= 2) {
        const re = new RegExp(`(^|[^a-zA-Z0-9\u0600-\u06FF])${empCode}([^a-zA-Z0-9\u0600-\u06FF]|$)`, "i");
        if (re.test(textLower)) return true;
      }
      if (empName && empName.length >= 3 && textLower.includes(empName.toLowerCase())) {
        return true;
      }
    }
    return false;
  };
  (employee.paymentHistory || []).forEach((record) => {
    if (record.type === "advance") {
      allTx.push({
        id: record.id,
        date: record.date,
        refNum: record.voucherNumber || `ADV-${record.id.slice(0, 6)}`,
        type: "advance",
        typeLabel: "\u0633\u0644\u0641\u0629 \u0646\u0642\u062F\u064A\u0629",
        description: record.notes || `\u0633\u0644\u0641\u0629 \u0646\u0642\u062F\u064A\u0629 \u0645\u0633\u062A\u0644\u0645\u0629 (${record.paymentMethod === "cash" ? "\u0646\u0642\u062F\u0627\u064B" : "\u062A\u062D\u0648\u064A\u0644"})`,
        entitlement: 0,
        advance: record.amount,
        deduction: 0,
        disbursement: 0,
        paymentMethod: record.paymentMethod,
        period: record.period,
        notes: record.notes
      });
    } else {
      allTx.push({
        id: record.id,
        date: record.date,
        refNum: record.voucherNumber || `PAY-${record.id.slice(0, 6)}`,
        type: "payment_disbursement",
        typeLabel: "\u0635\u0631\u0641 \u0631\u0627\u062A\u0628",
        description: record.notes || `\u0635\u0631\u0641 \u0627\u0644\u0631\u0627\u062A\u0628 \u0627\u0644\u0645\u0633\u062A\u062D\u0642 \u0639\u0646 \u0641\u062A\u0631\u0629 ${record.period || "\u0627\u0644\u0634\u0647\u0631"}`,
        entitlement: 0,
        advance: 0,
        deduction: 0,
        disbursement: record.amount,
        paymentMethod: record.paymentMethod,
        period: record.period,
        notes: record.notes
      });
    }
  });
  advances.forEach((adv) => {
    if (adv.status !== "cancelled") {
      const matches = isMatched(adv.employeeId, adv.employeeName, adv.reason) || adv.employeeId === empId;
      if (matches) {
        const exists = allTx.some((t) => t.id === adv.id || t.date === adv.date && t.advance === adv.amount);
        if (!exists) {
          allTx.push({
            id: adv.id,
            date: adv.date,
            refNum: adv.voucherNumber || `ADV-${adv.id.slice(0, 6)}`,
            type: "advance",
            typeLabel: "\u0633\u0644\u0641\u0629 \u0646\u0642\u062F\u064A\u0629",
            description: adv.reason || "\u0637\u0644\u0628 \u0633\u0644\u0641\u0629 \u0646\u0642\u062F\u064A\u0629 \u0645\u0639\u062A\u0645\u062F\u0629",
            entitlement: 0,
            advance: adv.amount,
            deduction: 0,
            disbursement: 0,
            notes: adv.reason
          });
        }
      }
    }
  });
  deductions.forEach((ded) => {
    if (ded.status !== "cancelled") {
      const matches = isMatched(ded.employeeId, ded.employeeName, ded.reason) || ded.employeeId === empId;
      if (matches) {
        allTx.push({
          id: ded.id,
          date: ded.date,
          refNum: `DED-${ded.id.slice(0, 6)}`,
          type: "deduction",
          typeLabel: "\u062E\u0635\u0645 / \u0627\u0633\u062A\u0642\u0637\u0627\u0639",
          description: ded.reason || "\u062E\u0635\u0645 \u0625\u062F\u0627\u0631\u064A \u0623\u0648 \u0627\u0633\u062A\u0642\u0637\u0627\u0639 \u063A\u064A\u0627\u0628",
          entitlement: 0,
          advance: 0,
          deduction: ded.amount,
          disbursement: 0,
          notes: ded.reason
        });
      }
    }
  });
  incentives.forEach((inc) => {
    const matches = isMatched(inc.employeeId, inc.employeeName, inc.reason) || inc.employeeId === empId;
    if (matches) {
      allTx.push({
        id: inc.id,
        date: inc.date,
        refNum: `INC-${inc.id.slice(0, 6)}`,
        type: "incentive",
        typeLabel: "\u0645\u0643\u0627\u0641\u0623\u0629 \u0648\u062D\u0627\u0641\u0632",
        description: inc.reason || "\u0645\u0643\u0627\u0641\u0623\u0629 \u062A\u0645\u064A\u0632 \u0648\u062D\u0627\u0641\u0632 \u0623\u062F\u0627\u0621",
        entitlement: inc.amount,
        advance: 0,
        deduction: 0,
        disbursement: 0,
        notes: inc.reason
      });
    }
  });
  vouchers.forEach((vch) => {
    const matches = isMatched(vch.partyId, vch.partyName, vch.description, vch.employeeId);
    if (!matches) return;
    const alreadyLogged = allTx.some((t) => t.id === vch.id || t.refNum && t.refNum === vch.voucherNumber);
    if (alreadyLogged) return;
    if (vch.type === "payment") {
      const isAdvance = vch.description?.includes("\u0633\u0644\u0641\u0629") || vch.voucherNumber?.includes("ADV");
      if (isAdvance) {
        allTx.push({
          id: vch.id,
          date: vch.date,
          refNum: vch.voucherNumber,
          type: "advance",
          typeLabel: "\u0633\u0644\u0641\u0629 \u0646\u0642\u062F\u064A\u0629 (\u0633\u0646\u062F \u0635\u0631\u0641)",
          description: vch.description || `\u0633\u0646\u062F \u0635\u0631\u0641 \u0633\u0644\u0641\u0629 \u0644\u0644\u0645\u0648\u0638\u0641 ${empName}`,
          entitlement: 0,
          advance: vch.amount,
          deduction: 0,
          disbursement: 0
        });
      } else {
        allTx.push({
          id: vch.id,
          date: vch.date,
          refNum: vch.voucherNumber,
          type: "payment_disbursement",
          typeLabel: "\u0633\u0646\u062F \u0635\u0631\u0641",
          description: vch.description || `\u0633\u0646\u062F \u0635\u0631\u0641 \u0644\u0644\u0645\u0648\u0638\u0641 ${empName}`,
          entitlement: 0,
          advance: 0,
          deduction: 0,
          disbursement: vch.amount
        });
      }
    } else if (vch.type === "receipt") {
      allTx.push({
        id: vch.id,
        date: vch.date,
        refNum: vch.voucherNumber,
        type: "receipt",
        typeLabel: "\u0633\u0646\u062F \u0642\u0628\u0636 (\u062A\u0633\u062F\u064A\u062F/\u0625\u064A\u062F\u0627\u0639)",
        description: vch.description || `\u0633\u0646\u062F \u0642\u0628\u0636 \u0627\u0633\u062A\u0644\u0627\u0645 \u0645\u0627\u0644\u064A \u0645\u0646 \u0627\u0644\u0645\u0648\u0638\u0641 ${empName}`,
        entitlement: vch.amount,
        advance: 0,
        deduction: 0,
        disbursement: 0
      });
    }
  });
  invoices.forEach((inv) => {
    if (!isConfirmedSalesInvoice(inv)) return;
    if (!isInvoiceAccountingEligible(inv.workflowStatus)) return;
    const isDirectEmployeeCust = inv.counterpartyType === "employee" && inv.counterpartyId === empId || inv.employeeId === empId || inv.customerId === empId && (!inv.counterpartyType || inv.counterpartyType === "employee");
    const isLinkedByRepOrNote = !isDirectEmployeeCust && (inv.representative && isMatched(void 0, inv.representative, void 0) || isMatched(void 0, void 0, `${inv.notes || ""} ${inv.customCustomerText || ""}`));
    if (isDirectEmployeeCust) {
      const desc = inv.notes || "";
      const mappedItems = (inv.items || []).map((it) => ({
        itemId: it.itemId,
        itemCode: it.itemCode,
        itemName: it.itemName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
        length: it.length,
        width: it.width,
        count: it.count,
        discount: it.discount,
        unit: it.unit,
        notes: it.notes,
        description: it.description,
        imageThumbnail: it.imageThumbnail,
        attachments: it.attachments
      }));
      allTx.push({
        id: inv.id,
        date: inv.date,
        refNum: inv.invoiceNumber,
        type: "invoice",
        typeLabel: "\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0628\u064A\u0639\u0627\u062A (\u0645\u0633\u062D\u0648\u0628\u0627\u062A \u0623\u0635\u0646\u0627\u0641)",
        description: desc,
        entitlement: 0,
        advance: 0,
        deduction: 0,
        disbursement: inv.totalAmount,
        notes: inv.notes,
        invoiceNotes: inv.notes,
        items: mappedItems
      });
      const paidVal = inv.paidAmount || 0;
      if (paidVal > 0) {
        allTx.push({
          id: `${inv.id}-pmt`,
          date: inv.date,
          refNum: `PAY-${inv.invoiceNumber}`,
          type: "receipt",
          typeLabel: "\u0633\u062F\u0627\u062F \u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0628\u064A\u0639\u0627\u062A",
          description: `\u0633\u062F\u0627\u062F \u0641\u0648\u0631\u064A \u0639\u0644\u0649 \u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0628\u064A\u0639\u0627\u062A ${inv.invoiceNumber} (${inv.paymentMethod === "cash" ? "\u0646\u0642\u062F\u0627\u064B" : "\u062A\u062D\u0648\u064A\u0644"})`,
          entitlement: paidVal,
          advance: 0,
          deduction: 0,
          disbursement: 0
        });
      }
    } else if (isLinkedByRepOrNote) {
      const mappedItems = (inv.items || []).map((it) => ({
        itemId: it.itemId,
        itemCode: it.itemCode,
        itemName: it.itemName,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        total: it.total,
        length: it.length,
        width: it.width,
        count: it.count,
        discount: it.discount,
        unit: it.unit,
        notes: it.notes,
        description: it.description,
        imageThumbnail: it.imageThumbnail,
        attachments: it.attachments
      }));
      allTx.push({
        id: inv.id,
        date: inv.date,
        refNum: inv.invoiceNumber,
        type: "invoice",
        typeLabel: "\u0639\u0645\u0644\u064A\u0629 \u0645\u0628\u064A\u0639\u0627\u062A (\u0645\u0646\u062F\u0648\u0628/\u0643\u0627\u0634\u064A\u0631)",
        description: inv.notes ? inv.notes : inv.customerName ? `\u0627\u0644\u0639\u0645\u064A\u0644: ${inv.customerName}${inv.representative ? ` (\u0627\u0644\u0645\u0646\u062F\u0648\u0628: ${inv.representative})` : ""}` : "",
        entitlement: 0,
        advance: 0,
        deduction: 0,
        disbursement: 0,
        notes: inv.notes,
        invoiceNotes: inv.notes,
        items: mappedItems
      });
    }
  });
  purchases.forEach((p) => {
    const isLinked = isMatched(p.supplierId, p.supplierName, p.notes, p.employeeId);
    if (!isLinked) return;
    const desc = p.notes || "";
    const mappedItems = (p.items || []).map((it) => ({
      itemId: it.itemId || it.id || "",
      itemCode: it.itemCode || "",
      itemName: it.itemName,
      quantity: it.quantity,
      unitPrice: it.unitPrice,
      total: it.total,
      unit: it.unit || "",
      notes: it.notes || "",
      imageThumbnail: it.imageThumbnail || ""
    }));
    allTx.push({
      id: p.id,
      date: p.date,
      refNum: p.invoiceNumber,
      type: "purchase",
      typeLabel: "\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0634\u062A\u0631\u064A\u0627\u062A / \u062A\u0648\u0631\u064A\u062F",
      description: desc,
      entitlement: p.totalAmount,
      advance: 0,
      deduction: 0,
      disbursement: 0,
      notes: p.notes,
      invoiceNotes: p.notes,
      items: mappedItems
    });
    if ((p.paidAmount || 0) > 0) {
      allTx.push({
        id: `${p.id}-pmt`,
        date: p.date,
        refNum: `PAY-${p.invoiceNumber}`,
        type: "payment_disbursement",
        typeLabel: "\u0633\u062F\u0627\u062F \u0642\u064A\u0645\u0629 \u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0644\u0644\u0645\u0648\u0638\u0641",
        description: `\u0633\u062F\u0627\u062F \u0648\u0635\u0631\u0641 \u0642\u064A\u0645\u0629 \u0645\u0634\u062A\u0631\u064A\u0627\u062A ${p.invoiceNumber}`,
        entitlement: 0,
        advance: 0,
        deduction: 0,
        disbursement: p.paidAmount
      });
    }
  });
  purchaseReturns.forEach((pr) => {
    const isLinked = isMatched(pr.supplierId, pr.supplierName, pr.notes, pr.employeeId);
    if (!isLinked) return;
    allTx.push({
      id: pr.id,
      date: pr.date,
      refNum: pr.returnNumber,
      type: "purchase",
      typeLabel: "\u0645\u0631\u062F\u0648\u062F\u0627\u062A \u0645\u0634\u062A\u0631\u064A\u0627\u062A",
      description: `\u0645\u0631\u062F\u0648\u062F\u0627\u062A \u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0631\u0642\u0645 ${pr.returnNumber} - \u0625\u062C\u0645\u0627\u0644\u064A ${pr.totalAmount.toFixed(2)}`,
      entitlement: 0,
      advance: 0,
      deduction: pr.totalAmount,
      disbursement: 0
    });
  });
  (payrollSheets || []).forEach((sheet) => {
    const sheetItems = sheet.items || sheet.lines || [];
    const line = sheetItems.find(
      (l) => isMatched(l.employeeId, l.employeeName, l.notes) || empCode && l.employeeCode?.toLowerCase() === empCode.toLowerCase()
    );
    if (line) {
      const sheetDate = sheet.createdAt || sheet.disbursedAt || sheet.periodMonth || "2026-09-01";
      const isApproved = sheet.status === "approved";
      const basic = Number(line.basicSalary || 0);
      const allowances = Number(line.allowances || line.allowancesTotal || 0);
      const deduct = Number(line.deductions || line.deductionsTotal || 0);
      const net = Number(line.netSalary || basic + allowances - deduct);
      allTx.push({
        id: `payroll-${sheet.id}-${empId}`,
        date: sheetDate,
        refNum: sheet.sheetNumber || `SHT-${sheet.id.slice(0, 6)}`,
        type: "payroll_sheet",
        typeLabel: isApproved ? "\u0645\u0633\u064A\u0631 \u0631\u0627\u062A\u0628 \u0645\u0639\u062A\u0645\u062F" : "\u0645\u0633\u0648\u062F\u0629 \u0645\u0633\u064A\u0631 \u0631\u0627\u062A\u0628",
        description: `\u0645\u0633\u064A\u0631 \u0631\u0627\u062A\u0628 \u0634\u0647\u0631 ${sheet.period || sheet.periodMonth || ""} (\u0623\u0633\u0627\u0633\u064A: ${basic.toFixed(2)} + \u0628\u062F\u0644\u0627\u062A: ${allowances.toFixed(2)}${deduct > 0 ? ` - \u0627\u0633\u062A\u0642\u0637\u0627\u0639\u0627\u062A: ${deduct.toFixed(2)}` : ""})`,
        entitlement: basic + allowances,
        advance: 0,
        deduction: deduct,
        disbursement: isApproved ? net : 0,
        period: sheet.period
      });
    }
  });
  (debtClearings || []).forEach((dc) => {
    if (isMatched(dc.customerId, dc.customerName, dc.reason) || isMatched(dc.supplierId, dc.supplierName, dc.reason)) {
      allTx.push({
        id: dc.id,
        date: dc.date,
        refNum: dc.clearingNumber || `DC-${dc.id.slice(0, 6)}`,
        type: "debt_clearing",
        typeLabel: "\u062A\u0633\u0648\u064A\u0629 / \u0645\u0642\u0627\u0635\u0629 \u062D\u0633\u0627\u0628",
        description: dc.reason || "\u062A\u0633\u0648\u064A\u0629 \u062D\u0633\u0627\u0628 \u0645\u0627\u0644\u064A \u0648\u0645\u0642\u0627\u0635\u0629",
        entitlement: dc.amount > 0 ? dc.amount : 0,
        advance: 0,
        deduction: 0,
        disbursement: dc.amount < 0 ? Math.abs(dc.amount) : 0
      });
    }
  });
  (journalEntries || []).forEach((entry) => {
    const empLines = (entry.lines || []).filter(
      (l) => isMatched(void 0, l.accountName, `${l.description || ""} ${entry.description || ""}`)
    );
    empLines.forEach((line, idx) => {
      if (entry.referenceId && allTx.some((t) => t.id === entry.referenceId)) return;
      allTx.push({
        id: `${entry.id}-${idx}`,
        date: entry.date,
        refNum: entry.entryNumber || `JV-${entry.id.slice(0, 6)}`,
        type: "journal_entry",
        typeLabel: "\u0642\u064A\u062F \u064A\u0648\u0645\u064A\u0629 \u062A\u0633\u0648\u064A\u0629",
        description: line.description || entry.description || "\u0642\u064A\u062F \u0645\u062D\u0627\u0633\u0628\u064A \u0645\u0633\u062C\u0644 \u0639\u0644\u0649 \u062D\u0633\u0627\u0628 \u0627\u0644\u0645\u0648\u0638\u0641",
        entitlement: line.credit || 0,
        advance: 0,
        deduction: 0,
        disbursement: line.debit || 0
      });
    });
  });
  const hireYear = Math.max(2023, parseInt((employee.hireDate || "2024-01-01").split("-")[0], 10) || 2024);
  const currentYear = (/* @__PURE__ */ new Date()).getFullYear();
  const currentMonth = (/* @__PURE__ */ new Date()).getMonth() + 1;
  for (let y = hireYear; y <= currentYear; y++) {
    const maxM = y === currentYear ? currentMonth : 12;
    for (let m = 1; m <= maxM; m++) {
      const monthStr = `${y}-${String(m).padStart(2, "0")}`;
      const accrualDate = `${monthStr}-28`;
      const hasPayrollForMonth = allTx.some((t) => t.type === "payroll_sheet" && t.period && t.period.includes(monthStr));
      if (!hasPayrollForMonth && accrualDate >= (employee.hireDate || "2020-01-01")) {
        const salaryBase = Number(employee.salaryAmount || 0);
        const allowances = Number(employee.allowances || 0);
        const totalMonthSalary = salaryBase + allowances;
        if (totalMonthSalary > 0) {
          allTx.push({
            id: `accrual-${empId}-${monthStr}`,
            date: accrualDate,
            refNum: `SAL-${monthStr}`,
            type: "salary_accrual",
            typeLabel: "\u0631\u0627\u062A\u0628 \u0634\u0647\u0631\u064A \u062A\u0639\u0627\u0642\u062F\u064A",
            description: `\u0627\u0633\u062A\u062D\u0642\u0627\u0642 \u0631\u0627\u062A\u0628 \u0634\u0647\u0631 ${monthStr} (\u0623\u0633\u0627\u0633\u064A: ${salaryBase.toFixed(2)}${allowances > 0 ? ` + \u0628\u062F\u0644\u0627\u062A: ${allowances.toFixed(2)}` : ""})`,
            entitlement: totalMonthSalary,
            advance: 0,
            deduction: 0,
            disbursement: 0,
            period: monthStr
          });
        }
      }
    }
  }
  allTx.sort((a, b) => a.date.localeCompare(b.date));
  let periodOpeningBalance = 0;
  const filteredTx = [];
  allTx.forEach((tx) => {
    const netChange = tx.entitlement - (tx.advance + tx.deduction + tx.disbursement);
    if (fromDate && tx.date < fromDate) {
      periodOpeningBalance += netChange;
    } else if (!toDate || tx.date <= toDate) {
      filteredTx.push(tx);
    }
  });
  let running = periodOpeningBalance;
  let totalEntitlements = 0;
  let totalAdvances = 0;
  let totalDeductions = 0;
  let totalDisbursements = 0;
  const rows = [];
  filteredTx.forEach((tx) => {
    const netChange = tx.entitlement - (tx.advance + tx.deduction + tx.disbursement);
    running += netChange;
    totalEntitlements += tx.entitlement;
    totalAdvances += tx.advance;
    totalDeductions += tx.deduction;
    totalDisbursements += tx.disbursement;
    rows.push({
      id: tx.id,
      date: tx.date,
      referenceNumber: tx.refNum,
      type: tx.type,
      typeLabel: tx.typeLabel,
      description: tx.description,
      entitlement: tx.entitlement,
      advance: tx.advance,
      deduction: tx.deduction,
      disbursement: tx.disbursement,
      runningBalance: running,
      paymentMethod: tx.paymentMethod,
      period: tx.period,
      notes: tx.notes
    });
  });
  const totalDue = totalEntitlements;
  const totalPaid = totalAdvances + totalDeductions + totalDisbursements;
  return {
    employee,
    fromDate,
    toDate,
    openingBalance: periodOpeningBalance,
    rows,
    totalEntitlements,
    totalAdvances,
    totalDeductions,
    totalDisbursements,
    totalDue,
    totalPaid,
    closingBalance: running,
    statementDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
  };
}

// src/components/common/PrintHeader.tsx
import { Building2, MapPin, Hash } from "lucide-react";
import { jsx as jsx2, jsxs } from "react/jsx-runtime";
var PrintHeader = ({
  title,
  subtitle,
  docNumber,
  docDate,
  badge,
  badgeColor = "bg-slate-900 text-white",
  extraMeta,
  rightAction,
  qrCode,
  overrideSettings,
  className = "",
  showBorder = true
}) => {
  const { settings: contextSettings } = useAccounting();
  const settings = { ...contextSettings, ...overrideSettings || {} };
  const headerImageUrl = settings.headerImageUrl || settings.letterheadUrl || settings.headerImage || "";
  const logoUrl = settings.logoUrl || settings.logo || "";
  const businessName = settings.businessName || settings.name || "\u0627\u0644\u0645\u0646\u0634\u0623\u0629 \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629";
  const hasFullHeader = Boolean(headerImageUrl && headerImageUrl.trim());
  const hasLogo = Boolean(logoUrl && logoUrl.trim());
  const addressesList = (settings.addresses && settings.addresses.length > 0 ? settings.addresses : settings.address ? [settings.address] : []).filter((a) => a && a.trim());
  const phonesList = (settings.phones && settings.phones.length > 0 ? settings.phones : settings.phone ? [settings.phone] : []).filter((p) => p && p.trim());
  const maxPairs = Math.max(addressesList.length, phonesList.length);
  const pairedContactLines = [];
  for (let i = 0; i < maxPairs; i++) {
    const addr = addressesList[i];
    const ph = phonesList[i];
    if (addr && ph) {
      pairedContactLines.push(`${addr} - ${ph}`);
    } else if (addr) {
      pairedContactLines.push(addr);
    } else if (ph) {
      pairedContactLines.push(ph);
    }
  }
  if (hasFullHeader) {
    return /* @__PURE__ */ jsxs("div", { className: `print-header w-full mb-2 print:mb-1.5 print:block ${className}`, "data-component": "print-header", children: [
      /* @__PURE__ */ jsx2("div", { className: "w-full overflow-hidden rounded-lg border border-slate-200/60 print:border-none print:rounded-none bg-white", children: /* @__PURE__ */ jsx2(
        "img",
        {
          src: headerImageUrl,
          alt: businessName || "\u062A\u0631\u0648\u064A\u0633\u0629 \u0631\u0633\u0645\u064A\u0629",
          className: "w-full max-h-40 sm:max-h-48 md:max-h-56 object-contain object-center print:max-h-44 mx-auto block"
        }
      ) }),
      (title || docNumber || docDate || badge || extraMeta || qrCode) && /* @__PURE__ */ jsxs("div", { className: `mt-1 pt-1 pb-1 flex items-center justify-between gap-2 text-xs w-full ${showBorder ? "border-b-2 border-slate-900" : ""}`, children: [
        /* @__PURE__ */ jsx2("div", { className: "w-1/3 text-right font-mono text-xs text-slate-900 font-bold truncate", children: docNumber && /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-1", children: [
          /* @__PURE__ */ jsx2("span", { className: "text-slate-600 font-sans font-semibold text-xs", children: "\u0627\u0644\u0631\u0642\u0645:" }),
          /* @__PURE__ */ jsx2("strong", { className: "text-slate-950 font-black text-sm", children: docNumber })
        ] }) }),
        /* @__PURE__ */ jsxs("div", { className: "w-1/3 flex flex-col justify-center items-center", children: [
          title && /* @__PURE__ */ jsx2("div", { className: "bg-[#2b3a67] text-white border-2 border-[#2b3a67] font-black text-xs sm:text-sm px-6 py-0.5 rounded-xl text-center whitespace-nowrap inline-block tracking-wide shadow-xs", children: title }),
          badge && /* @__PURE__ */ jsx2("span", { className: `px-2 py-0.5 rounded text-[10px] font-bold mt-1 ${badgeColor}`, children: badge })
        ] }),
        /* @__PURE__ */ jsx2("div", { className: "w-1/3 text-left font-mono text-xs text-slate-900 font-bold truncate", children: docDate && /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-1", children: [
          /* @__PURE__ */ jsx2("span", { className: "text-slate-600 font-sans font-semibold text-xs", children: "\u0627\u0644\u062A\u0627\u0631\u064A\u062E:" }),
          /* @__PURE__ */ jsx2("span", { className: "text-slate-950 font-bold text-xs", children: docDate })
        ] }) })
      ] })
    ] });
  }
  return /* @__PURE__ */ jsxs("div", { className: `print-header w-full mb-2 print:mb-1.5 print:block ${showBorder ? "border-b-2 border-slate-900 pb-1.5" : ""} ${className}`, "data-component": "print-header", children: [
    /* @__PURE__ */ jsxs("div", { className: "flex flex-col sm:flex-row justify-between items-start gap-4", children: [
      /* @__PURE__ */ jsxs("div", { className: "flex items-start gap-3.5 flex-1 min-w-0", children: [
        hasLogo ? /* @__PURE__ */ jsx2("div", { className: "shrink-0 w-20 h-20 sm:w-24 sm:h-24 bg-white border border-slate-200 rounded-xl p-1.5 flex items-center justify-center shadow-2xs overflow-hidden", children: /* @__PURE__ */ jsx2(
          "img",
          {
            src: logoUrl,
            alt: businessName,
            className: "w-full h-full object-contain object-center"
          }
        ) }) : /* @__PURE__ */ jsxs("div", { className: "shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 flex flex-col items-center justify-center font-bold text-xs p-1 shadow-2xs", children: [
          /* @__PURE__ */ jsx2(Building2, { className: "w-6 h-6 mb-0.5 text-blue-600" }),
          /* @__PURE__ */ jsx2("span", { className: "text-[9px] text-center leading-tight truncate max-w-full", children: settings.logoText || "\u0627\u0644\u0646\u0648\u0631" })
        ] }),
        /* @__PURE__ */ jsxs("div", { className: "min-w-0 flex-1", children: [
          /* @__PURE__ */ jsx2("h1", { className: "text-lg sm:text-xl font-black text-slate-900 tracking-tight leading-snug", children: businessName }),
          settings.businessNameEn && /* @__PURE__ */ jsx2("p", { className: "text-xs sm:text-sm text-slate-600 font-bold font-mono mt-0.5 tracking-tight", children: settings.businessNameEn }),
          (settings.activityType || settings.description) && /* @__PURE__ */ jsx2("p", { className: "text-xs text-slate-600 font-medium mt-0.5", children: settings.activityType || settings.description }),
          /* @__PURE__ */ jsxs("div", { className: "flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-700 font-mono mt-1.5", children: [
            settings.taxNumber && settings.showTaxNumberInPrints !== false && /* @__PURE__ */ jsxs("span", { className: "inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200 font-bold", children: [
              /* @__PURE__ */ jsx2(Hash, { className: "w-3 h-3 text-slate-500" }),
              /* @__PURE__ */ jsxs("span", { children: [
                "\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0636\u0631\u064A\u0628\u064A: ",
                settings.taxNumber
              ] })
            ] }),
            (settings.crNumber || settings.commercialRegister) && settings.showCrNumberInPrints !== false && /* @__PURE__ */ jsx2("span", { className: "inline-flex items-center gap-1 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200", children: /* @__PURE__ */ jsxs("span", { children: [
              "\u0633.\u062A: ",
              settings.crNumber || settings.commercialRegister
            ] }) })
          ] }),
          pairedContactLines.length > 0 && /* @__PURE__ */ jsx2("div", { className: "space-y-0.5 text-[11px] text-slate-800 font-medium mt-1.5 font-sans", children: pairedContactLines.map((line, idx) => /* @__PURE__ */ jsxs("div", { className: "flex items-center gap-1.5 leading-tight", children: [
            /* @__PURE__ */ jsx2(MapPin, { className: "w-3.5 h-3.5 text-slate-500 shrink-0" }),
            /* @__PURE__ */ jsx2("span", { children: line })
          ] }, idx)) })
        ] })
      ] }),
      (qrCode || rightAction) && /* @__PURE__ */ jsxs("div", { className: "text-left shrink-0 flex flex-col items-end sm:min-w-[120px]", children: [
        qrCode && /* @__PURE__ */ jsx2("div", { className: "mt-1", children: qrCode }),
        rightAction && /* @__PURE__ */ jsx2("div", { className: "mt-1", children: rightAction })
      ] })
    ] }),
    (title || docNumber || docDate || badge || extraMeta) && /* @__PURE__ */ jsxs("div", { className: "mt-1.5 pt-1 pb-0.5 flex items-center justify-between gap-2 text-xs w-full", children: [
      /* @__PURE__ */ jsx2("div", { className: "w-1/3 text-right font-mono text-xs text-slate-900 font-bold truncate", children: docNumber && /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-1", children: [
        /* @__PURE__ */ jsx2("span", { className: "text-slate-600 font-sans font-semibold text-xs", children: "\u0627\u0644\u0631\u0642\u0645:" }),
        /* @__PURE__ */ jsx2("strong", { className: "text-slate-950 font-black text-sm", children: docNumber })
      ] }) }),
      /* @__PURE__ */ jsxs("div", { className: "w-1/3 flex flex-col justify-center items-center", children: [
        title && /* @__PURE__ */ jsx2("div", { className: "bg-[#2b3a67] text-white border-2 border-[#2b3a67] font-black text-xs sm:text-sm px-6 py-0.5 rounded-xl text-center whitespace-nowrap inline-block tracking-wide shadow-xs", children: title }),
        badge && /* @__PURE__ */ jsx2("span", { className: `px-2 py-0.5 rounded text-[10px] font-bold mt-1 ${badgeColor}`, children: badge })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: "w-1/3 text-left font-mono text-xs text-slate-900 font-bold truncate", children: [
        docDate && /* @__PURE__ */ jsxs("div", { className: "inline-flex items-center gap-1", children: [
          /* @__PURE__ */ jsx2("span", { className: "text-slate-600 font-sans font-semibold text-xs", children: "\u0627\u0644\u062A\u0627\u0631\u064A\u062E:" }),
          /* @__PURE__ */ jsx2("span", { className: "text-slate-950 font-bold text-xs", children: docDate })
        ] }),
        extraMeta
      ] })
    ] })
  ] });
};

// src/components/UnifiedPartyStatementDocument.tsx
import React2 from "react";

// src/utils/numberFormat.ts
var EASTERN_NUMERALS = {
  "\u0660": "0",
  "\u0661": "1",
  "\u0662": "2",
  "\u0663": "3",
  "\u0664": "4",
  "\u0665": "5",
  "\u0666": "6",
  "\u0667": "7",
  "\u0668": "8",
  "\u0669": "9",
  "\u06F0": "0",
  "\u06F1": "1",
  "\u06F2": "2",
  "\u06F3": "3",
  "\u06F4": "4",
  "\u06F5": "5",
  "\u06F6": "6",
  "\u06F7": "7",
  "\u06F8": "8",
  "\u06F9": "9",
  "\u060C": ",",
  "\u066B": ".",
  "\u066C": ","
};
function normalizeArabicDigits(input) {
  if (input === null || input === void 0) return "";
  const str = String(input);
  return str.replace(/[٠-٩۰-۹،٫٬]/g, (char) => EASTERN_NUMERALS[char] || char);
}
function formatNumber(value, options) {
  if (value === void 0 || value === null || value === "") return "0";
  const rawStr = normalizeArabicDigits(value);
  const num = typeof value === "number" ? value : parseFloat(rawStr);
  if (isNaN(num)) return "0";
  const opts = typeof options === "number" ? { minimumFractionDigits: options, maximumFractionDigits: options, useGrouping: true } : options;
  const minFraction = opts?.minimumFractionDigits !== void 0 ? opts.minimumFractionDigits : 0;
  const maxFraction = opts?.maximumFractionDigits !== void 0 ? opts.maximumFractionDigits : 2;
  const useGrouping = opts?.useGrouping !== false;
  return num.toLocaleString("en-US", {
    minimumFractionDigits: minFraction,
    maximumFractionDigits: maxFraction,
    useGrouping
  });
}

// src/utils/unitsOfMeasure.ts
function isSquareMeterUnit(unit, calculationType) {
  if (calculationType === "area") return true;
  if (!unit) return false;
  const clean2 = unit.trim().toLowerCase();
  return clean2 === "\u0645\xB2" || clean2 === "\u06452" || clean2 === "\u0645\u062A\u0631 \u0645\u0631\u0628\u0639" || clean2 === "\u0645\u062A\u0631 \u0645\u0631\u0628\u0639 (\u0645\xB2)" || clean2 === "\u0645\u062A\u0631\xB2" || clean2 === "\u0645\u062A\u06312" || clean2 === "\u0645.\u0645" || clean2 === "sqm" || clean2 === "m2" || clean2 === "square meter" || clean2.includes("\u0645\u062A\u0631 \u0645\u0631\u0628\u0639") || clean2.includes("\u0645\xB2");
}

// src/utils/invoiceDimensions.ts
function isDimensionalInvoiceItem(item) {
  if (item.hasDimensions === false) return false;
  if (item.hasDimensions === true) return true;
  return isSquareMeterUnit(item.unit, item.unitCalculationType);
}
function hasVisibleInvoiceDimensions(item) {
  return isDimensionalInvoiceItem(item) && (Number(item.length || 0) > 0 || Number(item.width || 0) > 0);
}
function displayDimension(value, isDimensional) {
  return isDimensional && value != null && Number(value) > 0 ? String(value) : "-";
}

// src/utils/dateUtils.ts
var formatDateDisplay = (dateStr) => {
  if (!dateStr) return "";
  const cleanDate = dateStr.includes("T") ? dateStr.split("T")[0] : dateStr;
  const normalized = cleanDate.replace(/[\/\.]/g, "-");
  const parts = normalized.split("-");
  if (parts.length === 3) {
    let day = "";
    let month = "";
    let year = "";
    if (parts[0].length === 4) {
      year = parts[0];
      month = parts[1];
      day = parts[2];
    } else if (parts[2].length === 4) {
      day = parts[0];
      month = parts[1];
      year = parts[2];
    } else {
      return cleanDate;
    }
    const dStr = day.padStart(2, "0");
    const mStr = month.padStart(2, "0");
    return `${dStr}/${mStr}/${year}`;
  }
  return dateStr;
};

// src/utils/tafqeet.ts
var ONES = ["", "\u0648\u0627\u062D\u062F", "\u0627\u062B\u0646\u0627\u0646", "\u062B\u0644\u0627\u062B\u0629", "\u0623\u0631\u0628\u0639\u0629", "\u062E\u0645\u0633\u0629", "\u0633\u062A\u0629", "\u0633\u0628\u0639\u0629", "\u062B\u0645\u0627\u0646\u064A\u0629", "\u062A\u0633\u0639\u0629", "\u0639\u0634\u0631\u0629", "\u0623\u062D\u062F \u0639\u0634\u0631", "\u0627\u062B\u0646\u0627 \u0639\u0634\u0631", "\u062B\u0644\u0627\u062B\u0629 \u0639\u0634\u0631", "\u0623\u0631\u0628\u0639\u0629 \u0639\u0634\u0631", "\u062E\u0645\u0633\u0629 \u0639\u0634\u0631", "\u0633\u062A\u0629 \u0639\u0634\u0631", "\u0633\u0628\u0639\u0629 \u0639\u0634\u0631", "\u062B\u0645\u0627\u0646\u064A\u0629 \u0639\u0634\u0631", "\u062A\u0633\u0639\u0629 \u0639\u0634\u0631"];
var TENS = ["", "", "\u0639\u0634\u0631\u0648\u0646", "\u062B\u0644\u0627\u062B\u0648\u0646", "\u0623\u0631\u0628\u0639\u0648\u0646", "\u062E\u0645\u0633\u0648\u0646", "\u0633\u062A\u0648\u0646", "\u0633\u0628\u0639\u0648\u0646", "\u062B\u0645\u0627\u0646\u0648\u0646", "\u062A\u0633\u0639\u0648\u0646"];
var HUNDREDS = ["", "\u0645\u0627\u0626\u0629", "\u0645\u0626\u062A\u0627\u0646", "\u062B\u0644\u0627\u062B\u0645\u0627\u0626\u0629", "\u0623\u0631\u0628\u0639\u0645\u0627\u0626\u0629", "\u062E\u0645\u0633\u0645\u0627\u0626\u0629", "\u0633\u062A\u0645\u0627\u0626\u0629", "\u0633\u0628\u0639\u0645\u0627\u0626\u0629", "\u062B\u0645\u0627\u0646\u0645\u0627\u0626\u0629", "\u062A\u0633\u0639\u0645\u0627\u0626\u0629"];
function convertGroup(num) {
  if (num === 0) return "";
  const h = Math.floor(num / 100);
  const remainder = num % 100;
  const parts = [];
  if (h > 0) {
    parts.push(HUNDREDS[h]);
  }
  if (remainder > 0) {
    if (remainder < 20) {
      parts.push(ONES[remainder]);
    } else {
      const o = remainder % 10;
      const t = Math.floor(remainder / 10);
      if (o > 0) {
        parts.push(`${ONES[o]} \u0648${TENS[t]}`);
      } else {
        parts.push(TENS[t]);
      }
    }
  }
  return parts.join(" \u0648");
}
function tafqeet(amount, currencyName = "\u0634\u064A\u0643\u0644", fractionalName = "\u0623\u063A\u0648\u0631\u0629") {
  if (amount === 0) return "\u0635\u0641\u0631 " + currencyName;
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const integerPart = Math.floor(absAmount);
  const decimalPart = Math.round((absAmount - integerPart) * 100);
  const billions = Math.floor(integerPart / 1e9);
  const millions = Math.floor(integerPart % 1e9 / 1e6);
  const thousands = Math.floor(integerPart % 1e6 / 1e3);
  const units = integerPart % 1e3;
  const parts = [];
  if (billions > 0) {
    if (billions === 1) parts.push("\u0645\u0644\u064A\u0627\u0631");
    else if (billions === 2) parts.push("\u0645\u0644\u064A\u0627\u0631\u0627\u0646");
    else if (billions >= 3 && billions <= 10) parts.push(`${convertGroup(billions)} \u0645\u0644\u064A\u0627\u0631\u0627\u062A`);
    else parts.push(`${convertGroup(billions)} \u0645\u0644\u064A\u0627\u0631`);
  }
  if (millions > 0) {
    if (millions === 1) parts.push("\u0645\u0644\u064A\u0648\u0646");
    else if (millions === 2) parts.push("\u0645\u0644\u064A\u0648\u0646\u0627\u0646");
    else if (millions >= 3 && millions <= 10) parts.push(`${convertGroup(millions)} \u0645\u0644\u0627\u064A\u064A\u0646`);
    else parts.push(`${convertGroup(millions)} \u0645\u0644\u064A\u0648\u0646`);
  }
  if (thousands > 0) {
    if (thousands === 1) parts.push("\u0623\u0644\u0641");
    else if (thousands === 2) parts.push("\u0623\u0644\u0641\u0627\u0646");
    else if (thousands >= 3 && thousands <= 10) parts.push(`${convertGroup(thousands)} \u0622\u0644\u0627\u0641`);
    else parts.push(`${convertGroup(thousands)} \u0623\u0644\u0641`);
  }
  if (units > 0) {
    parts.push(convertGroup(units));
  }
  let result = (isNegative ? "\u0633\u0627\u0644\u0628 " : "") + "\u0641\u0642\u0637 " + parts.join(" \u0648") + " " + currencyName;
  if (decimalPart > 0) {
    result += ` \u0648${convertGroup(decimalPart)} ${fractionalName}`;
  }
  result += " \u0644\u0627 \u063A\u064A\u0631.";
  return result;
}

// src/components/common/OfficialStamp.tsx
import { jsx as jsx3, jsxs as jsxs2 } from "react/jsx-runtime";
var OfficialStamp = ({
  stampUrl: propStampUrl,
  size = "3.5cm",
  className = "",
  rotation = -4,
  showDefaultIfEmpty = false
}) => {
  const { settings } = useAccounting();
  const stampUrl = propStampUrl ?? settings.stampUrl;
  const businessName = settings.businessName || settings.name || "\u0627\u0644\u0645\u0646\u0634\u0623\u0629 \u0627\u0644\u062A\u062C\u0627\u0631\u064A\u0629";
  if (!stampUrl && !showDefaultIfEmpty) {
    return null;
  }
  const isFixed4cm = size === "4cm";
  const isFixed3_5cm = size === "3.5cm";
  return /* @__PURE__ */ jsx3(
    "div",
    {
      className: `official-stamp inline-flex items-center justify-center relative select-none pointer-events-none rounded-full ${isFixed4cm ? "w-[4cm] h-[4cm] min-w-[4cm] min-h-[4cm] max-w-[4cm] max-h-[4cm]" : isFixed3_5cm ? "w-[3.5cm] h-[3.5cm] min-w-[3.5cm] min-h-[3.5cm] max-w-[3.5cm] max-h-[3.5cm]" : "w-24 h-24"} ${className}`,
      style: {
        transform: `rotate(${rotation}deg)`,
        mixBlendMode: "multiply"
      },
      "data-stamp-cm": "true",
      children: stampUrl ? /* @__PURE__ */ jsx3(
        "img",
        {
          src: stampUrl,
          alt: "Official Stamp",
          className: "w-full h-full object-contain rounded-full filter contrast-125 saturate-110 opacity-95 mix-blend-multiply",
          style: {
            maxWidth: "100%",
            maxHeight: "100%",
            filter: "contrast(1.2) saturate(1.15)"
          }
        }
      ) : showDefaultIfEmpty ? (
        /* Authentic Generated Circular Rubber Stamp */
        /* @__PURE__ */ jsxs2("div", { className: "w-full h-full rounded-full border-[3px] border-double border-blue-900/80 text-blue-900 flex flex-col items-center justify-between p-2.5 text-center font-bold relative bg-blue-50/20 shadow-xs", children: [
          /* @__PURE__ */ jsx3("div", { className: "w-[calc(100%-8px)] h-[calc(100%-8px)] rounded-full border border-dashed border-blue-800/60 absolute inset-1 m-auto pointer-events-none" }),
          /* @__PURE__ */ jsxs2("span", { className: "text-[8.5px] font-black tracking-tight text-blue-950 uppercase mt-0.5 line-clamp-1 px-2 z-10", children: [
            "\u2605 ",
            businessName,
            " \u2605"
          ] }),
          /* @__PURE__ */ jsxs2("div", { className: "flex flex-col items-center justify-center my-auto z-10", children: [
            /* @__PURE__ */ jsx3("span", { className: "text-[11px] font-black tracking-wider text-red-700/90 border-y border-red-700/60 py-0.5 px-3 uppercase bg-white/70", children: "\u0645\u0639\u062A\u0645\u062F OFFICIAL" }),
            /* @__PURE__ */ jsx3("span", { className: "text-[7.5px] font-mono font-bold text-blue-900 mt-0.5", children: settings.taxNumber ? `\u0636\u0631\u064A\u0628\u064A: ${settings.taxNumber}` : "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0645\u062D\u0627\u0633\u0628\u0629 \u0648\u0627\u0644\u0645\u0627\u0644\u064A\u0629" })
          ] }),
          /* @__PURE__ */ jsx3("span", { className: "text-[7.5px] font-mono text-blue-900/80 mb-0.5 z-10", children: (/* @__PURE__ */ new Date()).toISOString().split("T")[0] })
        ] })
      ) : null
    }
  );
};

// src/components/UnifiedPartyStatementDocument.tsx
import { Fragment, jsx as jsx4, jsxs as jsxs3 } from "react/jsx-runtime";
var parseThumbnails = (val) => {
  if (!val) return [];
  const trimmed = val.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
    }
  }
  return [val];
};
var UnifiedPartyStatementDocument = ({
  partyStatement,
  isCustomer,
  settings,
  clientDisplayName,
  fromDate,
  toDate,
  showItemDetails,
  showImageThumbnailsInStatement,
  setPreviewModalImage,
  filterType = "all"
}) => {
  const partyTafqeet = tafqeet(partyStatement.closingBalance, "\u0634\u064A\u0643\u0644", "\u0623\u063A\u0648\u0631\u0629");
  const displayedPartyRows = partyStatement.rows.filter(
    (row) => filterType === "debit" ? row.debit > 0 : filterType === "credit" ? row.credit > 0 : true
  );
  return /* @__PURE__ */ jsxs3(Fragment, { children: [
    /* @__PURE__ */ jsx4(PrintHeader, {}),
    /* @__PURE__ */ jsx4("div", { className: "border-b-2 border-slate-900 pb-2", children: /* @__PURE__ */ jsxs3("div", { className: "statement-document-heading text-center font-bold text-base mb-1.5 mt-2 text-slate-900 leading-relaxed", children: [
      isCustomer ? "\u0643\u0634\u0641 \u062D\u0633\u0627\u0628 \u0639\u0645\u064A\u0644 \u062A\u0641\u0635\u064A\u0644\u064A:" : "\u0643\u0634\u0641 \u062D\u0633\u0627\u0628 \u0645\u0648\u0631\u062F \u062A\u0641\u0635\u064A\u0644\u064A:",
      " ",
      /* @__PURE__ */ jsx4("span", { className: isCustomer ? "text-blue-900" : "text-rose-900", children: clientDisplayName }),
      /* @__PURE__ */ jsxs3("div", { className: "text-xs text-slate-600 mt-0.5 font-semibold", children: [
        "\u0645\u0646 \u062A\u0627\u0631\u064A\u062E: ",
        /* @__PURE__ */ jsx4("span", { className: "font-mono", children: fromDate || "\u0628\u062F\u0627\u064A\u0629 \u0627\u0644\u062A\u0639\u0627\u0645\u0644" }),
        " ",
        "\u0625\u0644\u0649 \u062A\u0627\u0631\u064A\u062E: ",
        /* @__PURE__ */ jsx4("span", { className: "font-mono", children: toDate || "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u064A\u0648\u0645" })
      ] })
    ] }) }),
    /* @__PURE__ */ jsxs3("div", { className: "space-y-3", children: [
      !isCustomer && /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-2 sm:grid-cols-5 gap-2", children: [
        /* @__PURE__ */ jsxs3("div", { className: "bg-slate-50 p-2 rounded-lg border border-slate-200", children: [
          /* @__PURE__ */ jsx4("span", { className: "text-[10px] text-slate-500 font-semibold block", children: "\u0631\u0635\u064A\u062F \u0623\u0648\u0644 \u0627\u0644\u0645\u062F\u0629 / \u0633\u0627\u0628\u0642:" }),
          /* @__PURE__ */ jsxs3("span", { className: "text-xs font-black font-mono text-slate-800", children: [
            formatNumber(partyStatement.openingBalance, 2),
            " ",
            settings.currency
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "bg-emerald-50/70 p-2 rounded-lg border border-emerald-200/80", children: [
          /* @__PURE__ */ jsx4("span", { className: "text-[10px] text-emerald-700 font-semibold block", children: isCustomer ? "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0633\u062D\u0648\u0628\u0627\u062A (\u0645\u062F\u064A\u0646):" : "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u062A\u0648\u0631\u064A\u062F\u0627\u062A (\u062F\u0627\u0626\u0646):" }),
          /* @__PURE__ */ jsxs3("span", { className: "text-xs font-black font-mono text-emerald-800", children: [
            formatNumber(isCustomer ? partyStatement.totalWithdrawals : partyStatement.totalCredit, 2),
            " ",
            settings.currency
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "bg-blue-50/70 p-2 rounded-lg border border-blue-200/80", children: [
          /* @__PURE__ */ jsx4("span", { className: "text-[10px] text-blue-700 font-semibold block", children: isCustomer ? "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0642\u0628\u0648\u0636\u0627\u062A (\u062F\u0627\u0626\u0646):" : "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0635\u0631\u0641 \u0648\u0627\u0644\u0645\u0633\u062F\u062F (\u0645\u062F\u064A\u0646):" }),
          /* @__PURE__ */ jsxs3("span", { className: "text-xs font-black font-mono text-blue-800", children: [
            formatNumber(isCustomer ? partyStatement.totalReceipts : partyStatement.totalDebit, 2),
            " ",
            settings.currency
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "bg-amber-50/70 p-2 rounded-lg border border-amber-200/80", children: [
          /* @__PURE__ */ jsx4("span", { className: "text-[10px] text-amber-700 font-semibold block", children: isCustomer ? "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0635\u0631\u0641 / \u0645\u0631\u062A\u062C\u0639\u0627\u062A:" : "\u0627\u0644\u0645\u0631\u062F\u0648\u062F\u0627\u062A \u0648\u0627\u0644\u0645\u0642\u0628\u0648\u0636\u0627\u062A:" }),
          /* @__PURE__ */ jsxs3("span", { className: "text-xs font-black font-mono text-amber-800", children: [
            formatNumber(isCustomer ? partyStatement.totalDisbursements : 0, 2),
            " ",
            settings.currency
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: `p-2 rounded-lg border ${partyStatement.closingBalance > 0 ? "bg-amber-50 border-amber-300 text-amber-900" : partyStatement.closingBalance < 0 ? "bg-rose-50 border-rose-300 text-rose-900" : "bg-emerald-50 border-emerald-300 text-emerald-900"}`, children: [
          /* @__PURE__ */ jsx4("span", { className: "text-[10px] font-semibold block", children: isCustomer ? partyStatement.closingBalance > 0 ? "\u0635\u0627\u0641\u064A \u0627\u0644\u0645\u062A\u0628\u0642\u064A \u0639\u0644\u0649 \u0627\u0644\u0639\u0645\u064A\u0644 (\u0645\u062F\u064A\u0646):" : partyStatement.closingBalance < 0 ? "\u0631\u0635\u064A\u062F \u062F\u0627\u0626\u0646 \u0644\u0644\u0639\u0645\u064A\u0644 (\u062F\u0627\u0626\u0646):" : "\u0627\u0644\u062D\u0633\u0627\u0628 \u0645\u062A\u0637\u0627\u0628\u0642 (\u0635\u0641\u0631):" : partyStatement.closingBalance > 0 ? "\u0635\u0627\u0641\u064A \u0645\u0633\u062A\u062D\u0642 \u0644\u0644\u0645\u0648\u0631\u062F (\u062F\u0627\u0626\u0646):" : partyStatement.closingBalance < 0 ? "\u0645\u0628\u0644\u063A \u0645\u062F\u064A\u0646 \u0644\u0644\u0645\u0648\u0631\u062F (\u0645\u062F\u064A\u0646):" : "\u0627\u0644\u062D\u0633\u0627\u0628 \u062E\u0627\u0644\u0635:" }),
          /* @__PURE__ */ jsxs3("span", { className: "text-xs font-black font-mono", children: [
            formatNumber(Math.abs(partyStatement.closingBalance), 2),
            " ",
            settings.currency
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx4("div", { className: "border border-slate-400 rounded-md overflow-x-auto shadow-2xs min-h-[440px] print:min-h-0 flex flex-col justify-between bg-white print:block print:overflow-visible print:border-none print:shadow-none", children: /* @__PURE__ */ jsxs3("table", { className: "w-full text-right report-table border-collapse h-full", children: [
        /* @__PURE__ */ jsx4("thead", { children: /* @__PURE__ */ jsxs3("tr", { className: "bg-slate-800 text-white font-bold border-b border-slate-900 print:bg-slate-200 print:text-slate-900", children: [
          /* @__PURE__ */ jsx4("th", { className: "w-8 min-w-8 text-center border-l border-slate-600 print:border-slate-400", children: "\u0645" }),
          /* @__PURE__ */ jsx4("th", { className: "w-24 min-w-24 text-center border-l border-slate-600 print:border-slate-400", children: "\u0627\u0644\u062A\u0627\u0631\u064A\u062E" }),
          /* @__PURE__ */ jsx4("th", { className: "border-l border-slate-600 print:border-slate-400", children: "\u0627\u0644\u0628\u064A\u0627\u0646 \u0648\u0627\u0644\u0634\u0631\u062D \u0648\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0643\u0627\u0645\u0644\u0629" }),
          /* @__PURE__ */ jsx4("th", { className: "w-[66px] min-w-[66px] text-center bg-rose-950/40 print:bg-rose-50 border-l border-slate-600 print:border-slate-400 whitespace-nowrap", children: "\u0645\u062F\u064A\u0646" }),
          /* @__PURE__ */ jsx4("th", { className: "w-[66px] min-w-[66px] text-center bg-emerald-950/40 print:bg-emerald-50 border-l border-slate-600 print:border-slate-400 whitespace-nowrap", children: "\u062F\u0627\u0626\u0646" }),
          /* @__PURE__ */ jsx4("th", { className: "w-[78px] min-w-[78px] text-center bg-slate-700 print:bg-slate-300 whitespace-nowrap", children: "\u0631\u0635\u064A\u062F" })
        ] }) }),
        /* @__PURE__ */ jsxs3("tbody", { className: "divide-y divide-slate-200 font-mono", children: [
          /* @__PURE__ */ jsxs3("tr", { className: "bg-slate-100/90 font-bold border-b border-slate-300 text-slate-800", children: [
            /* @__PURE__ */ jsx4("td", { className: "text-center text-slate-400 font-sans border-l border-slate-300", children: "-" }),
            /* @__PURE__ */ jsx4("td", { className: "text-center text-slate-600 font-mono border-l border-slate-300", children: fromDate || "\u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u0633\u0627\u0628\u0642" }),
            /* @__PURE__ */ jsxs3("td", { className: "font-sans text-slate-700 font-semibold border-l border-slate-300", children: [
              "\u0631\u0635\u064A\u062F \u0633\u0627\u0628\u0642 - \u0631\u0635\u064A\u062F \u0627\u0644\u062D\u0633\u0627\u0628 \u0627\u0644\u0627\u0641\u062A\u062A\u0627\u062D\u064A \u0627\u0644\u0633\u0627\u0628\u0642 (\u0645\u0627 \u0642\u0628\u0644 \u062A\u0627\u0631\u064A\u062E ",
              fromDate || "\u0628\u062F\u0621 \u0627\u0644\u062D\u0631\u0643\u0629",
              ")"
            ] }),
            /* @__PURE__ */ jsx4("td", { className: "text-left font-bold text-slate-700 font-mono whitespace-nowrap border-l border-slate-300", children: partyStatement.openingBalance > 0 ? partyStatement.openingBalance.toFixed(2) : "-" }),
            /* @__PURE__ */ jsx4("td", { className: "text-left font-bold text-slate-700 font-mono whitespace-nowrap border-l border-slate-300", children: partyStatement.openingBalance < 0 ? Math.abs(partyStatement.openingBalance).toFixed(2) : "-" }),
            /* @__PURE__ */ jsx4("td", { className: "text-left font-black text-slate-950 bg-slate-100 font-mono whitespace-nowrap", children: partyStatement.openingBalance.toFixed(2) })
          ] }),
          displayedPartyRows.length === 0 ? /* @__PURE__ */ jsx4("tr", { children: /* @__PURE__ */ jsx4("td", { colSpan: 6, className: "py-8 text-center text-slate-400 font-sans font-bold", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u062D\u0631\u0643\u0627\u062A \u0645\u0627\u0644\u064A\u0629 \u0645\u0633\u062C\u0644\u0629 \u062E\u0644\u0627\u0644 \u0647\u0630\u0647 \u0627\u0644\u0641\u062A\u0631\u0629 \u0627\u0644\u0645\u062D\u062F\u062F\u0629." }) }) : displayedPartyRows.map((row, idx) => {
            const typeLabel = row.typeLabel || (row.type === "invoice" ? "\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0628\u064A\u0639\u0627\u062A" : row.type === "receipt" ? "\u0633\u0646\u062F \u0642\u0628\u0636" : row.type === "payment" ? "\u0633\u0646\u062F \u0635\u0631\u0641" : row.type === "purchase" ? "\u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0634\u062A\u0631\u064A\u0627\u062A" : row.type === "sales_return" ? "\u0645\u0631\u062F\u0648\u062F\u0627\u062A \u0645\u0628\u064A\u0639\u0627\u062A" : row.type === "purchase_return" ? "\u0645\u0631\u062F\u0648\u062F\u0627\u062A \u0645\u0634\u062A\u0631\u064A\u0627\u062A" : row.type === "clearance" ? "\u0645\u0642\u0627\u0635\u0629 \u062F\u064A\u0648\u0646" : row.type === "opening" ? "\u0631\u0635\u064A\u062F \u0633\u0627\u0628\u0642" : "\u062D\u0631\u0643\u0629 \u0645\u0627\u0644\u064A\u0629");
            let note = "";
            if (row.type === "invoice") {
              if (row.invoiceNotes) {
                note = row.invoiceNotes;
                if (row.subCustomerName) note += ` [\u0627\u0644\u0632\u0628\u0648\u0646 \u0627\u0644\u0641\u0631\u0639\u064A: ${row.subCustomerName}]`;
              } else if (row.subCustomerName) {
                note = `[\u0627\u0644\u0632\u0628\u0648\u0646 \u0627\u0644\u0641\u0631\u0639\u064A: ${row.subCustomerName}]`;
              } else if (row.description) {
                const cleaned = row.description.replace(/^فاتورة مبيعات\s*(\([^)]*\))?\s*(-\s*)?/, "").replace(/-\s*إجمالي\s*[\d,.]+/gi, "").replace(/إجمالي\s*[\d,.]+/gi, "").replace(/-\s*total\s*[\d,.]+/gi, "").trim();
                note = cleaned;
              }
            } else if (row.type === "purchase") {
              if (row.invoiceNotes) {
                note = row.invoiceNotes;
              } else if (row.description) {
                const cleaned = row.description.replace(/^فاتورة مشتريات\s*(\([^)]*\))?\s*(-\s*)?/, "").replace(/-\s*إجمالي\s*[\d,.]+/gi, "").replace(/إجمالي\s*[\d,.]+/gi, "").trim();
                note = cleaned;
              }
            } else if (row.type === "receipt") {
              const rawNote = row.voucherNotes || row.description || "";
              note = rawNote.replace(/^سند قبض\s*(نقدية|شيك|تحويل)?\s*(-\s*)?/, "");
            } else if (row.type === "payment") {
              const rawNote = row.voucherNotes || row.description || "";
              note = rawNote.replace(/^سند صرف\s*(نقدية|شيك|تحويل)?\s*(-\s*)?/, "");
            } else if (row.type === "sales_return" || row.type === "purchase_return") {
              const rawNote = row.invoiceNotes || row.voucherNotes || row.description || "";
              note = rawNote.replace(/^مردودات (مبيعات|مشتريات)\s*(-\s*)?/, "");
            } else {
              note = row.description || "";
            }
            const trimmedNote = note.trim();
            const hasReceiptExtraDetails = row.type === "receipt" && Boolean(
              row.chequeNumber || row.chequeBank || row.chequeDueDate || row.transferReference || row.paymentMethodLabel && row.paymentMethodLabel !== "\u0646\u0642\u062F\u0627\u064B"
            );
            const hasPaymentExtraDetails = row.type === "payment" && Boolean(
              row.chequeNumber || row.chequeBank || row.chequeDueDate || row.transferReference || row.paymentMethodLabel && row.paymentMethodLabel !== "\u0646\u0642\u062F\u0627\u064B"
            );
            return /* @__PURE__ */ jsxs3(React2.Fragment, { children: [
              /* @__PURE__ */ jsxs3(
                "tr",
                {
                  className: row.type === "invoice" ? "statement-invoice-title font-bold" : "bg-white print:bg-white",
                  children: [
                    /* @__PURE__ */ jsx4("td", { className: "text-center text-slate-400 font-sans align-middle border-l border-slate-300", children: idx + 1 }),
                    /* @__PURE__ */ jsx4("td", { className: "text-slate-700 whitespace-nowrap text-center align-middle font-mono border-l border-slate-300", children: formatDateDisplay(row.date) }),
                    /* @__PURE__ */ jsxs3("td", { className: "font-sans text-slate-800 align-middle space-y-1 border-l border-slate-300", children: [
                      /* @__PURE__ */ jsxs3("div", { className: "font-bold text-slate-900 leading-tight flex flex-wrap items-center gap-1", children: [
                        /* @__PURE__ */ jsx4("span", { className: "text-slate-900 font-bold", children: typeLabel }),
                        row.referenceNumber && row.referenceNumber !== "OPENING" && /* @__PURE__ */ jsxs3(Fragment, { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-400 font-normal", children: "-" }),
                          /* @__PURE__ */ jsx4("span", { className: "font-mono font-bold text-slate-800", children: row.referenceNumber })
                        ] }),
                        trimmedNote && /* @__PURE__ */ jsxs3(Fragment, { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-400 font-normal", children: "-" }),
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-700 font-medium", children: trimmedNote })
                        ] })
                      ] }),
                      hasReceiptExtraDetails && /* @__PURE__ */ jsxs3("div", { className: "mt-1 p-1 bg-blue-50/60 border border-blue-200/80 rounded text-[11px] text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1", children: [
                        row.paymentMethodLabel && row.paymentMethodLabel !== "\u0646\u0642\u062F\u0627\u064B" && /* @__PURE__ */ jsxs3("div", { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-500", children: "\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u0642\u0628\u0636: " }),
                          /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-800", children: row.paymentMethodLabel })
                        ] }),
                        row.chequeNumber && /* @__PURE__ */ jsxs3("div", { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-500", children: "\u0631\u0642\u0645 \u0627\u0644\u0634\u064A\u0643: " }),
                          /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-900 font-mono", children: row.chequeNumber })
                        ] }),
                        row.chequeBank && /* @__PURE__ */ jsxs3("div", { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-500", children: "\u0627\u0644\u0628\u0646\u0643 \u0627\u0644\u0645\u0633\u062D\u0648\u0628 \u0639\u0644\u064A\u0647: " }),
                          /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-800", children: row.chequeBank })
                        ] }),
                        row.chequeDueDate && /* @__PURE__ */ jsxs3("div", { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-500", children: "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642: " }),
                          /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-900 font-mono", children: row.chequeDueDate })
                        ] }),
                        row.transferReference && /* @__PURE__ */ jsxs3("div", { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-500", children: "\u0631\u0642\u0645 \u0627\u0644\u062D\u0648\u0627\u0644\u0629: " }),
                          /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-900 font-mono", children: row.transferReference })
                        ] })
                      ] }),
                      row.type === "clearance" && (row.counterPartyName || row.reason) && /* @__PURE__ */ jsxs3("div", { className: "mt-1 p-1 bg-teal-50/60 border border-teal-200/80 rounded text-[11px] text-slate-700 flex flex-wrap items-center gap-2", children: [
                        row.counterPartyName && /* @__PURE__ */ jsxs3("div", { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-teal-900 font-bold", children: "\u0627\u0644\u0637\u0631\u0641 \u0627\u0644\u0645\u0642\u0627\u0628\u0644: " }),
                          /* @__PURE__ */ jsx4("span", { className: "font-medium text-slate-800", children: row.counterPartyName })
                        ] }),
                        row.reason && /* @__PURE__ */ jsxs3("div", { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-teal-900 font-bold", children: "\u0627\u0644\u0633\u0628\u0628: " }),
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-700", children: row.reason })
                        ] })
                      ] }),
                      hasPaymentExtraDetails && /* @__PURE__ */ jsxs3("div", { className: "mt-1 p-1 bg-amber-50/60 border border-amber-200/80 rounded text-[11px] text-slate-700 flex flex-wrap items-center gap-x-3 gap-y-1", children: [
                        row.paymentMethodLabel && row.paymentMethodLabel !== "\u0646\u0642\u062F\u0627\u064B" && /* @__PURE__ */ jsxs3("div", { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-500", children: "\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u0635\u0631\u0641: " }),
                          /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-800", children: row.paymentMethodLabel })
                        ] }),
                        row.chequeNumber && /* @__PURE__ */ jsxs3("div", { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-500", children: "\u0631\u0642\u0645 \u0627\u0644\u0634\u064A\u0643: " }),
                          /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-900 font-mono", children: row.chequeNumber })
                        ] }),
                        row.chequeBank && /* @__PURE__ */ jsxs3("div", { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-500", children: "\u0627\u0644\u0628\u0646\u0643: " }),
                          /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-800", children: row.chequeBank })
                        ] }),
                        row.chequeDueDate && /* @__PURE__ */ jsxs3("div", { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-500", children: "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642: " }),
                          /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-900 font-mono", children: row.chequeDueDate })
                        ] }),
                        row.transferReference && /* @__PURE__ */ jsxs3("div", { children: [
                          /* @__PURE__ */ jsx4("span", { className: "text-slate-500", children: "\u0631\u0642\u0645 \u0627\u0644\u062D\u0648\u0627\u0644\u0629: " }),
                          /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-900 font-mono", children: row.transferReference })
                        ] })
                      ] })
                    ] }),
                    /* @__PURE__ */ jsx4("td", { className: "text-left font-bold text-rose-700 font-mono align-middle whitespace-nowrap border-l border-slate-300", children: row.debit > 0 ? row.debit.toFixed(2) : "-" }),
                    /* @__PURE__ */ jsx4("td", { className: "text-left font-bold text-emerald-700 font-mono align-middle whitespace-nowrap border-l border-slate-300", children: row.credit > 0 ? row.credit.toFixed(2) : "-" }),
                    /* @__PURE__ */ jsx4("td", { className: "text-left font-black text-slate-900 bg-transparent font-mono align-middle whitespace-nowrap", children: row.runningBalance.toFixed(2) })
                  ]
                }
              ),
              showItemDetails && row.items && row.items.length > 0 && /* @__PURE__ */ jsx4("tr", { className: "bg-white print:bg-white print-allow-break", children: /* @__PURE__ */ jsx4("td", { colSpan: 6, className: "p-0 border-b border-slate-300 print-allow-break report-subtable-cell", children: /* @__PURE__ */ jsxs3("div", { className: "w-full bg-white print:border-none print:rounded-none print:overflow-visible print:shadow-none print:block", children: [
                /* @__PURE__ */ jsxs3("table", { className: "w-full text-right report-sub-table border-collapse", children: [
                  /* @__PURE__ */ jsx4("thead", { children: /* @__PURE__ */ jsxs3("tr", { className: "bg-slate-100 text-slate-800 font-bold border-b border-slate-300", children: [
                    /* @__PURE__ */ jsx4("th", { className: "text-center w-8 min-w-8 border-l border-slate-200", children: "\u0645" }),
                    /* @__PURE__ */ jsx4("th", { className: "border-l border-slate-200", children: "\u0627\u0644\u0635\u0646\u0641 \u0648\u0627\u0644\u0628\u064A\u0627\u0646" }),
                    /* @__PURE__ */ jsx4("th", { className: "text-center w-12 min-w-12 border-l border-slate-200", children: "\u0627\u0644\u0637\u0648\u0644" }),
                    /* @__PURE__ */ jsx4("th", { className: "text-center w-12 min-w-12 border-l border-slate-200", children: "\u0627\u0644\u0639\u0631\u0636" }),
                    /* @__PURE__ */ jsx4("th", { className: "text-center w-10 min-w-10 border-l border-slate-200", children: "\u0627\u0644\u0639\u062F\u062F" }),
                    /* @__PURE__ */ jsx4("th", { className: "text-center w-12 min-w-12 border-l border-slate-200", children: "\u0627\u0644\u0643\u0645\u064A\u0629" }),
                    /* @__PURE__ */ jsx4("th", { className: "text-left w-16 min-w-16 border-l border-slate-200", children: "\u0627\u0644\u0633\u0639\u0631" }),
                    /* @__PURE__ */ jsx4("th", { className: "text-left w-18 min-w-18", children: "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A" })
                  ] }) }),
                  /* @__PURE__ */ jsx4("tbody", { className: "divide-y divide-slate-200", children: row.items.map((it, iIdx) => /* @__PURE__ */ jsxs3("tr", { className: "hover:bg-slate-50", children: [
                    /* @__PURE__ */ jsx4("td", { className: "text-center font-mono font-bold text-slate-700 border-l border-slate-200 py-1", children: iIdx + 1 }),
                    /* @__PURE__ */ jsx4("td", { className: "font-bold text-slate-900 border-l border-slate-200", children: /* @__PURE__ */ jsxs3("div", { children: [
                      /* @__PURE__ */ jsx4("span", { children: it.itemName }),
                      (it.notes || it.description) && it.notes !== it.itemName && /* @__PURE__ */ jsxs3("span", { className: "text-slate-600 font-medium", children: [
                        " / ",
                        it.notes || it.description
                      ] })
                    ] }) }),
                    /* @__PURE__ */ jsx4("td", { className: "text-center font-mono text-slate-800 border-l border-slate-200", children: displayDimension(it.length, hasVisibleInvoiceDimensions(it)) }),
                    /* @__PURE__ */ jsx4("td", { className: "text-center font-mono text-slate-800 border-l border-slate-200", children: displayDimension(it.width, hasVisibleInvoiceDimensions(it)) }),
                    /* @__PURE__ */ jsx4("td", { className: "text-center font-mono font-bold text-slate-800 border-l border-slate-200", children: hasVisibleInvoiceDimensions(it) ? it.count || 1 : "-" }),
                    /* @__PURE__ */ jsx4("td", { className: "text-center font-mono font-bold text-slate-900 border-l border-slate-200", children: it.quantity }),
                    /* @__PURE__ */ jsx4("td", { className: "text-left font-mono text-slate-800 border-l border-slate-200", children: it.unitPrice.toFixed(2) }),
                    /* @__PURE__ */ jsx4("td", { className: "text-left font-mono font-bold text-slate-900", children: it.total.toFixed(2) })
                  ] }, iIdx)) }),
                  Boolean(row.discountTotal && row.discountTotal > 0 || row.taxAmount && row.taxAmount > 0) && /* @__PURE__ */ jsx4("tfoot", { className: "bg-slate-50 border-t border-slate-300 font-bold", children: /* @__PURE__ */ jsx4("tr", { children: /* @__PURE__ */ jsx4("td", { colSpan: 8, className: "py-1 px-1.5 text-left font-mono", children: /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-end gap-3 text-slate-800", children: [
                    row.discountTotal !== void 0 && row.discountTotal > 0 && /* @__PURE__ */ jsxs3("span", { className: "text-rose-600 font-bold", children: [
                      "\u062E\u0635\u0645 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629: -",
                      row.discountTotal.toFixed(2)
                    ] }),
                    row.taxAmount !== void 0 && row.taxAmount > 0 && /* @__PURE__ */ jsxs3("span", { className: "text-slate-600", children: [
                      "\u0627\u0644\u0636\u0631\u064A\u0628\u0629: +",
                      row.taxAmount.toFixed(2)
                    ] })
                  ] }) }) }) })
                ] }),
                row.type === "invoice" && /* @__PURE__ */ jsx4("div", { className: "invoice-financial-strip grid grid-cols-6 items-center gap-x-1 border-t border-slate-300 bg-white px-1 py-1 font-bold text-slate-900", dir: "rtl", children: [
                  ["\u0642\u0628\u0644 \u0627\u0644\u062E\u0635\u0645", row.subtotal ?? row.items.reduce((total, item) => total + item.total, 0)],
                  ["\u0627\u0644\u062E\u0635\u0645", row.discountTotal ?? 0],
                  ["\u0627\u0644\u0636\u0631\u064A\u0628\u0629", row.taxAmount ?? 0],
                  ["\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A", row.totalAmount ?? row.items.reduce((total, item) => total + item.total, 0)],
                  ["\u0627\u0644\u0645\u062F\u0641\u0648\u0639", row.paidAmount ?? 0],
                  ["\u0627\u0644\u0645\u062A\u0628\u0642\u064A", row.remainingAmount ?? (row.totalAmount ?? row.items.reduce((total, item) => total + item.total, 0)) - (row.paidAmount ?? 0)]
                ].map(([label, amount]) => /* @__PURE__ */ jsxs3("span", { className: "inline-flex items-center gap-1 whitespace-nowrap", children: [
                  /* @__PURE__ */ jsxs3("span", { className: "text-slate-600", children: [
                    label,
                    ":"
                  ] }),
                  /* @__PURE__ */ jsxs3("b", { className: "font-mono tabular-nums text-slate-950", dir: "ltr", children: [
                    amount.toFixed(2),
                    " ",
                    row.currencySymbol || settings.currency
                  ] })
                ] }, label)) }),
                showImageThumbnailsInStatement && row.items && row.items.some(
                  (it) => it.imageThumbnail || it.attachments && it.attachments.some((a) => a.data || a.type?.startsWith("image/"))
                ) && /* @__PURE__ */ jsx4("div", { className: "bg-white p-2 border-t border-slate-200", children: /* @__PURE__ */ jsx4("div", { className: "grid grid-cols-7 gap-2.5 w-full print:grid-cols-7", children: row.items.flatMap((it, itemIdx) => {
                  const thumbs = parseThumbnails(it.imageThumbnail);
                  const attImgs = (it.attachments || []).filter((a) => a.data || a.type?.startsWith("image/")).map((a) => a.data || "");
                  const allImgs = Array.from(new Set([...thumbs, ...attImgs].filter(Boolean)));
                  return allImgs.map((imgStr) => ({
                    imgStr,
                    itemName: it.itemName,
                    itemCode: it.itemCode,
                    itemSeq: itemIdx + 1
                  }));
                }).map((imgObj, idx2) => /* @__PURE__ */ jsx4(
                  "div",
                  {
                    onClick: () => setPreviewModalImage({ url: imgObj.imgStr, name: imgObj.itemName }),
                    className: "flex flex-col items-center bg-white border border-slate-200 hover:border-purple-500 hover:shadow-md rounded-lg p-1.5 shadow-2xs w-full cursor-pointer transition-all group",
                    title: `\u0645\u0639\u0627\u064A\u0646\u0629 \u0648\u062A\u0643\u0628\u064A\u0631 \u0635\u0648\u0631\u0629 "${imgObj.itemName}" (\u0628\u0646\u062F #${imgObj.itemSeq})`,
                    children: /* @__PURE__ */ jsxs3("div", { className: "relative w-full aspect-square rounded-md overflow-hidden border border-slate-200 bg-slate-50 flex items-center justify-center p-0.5", children: [
                      /* @__PURE__ */ jsxs3("span", { className: "absolute top-0.5 right-0.5 bg-slate-900/80 text-white text-[8px] font-mono font-black px-1 rounded-xs z-10 print:bg-slate-800", children: [
                        "#",
                        imgObj.itemSeq
                      ] }),
                      /* @__PURE__ */ jsx4(
                        "img",
                        {
                          src: imgObj.imgStr,
                          alt: imgObj.itemName,
                          className: "max-w-full max-h-full object-contain group-hover:scale-105 transition-transform duration-200",
                          onError: (e) => {
                            e.currentTarget.style.display = "none";
                          }
                        }
                      )
                    ] })
                  },
                  idx2
                )) }) })
              ] }) }) })
            ] }, `${row.id || "party-row"}-${idx}`);
          })
        ] }),
        /* @__PURE__ */ jsx4("tfoot", { children: /* @__PURE__ */ jsxs3("tr", { className: "bg-slate-100 font-bold border-t border-slate-300 text-slate-900", children: [
          /* @__PURE__ */ jsx4("td", { colSpan: 3, className: "text-left font-sans", children: "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0639\u0627\u0645 \u0644\u0644\u062D\u0631\u0643\u0627\u062A \u0628\u0627\u0644\u0641\u062A\u0631\u0629:" }),
          /* @__PURE__ */ jsx4("td", { className: "text-left font-mono text-rose-800 font-black whitespace-nowrap", children: partyStatement.totalDebit.toFixed(2) }),
          /* @__PURE__ */ jsx4("td", { className: "text-left font-mono text-emerald-800 font-black whitespace-nowrap", children: partyStatement.totalCredit.toFixed(2) }),
          /* @__PURE__ */ jsxs3("td", { className: "text-left font-mono text-slate-900 font-black bg-slate-200/80 whitespace-nowrap", children: [
            partyStatement.closingBalance.toFixed(2),
            " ",
            settings.currency
          ] })
        ] }) })
      ] }) }),
      /* @__PURE__ */ jsxs3("div", { className: "mt-2 p-1.5 bg-slate-50 border border-slate-400 rounded-md space-y-1.5 shadow-2xs print:border-slate-300", children: [
        /* @__PURE__ */ jsxs3("div", { className: "grid grid-cols-4 gap-1.5 text-[10px]", children: [
          /* @__PURE__ */ jsxs3("div", { className: "bg-white border border-slate-300 rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs", children: [
            /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-700 text-[10px] whitespace-nowrap", children: "\u0631\u0635\u064A\u062F \u0633\u0627\u0628\u0642:" }),
            /* @__PURE__ */ jsxs3("div", { className: "font-black font-mono text-slate-900 text-[11px] flex items-center gap-1 whitespace-nowrap", children: [
              /* @__PURE__ */ jsx4("span", { children: partyStatement.openingBalance.toFixed(2) }),
              /* @__PURE__ */ jsx4("span", { className: "text-[9px] font-sans font-bold text-slate-500", children: settings.currency })
            ] })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: `bg-white border ${isCustomer ? "border-rose-300" : "border-emerald-300"} rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs`, children: [
            /* @__PURE__ */ jsx4("span", { className: `font-bold text-[10px] whitespace-nowrap ${isCustomer ? "text-rose-900" : "text-emerald-900"}`, children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0645\u062F\u064A\u0646:" }),
            /* @__PURE__ */ jsxs3("div", { className: `font-black font-mono text-[11px] ${isCustomer ? "text-rose-700" : "text-emerald-700"} flex items-center gap-1 whitespace-nowrap`, children: [
              /* @__PURE__ */ jsx4("span", { children: partyStatement.totalDebit.toFixed(2) }),
              /* @__PURE__ */ jsx4("span", { className: "text-[9px] font-sans font-bold opacity-75", children: settings.currency })
            ] })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: `bg-white border ${isCustomer ? "border-emerald-300" : "border-rose-300"} rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs`, children: [
            /* @__PURE__ */ jsx4("span", { className: `font-bold text-[10px] whitespace-nowrap ${isCustomer ? "text-emerald-900" : "text-rose-900"}`, children: "\u0625\u062C\u0645\u0627\u0644\u064A \u062F\u0627\u0626\u0646:" }),
            /* @__PURE__ */ jsxs3("div", { className: `font-black font-mono text-[11px] ${isCustomer ? "text-emerald-700" : "text-rose-700"} flex items-center gap-1 whitespace-nowrap`, children: [
              /* @__PURE__ */ jsx4("span", { children: partyStatement.totalCredit.toFixed(2) }),
              /* @__PURE__ */ jsx4("span", { className: "text-[9px] font-sans font-bold opacity-75", children: settings.currency })
            ] })
          ] }),
          /* @__PURE__ */ jsxs3("div", { className: `bg-white border rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs ${partyStatement.closingBalance > 0 ? isCustomer ? "border-amber-400 bg-amber-50/20" : "border-rose-400 bg-rose-50/20" : partyStatement.closingBalance < 0 ? isCustomer ? "border-blue-400 bg-blue-50/20" : "border-emerald-400 bg-emerald-50/20" : "border-slate-300"}`, children: [
            /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-900 text-[10px] whitespace-nowrap", children: "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A:" }),
            /* @__PURE__ */ jsxs3("div", { className: `font-black font-mono text-[11px] flex items-center gap-1 whitespace-nowrap ${partyStatement.closingBalance > 0 ? isCustomer ? "text-amber-700" : "text-rose-700" : partyStatement.closingBalance < 0 ? isCustomer ? "text-blue-700" : "text-emerald-700" : "text-slate-800"}`, children: [
              /* @__PURE__ */ jsx4("span", { children: Math.abs(partyStatement.closingBalance).toFixed(2) }),
              /* @__PURE__ */ jsx4("span", { className: "text-[9px] font-sans font-bold opacity-75", children: settings.currency }),
              /* @__PURE__ */ jsxs3("span", { className: "text-[9.5px] font-sans font-bold", children: [
                "(",
                isCustomer ? partyStatement.closingBalance > 0 ? "\u0645\u062F\u064A\u0646" : partyStatement.closingBalance < 0 ? "\u062F\u0627\u0626\u0646" : "\u0645\u062A\u0632\u0646" : partyStatement.closingBalance > 0 ? "\u062F\u0627\u0626\u0646" : partyStatement.closingBalance < 0 ? "\u0645\u062F\u064A\u0646" : "\u0645\u062A\u0632\u0646",
                ")"
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "bg-white p-1.5 rounded border border-slate-200", children: [
          /* @__PURE__ */ jsxs3("div", { className: "flex items-center justify-between text-[10.5px] mb-0.5", children: [
            /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-700", children: "\u0627\u0644\u0645\u0628\u0644\u063A \u0643\u062A\u0627\u0628\u0629 \u0648\u062A\u0641\u0642\u064A\u0637\u0627\u064B:" }),
            /* @__PURE__ */ jsxs3("span", { className: "font-bold text-slate-900 font-mono text-[11px]", children: [
              "\u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A (",
              isCustomer ? partyStatement.closingBalance > 0 ? "\u0645\u062F\u064A\u0646" : partyStatement.closingBalance < 0 ? "\u062F\u0627\u0626\u0646" : "\u0645\u062A\u0632\u0646" : partyStatement.closingBalance > 0 ? "\u062F\u0627\u0626\u0646" : partyStatement.closingBalance < 0 ? "\u0645\u062F\u064A\u0646" : "\u0645\u062A\u0632\u0646",
              "): ",
              Math.abs(partyStatement.closingBalance).toFixed(2),
              " ",
              settings.currency
            ] })
          ] }),
          /* @__PURE__ */ jsx4("div", { className: "text-[10.5px] font-semibold text-slate-800 bg-slate-50 p-1 rounded border border-slate-200 font-arabic", children: partyTafqeet })
        ] })
      ] }),
      isCustomer ? /* @__PURE__ */ jsx4("div", { className: "statement-stamp-only flex justify-start pt-3 mt-3 border-t border-slate-300", dir: "ltr", children: /* @__PURE__ */ jsxs3("div", { className: "relative w-[4.3cm] h-[4.3cm] flex items-center justify-center", dir: "rtl", children: [
        /* @__PURE__ */ jsx4("span", { className: "absolute inset-x-0 bottom-[0.85cm] z-0 text-center text-[11px] font-bold text-slate-600", children: "\u0627\u0644\u062E\u062A\u0645 \u0648\u0627\u0644\u062A\u0648\u0642\u064A\u0639" }),
        settings.stampUrl && /* @__PURE__ */ jsx4("div", { className: "absolute inset-0 z-10 flex items-center justify-center", children: /* @__PURE__ */ jsx4(OfficialStamp, { size: "3.5cm" }) }),
        settings.signatureUrl && /* @__PURE__ */ jsx4(
          "img",
          {
            src: settings.signatureUrl,
            alt: "Signature",
            className: "absolute bottom-[0.8cm] left-1/2 z-20 max-h-12 max-w-[120px] -translate-x-1/2 object-contain mix-blend-multiply opacity-85 pointer-events-none"
          }
        )
      ] }) }) : /* @__PURE__ */ jsx4(Fragment, { children: /* @__PURE__ */ jsxs3("div", { className: "pt-4 border-t border-slate-300 grid grid-cols-3 gap-4 text-center text-[10px] mt-4", children: [
        /* @__PURE__ */ jsxs3("div", { className: "space-y-4 flex flex-col items-center justify-end", children: [
          /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-700 block mb-auto", children: "\u0625\u0639\u062F\u0627\u062F \u0648\u062A\u062F\u0642\u064A\u0642 \u0627\u0644\u0645\u062D\u0627\u0633\u0628" }),
          /* @__PURE__ */ jsx4("div", { className: "border-b border-dashed border-slate-400 w-28 mx-auto mt-6" }),
          /* @__PURE__ */ jsx4("span", { className: "text-[10px] text-slate-400 block font-mono", children: "\u0627\u0644\u062A\u0648\u0642\u064A\u0639 \u0648\u0627\u0644\u062A\u0627\u0631\u064A\u062E" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "space-y-4 flex flex-col items-center justify-end", children: [
          /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-700 block mb-auto", children: "\u062A\u0648\u0642\u064A\u0639 \u0648\u0625\u0642\u0631\u0627\u0631 \u0627\u0644\u0645\u0648\u0638\u0641 \u0628\u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629" }),
          /* @__PURE__ */ jsx4("div", { className: "border-b border-dashed border-slate-400 w-28 mx-auto mt-6" }),
          /* @__PURE__ */ jsx4("span", { className: "text-[10px] text-slate-400 block font-mono", children: "\u0627\u0644\u0645\u0648\u0638\u0641" })
        ] }),
        /* @__PURE__ */ jsxs3("div", { className: "space-y-2 flex flex-col items-center justify-end", children: [
          /* @__PURE__ */ jsx4("span", { className: "font-bold text-slate-700 block mb-auto", children: "\u0627\u0639\u062A\u0645\u0627\u062F \u0627\u0644\u0625\u062F\u0627\u0631\u0629 / \u0627\u0644\u062A\u0648\u0642\u064A\u0639" }),
          /* @__PURE__ */ jsx4("div", { className: "min-h-[4.2cm] flex items-center justify-center relative", children: settings.stampUrl ? /* @__PURE__ */ jsxs3("div", { className: "relative flex items-center justify-center", children: [
            /* @__PURE__ */ jsx4(OfficialStamp, { size: "3.5cm" }),
            settings.signatureUrl && /* @__PURE__ */ jsx4(
              "img",
              {
                src: settings.signatureUrl,
                alt: "Signature",
                className: "absolute bottom-1 max-h-12 max-w-[120px] object-contain mix-blend-multiply opacity-85 pointer-events-none"
              }
            )
          ] }) : settings.signatureUrl ? /* @__PURE__ */ jsx4(
            "img",
            {
              src: settings.signatureUrl,
              alt: "Signature",
              className: "max-h-16 max-w-[140px] object-contain mix-blend-multiply opacity-90"
            }
          ) : /* @__PURE__ */ jsx4("div", { className: "border-b border-dashed border-slate-400 w-36 mx-auto mt-10" }) }),
          /* @__PURE__ */ jsx4("span", { className: "text-[11px] text-slate-400 block font-mono mt-2", children: "\u0627\u0644\u062E\u062A\u0645 \u0648\u0627\u0644\u062A\u0648\u0642\u064A\u0639 \u0627\u0644\u0645\u0639\u062A\u0645\u062F" })
        ] })
      ] }) })
    ] })
  ] });
};

// src/components/common/ReportSignatures.tsx
import { jsx as jsx5, jsxs as jsxs4 } from "react/jsx-runtime";
var ReportSignatures = ({
  columns = 2,
  rightLabel = "\u062A\u0648\u0642\u064A\u0639 \u0648\u062E\u062A\u0645 \u0627\u0644\u0645\u0633\u062A\u0644\u0645",
  centerLabel = "\u062A\u0648\u0642\u064A\u0639 \u0627\u0644\u0639\u0645\u064A\u0644 / \u0627\u0644\u0645\u0633\u062A\u0644\u0645",
  leftLabel = "\u0627\u0644\u062E\u062A\u0645"
}) => {
  const { settings } = useAccounting();
  return /* @__PURE__ */ jsxs4("div", { className: `pt-6 border-t border-slate-300 grid gap-6 text-center text-xs mt-6 ${columns === 2 ? "grid-cols-2" : "grid-cols-3"}`, children: [
    /* @__PURE__ */ jsx5("div", { className: "space-y-4 flex flex-col items-center justify-end min-h-[80px]", children: /* @__PURE__ */ jsx5("span", { className: "font-bold text-slate-800 text-sm block mb-auto", children: rightLabel }) }),
    columns === 3 && /* @__PURE__ */ jsx5("div", { className: "space-y-4 flex flex-col items-center justify-end min-h-[80px]", children: /* @__PURE__ */ jsx5("span", { className: "font-bold text-slate-800 text-sm block mb-auto", children: centerLabel }) }),
    /* @__PURE__ */ jsxs4("div", { className: "space-y-2 flex flex-col items-center justify-end min-h-[80px]", children: [
      /* @__PURE__ */ jsx5("span", { className: "font-bold text-slate-800 text-sm block mb-auto", children: leftLabel }),
      /* @__PURE__ */ jsx5("div", { className: "min-h-[3.8cm] flex items-center justify-center relative", children: settings.stampUrl ? /* @__PURE__ */ jsxs4("div", { className: "relative flex items-center justify-center", children: [
        /* @__PURE__ */ jsx5(OfficialStamp, { size: "3.2cm" }),
        settings.signatureUrl && /* @__PURE__ */ jsx5(
          "img",
          {
            src: settings.signatureUrl,
            alt: "Signature",
            className: "absolute bottom-1 max-h-12 max-w-[120px] object-contain mix-blend-multiply opacity-85 pointer-events-none"
          }
        )
      ] }) : settings.signatureUrl ? /* @__PURE__ */ jsx5(
        "img",
        {
          src: settings.signatureUrl,
          alt: "Signature",
          className: "max-h-16 max-w-[140px] object-contain mix-blend-multiply opacity-90"
        }
      ) : null })
    ] })
  ] });
};

// src/components/common/AutocompleteCombobox.tsx
import { useState, useRef, useEffect as useEffect2, useMemo, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  User,
  Truck,
  Package,
  UserCheck,
  Plus,
  Check,
  ChevronDown,
  X
} from "lucide-react";
import { jsx as jsx6, jsxs as jsxs5 } from "react/jsx-runtime";
function normalizeText(text) {
  if (!text) return "";
  return text.toLowerCase().trim().replace(/[\u064B-\u065F\u0670]/g, "").replace(/[إأآا]/g, "\u0627").replace(/ة/g, "\u0647").replace(/[يى]/g, "\u064A").replace(/ؤ/g, "\u0648").replace(/ئ/g, "\u064A").replace(/[-_.,()/\\]/g, " ");
}
function HighlightMatch({ text, query }) {
  if (!query.trim() || !text) return /* @__PURE__ */ jsx6("span", { children: text });
  const normalizedText = normalizeText(text);
  const normalizedQuery = normalizeText(query);
  const index = normalizedText.indexOf(normalizedQuery);
  if (index === -1) {
    return /* @__PURE__ */ jsx6("span", { children: text });
  }
  const before = text.substring(0, index);
  const match = text.substring(index, index + query.length);
  const after = text.substring(index + query.length);
  return /* @__PURE__ */ jsxs5("span", { children: [
    before,
    /* @__PURE__ */ jsx6("span", { className: "bg-amber-200/80 text-amber-900 font-bold px-0.5 rounded-xs underline decoration-amber-500", children: match }),
    after
  ] });
}
var AutocompleteCombobox = ({
  items,
  selectedId,
  value,
  onSelect,
  onChangeText,
  onQuickAdd,
  entityType = "customer",
  placeholder,
  disabled = false,
  required = false,
  className = "",
  inputClassName = "",
  showCode = true,
  autoFocus = false,
  clearOnFocus = false,
  inputRef: externalInputRef,
  id
}) => {
  const { addParty, addInventoryItem, addEmployee } = useAccounting();
  const [isOpen, setIsOpen] = useState(false);
  const [inputText, setInputText] = useState(value || "");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [coords, setCoords] = useState(null);
  const containerRef = useRef(null);
  const internalInputRef = useRef(null);
  const activeInputRef = externalInputRef || internalInputRef;
  const dropdownRef = useRef(null);
  useEffect2(() => {
    if (value !== void 0) {
      setInputText(value);
    } else if (selectedId) {
      const match = items.find((i) => i.id === selectedId);
      if (match) {
        setInputText(match.name);
      }
    }
  }, [value, selectedId, items]);
  const entityMeta = useMemo(() => {
    switch (entityType) {
      case "customer":
        return {
          label: "\u0639\u0645\u064A\u0644",
          plural: "\u0627\u0644\u0639\u0645\u0644\u0627\u0621",
          icon: User,
          defaultPlaceholder: "\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064A\u0644 \u0623\u0648 \u0631\u0642\u0645\u0647 \u0644\u0644\u0645\u0637\u0627\u0628\u0642\u0629...",
          quickAddLabel: "\u0625\u0636\u0627\u0641\u0629 \u0643\u0639\u0645\u064A\u0644 \u062C\u062F\u064A\u062F"
        };
      case "supplier":
        return {
          label: "\u0645\u0648\u0631\u062F",
          plural: "\u0627\u0644\u0645\u0648\u0631\u062F\u064A\u0646",
          icon: Truck,
          defaultPlaceholder: "\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0631\u062F \u0623\u0648 \u0643\u0648\u062F\u0647 \u0644\u0644\u0645\u0637\u0627\u0628\u0642\u0629...",
          quickAddLabel: "\u0625\u0636\u0627\u0641\u0629 \u0643\u0645\u0648\u0631\u062F \u062C\u062F\u064A\u062F"
        };
      case "item":
        return {
          label: "\u0635\u0646\u0641",
          plural: "\u0627\u0644\u0623\u0635\u0646\u0627\u0641",
          icon: Package,
          defaultPlaceholder: "\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641\u060C \u0627\u0644\u0628\u0627\u0631\u0643\u0648\u062F\u060C \u0623\u0648 \u0627\u0644\u0643\u0648\u062F...",
          quickAddLabel: "\u0625\u0636\u0627\u0641\u0629 \u0643\u0635\u0646\u0641 \u0645\u062E\u0632\u0646\u064A \u062C\u062F\u064A\u062F"
        };
      case "employee":
        return {
          label: "\u0645\u0648\u0638\u0641",
          plural: "\u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646",
          icon: UserCheck,
          defaultPlaceholder: "\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0638\u0641 \u0623\u0648 \u0648\u0638\u064A\u0641\u062A\u0647 \u0644\u0644\u0645\u0637\u0627\u0628\u0642\u0629...",
          quickAddLabel: "\u0625\u0636\u0627\u0641\u0629 \u0643\u0645\u0648\u0638\u0641 \u062C\u062F\u064A\u062F"
        };
      default:
        return {
          label: "\u0639\u0646\u0635\u0631",
          plural: "\u0627\u0644\u0639\u0646\u0627\u0635\u0631",
          icon: User,
          defaultPlaceholder: "\u0627\u0643\u062A\u0628 \u0644\u0644\u0628\u062D\u062B \u0648\u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629...",
          quickAddLabel: "\u0625\u0636\u0627\u0641\u0629 \u062C\u062F\u064A\u062F"
        };
    }
  }, [entityType]);
  const filteredItems = useMemo(() => {
    const rawQuery = inputText.trim();
    if (!rawQuery) {
      return items.slice(0, 40);
    }
    const normQuery = normalizeText(rawQuery);
    const tokens = normQuery.split(/\s+/).filter(Boolean);
    return items.map((item) => {
      const nameNorm = normalizeText(item.name || "");
      const codeNorm = normalizeText(item.code || "");
      const subNorm = normalizeText(item.subText || "");
      const extraNorm = normalizeText(item.extraSearchCorpus || "");
      const fullCorpus = `${nameNorm} ${codeNorm} ${subNorm} ${extraNorm}`;
      const matchesAll = tokens.every((token) => fullCorpus.includes(token));
      if (!matchesAll) return null;
      let score = 10;
      if (nameNorm.startsWith(normQuery)) score += 60;
      else if (nameNorm.includes(normQuery)) score += 35;
      if (codeNorm.startsWith(normQuery)) score += 50;
      return { item, score };
    }).filter((entry) => entry !== null).sort((a, b) => b.score - a.score).map((entry) => entry.item);
  }, [items, inputText]);
  const exactMatchExists = useMemo(() => {
    const norm = normalizeText(inputText);
    if (!norm) return true;
    return items.some((i) => normalizeText(i.name) === norm);
  }, [items, inputText]);
  const updatePosition = useCallback(() => {
    if (!activeInputRef.current) return;
    const rect = activeInputRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estimatedHeight = 280;
    const showAbove = spaceBelow < estimatedHeight && rect.top > estimatedHeight;
    setCoords({
      top: showAbove ? rect.top - 6 : rect.bottom + 4,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - 320)),
      width: Math.max(rect.width, 280),
      showAbove
    });
  }, []);
  useEffect2(() => {
    if (!isOpen) return;
    updatePosition();
    const handleResizeScroll = () => updatePosition();
    window.addEventListener("scroll", handleResizeScroll, true);
    window.addEventListener("resize", handleResizeScroll);
    return () => {
      window.removeEventListener("scroll", handleResizeScroll, true);
      window.removeEventListener("resize", handleResizeScroll);
    };
  }, [isOpen, updatePosition]);
  useEffect2(() => {
    if (!isOpen) return;
    const handleClickOutside = (e) => {
      const target = e.target;
      if (containerRef.current && !containerRef.current.contains(target) && dropdownRef.current && !dropdownRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);
  const handleSelect = (item) => {
    setInputText(item.name);
    if (onChangeText) onChangeText(item.name);
    onSelect(item);
    setIsOpen(false);
    setHighlightedIndex(-1);
  };
  const handlePerformQuickAdd = async () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    if (onQuickAdd) {
      await onQuickAdd(trimmed);
      setIsOpen(false);
      return;
    }
    try {
      if (entityType === "customer" || entityType === "party") {
        const created = addParty({
          name: trimmed,
          type: "customer",
          phone: "",
          address: "",
          initialBalance: 0
        });
        const option = {
          id: created.id,
          name: created.name,
          code: created.code,
          subText: "\u0639\u0645\u064A\u0644 \u062C\u062F\u064A\u062F \u062A\u0645 \u0625\u0646\u0634\u0627\u0624\u0647 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B",
          raw: created
        };
        handleSelect(option);
      } else if (entityType === "supplier") {
        const created = addParty({
          name: trimmed,
          type: "supplier",
          phone: "",
          address: "",
          initialBalance: 0
        });
        const option = {
          id: created.id,
          name: created.name,
          code: created.code,
          subText: "\u0645\u0648\u0631\u062F \u062C\u062F\u064A\u062F \u062A\u0645 \u0625\u0646\u0634\u0627\u0624\u0647 \u062A\u0644\u0642\u0627\u0626\u064A\u0627\u064B",
          raw: created
        };
        handleSelect(option);
      } else if (entityType === "item") {
        const created = addInventoryItem({
          name: trimmed,
          code: "",
          category: "\u062E\u0627\u0645\u0627\u062A \u0648\u0645\u0633\u062A\u0644\u0632\u0645\u0627\u062A \u0639\u0627\u0645\u0629",
          unit: "\u0642\u0637\u0639\u0629",
          purchasePrice: 0,
          retailPrice: 0,
          wholesalePrice: 0,
          stockQuantity: 0,
          minStockLevel: 5
        });
        const option = {
          id: created.id,
          name: created.name,
          code: created.code,
          subText: "\u0635\u0646\u0641 \u062C\u062F\u064A\u062F \u0641\u064A \u0627\u0644\u0645\u062E\u0632\u0646",
          raw: created
        };
        handleSelect(option);
      } else if (entityType === "employee") {
        const created = addEmployee({
          name: trimmed,
          jobTitle: "\u0645\u0648\u0638\u0641",
          department: "\u0639\u0627\u0645",
          salaryType: "monthly",
          salaryAmount: 0,
          status: "active",
          hireDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        });
        const option = {
          id: created.id,
          name: created.name,
          code: created.id,
          subText: "\u0645\u0648\u0638\u0641 \u062C\u062F\u064A\u062F",
          raw: created
        };
        handleSelect(option);
      }
    } catch (err) {
      console.error("Error during quick add in combobox:", err);
    }
    setIsOpen(false);
  };
  const handleKeyDown = (e) => {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter") {
        setIsOpen(true);
        updatePosition();
        return;
      }
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const max = filteredItems.length + (!exactMatchExists && inputText.trim() ? 1 : 0);
        const next = prev + 1;
        return next >= max ? 0 : next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => {
        const max = filteredItems.length + (!exactMatchExists && inputText.trim() ? 1 : 0);
        const next = prev - 1;
        return next < 0 ? max - 1 : next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredItems.length) {
        handleSelect(filteredItems[highlightedIndex]);
      } else if (highlightedIndex === filteredItems.length && !exactMatchExists && inputText.trim()) {
        handlePerformQuickAdd();
      } else if (filteredItems.length === 1) {
        handleSelect(filteredItems[0]);
      } else if (!exactMatchExists && inputText.trim()) {
        handlePerformQuickAdd();
      } else {
        setIsOpen(false);
      }
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };
  const handleClear = (e) => {
    e.stopPropagation();
    setInputText("");
    if (onChangeText) onChangeText("");
    onSelect({ id: "", name: "" });
    setIsOpen(true);
    if (activeInputRef.current) activeInputRef.current.focus();
  };
  const IconComponent = entityMeta.icon;
  return /* @__PURE__ */ jsxs5("div", { ref: containerRef, className: `relative font-sans text-xs ${className}`, children: [
    /* @__PURE__ */ jsxs5("div", { className: "relative flex items-center", children: [
      /* @__PURE__ */ jsx6("div", { className: "absolute right-2.5 text-slate-400 pointer-events-none flex items-center", children: /* @__PURE__ */ jsx6(Search, { className: "w-3.5 h-3.5" }) }),
      /* @__PURE__ */ jsx6(
        "input",
        {
          ref: activeInputRef,
          id,
          type: "text",
          value: inputText,
          disabled,
          required,
          autoFocus,
          placeholder: placeholder || entityMeta.defaultPlaceholder,
          onChange: (e) => {
            const val = e.target.value;
            setInputText(val);
            if (onChangeText) onChangeText(val);
            setIsOpen(true);
            setHighlightedIndex(-1);
            updatePosition();
          },
          onFocus: (e) => {
            if (clearOnFocus) {
              setInputText("");
              if (onChangeText) onChangeText("");
              onSelect({ id: "", name: "" });
              try {
                e.currentTarget.value = "";
              } catch {
              }
              setIsOpen(true);
            } else if (!inputText) {
              setIsOpen(true);
            }
            updatePosition();
          },
          onKeyDown: handleKeyDown,
          className: `w-full bg-white border border-slate-300 rounded-lg pr-8 pl-14 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all font-medium disabled:bg-slate-100 disabled:cursor-not-allowed ${inputClassName}`
        }
      ),
      /* @__PURE__ */ jsxs5("div", { className: "absolute left-1.5 flex items-center gap-0.5", children: [
        inputText && !disabled && /* @__PURE__ */ jsx6(
          "button",
          {
            type: "button",
            onClick: handleClear,
            className: "p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 cursor-pointer",
            title: "\u0645\u0633\u062D",
            children: /* @__PURE__ */ jsx6(X, { className: "w-3 h-3" })
          }
        ),
        /* @__PURE__ */ jsx6(
          "button",
          {
            type: "button",
            disabled,
            onClick: () => {
              if (!disabled) {
                setIsOpen((prev) => !prev);
                if (activeInputRef.current) activeInputRef.current.focus();
              }
            },
            className: "p-1 text-slate-400 hover:text-slate-600 rounded hover:bg-slate-100 cursor-pointer",
            title: `\u0639\u0631\u0636 \u0642\u0627\u0626\u0645\u0629 ${entityMeta.plural}`,
            children: /* @__PURE__ */ jsx6(ChevronDown, { className: `w-3.5 h-3.5 transition-transform duration-150 ${isOpen ? "rotate-180" : ""}` })
          }
        )
      ] })
    ] }),
    isOpen && coords && createPortal(
      /* @__PURE__ */ jsxs5(
        "div",
        {
          ref: dropdownRef,
          style: {
            position: "fixed",
            top: coords.showAbove ? void 0 : coords.top,
            bottom: coords.showAbove ? window.innerHeight - coords.top : void 0,
            left: coords.left,
            width: coords.width,
            zIndex: 99999
          },
          className: "bg-white rounded-xl shadow-2xl border border-slate-300 overflow-hidden flex flex-col text-xs font-sans animate-in fade-in zoom-in-95 duration-100",
          children: [
            /* @__PURE__ */ jsxs5("div", { className: "p-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-slate-600 text-[11px]", children: [
              /* @__PURE__ */ jsxs5("span", { className: "font-bold flex items-center gap-1.5", children: [
                /* @__PURE__ */ jsx6(IconComponent, { className: "w-3.5 h-3.5 text-blue-600" }),
                /* @__PURE__ */ jsx6("span", { children: "\u0646\u062A\u0627\u0626\u062C \u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629:" }),
                /* @__PURE__ */ jsx6("span", { className: "bg-blue-100 text-blue-800 font-mono px-1.5 py-0.5 rounded-full font-bold", children: filteredItems.length })
              ] }),
              !exactMatchExists && inputText.trim() && /* @__PURE__ */ jsxs5(
                "button",
                {
                  type: "button",
                  onClick: handlePerformQuickAdd,
                  className: "text-[10px] text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 font-bold px-2 py-0.5 rounded flex items-center gap-1 cursor-pointer transition-colors shadow-2xs",
                  title: `\u0625\u0636\u0627\u0641\u0629 "${inputText.trim()}" \u0645\u0628\u0627\u0634\u0631\u0629`,
                  children: [
                    /* @__PURE__ */ jsx6(Plus, { className: "w-3 h-3 text-emerald-600" }),
                    /* @__PURE__ */ jsx6("span", { children: "+ \u0625\u0636\u0627\u0641\u0629 \u0645\u0628\u0627\u0634\u0631\u0629" })
                  ]
                }
              )
            ] }),
            /* @__PURE__ */ jsxs5("div", { className: "max-h-60 overflow-y-auto divide-y divide-slate-100", children: [
              filteredItems.length > 0 ? filteredItems.map((item, idx) => {
                const isSelected = item.id === selectedId;
                const isHighlighted = idx === highlightedIndex;
                return /* @__PURE__ */ jsxs5(
                  "div",
                  {
                    onClick: () => handleSelect(item),
                    onMouseEnter: () => setHighlightedIndex(idx),
                    className: `p-2 flex items-center justify-between gap-2 cursor-pointer transition-colors ${isHighlighted ? "bg-blue-50" : isSelected ? "bg-blue-50/50 font-semibold" : "hover:bg-slate-50"}`,
                    children: [
                      /* @__PURE__ */ jsxs5("div", { className: "flex items-center gap-2 flex-1 min-w-0", children: [
                        showCode && item.code && /* @__PURE__ */ jsx6("span", { className: "font-mono text-[10px] bg-slate-100 text-slate-700 font-bold px-1.5 py-0.5 rounded border border-slate-200 shrink-0", children: item.code }),
                        /* @__PURE__ */ jsxs5("div", { className: "flex-1 min-w-0", children: [
                          /* @__PURE__ */ jsxs5("div", { className: "flex items-center gap-1.5", children: [
                            /* @__PURE__ */ jsx6("span", { className: `truncate text-xs ${isSelected ? "text-blue-700 font-bold" : "text-slate-800 font-medium"}`, children: /* @__PURE__ */ jsx6(HighlightMatch, { text: item.name, query: inputText }) }),
                            isSelected && /* @__PURE__ */ jsx6(Check, { className: "w-3 h-3 text-blue-600 shrink-0" })
                          ] }),
                          entityType !== "item" && item.subText && /* @__PURE__ */ jsx6("div", { className: "text-[9px] text-slate-400 font-light truncate mt-0.5", children: item.subText })
                        ] })
                      ] }),
                      entityType !== "item" && item.badge && /* @__PURE__ */ jsx6("span", { className: "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded shrink-0 bg-slate-100 text-slate-700 border border-slate-200", children: item.badge })
                    ]
                  },
                  `ac-${item.id || idx}-${idx}`
                );
              }) : /* @__PURE__ */ jsx6("div", { className: "p-3 text-center text-slate-500", children: /* @__PURE__ */ jsxs5("p", { className: "text-xs", children: [
                "\u0644\u0627 \u064A\u0648\u062C\u062F ",
                entityMeta.label,
                " \u064A\u0637\u0627\u0628\u0642: ",
                /* @__PURE__ */ jsxs5("span", { className: "font-bold text-slate-800", children: [
                  '"',
                  inputText,
                  '"'
                ] })
              ] }) }),
              !exactMatchExists && inputText.trim() && /* @__PURE__ */ jsx6("div", { className: "p-2 bg-emerald-50/60 border-t border-emerald-100", children: /* @__PURE__ */ jsxs5(
                "button",
                {
                  type: "button",
                  onClick: handlePerformQuickAdd,
                  className: `w-full py-1.5 px-2.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all shadow-2xs ${highlightedIndex === filteredItems.length ? "bg-emerald-700 text-white" : "bg-emerald-600 hover:bg-emerald-700 text-white"}`,
                  children: [
                    /* @__PURE__ */ jsx6(Plus, { className: "w-3.5 h-3.5" }),
                    /* @__PURE__ */ jsxs5("span", { children: [
                      "\u0625\u0636\u0627\u0641\u0629 ",
                      /* @__PURE__ */ jsxs5("strong", { className: "underline mx-1", children: [
                        '"',
                        inputText.trim(),
                        '"'
                      ] }),
                      " ",
                      entityMeta.quickAddLabel
                    ] })
                  ]
                }
              ) })
            ] })
          ]
        }
      ),
      document.body
    )
  ] });
};

// src/utils/partyUtils.ts
function formatInvoiceCustomerDisplay(inv, parties) {
  if (!inv) return "\u0632\u0628\u0648\u0646 \u0646\u0642\u062F\u064A";
  let mainName = (inv.customerName || "").trim();
  let subName = (inv.subCustomerName || "").trim();
  if (!subName && inv.customCustomerText && inv.customCustomerText.trim()) {
    const rawCustom = inv.customCustomerText.trim();
    if (rawCustom !== mainName) {
      const phoneMatch = rawCustom.match(/(05\d{8}|01\d{8,9}|\+?\d{9,12})/);
      const extractedPhone = phoneMatch ? phoneMatch[0] : "";
      const cleanCustomName = rawCustom.replace(extractedPhone, "").trim() || rawCustom;
      if (cleanCustomName && cleanCustomName !== mainName) {
        subName = cleanCustomName;
      }
    }
  }
  if (parties && parties.length > 0) {
    if (inv.customerId) {
      const currentMain = parties.find((p) => p.id === inv.customerId);
      if (currentMain && !currentMain.isSubCustomer) mainName = currentMain.name.trim();
    }
    if (inv.subCustomerId) {
      const subParty = parties.find((p) => p.id === inv.subCustomerId);
      if (subParty) {
        subName = subParty.name.trim();
        if (subParty.parentPartyId) {
          const parent = parties.find((p) => p.id === subParty.parentPartyId);
          if (parent) mainName = parent.name.trim();
        }
      }
    } else if (inv.customerId) {
      const party = parties.find((p) => p.id === inv.customerId);
      if (party?.isSubCustomer && party.parentPartyId) {
        const parent = parties.find((p) => p.id === party.parentPartyId);
        if (parent) {
          mainName = parent.name.trim();
          subName = party.name.trim();
        }
      }
    }
  }
  if (!mainName) {
    mainName = "\u0632\u0628\u0648\u0646 \u0646\u0642\u062F\u064A";
  }
  if (mainName.includes(" / ")) {
    const parts = mainName.split(" / ").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      mainName = parts[0];
      if (!subName) subName = parts.slice(1).join(" / ");
    }
  } else if (mainName.includes(" - ") && !mainName.startsWith("INV-")) {
    const parts = mainName.split(" - ").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      mainName = parts[0];
      if (!subName) subName = parts.slice(1).join(" - ");
    }
  }
  if (subName && subName.trim() && subName.trim() !== mainName) {
    const cleanSub = subName.trim();
    if (mainName.endsWith(` / ${cleanSub}`) || mainName === cleanSub) {
      return mainName;
    }
    return `${mainName} / ${cleanSub}`;
  }
  return mainName;
}

// src/utils/operationalReportData.ts
var inReportPeriod = (date, fromDate, toDate) => (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
function purchasesForReport(rows, fromDate, toDate) {
  return rows.filter((r) => inReportPeriod(r.date, fromDate, toDate)).sort((a, b) => b.date.localeCompare(a.date) || b.invoiceNumber.localeCompare(a.invoiceNumber));
}
function inventoryShortagesForReport(rows) {
  return rows.filter((r) => r.category !== "copy_scan" && r.category !== "services" && r.id !== "srv-delivery" && r.stockQuantity <= r.minAlertQuantity).sort((a, b) => a.code.localeCompare(b.code));
}
function expensesForReport(rows, fromDate, toDate) {
  return rows.filter((r) => inReportPeriod(r.date, fromDate, toDate)).sort((a, b) => b.date.localeCompare(a.date));
}
var sumReportAmounts = (rows, amount) => rows.reduce((total, row) => total + (Number(amount(row)) || 0), 0);

// src/components/reports/OperationalReportDocument.tsx
import { Fragment as Fragment2, jsx as jsx7, jsxs as jsxs6 } from "react/jsx-runtime";
var money = (v) => Number(v || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
var quantity = (v) => Number(v || 0).toLocaleString("en-US", { maximumFractionDigits: 4 });
var th = "border border-slate-300 bg-slate-100 px-1.5 py-1.5 text-[10px] font-bold text-slate-900";
var td = "border border-slate-300 px-1.5 py-1 text-[10px] text-slate-800";
var titles = { purchases_report: "\u0643\u0634\u0641 \u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0627\u0644\u062A\u0641\u0635\u064A\u0644\u064A", inventory_report: "\u0643\u0634\u0641 \u0646\u0648\u0627\u0642\u0635 \u0627\u0644\u0645\u062E\u0632\u0648\u0646", expenses_report: "\u0643\u0634\u0641 \u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0627\u0644\u062A\u0641\u0635\u064A\u0644\u064A" };
var OperationalReportDocument = ({ kind, fromDate, toDate }) => {
  const { settings, purchases, inventory, expenses } = useAccounting();
  const purchasesRows = purchasesForReport(purchases, fromDate, toDate);
  const stocks = inventoryShortagesForReport(inventory);
  const expenseRows = expensesForReport(expenses, fromDate, toDate);
  const period = kind === "inventory_report" ? "\u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u062D\u0627\u0644\u064A" : "\u0645\u0646 " + (fromDate || "\u0628\u062F\u0627\u064A\u0629 \u0627\u0644\u0646\u0634\u0627\u0637") + " \u0625\u0644\u0649 " + (toDate || "\u0627\u0644\u0622\u0646");
  const heading = kind === "purchases_report" ? ["\u0645", "\u0627\u0644\u062A\u0627\u0631\u064A\u062E", "\u0631\u0642\u0645 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629", "\u0627\u0644\u0645\u0648\u0631\u062F", "\u0627\u0644\u0623\u0635\u0646\u0627\u0641", "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A", "\u0627\u0644\u0645\u062F\u0641\u0648\u0639", "\u0627\u0644\u0645\u062A\u0628\u0642\u064A"] : kind === "inventory_report" ? ["\u0645", "\u0643\u0648\u062F \u0627\u0644\u0635\u0646\u0641", "\u0627\u0644\u0635\u0646\u0641", "\u0627\u0644\u0648\u062D\u062F\u0629", "\u0627\u0644\u0631\u0635\u064A\u062F", "\u0627\u0644\u062D\u062F \u0627\u0644\u0623\u062F\u0646\u0649", "\u0627\u0644\u0639\u062C\u0632", "\u0633\u0639\u0631 \u0627\u0644\u062A\u0643\u0644\u0641\u0629"] : ["\u0645", "\u0627\u0644\u062A\u0627\u0631\u064A\u062E", "\u0627\u0644\u062A\u0635\u0646\u064A\u0641", "\u0627\u0644\u062D\u0633\u0627\u0628", "\u0627\u0644\u0645\u0633\u062A\u0641\u064A\u062F", "\u0627\u0644\u0628\u064A\u0627\u0646 / \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A", "\u0627\u0644\u0635\u0646\u062F\u0648\u0642", "\u0627\u0644\u0645\u0628\u0644\u063A"];
  const len = kind === "purchases_report" ? purchasesRows.length : kind === "inventory_report" ? stocks.length : expenseRows.length;
  return /* @__PURE__ */ jsxs6("div", { className: "report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 space-y-3", dir: "rtl", "data-official-report-type": kind, children: [
    /* @__PURE__ */ jsx7(PrintHeader, { title: titles[kind], subtitle: period }),
    /* @__PURE__ */ jsxs6("div", { className: "flex items-center justify-between border-b pb-2", children: [
      /* @__PURE__ */ jsx7("strong", { className: "text-sm text-slate-900", children: titles[kind] }),
      /* @__PURE__ */ jsx7("span", { className: "text-xs text-slate-500", children: period })
    ] }),
    /* @__PURE__ */ jsxs6("table", { className: "w-full table-fixed border-collapse text-right", children: [
      /* @__PURE__ */ jsx7("thead", { children: /* @__PURE__ */ jsx7("tr", { children: heading.map((s) => /* @__PURE__ */ jsx7("th", { className: th, children: s }, s)) }) }),
      /* @__PURE__ */ jsxs6("tbody", { children: [
        kind === "purchases_report" && purchasesRows.map((r, i) => /* @__PURE__ */ jsxs6("tr", { className: "break-inside-avoid", children: [
          /* @__PURE__ */ jsx7("td", { className: td, children: i + 1 }),
          /* @__PURE__ */ jsx7("td", { className: td, children: r.date }),
          /* @__PURE__ */ jsx7("td", { className: td, children: r.invoiceNumber }),
          /* @__PURE__ */ jsx7("td", { className: td, children: r.supplierName }),
          /* @__PURE__ */ jsx7("td", { className: td, children: r.items?.map((x) => x.itemName).filter(Boolean).join("\u060C ") || "-" }),
          /* @__PURE__ */ jsx7("td", { className: td, children: money(r.totalAmount) }),
          /* @__PURE__ */ jsx7("td", { className: td, children: money(r.paidAmount) }),
          /* @__PURE__ */ jsx7("td", { className: td, children: money(Math.max(0, (r.totalAmount || 0) - (r.paidAmount || 0))) })
        ] }, r.id)),
        kind === "inventory_report" && stocks.map((r, i) => /* @__PURE__ */ jsxs6("tr", { className: "break-inside-avoid", children: [
          /* @__PURE__ */ jsx7("td", { className: td, children: i + 1 }),
          /* @__PURE__ */ jsx7("td", { className: td, children: r.code }),
          /* @__PURE__ */ jsx7("td", { className: td, children: r.name }),
          /* @__PURE__ */ jsx7("td", { className: td, children: r.unit }),
          /* @__PURE__ */ jsx7("td", { className: td, children: quantity(r.stockQuantity) }),
          /* @__PURE__ */ jsx7("td", { className: td, children: quantity(r.minAlertQuantity) }),
          /* @__PURE__ */ jsx7("td", { className: td, children: quantity(Math.max(0, r.minAlertQuantity - r.stockQuantity)) }),
          /* @__PURE__ */ jsx7("td", { className: td, children: money(r.purchasePrice) })
        ] }, r.id)),
        kind === "expenses_report" && expenseRows.map((r, i) => /* @__PURE__ */ jsxs6("tr", { className: "break-inside-avoid", children: [
          /* @__PURE__ */ jsx7("td", { className: td, children: i + 1 }),
          /* @__PURE__ */ jsx7("td", { className: td, children: r.date }),
          /* @__PURE__ */ jsx7("td", { className: td, children: r.categoryName }),
          /* @__PURE__ */ jsx7("td", { className: td, children: r.expenseAccountName }),
          /* @__PURE__ */ jsx7("td", { className: td, children: r.beneficiary }),
          /* @__PURE__ */ jsx7("td", { className: td, children: r.notes || "-" }),
          /* @__PURE__ */ jsx7("td", { className: td, children: r.treasuryName }),
          /* @__PURE__ */ jsx7("td", { className: td, children: money(r.amount) })
        ] }, r.id))
      ] }),
      /* @__PURE__ */ jsx7("tfoot", { children: /* @__PURE__ */ jsxs6("tr", { className: "break-inside-avoid bg-slate-100 font-bold", children: [
        /* @__PURE__ */ jsxs6("td", { className: th, colSpan: 5, children: [
          "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0633\u062C\u0644\u0627\u062A: ",
          len
        ] }),
        kind === "purchases_report" ? /* @__PURE__ */ jsxs6(Fragment2, { children: [
          /* @__PURE__ */ jsx7("td", { className: td, children: money(sumReportAmounts(purchasesRows, (r) => r.totalAmount)) }),
          /* @__PURE__ */ jsx7("td", { className: td, children: money(sumReportAmounts(purchasesRows, (r) => r.paidAmount)) }),
          /* @__PURE__ */ jsx7("td", { className: td, children: money(sumReportAmounts(purchasesRows, (r) => Math.max(0, (r.totalAmount || 0) - (r.paidAmount || 0)))) })
        ] }) : /* @__PURE__ */ jsx7("td", { className: td, colSpan: 3, children: kind === "inventory_report" ? "\u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0627\u0644\u0646\u0627\u0642\u0635\u0629" : money(sumReportAmounts(expenseRows, (r) => r.amount)) + " " + settings.currency })
      ] }) })
    ] }),
    /* @__PURE__ */ jsx7(ReportSignatures, { rightLabel: "\u0625\u0639\u062F\u0627\u062F \u0648\u0645\u0631\u0627\u062C\u0639\u0629", centerLabel: "\u062A\u062F\u0642\u064A\u0642 \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A", leftLabel: "\u0627\u0644\u062E\u062A\u0645 \u0648\u0627\u0644\u062A\u0648\u0642\u064A\u0639" })
  ] });
};

// src/components/ReportsView.tsx
import { Fragment as Fragment3, jsx as jsx8, jsxs as jsxs7 } from "react/jsx-runtime";
var ReportsView = ({ initialReport, exportSelection }) => {
  const {
    accounts,
    settings,
    invoices,
    salesReturns,
    purchases,
    purchaseReturns,
    vouchers,
    printOrders,
    parties,
    inventory,
    employees,
    payrollSheets,
    treasuries,
    journalEntries,
    currencies,
    employeeAdvances,
    employeeDeductions,
    employeeIncentives,
    debtClearings
  } = useAccounting();
  const [activeReport, setActiveReport] = useState2(initialReport || "customer_statement");
  useEffect3(() => {
    if (initialReport) {
      setActiveReport(initialReport);
    }
  }, [initialReport]);
  const [fromDate, setFromDate] = useState2(exportSelection?.fromDate || "");
  const [toDate, setToDate] = useState2(exportSelection?.toDate || "");
  const [searchQuery, setSearchQuery] = useState2("");
  const mainCustomers = useMemo2(() => {
    return parties.filter((p) => (p.type === "customer" || p.type === "both") && !p.parentPartyId && !p.isSubCustomer);
  }, [parties]);
  const [selectedCustomerId, setSelectedCustomerId] = useState2(() => {
    const target = parties.find((p) => p.id === exportSelection?.partyId);
    return target?.parentPartyId || target?.parentCustomerId || target?.id || mainCustomers[0]?.id || "";
  });
  const [selectedSubCustomerId, setSelectedSubCustomerId] = useState2(() => {
    const target = parties.find((p) => p.id === exportSelection?.partyId);
    return target?.parentPartyId || target?.parentCustomerId ? target.id : "all";
  });
  const subCustomersForSelected = useMemo2(() => {
    if (!selectedCustomerId) return [];
    const map = /* @__PURE__ */ new Map();
    parties.filter((p) => p.parentPartyId === selectedCustomerId || p.isSubCustomer && p.parentPartyId === selectedCustomerId).forEach((p) => map.set(p.id, p));
    invoices.forEach((inv) => {
      if (inv.customerId === selectedCustomerId) {
        if (inv.subCustomerId && !map.has(inv.subCustomerId)) {
          const found = parties.find((p) => p.id === inv.subCustomerId);
          if (found) map.set(found.id, found);
        }
        const subName = (inv.subCustomerName || inv.customCustomerText || "").trim();
        if (subName && !Array.from(map.values()).some((p) => p.name.trim().toLowerCase() === subName.toLowerCase())) {
          const synthId = inv.subCustomerId || `synth-sub-${subName}`;
          map.set(synthId, {
            id: synthId,
            code: synthId,
            type: "customer",
            name: subName,
            parentPartyId: selectedCustomerId,
            isSubCustomer: true,
            balance: 0
          });
        }
      }
    });
    return Array.from(map.values());
  }, [parties, invoices, selectedCustomerId]);
  const mainSuppliers = useMemo2(() => {
    return parties.filter((p) => (p.type === "supplier" || p.type === "both") && !p.parentPartyId && !p.isSubCustomer);
  }, [parties]);
  const [selectedSupplierId, setSelectedSupplierId] = useState2(() => {
    const target = parties.find((p) => p.id === exportSelection?.partyId);
    return target?.parentPartyId || target?.parentCustomerId || target?.id || mainSuppliers[0]?.id || "";
  });
  const [selectedSubSupplierId, setSelectedSubSupplierId] = useState2(() => {
    const target = parties.find((p) => p.id === exportSelection?.partyId);
    return target?.parentPartyId || target?.parentCustomerId ? target.id : "all";
  });
  const subSuppliersForSelected = useMemo2(() => {
    if (!selectedSupplierId) return [];
    return parties.filter((p) => p.parentPartyId === selectedSupplierId);
  }, [parties, selectedSupplierId]);
  const customerComboboxOptions = useMemo2(() => {
    return parties.filter((p) => p.type === "customer" || p.type === "both").map((p) => {
      let badge = p.isSubCustomer ? "\u0632\u0628\u0648\u0646 \u0641\u0631\u0639\u064A" : "\u0639\u0645\u064A\u0644";
      let subText = p.phone || "";
      if (p.parentCustomerName) {
        subText = `\u062A\u0627\u0628\u0639 \u0644\u0640: ${p.parentCustomerName}${p.phone ? " | " + p.phone : ""}`;
      } else if (p.currentBalance !== void 0) {
        subText = `\u0627\u0644\u0631\u0635\u064A\u062F: ${p.currentBalance.toFixed(2)} ${settings.currency || "\u20AA"}${p.phone ? " | " + p.phone : ""}`;
      }
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        subText,
        badge,
        extraSearchCorpus: `${p.name} ${p.code || ""} ${p.phone || ""} ${p.parentCustomerName || ""} ${p.city || ""}`,
        raw: p
      };
    });
  }, [parties, settings.currency]);
  const supplierComboboxOptions = useMemo2(() => {
    return parties.filter((p) => p.type === "supplier" || p.type === "both").map((p) => {
      let badge = "\u0645\u0648\u0631\u062F";
      let subText = p.phone || "";
      if (p.currentBalance !== void 0) {
        subText = `\u0627\u0644\u0645\u0633\u062A\u062D\u0642: ${p.currentBalance.toFixed(2)} ${settings.currency || "\u20AA"}${p.phone ? " | " + p.phone : ""}`;
      }
      return {
        id: p.id,
        name: p.name,
        code: p.code,
        subText,
        badge,
        extraSearchCorpus: `${p.name} ${p.code || ""} ${p.phone || ""} ${p.city || ""}`,
        raw: p
      };
    });
  }, [parties, settings.currency]);
  const employeeComboboxOptions = useMemo2(() => {
    return employees.map((emp) => ({
      id: emp.id,
      name: emp.name,
      code: emp.code || emp.id.slice(-4),
      subText: `${emp.jobTitle || "\u0645\u0648\u0638\u0641"}${emp.phone ? " | \u0647\u0627\u062A\u0641: " + emp.phone : ""}`,
      badge: emp.department || "\u0639\u0627\u0645",
      extraSearchCorpus: `${emp.name} ${emp.code || ""} ${emp.jobTitle || ""} ${emp.phone || ""} ${emp.department || ""}`,
      raw: emp
    }));
  }, [employees]);
  const [receiptTreasuryFilter, setReceiptTreasuryFilter] = useState2("all");
  const [paymentTreasuryFilter, setPaymentTreasuryFilter] = useState2("all");
  const [selectedEmpId, setSelectedEmpId] = useState2(exportSelection?.employeeId || employees[0]?.id || "");
  const [selectedTreasuryCode, setSelectedTreasuryCode] = useState2("all");
  const handlePrint = () => {
    window.print();
  };
  const downloadCSV = (filename, headers, rows) => {
    const csvContent = "\uFEFF" + [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}_${(/* @__PURE__ */ new Date()).toISOString().split("T")[0]}.csv`;
    link.click();
  };
  const [showStatementItemDetails, setShowStatementItemDetails] = useState2(true);
  const [showStatementImageThumbnails, setShowStatementImageThumbnails] = useState2(true);
  const [previewModalImage, setPreviewModalImage] = useState2(null);
  const selectedSubCustObj = useMemo2(() => {
    if (!selectedSubCustomerId || selectedSubCustomerId === "all") return null;
    return subCustomersForSelected.find((s) => s.id === selectedSubCustomerId);
  }, [subCustomersForSelected, selectedSubCustomerId]);
  const selectedSubSuppObj = useMemo2(() => {
    if (!selectedSubSupplierId || selectedSubSupplierId === "all") return null;
    return subSuppliersForSelected.find((s) => s.id === selectedSubSupplierId);
  }, [subSuppliersForSelected, selectedSubSupplierId]);
  const customerStatementData = useMemo2(() => {
    const cust = parties.find((p) => p.id === selectedCustomerId);
    if (!cust) return { party: null, statement: null, rows: [], totalDebit: 0, totalCredit: 0, balance: 0, openingBalance: 0, fromDate, toDate };
    const statement = generateAccountStatement({
      party: cust,
      invoices,
      purchases,
      purchaseReturns,
      salesReturns,
      vouchers,
      printOrders,
      journalEntries,
      debtClearings,
      fromDate,
      toDate,
      subCustomerId: selectedSubCustomerId,
      subCustomers: subCustomersForSelected
    });
    return {
      party: cust,
      statement,
      rows: statement.rows,
      totalDebit: statement.totalDebit,
      totalCredit: statement.totalCredit,
      balance: statement.closingBalance,
      openingBalance: statement.openingBalance,
      fromDate,
      toDate
    };
  }, [parties, selectedCustomerId, selectedSubCustomerId, subCustomersForSelected, invoices, purchases, purchaseReturns, salesReturns, vouchers, printOrders, journalEntries, debtClearings, fromDate, toDate]);
  const customerItemsData = useMemo2(() => {
    const cust = parties.find((p) => p.id === selectedCustomerId);
    if (!cust) return { party: null, items: [], totalQuantity: 0, totalAmount: 0 };
    const targetCustomerIds = /* @__PURE__ */ new Set();
    targetCustomerIds.add(cust.id);
    if (selectedSubCustomerId === "all") {
      subCustomersForSelected.forEach((sub) => targetCustomerIds.add(sub.id));
    } else if (selectedSubCustomerId) {
      targetCustomerIds.clear();
      targetCustomerIds.add(selectedSubCustomerId);
    }
    const map = /* @__PURE__ */ new Map();
    invoices.forEach((inv) => {
      const isMatch = selectedSubCustomerId && selectedSubCustomerId !== "all" ? inv.subCustomerId === selectedSubCustomerId : Boolean(inv.customerId && targetCustomerIds.has(inv.customerId) || inv.subCustomerId && targetCustomerIds.has(inv.subCustomerId));
      if (!isMatch) return;
      if (fromDate && inv.date < fromDate) return;
      if (toDate && inv.date > toDate) return;
      inv.items.forEach((line, lineIndex) => {
        const linkedId = line.itemId || line.item?.id;
        const currentItem = linkedId ? inventory.find((item) => item.id === linkedId) : void 0;
        const key = linkedId || `unlinked:${inv.id}:${lineIndex}`;
        const name = currentItem?.name || line.itemName || line.item?.name || line.description || "\u0635\u0646\u0641 \u063A\u064A\u0631 \u0645\u062D\u062F\u062F";
        const code = currentItem?.code || line.itemCode || line.item?.code || "-";
        const unit = line.unit || line.item?.unit || "\u0642\u0637\u0639\u0629";
        const category = line.item?.category || "\u0639\u0627\u0645";
        const qty = line.quantity || 1;
        const lineTotal = (line.unitPrice || line.item?.price || 0) * qty - (line.discount || 0);
        const noteText = line.notes || line.note || "";
        const descText = line.description && line.description !== name ? line.description : "";
        if (!map.has(key)) {
          map.set(key, {
            itemId: key,
            itemCode: code,
            itemName: name,
            description: descText,
            notes: noteText,
            unit,
            category,
            totalQuantity: qty,
            totalAmount: lineTotal,
            lastDate: inv.date,
            invoiceCount: 1
          });
        } else {
          const prev = map.get(key);
          prev.totalQuantity += qty;
          prev.totalAmount += lineTotal;
          prev.invoiceCount += 1;
          if (!prev.notes && noteText) prev.notes = noteText;
          if (!prev.description && descText) prev.description = descText;
          if (inv.date > prev.lastDate) {
            prev.lastDate = inv.date;
          }
        }
      });
    });
    const items = Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    const totalQuantity = items.reduce((s, i) => s + i.totalQuantity, 0);
    const totalAmount = items.reduce((s, i) => s + i.totalAmount, 0);
    return {
      party: cust,
      items,
      totalQuantity,
      totalAmount
    };
  }, [parties, selectedCustomerId, selectedSubCustomerId, subCustomersForSelected, invoices, inventory, fromDate, toDate]);
  const supplierStatementData = useMemo2(() => {
    const supp = parties.find((p) => p.id === selectedSupplierId);
    if (!supp) return { party: null, statement: null, rows: [], totalDebit: 0, totalCredit: 0, balance: 0, openingBalance: 0, fromDate, toDate };
    const statement = generateAccountStatement({
      party: supp,
      invoices,
      purchases,
      purchaseReturns,
      salesReturns,
      vouchers,
      printOrders,
      journalEntries,
      debtClearings,
      fromDate,
      toDate,
      subCustomerId: selectedSubSupplierId,
      subCustomers: subSuppliersForSelected
    });
    return {
      party: supp,
      statement,
      rows: statement.rows,
      totalDebit: statement.totalDebit,
      totalCredit: statement.totalCredit,
      balance: statement.closingBalance,
      openingBalance: statement.openingBalance,
      fromDate,
      toDate
    };
  }, [parties, selectedSupplierId, selectedSubSupplierId, subSuppliersForSelected, invoices, purchases, purchaseReturns, salesReturns, vouchers, printOrders, journalEntries, debtClearings, fromDate, toDate]);
  const supplierItemsData = useMemo2(() => {
    const supp = parties.find((p) => p.id === selectedSupplierId);
    if (!supp) return { party: null, items: [], totalQuantity: 0, totalAmount: 0 };
    const targetSuppIds = /* @__PURE__ */ new Set();
    targetSuppIds.add(supp.id);
    if (selectedSubSupplierId === "all") {
      subSuppliersForSelected.forEach((sub) => targetSuppIds.add(sub.id));
    } else if (selectedSubSupplierId) {
      targetSuppIds.clear();
      targetSuppIds.add(selectedSubSupplierId);
    }
    const map = /* @__PURE__ */ new Map();
    purchases.forEach((pur) => {
      const isMatch = pur.supplierId && targetSuppIds.has(pur.supplierId) || pur.supplierName === supp.name;
      if (!isMatch) return;
      if (fromDate && pur.date < fromDate) return;
      if (toDate && pur.date > toDate) return;
      pur.items.forEach((line) => {
        const key = line.itemId || line.itemName;
        const name = line.itemName;
        const qty = line.quantity || 1;
        const lineTotal = line.unitPrice * qty;
        const noteText = line.notes || line.note || "";
        const descText = line.description && line.description !== name ? line.description : "";
        if (!map.has(key)) {
          map.set(key, {
            itemId: key,
            itemName: name,
            description: descText,
            notes: noteText,
            totalQuantity: qty,
            totalAmount: lineTotal,
            lastDate: pur.date,
            invoiceCount: 1
          });
        } else {
          const prev = map.get(key);
          prev.totalQuantity += qty;
          prev.totalAmount += lineTotal;
          prev.invoiceCount += 1;
          if (!prev.notes && noteText) prev.notes = noteText;
          if (!prev.description && descText) prev.description = descText;
          if (pur.date > prev.lastDate) {
            prev.lastDate = pur.date;
          }
        }
      });
    });
    const items = Array.from(map.values()).sort((a, b) => b.totalAmount - a.totalAmount);
    const totalQuantity = items.reduce((s, i) => s + i.totalQuantity, 0);
    const totalAmount = items.reduce((s, i) => s + i.totalAmount, 0);
    return {
      party: supp,
      items,
      totalQuantity,
      totalAmount
    };
  }, [parties, selectedSupplierId, selectedSubSupplierId, subSuppliersForSelected, purchases, fromDate, toDate]);
  const receiptVouchersData = useMemo2(() => {
    return vouchers.filter((v) => {
      if (v.type !== "receipt") return false;
      if (receiptTreasuryFilter !== "all" && v.accountCode !== receiptTreasuryFilter && v.treasuryAccountCode !== receiptTreasuryFilter) return false;
      if (fromDate && v.date < fromDate) return false;
      if (toDate && v.date > toDate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return v.voucherNumber.toLowerCase().includes(q) || v.partyName && v.partyName.toLowerCase().includes(q) || v.description && v.description.toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [vouchers, receiptTreasuryFilter, fromDate, toDate, searchQuery]);
  const paymentVouchersData = useMemo2(() => {
    return vouchers.filter((v) => {
      if (v.type !== "payment") return false;
      if (paymentTreasuryFilter !== "all" && v.accountCode !== paymentTreasuryFilter && v.treasuryAccountCode !== paymentTreasuryFilter) return false;
      if (fromDate && v.date < fromDate) return false;
      if (toDate && v.date > toDate) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return v.voucherNumber.toLowerCase().includes(q) || v.partyName && v.partyName.toLowerCase().includes(q) || v.description && v.description.toLowerCase().includes(q);
      }
      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [vouchers, paymentTreasuryFilter, fromDate, toDate, searchQuery]);
  const employeeStatementData = useMemo2(() => {
    const emp = employees.find((e) => e.id === selectedEmpId);
    if (!emp) return { employee: null, rows: [], totalDue: 0, totalPaid: 0, netBalance: 0 };
    const statement = generateEmployeeStatement({
      employee: emp,
      fromDate: fromDate || void 0,
      toDate: toDate || void 0,
      vouchers,
      advances: employeeAdvances,
      deductions: employeeDeductions,
      incentives: employeeIncentives,
      invoices,
      purchases,
      purchaseReturns,
      payrollSheets,
      journalEntries,
      debtClearings
    });
    const mappedRows = statement.rows.map((r) => ({
      date: r.date,
      type: r.typeLabel,
      refNumber: r.referenceNumber,
      description: r.description,
      dueAmount: r.entitlement,
      paidAmount: r.advance + r.deduction + r.disbursement,
      runningBalance: r.runningBalance,
      notes: r.notes
    }));
    return {
      employee: emp,
      rows: mappedRows,
      totalDue: statement.totalDue,
      totalPaid: statement.totalPaid,
      netBalance: statement.closingBalance
    };
  }, [
    employees,
    selectedEmpId,
    fromDate,
    toDate,
    vouchers,
    employeeAdvances,
    employeeDeductions,
    employeeIncentives,
    invoices,
    purchases,
    purchaseReturns,
    payrollSheets,
    journalEntries,
    debtClearings
  ]);
  const payrollSheetsData = useMemo2(() => {
    return (payrollSheets || []).filter((sheet) => {
      const sheetDate = sheet.createdAt || sheet.disbursedAt || sheet.periodMonth || "";
      if (fromDate && sheetDate < fromDate) return false;
      if (toDate && sheetDate > toDate) return false;
      return true;
    }).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  }, [payrollSheets, fromDate, toDate]);
  const treasuriesMovementData = useMemo2(() => {
    const targetTreasuries = selectedTreasuryCode === "all" ? treasuries : treasuries.filter((t) => t.accountCode === selectedTreasuryCode);
    const rows = [];
    const seenTxKeys = /* @__PURE__ */ new Set();
    const seenInvoiceNumbers = /* @__PURE__ */ new Set();
    const getCleanDate = (d) => {
      if (!d) return "";
      return d.split("T")[0];
    };
    targetTreasuries.forEach((t) => {
      (t.transactions || []).forEach((tx) => {
        const cleanDate = getCleanDate(tx.date);
        const actualCurr = tx.currency || tx.actualCurrency || "ILS";
        const rate = Number(tx.exchangeRate) || 1;
        const actualAmt = Math.abs(Number(tx.actualAmount !== void 0 ? tx.actualAmount : tx.amount) || 0);
        const baseAmt = Math.abs(Number(tx.baseAmount !== void 0 ? tx.baseAmount : actualAmt * rate) || 0);
        const isIncome = tx.type === "deposit" || tx.type === "transfer_in";
        let opLabel = "\u062D\u0631\u0643\u0629 \u0645\u0627\u0644\u064A\u0629";
        if (tx.referenceType === "pos_sale" || tx.referenceType === "invoice") {
          opLabel = "\u062A\u062D\u0635\u064A\u0644 \u0645\u0628\u064A\u0639\u0627\u062A";
        } else if (tx.type === "transfer_in") {
          opLabel = "\u062A\u062D\u0648\u064A\u0644 \u0648\u0627\u0631\u062F";
        } else if (tx.type === "transfer_out") {
          opLabel = "\u062A\u062D\u0648\u064A\u0644 \u0635\u0627\u062F\u0631";
        } else if (tx.referenceType === "receipt" || isIncome && (tx.voucherNumber?.startsWith("RCT-") || tx.voucherNumber?.startsWith("RC-"))) {
          opLabel = "\u0633\u0646\u062F \u0642\u0628\u0636";
        } else if (tx.referenceType === "payment" || !isIncome && (tx.voucherNumber?.startsWith("PV-") || tx.voucherNumber?.startsWith("PAY-"))) {
          opLabel = "\u0633\u0646\u062F \u0635\u0631\u0641";
        } else if (tx.referenceType === "expense") {
          opLabel = "\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0646\u0642\u062F\u064A\u0629";
        } else if (tx.referenceType === "purchase") {
          opLabel = "\u0633\u062F\u0627\u062F \u0645\u0634\u062A\u0631\u064A\u0627\u062A";
        } else if (tx.referenceType === "payroll") {
          opLabel = "\u0635\u0631\u0641 \u0631\u0648\u0627\u062A\u0628";
        } else if (tx.referenceType === "advance") {
          opLabel = "\u0633\u0644\u0641\u0629 \u0645\u0648\u0638\u0641";
        } else {
          opLabel = isIncome ? "\u0625\u064A\u062F\u0627\u0639 \u0646\u0642\u062F\u064A" : "\u0633\u062D\u0628 \u0646\u0642\u062F\u064A";
        }
        const docNum = tx.voucherNumber || tx.referenceId || tx.id.slice(0, 10);
        const party = tx.partyName || (tx.targetTreasuryName ? `\u0625\u0644\u0649/\u0645\u0646: ${tx.targetTreasuryName}` : "-");
        const isInvTx = docNum && docNum.startsWith("INV-") || tx.referenceType === "pos_sale" || tx.referenceType === "invoice";
        if (isInvTx) {
          if (docNum) seenInvoiceNumbers.add(docNum);
          if (tx.referenceId) seenInvoiceNumbers.add(tx.referenceId);
          if (tx.voucherNumber) seenInvoiceNumbers.add(tx.voucherNumber);
        }
        const uniqueKey = `${t.accountCode}_${docNum}_${cleanDate}_${baseAmt}`;
        seenTxKeys.add(uniqueKey);
        if (docNum && docNum !== "-") seenTxKeys.add(`${t.accountCode}_${docNum}`);
        rows.push({
          date: cleanDate,
          treasuryName: t.name,
          type: opLabel,
          docNumber: docNum,
          partyName: party,
          actualCurrency: actualCurr,
          actualAmount: actualAmt,
          exchangeRate: rate,
          inflow: isIncome ? baseAmt : 0,
          outflow: !isIncome ? baseAmt : 0,
          notes: tx.description || "-",
          timestamp: new Date(tx.date).getTime() || 0
        });
      });
    });
    invoices.forEach((inv) => {
      if ((inv.paidAmount || 0) <= 0) return;
      const docNum = inv.invoiceNumber;
      if (seenInvoiceNumbers.has(docNum) || inv.id && seenInvoiceNumbers.has(inv.id)) {
        return;
      }
      let invTreasuryCode = inv.treasuryAccountCode || (inv.paymentMethod === "cash" ? inv.cashTreasuryCode || "1101" : inv.bankTreasuryCode || "1105");
      if (invTreasuryCode === "1102" && !treasuries.some((tr) => tr.accountCode === "1102" || tr.id === "1102")) {
        invTreasuryCode = "1105";
      }
      const isMatch = selectedTreasuryCode === "all" || selectedTreasuryCode === invTreasuryCode;
      if (!isMatch) return;
      if (seenTxKeys.has(`${invTreasuryCode}_${docNum}`)) return;
      seenTxKeys.add(`${invTreasuryCode}_${docNum}`);
      seenInvoiceNumbers.add(docNum);
      const tObj = treasuries.find((t) => t.accountCode === invTreasuryCode || t.id === invTreasuryCode);
      const cleanDate = getCleanDate(inv.date || inv.createdAt);
      const curr = inv.currency || "ILS";
      const rate = Number(inv.exchangeRate) || 1;
      const actualAmt = Number(inv.paidAmount) || 0;
      const baseAmt = Number(inv.basePaidAmount) || actualAmt * rate;
      rows.push({
        date: cleanDate,
        treasuryName: tObj?.name || "\u0627\u0644\u0635\u0646\u062F\u0648\u0642",
        type: "\u062A\u062D\u0635\u064A\u0644 \u0645\u0628\u064A\u0639\u0627\u062A (\u0643\u0627\u0634\u064A\u0631)",
        docNumber: docNum,
        partyName: formatInvoiceCustomerDisplay(inv, parties),
        actualCurrency: curr,
        actualAmount: actualAmt,
        exchangeRate: rate,
        inflow: baseAmt,
        outflow: 0,
        notes: inv.notes || inv.paymentNotes || `\u062A\u062D\u0635\u064A\u0644 \u0641\u0627\u062A\u0648\u0631\u0629 \u0645\u0628\u064A\u0639\u0627\u062A \u0631\u0642\u0645 ${inv.invoiceNumber}`,
        timestamp: new Date(inv.date || inv.createdAt || "").getTime() || 0
      });
    });
    vouchers.forEach((v) => {
      const vTreasuryCode = v.treasuryAccountCode || v.accountCode;
      const isMatch = selectedTreasuryCode === "all" || selectedTreasuryCode === vTreasuryCode;
      if (!isMatch) return;
      const docNum = v.voucherNumber;
      if (seenTxKeys.has(`${vTreasuryCode}_${docNum}`)) return;
      const tObj = treasuries.find((t) => t.accountCode === vTreasuryCode);
      const cleanDate = getCleanDate(v.date);
      const curr = v.currency || "ILS";
      const rate = Number(v.exchangeRate) || 1;
      const actualAmt = Number(v.amount) || 0;
      const baseAmt = Number(v.baseAmount) || actualAmt * rate;
      const isReceipt = v.type === "receipt";
      rows.push({
        date: cleanDate,
        treasuryName: tObj?.name || "\u0627\u0644\u062E\u0632\u064A\u0646\u0629",
        type: isReceipt ? "\u0633\u0646\u062F \u0642\u0628\u0636" : "\u0633\u0646\u062F \u0635\u0631\u0641",
        docNumber: docNum,
        partyName: v.partyName || "-",
        actualCurrency: curr,
        actualAmount: actualAmt,
        exchangeRate: rate,
        inflow: isReceipt ? baseAmt : 0,
        outflow: !isReceipt ? baseAmt : 0,
        notes: v.description || "-",
        timestamp: new Date(v.date).getTime() || 0
      });
    });
    const filtered = rows.filter((r) => {
      if (fromDate && r.date < fromDate) return false;
      if (toDate && r.date > toDate) return false;
      return true;
    }).sort((a, b) => {
      const cmp = b.date.localeCompare(a.date);
      if (cmp !== 0) return cmp;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
    const totalInflow = filtered.reduce((s, r) => s + r.inflow, 0);
    const totalOutflow = filtered.reduce((s, r) => s + r.outflow, 0);
    const targetHoldings = {};
    targetTreasuries.forEach((t) => {
      if (t.currencyBalances && Object.keys(t.currencyBalances).length > 0) {
        Object.entries(t.currencyBalances).forEach(([c, amt]) => {
          targetHoldings[c] = (targetHoldings[c] || 0) + (Number(amt) || 0);
        });
      } else {
        targetHoldings["ILS"] = (targetHoldings["ILS"] || 0) + (t.balance || 0);
      }
    });
    const currencyMovements = {};
    filtered.forEach((r) => {
      if (!currencyMovements[r.actualCurrency]) {
        currencyMovements[r.actualCurrency] = { in: 0, out: 0 };
      }
      if (r.inflow > 0) {
        currencyMovements[r.actualCurrency].in += r.actualAmount;
      }
      if (r.outflow > 0) {
        currencyMovements[r.actualCurrency].out += r.actualAmount;
      }
    });
    return {
      targetTreasuries,
      rows: filtered,
      totalInflow,
      totalOutflow,
      netMovement: totalInflow - totalOutflow,
      targetHoldings,
      currencyMovements
    };
  }, [treasuries, selectedTreasuryCode, vouchers, invoices, fromDate, toDate]);
  const revBookstore = accounts.find((a) => a.code === "4101")?.balance || 0;
  const revPrinting = accounts.find((a) => a.code === "4102")?.balance || 0;
  const revServices = accounts.find((a) => a.code === "4103")?.balance || 0;
  const totalRevenues = revBookstore + revPrinting + revServices;
  const cogsBookstore = accounts.find((a) => a.code === "5101")?.balance || 0;
  const cogsPrinting = accounts.find((a) => a.code === "5102")?.balance || 0;
  const totalCogs = cogsBookstore + cogsPrinting;
  const grossProfit = totalRevenues - totalCogs;
  const expSalaries = accounts.find((a) => a.code === "5201")?.balance || 0;
  const expRent = accounts.find((a) => a.code === "5202")?.balance || 0;
  const expMaintenance = accounts.find((a) => a.code === "5203")?.balance || 0;
  const expUtilities = accounts.find((a) => a.code === "5204")?.balance || 0;
  const expGeneral = accounts.find((a) => a.code === "5205")?.balance || 0;
  const totalExpenses = expSalaries + expRent + expMaintenance + expUtilities + expGeneral;
  const netProfit = grossProfit - totalExpenses;
  const assetCash = accounts.find((a) => a.code === "1101")?.balance || 0;
  const assetBank = accounts.find((a) => a.code === "1102")?.balance || 0;
  const assetReceivables = accounts.find((a) => a.code === "1201")?.balance || 0;
  const assetInventoryBooks = accounts.find((a) => a.code === "1301")?.balance || 0;
  const assetInventoryPrint = accounts.find((a) => a.code === "1302")?.balance || 0;
  const assetMachines = accounts.find((a) => a.code === "1501")?.balance || 0;
  const totalCurrentAssets = assetCash + assetBank + assetReceivables + assetInventoryBooks + assetInventoryPrint;
  const totalFixedAssets = assetMachines;
  const totalAssets = totalCurrentAssets + totalFixedAssets;
  const liabPayables = accounts.find((a) => a.code === "2101")?.balance || 0;
  const liabVat = accounts.find((a) => a.code === "2103")?.balance || 0;
  const liabDelivery = accounts.find((a) => a.code === "2104")?.balance || 0;
  const totalLiabilities = liabPayables + liabVat + liabDelivery;
  const eqCapital = accounts.find((a) => a.code === "3101")?.balance || 0;
  const eqRetained = accounts.find((a) => a.code === "3201")?.balance || 0;
  const totalEquity = eqCapital + eqRetained + netProfit;
  const confirmedSalesForTax = invoices.filter(isConfirmedSalesInvoice);
  const totalSalesTaxable = confirmedSalesForTax.reduce((acc, inv) => acc + (inv.subtotal - inv.discountTotal), 0);
  const totalOutputVat = confirmedSalesForTax.reduce((acc, inv) => acc + inv.taxAmount, 0);
  const totalPurchasesTaxable = purchases.reduce((acc, p) => acc + p.subtotal, 0);
  const totalInputVat = purchases.reduce((acc, p) => acc + p.taxAmount, 0);
  const netVatPayable = totalOutputVat - totalInputVat;
  const reportsCategories = [
    { group: "\u0627\u0644\u0643\u0634\u0648\u0641\u0627\u062A \u0627\u0644\u062A\u0634\u063A\u064A\u0644\u064A\u0629 \u0627\u0644\u0645\u0634\u062A\u0631\u0643\u0629 \u0645\u0639 \u062A\u0644\u062C\u0631\u0627\u0645", items: [
      { id: "purchases_report", name: "\u0643\u0634\u0641 \u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A", icon: Truck2 },
      { id: "inventory_report", name: "\u0643\u0634\u0641 \u0646\u0648\u0627\u0642\u0635 \u0627\u0644\u0645\u062E\u0632\u0648\u0646", icon: Boxes },
      { id: "expenses_report", name: "\u0643\u0634\u0641 \u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062A", icon: Wallet }
    ] },
    {
      group: "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0648\u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A",
      items: [
        { id: "customer_statement", name: "1. \u0643\u0634\u0641 \u062D\u0633\u0627\u0628 \u062A\u0641\u0635\u064A\u0644\u064A \u0639\u0645\u064A\u0644", icon: Users },
        { id: "customer_items", name: "2. \u0643\u0634\u0641 \u062D\u0633\u0627\u0628 \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0644\u0644\u0639\u0645\u064A\u0644", icon: Boxes }
      ]
    },
    {
      group: "\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0645\u0648\u0631\u062F\u064A\u0646 \u0648\u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A",
      items: [
        { id: "supplier_statement", name: "3. \u0643\u0634\u0641 \u062D\u0633\u0627\u0628 \u062A\u0641\u0635\u064A\u0644\u064A \u0645\u0648\u0631\u062F", icon: Truck2 },
        { id: "supplier_items", name: "4. \u0643\u0634\u0641 \u062D\u0633\u0627\u0628 \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0644\u0644\u0645\u0648\u0631\u062F", icon: Boxes }
      ]
    },
    {
      group: "\u0633\u0646\u062F\u0627\u062A \u0627\u0644\u0642\u0628\u0636 \u0648\u0627\u0644\u0635\u0631\u0641",
      items: [
        { id: "receipt_vouchers", name: "5. \u0643\u0634\u0641 \u062A\u0641\u0635\u064A\u0644\u064A \u0633\u0646\u062F\u0627\u062A \u0627\u0644\u0642\u0628\u0636", icon: Receipt },
        { id: "payment_vouchers", name: "6. \u0643\u0634\u0641 \u062A\u0641\u0635\u064A\u0644\u064A \u0633\u0646\u062F\u0627\u062A \u0627\u0644\u0635\u0631\u0641", icon: Wallet }
      ]
    },
    {
      group: "\u0627\u0644\u0645\u0648\u0638\u0641\u0648\u0646 \u0648\u0627\u0644\u062E\u0632\u0627\u0626\u0646",
      items: [
        { id: "employee_statement", name: "7. \u0643\u0634\u0641 \u062D\u0633\u0627\u0628 \u062A\u0641\u0635\u064A\u0644\u064A \u0645\u0648\u0638\u0641", icon: UserCheck2 },
        { id: "payroll_sheets", name: "8. \u0643\u0634\u0641 \u0631\u0648\u0627\u062A\u0628 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646", icon: FileSpreadsheet },
        { id: "treasuries_movement", name: "9. \u0643\u0634\u0641 \u062A\u0641\u0635\u064A\u0644\u064A \u0644\u0644\u0635\u0646\u0627\u062F\u064A\u0642", icon: Landmark }
      ]
    },
    {
      group: "\u0627\u0644\u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u062E\u062A\u0627\u0645\u064A\u0629 \u0648\u0627\u0644\u0636\u0631\u064A\u0628\u064A\u0629",
      items: [
        { id: "income", name: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062F\u062E\u0644 \u0648\u0627\u0644\u0623\u0631\u0628\u0627\u062D", icon: TrendingUp },
        { id: "balance_sheet", name: "\u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629 \u0627\u0644\u0639\u0645\u0648\u0645\u064A\u0629", icon: BarChart3 },
        { id: "vat", name: "\u0627\u0644\u0625\u0642\u0631\u0627\u0631 \u0627\u0644\u0636\u0631\u064A\u0628\u064A \u0627\u0644\u0645\u0639\u062A\u0645\u062F", icon: Percent }
      ]
    }
  ];
  return /* @__PURE__ */ jsxs7("div", { className: "space-y-5", dir: "rtl", children: [
    /* @__PURE__ */ jsxs7("div", { className: "bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 print:hidden", children: [
      /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-2.5", children: [
        /* @__PURE__ */ jsx8("div", { className: "w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center font-bold", children: /* @__PURE__ */ jsx8(BarChart3, { className: "w-5 h-5" }) }),
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsx8("h1", { className: "text-base font-bold text-slate-900", children: "\u0645\u0631\u0643\u0632 \u0627\u0644\u062A\u0642\u0627\u0631\u064A\u0631 \u0627\u0644\u0645\u062D\u0627\u0633\u0628\u064A\u0629 \u0648\u0627\u0644\u062A\u0641\u0635\u064A\u0644\u064A\u0629" }),
          /* @__PURE__ */ jsx8("p", { className: "text-[10px] text-slate-400 font-light", children: "\u0643\u0634\u0648\u0641\u0627\u062A \u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629\u060C \u062D\u0631\u0643\u0627\u062A \u0648\u062A\u062C\u0645\u064A\u0639 \u0627\u0644\u0623\u0635\u0646\u0627\u0641\u060C \u0633\u0646\u062F\u0627\u062A \u0627\u0644\u0642\u0628\u0636 \u0648\u0627\u0644\u0635\u0631\u0641\u060C \u0627\u0644\u0631\u0648\u0627\u062A\u0628 \u0648\u0627\u0644\u0635\u0646\u0627\u062F\u064A\u0642 \u0648\u0627\u0644\u0642\u0648\u0627\u0626\u0645 \u0627\u0644\u0645\u0627\u0644\u064A\u0629" })
        ] })
      ] }),
      /* @__PURE__ */ jsx8("div", { className: "flex items-center gap-2", children: /* @__PURE__ */ jsxs7(
        "button",
        {
          onClick: handlePrint,
          className: "flex items-center gap-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold px-3.5 py-2 rounded-lg shadow-xs transition-colors cursor-pointer",
          children: [
            /* @__PURE__ */ jsx8(Printer, { className: "w-4 h-4" }),
            /* @__PURE__ */ jsx8("span", { children: "\u0637\u0628\u0627\u0639\u0629 \u0627\u0644\u062A\u0642\u0631\u064A\u0631" })
          ]
        }
      ) })
    ] }),
    /* @__PURE__ */ jsxs7("div", { className: "bg-white p-3 rounded-xl border border-slate-200 shadow-xs print:hidden space-y-2", children: [
      /* @__PURE__ */ jsx8("div", { className: "flex items-center gap-1 text-[11px] text-slate-400 font-bold mb-1", children: /* @__PURE__ */ jsx8("span", { children: "\u0627\u062E\u062A\u0631 \u0627\u0644\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0645\u0637\u0644\u0648\u0628:" }) }),
      /* @__PURE__ */ jsx8("div", { className: "flex flex-wrap gap-1.5", children: reportsCategories.flatMap((cat) => cat.items).map((item) => {
        const Icon = item.icon;
        const isSelected = activeReport === item.id;
        return /* @__PURE__ */ jsxs7(
          "button",
          {
            onClick: () => setActiveReport(item.id),
            className: `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${isSelected ? "bg-blue-600 text-white shadow-xs font-bold" : "bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200"}`,
            children: [
              /* @__PURE__ */ jsx8(Icon, { className: "w-3.5 h-3.5" }),
              /* @__PURE__ */ jsx8("span", { children: item.name })
            ]
          },
          item.id
        );
      }) })
    ] }),
    /* @__PURE__ */ jsxs7("div", { className: "bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center justify-between gap-3 print:hidden text-xs", children: [
      /* @__PURE__ */ jsxs7("div", { className: "flex flex-wrap items-center gap-3", children: [
        (activeReport === "customer_statement" || activeReport === "customer_items") && /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-2 flex-wrap min-w-[280px]", children: [
          /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-1.5 font-bold text-slate-700 whitespace-nowrap text-xs", children: [
            /* @__PURE__ */ jsx8("div", { className: "p-1 rounded bg-blue-100 text-blue-700", children: /* @__PURE__ */ jsx8(Users, { className: "w-3.5 h-3.5" }) }),
            /* @__PURE__ */ jsx8("span", { children: "\u0627\u0644\u0632\u0628\u0648\u0646 / \u0627\u0644\u0639\u0645\u064A\u0644:" })
          ] }),
          /* @__PURE__ */ jsx8("div", { className: "w-64 sm:w-72", children: /* @__PURE__ */ jsx8(
            AutocompleteCombobox,
            {
              items: customerComboboxOptions,
              selectedId: selectedSubCustomerId !== "all" ? selectedSubCustomerId : selectedCustomerId,
              value: parties.find((p) => p.id === (selectedSubCustomerId !== "all" ? selectedSubCustomerId : selectedCustomerId))?.name || "",
              onSelect: (opt) => {
                if (opt.raw) {
                  if (opt.raw.parentPartyId) {
                    setSelectedCustomerId(opt.raw.parentPartyId);
                    setSelectedSubCustomerId(opt.raw.id);
                  } else {
                    setSelectedCustomerId(opt.raw.id);
                    setSelectedSubCustomerId("all");
                  }
                }
              },
              entityType: "customer",
              placeholder: "\u0627\u0628\u062D\u062B \u0648\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0632\u0628\u0648\u0646 \u0644\u0644\u0645\u0637\u0627\u0628\u0642\u0629...",
              className: "w-full text-xs",
              inputClassName: "py-1 px-2.5 text-xs font-bold bg-slate-50 border-slate-200"
            }
          ) }),
          subCustomersForSelected.length > 0 && /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx8("span", { className: "font-bold text-slate-500", children: "\u0627\u0644\u0632\u0628\u0648\u0646 \u0627\u0644\u0641\u0631\u0639\u064A:" }),
            /* @__PURE__ */ jsxs7(
              "select",
              {
                value: selectedSubCustomerId,
                onChange: (e) => setSelectedSubCustomerId(e.target.value),
                className: "bg-blue-50 border border-blue-200 rounded-lg px-2.5 py-1 text-xs text-blue-900 font-semibold",
                children: [
                  /* @__PURE__ */ jsx8("option", { value: "all", children: "\u0643\u0644 \u0627\u0644\u0632\u0628\u0627\u0626\u0646 \u0627\u0644\u0641\u0631\u0639\u064A\u064A\u0646 \u0648\u0627\u0644\u062A\u0627\u0628\u0639\u0650\u064A\u0646" }),
                  subCustomersForSelected.map((sub) => /* @__PURE__ */ jsx8("option", { value: sub.id, children: sub.name }, sub.id))
                ]
              }
            )
          ] }),
          activeReport === "customer_statement" && /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-1.5 flex-wrap", children: [
            /* @__PURE__ */ jsx8("div", { className: "h-6 w-px bg-slate-200 self-center hidden sm:block mx-0.5" }),
            /* @__PURE__ */ jsx8(
              "button",
              {
                type: "button",
                onClick: () => setShowStatementItemDetails((prev) => !prev),
                className: `px-2 py-1 rounded-lg font-bold text-[10.5px] cursor-pointer transition-colors flex items-center gap-1.5 border select-none ${showStatementItemDetails ? "bg-blue-600 text-white border-blue-700 shadow-xs" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"}`,
                children: /* @__PURE__ */ jsx8("span", { children: showStatementItemDetails ? "\u0625\u062E\u0641\u0627\u0621 \u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631" : "\u0625\u0638\u0647\u0627\u0631 \u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0648\u0627\u0644\u0645\u0642\u0627\u0633\u0627\u062A" })
              }
            ),
            /* @__PURE__ */ jsxs7(
              "button",
              {
                type: "button",
                onClick: () => setShowStatementImageThumbnails((prev) => !prev),
                className: `px-2 py-1 rounded-lg font-bold text-[10.5px] cursor-pointer transition-all flex items-center gap-1 border select-none ${showStatementImageThumbnails ? "bg-purple-600 text-white border-purple-700 shadow-2xs hover:bg-purple-700" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"}`,
                title: showStatementImageThumbnails ? "\u0625\u062E\u0641\u0627\u0621 \u0645\u0635\u063A\u0631\u0627\u062A \u0635\u0648\u0631 \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0645\u0646 \u0627\u0644\u0643\u0634\u0641" : "\u0625\u0638\u0647\u0627\u0631 \u0645\u0635\u063A\u0631\u0627\u062A \u0635\u0648\u0631 \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u062A\u062D\u062A \u062C\u062F\u0648\u0644 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629",
                children: [
                  /* @__PURE__ */ jsx8(ImageIcon, { className: `w-3 h-3 ${showStatementImageThumbnails ? "text-amber-300" : "text-purple-600"}` }),
                  /* @__PURE__ */ jsx8("span", { children: showStatementImageThumbnails ? "\u0625\u062E\u0641\u0627\u0621 \u0635\u0648\u0631 \u0627\u0644\u0623\u0635\u0646\u0627\u0641" : "\u0625\u0638\u0647\u0627\u0631 \u0635\u0648\u0631 \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u{1F5BC}\uFE0F" })
                ]
              }
            ),
            /* @__PURE__ */ jsxs7("div", { className: "text-[10px] text-slate-500 font-bold bg-slate-100 border border-slate-200 rounded px-2 py-1 select-none", children: [
              "\u0639\u062F\u062F \u0627\u0644\u062D\u0631\u0643\u0627\u062A: ",
              /* @__PURE__ */ jsx8("strong", { className: "font-mono text-slate-900", children: customerStatementData?.rows?.length || 0 })
            ] })
          ] })
        ] }),
        (activeReport === "supplier_statement" || activeReport === "supplier_items") && /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-2 flex-wrap min-w-[280px]", children: [
          /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-1.5 font-bold text-slate-700 whitespace-nowrap text-xs", children: [
            /* @__PURE__ */ jsx8("div", { className: "p-1 rounded bg-amber-100 text-amber-700", children: /* @__PURE__ */ jsx8(Truck2, { className: "w-3.5 h-3.5" }) }),
            /* @__PURE__ */ jsx8("span", { children: "\u0627\u0644\u0645\u0648\u0631\u062F:" })
          ] }),
          /* @__PURE__ */ jsx8("div", { className: "w-64 sm:w-72", children: /* @__PURE__ */ jsx8(
            AutocompleteCombobox,
            {
              items: supplierComboboxOptions,
              selectedId: selectedSubSupplierId !== "all" ? selectedSubSupplierId : selectedSupplierId,
              value: parties.find((p) => p.id === (selectedSubSupplierId !== "all" ? selectedSubSupplierId : selectedSupplierId))?.name || "",
              onSelect: (opt) => {
                if (opt.raw) {
                  if (opt.raw.parentPartyId) {
                    setSelectedSupplierId(opt.raw.parentPartyId);
                    setSelectedSubSupplierId(opt.raw.id);
                  } else {
                    setSelectedSupplierId(opt.raw.id);
                    setSelectedSubSupplierId("all");
                  }
                }
              },
              entityType: "supplier",
              placeholder: "\u0627\u0628\u062D\u062B \u0648\u0627\u0643\u062A\u0628 \u0627\u0633\u0645 \u0627\u0644\u0645\u0648\u0631\u062F \u0644\u0644\u0645\u0637\u0627\u0628\u0642\u0629...",
              className: "w-full text-xs",
              inputClassName: "py-1 px-2.5 text-xs font-bold bg-slate-50 border-slate-200"
            }
          ) }),
          subSuppliersForSelected.length > 0 && /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-1.5", children: [
            /* @__PURE__ */ jsx8("span", { className: "font-bold text-slate-500", children: "\u0627\u0644\u0641\u0631\u0639\u064A:" }),
            /* @__PURE__ */ jsxs7(
              "select",
              {
                value: selectedSubSupplierId,
                onChange: (e) => setSelectedSubSupplierId(e.target.value),
                className: "bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 text-xs text-amber-900 font-semibold",
                children: [
                  /* @__PURE__ */ jsx8("option", { value: "all", children: "\u0643\u0644 \u0627\u0644\u0641\u0631\u0648\u0639 \u0627\u0644\u062A\u0627\u0628\u0639\u0629" }),
                  subSuppliersForSelected.map((sub) => /* @__PURE__ */ jsx8("option", { value: sub.id, children: sub.name }, sub.id))
                ]
              }
            )
          ] }),
          activeReport === "supplier_statement" && /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-1.5 flex-wrap", children: [
            /* @__PURE__ */ jsx8("div", { className: "h-6 w-px bg-slate-200 self-center hidden sm:block mx-0.5" }),
            /* @__PURE__ */ jsx8(
              "button",
              {
                type: "button",
                onClick: () => setShowStatementItemDetails((prev) => !prev),
                className: `px-2 py-1 rounded-lg font-bold text-[10.5px] cursor-pointer transition-colors flex items-center gap-1.5 border select-none ${showStatementItemDetails ? "bg-amber-700 text-white border-amber-800 shadow-xs" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-100"}`,
                children: /* @__PURE__ */ jsx8("span", { children: showStatementItemDetails ? "\u0625\u062E\u0641\u0627\u0621 \u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631" : "\u0625\u0638\u0647\u0627\u0631 \u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0648\u0627\u0644\u0645\u0642\u0627\u0633\u0627\u062A" })
              }
            ),
            /* @__PURE__ */ jsxs7("div", { className: "text-[10px] text-slate-500 font-bold bg-slate-100 border border-slate-200 rounded px-2 py-1 select-none", children: [
              "\u0639\u062F\u062F \u0627\u0644\u062D\u0631\u0643\u0627\u062A: ",
              /* @__PURE__ */ jsx8("strong", { className: "font-mono text-slate-900", children: supplierStatementData?.rows?.length || 0 })
            ] })
          ] })
        ] }),
        activeReport === "employee_statement" && /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-2 flex-wrap min-w-[280px]", children: [
          /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-1.5 font-bold text-slate-700 whitespace-nowrap text-xs", children: [
            /* @__PURE__ */ jsx8(UserCheck2, { className: "w-4 h-4 text-purple-600" }),
            /* @__PURE__ */ jsx8("span", { children: "\u0627\u062E\u062A\u064A\u0627\u0631 \u0627\u0644\u0645\u0648\u0638\u0641:" })
          ] }),
          /* @__PURE__ */ jsx8("div", { className: "w-64", children: /* @__PURE__ */ jsx8(
            AutocompleteCombobox,
            {
              items: employeeComboboxOptions,
              selectedId: selectedEmpId,
              value: employees.find((employee) => employee.id === selectedEmpId)?.name || "",
              onSelect: (employee) => setSelectedEmpId(employee.id),
              entityType: "employee",
              placeholder: "\u0627\u0628\u062D\u062B \u0628\u0627\u0644\u0627\u0633\u0645 \u0623\u0648 \u0631\u0642\u0645 \u0627\u0644\u0645\u0648\u0638\u0641..."
            }
          ) }),
          /* @__PURE__ */ jsxs7("div", { className: "text-[10px] text-slate-500 font-bold bg-slate-100 border border-slate-200 rounded px-2 py-1 select-none", children: [
            "\u0639\u062F\u062F \u0627\u0644\u062D\u0631\u0643\u0627\u062A: ",
            /* @__PURE__ */ jsx8("strong", { className: "font-mono text-slate-900", children: employeeStatementData?.rows?.length || 0 })
          ] })
        ] }),
        (activeReport === "treasuries_movement" || activeReport === "receipt_vouchers" || activeReport === "payment_vouchers") && /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-2", children: [
          /* @__PURE__ */ jsx8("span", { className: "font-bold text-slate-700", children: "\u0627\u0644\u062E\u0632\u064A\u0646\u0629 / \u0627\u0644\u062D\u0633\u0627\u0628:" }),
          /* @__PURE__ */ jsxs7(
            "select",
            {
              value: activeReport === "treasuries_movement" ? selectedTreasuryCode : activeReport === "receipt_vouchers" ? receiptTreasuryFilter : paymentTreasuryFilter,
              onChange: (e) => {
                const val = e.target.value;
                if (activeReport === "treasuries_movement") setSelectedTreasuryCode(val);
                else if (activeReport === "receipt_vouchers") setReceiptTreasuryFilter(val);
                else setPaymentTreasuryFilter(val);
              },
              className: "bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800",
              children: [
                /* @__PURE__ */ jsx8("option", { value: "all", children: "\u0643\u0644 \u0627\u0644\u062E\u0632\u0627\u0626\u0646 \u0648\u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0628\u0646\u0643\u064A\u0629" }),
                treasuries.map((t) => /* @__PURE__ */ jsx8("option", { value: t.accountCode, children: t.name }, t.id))
              ]
            }
          )
        ] })
      ] }),
      /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-2 text-slate-600", children: [
        /* @__PURE__ */ jsx8("span", { className: "text-[11px] text-slate-400", children: "\u0645\u0646:" }),
        /* @__PURE__ */ jsx8(
          DateInput,
          {
            value: fromDate,
            onChange: (e) => setFromDate(e.target.value),
            className: "bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs"
          }
        ),
        /* @__PURE__ */ jsx8("span", { className: "text-[11px] text-slate-400", children: "\u0625\u0644\u0649:" }),
        /* @__PURE__ */ jsx8(
          DateInput,
          {
            value: toDate,
            onChange: (e) => setToDate(e.target.value),
            className: "bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs"
          }
        ),
        (fromDate || toDate) && /* @__PURE__ */ jsx8(
          "button",
          {
            onClick: () => {
              setFromDate("");
              setToDate("");
            },
            className: "text-rose-600 text-[11px] font-bold hover:underline cursor-pointer",
            children: "\u0625\u0644\u063A\u0627\u0621"
          }
        )
      ] })
    ] }),
    activeReport === "customer_statement" && /* @__PURE__ */ jsx8("div", { className: "bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-3 print:p-0 print:border-0 print:shadow-none report-a4-container", children: customerStatementData.statement ? /* @__PURE__ */ jsx8(
      UnifiedPartyStatementDocument,
      {
        partyStatement: customerStatementData.statement,
        isCustomer: true,
        settings,
        clientDisplayName: customerStatementData.party?.name === "\u0632\u0628\u0648\u0646 \u0646\u0642\u062F\u064A" && selectedSubCustObj ? selectedSubCustObj.name : customerStatementData.party?.name || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F",
        fromDate,
        toDate,
        showItemDetails: showStatementItemDetails,
        showImageThumbnailsInStatement: showStatementImageThumbnails,
        setPreviewModalImage
      }
    ) : /* @__PURE__ */ jsx8("div", { className: "text-center text-slate-500 p-8", children: "\u0627\u062E\u062A\u0631 \u0639\u0645\u064A\u0644\u0627\u064B \u0644\u0639\u0631\u0636 \u0643\u0634\u0641 \u062D\u0633\u0627\u0628\u0647" }) }),
    activeReport === "customer_items" && /* @__PURE__ */ jsxs7("div", { className: "report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3", children: [
      /* @__PURE__ */ jsx8(
        PrintHeader,
        {
          title: "\u0643\u0634\u0641 \u0645\u0628\u064A\u0639\u0627\u062A \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0627\u0644\u062A\u0631\u0627\u0643\u0645\u064A \u0644\u0644\u0639\u0645\u064A\u0644",
          subtitle: customerItemsData.party ? `\u0627\u0644\u0639\u0645\u064A\u0644: ${customerItemsData.party.name}` : void 0,
          docDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        }
      ),
      /* @__PURE__ */ jsxs7("div", { className: "flex items-center justify-between border-b pb-2", children: [
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsx8("span", { className: "text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded", children: "\u062A\u0642\u0631\u064A\u0631 \u0645\u0628\u064A\u0639\u0627\u062A \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0627\u0644\u062A\u0631\u0627\u0643\u0645\u064A" }),
          /* @__PURE__ */ jsxs7("h2", { className: "text-sm font-bold text-slate-900 mt-1", children: [
            "\u0643\u0634\u0641 \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0627\u0644\u0645\u0633\u062D\u0648\u0628\u0629 \u0644\u0644\u0639\u0645\u064A\u0644: ",
            customerItemsData.party?.name
          ] }),
          /* @__PURE__ */ jsx8("p", { className: "text-[10px] text-slate-400 font-light mt-0.5", children: "\u062A\u062C\u0645\u064A\u0639 \u0643\u0645\u064A\u0627\u062A \u0648\u0642\u064A\u0645 \u0627\u0644\u0623\u0635\u0646\u0627\u0641 \u0648\u0645\u0648\u0627\u062F \u0627\u0644\u0637\u0628\u0627\u0639\u0629 \u0627\u0644\u0645\u0633\u062D\u0648\u0628\u0629 \u0645\u0646 \u0642\u0628\u0644 \u0627\u0644\u0639\u0645\u064A\u0644 \u0644\u0644\u0641\u062A\u0631\u0629 \u0627\u0644\u0645\u062D\u062F\u062F\u0629" })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "text-left", children: [
          /* @__PURE__ */ jsx8("span", { className: "text-[11px] text-slate-400 block", children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A:" }),
          /* @__PURE__ */ jsxs7("strong", { className: "text-lg font-mono font-bold text-indigo-600", children: [
            customerItemsData.totalAmount.toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] }),
          /* @__PURE__ */ jsxs7("span", { className: "text-[10px] text-slate-400 block font-mono", children: [
            "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0648\u062D\u062F\u0627\u062A: ",
            customerItemsData.totalQuantity.toLocaleString("ar-SA")
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx8("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs7("table", { className: "w-full text-right report-table border-collapse", children: [
        /* @__PURE__ */ jsx8("thead", { className: "bg-slate-800 text-white font-semibold border-b", children: /* @__PURE__ */ jsxs7("tr", { children: [
          /* @__PURE__ */ jsx8("th", { className: "text-center w-10 min-w-10", children: "\u0645" }),
          /* @__PURE__ */ jsx8("th", { children: "\u0627\u0633\u0645 \u0627\u0644\u0635\u0646\u0641 / \u0627\u0644\u0645\u0637\u0628\u0648\u0639" }),
          /* @__PURE__ */ jsx8("th", { children: "\u0627\u0644\u062A\u0635\u0646\u064A\u0641" }),
          /* @__PURE__ */ jsx8("th", { children: "\u0627\u0644\u0648\u062D\u062F\u0629" }),
          /* @__PURE__ */ jsx8("th", { className: "text-center w-14 min-w-14", children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0643\u0645\u064A\u0629" }),
          /* @__PURE__ */ jsx8("th", { className: "text-left w-20 min-w-20", children: "\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u0633\u0639\u0631" }),
          /* @__PURE__ */ jsx8("th", { className: "text-left w-24 min-w-24", children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0642\u064A\u0645\u0629" }),
          /* @__PURE__ */ jsx8("th", { className: "text-center w-20 min-w-20", children: "\u0622\u062E\u0631 \u0633\u062D\u0628" }),
          /* @__PURE__ */ jsx8("th", { className: "text-center w-16 min-w-16", children: "\u0639\u062F\u062F \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631" })
        ] }) }),
        /* @__PURE__ */ jsx8("tbody", { className: "divide-y divide-slate-200 text-slate-700", children: customerItemsData.items.length === 0 ? /* @__PURE__ */ jsx8("tr", { children: /* @__PURE__ */ jsx8("td", { colSpan: 9, className: "py-6 text-center text-slate-400", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0633\u062D\u0648\u0628\u0627\u062A \u0623\u0635\u0646\u0627\u0641 \u0644\u0647\u0630\u0627 \u0627\u0644\u0639\u0645\u064A\u0644 \u062E\u0644\u0627\u0644 \u0627\u0644\u0641\u062A\u0631\u0629" }) }) : customerItemsData.items.map((item, itemIdx) => {
          const avgPrice = item.totalQuantity > 0 ? item.totalAmount / item.totalQuantity : 0;
          return /* @__PURE__ */ jsxs7("tr", { className: "hover:bg-slate-50", children: [
            /* @__PURE__ */ jsx8("td", { className: "font-mono font-bold text-slate-600 text-center", children: itemIdx + 1 }),
            /* @__PURE__ */ jsx8("td", { className: "font-bold text-slate-900", children: item.itemName }),
            /* @__PURE__ */ jsx8("td", { className: "text-slate-600", children: item.category }),
            /* @__PURE__ */ jsx8("td", { className: "text-slate-500", children: item.unit }),
            /* @__PURE__ */ jsx8("td", { className: "font-mono font-bold text-indigo-700 text-center", children: item.totalQuantity.toLocaleString("ar-SA") }),
            /* @__PURE__ */ jsxs7("td", { className: "font-mono text-slate-700 text-left", children: [
              avgPrice.toLocaleString("ar-SA", { maximumFractionDigits: 2 }),
              " ",
              settings.currency
            ] }),
            /* @__PURE__ */ jsxs7("td", { className: "font-mono font-bold text-slate-900 text-left", children: [
              item.totalAmount.toLocaleString("ar-SA"),
              " ",
              settings.currency
            ] }),
            /* @__PURE__ */ jsx8("td", { className: "font-mono text-slate-500 text-center", children: item.lastDate }),
            /* @__PURE__ */ jsx8("td", { className: "font-mono text-blue-600 font-semibold text-center", children: item.invoiceCount })
          ] }, `cust-item-${item.itemId || itemIdx}-${itemIdx}`);
        }) }),
        /* @__PURE__ */ jsx8("tfoot", { className: "bg-slate-100 font-bold border-t border-slate-300", children: /* @__PURE__ */ jsxs7("tr", { children: [
          /* @__PURE__ */ jsx8("td", { colSpan: 4, className: "text-slate-800", children: "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0639\u0627\u0645:" }),
          /* @__PURE__ */ jsx8("td", { className: "font-mono text-indigo-700 font-black text-center", children: customerItemsData.totalQuantity.toLocaleString("ar-SA") }),
          /* @__PURE__ */ jsx8("td", {}),
          /* @__PURE__ */ jsxs7("td", { className: "font-mono text-slate-900 font-black text-left", children: [
            customerItemsData.totalAmount.toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] }),
          /* @__PURE__ */ jsx8("td", { colSpan: 2 })
        ] }) })
      ] }) }),
      /* @__PURE__ */ jsx8(ReportSignatures, { rightLabel: "\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u062A\u0642\u0631\u064A\u0631", centerLabel: "\u062A\u0648\u0642\u064A\u0639 \u0648\u062E\u062A\u0645 \u0627\u0644\u0639\u0645\u064A\u0644 \u0628\u0627\u0644\u0645\u0637\u0627\u0628\u0642\u0629", leftLabel: "\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0627\u0644\u064A \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F" })
    ] }),
    activeReport === "supplier_statement" && /* @__PURE__ */ jsx8("div", { className: "bg-white rounded-xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-3 print:p-0 print:border-0 print:shadow-none report-a4-container", children: supplierStatementData.statement ? /* @__PURE__ */ jsx8(
      UnifiedPartyStatementDocument,
      {
        partyStatement: supplierStatementData.statement,
        isCustomer: false,
        settings,
        clientDisplayName: supplierStatementData.party?.name === "\u0632\u0628\u0648\u0646 \u0646\u0642\u062F\u064A" && selectedSubSuppObj ? selectedSubSuppObj.name : supplierStatementData.party?.name || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F",
        fromDate,
        toDate,
        showItemDetails: showStatementItemDetails,
        showImageThumbnailsInStatement: showStatementImageThumbnails,
        setPreviewModalImage
      }
    ) : /* @__PURE__ */ jsx8("div", { className: "text-center text-slate-500 p-8", children: "\u0627\u062E\u062A\u0631 \u0645\u0648\u0631\u062F\u0627\u064B \u0644\u0639\u0631\u0636 \u0643\u0634\u0641 \u062D\u0633\u0627\u0628\u0647" }) }),
    activeReport === "supplier_items" && /* @__PURE__ */ jsxs7("div", { className: "report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3", children: [
      /* @__PURE__ */ jsx8(
        PrintHeader,
        {
          title: "\u0643\u0634\u0641 \u0627\u0644\u062E\u0627\u0645\u0627\u062A \u0648\u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0627\u0644\u062A\u0631\u0627\u0643\u0645\u064A \u0644\u0644\u0645\u0648\u0631\u062F",
          subtitle: supplierItemsData.party ? `\u0627\u0644\u0645\u0648\u0631\u062F: ${supplierItemsData.party.name}` : void 0,
          docDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        }
      ),
      /* @__PURE__ */ jsxs7("div", { className: "flex items-center justify-between border-b pb-2", children: [
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsx8("span", { className: "text-[10px] text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded", children: "\u062A\u0642\u0631\u064A\u0631 \u062E\u0627\u0645\u0627\u062A \u0648\u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0627\u0644\u0645\u0648\u0631\u062F \u0627\u0644\u062A\u0631\u0627\u0643\u0645\u064A" }),
          /* @__PURE__ */ jsxs7("h2", { className: "text-sm font-bold text-slate-900 mt-1", children: [
            "\u0643\u0634\u0641 \u0627\u0644\u062E\u0627\u0645\u0627\u062A \u0627\u0644\u0645\u0648\u0631\u062F\u0629 \u0645\u0646: ",
            supplierItemsData.party?.name
          ] }),
          /* @__PURE__ */ jsx8("p", { className: "text-[10px] text-slate-400 font-light mt-0.5", children: "\u062A\u062C\u0645\u064A\u0639 \u0627\u0644\u062E\u0627\u0645\u0627\u062A \u0648\u0645\u0633\u062A\u0644\u0632\u0645\u0627\u062A \u0627\u0644\u0625\u0646\u062A\u0627\u062C \u0648\u0623\u0644\u0648\u0627\u062D \u0627\u0644\u0648\u0631\u0642 \u0627\u0644\u0645\u0648\u0631\u062F\u0629 \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u0645\u0648\u0631\u062F \u062E\u0644\u0627\u0644 \u0627\u0644\u0641\u062A\u0631\u0629 \u0627\u0644\u0645\u062D\u062F\u062F\u0629" })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "text-left", children: [
          /* @__PURE__ */ jsx8("span", { className: "text-[11px] text-slate-400 block", children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0642\u064A\u0645\u0629 \u0627\u0644\u062A\u0648\u0631\u064A\u062F\u0627\u062A:" }),
          /* @__PURE__ */ jsxs7("strong", { className: "text-lg font-mono font-bold text-amber-700", children: [
            supplierItemsData.totalAmount.toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] }),
          /* @__PURE__ */ jsxs7("span", { className: "text-[10px] text-slate-400 block font-mono", children: [
            "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0643\u0645\u064A\u0627\u062A: ",
            supplierItemsData.totalQuantity.toLocaleString("ar-SA")
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx8("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs7("table", { className: "w-full text-right report-table border-collapse", children: [
        /* @__PURE__ */ jsx8("thead", { className: "bg-slate-800 text-white font-semibold border-b", children: /* @__PURE__ */ jsxs7("tr", { children: [
          /* @__PURE__ */ jsx8("th", { children: "\u0627\u0633\u0645 \u0627\u0644\u062E\u0627\u0645\u0629 / \u0627\u0644\u0635\u0646\u0641" }),
          /* @__PURE__ */ jsx8("th", { className: "text-center w-16 min-w-16", children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0643\u0645\u064A\u0629" }),
          /* @__PURE__ */ jsx8("th", { className: "text-left w-24 min-w-24", children: "\u0645\u062A\u0648\u0633\u0637 \u0627\u0644\u062A\u0643\u0644\u0641\u0629" }),
          /* @__PURE__ */ jsx8("th", { className: "text-left w-24 min-w-24", children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0642\u064A\u0645\u0629" }),
          /* @__PURE__ */ jsx8("th", { className: "text-center w-20 min-w-20", children: "\u0622\u062E\u0631 \u062A\u0648\u0631\u064A\u062F" }),
          /* @__PURE__ */ jsx8("th", { className: "text-center w-16 min-w-16", children: "\u0639\u062F\u062F \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631" })
        ] }) }),
        /* @__PURE__ */ jsx8("tbody", { className: "divide-y divide-slate-200 text-slate-700", children: supplierItemsData.items.length === 0 ? /* @__PURE__ */ jsx8("tr", { children: /* @__PURE__ */ jsx8("td", { colSpan: 6, className: "py-6 text-center text-slate-400", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u062A\u0648\u0631\u064A\u062F\u0627\u062A \u0623\u0635\u0646\u0627\u0641 \u0645\u0646 \u0647\u0630\u0627 \u0627\u0644\u0645\u0648\u0631\u062F \u062E\u0644\u0627\u0644 \u0627\u0644\u0641\u062A\u0631\u0629" }) }) : supplierItemsData.items.map((item, itemIdx) => {
          const avgCost = item.totalQuantity > 0 ? item.totalAmount / item.totalQuantity : 0;
          return /* @__PURE__ */ jsxs7("tr", { className: "hover:bg-slate-50", children: [
            /* @__PURE__ */ jsx8("td", { className: "font-bold text-slate-900", children: item.itemName }),
            /* @__PURE__ */ jsx8("td", { className: "font-mono font-bold text-amber-700 text-center", children: item.totalQuantity.toLocaleString("ar-SA") }),
            /* @__PURE__ */ jsxs7("td", { className: "font-mono text-slate-700 text-left", children: [
              avgCost.toLocaleString("ar-SA", { maximumFractionDigits: 2 }),
              " ",
              settings.currency
            ] }),
            /* @__PURE__ */ jsxs7("td", { className: "font-mono font-bold text-slate-900 text-left", children: [
              item.totalAmount.toLocaleString("ar-SA"),
              " ",
              settings.currency
            ] }),
            /* @__PURE__ */ jsx8("td", { className: "font-mono text-slate-500 text-center", children: item.lastDate }),
            /* @__PURE__ */ jsx8("td", { className: "font-mono text-amber-600 font-semibold text-center", children: item.invoiceCount })
          ] }, `supp-item-${item.itemId || itemIdx}-${itemIdx}`);
        }) }),
        /* @__PURE__ */ jsx8("tfoot", { className: "bg-slate-100 font-bold border-t border-slate-300", children: /* @__PURE__ */ jsxs7("tr", { children: [
          /* @__PURE__ */ jsx8("td", { className: "text-slate-800", children: "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0639\u0627\u0645:" }),
          /* @__PURE__ */ jsx8("td", { className: "font-mono text-amber-700 font-black text-center", children: supplierItemsData.totalQuantity.toLocaleString("ar-SA") }),
          /* @__PURE__ */ jsx8("td", {}),
          /* @__PURE__ */ jsxs7("td", { className: "font-mono text-slate-900 font-black text-left", children: [
            supplierItemsData.totalAmount.toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] }),
          /* @__PURE__ */ jsx8("td", { colSpan: 2 })
        ] }) })
      ] }) }),
      /* @__PURE__ */ jsx8(ReportSignatures, { rightLabel: "\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u062A\u0642\u0631\u064A\u0631", centerLabel: "\u0645\u0635\u0627\u062F\u0642\u0629 \u0648\u062E\u062A\u0645 \u0627\u0644\u0645\u0648\u0631\u062F", leftLabel: "\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0627\u0644\u064A \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F" })
    ] }),
    activeReport === "receipt_vouchers" && /* @__PURE__ */ jsxs7("div", { className: "report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3", children: [
      /* @__PURE__ */ jsx8(
        PrintHeader,
        {
          title: "\u062A\u0642\u0631\u064A\u0631 \u0648\u0643\u0634\u0641 \u0633\u0646\u062F\u0627\u062A \u0627\u0644\u0642\u0628\u0636",
          subtitle: "\u0633\u062C\u0644 \u0627\u0644\u0645\u0628\u0627\u0644\u063A \u0627\u0644\u0645\u0642\u0628\u0648\u0636\u0629 \u0648\u0627\u0644\u062A\u062D\u0635\u064A\u0644\u0627\u062A \u0627\u0644\u0645\u0627\u0644\u064A\u0629",
          docDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        }
      ),
      /* @__PURE__ */ jsxs7("div", { className: "flex items-center justify-between border-b pb-2", children: [
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsx8("span", { className: "text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded", children: "\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u062A\u062D\u0635\u064A\u0644\u0627\u062A \u0648\u0627\u0644\u0645\u0642\u0628\u0648\u0636\u0627\u062A" }),
          /* @__PURE__ */ jsx8("h2", { className: "text-sm font-bold text-slate-900 mt-1", children: "\u0643\u0634\u0641 \u062A\u0641\u0635\u064A\u0644\u064A \u0644\u0633\u0646\u062F\u0627\u062A \u0627\u0644\u0642\u0628\u0636" }),
          /* @__PURE__ */ jsx8("p", { className: "text-[10px] text-slate-400 font-light mt-0.5", children: "\u0633\u062C\u0644 \u0643\u0627\u0641\u0629 \u0627\u0644\u0645\u0628\u0627\u0644\u063A \u0627\u0644\u0645\u0642\u0628\u0648\u0636\u0629 \u0645\u0646 \u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0648\u062C\u0647\u0627\u062A \u0627\u0644\u062A\u062D\u0635\u064A\u0644 \u0627\u0644\u0645\u062E\u062A\u0644\u0641\u0629" })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "text-left", children: [
          /* @__PURE__ */ jsx8("span", { className: "text-[11px] text-slate-400 block", children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0642\u0628\u0648\u0636\u0627\u062A:" }),
          /* @__PURE__ */ jsxs7("strong", { className: "text-lg font-mono font-bold text-emerald-600", children: [
            receiptVouchersData.reduce((s, v) => s + v.amount, 0).toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] }),
          /* @__PURE__ */ jsxs7("span", { className: "text-[10px] text-slate-400 block", children: [
            "\u0639\u062F\u062F \u0627\u0644\u0633\u0646\u062F\u0627\u062A: ",
            receiptVouchersData.length
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx8("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs7("table", { className: "w-full text-right report-table border-collapse", children: [
        /* @__PURE__ */ jsx8("thead", { className: "bg-slate-800 text-white font-semibold border-b", children: /* @__PURE__ */ jsxs7("tr", { children: [
          /* @__PURE__ */ jsx8("th", { className: "w-20 min-w-20 text-center", children: "\u0631\u0642\u0645 \u0627\u0644\u0633\u0646\u062F" }),
          /* @__PURE__ */ jsx8("th", { className: "w-20 min-w-20 text-center", children: "\u0627\u0644\u062A\u0627\u0631\u064A\u062E" }),
          /* @__PURE__ */ jsx8("th", { children: "\u0627\u0633\u0645 \u0627\u0644\u0639\u0645\u064A\u0644 / \u0627\u0644\u0645\u0633\u062A\u0644\u0645 \u0645\u0646\u0647" }),
          /* @__PURE__ */ jsx8("th", { children: "\u0627\u0644\u0628\u064A\u0627\u0646 \u0648\u0627\u0644\u0634\u0631\u062D" }),
          /* @__PURE__ */ jsx8("th", { className: "w-20 min-w-20 text-center", children: "\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u0642\u0628\u0636" }),
          /* @__PURE__ */ jsx8("th", { className: "w-24 min-w-24", children: "\u0627\u0644\u062E\u0632\u064A\u0646\u0629" }),
          /* @__PURE__ */ jsx8("th", { className: "w-24 min-w-24 text-left", children: "\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u0642\u0628\u0648\u0636" })
        ] }) }),
        /* @__PURE__ */ jsx8("tbody", { className: "divide-y divide-slate-200 text-slate-700", children: receiptVouchersData.length === 0 ? /* @__PURE__ */ jsx8("tr", { children: /* @__PURE__ */ jsx8("td", { colSpan: 7, className: "py-6 text-center text-slate-400", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0633\u0646\u062F\u0627\u062A \u0642\u0628\u0636 \u0645\u0637\u0627\u0628\u0642\u0629" }) }) : receiptVouchersData.map((v, idx) => /* @__PURE__ */ jsxs7("tr", { className: "hover:bg-slate-50", children: [
          /* @__PURE__ */ jsx8("td", { className: "font-mono font-bold text-emerald-700 text-center", children: v.voucherNumber }),
          /* @__PURE__ */ jsx8("td", { className: "font-mono text-slate-600 text-center", children: v.date }),
          /* @__PURE__ */ jsx8("td", { className: "font-semibold text-slate-900", children: v.partyName }),
          /* @__PURE__ */ jsx8("td", { className: "text-slate-600 max-w-[200px] truncate", children: v.description }),
          /* @__PURE__ */ jsx8("td", { className: "text-center", children: /* @__PURE__ */ jsx8("span", { className: "bg-emerald-50 text-emerald-800 px-1.5 py-0.5 rounded text-[10.5px] font-medium", children: v.paymentMethod === "cash" ? "\u0646\u0642\u062F\u0627\u064B" : v.paymentMethod === "bank_transfer" ? "\u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A" : "\u0634\u064A\u0643" }) }),
          /* @__PURE__ */ jsx8("td", { className: "text-slate-600 font-medium", children: treasuries.find((t) => t.accountCode === v.accountCode || t.accountCode === v.treasuryAccountCode)?.name || "\u0627\u0644\u062E\u0632\u064A\u0646\u0629" }),
          /* @__PURE__ */ jsxs7("td", { className: "font-mono font-bold text-emerald-700 text-left", children: [
            v.amount.toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] })
        ] }, `${v.id || "rec-v"}-${idx}`)) }),
        /* @__PURE__ */ jsx8("tfoot", { className: "bg-slate-100 font-bold border-t border-slate-300", children: /* @__PURE__ */ jsxs7("tr", { children: [
          /* @__PURE__ */ jsx8("td", { colSpan: 6, className: "text-slate-800", children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0642\u0628\u0648\u0636\u0627\u062A:" }),
          /* @__PURE__ */ jsxs7("td", { className: "font-mono font-black text-emerald-700 text-left", children: [
            receiptVouchersData.reduce((s, v) => s + v.amount, 0).toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] })
        ] }) })
      ] }) }),
      /* @__PURE__ */ jsx8(ReportSignatures, { rightLabel: "\u0623\u0645\u064A\u0646 \u0627\u0644\u0635\u0646\u062F\u0648\u0642 / \u0627\u0644\u0645\u062D\u0635\u0644", centerLabel: "\u0627\u0644\u0645\u0631\u0627\u062C\u0639 \u0648\u0627\u0644\u0645\u062D\u0627\u0633\u0628", leftLabel: "\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0627\u0644\u064A \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F" })
    ] }),
    activeReport === "payment_vouchers" && /* @__PURE__ */ jsxs7("div", { className: "report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3", children: [
      /* @__PURE__ */ jsx8(
        PrintHeader,
        {
          title: "\u062A\u0642\u0631\u064A\u0631 \u0648\u0643\u0634\u0641 \u0633\u0646\u062F\u0627\u062A \u0627\u0644\u0635\u0631\u0641",
          subtitle: "\u0633\u062C\u0644 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A \u0648\u0627\u0644\u0645\u0646\u0635\u0631\u0641\u0627\u062A \u0648\u0627\u0644\u0645\u0633\u062F\u062F\u0627\u062A",
          docDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        }
      ),
      /* @__PURE__ */ jsxs7("div", { className: "flex items-center justify-between border-b pb-2", children: [
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsx8("span", { className: "text-[10px] text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded", children: "\u062A\u0642\u0631\u064A\u0631 \u0627\u0644\u0645\u062F\u0641\u0648\u0639\u0627\u062A \u0648\u0627\u0644\u0645\u0646\u0635\u0631\u0641\u0627\u062A" }),
          /* @__PURE__ */ jsx8("h2", { className: "text-sm font-bold text-slate-900 mt-1", children: "\u0643\u0634\u0641 \u062A\u0641\u0635\u064A\u0644\u064A \u0644\u0633\u0646\u062F\u0627\u062A \u0627\u0644\u0635\u0631\u0641" }),
          /* @__PURE__ */ jsx8("p", { className: "text-[10px] text-slate-400 font-light mt-0.5", children: "\u0633\u062C\u0644 \u0627\u0644\u0645\u0628\u0627\u0644\u063A \u0627\u0644\u0645\u0633\u062F\u062F\u0629 \u0644\u0644\u0645\u0648\u0631\u062F\u064A\u0646 \u0648\u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0648\u0627\u0644\u0639\u0647\u062F \u0627\u0644\u0646\u0642\u062F\u064A\u0629 \u0648\u0627\u0644\u0628\u0646\u0643\u064A\u0629" })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "text-left", children: [
          /* @__PURE__ */ jsx8("span", { className: "text-[11px] text-slate-400 block", children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0646\u0635\u0631\u0641\u0627\u062A:" }),
          /* @__PURE__ */ jsxs7("strong", { className: "text-lg font-mono font-bold text-rose-600", children: [
            paymentVouchersData.reduce((s, v) => s + v.amount, 0).toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] }),
          /* @__PURE__ */ jsxs7("span", { className: "text-[10px] text-slate-400 block", children: [
            "\u0639\u062F\u062F \u0627\u0644\u0633\u0646\u062F\u0627\u062A: ",
            paymentVouchersData.length
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx8("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs7("table", { className: "w-full text-right report-table border-collapse", children: [
        /* @__PURE__ */ jsx8("thead", { className: "bg-slate-800 text-white font-semibold border-b", children: /* @__PURE__ */ jsxs7("tr", { children: [
          /* @__PURE__ */ jsx8("th", { className: "w-20 min-w-20 text-center", children: "\u0631\u0642\u0645 \u0627\u0644\u0633\u0646\u062F" }),
          /* @__PURE__ */ jsx8("th", { className: "w-20 min-w-20 text-center", children: "\u0627\u0644\u062A\u0627\u0631\u064A\u062E" }),
          /* @__PURE__ */ jsx8("th", { children: "\u0627\u0644\u0645\u0633\u062A\u0641\u064A\u062F / \u0627\u0644\u0645\u0648\u0631\u062F" }),
          /* @__PURE__ */ jsx8("th", { children: "\u0627\u0644\u0628\u064A\u0627\u0646 \u0648\u0627\u0644\u0634\u0631\u062D" }),
          /* @__PURE__ */ jsx8("th", { className: "w-20 min-w-20 text-center", children: "\u0637\u0631\u064A\u0642\u0629 \u0627\u0644\u0635\u0631\u0641" }),
          /* @__PURE__ */ jsx8("th", { className: "w-24 min-w-24", children: "\u0627\u0644\u062E\u0632\u064A\u0646\u0629" }),
          /* @__PURE__ */ jsx8("th", { className: "w-24 min-w-24 text-left", children: "\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0645\u0635\u0631\u0648\u0641" })
        ] }) }),
        /* @__PURE__ */ jsx8("tbody", { className: "divide-y divide-slate-200 text-slate-700", children: paymentVouchersData.length === 0 ? /* @__PURE__ */ jsx8("tr", { children: /* @__PURE__ */ jsx8("td", { colSpan: 7, className: "py-6 text-center text-slate-400", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0633\u0646\u062F\u0627\u062A \u0635\u0631\u0641 \u0645\u0637\u0627\u0628\u0642\u0629" }) }) : paymentVouchersData.map((v, idx) => /* @__PURE__ */ jsxs7("tr", { className: "hover:bg-slate-50", children: [
          /* @__PURE__ */ jsx8("td", { className: "font-mono font-bold text-rose-700 text-center", children: v.voucherNumber }),
          /* @__PURE__ */ jsx8("td", { className: "font-mono text-slate-600 text-center", children: v.date }),
          /* @__PURE__ */ jsx8("td", { className: "font-semibold text-slate-900", children: v.partyName }),
          /* @__PURE__ */ jsx8("td", { className: "text-slate-600 max-w-[200px] truncate", children: v.description }),
          /* @__PURE__ */ jsx8("td", { className: "text-center", children: /* @__PURE__ */ jsx8("span", { className: "bg-rose-50 text-rose-800 px-1.5 py-0.5 rounded text-[10.5px] font-medium", children: v.paymentMethod === "cash" ? "\u0646\u0642\u062F\u0627\u064B" : v.paymentMethod === "bank_transfer" ? "\u062A\u062D\u0648\u064A\u0644 \u0628\u0646\u0643\u064A" : "\u0634\u064A\u0643" }) }),
          /* @__PURE__ */ jsx8("td", { className: "text-slate-600 font-medium", children: treasuries.find((t) => t.accountCode === v.accountCode || t.accountCode === v.treasuryAccountCode)?.name || "\u0627\u0644\u062E\u0632\u064A\u0646\u0629" }),
          /* @__PURE__ */ jsxs7("td", { className: "font-mono font-bold text-rose-700 text-left", children: [
            v.amount.toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] })
        ] }, `${v.id || "pay-v"}-${idx}`)) }),
        /* @__PURE__ */ jsx8("tfoot", { className: "bg-slate-100 font-bold border-t border-slate-300", children: /* @__PURE__ */ jsxs7("tr", { children: [
          /* @__PURE__ */ jsx8("td", { colSpan: 6, className: "text-slate-800", children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0646\u0635\u0631\u0641\u0627\u062A:" }),
          /* @__PURE__ */ jsxs7("td", { className: "font-mono font-black text-rose-700 text-left", children: [
            paymentVouchersData.reduce((s, v) => s + v.amount, 0).toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] })
        ] }) })
      ] }) }),
      /* @__PURE__ */ jsx8(ReportSignatures, { rightLabel: "\u0623\u0645\u064A\u0646 \u0627\u0644\u0635\u0646\u062F\u0648\u0642 / \u0627\u0644\u0635\u0627\u0631\u0641", centerLabel: "\u0627\u0644\u0645\u0633\u062A\u0644\u0645 / \u0627\u0644\u0645\u0633\u062A\u0641\u064A\u062F", leftLabel: "\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0627\u0644\u064A \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F" })
    ] }),
    activeReport === "employee_statement" && /* @__PURE__ */ jsxs7("div", { className: "report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3", children: [
      /* @__PURE__ */ jsx8(PrintHeader, {}),
      /* @__PURE__ */ jsxs7("div", { className: "text-center font-bold text-base mb-1 mt-2 text-slate-900 leading-relaxed border-b-2 border-slate-900 pb-2", children: [
        "\u0643\u0634\u0641 \u062D\u0633\u0627\u0628 \u0645\u0648\u0638\u0641:",
        " ",
        /* @__PURE__ */ jsx8("span", { className: "text-purple-900", children: employeeStatementData.employee?.name || "\u063A\u064A\u0631 \u0645\u062D\u062F\u062F" }),
        /* @__PURE__ */ jsxs7("div", { className: "text-xs text-slate-600 mt-0.5 font-semibold", children: [
          "\u0645\u0646 \u062A\u0627\u0631\u064A\u062E: ",
          /* @__PURE__ */ jsx8("span", { className: "font-mono", children: fromDate || "\u0628\u062F\u0627\u064A\u0629 \u0627\u0644\u0639\u0645\u0644" }),
          " ",
          "\u0625\u0644\u0649 \u062A\u0627\u0631\u064A\u062E: ",
          /* @__PURE__ */ jsx8("span", { className: "font-mono", children: toDate || "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u064A\u0648\u0645" })
        ] })
      ] }),
      /* @__PURE__ */ jsx8("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs7("table", { className: "w-full text-right report-table border-collapse", children: [
        /* @__PURE__ */ jsx8("thead", { className: "bg-slate-800 text-white font-semibold border-b", children: /* @__PURE__ */ jsxs7("tr", { children: [
          /* @__PURE__ */ jsx8("th", { className: "text-center w-8 min-w-8", children: "\u0645" }),
          /* @__PURE__ */ jsx8("th", { className: "text-center w-20 min-w-20", children: "\u0627\u0644\u062A\u0627\u0631\u064A\u062E" }),
          /* @__PURE__ */ jsx8("th", { children: "\u0627\u0644\u0628\u064A\u0627\u0646 \u0648\u0627\u0644\u0634\u0631\u062D \u0648\u0627\u0644\u062A\u0641\u0627\u0635\u064A\u0644" }),
          /* @__PURE__ */ jsx8("th", { className: "text-left w-24 min-w-24 whitespace-nowrap", children: "\u0627\u0633\u062A\u062D\u0642\u0627\u0642 (+)" }),
          /* @__PURE__ */ jsx8("th", { className: "text-left w-24 min-w-24 whitespace-nowrap", children: "\u0645\u0646\u0635\u0631\u0641 (-)" }),
          /* @__PURE__ */ jsx8("th", { className: "text-left w-28 min-w-28 whitespace-nowrap", children: "\u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u0645\u062A\u0628\u0642\u064A" })
        ] }) }),
        /* @__PURE__ */ jsx8("tbody", { className: "divide-y divide-slate-200", children: employeeStatementData.rows.length === 0 ? /* @__PURE__ */ jsx8("tr", { children: /* @__PURE__ */ jsx8("td", { colSpan: 6, className: "py-6 text-center text-slate-400 font-bold", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u062D\u0631\u0643\u0627\u062A \u0645\u0633\u062C\u0644\u0629 \u0644\u0647\u0630\u0627 \u0627\u0644\u0645\u0648\u0638\u0641 \u062E\u0644\u0627\u0644 \u0627\u0644\u0641\u062A\u0631\u0629 \u0627\u0644\u0645\u062D\u062F\u062F\u0629" }) }) : employeeStatementData.rows.map((row, idx) => /* @__PURE__ */ jsxs7(
          "tr",
          {
            className: `hover:bg-slate-50/80 transition-colors ${idx % 2 === 1 ? "bg-slate-50/40" : "bg-white"}`,
            children: [
              /* @__PURE__ */ jsx8("td", { className: "text-center text-slate-500 font-mono", children: idx + 1 }),
              /* @__PURE__ */ jsx8("td", { className: "font-mono text-slate-700 text-center whitespace-nowrap", children: row.date }),
              /* @__PURE__ */ jsx8("td", { children: /* @__PURE__ */ jsxs7("div", { className: "font-bold text-slate-900 leading-tight flex flex-wrap items-center gap-1", children: [
                /* @__PURE__ */ jsx8("span", { className: "text-slate-900 font-bold", children: row.type }),
                row.refNumber && /* @__PURE__ */ jsxs7(Fragment3, { children: [
                  /* @__PURE__ */ jsx8("span", { className: "text-slate-400 font-normal", children: "-" }),
                  /* @__PURE__ */ jsx8("span", { className: "font-mono font-bold text-slate-800", children: row.refNumber })
                ] }),
                row.description && /* @__PURE__ */ jsxs7(Fragment3, { children: [
                  /* @__PURE__ */ jsx8("span", { className: "text-slate-400 font-normal", children: "-" }),
                  /* @__PURE__ */ jsx8("span", { className: "text-slate-700 font-medium", children: row.description })
                ] })
              ] }) }),
              /* @__PURE__ */ jsx8("td", { className: "font-mono font-bold text-purple-700 text-left whitespace-nowrap", children: row.dueAmount > 0 ? row.dueAmount.toFixed(2) : "-" }),
              /* @__PURE__ */ jsx8("td", { className: "font-mono font-bold text-rose-700 text-left whitespace-nowrap", children: row.paidAmount > 0 ? row.paidAmount.toFixed(2) : "-" }),
              /* @__PURE__ */ jsx8("td", { className: "font-mono font-black text-slate-900 text-left bg-slate-50/70 whitespace-nowrap", children: row.runningBalance.toFixed(2) })
            ]
          },
          idx
        )) }),
        /* @__PURE__ */ jsx8("tfoot", { className: "bg-slate-100 font-bold border-t border-slate-300 text-slate-900", children: /* @__PURE__ */ jsxs7("tr", { children: [
          /* @__PURE__ */ jsx8("td", { colSpan: 3, className: "text-left font-sans", children: "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0639\u0627\u0645 \u0644\u0644\u062D\u0631\u0643\u0627\u062A \u0628\u0627\u0644\u0641\u062A\u0631\u0629:" }),
          /* @__PURE__ */ jsx8("td", { className: "text-left font-mono text-purple-800 font-black whitespace-nowrap", children: employeeStatementData.totalDue.toFixed(2) }),
          /* @__PURE__ */ jsx8("td", { className: "text-left font-mono text-rose-800 font-black whitespace-nowrap", children: employeeStatementData.totalPaid.toFixed(2) }),
          /* @__PURE__ */ jsxs7("td", { className: "text-left font-mono text-slate-900 font-black bg-slate-200/80 whitespace-nowrap", children: [
            employeeStatementData.netBalance.toFixed(2),
            " ",
            settings.currency
          ] })
        ] }) })
      ] }) }),
      /* @__PURE__ */ jsx8("div", { className: "mt-2 p-1.5 bg-slate-50 border border-slate-400 rounded-md space-y-1.5 shadow-2xs print:border-slate-300", children: /* @__PURE__ */ jsxs7("div", { className: "grid grid-cols-3 gap-1.5 text-xs", children: [
        /* @__PURE__ */ jsxs7("div", { className: "bg-white border border-purple-300 rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs", children: [
          /* @__PURE__ */ jsx8("span", { className: "font-bold text-purple-900 text-[11px] whitespace-nowrap", children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0633\u062A\u062D\u0642\u0627\u062A:" }),
          /* @__PURE__ */ jsxs7("div", { className: "font-black font-mono text-purple-700 text-xs flex items-center gap-1 whitespace-nowrap", children: [
            /* @__PURE__ */ jsx8("span", { children: employeeStatementData.totalDue.toFixed(2) }),
            /* @__PURE__ */ jsx8("span", { className: "text-[9px] font-sans font-bold opacity-75", children: settings.currency })
          ] })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "bg-white border border-rose-300 rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs", children: [
          /* @__PURE__ */ jsx8("span", { className: "font-bold text-rose-900 text-[11px] whitespace-nowrap", children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0645\u0646\u0635\u0631\u0641:" }),
          /* @__PURE__ */ jsxs7("div", { className: "font-black font-mono text-rose-700 text-xs flex items-center gap-1 whitespace-nowrap", children: [
            /* @__PURE__ */ jsx8("span", { children: employeeStatementData.totalPaid.toFixed(2) }),
            /* @__PURE__ */ jsx8("span", { className: "text-[9px] font-sans font-bold opacity-75", children: settings.currency })
          ] })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: `bg-white border rounded p-1 sm:p-1.5 flex items-center justify-center gap-1.5 shadow-2xs ${employeeStatementData.netBalance > 0 ? "border-purple-400 bg-purple-50/20" : employeeStatementData.netBalance < 0 ? "border-rose-400 bg-rose-50/20" : "border-slate-300"}`, children: [
          /* @__PURE__ */ jsx8("span", { className: "font-bold text-slate-900 text-[11px] whitespace-nowrap", children: "\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A:" }),
          /* @__PURE__ */ jsxs7("div", { className: `font-black font-mono text-xs flex items-center gap-1 whitespace-nowrap ${employeeStatementData.netBalance > 0 ? "text-purple-800" : employeeStatementData.netBalance < 0 ? "text-rose-800" : "text-slate-700"}`, children: [
            /* @__PURE__ */ jsx8("span", { children: Math.abs(employeeStatementData.netBalance).toFixed(2) }),
            /* @__PURE__ */ jsx8("span", { className: "text-[9px] font-sans font-bold opacity-75", children: settings.currency }),
            /* @__PURE__ */ jsxs7("span", { className: "text-[10px] font-sans font-bold", children: [
              "(",
              employeeStatementData.netBalance > 0 ? "\u062F\u0627\u0626\u0646" : employeeStatementData.netBalance < 0 ? "\u0645\u062F\u064A\u0646" : "\u0645\u062A\u0632\u0646",
              ")"
            ] })
          ] })
        ] })
      ] }) }),
      /* @__PURE__ */ jsx8(ReportSignatures, { rightLabel: "\u0627\u0644\u0645\u062D\u0627\u0633\u0628 \u0627\u0644\u0645\u0633\u0624\u0648\u0644", centerLabel: "\u062A\u0648\u0642\u064A\u0639 \u0648\u0627\u0633\u062A\u0644\u0627\u0645 \u0627\u0644\u0645\u0648\u0638\u0641", leftLabel: "\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645 \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F" })
    ] }),
    activeReport === "payroll_sheets" && /* @__PURE__ */ jsxs7("div", { className: "report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3", children: [
      /* @__PURE__ */ jsx8(
        PrintHeader,
        {
          title: "\u0643\u0634\u0641 \u0645\u0633\u064A\u0631\u0627\u062A \u0627\u0644\u0631\u0648\u0627\u062A\u0628 \u0627\u0644\u0634\u0647\u0631\u064A\u0629",
          subtitle: "\u0645\u0644\u062E\u0635 \u0627\u0644\u0631\u0648\u0627\u062A\u0628 \u0648\u0627\u0644\u0628\u062F\u0644\u0627\u062A \u0648\u0627\u0644\u0627\u0633\u062A\u0642\u0637\u0627\u0639\u0627\u062A \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629",
          docDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        }
      ),
      /* @__PURE__ */ jsxs7("div", { className: "flex items-center justify-between border-b pb-2", children: [
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsx8("span", { className: "text-[10px] text-blue-700 font-bold bg-blue-50 px-2 py-0.5 rounded", children: "\u0634\u0624\u0648\u0646 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646 \u0648\u0627\u0644\u0631\u0648\u0627\u062A\u0628" }),
          /* @__PURE__ */ jsx8("h2", { className: "text-sm font-bold text-slate-900 mt-1", children: "\u0643\u0634\u0641 \u0645\u0633\u064A\u0631\u0627\u062A \u0627\u0644\u0631\u0648\u0627\u062A\u0628 \u0627\u0644\u0634\u0647\u0631\u064A\u0629" }),
          /* @__PURE__ */ jsx8("p", { className: "text-[10px] text-slate-400 font-light mt-0.5", children: "\u0645\u0644\u062E\u0635 \u0627\u0644\u0645\u0633\u064A\u0631\u0627\u062A \u0627\u0644\u0645\u0639\u062A\u0645\u062F\u0629 \u0648\u0627\u0644\u0645\u0633\u0648\u062F\u0627\u062A \u0648\u0645\u0628\u0627\u0644\u063A \u0627\u0644\u0631\u0648\u0627\u062A\u0628 \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A\u0629 \u0648\u0627\u0644\u0635\u0627\u0641\u064A\u0629" })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "text-left", children: [
          /* @__PURE__ */ jsx8("span", { className: "text-[11px] text-slate-400 block", children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0631\u0648\u0627\u062A\u0628 \u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0629:" }),
          /* @__PURE__ */ jsxs7("strong", { className: "text-lg font-mono font-bold text-blue-700", children: [
            payrollSheetsData.filter((s) => s.status === "approved").reduce((s, p) => s + p.totalNet, 0).toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx8("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs7("table", { className: "w-full text-right report-table border-collapse", children: [
        /* @__PURE__ */ jsx8("thead", { className: "bg-slate-800 text-white font-semibold border-b", children: /* @__PURE__ */ jsxs7("tr", { children: [
          /* @__PURE__ */ jsx8("th", { className: "text-center w-16 min-w-16", children: "\u0631\u0642\u0645 \u0627\u0644\u0645\u0633\u064A\u0631" }),
          /* @__PURE__ */ jsx8("th", { children: "\u0634\u0647\u0631 \u0627\u0644\u0627\u0633\u062A\u062D\u0642\u0627\u0642" }),
          /* @__PURE__ */ jsx8("th", { className: "text-center w-24 min-w-24", children: "\u0627\u0644\u062D\u0627\u0644\u0629" }),
          /* @__PURE__ */ jsx8("th", { className: "text-center w-20 min-w-20", children: "\u0639\u062F\u062F \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646" }),
          /* @__PURE__ */ jsx8("th", { className: "text-left w-20 min-w-20", children: "\u0627\u0644\u0623\u0633\u0627\u0633\u064A" }),
          /* @__PURE__ */ jsx8("th", { className: "text-left w-20 min-w-20", children: "\u0627\u0644\u0628\u062F\u0644\u0627\u062A" }),
          /* @__PURE__ */ jsx8("th", { className: "text-left w-20 min-w-20", children: "\u0627\u0644\u0627\u0633\u062A\u0642\u0637\u0627\u0639\u0627\u062A" }),
          /* @__PURE__ */ jsx8("th", { className: "text-left w-24 min-w-24", children: "\u0635\u0627\u0641\u064A \u0627\u0644\u0631\u0648\u0627\u062A\u0628" }),
          /* @__PURE__ */ jsx8("th", { className: "text-center w-20 min-w-20", children: "\u062A\u0627\u0631\u064A\u062E \u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F" })
        ] }) }),
        /* @__PURE__ */ jsx8("tbody", { className: "divide-y divide-slate-200 text-slate-700", children: payrollSheetsData.length === 0 ? /* @__PURE__ */ jsx8("tr", { children: /* @__PURE__ */ jsx8("td", { colSpan: 9, className: "py-6 text-center text-slate-400", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u0645\u0633\u064A\u0631\u0627\u062A \u0631\u0648\u0627\u062A\u0628 \u0645\u0633\u062C\u0644\u0629" }) }) : payrollSheetsData.map((sheet) => {
          const sheetItems = sheet.items || sheet.lines || [];
          const employeesCount = sheetItems.length || sheet.employeesCount || 0;
          return /* @__PURE__ */ jsxs7("tr", { className: "hover:bg-slate-50", children: [
            /* @__PURE__ */ jsx8("td", { className: "font-mono font-bold text-blue-600 text-center", children: sheet.sheetNumber }),
            /* @__PURE__ */ jsx8("td", { className: "font-mono font-bold text-slate-900", children: sheet.period || sheet.periodMonth || sheet.title }),
            /* @__PURE__ */ jsx8("td", { className: "text-center", children: /* @__PURE__ */ jsx8("span", { className: `px-1.5 py-0.5 rounded text-[10px] font-bold ${sheet.status === "approved" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-amber-50 text-amber-700 border border-amber-200"}`, children: sheet.status === "approved" ? "\u0645\u0639\u062A\u0645\u062F \u0648\u0645\u0635\u0631\u0648\u0641" : "\u0645\u0633\u0648\u062F\u0629 \u0642\u064A\u062F \u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629" }) }),
            /* @__PURE__ */ jsxs7("td", { className: "font-mono text-center", children: [
              employeesCount,
              " \u0645\u0648\u0638\u0641"
            ] }),
            /* @__PURE__ */ jsx8("td", { className: "font-mono text-slate-700 text-left", children: sheet.totalBasic.toLocaleString("ar-SA") }),
            /* @__PURE__ */ jsxs7("td", { className: "font-mono text-emerald-700 text-left", children: [
              "+",
              sheet.totalAllowances.toLocaleString("ar-SA")
            ] }),
            /* @__PURE__ */ jsxs7("td", { className: "font-mono text-rose-700 text-left", children: [
              "-",
              sheet.totalDeductions.toLocaleString("ar-SA")
            ] }),
            /* @__PURE__ */ jsxs7("td", { className: "font-mono font-bold text-slate-900 text-left", children: [
              sheet.totalNet.toLocaleString("ar-SA"),
              " ",
              settings.currency
            ] }),
            /* @__PURE__ */ jsx8("td", { className: "font-mono text-slate-500 text-center", children: sheet.disbursedAt || sheet.approvedAt || sheet.createdAt || "-" })
          ] }, sheet.id);
        }) })
      ] }) }),
      /* @__PURE__ */ jsx8(ReportSignatures, { rightLabel: "\u0625\u0639\u062F\u0627\u062F \u0634\u0624\u0648\u0646 \u0627\u0644\u0645\u0648\u0638\u0641\u064A\u0646", centerLabel: "\u0627\u0644\u0645\u0631\u0627\u062C\u0639\u0629 \u0627\u0644\u0645\u0627\u0644\u064A\u0629", leftLabel: "\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645 \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F" })
    ] }),
    activeReport === "treasuries_movement" && /* @__PURE__ */ jsxs7("div", { className: "report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3", children: [
      /* @__PURE__ */ jsx8(
        PrintHeader,
        {
          title: "\u0643\u0634\u0641 \u062D\u0631\u0643\u0627\u062A \u0627\u0644\u0635\u0646\u0627\u062F\u064A\u0642 \u0648\u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0628\u0646\u0643\u064A\u0629",
          subtitle: "\u0633\u062C\u0644 \u0627\u0644\u062A\u062F\u0641\u0642\u0627\u062A \u0627\u0644\u0646\u0642\u062F\u064A\u0629 \u0648\u0627\u0644\u0645\u0642\u0628\u0648\u0636\u0627\u062A \u0648\u0627\u0644\u0645\u0646\u0635\u0631\u0641\u0627\u062A",
          docDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        }
      ),
      /* @__PURE__ */ jsxs7("div", { className: "flex flex-col md:flex-row md:items-center justify-between border-b pb-2 gap-2", children: [
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsx8("span", { className: "text-[10px] text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded", children: "\u0625\u062F\u0627\u0631\u0629 \u0627\u0644\u0633\u064A\u0648\u0644\u0629 \u0648\u0627\u0644\u062E\u0632\u0627\u0626\u0646" }),
          /* @__PURE__ */ jsx8("h2", { className: "text-sm font-bold text-slate-900 mt-1", children: "\u0643\u0634\u0641 \u062D\u0631\u0643\u0627\u062A \u0627\u0644\u0635\u0646\u0627\u062F\u064A\u0642 \u0648\u0627\u0644\u062D\u0633\u0627\u0628\u0627\u062A \u0627\u0644\u0628\u0646\u0643\u064A\u0629" }),
          /* @__PURE__ */ jsx8("p", { className: "text-[10px] text-slate-400 font-light mt-0.5", children: "\u062A\u0641\u0627\u0635\u064A\u0644 \u0627\u0644\u062A\u062F\u0641\u0642\u0627\u062A \u0627\u0644\u0646\u0642\u062F\u064A\u0629 \u0627\u0644\u062F\u0627\u062E\u0644\u0629 \u0648\u0627\u0644\u062E\u0627\u0631\u062C\u0629 \u0648\u062D\u0631\u0643\u0627\u062A \u0627\u0644\u0639\u0645\u0644\u0627\u062A \u0627\u0644\u0641\u0639\u0644\u064A\u0629 \u0648\u0623\u0633\u0639\u0627\u0631 \u0627\u0644\u0635\u0631\u0641" })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "text-right sm:text-left space-y-1", children: [
          /* @__PURE__ */ jsx8("span", { className: "text-[10px] text-slate-400 font-light block font-semibold", children: "\u0627\u0644\u0645\u0648\u062C\u0648\u062F\u0627\u062A \u0627\u0644\u0641\u0639\u0644\u064A\u0629 \u0641\u064A \u0627\u0644\u0635\u0646\u0627\u062F\u064A\u0642 \u0627\u0644\u0645\u062E\u062A\u0627\u0631\u0629:" }),
          /* @__PURE__ */ jsx8("div", { className: "flex flex-wrap items-center gap-1.5 justify-end", children: Object.entries(treasuriesMovementData.targetHoldings).map(([currCode, amt]) => {
            const currObj = currencies.find((c) => c.code === currCode);
            const sym = currCode === "ILS" ? "\u20AA" : currObj?.symbol || currCode;
            const name = currObj?.name || currCode;
            const num = Number(amt) || 0;
            return /* @__PURE__ */ jsxs7("div", { className: "bg-slate-50 border border-slate-200 px-2 py-0.5 rounded text-xs flex items-center gap-1", children: [
              /* @__PURE__ */ jsxs7("span", { className: "text-slate-500 font-sans", children: [
                name,
                ":"
              ] }),
              /* @__PURE__ */ jsxs7("strong", { className: "font-mono text-slate-900", children: [
                num.toLocaleString("ar-SA"),
                " ",
                sym
              ] })
            ] }, currCode);
          }) }),
          /* @__PURE__ */ jsxs7("div", { className: "text-[10px] text-slate-400", children: [
            "\u0627\u0644\u0645\u0639\u0627\u062F\u0644 \u0627\u0644\u0645\u062D\u0627\u0633\u0628\u064A \u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A: ",
            /* @__PURE__ */ jsxs7("strong", { className: "font-mono text-teal-700 font-bold", children: [
              treasuriesMovementData.targetTreasuries.reduce((s, t) => s + t.balance, 0).toLocaleString("ar-SA"),
              " \u20AA"
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx8("div", { className: "overflow-x-auto", children: /* @__PURE__ */ jsxs7("table", { className: "w-full text-right report-table border-collapse", children: [
        /* @__PURE__ */ jsx8("thead", { className: "bg-slate-800 text-white font-semibold border-b", children: /* @__PURE__ */ jsxs7("tr", { children: [
          /* @__PURE__ */ jsx8("th", { className: "w-20 min-w-20 text-center", children: "\u0627\u0644\u062A\u0627\u0631\u064A\u062E" }),
          /* @__PURE__ */ jsx8("th", { className: "w-24 min-w-24", children: "\u0627\u0644\u0635\u0646\u062F\u0648\u0642" }),
          /* @__PURE__ */ jsx8("th", { className: "w-20 min-w-20 text-center", children: "\u0627\u0644\u0639\u0645\u0644\u064A\u0629" }),
          /* @__PURE__ */ jsx8("th", { className: "w-16 min-w-16 text-center", children: "\u0627\u0644\u0645\u0633\u062A\u0646\u062F" }),
          /* @__PURE__ */ jsx8("th", { children: "\u0627\u0644\u0637\u0631\u0641 / \u0627\u0644\u0645\u0633\u062A\u0641\u064A\u062F" }),
          /* @__PURE__ */ jsx8("th", { className: "w-20 min-w-20 text-left", children: "\u0627\u0644\u0645\u0628\u0644\u063A \u0627\u0644\u0641\u0639\u0644\u064A" }),
          /* @__PURE__ */ jsx8("th", { className: "w-16 min-w-16 text-center", children: "\u0627\u0644\u0635\u0631\u0641" }),
          /* @__PURE__ */ jsx8("th", { className: "w-20 min-w-20 text-left", children: "\u0648\u0627\u0631\u062F (\u20AA)" }),
          /* @__PURE__ */ jsx8("th", { className: "w-20 min-w-20 text-left", children: "\u0645\u0646\u0635\u0631\u0641 (\u20AA)" }),
          /* @__PURE__ */ jsx8("th", { children: "\u0627\u0644\u0628\u064A\u0627\u0646 \u0648\u0627\u0644\u0634\u0631\u062D" })
        ] }) }),
        /* @__PURE__ */ jsx8("tbody", { className: "divide-y divide-slate-200 text-slate-700", children: treasuriesMovementData.rows.length === 0 ? /* @__PURE__ */ jsx8("tr", { children: /* @__PURE__ */ jsx8("td", { colSpan: 10, className: "py-6 text-center text-slate-400", children: "\u0644\u0627 \u062A\u0648\u062C\u062F \u062D\u0631\u0643\u0627\u062A \u0645\u0633\u062C\u0644\u0629 \u0644\u0644\u0635\u0646\u0627\u062F\u064A\u0642 \u062E\u0644\u0627\u0644 \u0627\u0644\u0641\u062A\u0631\u0629" }) }) : treasuriesMovementData.rows.map((row, idx) => {
          const currObj = currencies.find((c) => c.code === row.actualCurrency);
          const sym = row.actualCurrency === "ILS" ? "\u20AA" : currObj?.symbol || row.actualCurrency;
          return /* @__PURE__ */ jsxs7("tr", { className: "hover:bg-slate-50", children: [
            /* @__PURE__ */ jsx8("td", { className: "font-mono text-slate-600 text-center whitespace-nowrap", children: row.date }),
            /* @__PURE__ */ jsx8("td", { className: "font-semibold text-slate-900", children: row.treasuryName }),
            /* @__PURE__ */ jsx8("td", { className: "text-center font-medium whitespace-nowrap", children: row.type }),
            /* @__PURE__ */ jsx8("td", { className: "font-mono text-blue-600 font-bold text-center whitespace-nowrap", children: row.docNumber }),
            /* @__PURE__ */ jsx8("td", { className: "text-slate-700", children: row.partyName }),
            /* @__PURE__ */ jsxs7("td", { className: "font-mono font-bold text-slate-900 text-left whitespace-nowrap", children: [
              row.actualAmount.toLocaleString("ar-SA"),
              " ",
              sym
            ] }),
            /* @__PURE__ */ jsx8("td", { className: "font-mono text-center text-slate-500 whitespace-nowrap", children: row.exchangeRate.toFixed(4) }),
            /* @__PURE__ */ jsx8("td", { className: "font-mono font-bold text-emerald-700 text-left whitespace-nowrap", children: row.inflow > 0 ? row.inflow.toLocaleString("ar-SA") : "-" }),
            /* @__PURE__ */ jsx8("td", { className: "font-mono font-bold text-rose-700 text-left whitespace-nowrap", children: row.outflow > 0 ? row.outflow.toLocaleString("ar-SA") : "-" }),
            /* @__PURE__ */ jsx8("td", { className: "text-slate-500 max-w-[150px] truncate", children: row.notes })
          ] }, idx);
        }) }),
        /* @__PURE__ */ jsx8("tfoot", { className: "bg-slate-100 font-bold border-t border-slate-300", children: /* @__PURE__ */ jsxs7("tr", { children: [
          /* @__PURE__ */ jsx8("td", { colSpan: 7, className: "text-slate-800", children: /* @__PURE__ */ jsxs7("div", { className: "space-y-1", children: [
            /* @__PURE__ */ jsx8("span", { children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u062A\u062F\u0641\u0642\u0627\u062A \u0627\u0644\u0645\u0643\u0627\u0641\u0626\u0629 (\u0634\u064A\u0643\u0644):" }),
            /* @__PURE__ */ jsxs7("div", { className: "flex flex-wrap gap-2 text-[10.5px] font-normal text-slate-600", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0635\u0627\u0641\u064A \u062D\u0631\u0643\u0629 \u0627\u0644\u0639\u0645\u0644\u0627\u062A:" }),
              Object.entries(treasuriesMovementData.currencyMovements).map(([currCode, mov]) => {
                const m = mov;
                const net = m.in - m.out;
                const currObj = currencies.find((c) => c.code === currCode);
                const sym = currCode === "ILS" ? "\u20AA" : currObj?.symbol || currCode;
                return /* @__PURE__ */ jsxs7("span", { className: `font-mono font-bold px-1.5 py-0.5 rounded ${net >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`, children: [
                  currCode,
                  ": ",
                  net >= 0 ? "+" : "",
                  net.toLocaleString("ar-SA"),
                  " ",
                  sym
                ] }, currCode);
              })
            ] })
          ] }) }),
          /* @__PURE__ */ jsxs7("td", { className: "font-mono text-emerald-700 font-black text-left whitespace-nowrap", children: [
            "+",
            treasuriesMovementData.totalInflow.toLocaleString("ar-SA"),
            " \u20AA"
          ] }),
          /* @__PURE__ */ jsxs7("td", { className: "font-mono text-rose-700 font-black text-left whitespace-nowrap", children: [
            "-",
            treasuriesMovementData.totalOutflow.toLocaleString("ar-SA"),
            " \u20AA"
          ] }),
          /* @__PURE__ */ jsxs7("td", { className: "font-mono text-teal-700 font-black text-left whitespace-nowrap", children: [
            "\u0635\u0627\u0641\u064A: ",
            treasuriesMovementData.netMovement.toLocaleString("ar-SA"),
            " \u20AA"
          ] })
        ] }) })
      ] }) }),
      /* @__PURE__ */ jsx8(ReportSignatures, { rightLabel: "\u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0635\u0646\u062F\u0648\u0642", centerLabel: "\u0627\u0644\u0645\u0631\u0627\u062C\u0639 \u0627\u0644\u062F\u0627\u062E\u0644\u064A", leftLabel: "\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0645\u0627\u0644\u064A \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F" })
    ] }),
    ["purchases_report", "inventory_report", "expenses_report"].includes(activeReport) && /* @__PURE__ */ jsx8(
      OperationalReportDocument,
      {
        kind: activeReport,
        fromDate,
        toDate
      }
    ),
    activeReport === "income" && /* @__PURE__ */ jsxs7("div", { className: "report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3", children: [
      /* @__PURE__ */ jsx8(
        PrintHeader,
        {
          title: "\u0642\u0627\u0626\u0645\u0629 \u0627\u0644\u062F\u062E\u0644 \u0648\u0627\u0644\u0623\u0631\u0628\u0627\u062D \u0648\u0627\u0644\u062E\u0633\u0627\u0626\u0631",
          subtitle: `\u0644\u0644\u0641\u062A\u0631\u0629 \u0627\u0644\u0645\u0646\u062A\u0647\u064A\u0629 \u0641\u064A ${(/* @__PURE__ */ new Date()).toLocaleDateString("ar-SA")}`,
          docDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        }
      ),
      /* @__PURE__ */ jsxs7("div", { className: "space-y-3 text-xs", children: [
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsxs7("div", { className: "font-bold text-xs text-slate-900 bg-slate-100 p-2 rounded mb-1 flex justify-between border border-slate-300", children: [
            /* @__PURE__ */ jsx8("span", { children: "\u0623\u0648\u0644\u0627\u064B: \u0627\u0644\u0625\u064A\u0631\u0627\u062F\u0627\u062A \u0627\u0644\u062A\u0634\u063A\u064A\u0644\u064A\u0629 (Revenues)" }),
            /* @__PURE__ */ jsxs7("span", { className: "font-mono text-blue-700 font-black", children: [
              totalRevenues.toLocaleString("ar-SA"),
              " ",
              settings.currency
            ] })
          ] }),
          /* @__PURE__ */ jsxs7("div", { className: "space-y-1 px-2 text-xs", children: [
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between text-slate-700", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0625\u064A\u0631\u0627\u062F\u0627\u062A \u0623\u0639\u0645\u0627\u0644 \u0648\u0645\u0637\u0628\u0648\u0639\u0627\u062A \u0627\u0644\u0645\u0637\u0628\u0639\u0629:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold", children: [
                revPrinting.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between text-slate-700", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0625\u064A\u0631\u0627\u062F\u0627\u062A \u0645\u0628\u064A\u0639\u0627\u062A \u0627\u0644\u0645\u0643\u062A\u0628\u0629 \u0648\u0627\u0644\u0642\u0631\u0637\u0627\u0633\u064A\u0629:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold", children: [
                revBookstore.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between text-slate-700", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0625\u064A\u0631\u0627\u062F\u0627\u062A \u062E\u062F\u0645\u0627\u062A \u0627\u0644\u062A\u0635\u0648\u064A\u0631 \u0648\u0627\u0644\u062A\u062C\u0644\u064A\u062F:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold", children: [
                revServices.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsxs7("div", { className: "font-bold text-xs text-slate-900 bg-slate-100 p-2 rounded mb-1 flex justify-between border border-slate-300", children: [
            /* @__PURE__ */ jsx8("span", { children: "\u062B\u0627\u0646\u064A\u0627\u064B: \u062A\u0643\u0644\u0641\u0629 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0648\u0627\u0644\u062E\u0627\u0645\u0627\u062A (Cost of Goods Sold)" }),
            /* @__PURE__ */ jsxs7("span", { className: "font-mono text-rose-600 font-black", children: [
              "(",
              totalCogs.toLocaleString("ar-SA"),
              ") ",
              settings.currency
            ] })
          ] }),
          /* @__PURE__ */ jsxs7("div", { className: "space-y-1 px-2 text-xs", children: [
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between text-slate-700", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u062A\u0643\u0644\u0641\u0629 \u062E\u0627\u0645\u0627\u062A \u0648\u0623\u062D\u0628\u0627\u0631 \u0648\u0645\u0633\u062A\u0647\u0644\u0643\u0627\u062A \u0627\u0644\u0637\u0628\u0627\u0639\u0629:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold", children: [
                cogsPrinting.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between text-slate-700", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u062A\u0643\u0644\u0641\u0629 \u0628\u0636\u0627\u0639\u0629 \u0645\u0628\u064A\u0639\u0627\u062A \u0627\u0644\u0642\u0631\u0637\u0627\u0633\u064A\u0629 \u0648\u0627\u0644\u0643\u062A\u0628:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold", children: [
                cogsBookstore.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "bg-emerald-50 border border-emerald-300 p-2 rounded flex justify-between text-xs font-bold text-emerald-900", children: [
          /* @__PURE__ */ jsx8("span", { children: "\u0645\u062C\u0645\u0644 \u0627\u0644\u0631\u0628\u062D (Gross Profit):" }),
          /* @__PURE__ */ jsxs7("span", { className: "font-mono font-black", children: [
            grossProfit.toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] })
        ] }),
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsxs7("div", { className: "font-bold text-xs text-slate-900 bg-slate-100 p-2 rounded mb-1 flex justify-between border border-slate-300", children: [
            /* @__PURE__ */ jsx8("span", { children: "\u062B\u0627\u0644\u062B\u0627\u064B: \u0627\u0644\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0627\u0644\u062A\u0634\u063A\u064A\u0644\u064A\u0629 \u0648\u0627\u0644\u0639\u0645\u0648\u0645\u064A\u0629 (Operating Expenses)" }),
            /* @__PURE__ */ jsxs7("span", { className: "font-mono text-rose-600 font-black", children: [
              "(",
              totalExpenses.toLocaleString("ar-SA"),
              ") ",
              settings.currency
            ] })
          ] }),
          /* @__PURE__ */ jsxs7("div", { className: "space-y-1 px-2 text-xs", children: [
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between text-slate-700", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0627\u0644\u0631\u0648\u0627\u062A\u0628 \u0648\u0627\u0644\u0623\u062C\u0648\u0631:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold", children: [
                expSalaries.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between text-slate-700", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0625\u064A\u062C\u0627\u0631 \u0627\u0644\u0645\u0639\u0631\u0636 \u0648\u0627\u0644\u0645\u0637\u0628\u0639\u0629:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold", children: [
                expRent.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between text-slate-700", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0635\u064A\u0627\u0646\u0629 \u0645\u0627\u0643\u064A\u0646\u0627\u062A \u0627\u0644\u0637\u0628\u0627\u0639\u0629:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold", children: [
                expMaintenance.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between text-slate-700", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0643\u0647\u0631\u0628\u0627\u0621 \u0648\u0627\u0644\u0645\u064A\u0627\u0647:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold", children: [
                expUtilities.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between text-slate-700", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0645\u0635\u0631\u0648\u0641\u0627\u062A \u0639\u0645\u0648\u0645\u064A\u0629 \u0648\u062A\u0633\u0648\u064A\u0642:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold", children: [
                expGeneral.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "bg-slate-900 text-white p-2.5 rounded flex justify-between text-xs font-bold", children: [
          /* @__PURE__ */ jsx8("span", { children: "\u0635\u0627\u0641\u064A \u0627\u0644\u0631\u0628\u062D \u0644\u0644\u0641\u062A\u0631\u0629 (Net Profit):" }),
          /* @__PURE__ */ jsxs7("span", { className: "font-mono font-black text-emerald-400", children: [
            netProfit.toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx8(ReportSignatures, { rightLabel: "\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0645\u062D\u0627\u0633\u0628 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A", centerLabel: "\u0627\u0644\u0645\u0631\u0627\u062C\u0639 \u0627\u0644\u0645\u0627\u0644\u064A", leftLabel: "\u0627\u0644\u0645\u062F\u064A\u0631 \u0627\u0644\u0639\u0627\u0645 \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F" })
    ] }),
    activeReport === "balance_sheet" && /* @__PURE__ */ jsxs7("div", { className: "report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3", children: [
      /* @__PURE__ */ jsx8(
        PrintHeader,
        {
          title: "\u0627\u0644\u0645\u064A\u0632\u0627\u0646\u064A\u0629 \u0627\u0644\u0639\u0645\u0648\u0645\u064A\u0629 \u0648\u0627\u0644\u0645\u0631\u0643\u0632 \u0627\u0644\u0645\u0627\u0644\u064A",
          subtitle: `\u0643\u0645\u0627 \u0641\u064A \u062A\u0627\u0631\u064A\u062E ${(/* @__PURE__ */ new Date()).toLocaleDateString("ar-SA")}`,
          docDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        }
      ),
      /* @__PURE__ */ jsxs7("div", { className: "grid grid-cols-1 md:grid-cols-2 gap-3 text-xs", children: [
        /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx8("h4", { className: "text-xs font-bold text-slate-900 bg-slate-100 p-1.5 rounded border border-slate-300", children: "\u0627\u0644\u062C\u0627\u0646\u0628 \u0627\u0644\u0623\u064A\u0645\u0646: \u0627\u0644\u0623\u0635\u0648\u0644 (Assets)" }),
          /* @__PURE__ */ jsxs7("div", { className: "space-y-1 text-xs", children: [
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0646\u0642\u062F\u064A\u0629 \u0628\u0627\u0644\u0635\u0646\u062F\u0648\u0642 (\u0627\u0644\u0643\u0627\u0634\u064A\u0631):" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono font-semibold", children: assetCash.toLocaleString("ar-SA") })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0623\u0631\u0635\u062F\u0629 \u0627\u0644\u0628\u0646\u0648\u0643:" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono font-semibold", children: assetBank.toLocaleString("ar-SA") })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0627\u0644\u0639\u0645\u0644\u0627\u0621 \u0648\u0627\u0644\u0630\u0645\u0645 \u0627\u0644\u0645\u062F\u064A\u0646\u0629:" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono font-semibold", children: assetReceivables.toLocaleString("ar-SA") })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0645\u062E\u0632\u0648\u0646 \u0627\u0644\u0643\u062A\u0628 \u0648\u0627\u0644\u0642\u0631\u0637\u0627\u0633\u064A\u0629:" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono font-semibold", children: assetInventoryBooks.toLocaleString("ar-SA") })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0645\u062E\u0632\u0648\u0646 \u0627\u0644\u0648\u0631\u0642 \u0648\u062E\u0627\u0645\u0627\u062A \u0627\u0644\u0637\u0628\u0627\u0639\u0629:" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono font-semibold", children: assetInventoryPrint.toLocaleString("ar-SA") })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between pt-1 border-t font-bold", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u0623\u0635\u0648\u0644 \u0627\u0644\u0645\u062A\u062F\u0627\u0648\u0644\u0629:" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono text-blue-700", children: totalCurrentAssets.toLocaleString("ar-SA") })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between pt-1", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0622\u0644\u0627\u062A \u0648\u0645\u0639\u062F\u0627\u062A \u0627\u0644\u0637\u0628\u0627\u0639\u0629 (\u0623\u0635\u0648\u0644 \u062B\u0627\u0628\u062A\u0629):" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono font-semibold", children: totalFixedAssets.toLocaleString("ar-SA") })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between bg-blue-50 border border-blue-200 p-1.5 rounded font-bold text-blue-900 mt-1", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u0623\u0635\u0648\u0644:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono", children: [
                totalAssets.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "space-y-2", children: [
          /* @__PURE__ */ jsx8("h4", { className: "text-xs font-bold text-slate-900 bg-slate-100 p-1.5 rounded border border-slate-300", children: "\u0627\u0644\u062C\u0627\u0646\u0628 \u0627\u0644\u0623\u064A\u0633\u0631: \u0627\u0644\u062E\u0635\u0648\u0645 \u0648\u062D\u0642\u0648\u0642 \u0627\u0644\u0645\u0644\u0643\u064A\u0629" }),
          /* @__PURE__ */ jsxs7("div", { className: "space-y-1 text-xs", children: [
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0627\u0644\u0645\u0648\u0631\u062F\u0648\u0646 \u0648\u0627\u0644\u0630\u0645\u0645 \u0627\u0644\u062F\u0627\u0626\u0646\u0629:" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono font-semibold", children: liabPayables.toLocaleString("ar-SA") })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0623\u0645\u0627\u0646\u0627\u062A \u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629:" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono font-semibold", children: liabVat.toLocaleString("ar-SA") })
            ] }),
            liabDelivery > 0 && /* @__PURE__ */ jsxs7("div", { className: "flex justify-between text-amber-800", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0623\u0645\u0627\u0646\u0627\u062A \u0648\u0645\u0633\u062A\u062D\u0642\u0627\u062A \u0639\u0645\u0627\u0644 \u0627\u0644\u062A\u0648\u0635\u064A\u0644:" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono font-semibold", children: liabDelivery.toLocaleString("ar-SA") })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between pt-1 border-t font-bold", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0625\u062C\u0645\u0627\u0644\u064A \u0627\u0644\u062E\u0635\u0648\u0645 \u0648\u0627\u0644\u0627\u0644\u062A\u0632\u0627\u0645\u0627\u062A:" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono text-rose-700", children: totalLiabilities.toLocaleString("ar-SA") })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between pt-1", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0631\u0623\u0633 \u0627\u0644\u0645\u0627\u0644 \u0627\u0644\u0645\u062F\u0641\u0648\u0639:" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono font-semibold", children: eqCapital.toLocaleString("ar-SA") })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0627\u0644\u0623\u0631\u0628\u0627\u062D \u0627\u0644\u0645\u0628\u0642\u0627\u0629 / \u0627\u0644\u0645\u062D\u062A\u062C\u0632\u0629:" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono font-semibold", children: eqRetained.toLocaleString("ar-SA") })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0623\u0631\u0628\u0627\u062D \u0627\u0644\u0641\u062A\u0631\u0629 \u0627\u0644\u062D\u0627\u0644\u064A\u0629:" }),
              /* @__PURE__ */ jsx8("span", { className: "font-mono font-semibold text-emerald-600", children: netProfit.toLocaleString("ar-SA") })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between bg-blue-50 border border-blue-200 p-1.5 rounded font-bold text-blue-900 mt-1", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0645\u062C\u0645\u0648\u0639 \u0627\u0644\u062E\u0635\u0648\u0645 \u0648\u062D\u0642\u0648\u0642 \u0627\u0644\u0645\u0644\u0643\u064A\u0629:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono", children: [
                totalEquity.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] })
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx8(ReportSignatures, { rightLabel: "\u0625\u0639\u062F\u0627\u062F \u0627\u0644\u0645\u062D\u0627\u0633\u0628 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A", centerLabel: "\u0627\u0644\u0645\u0631\u0627\u062C\u0639 \u0627\u0644\u0645\u0627\u0644\u064A", leftLabel: "\u0645\u062C\u0644\u0633 \u0627\u0644\u0625\u062F\u0627\u0631\u0629 \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F" })
    ] }),
    activeReport === "vat" && /* @__PURE__ */ jsxs7("div", { className: "report-a4-container bg-white p-3 sm:p-5 mx-auto print:p-0 print:border-0 print:shadow-none space-y-3", children: [
      /* @__PURE__ */ jsx8(
        PrintHeader,
        {
          title: "\u0625\u0642\u0631\u0627\u0631 \u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0642\u064A\u0645\u0629 \u0627\u0644\u0645\u0636\u0627\u0641\u0629 \u0627\u0644\u0645\u0639\u062A\u0645\u062F",
          subtitle: `\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0636\u0631\u064A\u0628\u064A: ${settings.taxNumber || "-"}`,
          docDate: (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
        }
      ),
      /* @__PURE__ */ jsxs7("div", { className: "space-y-3 text-xs", children: [
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsxs7("div", { className: "font-bold text-xs text-slate-900 bg-slate-100 p-2 rounded mb-1 flex justify-between border border-slate-300", children: [
            /* @__PURE__ */ jsx8("span", { children: "1. \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0648\u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0645\u062E\u0631\u062C\u0627\u062A:" }),
            /* @__PURE__ */ jsxs7("span", { className: "font-mono text-blue-700 font-black", children: [
              totalOutputVat.toLocaleString("ar-SA"),
              " ",
              settings.currency
            ] })
          ] }),
          /* @__PURE__ */ jsxs7("div", { className: "space-y-1 px-2 text-xs", children: [
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsxs7("span", { children: [
                "\u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u0627\u0644\u062E\u0627\u0636\u0639\u0629 \u0644\u0644\u0646\u0633\u0628\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629 (",
                settings.vatRate || 0,
                "%):"
              ] }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold", children: [
                totalSalesTaxable.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0645\u062E\u0631\u062C\u0627\u062A \u0627\u0644\u0645\u0633\u062A\u062D\u0642\u0629:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold text-blue-600", children: [
                totalOutputVat.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs7("div", { children: [
          /* @__PURE__ */ jsxs7("div", { className: "font-bold text-xs text-slate-900 bg-slate-100 p-2 rounded mb-1 flex justify-between border border-slate-300", children: [
            /* @__PURE__ */ jsx8("span", { children: "2. \u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0648\u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0645\u062F\u062E\u0644\u0627\u062A:" }),
            /* @__PURE__ */ jsxs7("span", { className: "font-mono text-emerald-700 font-black", children: [
              totalInputVat.toLocaleString("ar-SA"),
              " ",
              settings.currency
            ] })
          ] }),
          /* @__PURE__ */ jsxs7("div", { className: "space-y-1 px-2 text-xs", children: [
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0627\u0644\u0645\u0634\u062A\u0631\u064A\u0627\u062A \u0627\u0644\u062E\u0627\u0636\u0639\u0629 \u0644\u0644\u0646\u0633\u0628\u0629 \u0627\u0644\u0623\u0633\u0627\u0633\u064A\u0629:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold", children: [
                totalPurchasesTaxable.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] }),
            /* @__PURE__ */ jsxs7("div", { className: "flex justify-between", children: [
              /* @__PURE__ */ jsx8("span", { children: "\u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0645\u062F\u062E\u0644\u0627\u062A \u0627\u0644\u0642\u0627\u0628\u0644\u0629 \u0644\u0644\u062E\u0635\u0645:" }),
              /* @__PURE__ */ jsxs7("span", { className: "font-mono font-semibold text-emerald-600", children: [
                totalInputVat.toLocaleString("ar-SA"),
                " ",
                settings.currency
              ] })
            ] })
          ] })
        ] }),
        /* @__PURE__ */ jsxs7("div", { className: "bg-slate-900 text-white p-2.5 rounded flex justify-between text-xs font-bold", children: [
          /* @__PURE__ */ jsx8("span", { children: "\u0635\u0627\u0641\u064A \u0627\u0644\u0636\u0631\u064A\u0628\u0629 \u0627\u0644\u0645\u0633\u062A\u062D\u0642\u0629 \u0644\u0644\u0633\u062F\u0627\u062F:" }),
          /* @__PURE__ */ jsxs7("span", { className: "font-mono font-black text-amber-400", children: [
            netVatPayable.toLocaleString("ar-SA"),
            " ",
            settings.currency
          ] })
        ] })
      ] }),
      /* @__PURE__ */ jsx8(ReportSignatures, { rightLabel: "\u0625\u0639\u062F\u0627\u062F \u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0636\u0631\u0627\u0626\u0628", centerLabel: "\u0627\u0644\u0645\u0631\u0627\u062C\u0639 \u0627\u0644\u0642\u0627\u0646\u0648\u0646\u064A", leftLabel: "\u0627\u0644\u0645\u0641\u0648\u0636 \u0628\u0627\u0644\u062A\u0648\u0642\u064A\u0639 \u0648\u0627\u0644\u0627\u0639\u062A\u0645\u0627\u062F" })
    ] }),
    previewModalImage && /* @__PURE__ */ jsx8(
      "div",
      {
        className: "fixed inset-0 z-[150] bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150 print:hidden",
        onClick: () => setPreviewModalImage(null),
        children: /* @__PURE__ */ jsxs7(
          "div",
          {
            className: "bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-300 animate-in zoom-in-95 duration-150",
            onClick: (e) => e.stopPropagation(),
            children: [
              /* @__PURE__ */ jsxs7("div", { className: "p-3.5 bg-slate-900 text-white flex items-center justify-between", children: [
                /* @__PURE__ */ jsxs7("div", { className: "flex items-center gap-2", children: [
                  /* @__PURE__ */ jsx8(ImageIcon, { className: "w-4 h-4 text-purple-400" }),
                  /* @__PURE__ */ jsx8("span", { className: "font-bold text-sm truncate", children: previewModalImage.name })
                ] }),
                /* @__PURE__ */ jsx8(
                  "button",
                  {
                    type: "button",
                    onClick: () => setPreviewModalImage(null),
                    className: "p-1 rounded-lg hover:bg-white/20 text-slate-300 hover:text-white cursor-pointer",
                    children: /* @__PURE__ */ jsx8(X2, { className: "w-5 h-5" })
                  }
                )
              ] }),
              /* @__PURE__ */ jsx8("div", { className: "p-4 bg-slate-950 flex items-center justify-center max-h-[75vh] overflow-hidden", children: /* @__PURE__ */ jsx8(
                "img",
                {
                  src: previewModalImage.url,
                  alt: previewModalImage.name,
                  className: "max-h-[70vh] max-w-full object-contain rounded-lg shadow-lg"
                }
              ) }),
              /* @__PURE__ */ jsxs7("div", { className: "p-3 bg-slate-100 border-t border-slate-200 flex items-center justify-between text-xs", children: [
                /* @__PURE__ */ jsx8("span", { className: "text-slate-600 font-medium", children: "\u0635\u0648\u0631\u0629 \u0645\u0635\u063A\u0631\u0629 \u0644\u0628\u0646\u062F \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629 \u0641\u064A \u0643\u0634\u0641 \u0627\u0644\u062D\u0633\u0627\u0628" }),
                /* @__PURE__ */ jsx8(
                  "button",
                  {
                    type: "button",
                    onClick: () => setPreviewModalImage(null),
                    className: "px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold rounded-lg cursor-pointer transition-colors",
                    children: "\u0625\u063A\u0644\u0627\u0642"
                  }
                )
              ] })
            ]
          }
        )
      }
    )
  ] });
};

// src/utils/reportTypography.ts
var REPORT_TYPOGRAPHY_CSS = [
  "@font-face{font-family:'Helvetica Neue LT Arabic App';src:local('HelveticaNeueLTArabic-Roman'),local('Helvetica Neue LT Arabic 55 Roman'),local('HelveticaNeueLT Arabic 55 Roman');font-weight:400;font-style:normal;font-display:swap}",
  "@font-face{font-family:'Helvetica Neue LT Arabic App';src:local('HelveticaNeueLTArabic-Bold'),local('Helvetica Neue LT Arabic 75 Bold'),local('IBMPlexSansArabic-Bold'),local('IBM Plex Sans Arabic Bold');font-weight:700;font-style:normal;font-display:swap}",
  "body,body *,button,input,select,textarea{font-family:'Helvetica Neue LT Arabic App','Helvetica Neue LT Arabic','IBM Plex Sans Arabic',Tahoma,Arial,sans-serif!important}",
  "h1,h2,h3,h4,h5,h6,th,button,b,strong{font-weight:700!important}"
].join("");

// src/utils/reportBusinessHeader.ts
var escapeAttr = (value) => String(value ?? "").replace(
  /[&<>"']/g,
  (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] || ch
);
var safeImage = (value) => {
  const url = String(value || "").trim();
  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(url) || /^https?:\/\//i.test(url) || /^blob:/i.test(url) ? url : "";
};
var clean = (value) => String(value || "").trim();
var listOf = (values, fallback) => (Array.isArray(values) && values.some((value) => clean(value)) ? values : [fallback || ""]).map(clean).filter(Boolean);
function renderBusinessReportHeader(settings) {
  const business = clean(settings.businessName) || clean(settings.name) || "\u0627\u0644\u0645\u0646\u0634\u0623\u0629";
  const officialLetterhead = safeImage(settings.headerImageUrl || settings.letterheadUrl);
  if (officialLetterhead) {
    return '<div class="business-letterhead"><img src="' + escapeAttr(officialLetterhead) + '" alt="\u062A\u0631\u0648\u064A\u0633\u0629 ' + escapeAttr(business) + '"></div>';
  }
  const logo = safeImage(settings.logoUrl);
  const addresses = listOf(settings.addresses, settings.address);
  const phones = listOf(settings.phones, settings.phone);
  const contact = [
    ...phones.map((phone) => '<span dir="ltr">' + escapeAttr(phone) + "</span>"),
    ...addresses.map((address) => "<span>" + escapeAttr(address) + "</span>"),
    ...clean(settings.email) ? ["<span>" + escapeAttr(settings.email) + "</span>"] : []
  ].join("");
  const legal = [
    settings.taxNumber && settings.showTaxNumberInPrints !== false ? "<span>\u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0636\u0631\u064A\u0628\u064A: " + escapeAttr(settings.taxNumber) + "</span>" : "",
    settings.crNumber && settings.showCrNumberInPrints !== false ? "<span>\u0627\u0644\u0633\u062C\u0644 \u0627\u0644\u062A\u062C\u0627\u0631\u064A: " + escapeAttr(settings.crNumber) + "</span>" : ""
  ].filter(Boolean).join("");
  return '<div class="business-standard">' + (logo ? '<img class="business-logo" src="' + escapeAttr(logo) + '" alt="\u0634\u0639\u0627\u0631 ' + escapeAttr(business) + '">' : "") + '<div class="business-identity"><strong>' + escapeAttr(business) + "</strong>" + (clean(settings.businessNameEn) ? '<small dir="ltr">' + escapeAttr(settings.businessNameEn) + "</small>" : "") + (clean(settings.activityType) ? "<small>" + escapeAttr(settings.activityType) + "</small>" : "") + '</div><div class="business-contact">' + contact + legal + "</div></div>";
}

// src/utils/printDetailedSalesInvoiceRegister.ts
var escapeHtml = (value) => String(value ?? "").replace(
  /[&<>"']/g,
  (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c
);
var number = (value) => {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
};
var money2 = (value) => number(value).toLocaleString("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
var quantity2 = (value) => number(value).toLocaleString("en-US", {
  maximumFractionDigits: 4
});
var dimension = (value) => value === null || value === void 0 || value === "" ? "\u2014" : quantity2(value);
var currencyFor = (invoice) => {
  const code = String(invoice.currency || "ILS");
  const symbol = String(invoice.currencySymbol || (code === "ILS" ? "\u20AA" : code));
  return { code, symbol: symbol === "?" && code === "ILS" ? "\u20AA" : symbol };
};
var joinPieces = (...items) => items.filter(Boolean).map((x) => "<span>" + escapeHtml(x) + "</span>").join('<span class="separator">|</span>');
var treasuryName = (code, treasuries) => {
  if (!code) return "";
  const found = treasuries.find((t) => t.accountCode === code || t.id === code);
  return found?.name || code;
};
function invoicePaymentRows(invoice, treasuries) {
  const paid = number(invoice.paidAmount);
  const unpaid = number(invoice.remainingAmount ?? number(invoice.totalAmount) - paid);
  let cash = number(invoice.cashPaidAmount);
  let bank = number(invoice.bankPaidAmount);
  const method = invoice.paymentMethod;
  if (cash === 0 && bank === 0 && paid > 0) {
    if (method === "card" || method === "bank_transfer") bank = paid;
    else if (method === "cash") cash = paid;
  }
  const rows = [];
  const symbol = currencyFor(invoice).symbol;
  const commonNote = String(invoice.paymentNotes || "").trim();
  if (cash > 5e-3) rows.push({
    kind: "cash",
    account: treasuryName(invoice.cashTreasuryCode || invoice.treasuryAccountCode, treasuries),
    note: bank > 5e-3 ? "" : commonNote,
    amount: cash,
    currency: symbol
  });
  if (bank > 5e-3) rows.push({
    kind: "bank",
    account: treasuryName(invoice.bankTreasuryCode || invoice.treasuryAccountCode, treasuries),
    note: commonNote,
    amount: bank,
    currency: symbol
  });
  const difference = paid - cash - bank;
  if (difference > 0.015) rows.push({
    kind: "other",
    account: "\u062F\u0641\u0639\u0629 \u0645\u0633\u062C\u0644\u0629",
    note: rows.length ? "" : commonNote,
    amount: difference,
    currency: symbol
  });
  if (unpaid > 5e-3) rows.push({
    kind: "credit",
    account: "\u0622\u062C\u0644",
    note: rows.length ? "" : commonNote,
    amount: unpaid,
    currency: symbol
  });
  if (rows.length === 0 && commonNote) rows.push({
    kind: "other",
    account: "\u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0633\u062F\u0627\u062F",
    note: commonNote,
    amount: 0,
    currency: symbol
  });
  return rows;
}
var paymentRowHtml = (row) => {
  const first = row.kind === "cash" ? ["\u0646\u0642\u062F\u064A", row.account] : row.kind === "bank" ? [row.account] : row.kind === "credit" ? ["\u0622\u062C\u0644"] : [row.account];
  const pieces = [...first, row.note, money2(row.amount) + " " + row.currency].filter(Boolean);
  return '<span class="payment-entry' + (row.kind === "bank" ? " bank-entry" : "") + '">' + joinPieces(...pieces) + "</span>";
};
var invoiceKind = (invoice) => invoice.type === "pos" ? "\u0646\u0642\u0637\u0629 \u0628\u064A\u0639" : invoice.type === "print_order" ? "\u0623\u0645\u0631 \u0637\u0628\u0627\u0639\u0629" : "\u0641\u0627\u062A\u0648\u0631\u0629 \u0628\u064A\u0639";
var noteFor = (item) => {
  const notes = [item.description, item.notes, item.dimensions ? "\u0627\u0644\u0623\u0628\u0639\u0627\u062F: " + item.dimensions : ""].map((s) => String(s || "").trim()).filter(Boolean);
  return [...new Set(notes)].join(" | ");
};
var cols = [
  "3%",
  "10%",
  "41%",
  "3.5%",
  "3.5%",
  "3.5%",
  "5%",
  "7%",
  "5%",
  "5%",
  "13.5%"
];
var linesTableHeader = "<colgroup>" + cols.map((width) => '<col style="width:' + width + '">').join("") + "</colgroup><thead><tr><th>#</th><th>\u0643\u0648\u062F \u0627\u0644\u0635\u0646\u0641</th><th>\u0627\u0644\u0635\u0646\u0641 / \u0627\u0644\u0645\u0644\u0627\u062D\u0638\u0627\u062A</th><th>\u0627\u0644\u0637\u0648\u0644</th><th>\u0627\u0644\u0639\u0631\u0636</th><th>\u0627\u0644\u0639\u062F\u062F</th><th>\u0627\u0644\u0643\u0645\u064A\u0629</th><th>\u0633\u0639\u0631 \u0627\u0644\u0648\u062D\u062F\u0629</th><th>\u0627\u0644\u062E\u0635\u0645</th><th>\u0627\u0644\u0636\u0631\u064A\u0628\u0629</th><th>\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A</th></tr></thead>";
function invoiceMarkup(invoice, index, options) {
  const symbol = currencyFor(invoice).symbol;
  const rows = (invoice.items || []).length ? (invoice.items || []).map((item, i) => {
    const note2 = noteFor(item);
    return "<tr><td>" + escapeHtml(i + 1) + '</td><td class="sku">' + escapeHtml(item.itemCode || item.itemId || "\u2014") + '</td><td class="item-cell"><b>' + escapeHtml(item.itemName || "\u2014") + "</b>" + (note2 ? '<span class="item-note"> \u2014 ' + escapeHtml(note2) + "</span>" : "") + '</td><td class="num">' + escapeHtml(dimension(item.length)) + '</td><td class="num">' + escapeHtml(dimension(item.width)) + '</td><td class="num">' + escapeHtml(dimension(item.count)) + '</td><td class="num">' + quantity2(item.quantity) + '</td><td class="num">' + money2(item.unitPrice) + '</td><td class="num">' + money2(item.discount) + '</td><td class="num">' + money2(item.tax) + '</td><td class="num strong">' + money2(item.total) + "</td></tr>";
  }).join("") : '<tr><td colspan="11">\u0644\u0627 \u062A\u0648\u062C\u062F \u0628\u0646\u0648\u062F \u0645\u062D\u0641\u0648\u0638\u0629</td></tr>';
  const totals = [
    ["\u0642\u0628\u0644 \u0627\u0644\u062E\u0635\u0645", invoice.subtotal],
    ["\u0627\u0644\u062E\u0635\u0645", invoice.discountTotal],
    ["\u0627\u0644\u0636\u0631\u064A\u0628\u0629", invoice.taxAmount],
    ...number(invoice.additionalCharges) !== 0 ? [["\u0625\u0636\u0627\u0641\u0627\u062A", invoice.additionalCharges]] : [],
    ["\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A", invoice.totalAmount],
    ["\u0627\u0644\u0645\u062F\u0641\u0648\u0639", invoice.paidAmount],
    ["\u0627\u0644\u0645\u062A\u0628\u0642\u064A", invoice.remainingAmount ?? number(invoice.totalAmount) - number(invoice.paidAmount)]
  ].map(([label, value]) => "<span>" + escapeHtml(label) + ': <b dir="ltr">' + money2(value) + " " + escapeHtml(symbol) + "</b></span>").join("");
  const otherMeta = joinPieces(
    "\u0627\u0644\u0646\u0648\u0639: " + invoiceKind(invoice),
    invoice.warehouse ? "\u0627\u0644\u0645\u062E\u0632\u0646: " + invoice.warehouse : null,
    options.categoryName?.(invoice) ? "\u0627\u0644\u062A\u0635\u0646\u064A\u0641: " + options.categoryName(invoice) : null
  );
  const payment = invoicePaymentRows(invoice, options.treasuries);
  const split = payment.length > 1;
  const note = String(invoice.notes || "").trim();
  return [
    '<article class="invoice">',
    '<div class="invoice-heading"><strong>\u0641\u0627\u062A\u0648\u0631\u0629 ' + escapeHtml(index + 1) + " / <bdi>" + escapeHtml(invoice.invoiceNumber) + "</bdi></strong>",
    "<span>\u0627\u0644\u062A\u0627\u0631\u064A\u062E: " + escapeHtml(formatDateDisplay(invoice.date)) + "</span>",
    '<span class="customer">\u0627\u0644\u0639\u0645\u064A\u0644: ' + escapeHtml(options.customerName(invoice)) + "</span></div>",
    '<table class="lines">' + linesTableHeader + "<tbody>" + rows + "</tbody></table>",
    '<div class="invoice-tail">',
    '<div class="invoice-totals">' + totals + "</div>",
    note ? '<div class="document-note">\u0645\u0644\u0627\u062D\u0638\u0629 \u0627\u0644\u0641\u0627\u062A\u0648\u0631\u0629: ' + escapeHtml(note) + "</div>" : "",
    '<div class="invoice-meta">' + otherMeta + (!split && payment.length ? '<span class="separator">|</span>' + paymentRowHtml(payment[0]) : "") + "</div>",
    split ? '<div class="payment-splits">' + payment.map((row) => '<div class="split-row">' + paymentRowHtml(row) + "</div>").join("") + "</div>" : "",
    "</div></article>"
  ].join("");
}
var pagerJs = [
  "(function(){",
  "  'use strict';",
  "  const pages=document.getElementById('pages');",
  "  const invoiceTemplate=document.getElementById('invoice-sources');",
  "  const intro=document.getElementById('report-intro');",
  "  let body=null;",
  "  const fits=()=>body.scrollHeight<=body.clientHeight+1;",
  "  function newPage(){",
  "    const sheet=document.createElement('div');sheet.className='sheet';",
  "    body=document.createElement('div');body.className='page-body';",
  "    const foot=document.createElement('div');foot.className='page-footer';",
  "    sheet.appendChild(body);sheet.appendChild(foot);pages.appendChild(sheet);",
  "    if(pages.children.length>1){",
  "      const compact=document.createElement('div');compact.className='continuation-head';",
  "      compact.textContent='\u0643\u0634\u0641 \u062A\u0641\u0635\u064A\u0644\u064A \u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A \u2014 \u0645\u062A\u0627\u0628\u0639\u0629';",
  "      body.appendChild(compact);",
  "    }",
  "    return body;",
  "  }",
  "  function startPart(original,continued){",
  "    const part=document.createElement('article');part.className='invoice invoice-fragment';",
  "    const heading=original.querySelector('.invoice-heading').cloneNode(true);",
  "    if(continued){",
  "      const badge=document.createElement('span');badge.className='continued';badge.textContent='(\u0645\u062A\u0627\u0628\u0639\u0629)';",
  "      heading.appendChild(badge);",
  "    }",
  "    part.appendChild(heading);",
  "    const table=original.querySelector('.lines').cloneNode(false);",
  "    table.appendChild(original.querySelector('colgroup').cloneNode(true));",
  "    table.appendChild(original.querySelector('thead').cloneNode(true));",
  "    const tbody=document.createElement('tbody');table.appendChild(tbody);part.appendChild(table);",
  "    body.appendChild(part);return {part,tbody};",
  "  }",
  "  function appendInvoice(original){",
  "    const full=original.cloneNode(true);body.appendChild(full);",
  "    if(fits())return;",
  "    full.remove();",
  "    const allRows=Array.from(original.querySelectorAll('.lines tbody tr'));",
  "    let current=startPart(original,false);",
  "    let written=0;",
  "    for(const row of allRows){",
  "      current.tbody.appendChild(row.cloneNode(true));",
  "      if(!fits()){",
  "        current.tbody.lastElementChild.remove();",
  "        if(current.tbody.children.length===0){current.part.remove();}",
  "        newPage();current=startPart(original,written>0);",
  "        current.tbody.appendChild(row.cloneNode(true));",
  "      }",
  "      written++;",
  "    }",
  "    const tail=original.querySelector('.invoice-tail').cloneNode(true);",
  "    current.part.appendChild(tail);",
  "    if(!fits()){",
  "      tail.remove();",
  "      const last=current.tbody.lastElementChild;",
  "      if(last){",
  "        const row=last.cloneNode(true);last.remove();",
  "        if(current.tbody.children.length===0)current.part.remove();",
  "        newPage();current=startPart(original,written>1);",
  "        current.tbody.appendChild(row);current.part.appendChild(tail);",
  "        if(!fits()){",
  "          tail.remove();",
  "          newPage();current=startPart(original,true);current.part.appendChild(tail);",
  "        }",
  "      }else{",
  "        current.part.remove();newPage();current=startPart(original,written>0);current.part.appendChild(tail);",
  "      }",
  "    }",
  "  }",
  "  function paginate(){",
  "    pages.innerHTML='';newPage();",
  "    body.appendChild(intro.content.firstElementChild.cloneNode(true));",
  "    const originals=Array.from(invoiceTemplate.content.querySelectorAll('.invoice'));",
  "    for(const item of originals)appendInvoice(item);",
  "    const total=pages.children.length;",
  "    Array.from(pages.children).forEach((sheet,i)=>{",
  "      sheet.querySelector('.page-footer').textContent='\u0635\u0641\u062D\u0629 '+(i+1)+' \u0645\u0646 '+total;",
  "    });",
  "    const count=document.getElementById('pages-count');",
  "    if(count)count.textContent=total+' \u0635\u0641\u062D\u0629 A4';",
  "  }",
  "  function waitForImages(){",
  "    const images=Array.from(pages.querySelectorAll('img'));",
  "    return Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise(resolve=>{",
  "      const timeout=setTimeout(resolve,5000);",
  "      const done=()=>{clearTimeout(timeout);resolve();};",
  "      img.addEventListener('load',done,{once:true});",
  "      img.addEventListener('error',done,{once:true});",
  "    })));",
  "  }",
  "  window.addEventListener('load',()=>{",
  "    Promise.resolve(document.fonts?document.fonts.ready:undefined).then(()=>{",
  "      paginate();",
  "      return waitForImages();",
  "    }).then(()=>setTimeout(()=>window.print(),180));",
  "  });",
  "})();"
].join("\n");
var css = [
  "@page {size: A4 portrait; margin: 0;}",
  "*{box-sizing:border-box;-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}",
  "html{background:#e9eef5;} body{margin:0;color:#142947;font:9pt/1.27 Tahoma,Arial,sans-serif;}",
  ".print-controls{position:sticky;top:0;z-index:10;display:flex;gap:12px;align-items:center;justify-content:center;padding:8px;background:#e5ecf5;}",
  ".print-controls button{background:#134777;color:white;border:0;border-radius:5px;padding:8px 15px;font-weight:bold;cursor:pointer;}",
  "#pages{padding:6px 0 18px;}",
  ".sheet{width:210mm;height:297mm;max-height:297mm;margin:8px auto;padding:7.5mm 8mm;background:#fff;box-shadow:0 4px 20px #aab8c9;overflow:hidden;}",
  ".page-body{height:276mm;min-height:276mm;max-height:276mm;display:flow-root;}",
  ".page-footer{height:6mm;line-height:6mm;border-top:1px solid #225781;color:#1c4771;text-align:center;font-size:8pt;font-weight:700;}",
  ".business-letterhead{margin-bottom:2mm;width:100%;}",
  ".business-letterhead img{display:block;width:100%;height:25mm;object-fit:contain;object-position:center;}",
  ".business-standard{display:flex;direction:rtl;align-items:center;gap:3mm;min-height:23mm;margin-bottom:2mm;border-bottom:1px solid #2b608d;padding-bottom:1mm;}",
  ".business-logo{height:20mm;width:20mm;object-fit:contain;}",
  ".business-identity{display:flex;flex-direction:column;min-width:0;flex:1;}",
  ".business-identity strong{font-size:13.5pt;color:#103e6b;}",
  ".business-identity small{font-size:7.5pt;color:#435a72;}",
  ".business-contact{display:flex;flex-direction:column;gap:1mm;max-width:42%;font-size:7pt;color:#253d5a;}",
  "h1{margin:1mm 0 2mm;color:#123e67;text-align:center;font-size:15pt;}",
  "h2{margin:2mm 0 1mm;font-size:9pt;color:#123d65;}",
  ".criteria{display:flex;flex-wrap:wrap;align-items:center;gap:1mm 3mm;font-size:8pt;padding:0 0 2mm;border-bottom:1px solid #1b5284;}",
  ".summary,.lines{border-collapse:collapse;direction:rtl;width:100%;table-layout:fixed;}",
  ".summary th,.summary td{padding:1.2mm 1mm;text-align:center;border:1px solid #adbed1;font-size:8pt;}",
  ".summary th{color:#173c66;background:#eef4fb;font-weight:700;}",
  ".summary td{font-weight:600;}",
  ".report-intro{margin-bottom:1.8mm;}",
  ".report-subtitle{margin-bottom:1mm;}",
  ".invoice{border:1px solid #315d8a;border-radius:2px;margin:0;padding:0;break-inside:auto;page-break-inside:auto;}",
  ".invoice+.invoice{border-top:0;}",
  ".invoice-heading{display:flex;align-items:center;gap:1.5mm 5mm;flex-wrap:wrap;background:#123f72!important;color:white;padding:1.8mm 2.4mm;min-height:7mm;break-after:avoid;page-break-after:avoid;}",
  ".invoice-heading strong{font-size:9pt;white-space:nowrap;}",
  ".invoice-heading span{font-size:8pt;}.invoice-heading .customer{flex:1;min-width:30mm;}",
  ".invoice-heading .continued{margin-right:auto;opacity:.8;}",
  ".lines th,.lines td{border:1px solid #a9bdcf;padding:.75mm .55mm;text-align:center;vertical-align:middle;font-size:7.15pt;line-height:1.18;background:white!important;}",
  ".lines th{font-weight:700;color:#16436c;font-size:7pt;overflow-wrap:normal;}",
  ".lines td{overflow-wrap:anywhere;}",
  ".lines tr{break-inside:avoid;page-break-inside:avoid;}",
  ".lines .sku{direction:ltr;font-size:6.9pt;white-space:nowrap;}",
  ".lines .item-cell{text-align:right;font-size:7.5pt;line-height:1.2;}",
  ".item-note{font-size:7.1pt;font-weight:normal;color:#374b65;}",
  ".lines .num{direction:ltr;font-size:7pt;white-space:nowrap;font-variant-numeric:tabular-nums;}",
  ".strong{font-weight:700;color:#133d66;}",
  ".invoice-tail{padding:1mm 2mm;background:white!important;break-inside:avoid;page-break-inside:avoid;}",
  ".invoice-totals{display:flex;flex-wrap:wrap;gap:1mm 2.5mm;align-items:center;justify-content:space-between;padding:1mm 0;border-top:1px solid #9cb6cf;border-bottom:1px solid #b6c7d8;font-size:7.2pt;}",
  ".invoice-totals span{white-space:nowrap;}.invoice-totals b{font-variant-numeric:tabular-nums;}",
  ".invoice-meta{display:flex;align-items:center;flex-wrap:wrap;gap:1mm 1.5mm;min-height:5mm;padding:.9mm 0;font-size:7.25pt;}",
  ".invoice-meta>span{white-space:nowrap;}",
  ".separator{margin:0 1mm;color:#6685a5;}",
  ".payment-entry{display:inline-flex;flex-wrap:wrap;gap:.2mm;align-items:center;}",
  ".payment-entry>span{white-space:nowrap;}",
  ".payment-splits{border-top:1px solid #dbe4ee;padding-top:.6mm;}",
  ".split-row{display:flex;justify-content:flex-start;padding:.6mm 0;font-size:7.2pt;}",
  ".split-row+.split-row{border-top:1px dotted #d6e1ee;}",
  ".document-note{font-size:7pt;border-top:1px solid #d4deea;padding:.7mm 0;white-space:pre-wrap;}",
  ".continuation-head{font-size:8pt;font-weight:700;color:#2b5279;border-bottom:1px solid #aac0d5;padding-bottom:1mm;margin-bottom:1mm;}",
  "@media print{html,body{background:#fff!important;}#pages{padding:0}.sheet{border:0;box-shadow:none;margin:0;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}.print-controls{display:none!important;}}"
].join("\n");
function buildDetailedSalesReportHtml(invoices, options) {
  const grouped = /* @__PURE__ */ new Map();
  for (const invoice of invoices) {
    const { code, symbol } = currencyFor(invoice);
    const row = grouped.get(code) || { code, symbol, count: 0, total: 0, paid: 0, balance: 0, discount: 0, tax: 0 };
    row.count++;
    row.total += number(invoice.totalAmount);
    row.paid += number(invoice.paidAmount);
    row.balance += number(invoice.remainingAmount ?? number(invoice.totalAmount) - number(invoice.paidAmount));
    row.discount += number(invoice.discountTotal);
    row.tax += number(invoice.taxAmount);
    grouped.set(code, row);
  }
  const summaryRows = [...grouped.values()].map(
    (row) => "<tr><td>" + escapeHtml(row.code) + "</td><td>" + row.count + "</td><td>" + money2(row.total) + " " + escapeHtml(row.symbol) + "</td><td>" + money2(row.paid) + " " + escapeHtml(row.symbol) + "</td><td>" + money2(row.balance) + " " + escapeHtml(row.symbol) + "</td><td>" + money2(row.discount) + " " + escapeHtml(row.symbol) + "</td><td>" + money2(row.tax) + " " + escapeHtml(row.symbol) + "</td></tr>"
  ).join("");
  const intro = [
    '<div class="report-intro">',
    renderBusinessReportHeader(options.settings),
    "<h1>\u0643\u0634\u0641 \u062A\u0641\u0635\u064A\u0644\u064A \u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A</h1>",
    '<div class="criteria">',
    "<span><b>\u0627\u0644\u0641\u062A\u0631\u0629:</b> " + escapeHtml(options.periodLabel) + "</span>",
    "<span><b>\u0646\u0648\u0639 \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631:</b> " + escapeHtml(options.invoiceTypeLabel) + "</span>",
    options.searchLabel ? "<span><b>\u0627\u0644\u0628\u062D\u062B:</b> " + escapeHtml(options.searchLabel) + "</span>" : "",
    "<span><b>\u0627\u0644\u0639\u062F\u062F:</b> " + invoices.length + "</span>",
    "<span><b>\u062A\u0627\u0631\u064A\u062E \u0637\u0628\u0627\u0639\u0629 \u0627\u0644\u0643\u0634\u0641:</b> " + escapeHtml((/* @__PURE__ */ new Date()).toLocaleString("ar-EG")) + "</span>",
    "</div><h2>\u0625\u062C\u0645\u0627\u0644\u064A\u0627\u062A \u062D\u0633\u0628 \u0627\u0644\u0639\u0645\u0644\u0629</h2>",
    '<table class="summary"><thead><tr><th>\u0627\u0644\u0639\u0645\u0644\u0629</th><th>\u0639\u062F\u062F \u0627\u0644\u0641\u0648\u0627\u062A\u064A\u0631</th>',
    "<th>\u0627\u0644\u0625\u062C\u0645\u0627\u0644\u064A</th><th>\u0627\u0644\u0645\u062F\u0641\u0648\u0639</th><th>\u0627\u0644\u0645\u062A\u0628\u0642\u064A</th><th>\u0627\u0644\u062E\u0635\u0648\u0645\u0627\u062A</th><th>\u0627\u0644\u0636\u0631\u0627\u0626\u0628</th></tr></thead>",
    "<tbody>" + summaryRows + "</tbody></table>",
    "</div>"
  ].join("");
  const reports = invoices.map((invoice, i) => invoiceMarkup(invoice, i, options)).join("");
  return [
    '<!doctype html><html lang="ar" dir="rtl"><head><meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width,initial-scale=1">',
    "<title>\u0643\u0634\u0641 \u062A\u0641\u0635\u064A\u0644\u064A \u0644\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A</title>",
    "<style>",
    REPORT_TYPOGRAPHY_CSS,
    css,
    "</style></head><body>",
    '<div class="print-controls"><button type="button" onclick="window.print()">\u0637\u0628\u0627\u0639\u0629 \u0627\u0644\u0643\u0634\u0641 / \u062D\u0641\u0638 PDF</button>',
    '<span>\u0645\u0639\u0627\u064A\u0646\u0629 A4 \u0639\u0645\u0648\u062F\u064A \u2014 <b id="pages-count">\u062C\u0627\u0631\u064D \u062A\u062C\u0647\u064A\u0632 \u0627\u0644\u0635\u0641\u062D\u0627\u062A</b></span></div>',
    '<main id="pages"></main>',
    '<template id="report-intro">',
    intro,
    "</template>",
    '<template id="invoice-sources">',
    reports,
    "</template>",
    "<script>",
    options.autoPrint === false ? pagerJs.replace(
      "}).then(()=>setTimeout(()=>window.print(),180));",
      '}).then(()=>{document.documentElement.dataset.printReady="true";});'
    ) : pagerJs,
    "</script>",
    "</body></html>"
  ].join("");
}

// local-server/report-ssr-entry.tsx
function renderSalesReport(snapshot, { fromDate = "", toDate = "", periodLabel = "\u0643\u0627\u0645\u0644 \u0627\u0644\u0641\u062A\u0631\u0629" } = {}) {
  const invoices = (snapshot.invoices || []).filter((inv) => isConfirmedSalesInvoice(inv) && (!fromDate || inv.date >= fromDate) && (!toDate || inv.date <= toDate));
  return buildDetailedSalesReportHtml(invoices, {
    companyName: snapshot.settings?.businessName || "",
    settings: snapshot.settings || {},
    periodLabel,
    invoiceTypeLabel: "\u0641\u0648\u0627\u062A\u064A\u0631 \u0627\u0644\u0645\u0628\u064A\u0639\u0627\u062A",
    searchLabel: "",
    customerName: (inv) => formatInvoiceCustomerDisplay(inv, snapshot.parties || []),
    treasuries: snapshot.treasuries || [],
    autoPrint: false
  });
}
function renderReport(snapshot, options = {}) {
  globalThis.__reportSnapshot = snapshot;
  try {
    const html = renderToStaticMarkup(React5.createElement(ReportsView, {
      initialReport: options.type || "customer_statement",
      exportSelection: {
        partyId: options.partyId,
        employeeId: options.employeeId,
        fromDate: options.fromDate,
        toDate: options.toDate
      }
    }));
    const start = html.indexOf('class="');
    return {
      html,
      hasReport: html.includes("report-a4-container"),
      type: options.type || "customer_statement",
      length: html.length
    };
  } finally {
    globalThis.__reportSnapshot = null;
  }
}
export {
  renderReport,
  renderSalesReport
};
