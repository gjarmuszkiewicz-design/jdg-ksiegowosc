import { COST_CATEGORIES } from "./costs";
import { guessCategory } from "./importers";
import { rateValue } from "./invoice";
import { round2 } from "./money";
import type { Company, Cost, CostCategory, VatRate } from "./types";
import { cleanNip, isValidNip } from "./validation";

/** Dane odczytane z PDF lub zdjęcia faktury zakupowej (wynik modelu AI) */
export interface ScannedInvoice {
  isInvoice: boolean;
  documentType: "faktura" | "faktura_korygujaca" | "rachunek" | "paragon" | "proforma" | "inne";
  number: string;
  issueDate: string;
  saleDate: string;
  dueDate: string;
  supplierName: string;
  supplierNip: string;
  supplierAddress: string;
  buyerName: string;
  buyerNip: string;
  currency: string;
  /** Podsumowanie według stawek VAT (jak w tabeli „razem” na fakturze) */
  rates: { rate: string; net: number; vat: number; gross: number }[];
  totalGross: number;
  /** Krótki opis zakupu, np. „Abonament Adobe Creative Cloud — listopad 2026” */
  description: string;
  category: CostCategory;
  paid: boolean;
  /** Wątpliwości modelu: nieczytelne pola, niezgodne sumy itp. */
  warnings: string[];
}

export const SCAN_CATEGORIES = COST_CATEGORIES.map((c) => c.value);

/** Schemat odpowiedzi dla modelu (structured outputs) */
export const SCAN_SCHEMA = {
  type: "object",
  properties: {
    isInvoice: { type: "boolean", description: "Czy dokument jest fakturą/rachunkiem zakupowym" },
    documentType: { type: "string", enum: ["faktura", "faktura_korygujaca", "rachunek", "paragon", "proforma", "inne"] },
    number: { type: "string", description: "Numer dokumentu dokładnie jak na fakturze" },
    issueDate: { type: "string", description: "Data wystawienia RRRR-MM-DD lub pusty tekst" },
    saleDate: { type: "string", description: "Data sprzedaży / wykonania usługi RRRR-MM-DD lub pusty tekst" },
    dueDate: { type: "string", description: "Termin płatności RRRR-MM-DD lub pusty tekst" },
    supplierName: { type: "string" },
    supplierNip: { type: "string", description: "NIP sprzedawcy (same cyfry, bez prefiksu PL) lub pusty tekst" },
    supplierAddress: { type: "string" },
    buyerName: { type: "string" },
    buyerNip: { type: "string", description: "NIP nabywcy (same cyfry) lub pusty tekst" },
    currency: { type: "string", description: "Kod waluty, np. PLN" },
    rates: {
      type: "array",
      description: "Podsumowanie według stawek VAT. Stawka: 23, 8, 5, 0, zw, np, oo",
      items: {
        type: "object",
        properties: { rate: { type: "string" }, net: { type: "number" }, vat: { type: "number" }, gross: { type: "number" } },
        required: ["rate", "net", "vat", "gross"],
        additionalProperties: false,
      },
    },
    totalGross: { type: "number" },
    description: { type: "string", description: "Krótki opis zakupu po polsku (do 80 znaków)" },
    category: { type: "string", enum: SCAN_CATEGORIES },
    paid: { type: "boolean", description: "Czy na dokumencie widać, że zapłacono (np. „zapłacono”, płatność kartą/gotówką, do zapłaty 0)" },
    warnings: { type: "array", items: { type: "string" }, description: "Wątpliwości po polsku, np. nieczytelna kwota" },
  },
  required: ["isInvoice", "documentType", "number", "issueDate", "saleDate", "dueDate", "supplierName", "supplierNip", "supplierAddress", "buyerName", "buyerNip", "currency", "rates", "totalGross", "description", "category", "paid", "warnings"],
  additionalProperties: false,
} as const;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function normalizeRate(r: string): VatRate {
  const t = String(r).toLowerCase().replace("%", "").trim();
  if (t.startsWith("zw")) return "zw";
  if (t.startsWith("np") || t === "oo") return "np";
  const n = Number(t.replace(",", "."));
  if ([23, 8, 5, 0].includes(n)) return String(n) as VatRate;
  return "23";
}

export interface ScanResult {
  costs: Cost[];
  /** Ostrzeżenia dla użytkownika (z modelu i z naszych kontroli) */
  warnings: string[];
}

/** Zamienia odczytaną fakturę na koszty — po jednym na każdą stawkę VAT */
export function costsFromScan(s: ScannedInvoice, company: Company, existing: Cost[], opts: { fileName: string; today: string; newId: () => string }): ScanResult {
  const warnings = [...(s.warnings ?? [])];
  if (!s.isInvoice) warnings.unshift("To nie wygląda na fakturę zakupową — sprawdź dane przed zapisaniem.");
  if (s.documentType === "proforma") warnings.unshift("To jest proforma — nie jest podstawą do zaksięgowania kosztu ani odliczenia VAT. Poczekaj na fakturę.");
  if (s.documentType === "paragon") warnings.push("To paragon — bez NIP firmy nie odliczysz VAT, ale możesz ująć wydatek w kosztach.");
  if (s.documentType === "faktura_korygujaca") warnings.push("Faktura korygująca — kwoty mogą być ujemne; sprawdź, czy zmniejszają koszt.");
  if (s.currency && s.currency.toUpperCase() !== "PLN") warnings.push(`Faktura w walucie ${s.currency} — przelicz kwoty po kursie NBP z dnia poprzedzającego datę wystawienia.`);

  const ownNip = cleanNip(company.nip);
  const buyerNip = cleanNip(s.buyerNip ?? "");
  if (ownNip && buyerNip && buyerNip !== ownNip) warnings.push(`Nabywcą jest NIP ${buyerNip}, a nie Twoja firma (${ownNip}).`);
  if (ownNip && !buyerNip && s.documentType === "faktura") warnings.push("Na fakturze nie znaleziono Twojego NIP — bez niego nie odliczysz VAT.");

  const supplierNip = cleanNip(s.supplierNip ?? "");
  if (supplierNip && !isValidNip(supplierNip)) warnings.push(`NIP sprzedawcy ${supplierNip} ma złą sumę kontrolną — sprawdź cyfry.`);

  const number = (s.number ?? "").trim();
  if (number && existing.some((c) => c.docNumber.trim() === number && (!supplierNip || cleanNip(c.supplierNip) === supplierNip)))
    warnings.unshift(`Koszt z dokumentem ${number} już jest w aplikacji — możliwy duplikat.`);

  const date = ISO.test(s.issueDate) ? s.issueDate : ISO.test(s.saleDate) ? s.saleDate : opts.today;
  if (!ISO.test(s.issueDate)) warnings.push("Nie odczytano daty wystawienia — sprawdź datę.");

  // stawki: gdy model nie podał podsumowania, całość jako 23% z kwoty brutto
  let rates = (s.rates ?? []).filter((r) => r.net || r.vat || r.gross);
  if (!rates.length && s.totalGross) rates = [{ rate: "23", net: round2(s.totalGross / 1.23), vat: round2(s.totalGross - s.totalGross / 1.23), gross: s.totalGross }];
  if (company.vatStatus === "zwolniony" && rates.length > 1) warnings.push("Jesteś zwolniony z VAT — koszt zapisz w kwocie brutto (bez odliczenia).");

  const guess = guessCategory(s.supplierName ?? "", s.description ?? "");
  const category = SCAN_CATEGORIES.includes(s.category) ? s.category : guess.category;
  const defaults = COST_CATEGORIES.find((c) => c.value === category)?.defaults ?? { vatDeduction: guess.vatDeduction, costShare: guess.costShare };

  const costs = rates.map((r): Cost => {
    const rate = normalizeRate(r.rate);
    const net = round2(Number(r.net) || (r.gross ? r.gross / (1 + rateValue(rate)) : 0));
    const vat = round2(Number(r.vat) || 0);
    return {
      id: opts.newId(),
      docNumber: number,
      date,
      supplierName: (s.supplierName ?? "").trim(),
      supplierNip,
      description: [(s.description ?? "").trim(), rates.length > 1 ? `(VAT ${rate === "zw" || rate === "np" ? rate : `${rate}%`})` : ""].filter(Boolean).join(" ").slice(0, 200),
      category,
      net,
      vatRate: rate,
      vat,
      vatDeduction: company.vatStatus === "zwolniony" ? "brak" : defaults.vatDeduction,
      costShare: defaults.costShare,
      isFixedAsset: false,
      paid: Boolean(s.paid),
      createdAt: new Date().toISOString(),
      source: `skan:${opts.fileName}`,
    };
  });

  const sum = round2(costs.reduce((a, c) => a + c.net + c.vat, 0));
  if (s.totalGross && Math.abs(sum - s.totalGross) >= 0.02) warnings.push(`Suma stawek (${sum.toFixed(2)} zł) nie zgadza się z kwotą „do zapłaty” (${Number(s.totalGross).toFixed(2)} zł) — sprawdź kwoty.`);
  if (!costs.length) warnings.push("Nie odczytano kwot — uzupełnij je ręcznie.");
  if (costs.some((c) => c.category === "sprzet" && c.net > 10000)) warnings.push("Sprzęt powyżej 10 000 zł netto to środek trwały — dodaj go w Środkach trwałych zamiast w kosztach.");
  return { costs, warnings };
}
