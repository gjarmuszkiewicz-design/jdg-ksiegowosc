import { round2 } from "./money";
import { cleanNip } from "./validation";
import type { Company, Contractor, Cost, CostCategory, Invoice, InvoiceItem, VatDeduction, VatRate } from "./types";
import { uid } from "@/store/useStore";

export interface ImportResult {
  source: string;
  invoices: Invoice[];
  costs: Cost[];
  contractors: Contractor[];
  warnings: string[];
  period?: { from: string; to: string };
}

const nowIso = () => new Date().toISOString();

// ───────────────────────── XML: dopasowanie po localName ─────────────────────────

function parseXml(xml: string) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new Error("Plik nie jest poprawnym XML-em");
  return doc;
}

/** Wszystkie elementy o danej nazwie lokalnej (bez względu na prefiks/przestrzeń nazw) */
function all(root: Document | Element, name: string): Element[] {
  return Array.from(root.getElementsByTagName("*")).filter((e) => e.localName === name);
}
/** Bezpośrednie dzieci o danej nazwie lokalnej */
function children(el: Element, name: string): Element[] {
  return Array.from(el.children).filter((e) => e.localName === name);
}
function first(root: Document | Element, name: string): Element | undefined {
  return all(root, name)[0];
}
/** Tekst bezpośredniego dziecka (albo pierwszego potomka, jeśli deep) */
function txt(el: Element | undefined, name: string, deep = false): string {
  if (!el) return "";
  const c = deep ? first(el, name) : children(el, name)[0];
  return c?.textContent?.trim() ?? "";
}
const num = (s: string) => {
  const n = parseFloat(s.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

const rateFromProportion = (net: number, vat: number): VatRate => {
  if (!net || !vat) return vat ? "23" : "0";
  const r = (vat / net) * 100;
  const options: VatRate[] = ["23", "8", "5"];
  return options.reduce((best, o) => (Math.abs(Number(o) - r) < Math.abs(Number(best) - r) ? o : best), "23" as VatRate);
};

const normalizeRate = (s: string): VatRate => {
  const v = s.trim().toLowerCase().replace("%", "");
  if (v.startsWith("zw")) return "zw";
  if (v.startsWith("np") || v === "oo") return "np";
  if (v.startsWith("0")) return "0";
  if (v === "5") return "5";
  if (v === "8" || v === "7") return "8";
  if (v === "23" || v === "22") return "23";
  return "23";
};

function monthRange(dates: string[]) {
  const ds = dates.filter(Boolean).sort();
  return ds.length ? { from: ds[0], to: ds[ds.length - 1] } : undefined;
}

function makeInvoice(p: { number: string; issueDate: string; saleDate?: string; buyerName: string; buyerNip: string; buyerAddress?: string; items: InvoiceItem[]; ksefNumber?: string; source: string; isCompany?: boolean }): Invoice {
  const addrParts = (p.buyerAddress ?? "").split(",").map((s) => s.trim());
  const pc = addrParts.find((s) => /\d{2}-\d{3}/.test(s)) ?? "";
  const m = pc.match(/(\d{2}-\d{3})\s*(.*)/);
  return {
    id: uid(),
    number: p.number || "bez numeru",
    issueDate: p.issueDate,
    saleDate: p.saleDate || p.issueDate,
    dueDate: p.issueDate,
    place: "",
    paymentMethod: "przelew",
    buyer: {
      name: p.buyerName || "Nabywca",
      nip: cleanNip(p.buyerNip),
      address: { street: addrParts.filter((s) => s !== pc)[0] ?? "", postalCode: m?.[1] ?? "", city: m?.[2] ?? "", country: "PL" },
      email: "",
      isCompany: p.isCompany ?? Boolean(cleanNip(p.buyerNip)),
    },
    items: p.items,
    notes: "",
    status: "oplacona",
    paidDate: p.issueDate,
    ksef: p.ksefNumber ? { status: "przyjeta", number: p.ksefNumber } : { status: "brak" },
    createdAt: nowIso(),
    source: p.source,
  };
}

function makeCost(p: { docNumber: string; date: string; supplierName: string; supplierNip: string; description?: string; net: number; vat: number; vatRate?: VatRate; isFixedAsset?: boolean; ksefNumber?: string; source: string }): Cost {
  const g = guessCategory(p.supplierName, p.description ?? "");
  return {
    id: uid(),
    docNumber: p.docNumber || "bez numeru",
    date: p.date,
    supplierName: p.supplierName || "Dostawca",
    supplierNip: cleanNip(p.supplierNip),
    description: p.description || p.supplierName || "Zakup",
    category: g.category,
    net: round2(p.net),
    vatRate: p.vatRate ?? rateFromProportion(p.net, p.vat),
    vat: round2(p.vat),
    vatDeduction: g.vatDeduction,
    costShare: g.costShare,
    isFixedAsset: Boolean(p.isFixedAsset),
    paid: true,
    ksefNumber: p.ksefNumber,
    createdAt: nowIso(),
    source: p.source,
  };
}

/** Kontrahenci z unikalnych NIP-ów nabywców */
function contractorsFrom(invoices: Invoice[]): Contractor[] {
  const map = new Map<string, Contractor>();
  for (const i of invoices) {
    const nip = cleanNip(i.buyer.nip);
    if (!nip || map.has(nip)) continue;
    map.set(nip, { id: uid(), name: i.buyer.name, nip, address: i.buyer.address, email: "", isCompany: true });
  }
  return [...map.values()];
}

// ───────────────────────── Kategorie kosztów ─────────────────────────

const CATEGORY_RULES: { re: RegExp; category: CostCategory; vatDeduction?: VatDeduction; costShare?: number }[] = [
  { re: /orlen|\bbp\b|shell|circle ?k|lotos|moya|amic/, category: "paliwo", vatDeduction: "polowa", costShare: 0.75 },
  { re: /orange|\bplay\b|p4 sp|t-mobile|polkomtel|\bplus\b|upc|vectra|netia/, category: "telefon_internet" },
  { re: /google ads|facebook|\bmeta\b|linkedin/, category: "marketing" },
  { re: /google|microsoft|adobe|jetbrains|github|atlassian|notion|amazon web|\baws\b|ovh|home\.pl|nazwa\.pl|openai|anthropic/, category: "oprogramowanie" },
  { re: /x-kom|media expert|rtv euro|euro agd|morele|apple|komputronik/, category: "sprzet" },
  { re: /ifirma|wfirma|biuro rachunkowe|księgow|ksiegow/, category: "ksiegowosc" },
  { re: /\bpkp\b|\blot\b|ryanair|wizz|uber|bolt|hotel|booking/, category: "podroze" },
  { re: /udemy|coursera|szkoleni|konferencj/, category: "szkolenia" },
  { re: /leasing|ubezp|serwis|opony|warsztat/, category: "samochod", vatDeduction: "polowa", costShare: 0.75 },
  { re: /allegro/, category: "inne" },
];

export function guessCategory(supplierName: string, description = ""): { category: CostCategory; vatDeduction: VatDeduction; costShare: number } {
  const hay = `${supplierName} ${description}`.toLowerCase();
  const rule = CATEGORY_RULES.find((r) => r.re.test(hay));
  return { category: rule?.category ?? "inne", vatDeduction: rule?.vatDeduction ?? "pelne", costShare: rule?.costShare ?? 1 };
}

// ───────────────────────── JPK_V7M / JPK_V7K ─────────────────────────

const SALE_K: { net: string; vat?: string; rate: VatRate }[] = [
  { net: "K_19", vat: "K_20", rate: "23" },
  { net: "K_17", vat: "K_18", rate: "8" },
  { net: "K_15", vat: "K_16", rate: "5" },
  { net: "K_13", rate: "0" },
  { net: "K_14", rate: "0" },
  { net: "K_10", rate: "zw" },
  { net: "K_11", rate: "np" },
  { net: "K_12", rate: "np" },
];

const VAT_CORRECTIONS: [string, string][] = [
  ["K_44", "Korekta VAT naliczonego od nabycia środków trwałych"],
  ["K_45", "Korekta VAT naliczonego od pozostałych nabyć"],
  ["K_46", "Korekta VAT naliczonego — niezapłacona faktura (art. 89b ust. 1)"],
  ["K_47", "Korekta VAT naliczonego — zapłata po korekcie (art. 89b ust. 4)"],
];

export function parseJpkV7(xml: string, _company?: Company): ImportResult {
  const doc = parseXml(xml);
  const kod = first(doc, "KodFormularza")?.getAttribute("kodSystemowy") ?? "JPK_V7";
  const rok = txt(first(doc, "Naglowek"), "Rok");
  const mies = txt(first(doc, "Naglowek"), "Miesiac");
  const label = `${kod.replace(/\s.*$/, "")}${rok ? ` ${rok}-${mies.padStart(2, "0")}` : ""}`;
  const source = `import:${label}`;
  const warnings: string[] = [];
  const invoices: Invoice[] = [];
  const costs: Cost[] = [];
  let skipped = 0;

  for (const w of all(doc, "SprzedazWiersz")) {
    const typ = txt(w, "TypDokumentu");
    if (typ === "WEW" || typ === "FP") {
      skipped++;
      continue;
    }
    const items: InvoiceItem[] = [];
    for (const k of SALE_K) {
      const net = num(txt(w, k.net));
      if (!net) continue;
      items.push({ id: uid(), name: "Sprzedaż wg JPK", qty: 1, unit: "usł.", netPrice: round2(net), vatRate: k.rate });
    }
    if (!items.length) {
      skipped++;
      continue;
    }
    const issueDate = txt(w, "DataWystawienia");
    invoices.push(
      makeInvoice({
        number: txt(w, "DowodSprzedazy"),
        issueDate,
        saleDate: txt(w, "DataSprzedazy") || issueDate,
        buyerName: typ === "RO" ? "Sprzedaż detaliczna (raport kasowy)" : txt(w, "NazwaKontrahenta"),
        buyerNip: typ === "RO" ? "" : txt(w, "NrKontrahenta").replace(/^brak$/i, ""),
        isCompany: typ === "RO" ? false : undefined,
        items,
        ksefNumber: txt(w, "NrKSeF") || undefined,
        source,
      }),
    );
  }
  if (skipped) warnings.push(`Pominięto ${skipped} wierszy sprzedaży (dokumenty wewnętrzne WEW/FP lub bez kwot).`);
  if (invoices.length) warnings.push("JPK nie zawiera informacji o płatnościach — faktury oznaczono jako opłacone. Popraw status nieopłaconych ręcznie.");

  let hasPurchase = false;
  let corrections = 0;
  for (const w of all(doc, "ZakupWiersz")) {
    const fixedNet = num(txt(w, "K_40"));
    const fixedVat = num(txt(w, "K_41"));
    const otherNet = num(txt(w, "K_42"));
    const otherVat = num(txt(w, "K_43"));
    const base = {
      docNumber: txt(w, "DowodZakupu"),
      date: txt(w, "DataWplywu") || txt(w, "DataZakupu"),
      supplierName: txt(w, "NazwaDostawcy"),
      supplierNip: txt(w, "NrDostawcy").replace(/^brak$/i, ""),
      ksefNumber: txt(w, "NrKSeF") || undefined,
      source,
    };
    if (fixedNet || fixedVat) costs.push(makeCost({ ...base, net: fixedNet, vat: fixedVat, isFixedAsset: true }));
    if (otherNet || otherVat) costs.push(makeCost({ ...base, net: otherNet, vat: otherVat }));
    // Korekty VAT naliczonego (K_44–K_47): zapisujemy jako osobny dokument z samą kwotą VAT,
    // z innym numerem, żeby nie został uznany za duplikat faktury, której dotyczy
    for (const [field, label] of VAT_CORRECTIONS) {
      const vat = num(txt(w, field));
      if (!vat) continue;
      const c = makeCost({ ...base, docNumber: `KOREKTA ${field} ${base.docNumber}`, description: `${label} — dot. ${base.docNumber}`, net: 0, vat, vatRate: "23" });
      costs.push({ ...c, category: "inne", vatDeduction: "pelne", costShare: 1, ksefNumber: undefined });
      corrections++;
    }
    hasPurchase = true;
  }
  if (corrections)
    warnings.push(`Zaimportowano ${corrections} korekt VAT naliczonego (np. ulga na złe długi po stronie nabywcy) jako osobne pozycje bez wpływu na koszty podatkowe.`);
  if (hasPurchase)
    warnings.push("W JPK są tylko kwoty VAT już odliczone (np. 50% przy samochodzie). Koszty zaimportowano z pełnym odliczeniem — sprawdź samochód i paliwo. Kwoty netto kosztów wynikają z JPK, a nie z całych faktur.");

  return {
    source: label,
    invoices,
    costs,
    contractors: contractorsFrom(invoices),
    warnings,
    period: monthRange([...invoices.map((i) => i.issueDate), ...costs.map((c) => c.date)]),
  };
}

// ───────────────────────── JPK_FA ─────────────────────────

const FA_SUMS: { net: string; vat?: string; rate: VatRate }[] = [
  { net: "P_13_1", vat: "P_14_1", rate: "23" },
  { net: "P_13_2", vat: "P_14_2", rate: "8" },
  { net: "P_13_3", vat: "P_14_3", rate: "5" },
  { net: "P_13_6", rate: "0" },
  { net: "P_13_7", rate: "zw" },
];

export function parseJpkFa(xml: string): ImportResult {
  const doc = parseXml(xml);
  const kod = first(doc, "KodFormularza")?.getAttribute("kodSystemowy") ?? "JPK_FA";
  const label = kod.replace(/\s.*$/, "");
  const source = `import:${label}`;
  const warnings: string[] = [];
  const rows = all(doc, "FakturaWiersz");
  const invoices: Invoice[] = [];

  for (const f of all(doc, "Faktura")) {
    const number = txt(f, "P_2A");
    if (!number) continue;
    const items: InvoiceItem[] = rows
      .filter((r) => txt(r, "P_2B") === number)
      .map((r) => {
        const qty = num(txt(r, "P_8B")) || 1;
        const value = num(txt(r, "P_11"));
        const price = num(txt(r, "P_9A")) || (value ? value / qty : 0);
        return { id: uid(), name: txt(r, "P_7") || "Pozycja", qty, unit: txt(r, "P_8A") || "szt.", netPrice: round2(price), vatRate: normalizeRate(txt(r, "P_12") || "23") };
      });
    if (!items.length) {
      for (const s of FA_SUMS) {
        const net = num(txt(f, s.net));
        if (net) items.push({ id: uid(), name: "Sprzedaż wg JPK_FA", qty: 1, unit: "usł.", netPrice: round2(net), vatRate: s.rate });
      }
      if (items.length) warnings.push(`Faktura ${number}: brak wierszy — pozycje odtworzono z sum wg stawek.`);
    }
    if (!items.length) continue;
    const issueDate = txt(f, "P_1");
    invoices.push(
      makeInvoice({
        number,
        issueDate,
        saleDate: txt(f, "P_6") || issueDate,
        buyerName: txt(f, "P_3A"),
        buyerAddress: txt(f, "P_3B"),
        buyerNip: txt(f, "P_5B"),
        items,
        source,
      }),
    );
  }
  if (invoices.length) warnings.push("JPK_FA nie zawiera informacji o płatnościach — faktury oznaczono jako opłacone.");
  return { source: label, invoices, costs: [], contractors: contractorsFrom(invoices), warnings, period: monthRange(invoices.map((i) => i.issueDate)) };
}

// ───────────────────────── e-Faktura KSeF FA(2)/FA(3) ─────────────────────────

export function parseKsefFa(xml: string, company: Company, fileName = ""): ImportResult {
  const doc = parseXml(xml);
  const p1 = first(doc, "Podmiot1");
  const p2 = first(doc, "Podmiot2");
  const fa = first(doc, "Fa");
  if (!fa) throw new Error("Brak sekcji Fa — to nie jest e-faktura KSeF");
  const sellerNip = cleanNip(txt(p1, "NIP", true));
  const ksefMatch = fileName.match(/\d{10}-\d{8}-[0-9A-F]{12}-[0-9A-F]{2}/i);
  const ksefNumber = ksefMatch?.[0];
  const number = txt(fa, "P_2");
  const issueDate = txt(fa, "P_1");
  const saleDate = txt(fa, "P_6") || issueDate;
  const ownNip = cleanNip(company.nip);
  const source = "import:KSeF";

  if (ownNip && sellerNip === ownNip) {
    const items: InvoiceItem[] = children(fa, "FaWiersz").map((r) => {
      const qty = num(txt(r, "P_8B")) || 1;
      const value = num(txt(r, "P_11"));
      const price = num(txt(r, "P_9A")) || (value ? value / qty : 0);
      return { id: uid(), name: txt(r, "P_7") || "Pozycja", qty, unit: txt(r, "P_8A") || "szt.", netPrice: round2(price), vatRate: normalizeRate(txt(r, "P_12") || "23") };
    });
    const adr = first(p2 as Element, "Adres");
    const inv = makeInvoice({
      number,
      issueDate,
      saleDate,
      buyerName: txt(p2, "Nazwa", true),
      buyerNip: txt(p2, "NIP", true),
      buyerAddress: [txt(adr, "AdresL1"), txt(adr, "AdresL2")].filter(Boolean).join(", "),
      items,
      ksefNumber,
      source,
    });
    const termin = txt(first(fa, "TerminPlatnosci") as Element, "Termin");
    if (termin) inv.dueDate = termin;
    const paid = txt(first(fa, "Platnosc") as Element, "Zaplacono") === "1";
    if (!paid && termin) {
      inv.status = "wystawiona";
      inv.paidDate = undefined;
    }
    return { source: "KSeF", invoices: [inv], costs: [], contractors: contractorsFrom([inv]), warnings: [], period: monthRange([issueDate]) };
  }

  let net = 0;
  let vat = 0;
  for (const el of Array.from(fa.children)) {
    if (/^P_13_\d+(_\d+)?$/.test(el.localName)) net += num(el.textContent ?? "");
    if (/^P_14_\d+(_\d+)?$/.test(el.localName) && !el.localName.endsWith("W")) vat += num(el.textContent ?? "");
  }
  if (!net && !vat) {
    const gross = num(txt(fa, "P_15"));
    net = gross;
  }
  const firstItem = txt(first(fa, "FaWiersz") as Element, "P_7");
  const cost = makeCost({ docNumber: number, date: issueDate, supplierName: txt(p1, "Nazwa", true), supplierNip: sellerNip, description: firstItem, net, vat, ksefNumber, source });
  return { source: "KSeF", invoices: [], costs: [cost], contractors: [], warnings: ownNip ? [] : ["Brak NIP firmy w ustawieniach — e-fakturę potraktowano jako zakup."], period: monthRange([issueDate]) };
}

// ───────────────────────── CSV ─────────────────────────

export type CsvField = "number" | "issueDate" | "saleDate" | "dueDate" | "party" | "nip" | "net" | "vat" | "gross" | "rate" | "description" | "status";

export const CSV_FIELDS: { key: CsvField; label: string; required?: boolean }[] = [
  { key: "number", label: "Numer dokumentu", required: true },
  { key: "issueDate", label: "Data wystawienia", required: true },
  { key: "saleDate", label: "Data sprzedaży / wpływu" },
  { key: "dueDate", label: "Termin płatności" },
  { key: "party", label: "Kontrahent (nazwa)", required: true },
  { key: "nip", label: "NIP kontrahenta" },
  { key: "net", label: "Kwota netto" },
  { key: "vat", label: "Kwota VAT" },
  { key: "gross", label: "Kwota brutto" },
  { key: "rate", label: "Stawka VAT" },
  { key: "description", label: "Opis / nazwa pozycji" },
  { key: "status", label: "Status / zapłacono" },
];

export type CsvMapping = Partial<Record<CsvField, number>>;

export interface CsvInfo {
  headers: string[];
  separator: string;
  rows: string[][];
}

/** Dekodowanie: UTF-8, a przy znakach zastępczych — Windows-1250 (częste w eksportach z polskich programów) */
export function decodeText(buf: ArrayBuffer): string {
  const utf = new TextDecoder("utf-8").decode(buf);
  if (!utf.includes("�")) return utf.replace(/^﻿/, "");
  try {
    return new TextDecoder("windows-1250").decode(buf);
  } catch {
    return utf;
  }
}

function splitCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else q = !q;
    } else if (ch === sep && !q) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

export function detectCsv(text: string): CsvInfo {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const head = lines[0] ?? "";
  const counts = [";", ",", "\t"].map((s) => ({ s, n: splitCsvLine(head, s).length }));
  const separator = counts.sort((a, b) => b.n - a.n)[0].s;
  return { headers: splitCsvLine(head, separator), separator, rows: lines.slice(1).map((l) => splitCsvLine(l, separator)) };
}

const FIELD_KEYWORDS: Record<CsvField, string[]> = {
  number: ["numer", "nr dok", "nr faktury", "nr"],
  issueDate: ["data wystawienia", "wystawion", "data dokumentu", "data"],
  saleDate: ["data sprzedaży", "data sprzedazy", "data wpływu", "data wplywu", "data dostawy"],
  dueDate: ["termin"],
  party: ["kontrahent", "nabywca", "sprzedawca", "dostawca", "klient", "nazwa firmy"],
  nip: ["nip"],
  net: ["netto"],
  vat: ["kwota vat", "vat kwota", "podatek", "vat"],
  gross: ["brutto", "do zapłaty", "do zaplaty"],
  rate: ["stawka"],
  description: ["opis", "nazwa towaru", "nazwa usługi", "pozycja", "tytuł"],
  status: ["status", "zapłac", "zaplac", "opłac", "oplac"],
};

export const CSV_PRESETS = ["wFirma", "iFirma", "Fakturownia", "Inny"] as const;

/** Heurystyczne dopasowanie kolumn po słowach kluczowych (kolejność pól ma znaczenie — najpierw bardziej szczegółowe) */
export function autoMapping(headers: string[]): CsvMapping {
  const h = headers.map((x) => x.toLowerCase());
  const used = new Set<number>();
  const map: CsvMapping = {};
  const order: CsvField[] = ["nip", "saleDate", "dueDate", "issueDate", "net", "gross", "rate", "vat", "number", "party", "description", "status"];
  for (const field of order) {
    for (const kw of FIELD_KEYWORDS[field]) {
      const idx = h.findIndex((x, i) => !used.has(i) && x.includes(kw) && !(field === "vat" && (x.includes("netto") || x.includes("brutto") || x.includes("stawka"))));
      if (idx >= 0) {
        map[field] = idx;
        used.add(idx);
        break;
      }
    }
  }
  return map;
}

export function parsePlNumber(s: string | undefined): number {
  if (!s) return 0;
  let v = s.replace(/[\s ]|zł|pln/gi, "");
  if (v.includes(",") && v.includes(".")) v = v.lastIndexOf(",") > v.lastIndexOf(".") ? v.replace(/\./g, "").replace(",", ".") : v.replace(/,/g, "");
  else v = v.replace(",", ".");
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export function parsePlDate(s: string | undefined): string {
  if (!s) return "";
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = t.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}

export function parseCsv(text: string, mapping: CsvMapping, kind: "sprzedaz" | "koszty", preset = "CSV"): ImportResult {
  const info = detectCsv(text);
  const warnings: string[] = [];
  const get = (row: string[], f: CsvField) => (mapping[f] === undefined ? "" : row[mapping[f]!] ?? "");
  const invoices: Invoice[] = [];
  const costs: Cost[] = [];
  const source = `import:CSV ${preset}`;
  let bad = 0;
  for (const row of info.rows) {
    const issueDate = parsePlDate(get(row, "issueDate"));
    if (!issueDate) {
      bad++;
      continue;
    }
    let net = parsePlNumber(get(row, "net"));
    let vat = parsePlNumber(get(row, "vat"));
    const gross = parsePlNumber(get(row, "gross"));
    const rateStr = get(row, "rate");
    let rate: VatRate = rateStr ? normalizeRate(rateStr) : rateFromProportion(net, vat);
    if (!net && gross) {
      const r = rate === "zw" || rate === "np" || rate === "0" ? 0 : Number(rate) / 100;
      net = round2(gross / (1 + r));
      vat = round2(gross - net);
    }
    if (!vat && gross && net) vat = round2(gross - net);
    if (!rateStr) rate = rateFromProportion(net, vat);
    if (!net && !gross) {
      bad++;
      continue;
    }
    const saleDate = parsePlDate(get(row, "saleDate")) || issueDate;
    if (kind === "sprzedaz") {
      const inv = makeInvoice({
        number: get(row, "number"),
        issueDate,
        saleDate,
        buyerName: get(row, "party"),
        buyerNip: get(row, "nip"),
        items: [{ id: uid(), name: get(row, "description") || "Sprzedaż (import CSV)", qty: 1, unit: "usł.", netPrice: round2(net), vatRate: rate }],
        source,
      });
      const due = parsePlDate(get(row, "dueDate"));
      if (due) inv.dueDate = due;
      const st = get(row, "status").toLowerCase();
      if (st && /(nie|brak|częściow|czesciow|niezapł|nieopł|0)/.test(st) && !/^zapłac|^opłac|^tak/.test(st)) {
        inv.status = "wystawiona";
        inv.paidDate = undefined;
      }
      invoices.push(inv);
    } else {
      costs.push(makeCost({ docNumber: get(row, "number"), date: saleDate, supplierName: get(row, "party"), supplierNip: get(row, "nip"), description: get(row, "description"), net, vat, vatRate: rate, source }));
    }
  }
  if (bad) warnings.push(`Pominięto ${bad} wierszy bez poprawnej daty lub kwoty (np. wiersze podsumowań).`);
  if (kind === "sprzedaz" && mapping.status === undefined && invoices.length) warnings.push("Brak kolumny statusu — faktury oznaczono jako opłacone.");
  return {
    source: `CSV ${preset}`,
    invoices,
    costs,
    contractors: contractorsFrom(invoices),
    warnings,
    period: monthRange([...invoices.map((i) => i.issueDate), ...costs.map((c) => c.date)]),
  };
}

// ───────────────────────── Rozpoznawanie plików ─────────────────────────

export type FileKind = "jpk_v7" | "jpk_fa" | "ksef" | "csv" | "backup" | "unknown";

export function detectKind(text: string, fileName = ""): FileKind {
  const head = text.slice(0, 4000);
  if (/^\s*\{/.test(head) && head.includes('"company"')) return "backup";
  if (head.includes("<")) {
    if (/JPK_V7[MK]/.test(head)) return "jpk_v7";
    if (/JPK_FA/.test(head)) return "jpk_fa";
    if (/<([\w]+:)?Faktura[\s>]/.test(head)) return "ksef";
  }
  if (/\.csv$|\.txt$/i.test(fileName) || /[;,\t]/.test(head.split("\n")[0] ?? "")) return "csv";
  return "unknown";
}

export interface ParsedFile {
  name: string;
  kind: FileKind;
  text: string;
  result?: ImportResult;
  error?: string;
}

/** Wczytuje pliki i parsuje wszystkie typy XML. CSV i kopie JSON wymagają osobnego kroku (mapowanie / potwierdzenie). */
export async function parseFiles(files: File[], company: Company): Promise<ParsedFile[]> {
  const out: ParsedFile[] = [];
  for (const f of files) {
    const text = decodeText(await f.arrayBuffer());
    const kind = detectKind(text, f.name);
    const pf: ParsedFile = { name: f.name, kind, text };
    try {
      if (kind === "jpk_v7") pf.result = parseJpkV7(text, company);
      else if (kind === "jpk_fa") pf.result = parseJpkFa(text);
      else if (kind === "ksef") pf.result = parseKsefFa(text, company, f.name);
      else if (kind === "unknown") pf.error = "Nie rozpoznano formatu pliku";
    } catch (e) {
      pf.error = (e as Error).message;
    }
    out.push(pf);
  }
  return out;
}

/** Łączy wyniki z wielu plików */
export function mergeResults(results: ImportResult[]): ImportResult {
  const invoices = results.flatMap((r) => r.invoices);
  const costs = results.flatMap((r) => r.costs);
  const nips = new Set<string>();
  const contractors = results.flatMap((r) => r.contractors).filter((c) => (nips.has(c.nip) ? false : (nips.add(c.nip), true)));
  return {
    source: [...new Set(results.map((r) => r.source))].join(", "),
    invoices,
    costs,
    contractors,
    warnings: [...new Set(results.flatMap((r) => r.warnings))],
    period: monthRange([...invoices.map((i) => i.issueDate), ...costs.map((c) => c.date)]),
  };
}

// ───────────────────────── Duplikaty ─────────────────────────

const key = (a: string, b: string) => `${a.trim().toLowerCase()}|${b}`;

export function findDuplicates(result: ImportResult, existing: { invoices: Invoice[]; costs: Cost[]; contractors: Contractor[] }) {
  const invKeys = new Set(existing.invoices.map((i) => key(i.number, cleanNip(i.buyer.nip))));
  const costKeys = new Set(existing.costs.map((c) => key(c.docNumber, cleanNip(c.supplierNip) || c.supplierName.toLowerCase())));
  const contractorNips = new Set(existing.contractors.map((c) => cleanNip(c.nip)));
  const invoiceIds = new Set<string>();
  const costIds = new Set<string>();
  const seenInv = new Set<string>();
  const seenCost = new Set<string>();
  for (const i of result.invoices) {
    const k = key(i.number, cleanNip(i.buyer.nip));
    if (invKeys.has(k) || seenInv.has(k)) invoiceIds.add(i.id);
    seenInv.add(k);
  }
  for (const c of result.costs) {
    const k = key(c.docNumber, cleanNip(c.supplierNip) || c.supplierName.toLowerCase());
    if (costKeys.has(k) || seenCost.has(k)) costIds.add(c.id);
    seenCost.add(k);
  }
  const contractorIds = new Set(result.contractors.filter((c) => contractorNips.has(cleanNip(c.nip))).map((c) => c.id));
  return { invoiceIds, costIds, contractorIds };
}
