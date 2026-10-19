import { workday } from "./deadlines";
import { round2 } from "./money";
import { yearSummary, type YearData } from "./tax";
import type { Payment, PaymentKind } from "./types";

export const PAYMENT_KIND_LABELS: Record<PaymentKind, string> = {
  pit: "Zaliczka na PIT / ryczałt",
  vat: "VAT",
  zus_spoleczne: "ZUS — składki społeczne",
  zus_zdrowotna: "ZUS — składka zdrowotna",
  odsetki: "Odsetki za zwłokę",
  inne: "Inna wpłata",
};

export const PAYMENT_TARGET: Record<PaymentKind, string> = {
  pit: "mikrorachunek podatkowy",
  vat: "mikrorachunek podatkowy",
  zus_spoleczne: "rachunek składkowy ZUS (NRS)",
  zus_zdrowotna: "rachunek składkowy ZUS (NRS)",
  odsetki: "mikrorachunek podatkowy lub NRS",
  inne: "",
};

export type ObligationStatus = "zaplacone" | "czesciowo" | "zalegle" | "do_zaplaty" | "szacunek";

export interface Obligation {
  kind: PaymentKind;
  period: string;
  dueDate: string;
  amount: number;
  paid: number;
  remaining: number;
  status: ObligationStatus;
  /** Miesiąc jeszcze trwa — kwota może się zmienić */
  estimate: boolean;
  daysLate: number;
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function dueDateFor(kind: PaymentKind, period: string) {
  const [y, m] = period.split("-").map(Number);
  // zaliczka za grudzień — w zeznaniu rocznym do 30 kwietnia
  if (kind === "pit" && m === 12) return workday(y + 1, 4, 30);
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return workday(ny, nm, kind === "vat" ? 25 : 20);
}

const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 86400000);

/** Zobowiązania wyliczone z ksiąg zestawione z zarejestrowanymi wpłatami */
export function computeObligations(data: YearData, payments: Payment[], today = new Date()) {
  const todayIso = iso(today);
  const thisMonth = todayIso.slice(0, 7);
  const startYear = data.company.startDate ? Number(data.company.startDate.slice(0, 4)) : today.getFullYear();
  const obligations: Obligation[] = [];

  for (let year = startYear; year <= today.getFullYear(); year++) {
    for (const s of yearSummary(data, year)) {
      if (!s.active || s.month > thisMonth) continue;
      const items: [PaymentKind, number][] = [
        ["pit", s.pit],
        ["vat", data.company.vatStatus === "czynny" ? s.vatDue : 0],
        ["zus_spoleczne", s.social],
        ["zus_zdrowotna", s.health],
      ];
      for (const [kind, amount] of items) {
        const paid = round2(payments.filter((p) => p.kind === kind && p.period === s.month).reduce((a, p) => a + p.amount, 0));
        if (!amount && !paid) continue;
        const dueDate = dueDateFor(kind, s.month);
        const remaining = round2(Math.max(0, amount - paid));
        const estimate = s.month === thisMonth;
        // tolerancja 1 zł na zaokrąglenia
        let status: ObligationStatus;
        if (remaining < 1) status = "zaplacone";
        else if (estimate) status = "szacunek";
        else if (dueDate < todayIso) status = paid > 0 ? "czesciowo" : "zalegle";
        else status = paid > 0 ? "czesciowo" : "do_zaplaty";
        obligations.push({
          kind, period: s.month, dueDate, amount, paid, remaining: remaining < 1 ? 0 : remaining, status, estimate,
          daysLate: remaining >= 1 && dueDate < todayIso ? daysBetween(dueDate, todayIso) : 0,
        });
      }
    }
  }

  const overdue = obligations.filter((o) => o.remaining > 0 && o.dueDate < todayIso && !o.estimate);
  const upcoming = obligations.filter((o) => o.remaining > 0 && o.dueDate >= todayIso && !o.estimate);
  const year = String(today.getFullYear());
  return {
    obligations,
    overdue,
    upcoming,
    overdueTotal: round2(overdue.reduce((a, o) => a + o.remaining, 0)),
    upcomingTotal: round2(upcoming.reduce((a, o) => a + o.remaining, 0)),
    paidThisYear: round2(payments.filter((p) => p.paidDate.startsWith(year)).reduce((a, p) => a + p.amount, 0)),
    nextDue: upcoming.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate,
  };
}
