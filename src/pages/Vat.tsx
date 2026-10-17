import { AlertTriangle, ArrowDownCircle, ArrowUpCircle, CheckCircle2, Download, FileCode2, Percent, Wallet } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Badge, Button, Card, CardHeader, Hint, Modal, PageHeader, Stat, Tip } from "@/components/ui";
import { PARAMS_2026 as P } from "@/lib/config2026";
import { currentYear, useYearSummary } from "@/lib/hooks";
import { buildJpkV7M, type JpkResult } from "@/lib/jpk";
import { pln } from "@/lib/money";
import { MONTHS_PL, monthLabel, vatRateLabel } from "@/lib/tax";
import { downloadFile } from "@/lib/xml";
import type { VatRate } from "@/lib/types";
import { useStore } from "@/store/useStore";

const years = () => {
  const y = currentYear();
  return [y - 2, y - 1, y];
};

export default function Vat() {
  const company = useStore((s) => s.company);
  const invoices = useStore((s) => s.invoices);
  const costs = useStore((s) => s.costs);
  const [year, setYear] = useState(currentYear());
  const defaultMonth = year === currentYear() ? Math.max(1, new Date().getMonth()) : 12; // domyślnie poprzedni miesiąc
  const [month, setMonth] = useState(defaultMonth);
  const summary = useYearSummary(year);
  const [jpk, setJpk] = useState<JpkResult | null>(null);

  const mk = `${year}-${String(month).padStart(2, "0")}`;
  const ms = summary[month - 1];
  const prev = month > 1 ? summary[month - 2] : null;

  const yearRevenue = summary.reduce((s, m) => s + m.revenue, 0);

  if (company.vatStatus === "zwolniony") {
    const pct = Math.min(100, (yearRevenue / P.vat.exemptionLimit) * 100);
    const tone = pct > 90 ? "from-rose-500 to-pink-500" : pct > 70 ? "from-amber-500 to-orange-500" : "from-emerald-500 to-teal-500";
    return (
      <div className="space-y-6">
        <PageHeader title="VAT" subtitle="Korzystasz ze zwolnienia podmiotowego z VAT" actions={<YearSelect year={year} onChange={setYear} />} />
        <Card className="p-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-sm font-medium text-slate-500">
                Wykorzystanie limitu zwolnienia w {year} r.
                <Hint text="Limit zwolnienia podmiotowego (art. 113 ustawy o VAT) od 2026 r. wynosi 240 000 zł sprzedaży rocznie. Przy rozpoczęciu działalności w trakcie roku liczy się go proporcjonalnie." />
              </div>
              <div className="mt-2 text-3xl font-bold">
                {pln(yearRevenue)} <span className="text-lg font-medium text-slate-400">/ {pln(P.vat.exemptionLimit)}</span>
              </div>
            </div>
            <Badge tone={pct > 90 ? "red" : pct > 70 ? "amber" : "green"}>{pct.toFixed(1)}% limitu</Badge>
          </div>
          <div className="mt-5 h-4 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full bg-gradient-to-r ${tone} transition-all`} style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-2 text-sm text-slate-500">Pozostało: {pln(Math.max(0, P.vat.exemptionLimit - yearRevenue))}</div>
        </Card>
        <Tip title="Co zrobić, gdy zbliżasz się do limitu?" tone={pct > 80 ? "warning" : "tip"}>
          Przed transakcją, którą przekroczysz limit, złóż aktualizację VAT-R i od tej sprzedaży wystawiaj faktury z VAT. Pamiętaj, że niektóre usługi (np. doradcze,
          prawnicze) wykluczają zwolnienie niezależnie od obrotów. <Link to="/wiedza/limit-vat" className="font-semibold text-brand-600 hover:underline">Przeczytaj więcej</Link>
        </Tip>
        <Tip tone="info" title="Nie składasz JPK_V7M">
          Jako podatnik zwolniony nie składasz miesięcznych plików JPK_V7M. Na fakturach wpisujesz podstawę zwolnienia: <b>{company.vatExemptionBasis}</b>.
        </Tip>
      </div>
    );
  }

  const missing = [!company.taxOfficeCode && "kod urzędu skarbowego", !company.birthDate && "data urodzenia", !company.firstName && "imię", !company.lastName && "nazwisko"].filter(Boolean);

  const generate = () => setJpk(buildJpkV7M(company, invoices, costs, mk, prev?.vatCarry ?? 0));

  const rates = Object.entries(ms.vatByRate) as [VatRate, { net: number; vat: number }][];
  const isCarry = ms.vatCarry > 0 && ms.vatDue === 0;

  const steps = [
    { title: "Sprawdź faktury sprzedaży", desc: `${ms.invoicesCount} faktur z datą sprzedaży w tym miesiącu.`, to: "/faktury", done: ms.invoicesCount > 0 },
    { title: "Sprawdź koszty i zakupy", desc: `${ms.costsCount} dokumentów kosztowych. Upewnij się, że dodałeś wszystkie faktury zakupowe.`, to: "/koszty", done: ms.costsCount > 0 },
    { title: "Wygeneruj plik JPK_V7M", desc: "Aplikacja przygotuje ewidencję i deklarację w formacie XML.", done: !!jpk },
    { title: "Podpisz i wyślij plik", desc: "Użyj e-mikrofirmy lub Klienta JPK — podpis danymi autoryzacyjnymi (kwota przychodu sprzed 2 lat) lub profilem zaufanym.", done: false },
    { title: "Zapłać VAT na mikrorachunek", desc: `Do 25. dnia następnego miesiąca: ${pln(ms.vatDue)}.`, done: ms.vatDue === 0 },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="VAT i JPK_V7M"
        subtitle="Miesięczne rozliczenie podatku VAT"
        actions={
          <>
            <YearSelect year={year} onChange={setYear} />
            <select className="input w-auto" value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {MONTHS_PL.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </select>
            <Button icon={<FileCode2 className="h-4 w-4" />} onClick={generate} disabled={missing.length > 0}>
              Generuj JPK_V7M
            </Button>
          </>
        }
      />

      {missing.length > 0 && (
        <Tip tone="warning" title="Brakuje danych do pliku JPK" action={<Button size="sm" variant="secondary" to="/ustawienia">Uzupełnij w ustawieniach</Button>}>
          Do wygenerowania JPK_V7M potrzebne są: {missing.join(", ")}.
        </Tip>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="VAT należny" value={pln(ms.vatOut)} sub="ze sprzedaży" icon={<ArrowUpCircle className="h-5 w-5" />} tone="rose" hint="VAT z faktur sprzedażowych, których data sprzedaży przypada na ten miesiąc." />
        <Stat label="VAT naliczony" value={pln(ms.vatIn)} sub="do odliczenia z zakupów" icon={<ArrowDownCircle className="h-5 w-5" />} tone="green" hint="VAT z faktur kosztowych, który możesz odliczyć (przy samochodzie zwykle 50%)." />
        <Stat
          label={isCarry ? "Nadwyżka do przeniesienia" : "VAT do zapłaty"}
          value={pln(isCarry ? ms.vatCarry : ms.vatDue)}
          sub={isCarry ? "przechodzi na następny miesiąc" : `termin: 25 ${MONTHS_PL[month % 12].slice(0, 3)}.`}
          icon={<Wallet className="h-5 w-5" />}
          tone={isCarry ? "violet" : "amber"}
          hint="Kwoty w deklaracji zaokrągla się do pełnych złotych. Uwzględniono nadwyżkę z poprzedniego miesiąca."
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title={`Sprzedaż wg stawek — ${monthLabel(mk)}`} icon={<Percent className="h-4 w-4" />} />
          {rates.length ? (
            <table className="w-full">
              <thead className="bg-slate-50">
                <tr>
                  <th className="table-head">Stawka</th>
                  <th className="table-head text-right">Netto</th>
                  <th className="table-head text-right">VAT</th>
                  <th className="table-head text-right">Brutto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rates.map(([r, v]) => (
                  <tr key={r}>
                    <td className="table-cell">
                      <Badge tone="blue">{vatRateLabel(r)}</Badge>
                    </td>
                    <td className="table-cell text-right">{pln(v.net)}</td>
                    <td className="table-cell text-right">{pln(v.vat)}</td>
                    <td className="table-cell text-right font-semibold">{pln(v.net + v.vat)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">Brak sprzedaży w tym miesiącu.</div>
          )}
          {prev && prev.vatCarry > 0 && (
            <div className="border-t border-slate-100 px-5 py-3 text-sm text-slate-600">
              Nadwyżka z {monthLabel(prev.month)}: <b>{pln(prev.vatCarry)}</b> — pomniejsza VAT do zapłaty.
            </div>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Kroki rozliczenia" subtitle="Przejdź po kolei" />
          <ol className="space-y-3 p-5">
            {steps.map((s, i) => (
              <li key={s.title} className="flex gap-3">
                <div className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-emerald-100 text-emerald-700" : "bg-brand-50 text-brand-700"}`}>
                  {s.done ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </div>
                <div className="text-sm">
                  <div className="font-semibold text-slate-900">
                    {s.to ? (
                      <Link to={s.to} className="hover:text-brand-600">
                        {s.title}
                      </Link>
                    ) : (
                      s.title
                    )}
                  </div>
                  <div className="text-slate-500">{s.desc}</div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card>
        <CardHeader title={`Zestawienie roczne VAT — ${year}`} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-head">Miesiąc</th>
                <th className="table-head text-right">Należny</th>
                <th className="table-head text-right">Naliczony</th>
                <th className="table-head text-right">Do zapłaty</th>
                <th className="table-head text-right">Do przeniesienia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.map((m, i) => (
                <tr key={m.month} className={`cursor-pointer hover:bg-slate-50 ${i + 1 === month ? "bg-brand-50/50" : ""} ${!m.active ? "text-slate-400" : ""}`} onClick={() => setMonth(i + 1)}>
                  <td className="table-cell capitalize">{MONTHS_PL[i]}</td>
                  <td className="table-cell text-right">{pln(m.vatOut)}</td>
                  <td className="table-cell text-right">{pln(m.vatIn)}</td>
                  <td className="table-cell text-right font-semibold">{pln(m.vatDue)}</td>
                  <td className="table-cell text-right">{m.vatCarry ? pln(m.vatCarry) : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-slate-50 font-semibold">
              <tr>
                <td className="table-cell">Razem</td>
                <td className="table-cell text-right">{pln(summary.reduce((s, m) => s + m.vatOut, 0))}</td>
                <td className="table-cell text-right">{pln(summary.reduce((s, m) => s + m.vatIn, 0))}</td>
                <td className="table-cell text-right">{pln(summary.reduce((s, m) => s + m.vatDue, 0))}</td>
                <td className="table-cell" />
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>

      <Modal
        open={!!jpk}
        onClose={() => setJpk(null)}
        title={`JPK_V7M — ${monthLabel(mk)}`}
        wide
        footer={
          <>
            <Button variant="secondary" onClick={() => setJpk(null)}>
              Zamknij
            </Button>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => jpk && downloadFile(`JPK_V7M_${year}_${String(month).padStart(2, "0")}.xml`, jpk.xml)}>
              Pobierz plik XML
            </Button>
          </>
        }
      >
        {jpk && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <Mini label="Wiersze sprzedaży" value={String(jpk.salesRows)} />
              <Mini label="Wiersze zakupów" value={String(jpk.purchaseRows)} />
              <Mini label="Do zapłaty (P_51)" value={pln(jpk.totals.due)} />
              <Mini label="Do przeniesienia (P_62)" value={pln(jpk.totals.carry)} />
            </div>
            <Tip tone="warning">
              <span className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Przed wysyłką sprawdź plik w walidatorze Ministerstwa Finansów lub w e-mikrofirmie. Struktura JPK_V7M(3)
                uwzględnia oznaczenia KSeF (NrKSeF / BFK).
              </span>
            </Tip>
            <pre className="max-h-80 overflow-auto rounded-xl bg-slate-900 p-4 text-xs leading-relaxed text-emerald-200">{jpk.xml}</pre>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

export function YearSelect({ year, onChange }: { year: number; onChange: (y: number) => void }) {
  return (
    <select className="input w-auto" value={year} onChange={(e) => onChange(Number(e.target.value))}>
      {years().map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
