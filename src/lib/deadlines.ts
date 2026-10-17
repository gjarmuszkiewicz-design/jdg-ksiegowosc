import { monthLabel, prevMonthKey } from "./tax";
import type { Company } from "./types";

export interface Deadline {
  date: string;
  title: string;
  description: string;
  kind: "zus" | "pit" | "vat" | "roczne" | "inne";
}

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Termin przypadający w weekend przesuwa się na najbliższy dzień roboczy (święta pominięte) */
function workday(y: number, m: number, d: number) {
  const date = new Date(y, m - 1, d);
  while (date.getDay() === 0 || date.getDay() === 6) date.setDate(date.getDate() + 1);
  return iso(date);
}

export function upcomingDeadlines(company: Company, today = new Date(), count = 8): Deadline[] {
  const out: Deadline[] = [];
  const todayIso = iso(today);
  for (let offset = 0; offset < 14; offset++) {
    const d = new Date(today.getFullYear(), today.getMonth() + offset, 1);
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const mk = `${y}-${String(m).padStart(2, "0")}`;
    const forMonth = monthLabel(prevMonthKey(mk));

    out.push({
      date: workday(y, m, 20),
      kind: "zus",
      title: "Składki ZUS",
      description: `Opłać składki za ${forMonth} na swój mikrorachunek ZUS.`,
    });
    if (company.taxForm) {
      // zaliczka za grudzień wpłacana jest w zeznaniu rocznym
      if (m !== 1)
        out.push({
          date: workday(y, m, 20),
          kind: "pit",
          title: company.taxForm === "ryczalt" ? "Ryczałt za poprzedni miesiąc" : "Zaliczka na PIT",
          description: `Wpłać podatek za ${forMonth} na mikrorachunek podatkowy.`,
        });
    }
    if (company.vatStatus === "czynny")
      out.push({
        date: workday(y, m, 25),
        kind: "vat",
        title: "JPK_V7M + VAT",
        description: `Wyślij JPK_V7M i zapłać VAT za ${forMonth}.`,
      });
    if (m === 1)
      out.push({
        date: workday(y, 1, 31),
        kind: "inne",
        title: "Mały ZUS Plus — zgłoszenie",
        description: "Ostatni dzień na zgłoszenie do Małego ZUS Plus (ZUS ZZA/ZUA z kodem 05 90).",
      });
    if (m === 2)
      out.push({
        date: workday(y, 2, 20),
        kind: "inne",
        title: "Zmiana formy opodatkowania",
        description: "Do 20 lutego możesz zmienić formę opodatkowania na ten rok (CEIDG).",
      });
    if (m === 4)
      out.push({
        date: workday(y, 4, 30),
        kind: "roczne",
        title: "Zeznanie roczne PIT",
        description: `PIT-36 / PIT-36L / PIT-28 za ${y - 1} r. oraz dopłata podatku.`,
      });
    if (m === 5)
      out.push({
        date: workday(y, 5, 20),
        kind: "roczne",
        title: "Roczne rozliczenie składki zdrowotnej",
        description: "Rozliczenie zdrowotnej za poprzedni rok w deklaracji ZUS DRA za kwiecień.",
      });
  }
  return out.filter((d) => d.date >= todayIso).sort((a, b) => a.date.localeCompare(b.date)).slice(0, count);
}

export const daysUntil = (date: string, today = new Date()) => {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const [y, m, d] = date.split("-").map(Number);
  return Math.round((new Date(y, m - 1, d).getTime() - t) / 86400000);
};
