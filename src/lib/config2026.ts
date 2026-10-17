/**
 * Parametry podatkowo-składkowe na 2026 r.
 * Wartości trzeba weryfikować co roku (obwieszczenia ZUS, MF, GUS) — wszystkie są w jednym miejscu,
 * a część z nich użytkownik może nadpisać w Ustawieniach.
 */
export const PARAMS_2026 = {
  year: 2026,
  minimalWage: 4806,
  forecastAverageWage: 9420,
  /** Przeciętne wynagrodzenie w IV kw. 2025 (podstawa zdrowotnej na ryczałcie) */
  avgWageQ4PrevYear: 9228.64,

  zus: {
    fullBase: 5652, // 60% prognozowanego przeciętnego wynagrodzenia
    preferentialBase: 1441.8, // 30% minimalnego wynagrodzenia
    rates: { emerytalna: 0.1952, rentowa: 0.08, chorobowa: 0.0245, wypadkowa: 0.0167, fp: 0.0245 },
    malyZusPlusRevenueLimit: 120000,
  },

  health: {
    /** Minimalna składka zdrowotna (skala, liniowy) od lutego 2026: 9% minimalnego wynagrodzenia */
    minimum: 432.54,
    minimumJanuary: 314.96,
    skalaRate: 0.09,
    liniowyRate: 0.049,
    /** Roczny limit odliczenia zdrowotnej na podatku liniowym */
    liniowyDeductionLimit: 14100,
    ryczaltTiers: [
      { upTo: 60000, amount: 498.35 },
      { upTo: 300000, amount: 830.58 },
      { upTo: Infinity, amount: 1495.04 },
    ],
  },

  pit: {
    skala: { threshold: 120000, rate1: 0.12, rate2: 0.32, taxReduction: 3600 },
    liniowy: { rate: 0.19 },
    solidarityThreshold: 1000000,
    solidarityRate: 0.04,
  },

  vat: {
    exemptionLimit: 240000,
  },

  ryczaltRates: [
    { rate: 0.02, label: "2% — sprzedaż produktów rolnych" },
    { rate: 0.03, label: "3% — gastronomia, handel" },
    { rate: 0.055, label: "5,5% — produkcja, budowlanka" },
    { rate: 0.085, label: "8,5% — usługi (do 100 tys. zł), najem" },
    { rate: 0.1, label: "10% — kupno/sprzedaż nieruchomości" },
    { rate: 0.12, label: "12% — usługi IT, programowanie" },
    { rate: 0.14, label: "14% — usługi medyczne, architektoniczne, inżynierskie" },
    { rate: 0.15, label: "15% — usługi niematerialne (np. doradztwo, marketing)" },
    { rate: 0.17, label: "17% — wolne zawody" },
  ],
} as const;

export const ZUS_STAGE_LABELS: Record<string, string> = {
  ulga_na_start: "Ulga na start (6 mies. — tylko zdrowotna)",
  preferencyjny: "Preferencyjny ZUS (24 mies.)",
  maly_zus_plus: "Mały ZUS Plus",
  pelny: "Pełny ZUS",
};

export const TAX_FORM_LABELS: Record<string, string> = {
  skala: "Skala podatkowa (12% / 32%)",
  liniowy: "Podatek liniowy (19%)",
  ryczalt: "Ryczałt od przychodów ewidencjonowanych",
};
