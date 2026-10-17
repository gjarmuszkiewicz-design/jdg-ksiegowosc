import { CalendarClock, Coins, FileSpreadsheet, Landmark, TrendingUp } from "lucide-react";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge, Card, CardHeader, Hint, PageHeader, Stat, Tip } from "@/components/ui";
import { TAX_FORM_LABELS } from "@/lib/config2026";
import { currentYear, useYearSummary } from "@/lib/hooks";
import { pln } from "@/lib/money";
import { MONTHS_PL, MONTHS_SHORT } from "@/lib/tax";
import { useStore } from "@/store/useStore";
import { YearSelect } from "./Vat";

const ANNUAL_FORM: Record<string, string> = { skala: "PIT-36", liniowy: "PIT-36L", ryczalt: "PIT-28" };

export default function Pit() {
  const company = useStore((s) => s.company);
  const [year, setYear] = useState(currentYear());
  const summary = useYearSummary(year);
  const isRyczalt = company.taxForm === "ryczalt";

  const totals = {
    revenue: summary.reduce((s, m) => s + m.revenue, 0),
    kup: summary.reduce((s, m) => s + m.kup, 0),
    pit: summary.reduce((s, m) => s + m.pit, 0),
    social: summary.reduce((s, m) => s + m.socialDeducted, 0),
  };
  const now = new Date();
  const curIdx = year === now.getFullYear() ? Math.max(0, now.getMonth() - 1) : 11;
  const toPayNow = summary[curIdx];

  const chart = summary.map((m, i) => ({ name: MONTHS_SHORT[i], zaliczka: i === 11 ? 0 : m.pit, grudzien: i === 11 ? m.pit : 0 }));

  const cols: { key: string; label: string; hint: string }[] = [
    { key: "revenue", label: "Przychód", hint: "Suma netto faktur sprzedażowych z datą sprzedaży w danym miesiącu." },
    ...(!isRyczalt ? [{ key: "kup", label: "Koszty (KUP)", hint: "Koszty uzyskania przychodu: netto + nieodliczony VAT, z uwzględnieniem udziału (np. 75% dla auta)." }] : []),
    { key: "socialDeducted", label: "ZUS społ. odliczony", hint: "Składki społeczne zapłacone w tym miesiącu (za miesiąc poprzedni) — odliczasz je od dochodu lub przychodu." },
    ...(company.taxForm !== "skala" ? [{ key: "healthDeducted", label: "Zdrowotna odliczona", hint: isRyczalt ? "50% zapłaconej składki zdrowotnej odliczasz od przychodu." : "Na liniowym zapłaconą zdrowotną odliczasz od dochodu do rocznego limitu." }] : []),
    { key: "taxBaseYtd", label: "Podstawa narastająco", hint: "Podstawa opodatkowania od początku roku, zaokrąglona do pełnych złotych." },
    { key: "taxYtd", label: "Podatek narastająco", hint: isRyczalt ? "Ryczałt od początku roku wg Twojej stawki." : company.taxForm === "skala" ? "12% (32% powyżej 120 tys. zł) minus kwota zmniejszająca 3 600 zł." : "19% podstawy." },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Podatek dochodowy"
        subtitle="Zaliczki na PIT liczone narastająco od początku roku"
        actions={<YearSelect year={year} onChange={setYear} />}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="violet">{TAX_FORM_LABELS[company.taxForm]}</Badge>
        {isRyczalt && <Badge tone="blue">Stawka {(company.ryczaltRate * 100).toLocaleString("pl-PL")}%</Badge>}
        <Badge tone="slate">Zeznanie roczne: {ANNUAL_FORM[company.taxForm]}</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Przychód w roku" value={pln(totals.revenue)} icon={<TrendingUp className="h-5 w-5" />} tone="blue" />
        {!isRyczalt ? (
          <Stat label="Koszty w roku" value={pln(totals.kup)} icon={<FileSpreadsheet className="h-5 w-5" />} tone="green" />
        ) : (
          <Stat label="ZUS odliczony" value={pln(totals.social)} icon={<FileSpreadsheet className="h-5 w-5" />} tone="green" />
        )}
        <Stat label="Podatek w roku" value={pln(totals.pit)} sub="suma zaliczek" icon={<Landmark className="h-5 w-5" />} tone="violet" />
        <Stat
          label={`Do zapłaty za ${MONTHS_PL[curIdx]}`}
          value={curIdx === 11 ? "w zeznaniu" : pln(toPayNow?.pit ?? 0)}
          sub="termin: 20. dzień następnego miesiąca"
          icon={<Coins className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      <Tip tone="info" title="Jak płacić zaliczki?">
        Zaliczkę za dany miesiąc wpłacasz do <b>20. dnia następnego miesiąca</b> na swój mikrorachunek podatkowy (wygenerujesz go na podatki.gov.pl). Zaliczki za grudzień nie
        wpłacasz osobno — rozliczasz ją w zeznaniu rocznym <b>{ANNUAL_FORM[company.taxForm]}</b> do <b>30 kwietnia</b> {year + 1} r.
      </Tip>

      <Card>
        <CardHeader title="Zaliczki w poszczególnych miesiącach" icon={<CalendarClock className="h-4 w-4" />} />
        <div className="h-64 p-4">
          <ResponsiveContainer>
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} width={60} />
              <Tooltip formatter={(v: number) => pln(v)} cursor={{ fill: "#f1f5f9" }} />
              <Bar dataKey="zaliczka" name="Zaliczka" stackId="a" fill="#7c3aed" radius={[6, 6, 0, 0]} />
              <Bar dataKey="grudzien" name="Grudzień (w zeznaniu)" stackId="a" fill="#c4b5fd" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card>
        <CardHeader title={`Wyliczenie zaliczek — ${year}`} subtitle="Kliknij ikonę „?” przy kolumnie, aby zobaczyć wyjaśnienie" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px]">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-head">Miesiąc</th>
                {cols.map((c) => (
                  <th key={c.key} className="table-head text-right">
                    <span className="inline-flex items-center gap-1">
                      {c.label} <Hint text={c.hint} />
                    </span>
                  </th>
                ))}
                <th className="table-head text-right">
                  <span className="inline-flex items-center gap-1">
                    Zaliczka <Hint text="Podatek narastająco minus zaliczki wpłacone za poprzednie miesiące. Zaokrąglona do pełnych złotych." />
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {summary.map((m, i) => (
                <tr key={m.month} className={!m.active ? "text-slate-400" : "hover:bg-slate-50"}>
                  <td className="table-cell capitalize">{MONTHS_PL[i]}</td>
                  {cols.map((c) => (
                    <td key={c.key} className="table-cell text-right">
                      {pln((m as unknown as Record<string, number>)[c.key])}
                    </td>
                  ))}
                  <td className="table-cell text-right font-semibold text-violet-700">
                    {i === 11 ? <span className="text-xs font-medium text-slate-500">rozlicz w zeznaniu ({pln(m.pit)})</span> : pln(m.pit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Tip title="Zeznanie roczne">
        {company.taxForm === "skala" && "Na skali składasz PIT-36. Możesz rozliczyć się wspólnie z małżonkiem i skorzystać z ulg (na dzieci, internetową, termomodernizacyjną, IKZE)."}
        {company.taxForm === "liniowy" && "Na podatku liniowym składasz PIT-36L. Nie ma wspólnego rozliczenia ani ulgi na dzieci, ale odliczysz IKZE i zapłaconą zdrowotną (do limitu)."}
        {isRyczalt && "Na ryczałcie składasz PIT-28. Odliczysz zapłacone składki społeczne, 50% zdrowotnej i IKZE. Koszty nie obniżają podatku."}{" "}
        Wyliczenia w aplikacji są szacunkowe — przed złożeniem zeznania zweryfikuj dane.
      </Tip>
    </div>
  );
}
