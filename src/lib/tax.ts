import { monthlyDepreciation } from "./assets";
import { PARAMS_2026 as P } from "./config2026";
import { invoiceTotals, rateValue } from "./invoice";
import { round2 } from "./money";
import type { Company, Cost, FixedAsset, Invoice, TaxForm, VatRate } from "./types";

export const monthKey = (date: string) => date.slice(0, 7);
export const prevMonthKey = (mk: string) => {
  const [y, m] = mk.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
};
export const MONTHS_PL = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
export const MONTHS_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
export const monthLabel = (mk: string) => {
  const [y, m] = mk.split("-").map(Number);
  return `${MONTHS_PL[m - 1]} ${y}`;
};

const booked = (inv: Invoice) => inv.status !== "szkic";

// ───────────────────────── Przychody i koszty ─────────────────────────

/** Przychód podatkowy z faktury = wartość netto (u zwolnionych z VAT netto = brutto) */
export const invoiceRevenue = (inv: Invoice) => invoiceTotals(inv).net;

export const costDeductibleVat = (c: Cost, company: Company) => {
  if (company.vatStatus === "zwolniony") return 0;
  const share = c.vatDeduction === "pelne" ? 1 : c.vatDeduction === "polowa" ? 0.5 : 0;
  return round2(c.vat * share);
};

/** Koszt uzyskania przychodu: netto + nieodliczony VAT, pomnożone przez udział w KUP */
export const costKup = (c: Cost, company: Company) => {
  if (c.isFixedAsset && c.net > 10000) return 0; // wymaga amortyzacji — poza uproszczonym modelem
  const nonDeductibleVat = c.vat - costDeductibleVat(c, company);
  return round2((c.net + nonDeductibleVat) * (c.costShare ?? 1));
};

// ───────────────────────── ZUS ─────────────────────────

export interface ZusBreakdown {
  base: number;
  emerytalna: number;
  rentowa: number;
  chorobowa: number;
  wypadkowa: number;
  fp: number;
  social: number;
}

export function zusSocial(company: Company): ZusBreakdown {
  const r = P.zus.rates;
  let base = 0;
  if (company.zusStage === "preferencyjny") base = P.zus.preferentialBase;
  else if (company.zusStage === "maly_zus_plus")
    base = Math.min(Math.max(company.malyZusBase || P.zus.preferentialBase, P.zus.preferentialBase), P.zus.fullBase);
  else if (company.zusStage === "pelny") base = P.zus.fullBase;
  if (!base) return { base: 0, emerytalna: 0, rentowa: 0, chorobowa: 0, wypadkowa: 0, fp: 0, social: 0 };
  const emerytalna = round2(base * r.emerytalna);
  const rentowa = round2(base * r.rentowa);
  const chorobowa = company.chorobowa ? round2(base * r.chorobowa) : 0;
  const wypadkowa = round2(base * r.wypadkowa);
  // Fundusz Pracy nie jest należny, gdy podstawa < minimalnego wynagrodzenia
  const fp = base >= P.minimalWage ? round2(base * r.fp) : 0;
  const social = round2(emerytalna + rentowa + chorobowa + wypadkowa + fp);
  return { base, emerytalna, rentowa, chorobowa, wypadkowa, fp, social };
}

export function ryczaltHealth(revenueYtd: number) {
  return P.health.ryczaltTiers.find((t) => revenueYtd <= t.upTo)!.amount;
}

// ───────────────────────── Zestawienie miesięczne ─────────────────────────

export interface MonthSummary {
  month: string; // YYYY-MM
  active: boolean;
  revenue: number;
  kup: number;
  /** Koszty z dokumentów (bez amortyzacji) */
  kupDocs: number;
  /** Odpisy amortyzacyjne zaliczone do kosztów */
  depreciation: number;
  invoicesCount: number;
  costsCount: number;
  vatOut: number;
  vatIn: number;
  vatByRate: Record<string, { net: number; vat: number }>;
  vatDue: number; // do wpłaty
  vatCarry: number; // nadwyżka do przeniesienia
  social: number; // składki społeczne ZA ten miesiąc
  health: number; // składka zdrowotna ZA ten miesiąc
  socialDeducted: number; // społeczne odliczone w tym miesiącu (zapłacone w nim)
  healthDeducted: number;
  income: number; // dochód miesiąca (skala/liniowy)
  taxBaseYtd: number;
  taxYtd: number;
  pit: number; // zaliczka za miesiąc
  revenueYtd: number;
  kupYtd: number;
  socialYtd: number;
  healthDedYtd: number;
  /** Suma zaliczek zapłaconych za wcześniejsze miesiące roku */
  taxPrevYtd: number;
  /** Dochód poprzedniego miesiąca — podstawa zdrowotnej (skala/liniowy) */
  healthBase: number;
}

export interface YearData {
  company: Company;
  invoices: Invoice[];
  costs: Cost[];
  assets?: FixedAsset[];
}

export function pitFromBase(form: TaxForm, base: number, ryczaltRate: number) {
  const b = Math.max(0, Math.round(base));
  if (form === "skala") {
    const s = P.pit.skala;
    const tax = b <= s.threshold ? b * s.rate1 - s.taxReduction : s.threshold * s.rate1 - s.taxReduction + (b - s.threshold) * s.rate2;
    return Math.max(0, Math.round(tax));
  }
  if (form === "liniowy") return Math.round(b * P.pit.liniowy.rate);
  return Math.round(b * ryczaltRate);
}

export function yearSummary({ company, invoices, costs, assets = [] }: YearData, year: number): MonthSummary[] {
  const startMk = company.startDate ? monthKey(company.startDate) : `${year}-01`;
  const social = zusSocial(company).social;
  const result: MonthSummary[] = [];
  let revenueYtd = 0, kupYtd = 0, socialYtd = 0, healthDedYtd = 0, taxPrevYtd = 0;
  let vatCarry = 0;
  let prevIncome: number | null = null;
  const linkedCosts = new Set(assets.map((a) => a.costId).filter(Boolean));

  for (let m = 1; m <= 12; m++) {
    const mk = `${year}-${String(m).padStart(2, "0")}`;
    const active = mk >= startMk;
    const prevActive = prevMonthKey(mk) >= startMk;
    const mInv = invoices.filter((i) => booked(i) && monthKey(i.saleDate || i.issueDate) === mk);
    const mCost = costs.filter((c) => monthKey(c.date) === mk);

    const revenue = round2(mInv.reduce((s, i) => s + invoiceRevenue(i), 0));
    const isRycz = company.taxForm === "ryczalt";
    const kupDocs = isRycz ? 0 : round2(mCost.filter((c) => !linkedCosts.has(c.id)).reduce((s, c) => s + costKup(c, company), 0));
    const depreciation = isRycz ? 0 : monthlyDepreciation(assets, mk).deductible;
    const kup = round2(kupDocs + depreciation);

    // VAT
    const vatByRate: Record<string, { net: number; vat: number }> = {};
    for (const inv of mInv)
      for (const r of invoiceTotals(inv).rates) {
        const e = (vatByRate[r.rate] ??= { net: 0, vat: 0 });
        e.net = round2(e.net + r.net);
        e.vat = round2(e.vat + r.vat);
      }
    const vatOut = company.vatStatus === "czynny" ? round2(Object.values(vatByRate).reduce((s, r) => s + r.vat, 0)) : 0;
    const vatIn = company.vatStatus === "czynny" ? round2(mCost.reduce((s, c) => s + costDeductibleVat(c, company), 0)) : 0;
    const vatBalance = Math.round(vatOut) - Math.round(vatIn) - Math.round(vatCarry);
    const vatDue = Math.max(0, vatBalance);
    vatCarry = vatBalance < 0 ? -vatBalance : 0;

    // ZUS: składki za miesiąc M płacone do 20. dnia M+1 → odliczane w M+1
    const monthSocial = active ? social : 0;
    const socialDeducted = prevActive ? social : 0;

    revenueYtd = round2(revenueYtd + revenue);
    kupYtd = round2(kupYtd + kup);

    let health = 0;
    const healthBase = m === 1 ? 0 : Math.max(0, prevIncome ?? 0);
    if (active) {
      if (company.taxForm === "ryczalt") health = ryczaltHealth(revenueYtd);
      else {
        const rate = company.taxForm === "skala" ? P.health.skalaRate : P.health.liniowyRate;
        const minimum = m === 1 ? P.health.minimumJanuary : P.health.minimum;
        health = round2(Math.max(minimum, healthBase * rate));
      }
    }
    const prevHealth = result.length ? result[result.length - 1].health : 0;
    const healthDeducted =
      company.taxForm === "liniowy"
        ? Math.min(prevHealth, Math.max(0, P.health.liniowyDeductionLimit - healthDedYtd))
        : company.taxForm === "ryczalt"
          ? round2(prevHealth * 0.5)
          : 0;

    socialYtd = round2(socialYtd + socialDeducted);
    healthDedYtd = round2(healthDedYtd + healthDeducted);

    const income = round2(revenue - kup - socialDeducted);
    prevIncome = Math.max(0, income);

    const taxBaseYtd =
      company.taxForm === "ryczalt" ? revenueYtd - socialYtd - healthDedYtd : revenueYtd - kupYtd - socialYtd - (company.taxForm === "liniowy" ? healthDedYtd : 0);
    const taxYtd = pitFromBase(company.taxForm, taxBaseYtd, company.ryczaltRate);
    const pit = Math.max(0, taxYtd - taxPrevYtd);
    const paidBefore = taxPrevYtd;
    taxPrevYtd = Math.max(taxPrevYtd, taxYtd);

    result.push({
      month: mk, active, revenue, kup, kupDocs, depreciation, invoicesCount: mInv.length, costsCount: mCost.length,
      vatOut, vatIn, vatByRate, vatDue, vatCarry: Math.round(vatCarry),
      social: monthSocial, health, socialDeducted, healthDeducted, income,
      taxBaseYtd: Math.max(0, Math.round(taxBaseYtd)), taxYtd, pit, revenueYtd, kupYtd,
      socialYtd, healthDedYtd, taxPrevYtd: paidBefore, healthBase,
    });
  }
  return result;
}

// ───────────────────────── Porównanie form opodatkowania ─────────────────────────

export interface FormComparison {
  form: TaxForm;
  label: string;
  tax: number;
  health: number;
  social: number;
  total: number;
  netIncome: number;
  note: string;
}

export function compareForms(revenue: number, costs: number, social: number, ryczaltRate: number): FormComparison[] {
  const income = Math.max(0, revenue - costs - social);
  const minHealthYear = P.health.minimumJanuary + 11 * P.health.minimum;

  const skalaHealth = round2(Math.max(minHealthYear, income * P.health.skalaRate));
  const skalaTax = pitFromBase("skala", income, 0);

  const linHealth = round2(Math.max(minHealthYear, income * P.health.liniowyRate));
  const linTax = pitFromBase("liniowy", income - Math.min(linHealth, P.health.liniowyDeductionLimit), 0);
  const solidarity = income > P.pit.solidarityThreshold ? Math.round((income - P.pit.solidarityThreshold) * P.pit.solidarityRate) : 0;

  const ryczHealth = round2(ryczaltHealth(revenue) * 12);
  const ryczTax = pitFromBase("ryczalt", revenue - social - ryczHealth * 0.5, ryczaltRate);

  const mk = (form: TaxForm, label: string, tax: number, health: number, note: string): FormComparison => ({
    form, label, tax, health, social, total: round2(tax + health + social), netIncome: round2(revenue - costs - tax - health - social), note,
  });
  return [
    mk("skala", "Skala podatkowa", skalaTax + solidarity, skalaHealth, "Kwota wolna 30 000 zł, wspólne rozliczenie z małżonkiem, ulgi (np. na dzieci)."),
    mk("liniowy", "Podatek liniowy 19%", linTax + solidarity, linHealth, "Stała stawka niezależnie od dochodu, odliczenie zdrowotnej do limitu. Brak ulg prorodzinnych."),
    mk("ryczalt", `Ryczałt ${(ryczaltRate * 100).toLocaleString("pl-PL")}%`, ryczTax, ryczHealth, "Podatek od przychodu — koszty nie mają znaczenia. Opłacalny przy niskich kosztach."),
  ];
}

export function vatRateLabel(r: VatRate) {
  return r === "zw" ? "zw." : r === "np" ? "np." : `${r}%`;
}

export const vatOf = (net: number, rate: VatRate) => round2(net * rateValue(rate));
