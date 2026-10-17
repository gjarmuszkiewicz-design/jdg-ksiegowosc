import { PARAMS_2026 as P } from "./config2026";
import { round2, pln } from "./money";
import { monthLabel, ryczaltHealth, yearSummary, zusSocial, type MonthSummary, type YearData } from "./tax";
import type { Cost, FixedAsset, Invoice, VatRate } from "./types";

export interface CalcLine {
  label: string;
  value: number;
  op?: "+" | "−" | "=" | "×";
  formula?: string;
  strong?: boolean;
}

export interface CalcSection {
  id: "pit" | "health" | "social" | "vat" | "month";
  title: string;
  result: number;
  lines: CalcLine[];
  note?: string;
}

const pct = (r: number) => `${(r * 100).toLocaleString("pl-PL", { maximumFractionDigits: 2 })}%`;

/** Rozpisanie wszystkich obliczeń za miesiąc krok po kroku (jak w księgach) */
export function explainMonth(data: YearData, summary: MonthSummary[], monthIdx: number): CalcSection[] {
  const { company } = data;
  const s = summary[monthIdx];
  const prev = monthIdx > 0 ? summary[monthIdx - 1] : undefined;
  const form = company.taxForm;
  const out: CalcSection[] = [];

  out.push({
    id: "month",
    title: `Wynik miesiąca — ${monthLabel(s.month)}`,
    result: s.income,
    lines: [
      { label: "Przychód ze sprzedaży (netto, wg daty sprzedaży)", value: s.revenue, op: "+" },
      ...(form === "ryczalt"
        ? []
        : [
            { label: "Koszty z dokumentów (z nieodliczonym VAT, × udział w KUP)", value: s.kupDocs, op: "−" as const },
            { label: "Odpisy amortyzacyjne", value: s.depreciation, op: "−" as const },
          ]),
      { label: "Składki społeczne zapłacone w tym miesiącu (za poprzedni)", value: s.socialDeducted, op: "−" },
      { label: form === "ryczalt" ? "Przychód po odliczeniu składek" : "Dochód miesiąca", value: form === "ryczalt" ? round2(s.revenue - s.socialDeducted) : s.income, op: "=", strong: true },
    ],
  });

  // PIT
  const pitLines: CalcLine[] = [{ label: "Przychód narastająco od początku roku", value: s.revenueYtd, op: "+" }];
  if (form !== "ryczalt") pitLines.push({ label: "Koszty uzyskania przychodu narastająco (z amortyzacją)", value: s.kupYtd, op: "−" });
  pitLines.push({ label: "Składki społeczne ZUS narastająco", value: s.socialYtd, op: "−" });
  if (form === "liniowy") pitLines.push({ label: `Zapłacona składka zdrowotna (limit ${pln(P.health.liniowyDeductionLimit)} rocznie)`, value: s.healthDedYtd, op: "−" });
  if (form === "ryczalt") pitLines.push({ label: "50% zapłaconej składki zdrowotnej", value: s.healthDedYtd, op: "−" });
  pitLines.push({ label: "Podstawa opodatkowania (zaokrąglona do pełnych zł)", value: s.taxBaseYtd, op: "=", strong: true });
  if (form === "skala") {
    const sk = P.pit.skala;
    if (s.taxBaseYtd <= sk.threshold)
      pitLines.push({ label: "Podatek wg skali", value: Math.max(0, Math.round(s.taxBaseYtd * sk.rate1 - sk.taxReduction)), op: "=", formula: `${pln(s.taxBaseYtd)} × 12% − ${pln(sk.taxReduction)} (kwota zmniejszająca)` });
    else
      pitLines.push({ label: "Podatek wg skali", value: s.taxYtd, op: "=", formula: `${pln(sk.threshold)} × 12% − ${pln(sk.taxReduction)} + (${pln(s.taxBaseYtd)} − ${pln(sk.threshold)}) × 32%` });
  } else if (form === "liniowy") {
    pitLines.push({ label: "Podatek liniowy", value: s.taxYtd, op: "=", formula: `${pln(s.taxBaseYtd)} × 19%` });
  } else {
    pitLines.push({ label: "Ryczałt", value: s.taxYtd, op: "=", formula: `${pln(s.taxBaseYtd)} × ${pct(company.ryczaltRate)}` });
  }
  pitLines.push({ label: "Zaliczki zapłacone za wcześniejsze miesiące", value: s.taxPrevYtd, op: "−" });
  pitLines.push({ label: "Zaliczka do zapłaty za ten miesiąc", value: s.pit, op: "=", strong: true });
  out.push({
    id: "pit",
    title: form === "ryczalt" ? "Ryczałt od przychodów ewidencjonowanych" : "Zaliczka na podatek dochodowy",
    result: s.pit,
    lines: pitLines,
    note: "Zaliczkę liczy się narastająco od początku roku i zaokrągla do pełnych złotych. Termin: 20. dnia następnego miesiąca (za grudzień — w zeznaniu rocznym).",
  });

  // Zdrowotna
  const healthLines: CalcLine[] = [];
  if (form === "ryczalt") {
    const tier = P.health.ryczaltTiers.find((t) => s.revenueYtd <= t.upTo)!;
    healthLines.push({ label: "Przychód narastająco", value: s.revenueYtd });
    healthLines.push({ label: tier.upTo === Infinity ? "Próg: powyżej 300 000 zł" : `Próg: do ${pln(tier.upTo)}`, value: ryczaltHealth(s.revenueYtd), op: "=", strong: true, formula: `9% × ${tier.upTo === 60000 ? "60%" : tier.upTo === 300000 ? "100%" : "180%"} przeciętnego wynagrodzenia z IV kw. (${pln(P.avgWageQ4PrevYear)})` });
  } else {
    const rate = form === "skala" ? P.health.skalaRate : P.health.liniowyRate;
    const minimum = monthIdx === 0 ? P.health.minimumJanuary : P.health.minimum;
    healthLines.push({ label: monthIdx === 0 ? "Podstawa (dochód z grudnia poprzedniego roku — brak danych)" : "Podstawa: dochód z poprzedniego miesiąca", value: s.healthBase });
    healthLines.push({ label: `Składka ${pct(rate)} od dochodu`, value: round2(s.healthBase * rate), op: "×", formula: `${pln(s.healthBase)} × ${pct(rate)}` });
    healthLines.push({ label: "Składka minimalna", value: minimum });
    healthLines.push({ label: "Składka zdrowotna (wyższa z dwóch)", value: s.health, op: "=", strong: true });
  }
  out.push({
    id: "health",
    title: "Składka zdrowotna",
    result: s.health,
    lines: healthLines,
    note: form === "ryczalt" ? "Po przekroczeniu progu w rozliczeniu rocznym składka jest przeliczana za cały rok." : "Po zakończeniu roku składkę rozlicza się rocznie od całego dochodu (do 20 maja).",
  });

  // Społeczne
  const z = zusSocial(company);
  out.push({
    id: "social",
    title: "Składki społeczne ZUS",
    result: s.social,
    lines: z.base
      ? [
          { label: "Podstawa wymiaru", value: z.base },
          { label: "Emerytalna 19,52%", value: z.emerytalna, op: "+" },
          { label: "Rentowa 8%", value: z.rentowa, op: "+" },
          ...(z.chorobowa ? [{ label: "Chorobowa 2,45% (dobrowolna)", value: z.chorobowa, op: "+" as const }] : []),
          { label: "Wypadkowa 1,67%", value: z.wypadkowa, op: "+" },
          ...(z.fp ? [{ label: "Fundusz Pracy 2,45%", value: z.fp, op: "+" as const }] : []),
          { label: "Razem do zapłaty", value: z.social, op: "=", strong: true },
        ]
      : [{ label: "Ulga na start — brak składek społecznych", value: 0, op: "=", strong: true }],
    note: "Składki za dany miesiąc płacisz do 20. dnia następnego miesiąca i wtedy odliczasz je od dochodu (lub przychodu na ryczałcie).",
  });

  // VAT
  if (company.vatStatus === "czynny") {
    const carryIn = prev?.vatCarry ?? 0;
    out.push({
      id: "vat",
      title: "Podatek VAT",
      result: s.vatDue,
      lines: [
        ...Object.entries(s.vatByRate).map(([rate, v]) => ({ label: `VAT należny — stawka ${rate === "zw" ? "zw." : rate === "np" ? "np." : rate + "%"} (netto ${pln(v.net)})`, value: v.vat, op: "+" as const })),
        { label: "VAT naliczony z faktur zakupowych", value: s.vatIn, op: "−" },
        ...(carryIn ? [{ label: "Nadwyżka z poprzedniego miesiąca", value: carryIn, op: "−" as const }] : []),
        { label: s.vatDue ? "VAT do zapłaty (zaokrąglony)" : "Nadwyżka do przeniesienia", value: s.vatDue || s.vatCarry, op: "=", strong: true },
      ],
      note: "Termin: JPK_V7M i zapłata do 25. dnia następnego miesiąca.",
    });
  }
  return out;
}

export interface MarginalRates {
  tax: number;
  health: number;
  total: number;
  /** Ile realnie kosztuje 1000 zł netto wydatku firmowego */
  realCostOf1000: number;
  explanation: string;
}

/** Krańcowa stawka obciążeń — o ile spadnie podatek i zdrowotna przy dodatkowym 1 zł kosztu */
export function marginalRates(data: YearData, s: MonthSummary): MarginalRates {
  const form = data.company.taxForm;
  let tax = 0;
  let health = 0;
  let explanation = "";
  if (form === "skala") {
    const sk = P.pit.skala;
    tax = s.taxBaseYtd > sk.threshold ? sk.rate2 : s.taxBaseYtd * sk.rate1 <= sk.taxReduction ? 0 : sk.rate1;
    health = P.health.skalaRate;
    explanation = tax === 0 ? "Twój dochód mieści się jeszcze w kwocie wolnej — koszty obniżają głównie zdrowotną." : `Jesteś w progu ${pct(tax)} — każdy koszt obniża podatek o ${pct(tax)} i zdrowotną o 9% jego wartości.`;
  } else if (form === "liniowy") {
    health = P.health.liniowyRate;
    const limitReached = s.healthDedYtd >= P.health.liniowyDeductionLimit;
    tax = limitReached ? P.pit.liniowy.rate : P.pit.liniowy.rate * (1 - P.health.liniowyRate);
    explanation = `Koszt obniża podatek o 19% i zdrowotną o 4,9% (pomniejszoną o utracone odliczenie zdrowotnej).`;
  } else {
    explanation = "Na ryczałcie podatek liczy się od przychodu — koszty nie obniżają ani podatku, ani zdrowotnej.";
  }
  const total = round2((tax + health) * 10000) / 10000;
  return { tax, health, total, realCostOf1000: round2(1000 * (1 - total)), explanation };
}

export interface Scenario {
  /** Dodatkowy przychód netto w miesiącu */
  revenue: number;
  revenueVatRate: VatRate;
  /** Dodatkowe bieżące koszty netto */
  costs: number;
  costsVatRate: VatRate;
  /** Planowany zakup (np. sprzęt) */
  purchase?: { net: number; vatRate: VatRate; asAsset: boolean; rate: number; method: FixedAsset["method"] };
}

export interface SimulationResult {
  month: string;
  base: MonthSummary;
  sim: MonthSummary;
  /** Kwoty do zapłaty w miesiącu następnym za symulowany miesiąc */
  payments: { social: number; health: number; pit: number; vat: number; total: number };
  basePayments: { social: number; health: number; pit: number; vat: number; total: number };
  /** Zdrowotna za kolejny miesiąc (liczona od dochodu symulowanego) */
  nextHealth?: number;
  netCash: number;
}

const vatOfRate = (net: number, r: VatRate) => (r === "zw" || r === "np" ? 0 : round2((net * Number(r)) / 100));

/** Symulacja miesiąca: co się stanie z podatkami, gdy dojdzie przychód / koszt / zakup */
export function simulateMonth(data: YearData, month: string, sc: Scenario): SimulationResult {
  const year = Number(month.slice(0, 4));
  const idx = Number(month.slice(5, 7)) - 1;
  const day = `${month}-15`;
  const invoices: Invoice[] = [...data.invoices];
  const costs: Cost[] = [...data.costs];
  const assets: FixedAsset[] = [...(data.assets ?? [])];
  if (sc.revenue > 0)
    invoices.push({
      id: "__sim_inv", number: "SYMULACJA", issueDate: day, saleDate: day, dueDate: day, place: "", paymentMethod: "przelew",
      buyer: { name: "Symulacja", nip: "", address: data.company.address, email: "", isCompany: true },
      items: [{ id: "x", name: "Symulacja", qty: 1, unit: "usł.", netPrice: sc.revenue, vatRate: data.company.vatStatus === "zwolniony" ? "zw" : sc.revenueVatRate }],
      notes: "", status: "wystawiona", ksef: { status: "brak" }, createdAt: day,
    });
  const mkCost = (id: string, net: number, rate: VatRate, isFixedAsset = false): Cost => ({
    id, docNumber: "SYM", date: day, supplierName: "Symulacja", supplierNip: "", description: "Symulacja", category: "inne",
    net, vatRate: rate, vat: vatOfRate(net, rate), vatDeduction: "pelne", costShare: 1, isFixedAsset, paid: true, createdAt: day,
  });
  if (sc.costs > 0) costs.push(mkCost("__sim_cost", sc.costs, sc.costsVatRate));
  if (sc.purchase && sc.purchase.net > 0) {
    const c = mkCost("__sim_purchase", sc.purchase.net, sc.purchase.vatRate, sc.purchase.asAsset);
    costs.push(c);
    if (sc.purchase.asAsset) {
      const nonDeductibleVat = data.company.vatStatus === "zwolniony" ? c.vat : 0;
      assets.push({
        id: "__sim_asset", name: "Symulowany zakup", inventoryNo: "", startDate: day, documentNo: "SYM", initialValue: round2(c.net + nonDeductibleVat),
        kstGroup: "inne", rate: sc.purchase.rate, method: sc.purchase.method, carLimit: "brak", costShare: 1, costId: c.id, isIntangible: false, createdAt: day,
      });
    }
  }
  const baseSummary = yearSummary(data, year);
  const simSummary = yearSummary({ ...data, invoices, costs, assets }, year);
  const pay = (m: MonthSummary) => ({ social: m.social, health: m.health, pit: m.pit, vat: m.vatDue, total: round2(m.social + m.health + m.pit + m.vatDue) });
  const sim = simSummary[idx];
  const payments = pay(sim);
  const vatCashIn = sc.revenue > 0 && data.company.vatStatus === "czynny" ? vatOfRate(sc.revenue, sc.revenueVatRate) : 0;
  const purchaseGross = sc.purchase ? sc.purchase.net + vatOfRate(sc.purchase.net, sc.purchase.vatRate) : 0;
  const costsGross = sc.costs + vatOfRate(sc.costs, sc.costsVatRate);
  return {
    month,
    base: baseSummary[idx],
    sim,
    payments,
    basePayments: pay(baseSummary[idx]),
    nextHealth: idx < 11 ? simSummary[idx + 1].health : undefined,
    netCash: round2(sim.revenue + vatCashIn - costsGross - purchaseGross - payments.total),
  };
}

/** Średnie z ostatnich n zakończonych miesięcy — domyślne wartości symulacji */
export function recentAverages(summary: MonthSummary[], upToIdx: number, n = 3) {
  const slice = summary.slice(Math.max(0, upToIdx - n), upToIdx).filter((m) => m.active);
  if (!slice.length) return { revenue: 0, costs: 0 };
  return {
    revenue: round2(slice.reduce((a, m) => a + m.revenue, 0) / slice.length),
    costs: round2(slice.reduce((a, m) => a + m.kupDocs, 0) / slice.length),
  };
}
