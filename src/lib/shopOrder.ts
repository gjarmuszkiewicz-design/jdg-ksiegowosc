import { invoiceTotals, isProforma, nextInvoiceNumber, withPayments } from "./invoice";
import { round2 } from "./money";
import type { Company, Invoice, InvoiceItem, PaymentMethod, ShopSite, VatRate } from "./types";
import { cleanNip, isValidNip } from "./validation";

/** Zamówienie przesyłane przez wtyczkę WordPress (WooCommerce) */
export interface ShopOrderLine {
  name: string;
  sku?: string;
  qty: number;
  /** Wartość brutto pozycji po rabatach */
  total: number;
  /** Stawka VAT w procentach (np. 23) albo "zw"; brak = stawka domyślna sklepu */
  vatRate?: number | string | null;
}

export interface ShopOrder {
  orderId: string | number;
  orderNumber?: string;
  currency?: string;
  createdAt?: string;
  paidAt?: string | null;
  completedAt?: string | null;
  isPaid?: boolean;
  paymentMethod?: string;
  paymentMethodTitle?: string;
  wantsInvoice?: boolean;
  /** Ręczne wystawienie ze sklepu — faktura także bez zaznaczonego „Chcę fakturę” */
  force?: boolean;
  buyer: {
    company?: string;
    firstName?: string;
    lastName?: string;
    nip?: string;
    email?: string;
    address1?: string;
    address2?: string;
    postcode?: string;
    city?: string;
    country?: string;
  };
  items: ShopOrderLine[];
  shipping?: ShopOrderLine[];
  fees?: ShopOrderLine[];
  /** Kwota zamówienia brutto — do kontroli sumy */
  total?: number;
}

export type ShopInvoiceResult = { ok: true; invoice: Invoice; warning?: string } | { ok: false; skip: true; reason: string } | { ok: false; skip: false; reason: string };

const RATES = [23, 8, 5, 0];

/** Stawka z WooCommerce (np. 23, "23", 22.99) → stawka na fakturze */
export function mapVatRate(rate: ShopOrderLine["vatRate"], company: Company, fallback: VatRate): VatRate {
  if (company.vatStatus === "zwolniony") return "zw";
  if (rate === null || rate === undefined || rate === "") return fallback;
  if (rate === "zw" || rate === "np") return rate;
  const n = Number(rate);
  if (!Number.isFinite(n)) return fallback;
  const nearest = RATES.reduce((best, r) => (Math.abs(r - n) < Math.abs(best - n) ? r : best), 23);
  return String(nearest) as VatRate;
}

/** Bramki płatności WooCommerce → sposób płatności na fakturze */
export function mapPaymentMethod(method = ""): PaymentMethod {
  const m = method.toLowerCase();
  if (m === "cod" || m.includes("cash")) return "gotowka";
  if (m.includes("stripe") || m.includes("card") || m.includes("square")) return "karta";
  return "przelew";
}

/** Data w strefie Polski (YYYY-MM-DD) */
export function warsawDate(d: string | Date = new Date()) {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return warsawDate(new Date());
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(date);
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

function toItem(line: ShopOrderLine, idx: number, company: Company, fallback: VatRate, unit: string, prefix = ""): InvoiceItem | null {
  const qty = Number(line.qty) || 1;
  const total = round2(Number(line.total) || 0);
  if (!total) return null;
  const name = `${prefix}${String(line.name || "Pozycja").trim()}`.slice(0, 256);
  const unitPrice = round2(total / qty);
  // gdy cena jednostkowa nie dzieli się co do grosza (rabaty), pozycja jako komplet — kwota brutto musi się zgadzać
  const exact = Math.abs(round2(unitPrice * qty) - total) < 0.005;
  return {
    id: `l${idx}`,
    name: exact ? name : `${name} (${qty} ${unit})`,
    qty: exact ? qty : 1,
    unit: exact ? unit : "kpl.",
    netPrice: 0,
    grossPrice: exact ? unitPrice : total,
    vatRate: mapVatRate(line.vatRate, company, fallback),
  };
}

/**
 * Faktura z zamówienia sklepu internetowego (liczona od brutto, jak ceny w sklepie).
 * Nie zapisuje niczego — zwraca gotowy dokument albo powód pominięcia.
 */
export function invoiceFromShopOrder(order: ShopOrder, site: Pick<ShopSite, "id" | "name" | "settings">, company: Company, invoices: Invoice[], opts: { id: string; now?: Date }): ShopInvoiceResult {
  const st = site.settings;
  const orderNumber = String(order.orderNumber || order.orderId);
  if (st.invoiceMode === "na_zadanie" && !order.wantsInvoice && !order.force) return { ok: false, skip: true, reason: "Klient nie zaznaczył „Chcę fakturę”." };
  if (order.currency && order.currency.toUpperCase() !== "PLN") return { ok: false, skip: false, reason: `Waluta ${order.currency} — faktury w walutach obcych wystaw ręcznie w aplikacji.` };

  const fallback: VatRate = company.vatStatus === "zwolniony" ? "zw" : st.defaultVatRate || "23";
  const items: InvoiceItem[] = [];
  let n = 0;
  for (const l of order.items ?? []) {
    const it = toItem(l, n++, company, fallback, "szt.");
    if (it) items.push(it);
  }
  for (const l of order.shipping ?? []) {
    const it = toItem(l, n++, company, fallback, "usł.", "Dostawa: ");
    if (it) items.push(it);
  }
  for (const l of order.fees ?? []) {
    const it = toItem(l, n++, company, fallback, "usł.");
    if (it) items.push(it);
  }
  if (!items.length) return { ok: false, skip: false, reason: "Zamówienie nie ma pozycji z kwotą." };

  const b = order.buyer ?? {};
  const nip = cleanNip(b.nip ?? "");
  const isCompany = nip.length > 0;
  if (isCompany && (b.country ?? "PL").toUpperCase() === "PL" && !isValidNip(nip)) return { ok: false, skip: false, reason: `Nieprawidłowy NIP nabywcy: ${b.nip}.` };
  const person = [b.firstName, b.lastName].filter(Boolean).join(" ").trim();
  const name = (isCompany ? b.company || person : person || b.company || "").trim();
  if (!name) return { ok: false, skip: false, reason: "Brak nazwy nabywcy." };

  const now = opts.now ?? new Date();
  const issueDate = warsawDate(now);
  const saleDate = warsawDate(order.completedAt || order.paidAt || order.createdAt || now);
  const paid = Boolean(order.isPaid);
  const pattern = st.numberPattern?.trim() || company.invoiceNumberPattern;
  const ownSeries = Boolean(st.numberPattern?.trim()) && st.numberPattern.trim() !== company.invoiceNumberPattern;
  const number = nextInvoiceNumber(pattern, invoices.filter((i) => !isProforma(i)), issueDate, ownSeries);

  let invoice: Invoice = {
    id: opts.id,
    number,
    issueDate,
    saleDate: saleDate > issueDate ? issueDate : saleDate,
    dueDate: paid ? issueDate : addDays(issueDate, company.defaultPaymentDays || 7),
    place: company.address.city,
    paymentMethod: mapPaymentMethod(order.paymentMethod),
    buyer: {
      name,
      nip: isCompany ? nip : "",
      isCompany,
      email: b.email ?? "",
      address: { street: [b.address1, b.address2].filter(Boolean).join(" ").trim(), postalCode: b.postcode ?? "", city: b.city ?? "", country: (b.country || "PL").toUpperCase() },
    },
    items,
    priceMode: "brutto",
    notes: `Zamówienie nr ${orderNumber} (${site.name})${order.paymentMethodTitle ? `, płatność: ${order.paymentMethodTitle}` : ""}`,
    status: "wystawiona",
    ksef: { status: "brak" },
    createdAt: now.toISOString(),
    source: `sklep:${site.id}`,
    shopOrder: { siteId: site.id, siteName: site.name, orderId: String(order.orderId), orderNumber },
  };
  const gross = invoiceTotals(invoice).gross;
  if (paid && st.markPaid) {
    invoice = withPayments(invoice, [{ id: `${opts.id}-p`, date: order.paidAt ? warsawDate(order.paidAt) : issueDate, amount: gross, method: invoice.paymentMethod, note: order.paymentMethodTitle || undefined }]);
  }
  const diff = order.total !== undefined ? round2(Number(order.total) - gross) : 0;
  const warning = Math.abs(diff) >= 0.02 ? `Suma faktury (${gross.toFixed(2)} zł) różni się od kwoty zamówienia (${Number(order.total).toFixed(2)} zł) — sprawdź pozycje.` : undefined;
  return { ok: true, invoice, warning };
}
