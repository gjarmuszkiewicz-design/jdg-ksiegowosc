import { round2 } from "./money";
import type { Company, Invoice, InvoiceItem, InvoiceKind, InvoicePayment, VatRate } from "./types";

export const VAT_RATES: { value: VatRate; label: string }[] = [
  { value: "23", label: "23%" },
  { value: "8", label: "8%" },
  { value: "5", label: "5%" },
  { value: "0", label: "0%" },
  { value: "zw", label: "zw." },
  { value: "np", label: "np." },
];

export const rateValue = (r: VatRate) => (r === "zw" || r === "np" ? 0 : Number(r) / 100);

export function itemTotals(item: InvoiceItem) {
  const net = round2(item.qty * item.netPrice);
  const vat = round2(net * rateValue(item.vatRate));
  return { net, vat, gross: round2(net + vat) };
}

export interface RateSummary {
  rate: VatRate;
  net: number;
  vat: number;
  gross: number;
}

/** Podsumowanie według stawek — VAT liczony od sumy wartości netto w danej stawce (art. 106e ust. 10) */
export function invoiceTotals(inv: Pick<Invoice, "items">) {
  const byRate = new Map<VatRate, RateSummary>();
  for (const it of inv.items) {
    const net = round2(it.qty * it.netPrice);
    const s = byRate.get(it.vatRate) ?? { rate: it.vatRate, net: 0, vat: 0, gross: 0 };
    s.net = round2(s.net + net);
    byRate.set(it.vatRate, s);
  }
  const rates = [...byRate.values()].map((s) => {
    const vat = round2(s.net * rateValue(s.rate));
    return { ...s, vat, gross: round2(s.net + vat) };
  });
  const net = round2(rates.reduce((a, r) => a + r.net, 0));
  const vat = round2(rates.reduce((a, r) => a + r.vat, 0));
  return { rates, net, vat, gross: round2(net + vat) };
}

export function nextInvoiceNumber(pattern: string, invoices: Invoice[], issueDate: string) {
  const [y, m] = issueDate.split("-");
  const monthly = pattern.includes("{MM}");
  const fill = (nr: string) => pattern.replace("{NR}", nr).replace("{MM}", m).replace("{RRRR}", y);
  // Szukamy najwyższego numeru wg wzoru w tym samym okresie (rok lub miesiąc) — odporne na faktury z innych programów
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`^${esc(fill("@@NR@@")).replace("@@NR@@", "(\\d+)")}$`);
  let max = 0;
  for (const i of invoices) {
    const match = i.number.trim().match(re);
    if (match) max = Math.max(max, Number(match[1]));
  }
  if (!max) {
    const samePeriod = invoices.filter((i) => {
      const [iy, im] = i.issueDate.split("-");
      return monthly ? iy === y && im === m : iy === y;
    });
    return fill(String(samePeriod.length + 1));
  }
  return fill(String(max + 1));
}

export const isProforma = (inv: Pick<Invoice, "kind">) => inv.kind === "proforma";

/** Dokument księgowy: wystawiona faktura (bez szkiców i proform) — tylko takie wchodzą do VAT, PIT, JPK i KSeF */
export const isAccounting = (inv: Invoice) => inv.status !== "szkic" && !isProforma(inv);

/** Ile klient już zapłacił (faktury oznaczone jako opłacone bez listy wpłat liczymy w całości) */
export function paidAmount(inv: Invoice) {
  if (inv.payments?.length) return round2(inv.payments.reduce((s, p) => s + p.amount, 0));
  return inv.status === "oplacona" ? invoiceTotals(inv).gross : 0;
}

export const remainingAmount = (inv: Invoice) => round2(Math.max(0, invoiceTotals(inv).gross - paidAmount(inv)));

export type PaymentState = "oplacona" | "czesciowo" | "nieoplacona";
export function paymentState(inv: Invoice): PaymentState {
  const paid = paidAmount(inv);
  if (paid <= 0) return "nieoplacona";
  return remainingAmount(inv) < 0.01 ? "oplacona" : "czesciowo";
}

/** Ustawia status i datę zapłaty zgodnie z listą wpłat */
export function withPayments(inv: Invoice, payments: InvoicePayment[]): Invoice {
  const next: Invoice = { ...inv, payments };
  if (inv.status === "szkic") return next;
  const full = remainingAmount(next) < 0.01 && payments.length > 0;
  const last = [...payments].sort((a, b) => a.date.localeCompare(b.date)).at(-1);
  if (full) return { ...next, status: "oplacona", paidDate: last?.date };
  return { ...next, status: inv.status === "oplacona" ? "wystawiona" : inv.status, paidDate: undefined };
}

/** Oznacz jako opłaconą: dopisuje wpłatę na brakującą kwotę */
export function markPaid(inv: Invoice, date: string, id = `pay-${Date.now()}`): Invoice {
  const missing = remainingAmount(inv);
  const base = inv.payments?.length ? inv.payments : paidAmount(inv) > 0 ? [{ id: `${id}-0`, date: inv.paidDate ?? date, amount: paidAmount(inv) }] : [];
  return withPayments(inv, missing > 0 ? [...base, { id, date, amount: missing, method: inv.paymentMethod }] : base);
}

export const isOverdue = (inv: Invoice, today = new Date().toISOString().slice(0, 10)) =>
  isAccounting(inv) && remainingAmount(inv) > 0 && inv.dueDate < today;

/** Kolejny numer w serii faktur albo proform */
export function nextNumberFor(company: Pick<Company, "invoiceNumberPattern" | "proformaNumberPattern">, invoices: Invoice[], kind: InvoiceKind, issueDate: string) {
  const pattern = kind === "proforma" ? company.proformaNumberPattern || "PRO/{NR}/{RRRR}" : company.invoiceNumberPattern;
  return nextInvoiceNumber(pattern, invoices.filter((i) => (i.kind ?? "faktura") === kind), issueDate);
}
