import { DE_MINIMIS_EUR } from "./assets";
import { PARAMS_2026 as P } from "./config2026";
import type { MarginalRates } from "./explain";
import { invoiceTotals } from "./invoice";
import { pln, round2 } from "./money";
import type { MonthSummary, YearData } from "./tax";

export interface Advice {
  id: string;
  title: string;
  description: string;
  /** Szacowana oszczędność lub kwota, której dotyczy porada */
  amount?: number;
  amountLabel?: string;
  tone: "info" | "warning" | "success";
  category: "podatek" | "vat" | "zus" | "plynnosc" | "planowanie";
  to?: string;
}

/**
 * Konkretne, liczbowe porady na bieżący miesiąc — co możesz zrobić z podatkiem do zapłaty.
 * Zasada nadrzędna: nie kupujemy niczego tylko dla podatku — wydatek zawsze kosztuje więcej, niż oszczędza.
 */
export function monthlyAdvice(data: YearData, summary: MonthSummary[], idx: number, mr: MarginalRates): Advice[] {
  const { company, invoices } = data;
  const s = summary[idx];
  const out: Advice[] = [];
  const remainingMonths = 12 - idx;

  if (company.taxForm !== "ryczalt" && s.pit > 0) {
    out.push({
      id: "zakupy-planowane",
      category: "podatek",
      tone: "info",
      title: "Planowane zakupy firmowe zrób przed końcem miesiąca",
      description: `Twoja krańcowa stawka to ${(mr.total * 100).toFixed(1)}%: każde 1 000 zł netto kosztów obniży podatek i zdrowotną o ok. ${pln(1000 * mr.total)}. Realnie taki wydatek kosztuje Cię ${pln(mr.realCostOf1000)}${company.vatStatus === "czynny" ? " (VAT odzyskasz osobno)" : ""}. Kupuj tylko to, czego firma naprawdę potrzebuje — zakup „pod podatek” zawsze kosztuje więcej, niż oszczędza.`,
      amount: round2(1000 * mr.total),
      amountLabel: "oszczędność na każde 1 000 zł",
      to: "/koszty/poradnik",
    });
  }

  if (company.vatStatus === "czynny" && s.vatDue > 0)
    out.push({
      id: "vat-faktury-zakupowe",
      category: "vat",
      tone: "info",
      title: `VAT do zapłaty: ${pln(s.vatDue)} — sprawdź, czy masz wszystkie faktury zakupowe`,
      description: "VAT odliczysz w miesiącu otrzymania faktury (lub w dwóch kolejnych okresach). Pobierz faktury kosztowe z KSeF — często brakuje abonamentów, paliwa i drobnych zakupów online.",
      amount: s.vatDue,
      amountLabel: "VAT do zapłaty",
      to: "/ksef",
    });

  if (company.taxForm === "skala") {
    const toThreshold = P.pit.skala.threshold - s.taxBaseYtd;
    if (toThreshold > 0 && toThreshold < 30000)
      out.push({
        id: "skala-prog",
        category: "planowanie",
        tone: "warning",
        title: `Do drugiego progu (32%) zostało ${pln(toThreshold)}`,
        description: "Każda złotówka dochodu ponad próg będzie opodatkowana 32%. Rozważ wpłatę na IKZE (odliczenie od dochodu), wspólne rozliczenie z małżonkiem oraz zaplanuj niezbędne inwestycje — a na kolejny rok przelicz podatek liniowy i ryczałt w Optymalizacji.",
        amount: toThreshold,
        amountLabel: "do progu",
        to: "/optymalizacja",
      });
    else if (toThreshold <= 0)
      out.push({
        id: "skala-ponad-prog",
        category: "planowanie",
        tone: "warning",
        title: "Jesteś w drugim progu podatkowym (32%)",
        description: "Każdy dodatkowy koszt obniża teraz podatek o 32% + 9% zdrowotnej. Na przyszły rok sprawdź, czy podatek liniowy lub ryczałt nie będzie tańszy (zmiana do 20 lutego).",
        to: "/optymalizacja",
      });
  }

  if (company.taxForm === "liniowy" && s.healthDedYtd >= P.health.liniowyDeductionLimit)
    out.push({
      id: "liniowy-limit-zdrowotnej",
      category: "podatek",
      tone: "info",
      title: "Wykorzystałeś roczny limit odliczenia zdrowotnej",
      description: `Do końca roku zdrowotna nie obniży już podatku (limit ${pln(P.health.liniowyDeductionLimit)}).`,
    });

  if (company.taxForm === "ryczalt") {
    for (const tier of [60000, 300000]) {
      const left = tier - s.revenueYtd;
      if (left > 0 && left < 25000) {
        const next = P.health.ryczaltTiers.find((t) => t.upTo > tier)!.amount;
        const curr = P.health.ryczaltTiers.find((t) => t.upTo === tier)!.amount;
        out.push({
          id: `rycz-prog-${tier}`,
          category: "zus",
          tone: "warning",
          title: `Do progu ${pln(tier)} przychodu zostało ${pln(left)}`,
          description: `Po przekroczeniu progu składka zdrowotna wzrośnie z ${pln(curr)} do ${pln(next)} miesięcznie, a w rozliczeniu rocznym — za cały rok (dopłata ok. ${pln((next - curr) * 12)}). Zaplanuj sprzedaż świadomie.`,
          amount: round2((next - curr) * 12),
          amountLabel: "możliwa dopłata zdrowotnej",
          to: "/zus",
        });
      }
    }
    if (s.revenueYtd > 0)
      out.push({
        id: "rycz-koszty",
        category: "planowanie",
        tone: "info",
        title: "Na ryczałcie zakupy nie obniżają podatku",
        description: "Zbieraj jednak faktury kosztowe — jeśli koszty przekraczają ok. 20–30% przychodu, podatek liniowy lub skala mogą być korzystniejsze od przyszłego roku.",
        to: "/optymalizacja",
      });
  }

  const unpaid = invoices.filter((i) => i.status !== "oplacona" && i.status !== "szkic");
  const unpaidSum = unpaid.reduce((a, i) => a + invoiceTotals(i).gross, 0);
  const toPay = round2(s.pit + s.vatDue + s.social + s.health);
  if (unpaidSum > 0 && toPay > 0)
    out.push({
      id: "plynnosc",
      category: "plynnosc",
      tone: unpaidSum > toPay ? "warning" : "info",
      title: `Klienci są Ci winni ${pln(unpaidSum)}`,
      description: `Podatki płacisz od daty sprzedaży, nie od daty zapłaty. W przyszłym miesiącu zapłacisz ok. ${pln(toPay)} — przypomnij się klientom z nieopłaconymi fakturami.`,
      amount: unpaidSum,
      amountLabel: "nieopłacone faktury",
      to: "/faktury?filtr=nieoplacone",
    });

  if (company.taxForm !== "ryczalt")
    out.push({
      id: "de-minimis",
      category: "podatek",
      tone: "success",
      title: "Większy zakup? Jednorazowa amortyzacja",
      description: `Sprzęt powyżej 10 000 zł netto (poza samochodami osobowymi) możesz wrzucić w koszty od razu w ramach pomocy de minimis — do równowartości ${DE_MINIMIS_EUR.toLocaleString("pl-PL")} EUR rocznie. Szczegóły w ewidencji środków trwałych.`,
      to: "/srodki-trwale",
    });

  if (company.zusStage === "pelny" && s.revenueYtd / (idx + 1) * 12 < P.zus.malyZusPlusRevenueLimit)
    out.push({
      id: "maly-zus",
      category: "zus",
      tone: "success",
      title: "Możesz obniżyć ZUS od przyszłego roku",
      description: "Przy przychodzie poniżej 120 000 zł rocznie przysługuje Mały ZUS Plus — zgłoszenie do 31 stycznia.",
      to: "/wiedza/ulga-na-start",
    });

  if (remainingMonths <= 3 && company.taxForm !== "ryczalt")
    out.push({
      id: "koniec-roku",
      category: "planowanie",
      tone: "info",
      title: "Koniec roku — przegląd podatkowy",
      description: "Sprawdź: wpłatę na IKZE (odliczenie od dochodu do limitu), zaległe faktury kosztowe, likwidację zużytego sprzętu, wybór formy opodatkowania na kolejny rok.",
      to: "/optymalizacja",
    });

  return out;
}

/** Ile procent każdej faktury odkładać na podatki i składki (na bazie ostatnich miesięcy) */
export function reserveRate(summary: MonthSummary[], idx: number, vatActive: boolean) {
  const slice = summary.slice(Math.max(0, idx - 3), idx + 1).filter((m) => m.revenue > 0);
  const revenue = slice.reduce((a, m) => a + m.revenue, 0);
  if (!revenue) return 0;
  const burdens = slice.reduce((a, m) => a + m.pit + m.social + m.health, 0);
  const vatOut = vatActive ? slice.reduce((a, m) => a + m.vatDue, 0) : 0;
  return round2(((burdens + vatOut) / (revenue + (vatActive ? slice.reduce((a, m) => a + m.vatOut, 0) : 0))) * 100);
}
