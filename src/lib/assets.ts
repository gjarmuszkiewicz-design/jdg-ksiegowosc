import { round2 } from "./money";
import type { FixedAsset } from "./types";

/** Wybrane pozycje Klasyfikacji Środków Trwałych i WNiP z rocznymi stawkami amortyzacji (załącznik nr 1 do ustawy o PIT) */
export const KST_GROUPS: { value: string; label: string; rate: number; degressive: boolean; intangible?: boolean; car?: boolean }[] = [
  { value: "491", label: "Komputery, laptopy, serwery (KŚT 491)", rate: 0.3, degressive: true },
  { value: "8", label: "Wyposażenie, meble, narzędzia (KŚT gr. 8)", rate: 0.2, degressive: true },
  { value: "6", label: "Urządzenia techniczne, telefony, sprzęt AV (KŚT gr. 6)", rate: 0.1, degressive: true },
  { value: "4", label: "Maszyny i urządzenia ogólnego zastosowania (KŚT gr. 4)", rate: 0.14, degressive: true },
  { value: "741", label: "Samochód osobowy (KŚT 741)", rate: 0.2, degressive: false, car: true },
  { value: "742", label: "Samochód ciężarowy, dostawczy (KŚT 742)", rate: 0.2, degressive: false },
  { value: "1", label: "Budynek niemieszkalny / lokal użytkowy (KŚT gr. 1)", rate: 0.025, degressive: false },
  { value: "WNiP-lic", label: "Licencje na oprogramowanie (WNiP, min. 24 mies.)", rate: 0.5, degressive: false, intangible: true },
  { value: "WNiP-aut", label: "Autorskie prawa majątkowe (WNiP, min. 24 mies.)", rate: 0.5, degressive: false, intangible: true },
  { value: "WNiP-inne", label: "Inne WNiP, np. know-how (min. 60 mies.)", rate: 0.2, degressive: false, intangible: true },
  { value: "inne", label: "Inna grupa — wpiszę stawkę", rate: 0.1, degressive: false },
];

export const LOW_VALUE_LIMIT = 10000;
/** Limit jednorazowej amortyzacji de minimis: 100 000 EUR rocznie (przeliczane po kursie z pierwszego dnia roboczego października roku poprzedniego) */
export const DE_MINIMIS_EUR = 100000;

export const METHOD_LABELS: Record<string, string> = {
  liniowa: "Liniowa",
  degresywna: "Degresywna (stawka ×2)",
  jednorazowa_de_minimis: "Jednorazowa (de minimis)",
  jednorazowa_niskocenna: "Jednorazowo w koszty (do 10 000 zł)",
};

export const CAR_LIMIT_LABELS: Record<string, string> = {
  brak: "Nie dotyczy",
  "150000": "150 000 zł — samochód spalinowy / hybryda (emisja < 50 g CO₂/km)",
  "100000": "100 000 zł — emisja CO₂ ≥ 50 g/km (od 2026 r.)",
  "225000": "225 000 zł — samochód elektryczny / wodorowy",
};

const mk = (date: string) => date.slice(0, 7);
const addMonths = (monthKey: string, n: number) => {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/** Jaka część odpisu jest kosztem podatkowym (limit dla aut osobowych × udział w KUP) */
export function deductibleShare(a: FixedAsset) {
  const limit = a.carLimit === "brak" ? Infinity : Number(a.carLimit);
  const limitShare = a.initialValue > limit ? limit / a.initialValue : 1;
  return limitShare * (a.costShare ?? 1);
}

export interface ScheduleRow {
  month: string;
  amount: number;
  deductible: number;
  cumulative: number;
  remaining: number;
  note?: string;
}

/**
 * Pełny plan amortyzacji środka trwałego miesiąc po miesiącu.
 * Odpisy od miesiąca następującego po przyjęciu do używania, aż do zrównania z wartością początkową
 * lub do miesiąca likwidacji/sprzedaży.
 */
export function depreciationSchedule(a: FixedAsset): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  const share = deductibleShare(a);
  const startMk = mk(a.startDate);
  const endMk = a.disposalDate ? mk(a.disposalDate) : undefined;
  const value = a.initialValue;
  if (value <= 0) return rows;

  const push = (month: string, amount: number, note?: string) => {
    const prev = rows.length ? rows[rows.length - 1].cumulative : 0;
    const amt = round2(Math.min(amount, value - prev));
    const cumulative = round2(prev + amt);
    rows.push({ month, amount: amt, deductible: round2(amt * share), cumulative, remaining: round2(value - cumulative), note });
  };

  if (a.method === "jednorazowa_niskocenna") {
    // Niskocenne: jednorazowo w miesiącu oddania do używania
    push(startMk, value, "Jednorazowy odpis — środek niskocenny");
    return rows;
  }
  if (a.method === "jednorazowa_de_minimis") {
    // Jednorazowa amortyzacja: odpis dokonywany w miesiącu wprowadzenia do ewidencji
    push(startMk, value, "Jednorazowa amortyzacja (pomoc de minimis)");
    return rows;
  }

  const linearMonthly = (value * a.rate) / 12;
  let month = addMonths(startMk, 1);
  let guard = 0;
  // Degresywna: co rok odpis = wartość netto na początek roku × (stawka × 2); przejście na liniową,
  // gdy roczny odpis degresywny byłby niższy niż liniowy
  let yearlyDegressive = 0;
  let switchedToLinear = a.method !== "degresywna";
  while (guard++ < 1200) {
    if (endMk && month > endMk) break;
    const prev = rows.length ? rows[rows.length - 1].cumulative : 0;
    if (prev >= value - 0.005) break;
    let amount = linearMonthly;
    let note: string | undefined;
    if (!switchedToLinear) {
      const isFirst = rows.length === 0;
      if (isFirst || month.endsWith("-01")) {
        const netValue = value - prev;
        yearlyDegressive = netValue * a.rate * 2;
        if (yearlyDegressive <= value * a.rate) {
          switchedToLinear = true;
          note = "Przejście na metodę liniową";
        }
      }
      if (!switchedToLinear) amount = yearlyDegressive / 12;
    }
    push(month, amount, note);
    month = addMonths(month, 1);
  }
  return rows;
}

/** Suma odpisów (kosztowych) wszystkich środków za dany miesiąc */
export function monthlyDepreciation(assets: FixedAsset[], monthKey: string) {
  let amount = 0;
  let deductible = 0;
  const items: { asset: FixedAsset; amount: number; deductible: number }[] = [];
  for (const a of assets) {
    const row = depreciationSchedule(a).find((r) => r.month === monthKey);
    if (row && row.amount > 0) {
      amount += row.amount;
      deductible += row.deductible;
      items.push({ asset: a, amount: row.amount, deductible: row.deductible });
    }
  }
  return { amount: round2(amount), deductible: round2(deductible), items };
}

export function assetStatus(a: FixedAsset, today = new Date().toISOString().slice(0, 7)) {
  const rows = depreciationSchedule(a);
  const done = rows.filter((r) => r.month <= today);
  const cumulative = done.length ? done[done.length - 1].cumulative : 0;
  const last = rows[rows.length - 1];
  return {
    cumulative,
    netValue: round2(a.initialValue - cumulative),
    fullyDepreciated: cumulative >= a.initialValue - 0.005,
    endMonth: last?.month,
    nonDeductibleTotal: round2(rows.reduce((s, r) => s + (r.amount - r.deductible), 0)),
  };
}

/** Dobór domyślnej metody na podstawie wartości */
export function suggestMethod(value: number): FixedAsset["method"] {
  return value <= LOW_VALUE_LIMIT ? "jednorazowa_niskocenna" : "liniowa";
}
