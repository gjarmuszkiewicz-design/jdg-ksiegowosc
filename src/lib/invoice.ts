import { round2 } from "./money";
import type { Invoice, InvoiceItem, VatRate } from "./types";

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

export const isOverdue = (inv: Invoice, today = new Date().toISOString().slice(0, 10)) =>
  inv.status !== "oplacona" && inv.status !== "szkic" && inv.dueDate < today;
