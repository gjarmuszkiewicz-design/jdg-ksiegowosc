import { PARAMS_2026 as P } from "./config2026";
import { isAccounting, isOverdue, isProforma } from "./invoice";
import { pln } from "./money";
import { monthKey, monthLabel, prevMonthKey, yearSummary } from "./tax";
import { isValidIban, isValidNip } from "./validation";
import { computeObligations } from "./obligations";
import type { Company, Contractor, Cost, FixedAsset, Invoice, Payment } from "./types";

export interface GuideStep {
  id: string;
  title: string;
  description: string;
  to: string;
  cta: string;
  tone: "info" | "warning" | "danger" | "success";
}

export interface Insight {
  id: string;
  title: string;
  description: string;
  tone: "info" | "warning" | "success";
  to?: string;
}

interface Ctx {
  company: Company;
  contractors: Contractor[];
  invoices: Invoice[];
  costs: Cost[];
  assets?: FixedAsset[];
  payments?: Payment[];
}

/** Lista „co teraz zrobić” — prowadzenie za rękę */
export function nextSteps({ company, contractors, invoices, costs, assets, payments }: Ctx, today = new Date()): GuideStep[] {
  const steps: GuideStep[] = [];
  if (payments) {
    const ob = computeObligations({ company, invoices, costs, assets }, payments, today);
    if (ob.overdueTotal > 0)
      steps.push({ id: "zaleglosci", title: `Zaległe podatki i ZUS: ${pln(ob.overdueTotal)}`, description: `${ob.overdue.length} ${ob.overdue.length === 1 ? "pozycja" : "pozycji"} po terminie. Zapłać je z odsetkami albo oznacz jako zapłacone, jeśli już to zrobiłeś.`, to: "/platnosci", cta: "Zobacz", tone: "danger" });
  }
  const thisMonth = today.toISOString().slice(0, 7);
  const prevMonth = prevMonthKey(thisMonth);

  if (!isValidNip(company.nip) || !company.address.street || !company.bankAccount)
    steps.push({ id: "company", title: "Uzupełnij dane firmy", description: "NIP, adres i numer konta pojawią się na Twoich fakturach.", to: "/ustawienia", cta: "Uzupełnij", tone: "warning" });
  else if (company.bankAccount && !isValidIban(company.bankAccount))
    steps.push({ id: "iban", title: "Sprawdź numer konta", description: "Numer rachunku wygląda na niepoprawny — klient może mieć problem z przelewem.", to: "/ustawienia", cta: "Popraw", tone: "warning" });

  if (company.vatStatus === "czynny" && (!company.taxOfficeCode || !company.birthDate))
    steps.push({ id: "jpk-data", title: "Dane do JPK", description: "Do pliku JPK_V7M potrzebny jest kod urzędu skarbowego i data urodzenia.", to: "/ustawienia", cta: "Uzupełnij", tone: "info" });

  if (!contractors.length)
    steps.push({ id: "contractor", title: "Dodaj pierwszego kontrahenta", description: "Zapisz dane klienta raz — kolejne faktury wystawisz w kilka sekund.", to: "/kontrahenci", cta: "Dodaj klienta", tone: "info" });

  if (!invoices.some((i) => !isProforma(i) && monthKey(i.issueDate) === thisMonth))
    steps.push({ id: "invoice", title: "Wystaw fakturę za ten miesiąc", description: "Nie masz jeszcze żadnej faktury sprzedażowej w tym miesiącu.", to: "/faktury/nowa", cta: "Wystaw fakturę", tone: "info" });

  const overdue = invoices.filter((i) => isOverdue(i));
  if (overdue.length)
    steps.push({ id: "overdue", title: `${overdue.length} ${overdue.length === 1 ? "faktura po terminie" : "faktury po terminie"}`, description: `Klienci zalegają łącznie z płatnościami. Wyślij przypomnienie lub oznacz jako opłacone.`, to: "/faktury?filtr=po-terminie", cta: "Zobacz", tone: "danger" });

  // KSeF obowiązkowy dla większości firm od 1.04.2026 — starszych faktur nie wysyłamy
  const ksefPending = invoices.filter((i) => isAccounting(i) && !i.ksef.number && i.buyer.isCompany && i.issueDate >= "2026-04-01" && (i.ksef.status === "brak" || i.ksef.status === "odrzucona"));
  if (ksefPending.length)
    steps.push({ id: "ksef", title: `Wyślij ${ksefPending.length} ${ksefPending.length === 1 ? "fakturę" : "faktur"} do KSeF`, description: "Faktury dla firm muszą trafić do KSeF — dopiero wtedy są uznane za wystawione.", to: "/ksef", cta: "Przejdź do KSeF", tone: "warning" });

  if (!costs.some((c) => monthKey(c.date) === prevMonth))
    steps.push({ id: "costs", title: `Dodaj koszty za ${monthLabel(prevMonth)}`, description: "Każdy koszt obniża podatek (a przy VAT — także kwotę VAT do zapłaty).", to: "/koszty/nowy", cta: "Dodaj koszt", tone: "info" });

  if (company.vatStatus === "czynny" && today.getDate() <= 25)
    steps.push({ id: "jpk", title: `Wygeneruj JPK_V7M za ${monthLabel(prevMonth)}`, description: "Termin wysyłki i zapłaty VAT mija 25. dnia miesiąca.", to: "/vat", cta: "Rozlicz VAT", tone: today.getDate() > 18 ? "warning" : "info" });

  if (today.getDate() <= 20)
    steps.push({ id: "zus-pit", title: "Zapłać ZUS i zaliczkę na podatek", description: "Termin: 20. dnia miesiąca. Kwoty są wyliczone w zakładkach ZUS i PIT.", to: "/zus", cta: "Sprawdź kwoty", tone: today.getDate() > 14 ? "warning" : "info" });

  return steps;
}

/** Spostrzeżenia i podpowiedzi optymalizacyjne na podstawie danych */
export function insights(ctx: Ctx, year = new Date().getFullYear()): Insight[] {
  const { company, invoices } = ctx;
  const out: Insight[] = [];
  const summary = yearSummary(ctx, year);
  const now = new Date();
  const monthsElapsed = year === now.getFullYear() ? now.getMonth() + 1 : 12;
  const revenueYtd = summary[monthsElapsed - 1]?.revenueYtd ?? 0;
  const forecast = (revenueYtd / monthsElapsed) * 12;

  if (company.vatStatus === "zwolniony") {
    const grossYtd = revenueYtd;
    const pct = grossYtd / P.vat.exemptionLimit;
    if (pct > 0.8)
      out.push({ id: "vat-limit", tone: "warning", title: `Wykorzystałeś ${Math.round(pct * 100)}% limitu zwolnienia z VAT`, description: `Limit to ${pln(P.vat.exemptionLimit)}. Po jego przekroczeniu musisz zarejestrować się jako czynny podatnik VAT (VAT-R).`, to: "/wiedza/limit-vat" });
    else if (forecast > P.vat.exemptionLimit)
      out.push({ id: "vat-forecast", tone: "info", title: "Prognoza: przekroczysz limit VAT w tym roku", description: `Przy obecnym tempie roczna sprzedaż wyniesie ok. ${pln(forecast)}.`, to: "/wiedza/limit-vat" });
  }

  if (company.taxForm === "skala" && forecast > P.pit.skala.threshold)
    out.push({ id: "skala-prog", tone: "warning", title: "Wejdziesz w drugi próg podatkowy (32%)", description: "Sprawdź w Optymalizacji, czy podatek liniowy lub ryczałt nie byłyby korzystniejsze od przyszłego roku.", to: "/optymalizacja" });

  if (company.taxForm === "ryczalt" && forecast > 60000 && revenueYtd <= 60000)
    out.push({ id: "rycz-prog", tone: "info", title: "Zbliżasz się do progu 60 000 zł przychodu", description: "Po jego przekroczeniu składka zdrowotna na ryczałcie wzrośnie do 830,58 zł miesięcznie.", to: "/zus" });

  if (company.zusStage === "pelny" && forecast < P.zus.malyZusPlusRevenueLimit)
    out.push({ id: "maly-zus", tone: "success", title: "Możesz skorzystać z Małego ZUS Plus", description: "Przychód poniżej 120 000 zł rocznie pozwala płacić niższe składki społeczne od przyszłego roku (zgłoszenie do 31 stycznia).", to: "/wiedza/ulga-na-start" });

  if (!company.chorobowa && company.zusStage !== "ulga_na_start")
    out.push({ id: "chorobowe", tone: "info", title: "Nie płacisz dobrowolnej składki chorobowej", description: "Bez niej nie dostaniesz zasiłku chorobowego ani macierzyńskiego. To kilkadziesiąt–kilkaset zł miesięcznie.", to: "/wiedza/ulga-na-start" });

  const clients = new Map<string, number>();
  for (const i of invoices) if (isAccounting(i)) clients.set(i.buyer.name, (clients.get(i.buyer.name) ?? 0) + 1);
  const top = [...clients.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && clients.size > 0 && top[1] / invoices.length > 0.7)
    out.push({ id: "jeden-klient", tone: "info", title: "Większość przychodu od jednego klienta", description: `${top[0]} odpowiada za ponad 70% faktur. Przy B2B dla byłego pracodawcy sprawdź, czy możesz stosować podatek liniowy.`, to: "/wiedza/forma-opodatkowania" });

  if (company.pkd.startsWith("62") && company.taxForm !== "ryczalt")
    out.push({ id: "ipbox", tone: "success", title: "Sprawdź IP Box (5%)", description: "Tworzysz oprogramowanie — dochód z praw autorskich może być opodatkowany stawką 5%.", to: "/wiedza/ip-box" });

  return out;
}
